import { describe, expect, it } from 'vitest';

import { captionForTool } from './tool-caption.js';

describe('captionForTool', () => {
  it('names a created bot without a role prefix', () => {
    const caption = captionForTool('Created bot Research (agent_1).');
    expect(caption.label).toBe('Created a bot');
    expect(captionForTool('Created bot Research (agent_1).').detail).toBe('Research');
  });

  it('names a schedule', () => {
    expect(captionForTool('Scheduled say hello on * * * * * (r1).')).toEqual({
      label: 'Scheduled',
      detail: 'say hello',
      refused: false,
      failed: false,
    });
  });

  it('extracts the opened URL', () => {
    const caption = captionForTool('Opened https://example.com');
    expect(caption.label).toBe('Opened');
    expect(caption.detail).toBe('https://example.com');
  });

  it('names a delegated hop', () => {
    expect(captionForTool('Delegated to @triage.').label).toBe('Delegated');
  });

  it('marks a grant refusal as blocked', () => {
    const caption = captionForTool('MCP tool echo on mock is not granted.');
    expect(caption.refused).toBe(true);
    expect(caption.label).toBe('Called MCP');
  });
});
