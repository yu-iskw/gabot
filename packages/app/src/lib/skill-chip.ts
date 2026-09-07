const SLASH_PREFIX = '/';

export function splitSkillChip(
  text: string,
  commandNames: string,
): { chip: string; rest: string } | null {
  if (!text.startsWith(SLASH_PREFIX)) {
    return null;
  }
  const after = text.slice(1);
  const space = after.search(/\s/);
  const token = space === -1 ? after : after.slice(0, space);
  if (!isCommandToken(token)) {
    return null;
  }
  const known = commandNames.split(',').filter(Boolean);
  if (!known.includes(token)) {
    return null;
  }
  const rest = space === -1 ? '' : after.slice(space + 1);
  return { chip: token, rest };
}

function isCommandToken(token: string): boolean {
  if (token.length === 0) {
    return false;
  }
  const first = token.charCodeAt(0);
  if (first < 97 || first > 122) {
    if (first < 48 || first > 57) {
      return false;
    }
  }
  for (const char of token.slice(1)) {
    const code = char.charCodeAt(0);
    const letter = code >= 97 && code <= 122;
    const digit = code >= 48 && code <= 57;
    if (!letter && !digit && char !== '-') {
      return false;
    }
  }
  return true;
}
