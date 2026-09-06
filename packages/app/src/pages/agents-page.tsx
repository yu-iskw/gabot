import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useRef, useState } from 'react';

import { apiJson } from '../api.js';
import { AgentCard } from '../components/agents/agent-card.js';
import { AgentProfile } from '../components/agents/agent-profile.js';
import { PageEmpty, PageSection, PageShell } from '../components/layout/page-shell.js';
import { Button } from '../components/ui/button.js';
import { Input } from '../components/ui/input.js';
import { Textarea } from '../components/ui/textarea.js';
import { useAuth } from '../lib/auth-context.js';
import { useSession } from '../lib/session-context.js';

import type { Coworker } from '../lib/agents.js';

export function AgentsPage() {
  const { token } = useAuth();
  const { queryKey } = useSession();
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const profileRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (selectedId) {
      profileRef.current?.scrollIntoView({ block: 'start' });
    }
  }, [selectedId]);
  const agents = useQuery({
    queryKey: queryKey('agents'),
    queryFn: async () => {
      const body = await apiJson<{ agents: Coworker[] }>('/api/agents', await token());
      return body.agents;
    },
  });
  const create = useMutation({
    mutationFn: async (input: { name: string; title: string; roleDescription: string }) =>
      apiJson<{ agent: Coworker }>('/api/agents', await token(), {
        method: 'POST',
        body: JSON.stringify(input),
      }),
    onSuccess: async (body) => {
      setOpen(false);
      setSelectedId(body.agent.id);
      await queryClient.invalidateQueries({ queryKey: queryKey('agents') });
    },
  });

  return (
    <PageShell
      title="Agents"
      description="Coworkers you can talk to, including ones a bot created."
      action={
        <Button onClick={() => setOpen(true)} data-testid="new-agent" variant="ghost" size="sm">
          New agent
        </Button>
      }
    >
      {open ? <CreateAgentForm onCreate={(input) => create.mutate(input)} /> : null}
      <PageSection title="Your agents">
        {(agents.data ?? []).length === 0 ? (
          <PageEmpty>No agents yet.</PageEmpty>
        ) : (
          <div className="mt-4 grid grid-cols-[repeat(auto-fill,144px)] gap-4">
            {(agents.data ?? []).map((agent) => (
              <AgentCard
                key={agent.id}
                name={agent.title || agent.name}
                roleDescription={agent.roleDescription}
                selected={selectedId === agent.id}
                testId={`agent-card-${agent.id}`}
                onClick={() => setSelectedId(agent.id)}
              />
            ))}
          </div>
        )}
      </PageSection>
      {selectedId ? (
        <div ref={profileRef} className="mt-8 rounded-xl border border-border bg-card">
          <AgentProfile agentId={selectedId} onDeleted={() => setSelectedId(null)} />
        </div>
      ) : null}
    </PageShell>
  );
}

function CreateAgentForm({
  onCreate,
}: {
  onCreate: (input: { name: string; title: string; roleDescription: string }) => void;
}) {
  const [name, setName] = useState('');
  const [title, setTitle] = useState('');
  const [roleDescription, setRoleDescription] = useState('');
  return (
    <form
      className="mt-8 flex flex-col gap-3 rounded-xl border border-border bg-card p-4"
      onSubmit={(event) => {
        event.preventDefault();
        onCreate({ name, title: title || name, roleDescription });
      }}
    >
      <Input
        name="agent-name"
        placeholder="Name"
        value={name}
        onChange={(event) => setName(event.target.value)}
      />
      <Input
        name="agent-title"
        placeholder="Title"
        value={title}
        onChange={(event) => setTitle(event.target.value)}
      />
      <Textarea
        name="agent-role"
        placeholder="Standing role"
        value={roleDescription}
        onChange={(event) => setRoleDescription(event.target.value)}
      />
      <Button type="submit">Create agent</Button>
    </form>
  );
}
