import { useQuery, useQueryClient } from '@tanstack/react-query';
import { signOut } from 'firebase/auth';
import { createContext, useContext, useEffect, useMemo, useRef, useState } from 'react';

import { apiJson } from '../api.js';
import { Button } from '../components/ui/button.js';
import { apiBase } from '../config.js';

import { useAuth } from './auth-context.js';
import { parseSessionMe, sessionOrigin, sessionQueryKey } from './session-scope.js';

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
    queryKey: [SESSION_ME_QUERY, uid],
    refetchOnReconnect: true,
    retry: 3,
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
      origin,
      principalId: parsed.id,
      workspaceId: parsed.workspaceId,
    };
    return {
      me: parsed,
      queryKey: (...parts: readonly unknown[]) => sessionQueryKey(scope, ...parts),
    };
  }, [generation, origin, parsed]);

  if (sessionQuery.isError && !parsed) {
    return (
      <div className="flex flex-col items-start gap-3 p-6">
        <p className="text-sm text-muted-foreground">Could not load this workspace session</p>
        <div className="flex gap-2">
          <Button disabled={sessionQuery.isFetching} onClick={() => void sessionQuery.refetch()}>
            Retry
          </Button>
          <Button aria-label="Sign out" variant="ghost" onClick={() => void signOut(auth)}>
            Sign out
          </Button>
        </div>
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
