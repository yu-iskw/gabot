import { createHmac, timingSafeEqual } from 'node:crypto';

import { personFromIdTokenClaims } from './id-token-claims.js';
import { parseIdentityKey } from './identity-key.js';

import type { PeopleAuthPort, VerifiedPerson } from './ports.js';

const MALFORMED_TOKEN = 'Malformed id token.';
const SECRET_REQUIRED = 'People auth secret is required.';

export type ScriptedPeopleAuth = PeopleAuthPort & {
  mintIdToken(person: {
    email: string;
    expiresAt?: Date;
    name: string;
    subject: string;
    tenant?: string;
  }): string;
};

export function createScriptedPeopleAuth(options: {
  audience: string;
  issuer: string;
  secret: string;
}): ScriptedPeopleAuth {
  if (!options.secret) {
    throw new Error(SECRET_REQUIRED);
  }
  const issuer = parseIdentityKey({ issuer: options.issuer, subject: 'bootstrap' });
  if (!issuer.ok) {
    throw new Error(issuer.reason);
  }

  return {
    mintIdToken(person) {
      const exp = Math.floor((person.expiresAt ?? defaultExpiry()).getTime() / 1000);
      const payload = encode({
        iss: options.issuer,
        aud: options.audience,
        sub: person.subject,
        email: person.email,
        name: person.name,
        tid: person.tenant,
        exp,
      });
      return `${payload}.${signPart(options.secret, payload)}`;
    },
    verifyIdToken(token: string): Promise<VerifiedPerson> {
      const [payload, signature] = token.split('.');
      if (!payload || !signature) {
        return Promise.reject(new Error(MALFORMED_TOKEN));
      }
      const expected = signPart(options.secret, payload);
      const left = Buffer.from(signature);
      const right = Buffer.from(expected);
      if (left.length !== right.length || !timingSafeEqual(left, right)) {
        return Promise.reject(new Error('Invalid id token.'));
      }
      const body = decode(payload);
      try {
        return Promise.resolve(
          personFromIdTokenClaims(
            {
              iss: body.iss,
              aud: body.aud,
              sub: body.sub,
              email: body.email,
              name: body.name,
              firebase: body.tid ? { tenant: body.tid } : undefined,
              exp: body.exp,
            },
            { issuer: options.issuer, audience: options.audience },
          ),
        );
      } catch (error) {
        return Promise.reject(error instanceof Error ? error : new Error(MALFORMED_TOKEN));
      }
    },
  };
}

type TokenBody = {
  aud: string;
  email: string;
  exp: number;
  iss: string;
  name: string;
  sub: string;
  tid?: string;
};

function defaultExpiry(): Date {
  return new Date(Date.now() + 60 * 60 * 1000);
}

function encode(value: object): string {
  return Buffer.from(JSON.stringify(value)).toString('base64url');
}

function decode(value: string): TokenBody {
  const parsed: unknown = JSON.parse(Buffer.from(value, 'base64url').toString('utf8'));
  if (typeof parsed !== 'object' || parsed === null) {
    throw new Error(MALFORMED_TOKEN);
  }
  const record = parsed as Record<string, unknown>;
  if (
    typeof record.iss !== 'string' ||
    typeof record.aud !== 'string' ||
    typeof record.sub !== 'string' ||
    typeof record.email !== 'string' ||
    typeof record.name !== 'string' ||
    typeof record.exp !== 'number'
  ) {
    throw new Error(MALFORMED_TOKEN);
  }
  return {
    iss: record.iss,
    aud: record.aud,
    sub: record.sub,
    email: record.email,
    name: record.name,
    exp: record.exp,
    tid: typeof record.tid === 'string' ? record.tid : undefined,
  };
}

function signPart(secret: string, payload: string): string {
  return createHmac('sha256', secret).update(payload).digest('base64url');
}
