export const PLATFORM_ORG_ID = 'org-gabot';
export const DEFAULT_CHANNEL_NAME = 'General';
export const DEFAULT_PROJECT_NAME = 'Default';
export const GENERAL_ASSISTANT_ID = 'general-assistant';

export type TeamBotProfile = {
  id: string;
  name: string;
  roleDescription: string;
  title: string;
  visibility: string;
};

export const TEAM_BOT_PROFILES: readonly TeamBotProfile[] = [
  {
    id: GENERAL_ASSISTANT_ID,
    name: 'General Assistant',
    title: 'General Assistant',
    roleDescription: 'Helps with governed computer and MCP work.',
    visibility: 'public',
  },
  {
    id: 'monitor',
    name: 'Monitor',
    title: 'Monitor',
    roleDescription: 'Watches systems and delegates triage.',
    visibility: 'public',
  },
  {
    id: 'triage',
    name: 'Triage',
    title: 'Triage',
    roleDescription: 'Turns incidents into actionable work and delegates coding.',
    visibility: 'public',
  },
  {
    id: 'coder',
    name: 'Coder',
    title: 'Coder',
    roleDescription: 'Implements delegated coding work.',
    visibility: 'public',
  },
];

export const DEFAULT_TEAM_BOT_IDS = TEAM_BOT_PROFILES.map((bot) => bot.id);

export type SeedParticipant = {
  channelId: string;
  principalId: string;
  principalType: 'bot' | 'user';
  role: string;
};

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

export function botIdentityContent(botId: string): string {
  return `You are ${botId}.`;
}

export function parseBotIdentityContent(content: string): string | undefined {
  const sample = botIdentityContent('\0');
  const marker = sample.indexOf('\0');
  const prefix = sample.slice(0, marker);
  const suffix = sample.slice(marker + 1);
  if (!content.startsWith(prefix) || !content.endsWith(suffix)) {
    return undefined;
  }
  const id = content.slice(prefix.length, content.length - suffix.length).trim();
  return id.length > 0 ? id : undefined;
}

export function defaultChannelParticipants(
  channelId: string,
  userId: string,
  extraBotId?: string,
): SeedParticipant[] {
  const bots = new Set<string>(DEFAULT_TEAM_BOT_IDS);
  if (extraBotId) {
    bots.add(extraBotId);
  }
  return [
    { channelId, principalType: 'user', principalId: userId, role: 'owner' },
    ...[...bots].map((principalId) => ({
      channelId,
      principalId,
      principalType: 'bot' as const,
      role: 'bot',
    })),
  ];
}
