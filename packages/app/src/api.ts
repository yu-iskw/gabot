import { apiBase } from './config.js';
import { getActiveWorkspaceSlug } from './lib/active-workspace-slug.js';
import { WORKSPACE_SLUG_HEADER } from './lib/workspace-directory.js';

export class ApiRequestError extends Error {
  public readonly status: number;

  public constructor(
    path: string,
    status: number,
    public readonly body: string,
  ) {
    super(`${path} failed: ${String(status)}`);
    this.status = status;
  }
}

export function apiHeaders(token: string, init?: RequestInit): HeadersInit {
  const slug = getActiveWorkspaceSlug();
  return {
    authorization: `Bearer ${token}`,
    'content-type': 'application/json',
    ...(slug ? { [WORKSPACE_SLUG_HEADER]: slug } : {}),
    ...(init?.headers ?? {}),
  };
}

export async function apiJson<T>(path: string, token: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${apiBase()}${path}`, {
    ...init,
    headers: apiHeaders(token, init),
  });
  if (!response.ok) {
    throw new ApiRequestError(path, response.status, await response.text());
  }
  return (await response.json()) as T;
}

export async function readTurnStream(
  path: string,
  token: string,
  message: string,
  botId?: string | null,
): Promise<string> {
  const response = await fetch(`${apiBase()}${path}`, {
    method: 'POST',
    headers: apiHeaders(token),
    body: JSON.stringify({ message, botId: botId || undefined }),
  });
  const payload = await response.text();
  return parseTurnSse(payload);
}

export function parseTurnSse(payload: string): string {
  let text = '';
  for (const block of payload.split('\n\n')) {
    const line = block.split('\n').find((entry) => entry.startsWith('data: '));
    if (!line) {
      continue;
    }
    const parsed: unknown = JSON.parse(line.slice(6));
    if (typeof parsed === 'object' && parsed !== null && 'delta' in parsed) {
      const delta = (parsed as { delta?: unknown }).delta;
      if (typeof delta === 'string') {
        text += delta;
      }
    }
  }
  return text;
}
