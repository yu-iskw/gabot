import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { apiJson } from '../api.js';
import { PageEmpty, PageRows, PageSection, PageShell } from '../components/layout/page-shell.js';
import { Button } from '../components/ui/button.js';
import { Separator } from '../components/ui/separator.js';
import { useAuth } from '../lib/auth-context.js';
import { useSession } from '../lib/session-context.js';

type Routine = {
  id: string;
  instruction: string;
  cron: string;
  enabled: boolean;
  timezone: string;
};

export function RoutinesPage() {
  const { token } = useAuth();
  const { queryKey } = useSession();
  const queryClient = useQueryClient();
  const routines = useQuery({
    queryKey: queryKey('routines'),
    queryFn: async () => {
      const body = await apiJson<{ routines: Routine[] }>('/api/routines', await token());
      return body.routines;
    },
  });
  const toggle = useMutation({
    mutationFn: async (input: { id: string; enabled: boolean }) =>
      apiJson(`/api/routines/${input.id}/enabled`, await token(), {
        method: 'PUT',
        body: JSON.stringify({ enabled: input.enabled }),
      }),
    onSuccess: async () => queryClient.invalidateQueries({ queryKey: queryKey('routines') }),
  });
  const remove = useMutation({
    mutationFn: async (id: string) =>
      apiJson(`/api/routines/${id}`, await token(), { method: 'DELETE' }),
    onSuccess: async () => queryClient.invalidateQueries({ queryKey: queryKey('routines') }),
  });

  return (
    <PageShell
      title="Routines"
      description="Scheduled work a bot created in conversation. Pause or delete here; ask a coworker in a channel to change the instruction or schedule."
    >
      <PageSection title="Scheduled">
        {(routines.data ?? []).length === 0 ? (
          <PageEmpty>Ask a coworker to schedule a task in a channel.</PageEmpty>
        ) : (
          <PageRows>
            {(routines.data ?? []).map((routine, index) => (
              <div key={routine.id}>
                {index > 0 ? <Separator /> : null}
                <div className="flex items-start justify-between gap-3 px-4 py-3">
                  <div>
                    <p className="text-sm font-medium">{routine.instruction}</p>
                    <p className="text-xs text-muted-foreground">
                      {routine.cron} · {routine.timezone}
                      {routine.enabled ? '' : ' · paused'}
                    </p>
                  </div>
                  <div className="flex gap-2">
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => toggle.mutate({ id: routine.id, enabled: !routine.enabled })}
                    >
                      {routine.enabled ? 'Pause' : 'Enable'}
                    </Button>
                    <Button size="sm" variant="ghost" onClick={() => remove.mutate(routine.id)}>
                      Delete
                    </Button>
                  </div>
                </div>
              </div>
            ))}
          </PageRows>
        )}
      </PageSection>
    </PageShell>
  );
}
