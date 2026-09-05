import { describe, expect, it } from 'vitest';

import { groupChannelsByProject } from './project-channels.js';

describe('groupChannelsByProject', () => {
  it('keeps project order and drops empty projects', () => {
    const groups = groupChannelsByProject(
      [
        { id: 'c1', projectId: 'p2', name: 'Incidents' },
        { id: 'c2', projectId: 'p1', name: 'General' },
      ],
      [
        { id: 'p1', name: 'Default' },
        { id: 'p2', name: 'Ops' },
        { id: 'p3', name: 'Empty' },
      ],
    );
    expect(groups.map((group) => group.project.name)).toEqual(['Default', 'Ops']);
    expect(groups[0]?.channels.map((row) => row.name)).toEqual(['General']);
    expect(groups[1]?.channels.map((row) => row.name)).toEqual(['Incidents']);
  });
});
