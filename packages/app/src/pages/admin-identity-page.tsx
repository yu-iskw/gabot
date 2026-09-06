import { PageEmpty, PageSection, PageShell } from '../components/layout/page-shell.js';

export function AdminIdentityPage() {
  return (
    <PageShell
      backButton={{ label: 'Admin', to: '/admin' }}
      title="Identity providers"
      description="A company's own provider is Identity Platform, not a second auth product."
    >
      <PageSection title="This deployment">
        <PageEmpty>
          No identity providers are registered beyond Identity Platform, which is this
          deployment&apos;s sign-in.
        </PageEmpty>
      </PageSection>
    </PageShell>
  );
}
