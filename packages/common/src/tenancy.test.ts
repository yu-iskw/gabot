import { describe, expect, it } from 'vitest';

import { defaultChannelParticipants, mentionedBotId, personalChannelId } from './tenancy.js';

describe('mentionedBotId', () => {
  it('reads a leading @mention', () => {
    expect(mentionedBotId('@monitor inspect production')).toBe('monitor');
  });

  it('ignores mentions that are not at the start', () => {
    expect(mentionedBotId('please ask @monitor')).toBeUndefined();
    expect(mentionedBotId('hello')).toBeUndefined();
  });
});

describe('defaultChannelParticipants', () => {
  it('seeds the owner and default team bots', () => {
    const parties = defaultChannelParticipants('ch-1', 'user-1', 'research');
    expect(parties).toContainEqual({
      channelId: 'ch-1',
      principalType: 'user',
      principalId: 'user-1',
      role: 'owner',
    });
    expect(
      parties.some((row) => row.principalId === 'monitor' && row.principalType === 'bot'),
    ).toBe(true);
    expect(
      parties.some((row) => row.principalId === 'research' && row.principalType === 'bot'),
    ).toBe(true);
  });
});

describe('personalChannelId', () => {
  it('is unique per user rather than a shared general channel', () => {
    expect(personalChannelId('user-1')).not.toBe(personalChannelId('user-2'));
    expect(personalChannelId('user-1')).toContain('user-1');
  });
});
