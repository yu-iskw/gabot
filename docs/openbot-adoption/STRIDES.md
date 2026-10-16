# Autonomous implementation strides and acceptance gates

## Execution policy
Work on `feat/openbot-foundation`; do not merge to `main` automatically. Each stride must leave a runnable or independently testable vertical slice. Gate progression on evidence, not the presence of source files. If CI fails, repair that stride before expanding scope. Never report green tests without a workflow result.

## Stride A — toolchain and UI foundation (current, **not yet accepted**)
Deliverables: OpenBot-derived UI primitives, light/dark tokens, isolated layout, tests and provenance.
Acceptance:
- `pnpm install --frozen-lockfile` succeeds after regenerating and committing `pnpm-lock.yaml`.
- `pnpm --filter @gabot/ui typecheck`, `pnpm --filter @gabot/ui test`, `pnpm build`, `pnpm test`, `pnpm lint`, `pnpm knip` pass.
- React keyboard and dark/light snapshot checks pass; attribution reviewed.
- No imports from OpenBot server, computer, supervisor or CopilotKit Intelligence.
Failure handling: fix lockfile/peer dependency or isolate UI package until clean; do not begin full app integration.

## Stride B — backend contract and fake backends (partially implemented, **not yet accepted**)
Deliverables: versioned metadata validator, connection identity and URL parser; two in-memory fake backends.
Acceptance:
- Validator rejects malformed/version-mismatched metadata and unknown capabilities.
- Two backends with the same advertised backend ID still have different connection/cache keys.
- Origin trust and explicit local HTTP exception documented; server-side SSRF mitigations remain separate.
- Contract tests pass with coverage; no network/model credentials needed.
- Fake backend tests demonstrate deterministic chat responses and backend-scoped identity.

## Stride C — executable web shell
Deliverables: pnpm/Vite React web app, imported UI styles, accessible workspace switcher, backend registry, mocked API.
Acceptance:
- Build serves a shell; mobile and desktop navigation work.
- Browser e2e adds two backends, switches A/B/A, verifies data isolation and persistence.
- Invalid URL/version/unreachable backend displays actionable error; no automatic credential forwarding.
- Playwright screenshots reviewed in light and dark modes; keyboard and screen-reader checks.

## Stride D — isolated backend and real Mastra chat
Deliverables: TypeScript API, independent per-backend auth interface, streaming fake model, Mastra adapter.
Acceptance:
- Two independent backend instances pass protocol conformance.
- E2E chat A/B shows zero cross-backend tokens, messages or query-cache bleed.
- Abort, disconnect, timeout, revocation and unauthorized actions covered.
- Real provider smoke test is opt-in; deterministic tests remain offline.

## Stride E — governed coworker MVP
Deliverables: bot configuration, user-delegated MCP actions, audit log, permission gates; A2A later.
Acceptance:
- Actor A shares a bot with B but B cannot execute under A's credentials.
- Denied MCP tool invocations produce audit evidence and no side effect.
- Every API route and agent tool uses explicit backend/actor context.
- Threat-model review, recovery/rollback tests and cloud deployment smoke pass.

## Definition of done for every stride
- Scope, source SHA, owner, test command and observed CI run recorded.
- Positive/negative tests; accessibility and security gates where relevant.
- Documented known limitations, migration/rollback, and reproducible verification.
- A failed gate means the stride is incomplete; later strides are not claimed complete.
