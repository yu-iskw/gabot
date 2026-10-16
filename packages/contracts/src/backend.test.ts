import { describe, expect, it } from "vitest";
import { connectionKey, normalizeBackendUrl, validateBackendMetadata } from "./backend";
const good = { protocol: "gabot", protocolVersion: 1, backendId: "org-1", displayName: "Org One", auth: { mode: "session" }, capabilities: ["chat"] };
describe("backend discovery protocol", () => {
  it("accepts a minimal valid backend", () => expect(validateBackendMetadata(good).ok).toBe(true));
  it("rejects unknown versions", () => expect(validateBackendMetadata({ ...good, protocolVersion: 2 }).ok).toBe(false));
  it("rejects unknown capabilities", () => expect(validateBackendMetadata({ ...good, capabilities: ["computer"] }).ok).toBe(false));
  it("requires OIDC issuer", () => expect(validateBackendMetadata({ ...good, auth: { mode: "oidc-pkce" } }).ok).toBe(false));
  it("rejects malformed payloads", () => expect(validateBackendMetadata(null).ok).toBe(false));
  it("rejects credentials embedded in URL", () => expect(normalizeBackendUrl("https://user:password@example.com")).toBeNull());
  it("rejects insecure remote URLs", () => expect(normalizeBackendUrl("http://example.com")).toBeNull());
  it("permits explicit local development", () => expect(normalizeBackendUrl("http://localhost:3000", true)).toBe("http://localhost:3000"));
  it("isolates matching IDs on different origins", () => expect(connectionKey("https://a.example", "same")).not.toBe(connectionKey("https://b.example", "same")));
});
