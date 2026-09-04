import { randomUUID } from 'node:crypto';

import {
  collectText,
  collectToolCalls,
  COMPONENT_NOTE_TOOL,
  COMPUTER_TOOLS,
  CREATE_BOT_TOOL,
  CREATE_ROUTINE_TOOL,
  UPDATE_ROUTINE_TOOL,
  decideScriptedTurn,
  MCP_ECHO_TOOL,
  parseAguiSse,
  runModelAsAgui,
} from '@gabot/common';

import { runGatewayAction } from './gateway.js';

import type { GabotStore, SessionUser } from './store/types.js';
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
  store: GabotStore;
  sandbox: SandboxPort;
  agent: AgentRunner;
  mcpUrl: string;
  user: SessionUser;
  channelId: string;
  message: string;
  botId?: string;
};

type TurnResult = {
  text: string;
  toolNames: string[];
};

const DEFAULT_BOT = 'general-assistant';

export async function executeTurn(input: TurnInput): Promise<TurnResult> {
  const botId = input.botId ?? DEFAULT_BOT;
  await input.store.appendMessage({
    channelId: input.channelId,
    role: 'user',
    content: input.message,
  });
  const threadId = await input.store.mintThread(input.user.id, input.channelId);
  const history = await input.store.listMessages(input.channelId);
  const tools = [
    ...COMPUTER_TOOLS,
    MCP_ECHO_TOOL,
    COMPONENT_NOTE_TOOL,
    CREATE_BOT_TOOL,
    CREATE_ROUTINE_TOOL,
    UPDATE_ROUTINE_TOOL,
  ].map((tool) => ({
    name: tool.name,
    description: tool.description,
    parameters: { ...tool.parameters },
  }));
  const messages = history.map((row) => ({
    role: roleOf(row.role),
    content: row.content,
  }));
  const toolNames: string[] = [];
  let text = '';
  let current = messages;

  for (let step = 0; step < 4; step += 1) {
    const events = await input.agent.run({
      threadId,
      runId: randomUUID(),
      messages: current,
      tools,
    });
    const calls = collectToolCalls(events);
    const chunk = collectText(events);
    if (chunk) {
      text = chunk;
    }
    if (calls.length === 0) {
      break;
    }
    current = await applyToolCalls(input, botId, current, calls, toolNames);
  }

  if (text) {
    await input.store.appendMessage({
      channelId: input.channelId,
      role: 'assistant',
      content: text,
      agentId: botId,
    });
  }
  return { text, toolNames };
}

async function applyToolCalls(
  input: TurnInput,
  botId: string,
  messages: AguiRunInput['messages'],
  calls: AguiToolCall[],
  toolNames: string[],
): Promise<AguiRunInput['messages']> {
  let next = [...messages];
  for (const call of calls) {
    toolNames.push(call.name);
    const result = await runGatewayAction({
      store: input.store,
      sandbox: input.sandbox,
      mcpUrl: input.mcpUrl,
      actorId: input.user.id,
      botId,
      toolName: call.name,
      args: call.arguments,
      channelId: input.channelId,
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
      channelId: input.channelId,
      role: 'tool',
      content: result.output,
      agentId: botId,
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
