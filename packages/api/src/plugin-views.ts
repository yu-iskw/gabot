import type { GabotStore, GrantRecord, PluginRecord, PluginTool } from './store/types.js';

type PluginListItem = PluginRecord & {
  botCount: number;
  toolCount: number;
};

type PluginToolView = PluginTool & {
  grantedTo: string[];
};

type PluginDetail = {
  agents: Array<{ id: string; title: string }>;
  plugin: PluginRecord;
  tools: PluginToolView[];
};

export async function listPluginViews(store: GabotStore): Promise<PluginListItem[]> {
  const [plugins, grants] = await Promise.all([store.listPlugins(), store.listGrants()]);
  const items: PluginListItem[] = [];
  for (const plugin of plugins) {
    const tools = await store.listPluginTools(plugin.id);
    items.push(toListItem(plugin, tools, grants));
  }
  return items;
}

export async function getPluginDetail(store: GabotStore, id: string): Promise<PluginDetail | null> {
  const plugins = await store.listPlugins();
  const plugin = plugins.find((row) => row.id === id);
  if (!plugin) {
    return null;
  }
  const [tools, grants, agents] = await Promise.all([
    store.listPluginTools(id),
    store.listGrants(),
    store.listAgents(),
  ]);
  return {
    plugin,
    tools: tools.map((tool) => ({
      ...tool,
      grantedTo: grants
        .filter((grant) => grant.kind === 'mcp' && grant.ref === tool.ref)
        .map((grant) => grant.agentId),
    })),
    agents: agents.map((agent) => ({ id: agent.id, title: agent.title || agent.name })),
  };
}

function toListItem(
  plugin: PluginRecord,
  tools: PluginTool[],
  grants: GrantRecord[],
): PluginListItem {
  const refs = new Set(tools.map((tool) => tool.ref));
  const bots = new Set(
    grants
      .filter((grant) => grant.kind === 'mcp' && refs.has(grant.ref))
      .map((grant) => grant.agentId),
  );
  return { ...plugin, toolCount: tools.length, botCount: bots.size };
}
