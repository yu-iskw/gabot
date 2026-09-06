export type ContractResult<T> = { ok: true; value: T } | { ok: false; reason: string };

export function contractFail(reason: string): { ok: false; reason: string } {
  return { ok: false, reason };
}

export function contractOk<T>(value: T): { ok: true; value: T } {
  return { ok: true, value };
}

export function parseNonEmptyString(value: unknown, reason: string): ContractResult<string> {
  if (typeof value !== 'string') {
    return contractFail(reason);
  }
  const trimmed = value.trim();
  if (trimmed.length === 0) {
    return contractFail(reason);
  }
  return contractOk(trimmed);
}

export function parseOptionalNonEmptyString(
  value: unknown,
  reason: string,
): ContractResult<string | undefined> {
  if (value === undefined || value === null) {
    return contractOk(undefined);
  }
  if (typeof value !== 'string') {
    return contractFail(reason);
  }
  const trimmed = value.trim();
  if (trimmed.length === 0) {
    return contractOk(undefined);
  }
  return contractOk(trimmed);
}

export function parseRecord(
  value: unknown,
  reason: string,
): ContractResult<Record<string, unknown>> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    return contractFail(reason);
  }
  return contractOk(value as Record<string, unknown>);
}
