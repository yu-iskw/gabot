import { mcpCapabilityForRef } from '@gabot/common';

import type { CapabilityGrantRecord, GabotStore, PluginRecord, PluginTool } from './store/types.js';

type PluginListItem = PluginRecord & {
  grantedCount: number;
  toolCount: number;
};

type PluginToolView = PluginTool & {
  granted: boolean;
  resource: string;
};

type PluginDetail = {
  plugin: PluginRecord;
  tools: PluginToolView[];
};

export async function listPluginViews(
  store: GabotStore,
  workspaceId: string,
): Promise<PluginListItem[]> {
  const [plugins, grants] = await Promise.all([
    store.listPlugins(),
    store.listCapabilityGrants(workspaceId),
  ]);
  const items: PluginListItem[] = [];
  for (const plugin of plugins) {
    const tools = await store.listPluginTools(plugin.id);
    items.push(toListItem(plugin, tools, grants));
  }
  return items;
}

export async function getPluginDetail(
  store: GabotStore,
  id: string,
  workspaceId: string,
): Promise<PluginDetail | null> {
  const plugins = await store.listPlugins();
  const plugin = plugins.find((row) => row.id === id);
  if (!plugin) {
    return null;
  }
  const [tools, grants] = await Promise.all([
    store.listPluginTools(id),
    store.listCapabilityGrants(workspaceId),
  ]);
  return {
    plugin,
    tools: tools.map((tool) => ({
      ...tool,
      resource: tool.ref,
      granted: grantHeld(grants, tool.ref),
    })),
  };
}

function grantHeld(grants: CapabilityGrantRecord[], ref: string): boolean {
  const capability = mcpCapabilityForRef(ref);
  return grants.some((grant) => grant.capability === capability && grant.resource === ref);
}

function toListItem(
  plugin: PluginRecord,
  tools: PluginTool[],
  grants: CapabilityGrantRecord[],
): PluginListItem {
  const grantedCount = tools.filter((tool) => grantHeld(grants, tool.ref)).length;
  return { ...plugin, toolCount: tools.length, grantedCount };
}
