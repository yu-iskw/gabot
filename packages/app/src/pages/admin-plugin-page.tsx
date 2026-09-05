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

type PluginDetail = {
  plugin: { id: string; title: string; url: string; vendor: string };
  tools: Array<{
    description: string;
    granted: boolean;
    name: string;
    ref: string;
  }>;
};

export function AdminPluginPage({ pluginId }: { pluginId: string }) {
  const { token } = useAuth();
  const detail = useQuery({
    queryKey: ['plugin', pluginId],
    queryFn: async () => apiJson<PluginDetail>(`/api/admin/plugins/${pluginId}`, await token()),
  });

  const plugin = detail.data?.plugin;
  const tools = detail.data?.tools ?? [];

  return (
    <PageShell
      backButton={{ label: 'Plugins', to: '/admin/plugins' }}
      title={plugin?.title ?? 'Plugin'}
      description={
        plugin
          ? `${plugin.vendor} at ${plugin.url}. Tools are catalogued here; grants live on the owner connection.`
          : 'Loading this connector…'
      }
    >
      <PageSection
        title="Tools"
        description="Open a tool to grant or revoke it for this workspace."
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
                  summary={tool.granted ? 'Granted' : 'Not granted'}
                />
              </div>
            ))}
          </PageRows>
        )}
      </PageSection>
    </PageShell>
  );
}
