import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { apiJson } from '../../api.js';
import { useAuth } from '../../lib/auth-context.js';
import { useSession } from '../../lib/session-context.js';
import { Button } from '../ui/button.js';

import type { Coworker } from '../../lib/agents.js';

type Participant = { principalId: string; principalType: string };

export function ChannelRoster({ channelId }: { channelId: string }) {
  const { token } = useAuth();
  const { queryKey } = useSession();
  const queryClient = useQueryClient();
  const participants = useQuery({
    queryKey: queryKey('participants', channelId),
    queryFn: async () => {
      const body = await apiJson<{ participants: Participant[] }>(
        `/api/channels/${channelId}/participants`,
        await token(),
      );
      return body.participants;
    },
  });
  const agents = useQuery({
    queryKey: queryKey('agents'),
    queryFn: async () => {
      const body = await apiJson<{ agents: Coworker[] }>('/api/agents', await token());
      return body.agents;
    },
  });
  const add = useMutation({
    mutationFn: async (agentId: string) =>
      apiJson(`/api/channels/${channelId}/participants`, await token(), {
        method: 'POST',
        body: JSON.stringify({ agentId }),
      }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: queryKey('participants', channelId) });
    },
  });
  const remove = useMutation({
    mutationFn: async (agentId: string) =>
      apiJson(`/api/channels/${channelId}/participants/${agentId}`, await token(), {
        method: 'DELETE',
      }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: queryKey('participants', channelId) });
    },
  });
  const bots = (participants.data ?? []).filter((row) => row.principalType === 'bot');
  const present = new Set(bots.map((row) => row.principalId));
  const available = (agents.data ?? []).filter((agent) => !present.has(agent.id));

  return (
    <section className="grid gap-2" data-testid="channel-roster">
      <h3 className="text-xs font-medium tracking-wide text-muted-foreground uppercase">Bots</h3>
      <ul className="flex flex-col gap-1">
        {bots.map((bot) => (
          <li key={bot.principalId} className="flex items-center justify-between gap-2 text-sm">
            <span className="truncate">@{bot.principalId}</span>
            <Button size="sm" variant="ghost" onClick={() => remove.mutate(bot.principalId)}>
              Remove
            </Button>
          </li>
        ))}
      </ul>
      {available.length > 0 ? (
        <label className="flex flex-col gap-1 text-sm">
          Add bot
          <select
            aria-label="Add bot"
            className="h-9 rounded-md border border-input bg-background px-3 text-sm"
            defaultValue=""
            onChange={(event) => {
              const agentId = event.target.value;
              if (agentId) {
                add.mutate(agentId);
                event.target.value = '';
              }
            }}
          >
            <option value="">Choose a coworker</option>
            {available.map((agent) => (
              <option key={agent.id} value={agent.id}>
                {agent.title || agent.name}
              </option>
            ))}
          </select>
        </label>
      ) : null}
    </section>
  );
}
