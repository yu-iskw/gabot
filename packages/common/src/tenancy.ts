export const PLATFORM_ORG_ID = 'org-gabot';
export const DEFAULT_CHANNEL_NAME = 'General';
export const DEFAULT_TEAM_BOT_IDS = ['general-assistant', 'monitor', 'triage', 'coder'] as const;

export function personalWorkspaceId(userId: string): string {
  return `ws-${userId}`;
}

export function personalProjectId(userId: string): string {
  return `proj-${userId}`;
}

export function personalChannelId(userId: string): string {
  return `ch-${userId}-general`;
}

export function mentionedBotId(message: string): string | undefined {
  const match = /^@([a-z][a-z0-9-]*)\b/i.exec(message.trim());
  return match?.[1]?.toLowerCase();
}
