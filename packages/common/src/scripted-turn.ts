import { parseBotIdentityContent } from './tenancy.js';
import {
  COMPONENT_NOTE,
  COMPUTER_NAVIGATE,
  CREATE_BOT,
  CREATE_ROUTINE,
  DELEGATE_TO_BOT,
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

export function decideScriptedTurn(messages: ChatMessage[], botId?: string): ModelTurn {
  const last = messages.at(-1);
  if (last?.role === 'tool') {
    return { text: summarizeTool(last), toolCalls: [] };
  }
  return matchUserTurn(findLast(messages, 'user')?.content ?? '', botId ?? identityBotId(messages));
}

function identityBotId(messages: ChatMessage[]): string | undefined {
  for (const message of messages) {
    if (message.role !== 'system') {
      continue;
    }
    const id = parseBotIdentityContent(message.content);
    if (id) {
      return id;
    }
  }
  return undefined;
}

function matchUserTurn(content: string, botId?: string): ModelTurn {
  const team = teamScript(content, botId);
  if (team) {
    return team;
  }
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
    const instruction = captureAfterMarker(content, ['to']);
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

function teamScript(content: string, botId?: string): ModelTurn | undefined {
  if (botId === 'monitor' && wantsProductionChain(content)) {
    return call(DELEGATE_TO_BOT, 'call_delegate', {
      botId: 'triage',
      objective: 'Triage production errors from the last 24 hours.',
      requestedCapabilities: [DELEGATE_TO_BOT, CREATE_BOT, COMPONENT_NOTE],
    });
  }
  if (botId === 'triage') {
    return call(DELEGATE_TO_BOT, 'call_delegate', {
      botId: 'coder',
      objective: 'Implement a fix for the triaged production issues.',
      requestedCapabilities: [COMPONENT_NOTE],
    });
  }
  if (botId === 'coder') {
    return { text: 'Started coding-agent task for the triaged issues.', toolCalls: [] };
  }
  return undefined;
}

function call(name: string, id: string, args: Record<string, unknown>): ModelTurn {
  const toolCalls: ModelToolCall[] = [{ id, name, arguments: args }];
  return { text: '', toolCalls };
}

function wantsProductionChain(content: string): boolean {
  const lower = content.toLowerCase();
  return lower.includes('inspect production') || lower.includes('production errors');
}

function namedBot(content: string): string {
  const match = content.match(NAMED_RE);
  const name = match?.[1]?.trim();
  return name && name.length > 0 ? name : 'New coworker';
}

function scheduledInstruction(content: string): string {
  return captureAfterMarker(content, ['to', 'that']) ?? content;
}

/** Last whole-word marker followed by whitespace, then the remainder (no regex backtracking). */
function captureAfterMarker(content: string, markers: string[]): string | undefined {
  let bestStart = -1;
  for (const marker of markers) {
    bestStart = Math.max(bestStart, lastPayloadStart(content, marker));
  }
  if (bestStart < 0) {
    return undefined;
  }
  const captured = content.slice(bestStart).trimEnd();
  return captured.length > 0 ? captured : undefined;
}

function lastPayloadStart(content: string, marker: string): number {
  const lower = content.toLowerCase();
  let best = -1;
  let from = 0;
  while (from < lower.length) {
    const at = lower.indexOf(marker, from);
    if (at < 0) {
      break;
    }
    from = at + 1;
    best = Math.max(best, payloadStartAt(content, lower, at, marker.length));
  }
  return best;
}

function payloadStartAt(content: string, lower: string, at: number, markerLength: number): number {
  const afterIndex = at + markerLength;
  if (!isWordBoundary(lower, at, afterIndex)) {
    return -1;
  }
  if (afterIndex >= content.length || !isSpace(content.charAt(afterIndex))) {
    return -1;
  }
  let start = afterIndex;
  while (start < content.length && isSpace(content.charAt(start))) {
    start += 1;
  }
  return start < content.length ? start : -1;
}

function isWordBoundary(lower: string, start: number, end: number): boolean {
  const beforeOk = start === 0 || !isWordChar(lower.charAt(start - 1));
  const afterOk = end >= lower.length || !isWordChar(lower.charAt(end));
  return beforeOk && afterOk;
}

function isWordChar(char: string): boolean {
  const code = char.codePointAt(0) ?? 0;
  return (
    (code >= 48 && code <= 57) ||
    (code >= 65 && code <= 90) ||
    (code >= 97 && code <= 122) ||
    code === 95
  );
}

function isSpace(char: string): boolean {
  return char === ' ' || char === '\t' || char === '\n' || char === '\r' || char === '\f';
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
  return message.content || 'Done.';
}
