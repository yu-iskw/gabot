export function grantSummary(held: number, total: number): string {
  if (held === 0) {
    return 'No Bots';
  }
  if (held === total) {
    return total === 1 ? '1 Bot' : 'All Bots';
  }
  return `${String(held)} of ${String(total)} Bots`;
}

export function pluginRowSummary(toolCount: number, botCount: number): string {
  if (toolCount === 0) {
    return 'No tools yet';
  }
  const tools = toolCount === 1 ? '1 tool' : `${String(toolCount)} tools`;
  if (botCount === 0) {
    return `${tools} · no Bots`;
  }
  const bots = botCount === 1 ? '1 Bot' : `${String(botCount)} Bots`;
  return `${tools} · ${bots}`;
}
