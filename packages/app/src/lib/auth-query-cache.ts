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
    queryClient.clear();
  }
}
