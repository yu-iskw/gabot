export const PLATFORM_ORG_ID = 'org-gabot';
export const DEFAULT_WORKSPACE_ID = 'ws-gabot';
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
    roleDescription: 'Helps with governed MCP work.',
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

export function workspaceSlug(workspaceId: string): string {
  return workspaceId.startsWith('ws-') ? workspaceId.slice(3) : workspaceId;
}

export function workspaceProjectId(workspaceId: string): string {
  return `proj-${workspaceSlug(workspaceId)}`;
}

export function workspaceDefaultChannelId(workspaceId: string): string {
  return `ch-${workspaceSlug(workspaceId)}-general`;
}

export function mentionedBotId(message: string): string | undefined {
  const match = /^@([a-z][a-z0-9-]*)\b/i.exec(message.trim());
  return match?.[1]?.toLowerCase();
}

/** Mention-safe kebab id from a display name (matches mentionedBotId charset). */
export function slugifyBotId(name: string): string {
  const slug = name
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .replace(/-{2,}/g, '-');
  if (!slug) {
    return 'bot';
  }
  if (!/^[a-z][a-z0-9-]*$/.test(slug)) {
    const rest = slug.replace(/^[^a-z]+/, '');
    return rest.length > 0 ? `bot-${rest}` : 'bot-x';
  }
  return slug;
}

/** Allocate a unique kebab bot id; appends -2, -3, … on collision. */
export function allocateBotId(name: string, taken: ReadonlySet<string> | Iterable<string>): string {
  const occupied = taken instanceof Set ? taken : new Set(taken);
  const base = slugifyBotId(name);
  if (!occupied.has(base)) {
    return base;
  }
  let n = 2;
  while (occupied.has(`${base}-${String(n)}`)) {
    n += 1;
  }
  return `${base}-${String(n)}`;
}

export type IdentityTeammate = {
  id: string;
  title?: string;
  roleDescription?: string;
};

const DEFAULT_IDENTITY_TEAMMATES: readonly IdentityTeammate[] = TEAM_BOT_PROFILES.map((bot) => ({
  id: bot.id,
  title: bot.title,
  roleDescription: bot.roleDescription,
}));

export function botIdentityContent(
  botId: string,
  teammates: readonly IdentityTeammate[] = DEFAULT_IDENTITY_TEAMMATES,
): string {
  const self = teammates.find((bot) => bot.id === botId);
  const role =
    self?.roleDescription ??
    self?.title ??
    TEAM_BOT_PROFILES.find((bot) => bot.id === botId)?.roleDescription ??
    'Helps with governed coworker tasks.';
  const teammateList =
    teammates.length > 0
      ? teammates
          .map((bot) =>
            bot.title && bot.title !== bot.id ? `@${bot.id} (${bot.title})` : `@${bot.id}`,
          )
          .join(', ')
      : '(none)';
  return [
    `You are ${botId}.`,
    `Role: ${role}`,
    `Teammates in this channel: ${teammateList}.`,
    'Collaborate by calling delegate_to_bot with a concrete objective.',
    'Prefer multi-hop auto-collaboration over asking a human unless blocked.',
    'Keep delegating until the objective is complete or the budget refuses further hops.',
  ].join(' ');
}

export function parseBotIdentityContent(content: string): string | undefined {
  const match = /^You are ([a-z][a-z0-9-]*)\./i.exec(content.trim());
  const id = match?.[1]?.toLowerCase();
  return id && id.length > 0 ? id : undefined;
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
