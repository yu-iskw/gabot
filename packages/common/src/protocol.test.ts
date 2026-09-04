import { describe, expect, it, vi } from 'vitest';

import { createMastraAgentCard, isA2AAgentCard } from './a2a-card.js';
import { collectText, collectToolCalls, encodeAguiSse, parseAguiSse } from './ag-ui.js';
import { isMainModule } from './is-main.js';
import { asRecord, asString, asStringArray } from './json-value.js';
import { createOpenAiCompatibleModel, toOpenAiMessages } from './openai-model.js';
import { runModelAsAgui } from './run-model-agui.js';
import { decideScriptedTurn } from './scripted-turn.js';
import { matchesToken, offeredBearer } from './token.js';
import {
  COMPUTER_NAVIGATE,
  CREATE_BOT,
  CREATE_ROUTINE,
  DELEGATE_TO_BOT,
  MCP_ECHO,
  UPDATE_ROUTINE,
} from './tool-catalog.js';

import type { AguiEvent } from './ag-ui.js';
import type { ModelPort } from './ports.js';

describe('AG-UI SSE', () => {
  it('round-trips events and collects tool calls', () => {
    const events: AguiEvent[] = [
      { type: 'RUN_STARTED', threadId: 't', runId: 'r' },
      {
        type: 'TOOL_CALL_START',
        toolCallId: 'c1',
        toolCallName: COMPUTER_NAVIGATE,
        parentMessageId: 'm',
      },
      { type: 'TOOL_CALL_ARGS', toolCallId: 'c1', delta: '{"url":"https://example.com"}' },
      { type: 'TOOL_CALL_END', toolCallId: 'c1' },
      { type: 'TEXT_MESSAGE_CONTENT', messageId: 'm', delta: 'hi' },
      { type: 'RUN_FINISHED', threadId: 't', runId: 'r' },
    ];
    const payload = events.map((event) => encodeAguiSse(event)).join('');
    const parsed = parseAguiSse(payload);
    expect(collectText(parsed)).toBe('hi');
    expect(collectToolCalls(parsed)).toEqual([
      { id: 'c1', name: COMPUTER_NAVIGATE, arguments: { url: 'https://example.com' } },
    ]);
  });

  it('ignores malformed argument JSON', () => {
    const events: AguiEvent[] = [
      { type: 'TOOL_CALL_START', toolCallId: 'c1', toolCallName: 'x', parentMessageId: 'm' },
      { type: 'TOOL_CALL_ARGS', toolCallId: 'c1', delta: 'not-json' },
      { type: 'TOOL_CALL_END', toolCallId: 'c1' },
    ];
    expect(collectToolCalls(events)[0]?.arguments).toEqual({});
  });
});

describe('decideScriptedTurn', () => {
  it('maps navigate and example.com to a computer tool call', () => {
    const turn = decideScriptedTurn([{ role: 'user', content: 'please navigate to example.com' }]);
    expect(turn.toolCalls[0]?.name).toBe(COMPUTER_NAVIGATE);
  });

  it('maps echo to the mock MCP tool', () => {
    const turn = decideScriptedTurn([{ role: 'user', content: 'call mcp echo' }]);
    expect(turn.toolCalls[0]?.name).toBe(MCP_ECHO);
  });

  it('summarizes a tool result', () => {
    const turn = decideScriptedTurn([
      { role: 'user', content: 'go' },
      { role: 'tool', content: 'ok', toolName: COMPUTER_NAVIGATE, toolCallId: 'c1' },
    ]);
    expect(turn.text).toContain('example.com');
    expect(turn.toolCalls).toHaveLength(0);
  });

  it('maps a note prompt to the granted component', () => {
    const turn = decideScriptedTurn([{ role: 'user', content: 'show a note' }]);
    expect(turn.toolCalls[0]?.name).toBe('component_note');
  });

  it('maps a create-bot prompt to the create_bot tool', () => {
    const turn = decideScriptedTurn([
      { role: 'user', content: 'please create a bot named Research' },
    ]);
    expect(turn.toolCalls[0]?.name).toBe(CREATE_BOT);
    expect(turn.toolCalls[0]?.arguments.name).toBe('Research');
  });

  it('maps a schedule prompt to create_routine', () => {
    const turn = decideScriptedTurn([
      { role: 'user', content: 'schedule a task every minute to say hello' },
    ]);
    expect(turn.toolCalls[0]?.name).toBe(CREATE_ROUTINE);
  });

  it('maps an update-routine prompt to update_routine', () => {
    const turn = decideScriptedTurn([
      { role: 'user', content: 'change the say hello routine to say hi' },
    ]);
    expect(turn.toolCalls[0]?.name).toBe(UPDATE_ROUTINE);
    expect(turn.toolCalls[0]?.arguments.id).toBe('say hello');
    expect(turn.toolCalls[0]?.arguments.instruction).toBe('say hi');
  });

  it('returns greeting text otherwise', () => {
    expect(decideScriptedTurn([{ role: 'user', content: 'hello' }]).text).toContain('gabot');
  });

  it('passes through a policy refusal tool result', () => {
    const turn = decideScriptedTurn([
      { role: 'tool', content: 'refused by policy', toolName: COMPUTER_NAVIGATE, toolCallId: 'c1' },
    ]);
    expect(turn.text).toContain('refused');
  });

  it('starts a new tool call after a previous tool result in history', () => {
    const turn = decideScriptedTurn([
      { role: 'user', content: 'please navigate to example.com' },
      { role: 'tool', content: 'Opened https://example.com.', toolName: COMPUTER_NAVIGATE },
      { role: 'assistant', content: 'Opened https://example.com.' },
      { role: 'user', content: 'please echo hello via mcp' },
    ]);
    expect(turn.toolCalls[0]?.name).toBe(MCP_ECHO);
  });

  it('delegates monitor production work to triage', () => {
    const turn = decideScriptedTurn([
      { role: 'system', content: 'You are monitor.' },
      { role: 'user', content: 'inspect production errors from the last 24 hours' },
    ]);
    expect(turn.toolCalls[0]?.name).toBe(DELEGATE_TO_BOT);
    expect(turn.toolCalls[0]?.arguments.botId).toBe('triage');
  });

  it('has triage delegate to coder and coder reply in text', () => {
    const triage = decideScriptedTurn([
      { role: 'system', content: 'You are triage.' },
      { role: 'user', content: 'Triage production errors from the last 24 hours.' },
    ]);
    expect(triage.toolCalls[0]?.arguments.botId).toBe('coder');
    const coder = decideScriptedTurn([
      { role: 'system', content: 'You are coder.' },
      { role: 'user', content: 'Implement a fix for the triaged production issues.' },
    ]);
    expect(coder.text.toLowerCase()).toContain('coding');
  });
});

