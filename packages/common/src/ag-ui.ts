import { EventType } from '@ag-ui/core';
import { EventEncoder } from '@ag-ui/encoder';

import type { BaseEvent, Message, RunAgentInput, Tool } from '@ag-ui/core';

export type AguiEvent = BaseEvent;

export type AguiToolCall = {
  id: string;
  name: string;
  arguments: Record<string, unknown>;
};

/** Gabot control-plane run input; convert with `toRunAgentInput` at AG-UI boundaries. */
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

const encoder = new EventEncoder();

export function encodeAguiSse(event: AguiEvent): string {
  return encoder.encodeSSE(event);
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
    .filter(isTextDeltaEvent)
    .map((event) => event.delta)
    .join('');
}

export function collectToolCalls(events: AguiEvent[]): AguiToolCall[] {
  const names = new Map<string, string>();
  const args = new Map<string, string>();
  const order: string[] = [];
  for (const event of events) {
    if (
      event.type === EventType.TOOL_CALL_START &&
      'toolCallId' in event &&
      'toolCallName' in event
    ) {
      const id = String(event.toolCallId);
      names.set(id, String(event.toolCallName));
      if (!order.includes(id)) {
        order.push(id);
      }
      continue;
    }
    if (event.type === EventType.TOOL_CALL_ARGS && 'toolCallId' in event && 'delta' in event) {
      const id = String(event.toolCallId);
      args.set(id, `${args.get(id) ?? ''}${String(event.delta)}`);
    }
  }
  return order.map((id) => ({
    id,
    name: names.get(id) ?? '',
    arguments: parseArgs(args.get(id) ?? '{}'),
  }));
}

/** Map gabot turn input onto official `RunAgentInput` (message ids, empty state/context). */
export function toRunAgentInput(input: AguiRunInput): RunAgentInput {
  const tools: Tool[] = input.tools.map((tool) => ({
    name: tool.name,
    description: tool.description,
    parameters: tool.parameters,
  }));
  const messages: Message[] = input.messages.map((message, index) => {
    const id = `msg_${input.runId}_${String(index)}`;
    if (message.role === 'system') {
      return { id, role: 'system', content: message.content };
    }
    if (message.role === 'assistant') {
      return {
        id,
        role: 'assistant',
        content: message.content,
        toolCalls: message.toolCalls?.map((call) => ({
          id: call.id,
          type: 'function' as const,
          function: {
            name: call.name,
            arguments: JSON.stringify(call.arguments),
          },
        })),
      };
    }
    if (message.role === 'tool') {
      return {
        id,
        role: 'tool',
        content: message.content,
        toolCallId: message.toolCallId ?? `tool_${String(index)}`,
      };
    }
    return { id, role: 'user', content: message.content };
  });
  return {
    threadId: input.threadId,
    runId: input.runId,
    state: {},
    messages,
    tools,
    context: [],
    forwardedProps: {},
  };
}

/**
 * Collect AG-UI events from an Observable-like stream (`@ag-ui/client` / `@ag-ui/mastra`).
 * Transitional: callers may still buffer to SSE at HTTP boundaries.
 */
export function collectAguiObservable(source: AguiObservableLike<AguiEvent>): Promise<AguiEvent[]> {
  return new Promise((resolve, reject) => {
    const events: AguiEvent[] = [];
    source.subscribe({
      next: (event) => {
        events.push(event);
      },
      error: (error: unknown) => {
        reject(error instanceof Error ? error : new Error(String(error)));
      },
      complete: () => {
        resolve(events);
      },
    });
  });
}

type AguiObservableLike<T> = {
  subscribe(observer: {
    complete: () => void;
    error: (error: unknown) => void;
    next: (value: T) => void;
  }): unknown;
};

function isTextDeltaEvent(event: AguiEvent): event is AguiEvent & { delta: string; type: string } {
  return (
    (event.type === EventType.TEXT_MESSAGE_CONTENT ||
      event.type === EventType.TEXT_MESSAGE_CHUNK) &&
    'delta' in event &&
    typeof event.delta === 'string'
  );
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
