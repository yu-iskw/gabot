import { createHmac, timingSafeEqual } from 'node:crypto';

import type { AgentIdentityPort } from './ports.js';

const DEFAULT_PROJECT = 'local';
const MALFORMED_TOKEN = 'Malformed service token.';

export function spiffePrincipal(serviceName: string, projectId = DEFAULT_PROJECT): string {
  return `principal://agents.global.project-${projectId}.system.id.goog/resources/run/projects/${projectId}/locations/local/services/${serviceName}`;
}

type TokenBody = {
  sub: string;
  aud: string;
  svc: string;
};

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
    typeof record.sub !== 'string' ||
    typeof record.aud !== 'string' ||
    typeof record.svc !== 'string'
  ) {
    throw new Error(MALFORMED_TOKEN);
  }
  return { sub: record.sub, aud: record.aud, svc: record.svc };
}

function signPart(secret: string, payload: string): string {
  return createHmac('sha256', secret).update(payload).digest('base64url');
}

export function createLocalAgentIdentity(
  secret: string,
  projectId = DEFAULT_PROJECT,
): AgentIdentityPort {
  if (!secret) {
    throw new Error('Agent identity secret is required.');
  }

  return {
    principal(serviceName: string): string {
      return spiffePrincipal(serviceName, projectId);
    },
    signServiceToken(audience: string, serviceName: string): string {
      const payload = encode({
        sub: spiffePrincipal(serviceName, projectId),
        aud: audience,
        svc: serviceName,
      });
      return `${payload}.${signPart(secret, payload)}`;
    },
    verifyServiceToken(
      token: string,
      audience: string,
    ): { serviceName: string; principal: string } {
      const [payload, signature] = token.split('.');
      if (!payload || !signature) {
        throw new Error(MALFORMED_TOKEN);
      }
      const expected = signPart(secret, payload);
      const left = Buffer.from(signature);
      const right = Buffer.from(expected);
      if (left.length !== right.length || !timingSafeEqual(left, right)) {
        throw new Error('Invalid service token.');
      }
      const body = decode(payload);
      if (body.aud !== audience) {
        throw new Error('Wrong token audience.');
      }
      return { serviceName: body.svc, principal: body.sub };
    },
  };
}
