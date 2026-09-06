import { QueryClient } from '@tanstack/react-query';
import { describe, expect, it } from 'vitest';

import { syncAuthQueryCache } from './auth-query-cache.js';

describe('syncAuthQueryCache', () => {
  it('clears cached queries when the signed-in uid changes', () => {
    const queryClient = new QueryClient();
    queryClient.setQueryData(['connections'], { credentialRef: 'admin-secret' });
    syncAuthQueryCache(queryClient, { generation: 1, uid: 'admin' }, { generation: 1, uid: null });
    expect(queryClient.getQueryData(['connections'])).toBeUndefined();
  });

  it('clears cached queries when generation rotates for the same uid', () => {
    const queryClient = new QueryClient();
    queryClient.setQueryData(['channels'], [{ id: 'ch-general' }]);
    syncAuthQueryCache(
      queryClient,
      { generation: 1, uid: 'user-1' },
      { generation: 2, uid: 'user-1' },
    );
    expect(queryClient.getQueryData(['channels'])).toBeUndefined();
  });

  it('keeps cached queries when uid and generation are unchanged', () => {
    const queryClient = new QueryClient();
    queryClient.setQueryData(['connections'], { credentialRef: 'same-user' });
    syncAuthQueryCache(
      queryClient,
      { generation: 1, uid: 'user-1' },
      { generation: 1, uid: 'user-1' },
    );
    expect(queryClient.getQueryData(['connections'])).toEqual({ credentialRef: 'same-user' });
  });
});
