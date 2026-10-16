# OpenBot selective adoption audit (initial pass)

Status: preliminary source inspection, not an exhaustive dependency/license/security audit. Date: 2026-10-16.

## Source pinning
- Gabot baseline: `69d4f2f18a656ea0dc18f6b4edc06950baca51f5` (`main`).
- OpenBot baseline: `9f58e7fd9350c11e2b3496953b0e50883fc7e67e` (`main`).
- OpenBot license: MIT; Gabot license: Apache-2.0. Preserve copyright notices and track provenance for each copied file.

## Observed repository structure
Gabot is a pnpm 11 / Node >=22 TypeScript template with `packages/common`, Vitest, ESLint, Trunk, CodeQL, SBOM and supply-chain restrictions (seven-day release-age quarantine, blocked exotic subdependencies, allowBuilds). It includes agent-specific guidance folders (`.agents`, `.claude`, `.codex`, `.cursor`, `.gemini`). Preserve these as baseline.

OpenBot uses Bun workspaces and includes `app/` (React/Vite UI), `server/` (Hono API), `shared/`, `worker/`, `agent-mastra/`, `agent-computer/`, `supervisor/`, desktop/mobile, and other agent harnesses. Its documented architecture couples CopilotKit Intelligence, AG-UI remote bots, PostgreSQL and governed computer/browser actions. The frontend imports `@openbot/shared`; app scripts depend on Bun and generated app config. Therefore copying `app/` without adaptation is **not** plug-and-play.

OpenBot frontend areas observed: `components/ui`, `layout`, `app-sidebar`, `bots`, `bot-profile`, `channels`, `agents`, `approvals`, `settings`, `auth`, `computer`, `routines`, `plugins`, `skills`, `memory`, `admin`. Routing uses TanStack Router. Frontend package uses React 19, Vite 7, TanStack Router/Query, Tailwind, Base UI, CopilotKit, AG-UI, Better Auth and several UI libraries.

The OpenBot Mastra harness explicitly exposes Mastra's own HTTP API, with OpenBot translating to AG-UI via `@ag-ui/mastra` in the server. Its inspected model builder supports OpenAI and Anthropic modules only, **not** Gabot's required Vertex AI/Bedrock model routing as-is.

## Candidate reuse matrix
| Source | Decision | Rationale | Pre-copy gate |
|---|---|---|---|
| `app/src/components/ui`, theme and styles | COPY/ADAPT first | Highest visual leverage | dependency/import/license inventory; visual snapshots |
| `app/src/components/layout`, `app-sidebar` | ADAPT | Workspace UX | remove single-backend assumptions |
| `app/src/components/bots`, `bot-profile` | ADAPT in later slices | Bot management UX | identify API, state, and permission dependencies |
| `app/src/components/channels`, `agents` | DEFER | Chat experience useful but coupled | streaming and thread contract first |
| `app/src/routes`, router/query setup | REFERENCE/REBUILD | Existing auth/backend assumptions | independent session isolation |
| `app/src/components/auth` | REBUILD | Backend-specific auth | OIDC/PKCE/session design |
| `app/src/components/computer` | EXCLUDE | Dedicated computer explicitly out of scope | verify transitive imports |
| `server/src/computer`, `supervisor`, `agent-computer` | EXCLUDE | Out of scope | ensure no runtime dependency |
| `server/src/approvals`, `audit`, `team-bots` | REFERENCE first | Valuable concepts, likely tight coupling | policy/identity threat model |
| `shared/` | SELECTIVE extraction | Some pure types/helpers reusable | inspect imports and browser compatibility |
| `agent-mastra/` | REFERENCE/ADAPT | Relevant agent harness | remove OpenBot-specific shared imports, add model adapters |
| `worker/`, routines | DEFER | unattended delegated identity unresolved | explicit identity decision |
| `desktop/`, `mobile/` | EXCLUDE initial | centrally hosted web-first | no need for MVP |

## Required detailed follow-up audit before code copying
1. Build a complete source/import graph for candidate UI components; identify `@openbot/shared`, server APIs, generated config, Bun globals, browser-only APIs, computer tooling and CopilotKit Intelligence dependencies.
2. Verify frontend license headers, third-party assets/icons/fonts, and dependency licenses; document attribution in `THIRD_PARTY_NOTICES.md`.
3. Review API hooks, router loaders, auth context, query keys, local storage and streaming code for cross-backend cache/token leakage.
4. Create an inventory of Grok Bot features from primary docs; do not equate OpenBot features with Grok parity.
5. Record each adopted path, source SHA, modifications and verification evidence in an adoption manifest.
6. Validate pnpm 11 installation and existing Gabot lint/test/build CI after every extraction. Never replace Gabot root package.json, lockfile, workflows or agent guidance wholesale.

## Sources
- https://github.com/CopilotKit/OpenBot/tree/9f58e7fd9350c11e2b3496953b0e50883fc7e67e
- https://github.com/CopilotKit/OpenBot/blob/9f58e7fd9350c11e2b3496953b0e50883fc7e67e/docs/architecture.md
- https://github.com/CopilotKit/OpenBot/blob/9f58e7fd9350c11e2b3496953b0e50883fc7e67e/app/package.json
- https://github.com/CopilotKit/OpenBot/blob/9f58e7fd9350c11e2b3496953b0e50883fc7e67e/agent-mastra/src/mastra/index.ts
- https://github.com/yu-iskw/gabot/tree/69d4f2f18a656ea0dc18f6b4edc06950baca51f5
