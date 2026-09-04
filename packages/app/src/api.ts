import { apiBase } from './config.js';

export async function apiJson<T>(path: string, token: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${apiBase()}${path}`, {
    ...init,
    headers: {
      authorization: `Bearer ${token}`,
      'content-type': 'application/json',
      ...(init?.headers ?? {}),
    },
  });
  if (!response.ok) {
    throw new Error(`${path} failed: ${String(response.status)}`);
  }
  return (await response.json()) as T;
}

export async function readTurnStream(
  path: string,
  token: string,
  message: string,
): Promise<string> {
  const response = await fetch(`${apiBase()}${path}`, {
    method: 'POST',
    headers: {
      authorization: `Bearer ${token}`,
      'content-type': 'application/json',
    },
    body: JSON.stringify({ message }),
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
