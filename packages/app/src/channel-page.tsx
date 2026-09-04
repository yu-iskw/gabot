import { IconDeviceDesktop, IconSettings } from '@tabler/icons-react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';

import { apiJson, readTurnStream } from './api.js';
import { AgentProfile } from './components/agents/agent-profile.js';
import { ChannelAvatar } from './components/channels/channel-avatar.js';
import { Composer } from './components/channels/composer.js';
import { Transcript } from './components/channels/transcript.js';
import { ComputerPanel } from './components/computer/computer-panel.js';
import { DetailPanel } from './components/layout/detail-panel.js';
import { SidebarToggle } from './components/layout/sidebar-toggle.js';
import { Button } from './components/ui/button.js';
import { useAuth } from './lib/auth-context.js';

import type { ChannelPane } from './lib/channel-pane.js';
import type { ReactNode } from 'react';

const DEFAULT_BOT = 'general-assistant';

export function ChannelPage({
  channelId,
  onPane,
  pane,
}: {
  channelId: string;
  onPane: (next: ChannelPane | null) => void;
  pane: ChannelPane | null;
}) {
  const { token } = useAuth();
  const [reply, setReply] = useState('');
  const queryClient = useQueryClient();
  const channels = useQuery({
    queryKey: ['channels'],
    queryFn: async () => {
      const body = await apiJson<{ channels: Array<{ id: string; name: string }> }>(
        '/api/channels',
        await token(),
      );
      return body.channels;
    },
  });
  const channelName = channels.data?.find((row) => row.id === channelId)?.name ?? 'Channel';
  const messages = useQuery({
    queryKey: ['messages', channelId],
    queryFn: async () => {
      const body = await apiJson<{
        messages: Array<{ id: string; role: string; content: string }>;
      }>(`/api/channels/${channelId}/messages`, await token());
      return body.messages;
    },
  });
  const send = useMutation({
    mutationFn: async (message: string) =>
      readTurnStream(`/api/channels/${channelId}/turns`, await token(), message),
    onSuccess: async (text) => {
      setReply(text);
      await queryClient.invalidateQueries({ queryKey: ['messages'] });
      await queryClient.invalidateQueries({ queryKey: ['audit'] });
      await queryClient.invalidateQueries({ queryKey: ['channels'] });
      await queryClient.invalidateQueries({ queryKey: ['screenshot'] });
      await queryClient.invalidateQueries({ queryKey: ['agents'] });
      await queryClient.invalidateQueries({ queryKey: ['routines'] });
    },
  });

  return (
    <DetailPanel
      open={pane !== null}
      detail={paneDetail(pane, channelName)}
      onClose={() => onPane(null)}
    >
      <ChannelHeader name={channelName} pane={pane} onPane={onPane} />
      <Transcript messages={messages.data ?? []} pending={send.isPending} />
      <p data-testid="assistant-reply" className="sr-only">
        {reply}
      </p>
      <div className="px-4 pb-4">
        <Composer
          compact
          pending={send.isPending}
          placeholder="Ask anything"
          submitLabel="Send"
          onSubmit={(message) => send.mutate(message)}
        />
      </div>
    </DetailPanel>
  );
}

function paneDetail(pane: ChannelPane | null, channelName: string) {
  switch (pane) {
    case 'settings': {
      return <AgentProfile agentId={DEFAULT_BOT} />;
    }
    case 'watch': {
      return <ComputerPanel name={channelName} />;
    }
    case null: {
      return null;
    }
    default: {
      const exhaustive: never = pane;
      return exhaustive;
    }
  }
}

function ChannelHeader({
  name,
  onPane,
  pane,
}: {
  name: string;
  onPane: (next: ChannelPane | null) => void;
  pane: ChannelPane | null;
}) {
  const watching = pane === 'watch';
  const settings = pane === 'settings';
  return (
    <header className="sticky top-0 flex h-12 items-center justify-between gap-2 border-b border-border px-3">
      <div className="flex min-w-0 items-center gap-1.5">
        <SidebarToggle />
        <ChannelAvatar name={name} size={22} />
        <h1 className="min-w-0 truncate text-sm tracking-tight">{name}</h1>
      </div>
      <div className="flex flex-row gap-1.5">
        <PaneToggle
          active={watching}
          label="Watch this Bot's screen"
          onClick={() => onPane(watching ? null : 'watch')}
        >
          <IconDeviceDesktop className="size-4.5" />
        </PaneToggle>
        <PaneToggle
          active={settings}
          label="Channel coworker"
          onClick={() => onPane(settings ? null : 'settings')}
        >
          <IconSettings className="size-4.5" />
        </PaneToggle>
      </div>
    </header>
  );
}

function PaneToggle({
  active,
  children,
  label,
  onClick,
}: {
  active: boolean;
  children: ReactNode;
  label: string;
  onClick: () => void;
}) {
  return (
    <Button
      aria-label={label}
      aria-pressed={active}
      className={active ? 'bg-foreground/5' : undefined}
      size="icon"
      variant="ghost"
      onClick={onClick}
    >
      {children}
    </Button>
  );
}
