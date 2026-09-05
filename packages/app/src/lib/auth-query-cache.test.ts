import { QueryClient } from '@tanstack/react-query';
import { describe, expect, it } from 'vitest';

import { syncAuthQueryCache } from './auth-query-cache.js';

describe('syncAuthQueryCache', () => {
  it('clears cached queries when the signed-in uid changes', () => {
    const queryClient = new QueryClient();
    queryClient.setQueryData(['connections'], { credentialRef: 'admin-secret' });
    syncAuthQueryCache(queryClient, 'admin', null);
    expect(queryClient.getQueryData(['connections'])).toBeUndefined();
  });

  it('keeps cached queries when the uid is unchanged', () => {
    const queryClient = new QueryClient();
    queryClient.setQueryData(['connections'], { credentialRef: 'same-user' });
    syncAuthQueryCache(queryClient, 'user-1', 'user-1');
    expect(queryClient.getQueryData(['connections'])).toEqual({ credentialRef: 'same-user' });
  });
});
