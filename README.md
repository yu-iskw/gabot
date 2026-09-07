# gabot

Personal AI-team workspace: one human works with autonomous AI teammates. Bots have capabilities, not credentials; privileged actions run through owner-delegated, run-scoped authority on the gabot control plane.

Channels belong to a personal workspace, not a shared global inbox.

## Getting Started

### Prerequisites

- [pnpm](https://pnpm.io/) **11.x** (see `packageManager` in `package.json`; use [Corepack](https://nodejs.org/api/corepack.html): `corepack enable`)
- Node.js **22+** (see `engines` in `package.json`; `.node-version` pins the version used for local dev and CI)
- Docker, for the Compose stack (AlloyDB Omni, Auth emulator, API, app, agent)

### Installation

```bash
pnpm install
```

### Local stack

```bash
pnpm compose:up
pnpm test
pnpm --filter @gabot/e2e exec playwright install chromium
pnpm test:e2e
```

The Compose file is [`compose/docker-compose.yml`](compose/docker-compose.yml). It runs the entire product, including the API and app. After Compose is up, open `http://127.0.0.1:3010` in a browser.

Optional second backend (Compose profile `dual`, see [profiles](https://docs.docker.com/compose/how-tos/profiles/)):

```bash
pnpm compose:up:dual
```

That starts backend B on `http://127.0.0.1:3002` (distinct DB `gabot_b`, workspace `ws-gabot-b`, Auth emulator `127.0.0.1:9199` / audience `demo-gabot-b`). The company-hosted app locates a workspace by slug or domain, then signs in to **that** backend’s IdP (ADR 0021). Directory: [`packages/app/workspace-directory.json`](packages/app/workspace-directory.json). Routes stay under `/workspaces/<slug>/…` (ADR 0020). Use `COMPOSE_PROFILES=dual` if you prefer the env-var form. `pnpm compose:down` passes `--profile dual` so profiled containers are removed.

For **20+ turn bot relays on Vertex** against both backends:

```bash
pnpm compose:up:dual:vertex
GABOT_LIVE_GEMINI=1 pnpm test:e2e:live-gemini
GABOT_LIVE_GEMINI=1 GABOT_LIVE_API_ONLY=1 GABOT_API_URL=http://127.0.0.1:3002 GABOT_LIVE_CHANNEL_ID=ch-gabot-b-general GABOT_AUTH_EMULATOR=http://127.0.0.1:9199 GABOT_FIREBASE_API_KEY=demo-gabot-b pnpm test:e2e:live-gemini
```

Default emulator user for tests: `admin@example.com` / `gabot-admin-pass`.

### Supply-chain protections

The template uses **pnpm 11** with settings in [`pnpm-workspace.yaml`](pnpm-workspace.yaml): a **7-day** [`minimumReleaseAge`](https://pnpm.io/settings#minimumreleaseage), [`blockExoticSubdeps`](https://pnpm.io/settings#blockexoticsubdeps), and an [`allowBuilds`](https://pnpm.io/settings#allowbuilds) map.

### Build

```bash
pnpm build
```

### Linting & Formatting

```bash
pnpm lint
pnpm format
```

## Project Structure

- `packages/common`: Shared types, CEL policy, identity and model ports
- `packages/api`: Hono control plane (gateway, audit, channels)
- `packages/app`: React UI
- `packages/agent`: Mastra coworker (AG-UI via `@ag-ui/mastra` + A2A card)
- `packages/jobs`: Work-queue sweeps
- `packages/scripted-model`: Deterministic stub consumed by Mastra's custom OpenAI-compatible endpoint config (default Compose only)
- `packages/agent`: Mastra coworker (`@ag-ui/mastra` AG-UI bridge + A2A card; `@ai-sdk/google-vertex` for live Gemini; Mastra custom endpoint for scripted)
- `packages/mcp-mock`: Streamable HTTP MCP server for tests
- `e2e`: Playwright journeys against Compose
- `docs/adr`: Architecture decisions
- `docs/deploy.md`: Cloud Run production mapping

## License

Apache-2.0
