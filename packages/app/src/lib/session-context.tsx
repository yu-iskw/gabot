import { useQueryClient } from '@tanstack/react-query';
import { createContext, useContext, useEffect, useMemo, useRef, useState } from 'react';

import { apiJson } from '../api.js';
import { apiBase } from '../config.js';

import { useAuth } from './auth-context.js';
import { parseSessionMe, sessionOrigin, sessionQueryKey } from './session-scope.js';

import type { SessionMe, SessionScope } from './session-scope.js';
import type { ReactNode } from 'react';

type SessionValue = {
  me: SessionMe;
  queryKey: (...parts: readonly unknown[]) => unknown[];
};

const SessionContext = createContext<SessionValue | null>(null);

export function SessionProvider({ children }: { children: ReactNode }) {
  const { token, user } = useAuth();
  const queryClient = useQueryClient();
  const tokenRef = useRef(token);
  tokenRef.current = token;
  const generationRef = useRef(1);
  const workspaceRef = useRef<string | null | undefined>(undefined);
  const [me, setMe] = useState<SessionMe | null>(null);
  const [origin, setOrigin] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setMe(null);
    setOrigin(null);
    setError(null);
    const request = { ignore: false };
    void (async () => {
      try {
        const parsed = parseSessionMe(await apiJson<unknown>('/api/me', await tokenRef.current()));
        if (request.ignore) {
          return;
        }
        if (workspaceRef.current !== undefined && workspaceRef.current !== parsed.workspaceId) {
          generationRef.current += 1;
          queryClient.clear();
        }
        workspaceRef.current = parsed.workspaceId;
        setMe(parsed);
        setOrigin(sessionOrigin(apiBase(), window.location.origin));
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
  }, [queryClient, user?.uid]);

  const value = useMemo<SessionValue | null>(() => {
    if (!me || !origin) {
      return null;
    }
    const scope: SessionScope = {
      generation: generationRef.current,
      origin,
      principalId: me.id,
      workspaceId: me.workspaceId,
    };
    return {
      me,
      queryKey: (...parts: readonly unknown[]) => sessionQueryKey(scope, ...parts),
    };
  }, [me, origin]);

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
