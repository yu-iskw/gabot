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
import { pluginRowSummary } from '../lib/grant-summary.js';

type PluginListItem = {
  grantedCount: number;
  id: string;
  title: string;
  toolCount: number;
  url: string;
  vendor: string;
};

export function AdminPluginsPage() {
  const { token } = useAuth();
  const plugins = useQuery({
    queryKey: ['plugins'],
    queryFn: async () => {
      const body = await apiJson<{ plugins: PluginListItem[] }>(
        '/api/admin/plugins',
        await token(),
      );
      return body.plugins;
    },
  });

  return (
    <PageShell
      backButton={{ label: 'Admin', to: '/admin' }}
      title="Plugins"
      description="What this deployment can reach. Adding a plugin is catalog only; owner grants decide invocation."
    >
      <PageSection
        title="Connected"
        description="Enabled for this deployment. Open a vendor to grant its tools."
      >
        {(plugins.data ?? []).length === 0 ? (
          <PageEmpty>No MCP servers are registered.</PageEmpty>
        ) : (
          <PageRows>
            {(plugins.data ?? []).map((plugin, index) => (
              <div key={plugin.id}>
                {index > 0 ? <Separator /> : null}
                <ItemRow
                  to={`/admin/plugins/${plugin.id}`}
                  title={plugin.title}
                  description={`${plugin.vendor} · ${plugin.url}`}
                  summary={pluginRowSummary(plugin.toolCount, plugin.grantedCount)}
                />
              </div>
            ))}
          </PageRows>
        )}
      </PageSection>
    </PageShell>
  );
}
