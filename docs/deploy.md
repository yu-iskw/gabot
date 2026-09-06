# Production deploy (Cloud Run)

This repository is testable with Docker Compose. Live GCP is not required for `pnpm test` or `pnpm test:e2e`. Use these flags when you do deploy.

## Resource types

| Compose service       | Cloud Run resource          | Flags                                                                                                  |
| --------------------- | --------------------------- | ------------------------------------------------------------------------------------------------------ |
| `api`                 | **Service**                 | Plain service. **Do not** set `--functional-type`. The gateway is not an agent; the flag is immutable. |
| `agent`               | **Service**                 | `--functional-type=agent --identity-type=agent-identity`                                               |
| `mcp-mock` / real MCP | **Service**                 | `--functional-type=mcp-server`                                                                         |
| `jobs` / `migrate`    | **Job**                     | `gcloud beta run jobs execute` for migrate, cull, routine sweep, handoff.                              |
| `app`                 | Service or Firebase Hosting | Later.                                                                                                 |

`--functional-type` cannot be changed after the first deploy. A mistaken `agent` type on `gabot-api` cannot be unset.

Agent Gateway does **not** govern Cloud Run. Use IAM `roles/run.invoker` plus the HMAC analog used locally (`GABOT_IDENTITY_SECRET`).

## Identity

People: Identity Platform (same Firebase Admin SDK as the Auth emulator).

Agents: Cloud Run Agent Identity principals. Compose mints SPIFFE-shaped HMAC tokens via `AgentIdentityPort`.

Registry: production introspects `/.well-known/agent-card.json`. Compose uses `RegistryPort` YAML.

## Data

AlloyDB (production) / AlloyDB Omni or `pgvector/pgvector:pg17` (Compose). Direct VPC egress from Cloud Run to AlloyDB. Threads live in AlloyDB (`threads`, `messages`), not CopilotKit Intelligence or Vertex Sessions.

Mastra `PostgresStore` uses the same instance (`mastra_threads` / `mastra_messages`). Mastra A2A task resume is in-memory and is **not** the handoff log; hops use `work_items`.

Example:

```bash
gcloud beta run deploy gabot-api \
  --image=IMAGE \
  --region=REGION \
  --no-allow-unauthenticated

gcloud beta run deploy gabot-agent \
  --image=IMAGE \
  --region=REGION \
  --functional-type=agent \
  --identity-type=agent-identity

gcloud beta run deploy gabot-mcp \
  --image=IMAGE \
  --region=REGION \
  --functional-type=mcp-server
```

Worker pools, Eventarc, Vertex Memory Bank, and live Drive/Notion OAuth are out of the Compose gate.
