# OpenBot-to-Gabot incremental adoption plan

Status: proposed plan; no OpenBot source files copied yet. Branch: `feat/openbot-foundation`.

## Non-negotiable architecture
- One centrally hosted web frontend can register and switch among independent backend URLs.
- Initially one backend = one organization = one workspace; each backend owns authentication, authorization, storage and Mastra execution.
- The frontend MUST partition sessions, cached queries, conversations and streams by backend identity; never reuse credentials across connections.
- User-delegated MCP/A2A execution; fail closed if delegation cannot be established.
- No agent computers, Chromium containers or supervisor.
- Google Cloud Run first; portable TypeScript core; Vertex AI (Gemini/Claude) and Bedrock adapters later.
- Preserve Gabot's pnpm/Node/TypeScript, tests, CI, security policy, license and coding-agent instructions.

## Target layout (proposed, not yet created)
```text
apps/web/                   # OpenBot-inspired UI, Gabot connection registry
apps/api/                   # independent organization backend (HTTP, auth, streaming)
packages/common/            # retain Gabot baseline
packages/contracts/         # versioned wire DTOs and schema validators
packages/ui/                # selectively adopted OpenBot visual primitives
packages/agent-runtime/     # Mastra adapter, no HTTP/framework leakage
packages/auth/              # per-backend authorization interfaces
packages/testing/           # fake providers, deterministic fixtures
infra/terraform/            # optional later Cloud Run deployment
docs/openbot-adoption/      # audit, manifest, migration log
```

## Phases / executable vertical slices
| Slice | Change | Automated evidence / stop condition |
|---|---|---|
| S00 baseline | Confirm Gabot `pnpm install --frozen-lockfile`, build, test, lint, security workflows on branch; capture results | baseline log; no pre-existing failures silently waived |
| S01 audit | Finish dependency and licensing inventory for UI primitives; document provenance | manifest includes source path/SHA/license/import closure; denylist for computer imports |
| S02 design shell | Adapt only reusable styles, tokens, buttons, cards, sidebar primitives into `packages/ui`; build static shell | Storybook or isolated component harness, unit/accessibility tests, screenshot comparisons |
| S03 contracts | Introduce `GET /v1/meta` with backend ID, API version, auth capabilities; validate origin and schema | contract tests with incompatible and malicious responses |
| S04 connections | Add/register/remove backend URL, explicit trust confirmation, switcher; block localhost/private IP only when backend-side fetch/proxy would create SSRF; do not silently proxy arbitrary endpoints | Playwright tests for A/B switching, malformed URL, incompatible backend, persisted registry |
| S05 auth | Independent login and logout per backend; per-backend session isolation; no shared tokens | browser e2e for simultaneous sessions and revoked credentials |
| S06 minimal chat | Gabot API + Mastra streaming fake model then real Vertex model; adapt OpenBot chat visuals | event ordering, cancellation, replay, timeout, no cross-backend messages |
| S07 bot builder | Adopt bot profile/config visuals; CRUD with schema validation and backend ACL | CRUD, permission-denied and concurrency tests |
| S08 teams | Team bot sharing of configuration only, not credentials | actor A/B access matrix; delegated tool identity assertions |
| S09 MCP | MCP discovery/invocation with per-user authorization and audit | positive/negative contract tests; injection and SSRF tests |
| S10 A2A | Remote A2A integration with explicit identity and scoped credentials | authenticated/unauthorized/cross-org e2e |
| S11 providers | Gemini/Claude via Vertex, Bedrock adapter; explicit model capability registry | mocked conformance suite and opt-in live smoke |
| S12 deploy | Terraform Cloud Run, separate backend services and databases | two independent backends, rollback and migration tests |
| S13 harden | load, accessibility, observability, backup/recovery, security | measured release gates, evidence artifacts |
| S14 parity | Grok Bot feature matrix from verified documentation | per-feature traceability from source -> story -> tests |

## Migration mechanics
1. Keep Gabot `main` untouched; work only in this branch and small PRs.
2. Copy files **by dependency closure**, never entire `app` or `server` trees.
3. For every copied file, record upstream commit/path, original license, changes and Gabot owner.
4. Prefer retaining visual primitives and rewriting OpenBot-specific data hooks to `packages/contracts` interfaces.
5. Do not migrate OpenBot Bun lockfile, Bun workspace settings, root scripts, env file, Docker Compose or CI into Gabot root.
6. Introduce one capability at a time, keeping `pnpm test`, `pnpm build`, `pnpm lint`, contract and e2e checks green.
7. Use test doubles and fixtures before real model/cloud dependencies; maintain reproducible agent eval sets.
8. No merge when source attribution, security tests, two-backend isolation or rollback evidence is missing.

## AI coding agent work order
Each task must specify: objective, allowed paths, forbidden paths, upstream source SHA, acceptance tests, exact commands, expected failure cases, evidence files and rollback. Agent implements; separate verification step checks behavior rather than trusting self-reported success. No claim of tests passing until CI actually runs.

### Example first implementation task
**S01-A:** Inventory OpenBot `app/src/components/ui` imports at the pinned SHA. Output a machine-readable manifest and copy **nothing**. Acceptance: every import resolves or is explicitly flagged, every third-party dependency has a license, computer-related imports are zero, reviewer can reproduce inventory. Next task S02 copies a small approved subset.

## Open questions / decisions required before S05
- Browser-compatible independent authentication across unrelated backend origins (OIDC PKCE/BFF strategy); avoid assuming third-party cookies work.
- Trust and allowed origins for manually registered backend URLs; token and browser storage safety.
- Whether to use AG-UI natively or translate to a smaller Gabot streaming contract.
- Scheduled runs under strictly user-delegated identity: postpone until authority and revocation semantics are designed.
- Which OpenBot UI dependencies are viable under Gabot pnpm 11 and existing release-age policy.

## References
See `docs/openbot-adoption/AUDIT.md` for source observations and pinned commits.
