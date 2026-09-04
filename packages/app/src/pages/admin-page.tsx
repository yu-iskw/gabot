import {
  IconBuildingBank,
  IconDeviceDesktop,
  IconFileText,
  IconKey,
  IconListDetails,
  IconPuzzle,
  IconShieldCheck,
  IconUsers,
} from '@tabler/icons-react';

import { ItemRow, PageRows, PageSection, PageShell } from '../components/layout/page-shell.js';
import { Separator } from '../components/ui/separator.js';

import type { ReactNode } from 'react';

const REACH = [
  {
    to: '/admin/credentials',
    title: 'Credentials',
    description: 'Keys and tokens held for this deployment.',
    icon: <IconKey className="size-4" />,
  },
  {
    to: '/admin/boundaries',
    title: 'Boundaries',
    description: 'Rules that decide what a Bot may never do.',
    icon: <IconShieldCheck className="size-4" />,
  },
  {
    to: '/admin/computers',
    title: 'Computers',
    description: 'The machines Bots run their tools on.',
    icon: <IconDeviceDesktop className="size-4" />,
  },
] as const;

const CAN_DO = [
  {
    to: '/admin/plugins',
    title: 'Plugins',
    description: 'The services this deployment can reach, and which Bots may.',
    icon: <IconPuzzle className="size-4" />,
  },
  {
    to: '/skills',
    title: 'Skills',
    description: 'Named instructions anybody can invoke with a slash.',
    icon: <IconFileText className="size-4" />,
  },
] as const;

const WHO = [
  {
    to: '/admin/people',
    title: 'People',
    description: 'Everybody who has signed in, and who administers this deployment.',
    icon: <IconUsers className="size-4" />,
  },
  {
    to: '/admin/identity-providers',
    title: 'Identity providers',
    description: 'Identity Platform for this deployment, including the local emulator.',
    icon: <IconBuildingBank className="size-4" />,
  },
] as const;

export function AdminPage() {
  return (
    <PageShell
      title="Admin"
      description="Settings that apply to everybody in this deployment. Anything here affects every person and every Bot."
    >
      <PageSection
        title="What Bots can reach"
        description="Everything a Bot can touch outside this app, and the limits on it."
      >
        <LinkRows items={REACH} />
      </PageSection>
      <PageSection title="What Bots can do" description="Capabilities available across Bots.">
        <LinkRows items={CAN_DO} />
      </PageSection>
      <PageSection title="Who can get in">
        <LinkRows items={WHO} />
      </PageSection>
      <PageSection title="What happened">
        <PageRows>
          <ItemRow
            to="/admin/audit"
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
      {items.map((item, index) => (
        <div key={item.to}>
          {index > 0 ? <Separator /> : null}
          <ItemRow
            to={item.to}
            title={item.title}
            description={item.description}
            icon={item.icon}
          />
        </div>
      ))}
    </PageRows>
  );
}
