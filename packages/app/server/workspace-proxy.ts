import { readFileSync } from 'node:fs';

export const WORKSPACE_SLUG_HEADER = 'x-gabot-workspace-slug';

type WorkspaceDirectoryEntry = {
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

export type PublicWorkspaceListing = {
  workspaces: Array<
    Omit<WorkspaceDirectoryEntry, 'upstream'> & {
      domain?: string;
    }
  >;
};

function parseWorkspaceDirectory(value: unknown): WorkspaceDirectory {
  if (typeof value !== 'object' || value === null) {
    throw new Error('workspace directory must be an object');
  }
  const record = value as Record<string, unknown>;
  if (!Array.isArray(record.workspaces)) {
    throw new Error('workspace directory workspaces must be an array');
  }
  const workspaces = record.workspaces.map((entry, index) => parseEntry(entry, index));
  const slugs = new Set<string>();
  const domains = new Set<string>();
  for (const entry of workspaces) {
    if (slugs.has(entry.slug)) {
      throw new Error(`duplicate workspace slug ${entry.slug}`);
    }
    slugs.add(entry.slug);
    if (entry.domain) {
      const domain = entry.domain.trim().toLowerCase();
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

export function loadWorkspaceDirectory(path: string): WorkspaceDirectory {
  return parseWorkspaceDirectory(JSON.parse(readFileSync(path, 'utf8')) as unknown);
}

export function toPublicWorkspaceListing(directory: WorkspaceDirectory): PublicWorkspaceListing {
  return {
    workspaces: directory.workspaces.map(
      ({ slug, displayName, backendId, workspaceId, authDomain, tokenAudience, domain }) => ({
        slug,
        displayName,
        backendId,
        workspaceId,
        authDomain,
        tokenAudience,
        ...(domain ? { domain } : {}),
      }),
    ),
  };
}

function resolveUpstream(
  directory: WorkspaceDirectory,
  slugHeader: string | undefined,
): WorkspaceDirectoryEntry {
  const slug = slugHeader?.trim();
  if (!slug) {
    const first = directory.workspaces[0];
    if (first === undefined) {
      throw new Error('workspace directory is empty');
    }
    return first;
  }
  const entry = directory.workspaces.find((row) => row.slug === slug);
  if (!entry) {
    throw new Error(`Unknown workspace slug: ${slug}`);
  }
  return entry;
}

export async function proxyApiRequest(input: {
  body?: ArrayBuffer;
  directory: WorkspaceDirectory;
  headers: Headers;
  method: string;
  path: string;
  search: string;
  slugHeader: string | undefined;
}): Promise<Response> {
  let entry: WorkspaceDirectoryEntry;
  try {
    entry = resolveUpstream(input.directory, input.slugHeader);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown workspace';
    return new Response(JSON.stringify({ error: message }), {
      status: 400,
      headers: { 'content-type': 'application/json' },
    });
  }
  const url = new URL(input.path, entry.upstream);
  url.search = input.search;
  const headers = new Headers(input.headers);
  headers.delete('host');
  headers.delete(WORKSPACE_SLUG_HEADER);
  return fetch(url, {
    method: input.method,
    headers,
    body: input.body,
  });
}

function parseEntry(value: unknown, index: number): WorkspaceDirectoryEntry {
  if (typeof value !== 'object' || value === null) {
    throw new Error(`workspace directory entry ${String(index)} must be an object`);
  }
  const row = value as Record<string, unknown>;
  const domain = optionalString(row.domain);
  return {
    authDomain: requiredString(row.authDomain, 'authDomain', index),
    backendId: requiredString(row.backendId, 'backendId', index),
    displayName: requiredString(row.displayName, 'displayName', index),
    slug: requiredString(row.slug, 'slug', index),
    tokenAudience: requiredString(row.tokenAudience, 'tokenAudience', index),
    upstream: requiredString(row.upstream, 'upstream', index),
    workspaceId: requiredString(row.workspaceId, 'workspaceId', index),
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
