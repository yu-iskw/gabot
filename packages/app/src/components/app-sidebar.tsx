import {
  IconBolt,
  IconBox,
  IconChevronDown,
  IconClock,
  IconLayoutSidebar,
  IconLogout,
  IconPlus,
  IconSearch,
  IconSettings,
  IconShieldLock,
} from '@tabler/icons-react';
import { useQuery } from '@tanstack/react-query';
import { Link, useNavigate } from '@tanstack/react-router';
import { signOut } from 'firebase/auth';
import { useState } from 'react';

import { apiJson } from '../api.js';
import { useAuth } from '../lib/auth-context.js';
import { matchingChannels } from '../lib/channel-search.js';
import { groupChannelsByProject } from '../lib/project-channels.js';
import { useSession } from '../lib/session-context.js';
import { sessionMembershipLabel } from '../lib/session-scope.js';
import { useSidebar } from '../lib/sidebar-context.js';
import { cn } from '../lib/utils.js';
import { useWorkspaceDirectory } from '../lib/workspace-directory-context.js';

import { ChannelAvatar } from './channels/channel-avatar.js';
import { Button } from './ui/button.js';
import { Input } from './ui/input.js';

import type { NamedProject } from '../lib/project-channels.js';
import type { ReactNode } from 'react';

type Channel = {
  id: string;
  lastMessage: string | null;
  name: string;
  projectId: string;
  publicId: string;
};

