import { describe, expect, it } from 'vitest';

import { buildDelegateToBotTool, DELEGATE_TO_BOT, DELEGATE_TO_BOT_TOOL } from './tool-catalog.js';

describe('buildDelegateToBotTool', () => {
  it('embeds enum and lists ids when roster is non-empty', () => {
    const tool = buildDelegateToBotTool(['monitor', 'flight-researcher']);
    expect(tool.name).toBe(DELEGATE_TO_BOT);
    expect(tool.parameters.properties.botId.enum).toEqual(['monitor', 'flight-researcher']);
    expect(tool.description).toContain('monitor, flight-researcher');
    expect(tool.description).toContain('Never invent bot ids');
  });

  it('dedupes ids', () => {
    const tool = buildDelegateToBotTool(['coder', 'coder', 'triage']);
    expect(tool.parameters.properties.botId.enum).toEqual(['coder', 'triage']);
  });

  it('has no enum and empty-roster copy when roster is empty', () => {
    const tool = buildDelegateToBotTool([]);
    expect(tool.parameters.properties.botId.enum).toBeUndefined();
    expect(tool.description).toContain('no bot participants');
  });

  it('static fallback has no closed team allowlist', () => {
    expect(DELEGATE_TO_BOT_TOOL.description).not.toMatch(/monitor, triage, coder/);
    expect(DELEGATE_TO_BOT_TOOL.parameters.properties.botId.enum).toBeUndefined();
  });
});
