import {
  botIdentityContent,
  collectText,
  collectToolCalls,
  decideScriptedTurn,
  mentionedBotId,
  parseAguiSse,
  rootAuthority,
  runModelAsAgui,
  TURN_TOOL_NAMES,
  TURN_TOOLS,
} from '@gabot/common';

import { runGatewayAction } from './gateway.js';
import { PROTECTED_AGENT_ID } from './store/types.js';

import type { GabotStore, RunRecord, SessionUser } from './store/types.js';
import type { AguiRunInput, AguiToolCall, ModelPort, SandboxPort } from '@gabot/common';

type AgentRunInput = AguiRunInput & { botId?: string };

export type AgentRunner = {
  run(input: AgentRunInput): Promise<AguiEventList>;
};

type AguiEventList = Awaited<ReturnType<typeof runModelAsAgui>>;

export function createScriptedAgentRunner(): AgentRunner {
  return {
    run: async (input) => {
      const model: ModelPort = {
        complete: ({ messages }) => Promise.resolve(decideScriptedTurn(messages, input.botId)),
      };
      return runModelAsAgui(model, input);
    },
  };
}

export function createHttpAgentRunner(agentUrl: string): AgentRunner {
  const root = agentUrl.replace(/\/$/, '');
  return {
    async run(input) {
      const response = await fetch(`${root}/ag-ui`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(input),
      });
      if (!response.ok) {
        throw new Error(`Agent HTTP ${String(response.status)}`);
      }
      return parseAguiSse(await response.text());
    },
  };
}

type TurnInput = {
  agent: AgentRunner;
  botId?: string;
  channelId: string;
  mcpUrl: string;
  message: string;
  sandbox: SandboxPort;
  store: GabotStore;
  user: SessionUser;
};

export type TurnResult = {
  runId: string;
  text: string;
  toolNames: string[];
};

const OFFERED_TOOLS = TURN_TOOLS.map((tool) => ({
  name: tool.name,
  description: tool.description,
  parameters: { ...tool.parameters },
}));

class TurnClientError extends Error {
  public constructor(message: string) {
    super(message);
    this.name = 'TurnClientError';
  }
}

export function isTurnClientError(error: unknown): boolean {
  return error instanceof TurnClientError;
}

async function defaultParticipantBotId(store: GabotStore, channelId: string): Promise<string> {
  const bots = (await store.listChannelParticipants(channelId))
    .filter((row) => row.principalType === 'bot')
    .map((row) => row.principalId);
  if (bots.includes(PROTECTED_AGENT_ID)) {
    return PROTECTED_AGENT_ID;
  }
  const fallback = bots[0];
  if (!fallback) {
    throw new TurnClientError(`No bot is a participant on channel ${channelId}.`);
  }
  return fallback;
}

export async function executeTurn(input: TurnInput): Promise<TurnResult> {
  const botId =
    input.botId ??
    mentionedBotId(input.message) ??
    (await defaultParticipantBotId(input.store, input.channelId));
  const [scope, participating] = await Promise.all([
    input.store.getChannelScope(input.channelId),
    input.store.isChannelParticipant(input.channelId, 'bot', botId),
  ]);
  if (!scope) {
    throw new TurnClientError(`Channel ${input.channelId} is not in a workspace project.`);
  }
  if (!participating) {
    throw new TurnClientError(`Bot ${botId} is not a participant on channel ${input.channelId}.`);
  }
  if (input.user.id !== scope.ownerUserId) {
    throw new TurnClientError('Only the workspace owner may start a run on this channel.');
  }
  const run = await input.store.createRun({
    workspaceId: scope.workspaceId,
    projectId: scope.projectId,
    channelId: input.channelId,
    botId,
    ownerUserId: scope.ownerUserId,
    triggerType: 'interactive',
    status: 'queued',
    objective: input.message,
    authority: rootAuthority(TURN_TOOL_NAMES),
    depth: 0,
  });
  await input.store.appendMessage({
    channelId: input.channelId,
    role: 'user',
    content: input.message,
  });
  await recordRunEvent(input.store, {
    run,
    type: 'message.user',
    actorType: 'user',
    actorId: input.user.id,
    payload: { message: input.message },
  });
  await recordRunEvent(input.store, {
    run,
    type: 'run.started',
    actorType: 'bot',
    actorId: botId,
    payload: { trigger: 'interactive' },
  });
  return executeRun({
    store: input.store,
    sandbox: input.sandbox,
    agent: input.agent,
    mcpUrl: input.mcpUrl,
    user: input.user,
    runId: run.id,
    run,
  });
}

