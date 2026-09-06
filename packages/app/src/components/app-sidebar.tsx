import {
  IconBolt,
  IconBox,
  IconClock,
  IconLayoutSidebar,
  IconLogout,
  IconPlus,
  IconSearch,
  IconSettings,
  IconShieldLock,
} from '@tabler/icons-react';
import { useQuery } from '@tanstack/react-query';
import { Link } from '@tanstack/react-router';
import { signOut } from 'firebase/auth';
import { useState } from 'react';

import { apiJson } from '../api.js';
import { useAuth } from '../lib/auth-context.js';
import { matchingChannels } from '../lib/channel-search.js';
import { groupChannelsByProject } from '../lib/project-channels.js';
import { useSession } from '../lib/session-context.js';
import { useSidebar } from '../lib/sidebar-context.js';
import { cn } from '../lib/utils.js';

import { ChannelAvatar } from './channels/channel-avatar.js';
import { Button } from './ui/button.js';
import { Input } from './ui/input.js';

import type { NamedProject } from '../lib/project-channels.js';
import type { ReactNode } from 'react';

type Channel = { id: string; lastMessage: string | null; name: string; projectId: string };

export function AppSidebar() {
  const { auth, token, user } = useAuth();
  const { me, queryKey } = useSession();
  const { open, toggle } = useSidebar();
  const [search, setSearch] = useState('');
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
        <Link
          to="/"
          className="flex h-full flex-1 items-center px-2 text-sm font-semibold tracking-tighter"
        >
          {open ? 'gabot' : ''}
        </Link>
        <Button size="icon" variant="ghost" aria-label="Toggle sidebar" onClick={toggle}>
          <IconLayoutSidebar className="size-4" />
        </Button>
        {open ? (
          <Link
            to="/channel/new"
            aria-label="New channel"
            className="flex size-8 items-center justify-center rounded-lg hover:bg-muted"
          >
            <IconPlus className="size-4" />
          </Link>
        ) : null}
      </div>
      {open ? (
        <div className="flex min-h-0 flex-1 flex-col px-2 pb-3">
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
                    to="/channel/$channelId"
                    params={{ channelId: channel.id }}
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
            <SidebarLink to="/skills" icon={<IconBox className="size-4" />} label="Skills" />
            <SidebarLink to="/agents" icon={<IconBolt className="size-4" />} label="Agents" />
            <SidebarLink to="/routines" icon={<IconClock className="size-4" />} label="Routines" />
            <SidebarLink to="/admin" icon={<IconShieldLock className="size-4" />} label="Admin" />
            <SidebarLink
              to="/settings"
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
                  {[me.workspaceId, me.role].filter(Boolean).join(' · ')}
                </span>
              </span>
              <Button
                variant="ghost"
                size="icon"
                aria-label="Sign out"
                onClick={() => void signOut(auth)}
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

function SidebarLink({ icon, label, to }: { icon: ReactNode; label: string; to: string }) {
  return (
    <Link
      to={to}
      className="flex h-10 items-center gap-2 rounded-lg px-2 text-sm hover:bg-sidebar-accent"
    >
      <span className="flex size-[28px] items-center justify-center">{icon}</span>
      {label}
    </Link>
  );
}
