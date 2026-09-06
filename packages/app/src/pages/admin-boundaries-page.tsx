import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';

import { apiJson } from '../api.js';
import { PageSection, PageShell } from '../components/layout/page-shell.js';
import { Button } from '../components/ui/button.js';
import { Textarea } from '../components/ui/textarea.js';
import { useAuth } from '../lib/auth-context.js';

type Policy = { mode: string; deny: string[]; allow: string[] };

export function AdminBoundariesPage() {
  const { token } = useAuth();
  const queryClient = useQueryClient();
  const [denyText, setDenyText] = useState<string | null>(null);
  const policy = useQuery({
    queryKey: ['policy'],
    queryFn: async () => {
      const body = await apiJson<{ policy: Policy }>('/api/admin/action-policy', await token());
      return body.policy;
    },
  });
  const save = useMutation({
    mutationFn: async (next: Policy) =>
      apiJson('/api/admin/action-policy', await token(), {
        method: 'PUT',
        body: JSON.stringify(next),
      }),
    onSuccess: async () => queryClient.invalidateQueries({ queryKey: ['policy'] }),
  });
  const current = policy.data;
  const deny = denyText ?? current?.deny.join('\n') ?? '';

  return (
    <PageShell
      backButton={{ label: 'Admin', to: '/admin' }}
      title="Boundaries"
      description="CEL expressions that refuse tool actions. One rule per line."
    >
      <PageSection title="Deny">
        <Textarea
          className="mt-4 font-mono"
          value={deny}
          onChange={(event) => setDenyText(event.target.value)}
        />
        <div className="mt-3 flex justify-end">
          <Button
            disabled={!current}
            onClick={() => {
              if (!current) {
                return;
              }
              save.mutate({
                mode: current.mode,
                allow: current.allow,
                deny: deny
                  .split('\n')
                  .map((line) => line.trim())
                  .filter((line) => line.length > 0),
              });
            }}
          >
            Save policy
          </Button>
        </div>
      </PageSection>
    </PageShell>
  );
}
