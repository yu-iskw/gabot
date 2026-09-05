import { describe, expect, it } from 'vitest';

import { resolveProjectId } from './resolve-project-id.js';

describe('resolveProjectId', () => {
  it('keeps the selected project when the new name is blank', async () => {
    const created: string[] = [];
    const projectId = await resolveProjectId('proj-1', '  ', async (name) => {
      created.push(name);
      return 'proj-new';
    });
    expect(projectId).toBe('proj-1');
    expect(created).toEqual([]);
  });

  it('creates a named project instead of the selected one', async () => {
    const created: string[] = [];
    const projectId = await resolveProjectId('proj-1', ' Ops ', async (name) => {
      created.push(name);
      return 'proj-ops';
    });
    expect(projectId).toBe('proj-ops');
    expect(created).toEqual(['Ops']);
  });
});
