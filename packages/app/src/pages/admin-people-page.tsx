import { useQuery } from '@tanstack/react-query';

import { apiJson } from '../api.js';
import { PageEmpty, PageRows, PageSection, PageShell } from '../components/layout/page-shell.js';
import { Separator } from '../components/ui/separator.js';
import { useAuth } from '../lib/auth-context.js';

type Person = { id: string; email: string; name: string; isAdmin: boolean };

export function AdminPeoplePage() {
  const { token } = useAuth();
  const people = useQuery({
    queryKey: ['people'],
    queryFn: async () => {
      const body = await apiJson<{ people: Person[] }>('/api/admin/people', await token());
      return body.people;
    },
  });

  return (
    <PageShell
      backButton={{ label: 'Admin', to: '/admin' }}
      title="People"
      description="Everybody who has signed in through Identity Platform."
    >
      <PageSection title="Signed in">
        {(people.data ?? []).length === 0 ? (
          <PageEmpty>Nobody has signed in yet.</PageEmpty>
        ) : (
          <PageRows>
            {(people.data ?? []).map((person, index) => (
              <div key={person.id}>
                {index > 0 ? <Separator /> : null}
                <div className="px-4 py-3">
                  <p className="text-sm font-medium">{person.name || person.email}</p>
                  <p className="text-sm text-muted-foreground">
                    {person.email}
                    {person.isAdmin ? ' · admin' : ''}
                  </p>
                </div>
              </div>
            ))}
          </PageRows>
        )}
      </PageSection>
    </PageShell>
  );
}
