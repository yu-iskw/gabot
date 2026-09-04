export type AguiRole = 'assistant';

export type AguiEvent =
  | { type: 'RUN_STARTED'; threadId: string; runId: string }
  | { type: 'RUN_FINISHED'; threadId: string; runId: string }
  | { type: 'RUN_ERROR'; message: string }
  | { type: 'TEXT_MESSAGE_START'; messageId: string; role: AguiRole }
  | { type: 'TEXT_MESSAGE_CONTENT'; messageId: string; delta: string }
  | { type: 'TEXT_MESSAGE_END'; messageId: string }
  | { type: 'TOOL_CALL_START'; toolCallId: string; toolCallName: string; parentMessageId: string }
  | { type: 'TOOL_CALL_ARGS'; toolCallId: string; delta: string }
  | { type: 'TOOL_CALL_END'; toolCallId: string };

export type AguiToolCall = {
  id: string;
  name: string;
  arguments: Record<string, unknown>;
};

export type AguiRunInput = {
  threadId: string;
  runId: string;
  messages: Array<{
    role: 'user' | 'assistant' | 'tool' | 'system';
    content: string;
    toolCallId?: string;
    toolName?: string;
    toolCalls?: Array<{ id: string; name: string; arguments: Record<string, unknown> }>;
  }>;
  tools: Array<{ name: string; description: string; parameters: Record<string, unknown> }>;
};

export function encodeAguiSse(event: AguiEvent): string {
  return `data: ${JSON.stringify(event)}\n\n`;
}

export function aguiEventsToSse(events: AguiEvent[]): string {
  return events.map((event) => encodeAguiSse(event)).join('');
}

export function parseAguiSse(payload: string): AguiEvent[] {
  const events: AguiEvent[] = [];
  for (const block of payload.split('\n\n')) {
    const line = block.split('\n').find((entry) => entry.startsWith('data: '));
    if (!line) {
      continue;
    }
    const parsed: unknown = JSON.parse(line.slice(6));
    if (isAguiEvent(parsed)) {
      events.push(parsed);
    }
  }
  return events;
}

export function collectText(events: AguiEvent[]): string {
  return events
    .filter((event): event is Extract<AguiEvent, { type: 'TEXT_MESSAGE_CONTENT' }> => {
      return event.type === 'TEXT_MESSAGE_CONTENT';
    })
    .map((event) => event.delta)
    .join('');
}

export function collectToolCalls(events: AguiEvent[]): AguiToolCall[] {
  const names = new Map<string, string>();
  const args = new Map<string, string>();
  const order: string[] = [];
  for (const event of events) {
    recordToolEvent(event, names, args, order);
  }
  return order.map((id) => ({
    id,
    name: names.get(id) ?? '',
    arguments: parseArgs(args.get(id) ?? '{}'),
  }));
}

function recordToolEvent(
  event: AguiEvent,
  names: Map<string, string>,
  args: Map<string, string>,
  order: string[],
): void {
  switch (event.type) {
    case 'TOOL_CALL_START': {
      names.set(event.toolCallId, event.toolCallName);
      if (!order.includes(event.toolCallId)) {
        order.push(event.toolCallId);
      }
      break;
    }
    case 'TOOL_CALL_ARGS': {
      args.set(event.toolCallId, `${args.get(event.toolCallId) ?? ''}${event.delta}`);
      break;
    }
    case 'TOOL_CALL_END':
    case 'RUN_STARTED':
    case 'RUN_FINISHED':
    case 'RUN_ERROR':
    case 'TEXT_MESSAGE_START':
    case 'TEXT_MESSAGE_CONTENT':
    case 'TEXT_MESSAGE_END': {
      break;
    }
    default: {
      const exhaustive: never = event;
      return exhaustive;
    }
  }
}

function parseArgs(raw: string): Record<string, unknown> {
  try {
    const parsed: unknown = JSON.parse(raw || '{}');
    if (typeof parsed === 'object' && parsed !== null && !Array.isArray(parsed)) {
      return parsed as Record<string, unknown>;
    }
    return {};
  } catch {
    return {};
  }
}

function isAguiEvent(value: unknown): value is AguiEvent {
  return (
    typeof value === 'object' && value !== null && 'type' in value && typeof value.type === 'string'
  );
}
