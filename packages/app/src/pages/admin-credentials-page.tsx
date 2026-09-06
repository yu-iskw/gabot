import { useQuery } from '@tanstack/react-query';

import { apiJson } from '../api.js';
import {
  FactRow,
  PageEmpty,
  PageRows,
  PageSection,
  PageShell,
} from '../components/layout/page-shell.js';
import { Separator } from '../components/ui/separator.js';
import { useAuth } from '../lib/auth-context.js';
import { useSession } from '../lib/session-context.js';

type OwnerConnection = {
  credentialRef: string;
  id: string;
  provider: string;
  status: string;
};

export function AdminCredentialsPage() {
  const { token } = useAuth();
  const { queryKey } = useSession();
  const listed = useQuery({
    queryKey: queryKey('connections'),
    queryFn: async () => {
      const body = await apiJson<{ connections: OwnerConnection[] }>(
        '/api/admin/connections',
        await token(),
      );
      return body.connections;
    },
  });
  const connections = listed.data ?? [];

  return (
    <PageShell
      backButton={{ label: 'Admin', to: '/admin' }}
      title="Credentials"
      description="Owner connections. Bots never receive these refs."
    >
      <PageSection title="Connections" description="Opaque credential refs for this workspace.">
        {listed.isPending ? null : connections.length === 0 ? (
          <PageEmpty>No connections are configured.</PageEmpty>
        ) : (
          <PageRows>
            {connections.map((connection, index) => (
              <div key={connection.id}>
                {index > 0 ? <Separator /> : null}
                <FactRow
                  title={connection.provider}
                  description={`${connection.status} · ${connection.credentialRef}`}
                />
              </div>
            ))}
          </PageRows>
        )}
      </PageSection>
    </PageShell>
  );
}
