import { parseIdentityKey } from './identity-key.js';
import { asRecord, asString } from './json-value.js';

import type { VerifiedPerson } from './ports.js';

const MALFORMED = 'Malformed id token.';
const WRONG_ISSUER = 'Wrong token issuer.';
const WRONG_AUDIENCE = 'Wrong token audience.';
const EXPIRED = 'Expired token.';

export function personFromIdTokenClaims(
  claims: unknown,
  expected: { audience: string; issuer: string },
): VerifiedPerson {
  const record = asRecord(claims);
  const issuer = asString(record.iss);
  const subject = asString(record.sub) || asString(record.uid);
  if (!issuer || !subject) {
    throw new Error(MALFORMED);
  }
  if (issuer !== expected.issuer) {
    throw new Error(WRONG_ISSUER);
  }
  if (!claimAudiences(record.aud).includes(expected.audience)) {
    throw new Error(WRONG_AUDIENCE);
  }
  const exp = record.exp;
  if (typeof exp === 'number' && exp * 1000 <= Date.now()) {
    throw new Error(EXPIRED);
  }
  const firebase = asRecord(record.firebase);
  const tenant = asString(firebase.tenant) || undefined;
  const identity = parseIdentityKey({
    issuer,
    subject,
    tenant,
  });
  if (!identity.ok) {
    throw new Error(identity.reason);
  }
  const email = asString(record.email);
  return {
    id: subject,
    email,
    identity: identity.value,
    name: asString(record.name, email || 'user'),
  };
}

function claimAudiences(value: unknown): string[] {
  if (typeof value === 'string' && value.length > 0) {
    return [value];
  }
  if (!Array.isArray(value)) {
    return [];
  }
  return value.filter((item): item is string => typeof item === 'string' && item.length > 0);
}
