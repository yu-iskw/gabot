export function hashHue(value: string): number {
  let hash = 0;
  for (const char of value) {
    hash = (hash * 31 + (char.codePointAt(0) ?? 0)) % 360;
  }
  return hash;
}
