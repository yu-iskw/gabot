export function grantSummary(granted: boolean): string {
  return granted ? 'Granted' : 'Not granted';
}

export function pluginRowSummary(toolCount: number, grantedCount: number): string {
  if (toolCount === 0) {
    return 'No tools yet';
  }
  const tools = toolCount === 1 ? '1 tool' : `${String(toolCount)} tools`;
  if (grantedCount === 0) {
    return `${tools} · none granted`;
  }
  const grants = grantedCount === 1 ? '1 granted' : `${String(grantedCount)} granted`;
  return `${tools} · ${grants}`;
}
