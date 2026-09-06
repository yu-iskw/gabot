import { useQueryClient } from '@tanstack/react-query';
import { createContext, useContext, useEffect, useMemo, useRef, useState } from 'react';

import { apiJson } from '../api.js';
import { apiBase } from '../config.js';

import { useAuth } from './auth-context.js';
import { syncAuthQueryCache } from './auth-query-cache.js';
import { parseSessionMe, sessionOrigin, sessionQueryKey } from './session-scope.js';
import { workspaceDefaultChannelId } from './workspace-channel.js';

import type { SessionMe, SessionScope } from './session-scope.js';
import type { ReactNode } from 'react';

type SessionValue = {
  me: SessionMe;
  queryKey: (...parts: readonly unknown[]) => unknown[];
  scope: SessionScope;
};

const SessionContext = createContext<SessionValue | null>(null);

export function SessionProvider({ children }: { children: ReactNode }) {
  const { token, user } = useAuth();
  const queryClient = useQueryClient();
  const generationRef = useRef(1);
  const workspaceRef = useRef<string | null>(null);
  const [me, setMe] = useState<SessionMe | null>(null);
  const [scope, setScope] = useState<SessionScope | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const request = { ignore: false };
    void (async () => {
      try {
        const parsed = parseSessionMe(await apiJson<unknown>('/api/me', await token()));
        if (request.ignore) {
          return;
        }
        const workspaceId = parsed.workspaceId ?? 'none';
        const meWithChannel: SessionMe = {
          ...parsed,
          defaultChannelId:
            parsed.defaultChannelId ??
            (parsed.workspaceId ? workspaceDefaultChannelId(parsed.workspaceId) : null),
        };
        if (workspaceRef.current !== null && workspaceRef.current !== workspaceId) {
          const previousGeneration = generationRef.current;
          generationRef.current += 1;
          syncAuthQueryCache(
            queryClient,
            { generation: previousGeneration, uid: user?.uid ?? null },
            { generation: generationRef.current, uid: user?.uid ?? null },
          );
        }
        workspaceRef.current = workspaceId;
        setMe(meWithChannel);
        setScope({
          generation: generationRef.current,
          origin: sessionOrigin(apiBase(), window.location.origin),
          principalId: parsed.id,
          workspaceId,
        });
        setError(null);
      } catch {
        if (!request.ignore) {
          setError('Could not load this workspace session');
        }
      }
    })();
    return () => {
      request.ignore = true;
    };
  }, [queryClient, token, user?.uid]);

  const value = useMemo<SessionValue | null>(() => {
    if (!me || !scope) {
      return null;
    }
    return {
      me,
      queryKey: (...parts: readonly unknown[]) => sessionQueryKey(scope, ...parts),
      scope,
    };
  }, [me, scope]);

  if (error) {
    return <p className="p-6 text-sm text-muted-foreground">{error}</p>;
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
