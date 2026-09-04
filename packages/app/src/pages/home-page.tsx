import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from '@tanstack/react-router';

import { apiJson, readTurnStream } from '../api.js';
import { AgentCard } from '../components/agents/agent-card.js';
import { Composer } from '../components/channels/composer.js';
import { SidebarToggleBar } from '../components/layout/sidebar-toggle.js';
import { useAuth } from '../lib/auth-context.js';

import type { Coworker } from '../lib/agents.js';

export function HomePage() {
  const { token } = useAuth();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const agents = useQuery({
    queryKey: ['agents'],
    queryFn: async () => {
      const body = await apiJson<{ agents: Coworker[] }>('/api/agents', await token());
      return body.agents;
    },
  });
  const openAgent = useMutation({
    mutationFn: async (agent: Coworker) => {
      const created = await apiJson<{ channel: { id: string } }>('/api/channels', await token(), {
        method: 'POST',
        body: JSON.stringify({ name: agent.title || agent.name, agentId: agent.id }),
      });
      return created.channel.id;
    },
    onSuccess: async (channelId) => {
      await queryClient.invalidateQueries({ queryKey: ['channels'] });
      await navigate({ to: '/channel/$channelId', params: { channelId } });
    },
  });
  const start = useMutation({
    mutationFn: async (message: string) => {
      const created = await apiJson<{ channel: { id: string } }>('/api/channels', await token(), {
        method: 'POST',
        body: JSON.stringify({ name: channelNameFrom(message) }),
      });
      await readTurnStream(`/api/channels/${created.channel.id}/turns`, await token(), message);
      return created.channel.id;
    },
    onSuccess: async (channelId) => {
      await queryClient.invalidateQueries({ queryKey: ['channels'] });
      await navigate({ to: '/channel/$channelId', params: { channelId } });
    },
  });

  return (
    <>
      <SidebarToggleBar />
      <div className="mt-8 flex w-full flex-1 flex-col items-center p-4">
        <div className="flex flex-col items-center">
          <h2 className="text-center text-sm font-medium tracking-tight text-muted-foreground uppercase">
            gabot
          </h2>
          <h1 className="mt-1.5 text-center text-2xl font-bold tracking-tight">
            Start a new channel
          </h1>
        </div>
        <div className="mt-8 flex w-full max-w-2xl flex-col items-center">
          <Composer
            className="w-full"
            pending={start.isPending}
            placeholder="Ask anything"
            submitLabel="Start"
            onSubmit={(message) => start.mutate(message)}
          />
          <p className="mt-2 w-full text-center text-xs text-muted-foreground">
            Sent to the coworker it is for. Type <code>@</code> to choose one yourself.
          </p>
        </div>
        <div className="mt-10 w-full max-w-2xl">
          <h2 className="text-lg font-bold">Explore agents</h2>
          <div className="mt-4 flex flex-row flex-wrap gap-4">
            {(agents.data ?? []).map((agent) => (
              <AgentCard
                key={agent.id}
                name={agent.title || agent.name}
                roleDescription={agent.roleDescription}
                onClick={() => openAgent.mutate(agent)}
              />
            ))}
          </div>
        </div>
      </div>
    </>
  );
}

function channelNameFrom(message: string): string {
  const words = message.trim().split(/\s+/).slice(0, 6).join(' ');
  return words.length > 0 ? words : 'New channel';
}
