import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from '@tanstack/react-router';
import { useState } from 'react';

import { apiJson } from '../../api.js';
import { useAuth } from '../../lib/auth-context.js';
import { ChannelAvatar } from '../channels/channel-avatar.js';
import { Button } from '../ui/button.js';
import { Input } from '../ui/input.js';
import { Textarea } from '../ui/textarea.js';

import type { Coworker } from '../../lib/agents.js';

const PROTECTED_AGENT_ID = 'general-assistant';

export function AgentProfile({ agentId, onDeleted }: { agentId: string; onDeleted?: () => void }) {
  const { token } = useAuth();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [editing, setEditing] = useState(false);
  const agent = useQuery({
    queryKey: ['agent', agentId],
    queryFn: async () => {
      const body = await apiJson<{ agent: Coworker }>(`/api/agents/${agentId}`, await token());
      return body.agent;
    },
  });
  const start = useMutation({
    mutationFn: async (coworker: Coworker) => {
      const created = await apiJson<{ channel: { id: string } }>('/api/channels', await token(), {
        method: 'POST',
        body: JSON.stringify({ name: coworker.title || coworker.name, agentId: coworker.id }),
      });
      return created.channel.id;
    },
    onSuccess: async (channelId) => {
      await queryClient.invalidateQueries({ queryKey: ['channels'] });
      await navigate({ to: '/channel/$channelId', params: { channelId } });
    },
  });
  const save = useMutation({
    mutationFn: async (input: {
      name: string;
      title: string;
      roleDescription: string;
      visibility: string;
    }) =>
      apiJson<{ agent: Coworker }>(`/api/agents/${agentId}`, await token(), {
        method: 'PATCH',
        body: JSON.stringify(input),
      }),
    onSuccess: async () => {
      setEditing(false);
      await queryClient.invalidateQueries({ queryKey: ['agents'] });
      await queryClient.invalidateQueries({ queryKey: ['agent', agentId] });
    },
  });
  const remove = useMutation({
    mutationFn: async () => apiJson(`/api/agents/${agentId}`, await token(), { method: 'DELETE' }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['agents'] });
      onDeleted?.();
    },
  });

  if (agent.isPending) {
    return <p className="p-8 text-sm text-muted-foreground">Loading this coworker…</p>;
  }
  if (!agent.data) {
    return (
      <p className="p-8 text-sm text-destructive" role="alert">
        Could not load this coworker.
      </p>
    );
  }

  const profile = agent.data;
  const visibility = profile.visibility === 'private' ? 'Private' : 'Public';
  const canDelete = profile.id !== PROTECTED_AGENT_ID;

  if (editing) {
    return (
      <EditAgentForm
        agent={profile}
        busy={save.isPending}
        onCancel={() => setEditing(false)}
        onSave={(input) => save.mutate(input)}
      />
    );
  }

  return (
    <div className="flex w-full flex-col gap-6 p-8" data-testid="agent-profile">
      <header className="flex flex-col items-center gap-3 text-center">
        <ChannelAvatar name={profile.title || profile.name} size={80} />
        <div className="flex w-full flex-col items-center gap-0.5">
          <h2 className="w-full text-2xl font-semibold tracking-tight">
            {profile.title || profile.name}
          </h2>
          <p className="w-full text-sm text-muted-foreground">{profile.name}</p>
        </div>
        <span className="inline-flex items-center rounded-full border border-border bg-muted/40 px-2 py-0.5 text-xs text-muted-foreground">
          {visibility}
        </span>
      </header>
      <section className="grid gap-2">
        <h3 className="text-xs font-medium tracking-wide text-muted-foreground uppercase">Role</h3>
        <p className="text-sm text-pretty whitespace-pre-wrap">{profile.roleDescription}</p>
      </section>
      <div className="flex flex-col gap-2">
        <Button className="w-full" disabled={start.isPending} onClick={() => start.mutate(profile)}>
          Start new channel
        </Button>
        <Button
          className="w-full"
          data-testid="edit-agent"
          variant="outline"
          onClick={() => setEditing(true)}
        >
          Edit
        </Button>
        {canDelete ? (
          <Button
            className="w-full"
            data-testid="delete-agent"
            disabled={remove.isPending}
            variant="ghost"
            onClick={() => remove.mutate()}
          >
            Delete
          </Button>
        ) : null}
      </div>
    </div>
  );
}

function EditAgentForm({
  agent,
  busy,
  onCancel,
  onSave,
}: {
  agent: Coworker;
  busy: boolean;
  onCancel: () => void;
  onSave: (input: {
    name: string;
    title: string;
    roleDescription: string;
    visibility: string;
  }) => void;
}) {
  const [name, setName] = useState(agent.name);
  const [title, setTitle] = useState(agent.title);
  const [roleDescription, setRoleDescription] = useState(agent.roleDescription);
  const [visibility, setVisibility] = useState(agent.visibility || 'public');

  return (
    <form
      className="flex w-full flex-col gap-3 p-8"
      data-testid="edit-agent-form"
      onSubmit={(event) => {
        event.preventDefault();
        onSave({ name, title: title || name, roleDescription, visibility });
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
      <label className="flex flex-col gap-1 text-sm">
        Visibility
        <select
          className="h-9 rounded-md border border-input bg-background px-3 text-sm"
          name="agent-visibility"
          value={visibility}
          onChange={(event) => setVisibility(event.target.value)}
        >
          <option value="public">Public</option>
          <option value="private">Private</option>
        </select>
      </label>
      <div className="flex gap-2">
        <Button disabled={busy} type="submit">
          Save
        </Button>
        <Button type="button" variant="ghost" onClick={onCancel}>
          Cancel
        </Button>
      </div>
    </form>
  );
}
