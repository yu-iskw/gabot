import { describe, expect, it } from 'vitest';

import { personalChannelId } from './personal-channel.js';

describe('personalChannelId', () => {
  it('matches the API default General channel id', () => {
    expect(personalChannelId('user-1')).toBe('ch-user-1-general');
  });
});
