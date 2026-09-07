export type ChannelPane = 'settings';

type ChannelSearch = {
  settings?: boolean;
};

export function readChannelSearch(search: Record<string, unknown>): ChannelSearch {
  return {
    ...(flagOn(search.settings) ? { settings: true } : {}),
  };
}

export function paneFromSearch(search: ChannelSearch): ChannelPane | null {
  if (search.settings === true) {
    return 'settings';
  }
  return null;
}

export function searchForPane(next: ChannelPane | null): ChannelSearch {
  if (next === 'settings') {
    return { settings: true };
  }
  return {};
}

export function searchRecord(value: unknown): Record<string, unknown> {
  if (typeof value === 'object' && value !== null) {
    return value as Record<string, unknown>;
  }
  return {};
}

function flagOn(value: unknown): boolean {
  return value === true || value === 'true';
}
