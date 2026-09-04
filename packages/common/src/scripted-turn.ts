import {
  COMPONENT_NOTE,
  COMPUTER_NAVIGATE,
  CREATE_BOT,
  CREATE_ROUTINE,
  MCP_ECHO,
  UPDATE_ROUTINE,
} from './tool-catalog.js';

import type { ChatMessage, ModelToolCall, ModelTurn } from './ports.js';

const NAVIGATE_EXAMPLE = 'https://example.com';
const CREATE_BOT_RE = /create (?:a |an )?(?:bot|agent|coworker)/i;
const SCHEDULE_RE = /\bschedule\b|\broutine\b|every (?:day|hour|minute)/i;
const MCP_RE = /mcp|echo/i;
const NAVIGATE_RE = /example\.com|navigate/i;
const NOTE_RE = /note/i;
const NAMED_RE = /named\s+([^,.]+)/i;
const TASK_RE = /(?:to|that)\s+(.+)$/i;
const TO_INSTRUCTION_RE = /\bto\s+(.+)$/i;

export function decideScriptedTurn(messages: ChatMessage[]): ModelTurn {
  const last = messages.at(-1);
  if (last?.role === 'tool') {
    return { text: summarizeTool(last), toolCalls: [] };
  }
  return matchUserTurn(findLast(messages, 'user')?.content ?? '');
}

function matchUserTurn(content: string): ModelTurn {
  if (CREATE_BOT_RE.test(content)) {
    const name = namedBot(content);
    return call(CREATE_BOT, 'call_bot', {
      name,
      title: name,
      roleDescription: 'Created by a bot in conversation.',
    });
  }
  if (wantsUpdateRoutine(content)) {
    const target = routineTarget(content);
    const instruction = content.match(TO_INSTRUCTION_RE)?.[1]?.trim();
    const args: Record<string, string> = { id: target };
    if (instruction) {
      args.instruction = instruction;
    }
    return call(UPDATE_ROUTINE, 'call_update_routine', args);
  }
  if (SCHEDULE_RE.test(content)) {
    const everyMinute = /minute/i.test(content);
    return call(CREATE_ROUTINE, 'call_routine', {
      instruction: scheduledInstruction(content),
      cron: everyMinute ? '* * * * *' : '0 * * * *',
      timezone: 'UTC',
    });
  }
  if (MCP_RE.test(content)) {
    return call(MCP_ECHO, 'call_mcp', { text: 'hello' });
  }
  if (NAVIGATE_RE.test(content)) {
    return call(COMPUTER_NAVIGATE, 'call_nav', { url: NAVIGATE_EXAMPLE });
  }
  if (NOTE_RE.test(content)) {
    return call(COMPONENT_NOTE, 'call_note', {
      title: 'Granted note',
      body: 'Component grant path.',
    });
  }
  return { text: 'Hello from gabot.', toolCalls: [] };
}

function call(name: string, id: string, args: Record<string, string>): ModelTurn {
  const toolCalls: ModelToolCall[] = [{ id, name, arguments: args }];
  return { text: '', toolCalls };
}

function namedBot(content: string): string {
  const match = content.match(NAMED_RE);
  const name = match?.[1]?.trim();
  return name && name.length > 0 ? name : 'New coworker';
}

function scheduledInstruction(content: string): string {
  const match = content.match(TASK_RE);
  const instruction = match?.[1]?.trim();
  return instruction && instruction.length > 0 ? instruction : content;
}

function routineTarget(content: string): string {
  const lower = content.toLowerCase();
  const verbs = ['update ', 'change ', 'edit '] as const;
  let start = -1;
  for (const verb of verbs) {
    const at = lower.indexOf(verb);
    if (at >= 0 && (start < 0 || at < start)) {
      start = at + verb.length;
    }
  }
  if (start < 0) {
    return 'say hello';
  }
  let after = content.slice(start).trimStart();
  if (after.toLowerCase().startsWith('the ')) {
    after = after.slice(4);
  }
  const routineAt = after.toLowerCase().indexOf(' routine');
  if (routineAt <= 0) {
    return 'say hello';
  }
  const target = after.slice(0, routineAt).trim();
  return target.length > 0 ? target : 'say hello';
}

function wantsUpdateRoutine(content: string): boolean {
  const lower = content.toLowerCase();
  const hasVerb = lower.includes('update') || lower.includes('change') || lower.includes('edit');
  const hasNoun = lower.includes('routine') || lower.includes('schedule');
  return hasVerb && hasNoun;
}

function findLast(messages: ChatMessage[], role: ChatMessage['role']): ChatMessage | undefined {
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    const message = messages.at(index);
    if (message?.role === role) {
      return message;
    }
  }
  return undefined;
}

function summarizeTool(message: ChatMessage): string {
  const lower = message.content.toLowerCase();
  if (lower.includes('refus') || lower.includes('policy')) {
    return message.content;
  }
  if (message.toolName === MCP_ECHO) {
    return `MCP echo: ${message.content}`;
  }
  if (message.toolName === COMPUTER_NAVIGATE) {
    return `Opened ${NAVIGATE_EXAMPLE}.`;
  }
  if (message.toolName === COMPONENT_NOTE) {
    return 'Rendered the granted note component.';
  }
  if (
    message.toolName === CREATE_BOT ||
    message.toolName === CREATE_ROUTINE ||
    message.toolName === UPDATE_ROUTINE
  ) {
    return message.content || 'Done.';
  }
  return message.content || 'Done.';
}
