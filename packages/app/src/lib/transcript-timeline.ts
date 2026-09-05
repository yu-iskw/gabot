export type TimedItem = {
  createdAt?: Date | string;
  id: string;
};

export type TranscriptItem<TMessage extends TimedItem, TEvent extends TimedItem> =
  | { createdAt: number; event: TEvent; id: string; kind: 'event' }
  | { createdAt: number; id: string; kind: 'message'; message: TMessage };

export function interleaveTranscript<TMessage extends TimedItem, TEvent extends TimedItem>(
  messages: TMessage[],
  events: TEvent[],
): Array<TranscriptItem<TMessage, TEvent>> {
  const rows: Array<TranscriptItem<TMessage, TEvent>> = [
    ...messages.map((message) => ({
      kind: 'message' as const,
      id: `message:${message.id}`,
      createdAt: timeMs(message.createdAt),
      message,
    })),
    ...events.map((event) => ({
      kind: 'event' as const,
      id: `event:${event.id}`,
      createdAt: timeMs(event.createdAt),
      event,
    })),
  ];
  return rows.sort((left, right) => {
    const delta = left.createdAt - right.createdAt;
    if (delta !== 0) {
      return delta;
    }
    if (left.kind !== right.kind) {
      return left.kind === 'message' ? -1 : 1;
    }
    return left.id.localeCompare(right.id);
  });
}

function timeMs(value: Date | string | undefined): number {
  if (value instanceof Date) {
    return value.getTime();
  }
  if (typeof value === 'string') {
    const parsed = Date.parse(value);
    return Number.isNaN(parsed) ? 0 : parsed;
  }
  return 0;
}
