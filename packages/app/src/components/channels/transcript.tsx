import { IconBox } from '@tabler/icons-react';
import { useQuery } from '@tanstack/react-query';
import { useEffect, useRef } from 'react';

import { apiJson } from '../../api.js';
import { useAuth } from '../../lib/auth-context.js';
import { splitSkillChip } from '../../lib/skill-chip.js';
import { captionForTool } from '../../lib/tool-caption.js';
import { interleaveTranscript } from '../../lib/transcript-timeline.js';
import { visibleMessages } from '../../lib/visible-messages.js';

import { AssistantProse } from './assistant-prose.js';
import { PLACEHOLDER_COMMANDS } from './composer-sources.js';
import { ToolLine } from './tool-line.js';

type TranscriptMessage = {
  agentId?: string | null;
  content: string;
  createdAt?: Date | string;
  id: string;
  role: string;
};

type ChannelEvent = {
  createdAt?: Date | string;
  id: string;
  payload: Record<string, unknown>;
  type: string;
};

type SkillRow = { slug: string };

const SLASH = String.fromCharCode(47);

export function Transcript({
  events = [],
  messages,
  pending,
}: {
  events?: ChannelEvent[];
  messages: TranscriptMessage[];
  pending: boolean;
}) {
  const end = useRef<HTMLLIElement | null>(null);
  const commandNames = useCommandNames();

  useEffect(() => {
    end.current?.scrollIntoView({ block: 'end' });
  }, [messages, events, pending]);

  const rows = interleaveTranscript(visibleMessages(messages), runEvents(events));

  return (
    <ul data-testid="messages" className="flex min-h-0 flex-1 flex-col overflow-y-auto px-6 py-4">
      {rows.map((row) =>
        row.kind === 'message' ? (
          <li key={row.id}>{renderMessage(row.message, commandNames)}</li>
        ) : (
          <li key={row.id}>
            <details className="pb-3 text-xs text-muted-foreground" data-testid="channel-event">
              <summary>{eventCaption(row.event)}</summary>
              {eventDetail(row.event)}
            </details>
          </li>
        ),
      )}
      {pending ? (
        <li>
          <p className="tool-line-running text-sm text-muted-foreground" role="status">
            Thinking
          </p>
        </li>
      ) : null}
      <li ref={end} aria-hidden className="h-px" />
    </ul>
  );
}

function renderMessage(message: TranscriptMessage, commandNames: string) {
  if (message.role === 'tool') {
    const caption = captionForTool(message.content);
    return (
      <ToolLine
        detail={caption.detail}
        failed={caption.failed}
        label={caption.label}
        refused={caption.refused}
      />
    );
  }
  if (message.role === 'user') {
    return <UserBubble commandNames={commandNames} text={message.content} />;
  }
  return <AssistantProse agentId={message.agentId} text={message.content} />;
}

function runEvents(events: ChannelEvent[]): ChannelEvent[] {
  return events.filter(
    (event) =>
      event.type.startsWith('agent.delegation') ||
      event.type === 'run.started' ||
      event.type === 'run.succeeded' ||
      event.type === 'run.failed',
  );
}

function eventCaption(event: ChannelEvent): string {
  if (event.type === 'agent.delegation.requested') {
    const toBotId = event.payload.toBotId;
    return typeof toBotId === 'string' ? `Delegated to @${toBotId}` : 'Delegated';
  }
  if (event.type === 'agent.delegation.completed') {
    return 'Delegation completed';
  }
  if (event.type === 'agent.delegation.failed') {
    return 'Delegation failed';
  }
  if (event.type === 'run.started') {
    return 'Run started';
  }
  if (event.type === 'run.succeeded') {
    return 'Run succeeded';
  }
  if (event.type === 'run.failed') {
    return 'Run failed';
  }
  return event.type;
}

function eventDetail(event: ChannelEvent): string {
  const objective = event.payload.objective;
  if (typeof objective === 'string') {
    return objective;
  }
  const error = event.payload.error;
  if (typeof error === 'string') {
    return error;
  }
  return event.type;
}

function UserBubble({ commandNames, text }: { commandNames: string; text: string }) {
  const invoked = splitSkillChip(text, commandNames);
  return (
    <div className="flex justify-end pb-7">
      <div className="max-w-[80%] rounded-xl bg-muted px-3 py-2 text-sm leading-relaxed whitespace-pre-wrap">
        {invoked ? (
          <>
            <span className="mr-1 inline-flex items-center gap-1 rounded bg-foreground/10 px-1.5 py-0.5 align-middle font-mono text-xs text-foreground/80">
              <IconBox className="size-3 shrink-0" />
              {SLASH}
              {invoked.chip}
            </span>
            {invoked.rest}
          </>
        ) : (
          text
        )}
      </div>
    </div>
  );
}

function useCommandNames(): string {
  const { token } = useAuth();
  const skills = useQuery({
    queryKey: ['skills'],
    queryFn: async () => {
      const body = await apiJson<{ skills: SkillRow[] }>('/api/skills', await token());
      return body.skills;
    },
  });
  const slugs = (skills.data ?? []).map((skill) => skill.slug);
  return [...PLACEHOLDER_COMMANDS.map((command) => command.name), ...slugs].join(',');
}
