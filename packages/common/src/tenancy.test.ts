import { describe, expect, it } from 'vitest';

import {
  allocateBotId,
  botIdentityContent,
  defaultChannelParticipants,
  mentionedBotId,
  parseBotIdentityContent,
  personalChannelId,
  slugifyBotId,
  workspaceDefaultChannelId,
  workspaceProjectId,
  workspaceSlug,
} from './tenancy.js';

describe('mentionedBotId', () => {
  it('reads a leading @mention', () => {
    expect(mentionedBotId('@monitor inspect production')).toBe('monitor');
  });

  it('ignores mentions that are not at the start', () => {
    expect(mentionedBotId('please ask @monitor')).toBeUndefined();
    expect(mentionedBotId('hello')).toBeUndefined();
  });

  it('reads kebab custom bot mentions', () => {
    expect(mentionedBotId('@flight-researcher research flights')).toBe('flight-researcher');
  });
});

describe('slugifyBotId', () => {
  it('kebab-cases display names', () => {
    expect(slugifyBotId('Flight researcher')).toBe('flight-researcher');
    expect(slugifyBotId('  General Assistant  ')).toBe('general-assistant');
  });

  it('falls back when empty', () => {
    expect(slugifyBotId('')).toBe('bot');
    expect(slugifyBotId('!!!')).toBe('bot');
  });
});

describe('allocateBotId', () => {
  it('returns the base slug when free', () => {
    expect(allocateBotId('Flight researcher', new Set())).toBe('flight-researcher');
  });

  it('appends -2, -3 on collision', () => {
    const taken = new Set(['flight-researcher', 'flight-researcher-2']);
    expect(allocateBotId('Flight researcher', taken)).toBe('flight-researcher-3');
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

describe('workspaceDefaultChannelId', () => {
  it('derives a shared General channel from the backend workspace id', () => {
    expect(workspaceDefaultChannelId('ws-gabot')).toBe('ch-gabot-general');
    expect(workspaceProjectId('ws-gabot')).toBe('proj-gabot');
    expect(workspaceSlug('ws-pay')).toBe('pay');
  });
});

describe('parseBotIdentityContent', () => {
  it('reads the bot id from the identity sentence', () => {
    expect(parseBotIdentityContent(botIdentityContent('monitor'))).toBe('monitor');
    expect(parseBotIdentityContent(botIdentityContent('general-assistant'))).toBe(
      'general-assistant',
    );
  });

  it('reads custom teammates and role from roster', () => {
    const content = botIdentityContent('flight-researcher', [
      {
        id: 'flight-researcher',
        title: 'Flight researcher',
        roleDescription: 'Researches flights.',
      },
      { id: 'monitor', title: 'Monitor' },
    ]);
    expect(parseBotIdentityContent(content)).toBe('flight-researcher');
    expect(content).toContain('@flight-researcher (Flight researcher)');
    expect(content).toContain('@monitor (Monitor)');
    expect(content).toContain('Role: Researches flights.');
  });

  it('ignores other system text', () => {
    expect(parseBotIdentityContent(botIdentityContent(''))).toBeUndefined();
    expect(parseBotIdentityContent('hello')).toBeUndefined();
  });
});