describe('createOpenAiCompatibleModel', () => {
  it('posts chat completions and reads tool calls', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: () =>
        Promise.resolve({
          choices: [
            {
              message: {
                content: '',
                tool_calls: [
                  {
                    id: 'c1',
                    function: {
                      name: COMPUTER_NAVIGATE,
                      arguments: '{"url":"https://example.com"}',
                    },
                  },
                ],
              },
            },
          ],
        }),
    });
    vi.stubGlobal('fetch', fetchMock);
    const model = createOpenAiCompatibleModel('http://model/v1');
    const turn = await model.complete({ messages: [{ role: 'user', content: 'go' }], tools: [] });
    expect(turn.toolCalls[0]?.name).toBe(COMPUTER_NAVIGATE);
    expect(
      toOpenAiMessages([{ role: 'tool', content: 'x', toolCallId: 'c1', toolName: 't' }])[0],
    ).toMatchObject({
      role: 'tool',
      tool_call_id: 'c1',
    });
    vi.unstubAllGlobals();
  });

  it('throws on a non-OK model response', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status: 503 }));
    const model = createOpenAiCompatibleModel('http://model/v1/');
    await expect(model.complete({ messages: [], tools: [] })).rejects.toThrow('503');
    vi.unstubAllGlobals();
  });
});

describe('runModelAsAgui', () => {
  it('emits text events from a model turn', async () => {
    const model: ModelPort = {
      complete: () => Promise.resolve({ text: 'Hello from gabot.', toolCalls: [] }),
    };
    const events = await runModelAsAgui(model, {
      threadId: 't',
      runId: 'r',
      messages: [{ role: 'user', content: 'hi' }],
      tools: [],
    });
    expect(collectText(events)).toBe('Hello from gabot.');
    expect(events.at(-1)?.type).toBe('RUN_FINISHED');
  });

  it('emits tool call events', async () => {
    const model: ModelPort = {
      complete: () =>
        Promise.resolve({
          text: '',
          toolCalls: [
            { id: 'c1', name: COMPUTER_NAVIGATE, arguments: { url: 'https://example.com' } },
          ],
        }),
    };
    const events = await runModelAsAgui(model, {
      threadId: 't',
      runId: 'r',
      messages: [{ role: 'user', content: 'go' }],
      tools: [],
    });
    expect(collectToolCalls(events)[0]?.name).toBe(COMPUTER_NAVIGATE);
  });
});

describe('token helpers', () => {
  it('compares secrets in constant time', () => {
    expect(matchesToken('abcd', 'abcd')).toBe(true);
    expect(matchesToken('abcd', 'abce')).toBe(false);
    expect(matchesToken('', '')).toBe(false);
    expect(offeredBearer('Bearer secret')).toBe('secret');
  });
});

describe('A2A card', () => {
  it('is a valid discovery document', () => {
    const card = createMastraAgentCard('http://agent:4200');
    expect(isA2AAgentCard(card)).toBe(true);
    expect(card.capabilities.streaming).toBe(true);
    expect(isA2AAgentCard(null)).toBe(false);
  });
});

describe('isMainModule', () => {
  it('matches the resolved argv path to import.meta.url', () => {
    expect(isMainModule('file:///tmp/app.js', '/tmp/app.js')).toBe(true);
    expect(isMainModule('file:///tmp/app.js', '/tmp/other.js')).toBe(false);
    expect(isMainModule('file:///tmp/app.js', '')).toBe(false);
  });
});

describe('json helpers', () => {
  it('coerces unknown values', () => {
    expect(asRecord({ a: 1 }).a).toBe(1);
    expect(asRecord(null)).toEqual({});
    expect(asString(1, 'x')).toBe('x');
    expect(asStringArray(['a', 1])).toEqual(['a']);
  });
});
