import {
  contractFail,
  contractOk,
  parseNonEmptyString,
  parseOptionalNonEmptyString,
  parseRecord,
} from './contract-result.js';
import { parseAbsoluteHttpUrl } from './http-origin.js';

import type { ContractResult } from './contract-result.js';

const SUBJECT_REQUIRED = 'Identity subject is required.';
const TENANT_INVALID = 'Identity tenant must be a string when present.';

export type IdentityKey = {
  issuer: string;
  subject: string;
  tenant?: string;
};

export function parseIdentityKey(value: unknown): ContractResult<IdentityKey> {
  const record = parseRecord(value, 'Identity key must be an object.');
  if (!record.ok) {
    return record;
  }
  const issuer = parseIssuer(record.value.issuer);
  if (!issuer.ok) {
    return issuer;
  }
  const subject = parseNonEmptyString(record.value.subject, SUBJECT_REQUIRED);
  if (!subject.ok) {
    return subject;
  }
  const tenant = parseOptionalNonEmptyString(record.value.tenant, TENANT_INVALID);
  if (!tenant.ok) {
    return tenant;
  }
  if (tenant.value === undefined) {
    return contractOk({ issuer: issuer.value, subject: subject.value });
  }
  return contractOk({ issuer: issuer.value, subject: subject.value, tenant: tenant.value });
}

export function identityKeyEquals(left: IdentityKey, right: IdentityKey): boolean {
  return (
    left.issuer === right.issuer &&
    left.subject === right.subject &&
    (left.tenant ?? '') === (right.tenant ?? '')
  );
}

export function serializeIdentityKey(key: IdentityKey): string {
  const tenant = key.tenant ?? '';
  return `iss=${encodeURIComponent(key.issuer)}&tid=${encodeURIComponent(tenant)}&sub=${encodeURIComponent(key.subject)}`;
}

function parseIssuer(value: unknown): ContractResult<string> {
  const raw = parseNonEmptyString(value, 'Identity issuer is required.');
  if (!raw.ok) {
    return raw;
  }
  const url = parseAbsoluteHttpUrl(raw.value, 'Identity issuer');
  if (!url.ok) {
    return url;
  }
  if (url.value.search.length > 0 || url.value.hash.length > 0) {
    return contractFail('Identity issuer must not include query or fragment.');
  }
  return contractOk(raw.value);
}
