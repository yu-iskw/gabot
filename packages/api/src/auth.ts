import { asRecord, asString, offeredBearer } from '@gabot/common';
import { getApps, initializeApp } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';

import type { GabotStore, SessionUser } from './store/types.js';
import type { PeopleAuthPort, VerifiedPerson } from '@gabot/common';
import type { MiddlewareHandler } from 'hono';

export type AuthVariables = {
  user: SessionUser;
};

export function createFirebasePeopleAuth(projectId: string): PeopleAuthPort {
  return {
    async verifyIdToken(token: string): Promise<VerifiedPerson> {
      if (getApps().length === 0) {
        initializeApp({ projectId });
      }
      const record = asRecord(await getAuth().verifyIdToken(token));
      const email = asString(record.email);
      return {
        id: asString(record.uid),
        email,
        name: asString(record.name, email || 'user'),
      };
    },
  };
}

export function requireUser(
  peopleAuth: PeopleAuthPort,
  store: GabotStore,
  adminEmails: string[],
): MiddlewareHandler<{ Variables: AuthVariables }> {
  return async (context, next) => {
    const token = offeredBearer(context.req.header('authorization'));
    if (!token) {
      return context.json({ error: 'Unauthorized' }, 401);
    }
    try {
      const person = await peopleAuth.verifyIdToken(token);
      const user = await store.upsertUser(person, adminEmails);
      context.set('user', user);
      await next();
      return undefined;
    } catch {
      return context.json({ error: 'Unauthorized' }, 401);
    }
  };
}
