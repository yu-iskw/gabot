export function readAuditPayload(payload: unknown): Record<string, unknown> {
  if (typeof payload === 'string') {
    return recordFromJson(payload);
  }
  if (typeof payload === 'object' && payload !== null) {
    return payload as Record<string, unknown>;
  }
  return {};
}

function recordFromJson(raw: string): Record<string, unknown> {
  try {
    const parsed: unknown = JSON.parse(raw);
    if (typeof parsed === 'object' && parsed !== null) {
      return parsed as Record<string, unknown>;
    }
  } catch {
    return {};
  }
  return {};
}
