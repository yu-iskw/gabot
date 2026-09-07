import type { QueryClient } from '@tanstack/react-query';

export type AuthCacheIdentity = {
  generation: number;
  uid: string | null;
};

export function syncAuthQueryCache(
  queryClient: QueryClient,
  previous: AuthCacheIdentity,
  next: AuthCacheIdentity,
): void {
  if (previous.uid !== next.uid || previous.generation !== next.generation) {
    // Keep the public workspace directory; clearing it drops `entry`/`auth` and
    // re-enters onAuthStateChanged in a loop (sign-in never leaves /sign).
    queryClient.removeQueries({
      predicate: (query) => query.queryKey[0] !== 'workspace-directory',
    });
  }
}
