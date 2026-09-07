import { describe, expect, it } from 'vitest';

import {
  defaultWorkspaceEntry,
  findWorkspaceByLocator,
  findWorkspaceEntry,
  parsePublicWorkspaceDirectory,
  parseWorkspaceDirectory,
} from './workspace-directory.js';

const gabot = {
  slug: 'gabot',
  displayName: 'Gabot',
  upstream: 'http://api:3001',
  backendId: 'backend-gabot',
  workspaceId: 'ws-gabot',
  authDomain: '127.0.0.1:9099',
  tokenAudience: 'demo-gabot',
  domain: 'gabot.localhost',
};

const gabotB = {
  slug: 'gabot-b',
  displayName: 'Gabot B',
  upstream: 'http://api-b:3001',
  backendId: 'backend-gabot-b',
  workspaceId: 'ws-gabot-b',
  authDomain: '127.0.0.1:9199',
  tokenAudience: 'demo-gabot-b',
  domain: 'gabot-b.localhost',
};

describe('workspace directory', () => {
  it('parses entries and rejects duplicate slugs', () => {
    const directory = parseWorkspaceDirectory({ workspaces: [gabot] });
    expect(defaultWorkspaceEntry(directory).slug).toBe('gabot');
    expect(findWorkspaceEntry(directory, 'missing')).toBeUndefined();
    expect(() =>
      parseWorkspaceDirectory({
        workspaces: [gabot, { ...gabotB, slug: 'gabot' }],
      }),
    ).toThrow(/duplicate/);
  });

  it('requires authDomain and tokenAudience', () => {
    expect(() =>
      parseWorkspaceDirectory({
        workspaces: [
          {
            slug: 'gabot',
            displayName: 'Gabot',
            upstream: 'http://api:3001',
            backendId: 'backend-gabot',
            workspaceId: 'ws-gabot',
          },
        ],
      }),
    ).toThrow(/authDomain/);
  });

  it('matches Slack-like locators by slug or domain', () => {
    const directory = parsePublicWorkspaceDirectory({
      workspaces: [
        { ...gabot, upstream: undefined },
        { ...gabotB, upstream: undefined },
      ],
    });
    expect(findWorkspaceByLocator(directory, 'gabot-b')?.workspaceId).toBe('ws-gabot-b');
    expect(findWorkspaceByLocator(directory, 'https://gabot.localhost/')?.slug).toBe('gabot');
    expect(findWorkspaceByLocator(directory, 'missing')).toBeUndefined();
  });

  it('rejects duplicate domains', () => {
    expect(() =>
      parseWorkspaceDirectory({
        workspaces: [gabot, { ...gabotB, domain: 'gabot.localhost' }],
      }),
    ).toThrow(/duplicate workspace domain/);
  });
});
