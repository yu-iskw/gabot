export function activityLabel(eventType: string): string {
  if (eventType.includes('refused')) {
    return 'Blocked';
  }
  if (eventType.includes('navigate')) {
    return 'Opened';
  }
  if (eventType.includes('mcp')) {
    return 'Called MCP';
  }
  if (eventType.includes('granted')) {
    return 'Granted';
  }
  if (eventType.includes('revoked')) {
    return 'Revoked';
  }
  if (eventType.includes('routine')) {
    return 'Scheduled';
  }
  if (eventType.includes('agent')) {
    return 'Created a bot';
  }
  return eventType;
}

export function activityDetail(_eventType: string, payload: Record<string, unknown>): string {
  const url = payload.url;
  if (typeof url === 'string') {
    return url;
  }
  const rule = payload.rule;
  if (typeof rule === 'string') {
    return rule;
  }
  const reason = payload.reason;
  if (typeof reason === 'string') {
    return reason;
  }
  const name = payload.name;
  if (typeof name === 'string') {
    return name;
  }
  const output = payload.output;
  if (typeof output === 'string') {
    return output;
  }
  return _eventType;
}
