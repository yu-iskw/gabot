import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';

import { apiJson } from '../../api.js';
import { useAuth } from '../../lib/auth-context.js';
import { useSession } from '../../lib/session-context.js';
import { Button } from '../ui/button.js';
import { Input } from '../ui/input.js';

type PolicyRow = { capability: string; resource: string };

const DEFAULT_POLICY_CAPABILITY = 'github.issues.create';

export function ChannelPolicies({ channelId }: { channelId: string }) {
  const { token } = useAuth();
  const { queryKey } = useSession();
  const queryClient = useQueryClient();
  const [capability, setCapability] = useState(DEFAULT_POLICY_CAPABILITY);
  const [resource, setResource] = useState('');
  const policies = useQuery({
    queryKey: queryKey('channel-policies', channelId),
    queryFn: async () => {
      const body = await apiJson<{ policies: PolicyRow[] }>(
        `/api/channels/${channelId}/policies`,
        await token(),
      );
      return body.policies;
    },
  });
  const save = useMutation({
    mutationFn: async (next: PolicyRow[]) =>
      apiJson(`/api/channels/${channelId}/policies`, await token(), {
        method: 'PUT',
        body: JSON.stringify({ policies: next }),
      }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: queryKey('channel-policies', channelId) });
      setResource('');
    },
  });
  const rows = policies.data ?? [];

  return (
    <section className="grid gap-2" data-testid="channel-policies">
      <h3 className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
        Channel policy
      </h3>
      <p className="text-xs text-muted-foreground">
        Empty inherits the workspace grant. A list becomes an exact allow-list for that capability.
      </p>
      <ul className="flex flex-col gap-1 text-sm">
        {rows.map((row) => (
          <li
            key={`${row.capability}:${row.resource}`}
            className="flex items-center justify-between gap-2"
          >
            <span className="truncate font-mono text-xs">
              {row.capability} {row.resource}
            </span>
            <Button
              size="sm"
              variant="ghost"
              onClick={() => save.mutate(rows.filter((item) => item !== row))}
            >
              Remove
            </Button>
          </li>
        ))}
      </ul>
      <form
        className="flex flex-col gap-2"
        onSubmit={(event) => {
          event.preventDefault();
          if (!resource.trim()) {
            return;
          }
          save.mutate([...rows, { capability, resource: resource.trim() }]);
        }}
      >
        <Input
          aria-label="Capability"
          value={capability}
          onChange={(event) => setCapability(event.target.value)}
        />
        <Input
          aria-label="Resource"
          placeholder="acme/allowed"
          value={resource}
          onChange={(event) => setResource(event.target.value)}
        />
        <Button disabled={save.isPending} size="sm" type="submit">
          Add allow-list row
        </Button>
      </form>
    </section>
  );
}
