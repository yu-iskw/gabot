import { useQuery } from '@tanstack/react-query';

import { apiJson } from '../api.js';
import { PageEmpty, PageSection, PageShell } from '../components/layout/page-shell.js';
import { useAuth } from '../lib/auth-context.js';

type Computer = { id: string; name: string };

export function AdminComputersPage() {
  const { token } = useAuth();
  const computers = useQuery({
    queryKey: ['computers'],
    queryFn: async () => {
      const body = await apiJson<{ computers: Computer[] }>('/api/computers', await token());
      return body.computers;
    },
  });

  return (
    <PageShell
      backButton={{ label: 'Admin', to: '/admin' }}
      title="Computers"
      description="The machines Bots run their tools on."
    >
      <PageSection title="Fleet">
        {(computers.data ?? []).length === 0 ? (
          <PageEmpty>No computers are registered.</PageEmpty>
        ) : (
          <div className="mt-4 flex flex-col gap-3">
            {(computers.data ?? []).map((computer) => (
              <div key={computer.id} className="rounded-xl border border-border bg-card p-4">
                <p className="text-sm font-medium">{computer.name}</p>
                <p className="text-sm text-muted-foreground">{computer.id} · Playwright computer</p>
              </div>
            ))}
          </div>
        )}
        <PageEmpty>Live screen follows a navigate from a channel.</PageEmpty>
      </PageSection>
    </PageShell>
  );
}
