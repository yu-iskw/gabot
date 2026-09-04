import { PageEmpty, PageSection, PageShell } from '../components/layout/page-shell.js';

export function AdminCredentialsPage() {
  return (
    <PageShell
      backButton={{ label: 'Admin', to: '/admin' }}
      title="Credentials"
      description="Keys and tokens held for this deployment."
    >
      <PageSection title="Catalogue">
        <PageEmpty>No credentials are configured.</PageEmpty>
      </PageSection>
    </PageShell>
  );
}
