export function matchesToken(expected: string, offered: string): boolean {
  if (expected.length === 0 || offered.length !== expected.length) {
    return false;
  }
  let difference = 0;
  for (let index = 0; index < expected.length; index += 1) {
    difference |= expected.charCodeAt(index) ^ offered.charCodeAt(index);
  }
  return difference === 0;
}

export function offeredBearer(header: string | undefined): string {
  const value = header?.trim() ?? '';
  return value.replace(/^Bearer /i, '');
}
