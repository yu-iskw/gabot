import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link } from '@tanstack/react-router';

import { apiJson } from '../api.js';
import { SidebarToggleBar } from '../components/layout/sidebar-toggle.js';
import { useAuth } from '../lib/auth-context.js';
import { useSession } from '../lib/session-context.js';
import { useWorkspaceDirectory } from '../lib/workspace-directory-context.js';

type TaskDetailResponse = {
  artifact: {
    audience: string;
    content: string;
    contentRef: string;
    id: string;
    kind: string;
    validationStatus: string;
    version: number;
  } | null;
  task: {
    audience: string;
    botId: string;
    channelId: string;
    currentRunId: string | null;
    id: string;
    objective: string;
    status: string;
    successCriteria: string;
    updatedAt: string;
    workspaceId: string;
  };
};

type RunEventRow = {
  createdAt: string;
  payload: Record<string, unknown>;
  runId: string;
  schemaVersion: number;
  sequence: number;
  type: string;
};

export function TaskPage({ taskId }: { taskId: string }) {
  const { token } = useAuth();
  const { queryKey } = useSession();
  const { slug } = useWorkspaceDirectory();
  const queryClient = useQueryClient();

  const detail = useQuery({
    queryKey: queryKey('task', taskId),
    queryFn: async () => apiJson<TaskDetailResponse>(`/v1/tasks/${taskId}`, await token()),
    refetchInterval: 1500,
  });

  const runId = detail.data?.task.currentRunId ?? '';
  const runEvents = useQuery({
    queryKey: queryKey('task-events', taskId, runId),
    enabled: runId.length > 0,
    queryFn: async () => {
      const body = await apiJson<{ events: RunEventRow[] }>(
        `/v1/runs/${runId}/events?after=0`,
        await token(),
      );
      return body.events;
    },
    refetchInterval: 1500,
  });

  const cancel = useMutation({
    mutationFn: async () => {
      if (!runId) {
        throw new Error('Run is not available yet.');
      }
      return apiJson<{ status: string }>(`/v1/runs/${runId}/cancel`, await token(), {
        method: 'POST',
        body: '{}',
      });
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: queryKey('task', taskId) });
    },
  });

  const task = detail.data?.task;
  const artifact = detail.data?.artifact;
  const eventRows = runEvents.data ?? [];

  return (
    <div className="flex h-full flex-col" data-testid="task-page">
      <SidebarToggleBar />
      <div className="mx-auto flex w-full max-w-3xl flex-1 flex-col gap-6 p-6">
        <Link
          to="/workspaces/$workspaceSlug"
          params={{ workspaceSlug: slug }}
          className="text-sm underline"
        >
          Home
        </Link>
        {detail.isLoading ? <p>Loading task…</p> : null}
        {detail.isError ? <p role="alert">Failed to load task.</p> : null}
        {task ? (
          <>
            <section className="space-y-2">
              <p className="text-sm tracking-wide text-muted-foreground uppercase">Task</p>
              <h1 className="text-2xl font-semibold" data-testid="task-objective">
                {task.objective}
              </h1>
              <p className="text-sm" data-testid="task-status">
                Status: {task.status}
              </p>
              <p className="text-sm text-muted-foreground">Teammate: {task.botId}</p>
              <p className="text-sm text-muted-foreground">Audience: {task.audience}</p>
              <p className="text-sm text-muted-foreground">Criteria: {task.successCriteria}</p>
              <button
                type="button"
                className="rounded border px-3 py-1 text-sm"
                data-testid="task-cancel"
                disabled={!runId || task.status === 'completed' || task.status === 'cancelled'}
                onClick={() => {
                  cancel.mutate();
                }}
              >
                Cancel
              </button>
            </section>
            <section className="space-y-2" data-testid="task-artifact">
              <h2 className="text-lg font-medium">Artifact</h2>
              {artifact ? (
                <>
                  <p className="text-sm text-muted-foreground">
                    v{artifact.version} · {artifact.kind} · {artifact.validationStatus}
                  </p>
                  <pre
                    className="whitespace-pre-wrap rounded border bg-muted/30 p-4 text-sm"
                    data-testid="task-artifact-content"
                  >
                    {artifact.content}
                  </pre>
                </>
              ) : (
                <p className="text-sm text-muted-foreground">No artifact yet.</p>
              )}
            </section>
            <section className="space-y-2" data-testid="task-events">
              <h2 className="text-lg font-medium">Events</h2>
              <ul className="space-y-1 text-sm">
                {eventRows.map((event) => (
                  <li key={`${event.runId}-${String(event.sequence)}`}>
                    #{event.sequence} {event.type}
                  </li>
                ))}
              </ul>
            </section>
          </>
        ) : null}
      </div>
    </div>
  );
}
