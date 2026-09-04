import { useQuery } from '@tanstack/react-query';

import { apiJson } from '../../api.js';
import { activityDetail, activityLabel } from '../../lib/activity-caption.js';
import { readAuditPayload } from '../../lib/audit-payload.js';
import { useAuth } from '../../lib/auth-context.js';
import { readScreenShot } from '../../lib/screenshot.js';
import { ToolLine } from '../channels/tool-line.js';

import { ComputerView, useExpandedScreen } from './computer-view.js';

type AuditEvent = { eventType: string; payload: unknown };

export function ComputerPanel({ botId, name }: { botId: string; name: string }) {
  const { token } = useAuth();
  const screen = useExpandedScreen();
  const shot = useQuery({
    queryKey: ['screenshot', botId],
    refetchInterval: 1000,
    refetchOnWindowFocus: false,
    staleTime: 0,
    queryFn: async () => {
      const body: unknown = await apiJson(`/api/computers/${botId}/screenshot`, await token());
      return readScreenShot(body);
    },
  });
  const audit = useQuery({
    queryKey: ['audit'],
    queryFn: async () => {
      const body = await apiJson<{ events: AuditEvent[] }>(
        '/api/admin/audit-events?limit=25',
        await token(),
      );
      return body.events.filter((event) => !event.eventType.includes('screenshot'));
    },
  });
  const events = [...(audit.data ?? [])].reverse();
  const problem = shot.isError ? 'The screen is not available right now.' : null;

  return (
    <div className="mt-4 px-4" data-testid="computer-view">
      <div className="p-4">
        <ComputerView
          expanded={screen.expanded}
          name={name}
          problem={problem}
          shot={shot.data ?? null}
          waiting={shot.isPending}
          onToggleExpanded={screen.toggle}
        />
        <div className="mt-10">
          <h3 className="mb-2 text-sm font-medium">Activity</h3>
          <ActivityList events={events} />
        </div>
      </div>
    </div>
  );
}

function ActivityList({ events }: { events: AuditEvent[] }) {
  if (events.length === 0) {
    return (
      <div
        className="flex h-[180px] items-center justify-center rounded-lg border border-dashed border-border"
        data-testid="audit-events"
      >
        <p className="px-4 text-center text-sm text-muted-foreground">
          Nothing yet. Commands the Bot runs, and files it reads, appear here as they happen.
        </p>
      </div>
    );
  }
  return (
    <ul className="min-w-0" data-testid="audit-events">
      {events.map((event, index) => (
        <li
          key={`${event.eventType}-${String(index)}`}
          className="border-b border-border/60 py-2 last:border-b-0"
        >
          <ActivityLine event={event} />
        </li>
      ))}
    </ul>
  );
}

function ActivityLine({ event }: { event: AuditEvent }) {
  const payload = readAuditPayload(event.payload);
  return (
    <ToolLine
      detail={activityDetail(event.eventType, payload)}
      label={activityLabel(event.eventType)}
      refused={event.eventType.includes('refused')}
    />
  );
}
