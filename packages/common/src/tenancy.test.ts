import { describe, expect, it } from 'vitest';

import { mentionedBotId, personalChannelId } from './tenancy.js';

describe('mentionedBotId', () => {
  it('reads a leading @mention', () => {
    expect(mentionedBotId('@monitor inspect production')).toBe('monitor');
  });

  it('ignores mentions that are not at the start', () => {
    expect(mentionedBotId('please ask @monitor')).toBeUndefined();
    expect(mentionedBotId('hello')).toBeUndefined();
  });
});

describe('personalChannelId', () => {
  it('is unique per user rather than a shared general channel', () => {
    expect(personalChannelId('user-1')).not.toBe(personalChannelId('user-2'));
    expect(personalChannelId('user-1')).toContain('user-1');
  });
});
