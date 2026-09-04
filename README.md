# gabot

Google Cloud coworker platform: governed agents, computers, and MCP without CopilotKit.

## Getting Started

### Prerequisites

- [pnpm](https://pnpm.io/) **11.x** (see `packageManager` in `package.json`; use [Corepack](https://nodejs.org/api/corepack.html): `corepack enable`)
- Node.js **22+** (see `engines` in `package.json`; `.node-version` pins the version used for local dev and CI)
- Docker, for the Compose stack (AlloyDB Omni, Auth emulator, API, app, agent, computer)

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
- `packages/agent`: Mastra coworker (AG-UI + A2A card)
- `packages/computer`: Playwright Chromium computer
- `packages/supervisor`: Per-bot computer lifecycle
- `packages/jobs`: Work-queue sweeps
- `packages/scripted-model`: Deterministic OpenAI-compatible stub
- `packages/mcp-mock`: Streamable HTTP MCP server for tests
- `e2e`: Playwright journeys against Compose
- `docs/adr`: Architecture decisions
- `docs/deploy.md`: Cloud Run production mapping

## License

Apache-2.0
