import { useQuery, useQueryClient } from '@tanstack/react-query';
import { signOut } from 'firebase/auth';
import { createContext, useContext, useEffect, useMemo, useRef, useState } from 'react';

import { createFirebaseAuth } from '../firebase.js';

import { getActiveWorkspaceSlug, setActiveWorkspaceSlug } from './active-workspace-slug.js';
import { syncAuthQueryCache } from './auth-query-cache.js';
import {
  fetchWorkspaceDirectory,
  findWorkspaceByLocator,
  findWorkspaceEntry,
} from './workspace-directory.js';

import type { WorkspaceDirectory, WorkspaceDirectoryEntry } from './workspace-directory.js';
import type { Auth, User } from 'firebase/auth';
import type { ReactNode } from 'react';

type AuthValue = {
  auth: Auth | null;
  clearWorkspace: () => Promise<void>;
  directory: WorkspaceDirectory | null;
  entry: WorkspaceDirectoryEntry | null;
  ready: boolean;
  selectWorkspace: (locator: string) => Promise<boolean>;
  token: () => Promise<string>;
  user: User | null;
  workspaceSlug: string;
};

const AuthContext = createContext<AuthValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const queryClient = useQueryClient();
  const uidRef = useRef<string | null>(null);
  const [slug, setSlug] = useState(() => getActiveWorkspaceSlug());
  const [user, setUser] = useState<User | null>(null);
  const [authReady, setAuthReady] = useState(false);
  const listing = useQuery({
    queryFn: fetchWorkspaceDirectory,
    queryKey: ['workspace-directory'],
    staleTime: Infinity,
  });
  const entry = useMemo(() => {
    if (!listing.data || !slug) {
      return null;
    }
    return (
      findWorkspaceEntry(listing.data, slug) ?? findWorkspaceByLocator(listing.data, slug) ?? null
    );
  }, [listing.data, slug]);
  const auth = useMemo(() => (entry ? createFirebaseAuth(entry) : null), [entry]);

  useEffect(() => {
    if (!auth) {
      uidRef.current = null;
      setUser(null);
      setAuthReady(true);
      return;
    }
    setAuthReady(false);
    return auth.onAuthStateChanged((next) => {
      const nextUid = next?.uid ?? null;
      syncAuthQueryCache(
        queryClient,
        { generation: 0, uid: uidRef.current },
        { generation: 0, uid: nextUid },
      );
      uidRef.current = nextUid;
      setUser(next);
      setAuthReady(true);
    });
  }, [auth, queryClient]);

  const value = useMemo<AuthValue>(
    () => ({
      auth,
      directory: listing.data ?? null,
      entry,
      ready: listing.isFetched && authReady,
      user,
      workspaceSlug: entry?.slug ?? '',
      token: async () => {
        if (!user) {
          throw new Error('Not signed in');
        }
        return user.getIdToken();
      },
      selectWorkspace: async (locator: string) => {
        if (!listing.data) {
          return false;
        }
        const next =
          findWorkspaceEntry(listing.data, locator) ??
          findWorkspaceByLocator(listing.data, locator);
        if (!next) {
          return false;
        }
        if (auth && user) {
          await signOut(auth);
        }
        setActiveWorkspaceSlug(next.slug);
        setSlug(next.slug);
        return true;
      },
      clearWorkspace: async () => {
        if (auth && user) {
          await signOut(auth);
        }
        setActiveWorkspaceSlug('');
        setSlug('');
      },
    }),
    [auth, authReady, entry, listing.data, listing.isFetched, user],
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
