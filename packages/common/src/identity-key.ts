import {
  contractFail,
  contractOk,
  parseNonEmptyString,
  parseOptionalNonEmptyString,
  parseRecord,
} from './contract-result.js';

import type { ContractResult } from './contract-result.js';

const ISSUER_CREDENTIALS = 'Identity issuer must not include credentials.';
const ISSUER_PROTOCOL = 'Identity issuer must be http or https.';
const ISSUER_REQUIRED = 'Identity issuer is required.';
const SUBJECT_REQUIRED = 'Identity subject is required.';
const TENANT_INVALID = 'Identity tenant must be a string when present.';

export type IdentityKey = {
  issuer: string;
  subject: string;
  tenant?: string;
};

export type PersonAttributes = {
  email?: string;
  name?: string;
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
  return contractOk(identityKey(issuer.value, subject.value, tenant.value));
}

export function identityKey(issuer: string, subject: string, tenant?: string): IdentityKey {
  if (tenant === undefined) {
    return { issuer, subject };
  }
  return { issuer, subject, tenant };
}

export function identityKeyEquals(left: IdentityKey, right: IdentityKey): boolean {
  return serializeIdentityKey(left) === serializeIdentityKey(right);
}

export function serializeIdentityKey(key: IdentityKey): string {
  const tenant = key.tenant ?? '';
  return `iss=${encodeURIComponent(key.issuer)}&tid=${encodeURIComponent(tenant)}&sub=${encodeURIComponent(key.subject)}`;
}

function parseIssuer(value: unknown): ContractResult<string> {
  const raw = parseNonEmptyString(value, ISSUER_REQUIRED);
  if (!raw.ok) {
    return raw;
  }
  let url: URL;
  try {
    url = new URL(raw.value);
  } catch {
    return contractFail('Identity issuer is not a valid URL.');
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    return contractFail(ISSUER_PROTOCOL);
  }
  if (url.username.length > 0 || url.password.length > 0) {
    return contractFail(ISSUER_CREDENTIALS);
  }
  url.hash = '';
  url.search = '';
  const path = url.pathname === '/' ? '' : url.pathname.replace(/\/$/u, '');
  return contractOk(`${url.protocol}//${url.host}${path}`);
}
