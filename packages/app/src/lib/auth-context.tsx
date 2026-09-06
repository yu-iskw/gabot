import { useQueryClient } from '@tanstack/react-query';
import { createContext, useContext, useEffect, useMemo, useRef, useState } from 'react';

import { createFirebaseAuth } from '../firebase.js';

import { syncAuthQueryCache } from './auth-query-cache.js';

import type { Auth, User } from 'firebase/auth';
import type { ReactNode } from 'react';

type AuthValue = {
  auth: Auth;
  ready: boolean;
  token: () => Promise<string>;
  user: User | null;
};

const AuthContext = createContext<AuthValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const auth = useMemo(() => createFirebaseAuth(), []);
  const queryClient = useQueryClient();
  const uidRef = useRef<string | null>(null);
  const [user, setUser] = useState<User | null>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    return auth.onAuthStateChanged((next) => {
      const nextUid = next?.uid ?? null;
      syncAuthQueryCache(
        queryClient,
        { generation: 0, uid: uidRef.current },
        { generation: 0, uid: nextUid },
      );
      uidRef.current = nextUid;
      setUser(next);
      setReady(true);
    });
  }, [auth, queryClient]);

  const value = useMemo<AuthValue>(
    () => ({
      auth,
      ready,
      user,
      token: async () => {
        if (!user) {
          throw new Error('Not signed in');
        }
        return user.getIdToken();
      },
    }),
    [auth, ready, user],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthValue {
  const value = useContext(AuthContext);
  if (!value) {
    throw new Error('useAuth requires AuthProvider');
  }
  return value;
}
