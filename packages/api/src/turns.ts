import {
  collectText,
  collectToolCalls,
  COMPONENT_NOTE_TOOL,
  COMPUTER_TOOLS,
  CREATE_BOT_TOOL,
  CREATE_ROUTINE_TOOL,
  decideScriptedTurn,
  DELEGATE_TO_BOT_TOOL,
  MCP_ECHO_TOOL,
  mentionedBotId,
  parseAguiSse,
  rootAuthority,
  runModelAsAgui,
  TURN_TOOL_NAMES,
  UPDATE_ROUTINE_TOOL,
} from '@gabot/common';

import { runGatewayAction } from './gateway.js';

import type { GabotStore, RunRecord, SessionUser } from './store/types.js';
import type { AguiRunInput, AguiToolCall, ModelPort, SandboxPort } from '@gabot/common';

export type AgentRunner = {
  run(input: AguiRunInput): Promise<AguiEventList>;
};

type AguiEventList = Awaited<ReturnType<typeof runModelAsAgui>>;

export function createScriptedAgentRunner(): AgentRunner {
  const model: ModelPort = {
    complete: ({ messages }) => Promise.resolve(decideScriptedTurn(messages)),
  };
  return {
    run: async (input) => runModelAsAgui(model, input),
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

const DEFAULT_BOT = 'general-assistant';

const TURN_TOOLS = [
  ...COMPUTER_TOOLS,
  MCP_ECHO_TOOL,
  COMPONENT_NOTE_TOOL,
  CREATE_BOT_TOOL,
  CREATE_ROUTINE_TOOL,
  UPDATE_ROUTINE_TOOL,
  DELEGATE_TO_BOT_TOOL,
].map((tool) => ({
  name: tool.name,
  description: tool.description,
  parameters: { ...tool.parameters },
}));

export async function executeTurn(input: TurnInput): Promise<TurnResult> {
  const botId = input.botId ?? mentionedBotId(input.message) ?? DEFAULT_BOT;
  await input.store.appendMessage({
    channelId: input.channelId,
    role: 'user',
    content: input.message,
  });
  const scope = await input.store.getChannelScope(input.channelId);
  if (!scope) {
    throw new Error(`Channel ${input.channelId} is not in a workspace project.`);
  }
  const run = await input.store.createRun({
    workspaceId: scope.workspaceId,
    projectId: scope.projectId,
    channelId: input.channelId,
    botId,
    ownerUserId: input.user.id,
    triggerType: 'interactive',
    status: 'running',
    objective: input.message,
    authority: rootAuthority(TURN_TOOL_NAMES),
    depth: 0,
  });
  await input.store.appendChannelEvent({
    channelId: input.channelId,
    runId: run.id,
    type: 'message.user',
    actorType: 'user',
    actorId: input.user.id,
    payload: { message: input.message },
  });
  await input.store.appendChannelEvent({
    channelId: input.channelId,
    runId: run.id,
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
  });
}

export async function executeRun(input: {
  agent: AgentRunner;
  mcpUrl: string;
  runId: string;
  sandbox: SandboxPort;
  store: GabotStore;
  user: SessionUser;
}): Promise<TurnResult> {
  const run = await input.store.getRun(input.runId);
  if (!run) {
    throw new Error(`Run ${input.runId} not found.`);
  }
  if (run.status === 'succeeded' || run.status === 'cancelled') {
    return { runId: run.id, text: '', toolNames: [] };
  }
  await input.store.updateRunStatus(run.id, 'running');
  try {
    return await completeRun(input, run);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'run failed';
    await input.store.updateRunStatus(run.id, 'failed', message);
    await input.store.appendChannelEvent({
      channelId: run.channelId,
      runId: run.id,
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
  const threadId = await input.store.mintThread(run.ownerUserId, run.channelId);
  const toolNames: string[] = [];
  let text = '';
  let current = await messagesForRun(input.store, run);
  for (let step = 0; step < 4; step += 1) {
    const events = await input.agent.run({
      threadId,
      runId: run.id,
      messages: current,
      tools: TURN_TOOLS,
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
  await input.store.appendChannelEvent({
    channelId: run.channelId,
    runId: run.id,
    type: 'run.succeeded',
    actorType: 'bot',
    actorId: run.botId,
  });
  if (run.parentRunId) {
    await input.store.appendChannelEvent({
      channelId: run.channelId,
      runId: run.id,
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
  const identity = { role: 'system' as const, content: `You are ${run.botId}.` };
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
    await input.store.appendChannelEvent({
      channelId: run.channelId,
      runId: run.id,
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
    await input.store.appendChannelEvent({
      channelId: run.channelId,
      runId: run.id,
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

function roleOf(role: string): 'user' | 'assistant' | 'tool' | 'system' {
  if (role === 'assistant' || role === 'tool' || role === 'system') {
    return role;
  }
  return 'user';
}
