import { contractFail, contractOk, parseNonEmptyString } from './contract-result.js';

import type { ContractResult } from './contract-result.js';

const ORIGIN_PATH = 'Origin must not include a path.';
const ORIGIN_QUERY = 'Origin must not include query or fragment.';

export function parseAbsoluteHttpUrl(value: unknown, label: string): ContractResult<URL> {
  const raw = parseNonEmptyString(value, `${label} is required.`);
  if (!raw.ok) {
    return raw;
  }
  let url: URL;
  try {
    url = new URL(raw.value);
  } catch {
    return contractFail(`${label} is not a valid URL.`);
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    return contractFail(`${label} must be http or https.`);
  }
  if (url.username.length > 0 || url.password.length > 0) {
    return contractFail(`${label} must not include credentials.`);
  }
  return contractOk(url);
}

export function parseHttpOrigin(value: unknown): ContractResult<string> {
  const url = parseAbsoluteHttpUrl(value, 'Origin');
  if (!url.ok) {
    return url;
  }
  if (url.value.search.length > 0 || url.value.hash.length > 0) {
    return contractFail(ORIGIN_QUERY);
  }
  if (url.value.pathname !== '' && url.value.pathname !== '/') {
    return contractFail(ORIGIN_PATH);
  }
  return contractOk(url.value.origin);
}
