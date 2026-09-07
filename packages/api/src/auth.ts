import {
  asRecord,
  identityKeyEquals,
  membershipIsActive,
  offeredBearer,
  personFromIdTokenClaims,
} from '@gabot/common';
import { getApps, initializeApp } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';

import type { GabotStore, SessionUser } from './store/types.js';
import type { IdentityKey, PeopleAuthPort, VerifiedPerson } from '@gabot/common';
import type { MiddlewareHandler } from 'hono';

const NOT_A_MEMBER = 'not_a_member';

export type AuthVariables = {
  user: SessionUser;
};

export type FirebasePeopleAuthOptions = {
  audience: string;
  issuer: string;
  projectId: string;
};

export function createFirebasePeopleAuth(options: FirebasePeopleAuthOptions): PeopleAuthPort {
  return {
    async verifyIdToken(token: string): Promise<VerifiedPerson> {
      if (getApps().length === 0) {
        initializeApp({ projectId: options.projectId });
      }
      const record = asRecord(await getAuth().verifyIdToken(token));
      return personFromIdTokenClaims(record, {
        issuer: options.issuer,
        audience: options.audience,
      });
    },
  };
}

export function requireUser(
  peopleAuth: PeopleAuthPort,
  store: GabotStore,
  adminIdentities: IdentityKey[],
): MiddlewareHandler<{ Variables: AuthVariables }> {
  return async (context, next) => {
    const token = offeredBearer(context.req.header('authorization'));
    if (!token) {
      return context.json({ error: 'Unauthorized' }, 401);
    }
    try {
      const person = await peopleAuth.verifyIdToken(token);
      const user = await resolveMember(store, person, adminIdentities);
      if (!user) {
        return context.json({ error: NOT_A_MEMBER }, 403);
      }
      context.set('user', user);
      await next();
      return undefined;
    } catch {
      return context.json({ error: 'Unauthorized' }, 401);
    }
  };
}

async function resolveMember(
  store: GabotStore,
  person: VerifiedPerson,
  adminIdentities: IdentityKey[],
): Promise<SessionUser | null> {
  const existing = await store.getUserByIdentity(person.identity);
  const isBootstrapAdmin = adminIdentities.some((admin) =>
    identityKeyEquals(admin, person.identity),
  );
  if (!existing && !isBootstrapAdmin) {
    return null;
  }
  const user = await store.upsertUser(person, adminIdentities);
  let membership = await store.getMembership(user.id);
  if ((!membership || !membershipIsActive(membership)) && isBootstrapAdmin) {
    await store.upsertMembership({ userId: user.id, role: 'admin', status: 'active' });
    membership = await store.getMembership(user.id);
  }
  if (!membership || !membershipIsActive(membership)) {
    return null;
  }
  return user;
}
