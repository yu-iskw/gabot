export const WORKSPACE_SLUG_HEADER = 'x-gabot-workspace-slug';

export type WorkspaceDirectoryEntry = {
  authDomain: string;
  backendId: string;
  displayName: string;
  domain?: string;
  slug: string;
  tokenAudience: string;
  upstream: string;
  workspaceId: string;
};

export type WorkspaceDirectory = {
  workspaces: WorkspaceDirectoryEntry[];
};

export function parseWorkspaceDirectory(value: unknown): WorkspaceDirectory {
  return parseDirectory(value, true);
}

export function parsePublicWorkspaceDirectory(value: unknown): WorkspaceDirectory {
  return parseDirectory(value, false);
}

export async function fetchWorkspaceDirectory(): Promise<WorkspaceDirectory> {
  const response = await fetch('/workspace-directory.json');
  if (!response.ok) {
    throw new Error('Failed to load workspace directory');
  }
  return parsePublicWorkspaceDirectory(await response.json());
}

export function findWorkspaceEntry(
  directory: WorkspaceDirectory,
  slug: string,
): WorkspaceDirectoryEntry | undefined {
  return directory.workspaces.find((entry) => entry.slug === slug);
}

export function findWorkspaceByLocator(
  directory: WorkspaceDirectory,
  raw: string,
): WorkspaceDirectoryEntry | undefined {
  const needle = normalizeLocator(raw);
  if (!needle) {
    return undefined;
  }
  return directory.workspaces.find((entry) => {
    if (entry.slug.toLowerCase() === needle) {
      return true;
    }
    return entry.domain !== undefined && normalizeLocator(entry.domain) === needle;
  });
}

export function defaultWorkspaceEntry(directory: WorkspaceDirectory): WorkspaceDirectoryEntry {
  return directory.workspaces[0];
}

function parseDirectory(value: unknown, requireUpstream: boolean): WorkspaceDirectory {
  if (typeof value !== 'object' || value === null) {
    throw new Error('workspace directory must be an object');
  }
  const record = value as Record<string, unknown>;
  if (!Array.isArray(record.workspaces)) {
    throw new Error('workspace directory workspaces must be an array');
  }
  const workspaces = record.workspaces.map((entry, index) =>
    parseEntry(entry, index, requireUpstream),
  );
  const slugs = new Set<string>();
  const domains = new Set<string>();
  for (const entry of workspaces) {
    if (slugs.has(entry.slug)) {
      throw new Error(`duplicate workspace slug ${entry.slug}`);
    }
    slugs.add(entry.slug);
    if (entry.domain) {
      const domain = normalizeLocator(entry.domain);
      if (domains.has(domain)) {
        throw new Error(`duplicate workspace domain ${entry.domain}`);
      }
      domains.add(domain);
    }
  }
  if (workspaces.length === 0) {
    throw new Error('workspace directory must list at least one workspace');
  }
  return { workspaces };
}

function parseEntry(
  value: unknown,
  index: number,
  requireUpstream: boolean,
): WorkspaceDirectoryEntry {
  if (typeof value !== 'object' || value === null) {
    throw new Error(`workspace directory entry ${String(index)} must be an object`);
  }
  const record = value as Record<string, unknown>;
  const upstream = optionalString(record.upstream);
  if (requireUpstream && !upstream) {
    throw new Error(`workspace directory entry ${String(index)} missing upstream`);
  }
  const domain = optionalString(record.domain);
  return {
    authDomain: requiredString(record.authDomain, 'authDomain', index),
    backendId: requiredString(record.backendId, 'backendId', index),
    displayName: requiredString(record.displayName, 'displayName', index),
    slug: requiredString(record.slug, 'slug', index),
    tokenAudience: requiredString(record.tokenAudience, 'tokenAudience', index),
    upstream: upstream ?? 'https://unused.invalid',
    workspaceId: requiredString(record.workspaceId, 'workspaceId', index),
    ...(domain ? { domain } : {}),
  };
}

function requiredString(value: unknown, key: string, index: number): string {
  if (typeof value !== 'string' || value.length === 0) {
    throw new Error(`workspace directory entry ${String(index)} missing ${key}`);
  }
  return value;
}

function optionalString(value: unknown): string | undefined {
  if (typeof value !== 'string' || value.length === 0) {
    return undefined;
  }
  return value;
}

function normalizeLocator(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/^https?:\/\//, '')
    .replace(/\/$/, '');
}