export async function executeRun(input: {
  agent: AgentRunner;
  mcpUrl: string;
  run?: RunRecord;
  runId: string;
  sandbox: SandboxPort;
  store: GabotStore;
  user: SessionUser;
}): Promise<TurnResult> {
  const run = input.run ?? (await input.store.getRun(input.runId));
  if (!run) {
    throw new Error(`Run ${input.runId} not found.`);
  }
  if (run.status === 'succeeded' || run.status === 'cancelled' || run.status === 'failed') {
    return { runId: run.id, text: '', toolNames: [] };
  }
  await input.store.updateRunStatus(run.id, 'running');
  try {
    return await completeRun(input, run);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'run failed';
    await input.store.updateRunStatus(run.id, 'failed', message);
    await recordRunEvent(input.store, {
      run,
      type: run.parentRunId ? 'agent.delegation.failed' : 'run.failed',
      actorType: 'bot',
      actorId: run.botId,
      payload: { error: message },
    });
    throw error;
  }
}

async function completeRun(
  input: {
    agent: AgentRunner;
    mcpUrl: string;
    sandbox: SandboxPort;
    store: GabotStore;
    user: SessionUser;
  },
  run: RunRecord,
): Promise<TurnResult> {
  const [threadId, seeded] = await Promise.all([
    input.store.mintThread(run.ownerUserId, run.channelId),
    messagesForRun(input.store, run),
  ]);
  const toolNames: string[] = [];
  let text = '';
  let current = seeded;
  for (let step = 0; step < 4; step += 1) {
    const events = await input.agent.run({
      threadId,
      runId: run.id,
      messages: current,
      tools: OFFERED_TOOLS,
      botId: run.botId,
    });
    const calls = collectToolCalls(events);
    const chunk = collectText(events);
    if (chunk) {
      text = chunk;
    }
    if (calls.length === 0) {
      break;
    }
    current = await applyToolCalls(input, run, current, calls, toolNames);
  }
  if (text) {
    await input.store.appendMessage({
      channelId: run.channelId,
      role: 'assistant',
      content: text,
      agentId: run.botId,
    });
  }
  await input.store.updateRunStatus(run.id, 'succeeded');
  await recordRunEvent(input.store, {
    run,
    type: 'run.succeeded',
    actorType: 'bot',
    actorId: run.botId,
  });
  if (run.parentRunId) {
    await recordRunEvent(input.store, {
      run,
      type: 'agent.delegation.completed',
      actorType: 'bot',
      actorId: run.botId,
      payload: { parentRunId: run.parentRunId },
    });
  }
  return { runId: run.id, text, toolNames };
}

async function messagesForRun(
  store: GabotStore,
  run: RunRecord,
): Promise<AguiRunInput['messages']> {
  const identity = { role: 'system' as const, content: botIdentityContent(run.botId) };
  if (run.parentRunId) {
    return [identity, { role: 'user', content: run.objective }];
  }
  const history = await store.listMessages(run.channelId);
  return [
    identity,
    ...history.map((row) => ({
      role: roleOf(row.role),
      content: row.content,
    })),
  ];
}

async function applyToolCalls(
  input: {
    agent: AgentRunner;
    mcpUrl: string;
    sandbox: SandboxPort;
    store: GabotStore;
    user: SessionUser;
  },
  run: RunRecord,
  messages: AguiRunInput['messages'],
  calls: AguiToolCall[],
  toolNames: string[],
): Promise<AguiRunInput['messages']> {
  let next = [...messages];
  for (const call of calls) {
    toolNames.push(call.name);
    await recordRunEvent(input.store, {
      run,
      type: 'tool.requested',
      actorType: 'bot',
      actorId: run.botId,
      payload: { tool: call.name },
    });
    const result = await runGatewayAction({
      store: input.store,
      sandbox: input.sandbox,
      mcpUrl: input.mcpUrl,
      actorId: input.user.id,
      botId: run.botId,
      toolName: call.name,
      args: call.arguments,
      channelId: run.channelId,
      run,
    });
    await recordRunEvent(input.store, {
      run,
      type: result.ok ? 'tool.completed' : 'tool.denied',
      actorType: 'bot',
      actorId: run.botId,
      payload: { tool: call.name, output: result.output },
    });
    next = [
      ...next,
      {
        role: 'assistant',
        content: '',
        toolCalls: [{ id: call.id, name: call.name, arguments: call.arguments }],
      },
      { role: 'tool', content: result.output, toolCallId: call.id, toolName: call.name },
    ];
    await input.store.appendMessage({
      channelId: run.channelId,
      role: 'tool',
      content: result.output,
      agentId: run.botId,
    });
  }
  return next;
}

function recordRunEvent(
  store: GabotStore,
  event: {
    actorId: string;
    actorType: string;
    payload?: Record<string, unknown>;
    run: Pick<RunRecord, 'channelId' | 'id'>;
    type: string;
  },
): Promise<unknown> {
  return store.appendChannelEvent({
    channelId: event.run.channelId,
    runId: event.run.id,
    type: event.type,
    actorType: event.actorType,
    actorId: event.actorId,
    payload: event.payload,
  });
}

function roleOf(role: string): 'user' | 'assistant' | 'tool' | 'system' {
  if (role === 'assistant' || role === 'tool' || role === 'system') {
    return role;
  }
  return 'user';
}
