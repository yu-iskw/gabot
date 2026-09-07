import {
  IconBuildingBank,
  IconFileText,
  IconKey,
  IconListDetails,
  IconPuzzle,
  IconShieldCheck,
  IconUsers,
} from '@tabler/icons-react';

import { ItemRow, PageRows, PageSection, PageShell } from '../components/layout/page-shell.js';
import { useWorkspaceDirectory } from '../lib/workspace-directory-context.js';

import type { ReactNode } from 'react';

export function AdminPage() {
  const { slug } = useWorkspaceDirectory();
  const base = `/workspaces/${slug}`;
  const reach = [
    {
      to: `${base}/admin/credentials`,
      title: 'Credentials',
      description: 'Keys and tokens held for this deployment.',
      icon: <IconKey className="size-4" />,
    },
    {
      to: `${base}/admin/boundaries`,
      title: 'Boundaries',
      description: 'Rules that decide what a Bot may never do.',
      icon: <IconShieldCheck className="size-4" />,
    },
  ] as const;
  const canDo = [
    {
      to: `${base}/admin/plugins`,
      title: 'Plugins',
      description: 'The services this deployment can reach, and which Bots may.',
      icon: <IconPuzzle className="size-4" />,
    },
    {
      to: `${base}/skills`,
      title: 'Skills',
      description: 'Named instructions anybody can invoke with a slash.',
      icon: <IconFileText className="size-4" />,
    },
  ] as const;
  const who = [
    {
      to: `${base}/admin/people`,
      title: 'People',
      description: 'Everybody who has signed in, and who administers this deployment.',
      icon: <IconUsers className="size-4" />,
    },
    {
      to: `${base}/admin/identity-providers`,
      title: 'Identity providers',
      description: 'Identity Platform for this deployment, including the local emulator.',
      icon: <IconBuildingBank className="size-4" />,
    },
  ] as const;

  return (
    <PageShell
      title="Admin"
      description="Settings that apply to everybody in this deployment. Anything here affects every person and every Bot."
    >
      <PageSection
        title="What Bots can reach"
        description="Everything a Bot can touch outside this app, and the limits on it."
      >
        <LinkRows items={reach} />
      </PageSection>
      <PageSection title="What Bots can do" description="Capabilities available across Bots.">
        <LinkRows items={canDo} />
      </PageSection>
      <PageSection title="Who can get in">
        <LinkRows items={who} />
      </PageSection>
      <PageSection title="What happened">
        <PageRows>
          <ItemRow
            to={`${base}/admin/audit`}
            title="Audit"
            description="Every action taken in this deployment, and by whom."
            icon={<IconListDetails className="size-4" />}
          />
        </PageRows>
      </PageSection>
    </PageShell>
  );
}

function LinkRows({
  items,
}: {
  items: ReadonlyArray<{
    description: string;
    icon: ReactNode;
    title: string;
    to: string;
  }>;
}) {
  return (
    <PageRows>
      {items.map((item) => (
        <ItemRow
          key={item.to}
          to={item.to}
          title={item.title}
          description={item.description}
          icon={item.icon}
        />
      ))}
    </PageRows>
  );
}
