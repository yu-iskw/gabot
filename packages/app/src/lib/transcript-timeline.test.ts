import { describe, expect, it } from 'vitest';

import { interleaveTranscript } from './transcript-timeline.js';

describe('interleaveTranscript', () => {
  it('places an event between two messages by createdAt', () => {
    const rows = interleaveTranscript(
      [
        { id: 'm1', createdAt: '2026-09-05T10:00:00.000Z', role: 'user' },
        { id: 'm2', createdAt: '2026-09-05T10:00:02.000Z', role: 'assistant' },
      ],
      [{ id: 'e1', createdAt: '2026-09-05T10:00:01.000Z', type: 'run.started' }],
    );
    expect(rows.map((row) => row.kind)).toEqual(['message', 'event', 'message']);
    expect(rows.map((row) => row.id)).toEqual(['message:m1', 'event:e1', 'message:m2']);
  });

  it('keeps messages before events when timestamps match', () => {
    const stamp = '2026-09-05T10:00:00.000Z';
    const rows = interleaveTranscript(
      [{ id: 'm1', createdAt: stamp }],
      [{ id: 'e1', createdAt: stamp }],
    );
    expect(rows.map((row) => row.kind)).toEqual(['message', 'event']);
  });
});
