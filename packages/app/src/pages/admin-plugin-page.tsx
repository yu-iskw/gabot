import { useQuery } from '@tanstack/react-query';

import { apiJson } from '../api.js';
import {
  ItemRow,
  PageEmpty,
  PageRows,
  PageSection,
  PageShell,
} from '../components/layout/page-shell.js';
import { Separator } from '../components/ui/separator.js';
import { useAuth } from '../lib/auth-context.js';
import { grantSummary } from '../lib/grant-summary.js';

type PluginDetail = {
  agents: Array<{ id: string; title: string }>;
  plugin: { id: string; title: string; url: string; vendor: string };
  tools: Array<{ description: string; grantedTo: string[]; name: string; ref: string }>;
};

export function AdminPluginPage({ pluginId }: { pluginId: string }) {
  const { token } = useAuth();
  const detail = useQuery({
    queryKey: ['plugin', pluginId],
    queryFn: async () => apiJson<PluginDetail>(`/api/admin/plugins/${pluginId}`, await token()),
  });

  const plugin = detail.data?.plugin;
  const tools = detail.data?.tools ?? [];
  const botTotal = detail.data?.agents.length ?? 0;

  return (
    <PageShell
      backButton={{ label: 'Plugins', to: '/admin/plugins' }}
      title={plugin?.title ?? 'Plugin'}
      description={
        plugin
          ? `${plugin.vendor} at ${plugin.url}. A Bot is told about a tool only when it holds it.`
          : 'Loading this connector…'
      }
    >
      <PageSection
        title="Tools"
        description="How widely each tool is granted. Open a tool to switch it on or off for a Bot."
      >
        {detail.isPending ? null : tools.length === 0 ? (
          <PageEmpty>No tools listed for this connector.</PageEmpty>
        ) : (
          <PageRows>
            {tools.map((tool, index) => (
              <div key={tool.ref}>
                {index > 0 ? <Separator /> : null}
                <ItemRow
                  to={`/admin/plugins/${pluginId}/tools/${tool.name}`}
                  title={tool.name}
                  description={tool.description}
                  summary={grantSummary(tool.grantedTo.length, botTotal)}
                />
              </div>
            ))}
          </PageRows>
        )}
      </PageSection>
    </PageShell>
  );
}
