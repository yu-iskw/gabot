import type { QueryClient } from '@tanstack/react-query';

export function syncAuthQueryCache(
  queryClient: QueryClient,
  previousUid: string | null,
  nextUid: string | null,
): void {
  if (previousUid !== nextUid) {
    queryClient.clear();
  }
}
