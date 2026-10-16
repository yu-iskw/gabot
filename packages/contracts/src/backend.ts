/** Backend discovery protocol v1. Data-only: no credentials or side effects. */
export interface BackendMetadata {
  protocol: "gabot";
  protocolVersion: 1;
  backendId: string;
  displayName: string;
  auth: { mode: "oidc-pkce" | "session"; issuer?: string };
  capabilities: readonly ("chat" | "bots" | "mcp" | "a2a")[];
}
export type ValidationResult = { ok: true; value: BackendMetadata } | { ok: false; reason: string };
const allowed = new Set(["chat", "bots", "mcp", "a2a"]);
const own = (o: object, key: string): unknown => Object.hasOwn(o, key) ? (o as Record<string, unknown>)[key] : undefined;
const record = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);
export function validateBackendMetadata(value: unknown): ValidationResult {
  if (!record(value)) return { ok: false, reason: "metadata must be an object" };
  if (own(value, "protocol") !== "gabot" || own(value, "protocolVersion") !== 1) return { ok: false, reason: "unsupported protocol/version" };
  const id = own(value, "backendId");
  if (typeof id !== "string" || !/^[a-zA-Z0-9][a-zA-Z0-9._:-]{0,127}$/.test(id)) return { ok: false, reason: "invalid backendId" };
  const name = own(value, "displayName");
  if (typeof name !== "string" || name.trim().length === 0 || name.length > 120) return { ok: false, reason: "invalid displayName" };
  const auth = own(value, "auth");
  if (!record(auth) || (auth.mode !== "oidc-pkce" && auth.mode !== "session")) return { ok: false, reason: "invalid auth mode" };
  if (auth.issuer !== undefined && (typeof auth.issuer !== "string" || !auth.issuer.startsWith("https://"))) return { ok: false, reason: "invalid issuer" };
  if (auth.mode === "oidc-pkce" && typeof auth.issuer !== "string") return { ok: false, reason: "OIDC issuer required" };
  const caps = own(value, "capabilities");
  if (!Array.isArray(caps) || caps.some(c => typeof c !== "string" || !allowed.has(c)) || new Set(caps).size !== caps.length) return { ok: false, reason: "invalid capabilities" };
  return { ok: true, value: { protocol: "gabot", protocolVersion: 1, backendId: id, displayName: name, auth: { mode: auth.mode, ...(auth.issuer === undefined ? {} : { issuer: auth.issuer as string }) }, capabilities: caps as BackendMetadata["capabilities"] } };
}
/** URL parsing only. This does not authorize network access or protect a server-side proxy from SSRF. */
export function normalizeBackendUrl(input: string, allowInsecureLoopback = false): string | null {
  try {
    const url = new URL(input);
    if (url.username || url.password || url.search || url.hash) return null;
    const local = url.hostname === "localhost" || url.hostname === "127.0.0.1" || url.hostname === "[::1]";
    if (url.protocol !== "https:" && !(allowInsecureLoopback && local && url.protocol === "http:")) return null;
    if (url.pathname !== "/" && url.pathname !== "") return null;
    return url.origin;
  } catch { return null; }
}
/** Stable key prevents cache/session mixing when two URLs advertise the same backendId. */
export function connectionKey(origin: string, backendId: string): string {
  return JSON.stringify([origin, backendId]);
}
