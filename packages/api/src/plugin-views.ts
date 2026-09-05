import { matchCapabilityGrant, mcpCapabilityForRef } from '@gabot/common';

import type {
  CapabilityGrantRecord,
  GabotStore,
  OwnerConnectionRecord,
  PluginRecord,
  PluginTool,
  WorkspaceRecord,
} from './store/types.js';

type PluginListItem = PluginRecord & {
  grantedCount: number;
  toolCount: number;
};

type PluginToolView = PluginTool & {
  granted: boolean;
};

type PluginDetail = {
  plugin: PluginRecord;
  tools: PluginToolView[];
};

type WorkspaceScope = Pick<WorkspaceRecord, 'id' | 'ownerUserId'>;

export async function listPluginViews(
  store: GabotStore,
  workspace: WorkspaceScope,
): Promise<PluginListItem[]> {
  const [plugins, context] = await Promise.all([
    store.listPlugins(),
    grantContext(store, workspace.id),
  ]);
  const items: PluginListItem[] = [];
  for (const plugin of plugins) {
    const tools = await store.listPluginTools(plugin.id);
    items.push({
      ...plugin,
      toolCount: tools.length,
      grantedCount: tools.filter((tool) => toolGranted(workspace, context, tool.ref)).length,
    });
  }
  return items;
}

export async function getPluginDetail(
  store: GabotStore,
  id: string,
  workspace: WorkspaceScope,
): Promise<PluginDetail | null> {
  const plugins = await store.listPlugins();
  const plugin = plugins.find((row) => row.id === id);
  if (!plugin) {
    return null;
  }
  const [tools, context] = await Promise.all([
    store.listPluginTools(id),
    grantContext(store, workspace.id),
  ]);
  return {
    plugin,
    tools: tools.map((tool) => ({
      ...tool,
      granted: toolGranted(workspace, context, tool.ref),
    })),
  };
}

async function grantContext(
  store: GabotStore,
  workspaceId: string,
): Promise<{ connections: OwnerConnectionRecord[]; grants: CapabilityGrantRecord[] }> {
  const [connections, grants] = await Promise.all([
    store.listOwnerConnections(workspaceId),
    store.listCapabilityGrants(workspaceId),
  ]);
  return { connections, grants };
}

function toolGranted(
  workspace: WorkspaceScope,
  context: { connections: OwnerConnectionRecord[]; grants: CapabilityGrantRecord[] },
  ref: string,
): boolean {
  return matchCapabilityGrant({
    workspaceId: workspace.id,
    ownerUserId: workspace.ownerUserId,
    capability: mcpCapabilityForRef(ref),
    resource: ref,
    connections: context.connections,
    grants: context.grants,
  }).ok;
}
