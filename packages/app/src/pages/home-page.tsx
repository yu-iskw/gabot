import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from '@tanstack/react-router';
import { useState } from 'react';

import { apiJson, readTurnStream } from '../api.js';
import { AgentCard } from '../components/agents/agent-card.js';
import { Composer } from '../components/channels/composer.js';
import { SidebarToggleBar } from '../components/layout/sidebar-toggle.js';
import { Input } from '../components/ui/input.js';
import { useAuth } from '../lib/auth-context.js';

import type { Coworker } from '../lib/agents.js';
import type { NamedProject } from '../lib/project-channels.js';
import type { QueryClient } from '@tanstack/react-query';

export function HomePage() {
  const { token } = useAuth();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [projectId, setProjectId] = useState('');
  const [newProjectName, setNewProjectName] = useState('');
  const [description, setDescription] = useState('');
  const agents = useQuery({
    queryKey: ['agents'],
    queryFn: async () => {
      const body = await apiJson<{ agents: Coworker[] }>('/api/agents', await token());
      return body.agents;
    },
  });
  const projects = useQuery({
    queryKey: ['projects'],
    queryFn: async () => {
      const body = await apiJson<{ projects: NamedProject[] }>('/api/projects', await token());
      return body.projects;
    },
  });
  const selectedProject = projectId || projects.data?.[0]?.id || '';

  const openAgent = useMutation({
    mutationFn: async (agent: Coworker) => {
      const created = await apiJson<{ channel: { id: string } }>('/api/channels', await token(), {
        method: 'POST',
        body: JSON.stringify({
          name: agent.title || agent.name,
          agentId: agent.id,
          projectId: selectedProject || undefined,
          description: description || undefined,
        }),
      });
      return created.channel.id;
    },
    onSuccess: async (channelId) => {
      await queryClient.invalidateQueries({ queryKey: ['channels'] });
      await navigate({ to: '/channel/$channelId', params: { channelId } });
    },
  });
  const start = useMutation({
    mutationFn: async (input: { botId: string | null; message: string }) => {
      const auth = await token();
      const targetProjectId = await resolveProjectId(
        auth,
        selectedProject,
        newProjectName,
        queryClient,
      );
      const created = await apiJson<{ channel: { id: string } }>('/api/channels', auth, {
        method: 'POST',
        body: JSON.stringify({
          name: channelNameFrom(input.message),
          agentId: input.botId || undefined,
          projectId: targetProjectId,
          description: description || undefined,
        }),
      });
      await readTurnStream(
        `/api/channels/${created.channel.id}/turns`,
        await token(),
        input.message,
        input.botId,
      );
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
          <div className="mb-3 grid w-full gap-2 sm:grid-cols-2">
            <label className="flex flex-col gap-1 text-sm">
              Project
              <select
                aria-label="Project"
                className="h-9 rounded-md border border-input bg-background px-3 text-sm"
                data-testid="project-select"
                value={selectedProject}
                onChange={(event) => setProjectId(event.target.value)}
              >
                {(projects.data ?? []).map((project) => (
                  <option key={project.id} value={project.id}>
                    {project.name}
                  </option>
                ))}
              </select>
            </label>
            <label className="flex flex-col gap-1 text-sm">
              New project
              <Input
                aria-label="New project name"
                placeholder="Optional name"
                value={newProjectName}
                onChange={(event) => setNewProjectName(event.target.value)}
              />
            </label>
            <label className="flex flex-col gap-1 text-sm sm:col-span-2">
              Description
              <Input
                aria-label="Channel description"
                placeholder="Optional"
                value={description}
                onChange={(event) => setDescription(event.target.value)}
              />
            </label>
          </div>
          <Composer
            className="w-full"
            pending={start.isPending}
            placeholder="Ask anything"
            submitLabel="Start"
            onSubmit={(input) => start.mutate(input)}
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

async function resolveProjectId(
  token: string,
  selectedProject: string,
  newProjectName: string,
  queryClient: QueryClient,
): Promise<string | undefined> {
  const name = newProjectName.trim();
  if (!name) {
    return selectedProject || undefined;
  }
  const created = await apiJson<{ project: { id: string } }>('/api/projects', token, {
    method: 'POST',
    body: JSON.stringify({ name }),
  });
  await queryClient.invalidateQueries({ queryKey: ['projects'] });
  return created.project.id;
}
