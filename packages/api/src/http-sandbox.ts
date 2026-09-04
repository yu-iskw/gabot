import type { ComputerActionResult, SandboxPort } from '@gabot/common';

export function createHttpSandbox(computerUrl: string, token: string): SandboxPort {
  const root = computerUrl.replace(/\/$/, '');
  return {
    navigate: (_botId, url) => post(root, token, '/navigate', { url }),
    screenshot: () => post(root, token, '/screenshot', {}),
  };
}

async function post(
  root: string,
  token: string,
  path: string,
  body: Record<string, unknown>,
): Promise<ComputerActionResult> {
  const response = await fetch(`${root}${path}`, {
    method: 'POST',
    headers: {
      authorization: `Bearer ${token}`,
      'content-type': 'application/json',
    },
    body: JSON.stringify(body),
  });
  return (await response.json()) as ComputerActionResult;
}