export function AppSidebar() {
  const { auth, selectWorkspace, token, user } = useAuth();
  const { me, queryKey } = useSession();
  const { directory, entry, slug } = useWorkspaceDirectory();
  const { open, toggle } = useSidebar();
  const navigate = useNavigate();
  const [search, setSearch] = useState('');
  const [switcherOpen, setSwitcherOpen] = useState(false);
  const channels = useQuery({
    queryKey: queryKey('channels'),
    queryFn: async () => {
      const body = await apiJson<{ channels: Channel[] }>('/api/channels', await token());
      return body.channels;
    },
  });
  const projects = useQuery({
    queryKey: queryKey('projects'),
    queryFn: async () => {
      const body = await apiJson<{ projects: NamedProject[] }>('/api/projects', await token());
      return body.projects;
    },
  });
  const visible = matchingChannels(channels.data, search);
  const groups = groupChannelsByProject(visible, projects.data ?? []);
  const searching = search.trim().length > 0;

  return (
    <aside
      className={cn(
        'flex h-svh shrink-0 flex-col border-r border-sidebar-border bg-sidebar text-sidebar-foreground',
        open ? 'w-[340px]' : 'w-14',
      )}
    >
      <div className="flex h-12 items-center gap-1.5 p-2">
        <div className="relative min-w-0 flex-1">
          <button
            type="button"
            data-testid="workspace-switcher"
            className="flex h-full w-full items-center gap-1 rounded-lg px-2 text-left text-sm font-semibold tracking-tighter hover:bg-sidebar-accent"
            onClick={() => setSwitcherOpen((current) => !current)}
          >
            <span className="truncate">{open ? entry.displayName : ''}</span>
            {open ? <IconChevronDown className="size-4 shrink-0 opacity-60" /> : null}
          </button>
          {switcherOpen && open ? (
            <div className="absolute top-full left-0 z-20 mt-1 w-full rounded-lg border border-sidebar-border bg-sidebar p-1 shadow-md">
              {directory.workspaces.map((workspace) => (
                <button
                  key={workspace.slug}
                  type="button"
                  data-testid={`workspace-option-${workspace.slug}`}
                  className={cn(
                    'block w-full rounded-md px-2 py-2 text-left text-sm hover:bg-sidebar-accent',
                    workspace.slug === slug ? 'font-semibold' : '',
                  )}
                  onClick={() => {
                    setSwitcherOpen(false);
                    if (workspace.slug === slug) {
                      return;
                    }
                    void (async () => {
                      await selectWorkspace(workspace.slug);
                      await navigate({ to: '/sign' });
                    })();
                  }}
                >
                  {workspace.displayName}
                </button>
              ))}
            </div>
          ) : null}
        </div>
        <Button size="icon" variant="ghost" aria-label="Toggle sidebar" onClick={toggle}>
          <IconLayoutSidebar className="size-4" />
        </Button>
        {open ? (
          <Link
            to="/workspaces/$workspaceSlug/channels/new"
            params={{ workspaceSlug: slug }}
            aria-label="New channel"
            className="flex size-8 items-center justify-center rounded-lg hover:bg-muted"
          >
            <IconPlus className="size-4" />
          </Link>
        ) : null}
      </div>
      {open ? (
        <div className="flex min-h-0 flex-1 flex-col px-2 pb-3">
          <p className="mb-2 px-2 text-[11px] tracking-tight text-muted-foreground">gabot</p>
          <div className="relative mb-2">
            <IconSearch className="pointer-events-none absolute top-1/2 left-2 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              aria-label="Search channels"
              className="h-9 bg-background pl-8"
              placeholder="Search..."
              value={search}
              onChange={(event) => setSearch(event.target.value)}
            />
          </div>
          <nav className="min-h-0 flex-1 overflow-y-auto">
            {searching && visible.length === 0 ? (
              <p className="px-2 py-4 text-sm text-muted-foreground">
                No channels match your search
              </p>
            ) : null}
            {groups.map((group) => (
              <div key={group.project.id} className="mb-3">
                <p className="px-2 py-1 text-[11px] font-medium tracking-wide text-muted-foreground uppercase">
                  {group.project.name}
                </p>
                {group.channels.map((channel) => (
                  <Link
                    key={channel.id}
                    to="/workspaces/$workspaceSlug/channels/$channelPublicId"
                    params={{ workspaceSlug: slug, channelPublicId: channel.publicId }}
                    search={{}}
                    data-testid={channel.id === me.defaultChannelId ? 'channel-general' : undefined}
                    className="flex items-center gap-2 rounded-lg px-2 py-2 hover:bg-sidebar-accent"
                  >
                    <ChannelAvatar name={channel.name} size={32} />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-medium">{channel.name}</span>
                      <span className="block truncate text-xs text-muted-foreground">
                        {channel.lastMessage ?? 'No messages yet'}
                      </span>
                    </span>
                  </Link>
                ))}
              </div>
            ))}
          </nav>
          <div className="mt-auto flex flex-col gap-px border-t border-sidebar-border pt-2">
            <SidebarLink
              workspaceSlug={slug}
              to="/workspaces/$workspaceSlug/skills"
              icon={<IconBox className="size-4" />}
              label="Skills"
            />
            <SidebarLink
              workspaceSlug={slug}
              to="/workspaces/$workspaceSlug/agents"
              icon={<IconBolt className="size-4" />}
              label="Agents"
            />
            <SidebarLink
              workspaceSlug={slug}
              to="/workspaces/$workspaceSlug/routines"
              icon={<IconClock className="size-4" />}
              label="Routines"
            />
            <SidebarLink
              workspaceSlug={slug}
              to="/workspaces/$workspaceSlug/admin"
              icon={<IconShieldLock className="size-4" />}
              label="Admin"
            />
            <SidebarLink
              workspaceSlug={slug}
              to="/workspaces/$workspaceSlug/settings"
              icon={<IconSettings className="size-4" />}
              label="Settings"
            />
            <div className="flex items-center justify-between px-2 py-2">
              <span className="min-w-0">
                <span className="block truncate text-xs" data-testid="user-email">
                  {user?.email}
                </span>
                <span
                  className="block truncate text-[11px] text-muted-foreground"
                  data-testid="workspace-session"
                >
                  {sessionMembershipLabel(me)}
                </span>
              </span>
              <Button
                variant="ghost"
                size="icon"
                aria-label="Sign out"
                onClick={() => {
                  if (auth) {
                    void signOut(auth);
                  }
                }}
              >
                <IconLogout className="size-4" />
              </Button>
            </div>
          </div>
        </div>
      ) : null}
    </aside>
  );
}

function SidebarLink({
  icon,
  label,
  to,
  workspaceSlug,
}: {
  icon: ReactNode;
  label: string;
  to:
    | '/workspaces/$workspaceSlug/skills'
    | '/workspaces/$workspaceSlug/agents'
    | '/workspaces/$workspaceSlug/routines'
    | '/workspaces/$workspaceSlug/admin'
    | '/workspaces/$workspaceSlug/settings';
  workspaceSlug: string;
}) {
  return (
    <Link
      to={to}
      params={{ workspaceSlug }}
      className="flex h-10 items-center gap-2 rounded-lg px-2 text-sm hover:bg-sidebar-accent"
    >
      <span className="flex size-[28px] items-center justify-center">{icon}</span>
      {label}
    </Link>
  );
}
