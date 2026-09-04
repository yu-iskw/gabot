import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { apiJson } from '../api.js';
import {
  FactRow,
  PageEmpty,
  PageRows,
  PageSection,
  PageShell,
} from '../components/layout/page-shell.js';
import { Separator } from '../components/ui/separator.js';
import { Switch } from '../components/ui/switch.js';
import { useAuth } from '../lib/auth-context.js';

type PluginDetail = {
  agents: Array<{ id: string; title: string }>;
  plugin: { id: string; title: string };
  tools: Array<{ description: string; grantedTo: string[]; name: string; ref: string }>;
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
    mutationFn: async (input: { agentId: string; granted: boolean; ref: string }) =>
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
        title="Bots"
        description="A Bot may call this tool only while its switch is on. Turning one off takes effect on the next call."
      >
        {detail.isPending ? null : !tool ? (
          <PageEmpty>This connector does not advertise a tool by that name.</PageEmpty>
        ) : (detail.data?.agents.length ?? 0) === 0 ? (
          <PageEmpty>
            This deployment has no Bots yet, so there is nobody to grant this to.
          </PageEmpty>
        ) : (
          <PageRows>
            {(detail.data?.agents ?? []).map((agent, index) => {
              const held = tool.grantedTo.includes(agent.id);
              return (
                <div key={agent.id}>
                  {index > 0 ? <Separator /> : null}
                  <FactRow
                    title={agent.title}
                    description={
                      held
                        ? 'May call this tool. Every call is still checked against the boundaries and written to the audit trail.'
                        : 'Cannot call this tool. It is not offered to the model at all, so it has nothing to refuse.'
                    }
                    action={
                      <Switch
                        aria-label={`Let ${agent.title} call ${toolName}`}
                        checked={held}
                        disabled={grantPendingFor(setGrant.isPending, setGrant.variables, agent.id)}
                        onCheckedChange={(next) => {
                          setGrant.mutate({ agentId: agent.id, granted: next, ref: tool.ref });
                        }}
                      />
                    }
                  />
                </div>
              );
            })}
          </PageRows>
        )}
      </PageSection>
    </PageShell>
  );
}

function grantPendingFor(
  pending: boolean,
  variables: { agentId: string } | undefined,
  agentId: string,
): boolean {
  return pending && variables !== undefined && variables.agentId === agentId;
}
