import { PageEmpty, PageSection, PageShell } from '../components/layout/page-shell.js';
import { useWorkspaceHref } from '../lib/workspace-href.js';

export function AdminIdentityPage() {
  const adminHome = useWorkspaceHref('/admin');
  return (
    <PageShell
      backButton={{ label: 'Admin', to: adminHome }}
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
