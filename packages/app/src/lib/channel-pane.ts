export type ChannelPane = 'settings' | 'watch';

type ChannelSearch = {
  settings?: boolean;
  watch?: boolean;
};

export function readChannelSearch(search: Record<string, unknown>): ChannelSearch {
  return {
    ...(flagOn(search.settings) ? { settings: true } : {}),
    ...(flagOn(search.watch) ? { watch: true } : {}),
  };
}

export function paneFromSearch(search: ChannelSearch): ChannelPane | null {
  if (search.watch === true) {
    return 'watch';
  }
  if (search.settings === true) {
    return 'settings';
  }
  return null;
}

export function searchForPane(next: ChannelPane | null): ChannelSearch {
  if (next === 'watch') {
    return { watch: true };
  }
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
