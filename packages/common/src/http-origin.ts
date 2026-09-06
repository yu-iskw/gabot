import { contractFail, contractOk, parseNonEmptyString } from './contract-result.js';

import type { ContractResult } from './contract-result.js';

const ORIGIN_CREDENTIALS = 'Origin must not include credentials.';
const ORIGIN_PATH = 'Origin must not include a path.';
const ORIGIN_PROTOCOL = 'Origin must be http or https.';
const ORIGIN_QUERY = 'Origin must not include query or fragment.';
const ORIGIN_REQUIRED = 'Origin is required.';

export function parseHttpOrigin(value: unknown): ContractResult<string> {
  const raw = parseNonEmptyString(value, ORIGIN_REQUIRED);
  if (!raw.ok) {
    return raw;
  }
  return originFromUrl(raw.value);
}

function originFromUrl(value: string): ContractResult<string> {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    return contractFail('Origin is not a valid URL.');
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    return contractFail(ORIGIN_PROTOCOL);
  }
  if (url.username.length > 0 || url.password.length > 0) {
    return contractFail(ORIGIN_CREDENTIALS);
  }
  if (url.search.length > 0 || url.hash.length > 0) {
    return contractFail(ORIGIN_QUERY);
  }
  if (url.pathname !== '' && url.pathname !== '/') {
    return contractFail(ORIGIN_PATH);
  }
  return contractOk(url.origin);
}
