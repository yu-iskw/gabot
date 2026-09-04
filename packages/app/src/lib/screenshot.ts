export type ScreenShot = {
  base64: string;
  title?: string;
  url?: string;
};

export function isBlankBrowser(url: string | undefined): boolean {
  if (url === undefined) {
    return false;
  }
  const trimmed = url.trim();
  return trimmed.length === 0 || trimmed === 'about:blank';
}

export function hostOf(url: string): string {
  try {
    return new URL(url).host;
  } catch {
    return url;
  }
}

export function readScreenShot(value: unknown): ScreenShot | null {
  if (typeof value !== 'object' || value === null) {
    return null;
  }
  const record = value as Record<string, unknown>;
  const base64 = record.base64;
  if (typeof base64 !== 'string' || base64.length === 0) {
    return null;
  }
  return {
    base64,
    url: stringField(record.url),
    title: stringField(record.title),
  };
}

function stringField(value: unknown): string | undefined {
  return typeof value === 'string' && value.length > 0 ? value : undefined;
}
