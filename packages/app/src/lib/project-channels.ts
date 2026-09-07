export type NamedProject = {
  id: string;
  name: string;
};

export type ProjectChannelGroup<T extends { projectId: string }> = {
  channels: T[];
  project: NamedProject;
};

export function groupChannelsByProject<T extends { projectId: string }>(
  channels: T[],
  projects: NamedProject[],
): Array<ProjectChannelGroup<T>> {
  const groups = new Map<string, ProjectChannelGroup<T>>();
  for (const project of projects) {
    groups.set(project.id, { project, channels: [] });
  }
  for (const channel of channels) {
    const existing = groups.get(channel.projectId);
    if (existing) {
      existing.channels.push(channel);
      continue;
    }
    groups.set(channel.projectId, {
      project: { id: channel.projectId, name: 'Project' },
      channels: [channel],
    });
  }
  return [...groups.values()].filter((group) => group.channels.length > 0);
}
