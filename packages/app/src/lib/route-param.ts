export function readRouteString(
  value: unknown,
  key: 'channelId' | 'pluginId' | 'toolName',
  fallback: string,
): string {
  if (typeof value !== 'object' || value === null) {
    return fallback;
  }
  const record = value as Record<string, unknown>;
  const found = field(record, key);
  return typeof found === 'string' ? found : fallback;
}

function field(
  record: Record<string, unknown>,
  key: 'channelId' | 'pluginId' | 'toolName',
): unknown {
  switch (key) {
    case 'channelId': {
      return record.channelId;
    }
    case 'pluginId': {
      return record.pluginId;
    }
    case 'toolName': {
      return record.toolName;
    }
    default: {
      const exhaustive: never = key;
      return exhaustive;
    }
  }
}
