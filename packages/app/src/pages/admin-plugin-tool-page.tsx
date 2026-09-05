import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { apiJson } from '../api.js';
import { FactRow, PageEmpty, PageSection, PageShell } from '../components/layout/page-shell.js';
import { Switch } from '../components/ui/switch.js';
import { useAuth } from '../lib/auth-context.js';

type PluginDetail = {
  plugin: { id: string; title: string };
  tools: Array<{
    description: string;
    granted: boolean;
    name: string;
    resource: string;
  }>;
};

export function AdminPluginToolPage({
  pluginId,
  toolName,
}: {
  pluginId: string;
  toolName: string;
}) {
  const { token } = useAuth();
  const queryClient = useQueryClient();
  const detail = useQuery({
    queryKey: ['plugin', pluginId],
    queryFn: async () => apiJson<PluginDetail>(`/api/admin/plugins/${pluginId}`, await token()),
  });
  const setGrant = useMutation({
    mutationFn: async (input: { granted: boolean; ref: string }) =>
      apiJson(`/api/admin/plugins/${pluginId}/grants`, await token(), {
        method: 'PUT',
        body: JSON.stringify(input),
      }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['plugin', pluginId] });
      await queryClient.invalidateQueries({ queryKey: ['plugins'] });
      await queryClient.invalidateQueries({ queryKey: ['audit'] });
    },
  });

  const tool = detail.data?.tools.find((row) => row.name === toolName);
  const pluginTitle = detail.data?.plugin.title ?? 'Plugin';

  return (
    <PageShell
      backButton={{ label: pluginTitle, to: `/admin/plugins/${pluginId}` }}
      title={toolName}
      description={tool?.description || 'This tool came with no description.'}
    >
      <PageSection
        title="Workspace grant"
        description="Permission is an owner grant on a resource. Catalog listing is not authorization."
      >
        {detail.isPending ? null : !tool ? (
          <PageEmpty>This connector does not advertise a tool by that name.</PageEmpty>
        ) : (
          <FactRow
            title={tool.ref}
            description={
              tool.granted
                ? 'This workspace may invoke the capability for this resource.'
                : 'Not granted. The model may still request the tool; the gateway refuses it.'
            }
            action={
              <Switch
                aria-label={`Grant ${toolName} for this workspace`}
                checked={tool.granted}
                disabled={setGrant.isPending}
                onCheckedChange={(next) => {
                  setGrant.mutate({ granted: next, ref: tool.ref });
                }}
              />
            }
          />
        )}
      </PageSection>
    </PageShell>
  );
}
