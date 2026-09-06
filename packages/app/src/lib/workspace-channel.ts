export function workspaceDefaultChannelId(workspaceId: string): string {
  const slug = workspaceId.startsWith('ws-') ? workspaceId.slice(3) : workspaceId;
  return `ch-${slug}-general`;
}
