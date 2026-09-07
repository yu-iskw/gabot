import { useQuery, useQueryClient } from '@tanstack/react-query';
import { signOut } from 'firebase/auth';
import { createContext, useContext, useEffect, useMemo, useRef, useState } from 'react';

import { ApiRequestError, apiJson } from '../api.js';
import { Button } from '../components/ui/button.js';
import { apiBase } from '../config.js';

import { useAuth } from './auth-context.js';
import { parseSessionMe, sessionOrigin, sessionQueryKey } from './session-scope.js';
import { useWorkspaceDirectory } from './workspace-directory-context.js';

import type { SessionMe, SessionScope } from './session-scope.js';
import type { ReactNode } from 'react';

const SESSION_ME_QUERY = 'session-me';

type SessionValue = {
  me: SessionMe;
  queryKey: (...parts: readonly unknown[]) => unknown[];
};

const SessionContext = createContext<SessionValue | null>(null);

export function SessionProvider({ children }: { children: ReactNode }) {
  const { auth, token, user } = useAuth();
  const { entry } = useWorkspaceDirectory();
  const queryClient = useQueryClient();
  const tokenRef = useRef(token);
  tokenRef.current = token;
  const workspaceRef = useRef<string | null | undefined>(undefined);
  const [generation, setGeneration] = useState(1);
  const uid = user?.uid ?? null;

  const sessionQuery = useQuery({
    enabled: uid !== null,
    queryFn: async () =>
      parseSessionMe(await apiJson<unknown>('/api/me', await tokenRef.current())),
    queryKey: [SESSION_ME_QUERY, uid, entry.slug],
    refetchOnReconnect: true,
    retry: (failureCount, error) => {
      if (error instanceof ApiRequestError && (error.status === 401 || error.status === 403)) {
        return false;
      }
      return failureCount < 3;
    },
  });
  const parsed = sessionQuery.data ?? null;

  useEffect(() => {
    if (!parsed) {
      return;
    }
    if (workspaceRef.current !== undefined && workspaceRef.current !== parsed.workspaceId) {
      setGeneration((current) => current + 1);
      queryClient.removeQueries({
        predicate: (query) => query.queryKey[0] !== SESSION_ME_QUERY,
      });
    }
    workspaceRef.current = parsed.workspaceId;
  }, [parsed, queryClient]);

  const origin = sessionOrigin(apiBase(), window.location.origin);
  const value = useMemo<SessionValue | null>(() => {
    if (!parsed) {
      return null;
    }
    const scope: SessionScope = {
      generation,
      origin: `${origin}|${entry.slug}`,
      principalId: parsed.id,
      workspaceId: parsed.workspaceId,
    };
    return {
      me: parsed,
      queryKey: (...parts: readonly unknown[]) => sessionQueryKey(scope, ...parts),
    };
  }, [entry.slug, generation, origin, parsed]);

  if (sessionQuery.isError && !parsed) {
    const denied =
      sessionQuery.error instanceof ApiRequestError && sessionQuery.error.status === 403;
    return (
      <div className="flex flex-col items-start gap-3 p-6">
        <p className="text-sm text-muted-foreground">
          {denied
            ? "You don't have access to this workspace"
            : 'Could not load this workspace session'}
        </p>
        <div className="flex gap-2">
          <Button disabled={sessionQuery.isFetching} onClick={() => void sessionQuery.refetch()}>
            Retry
          </Button>
          <Button
            aria-label="Sign out"
            variant="ghost"
            onClick={() => {
              if (auth) {
                void signOut(auth);
              }
            }}
          >
            Sign out
          </Button>
        </div>
      </div>
    );
  }
  if (parsed?.workspaceId && parsed.workspaceId !== entry.workspaceId) {
    return (
      <div className="flex flex-col items-start gap-3 p-6">
        <p className="text-sm text-muted-foreground">
          This directory entry expects workspace {entry.workspaceId}, but the backend session is{' '}
          {parsed.workspaceId}.
        </p>
        <Button
          aria-label="Sign out"
          variant="ghost"
          onClick={() => {
            if (auth) {
              void signOut(auth);
            }
          }}
        >
          Sign out
        </Button>
      </div>
    );
  }
  if (!value) {
    return <p className="p-6 text-sm text-muted-foreground">Loading workspace…</p>;
  }

  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>;
}

export function useSession(): SessionValue {
  const value = useContext(SessionContext);
  if (!value) {
    throw new Error('useSession requires SessionProvider');
  }
  return value;
}
