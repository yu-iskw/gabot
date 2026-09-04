import { useQuery } from '@tanstack/react-query';

import { apiJson } from '../api.js';
import { PageEmpty, PageShell } from '../components/layout/page-shell.js';
import { readAuditPayload } from '../lib/audit-payload.js';
import { useAuth } from '../lib/auth-context.js';

type AuditEvent = { eventType: string; payload: unknown };

export function AdminAuditPage() {
  const { token } = useAuth();
  const audit = useQuery({
    queryKey: ['audit', 'admin'],
    queryFn: async () => {
      const body = await apiJson<{ events: AuditEvent[] }>(
        '/api/admin/audit-events?limit=50',
        await token(),
      );
      return body.events;
    },
  });

  return (
    <PageShell
      width="wide"
      backButton={{ label: 'Admin', to: '/admin' }}
      title="Audit"
      description="What Bots did, in order."
    >
      {(audit.data ?? []).length === 0 ? (
        <PageEmpty>Nothing has been recorded yet.</PageEmpty>
      ) : (
        <ul className="mt-8 divide-y divide-border rounded-lg border border-border bg-card">
          {(audit.data ?? []).map((event, index) => (
            <li key={`${event.eventType}-${String(index)}`} className="px-4 py-3 text-sm">
              <span className="font-medium">{event.eventType}</span>{' '}
              <span className="text-muted-foreground">
                {JSON.stringify(readAuditPayload(event.payload))}
              </span>
            </li>
          ))}
        </ul>
      )}
    </PageShell>
  );
}
