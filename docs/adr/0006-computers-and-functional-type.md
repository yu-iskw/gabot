# 6. Computers on instances; functional type is frozen

Date: 2026-09-04

## Status

Accepted

## Context

Cloud Run Agent Platform flags (`--functional-type`, `--identity-type`) apply to
services and jobs only, and functional type cannot be changed later. Per-bot
Chromium needs a singleton lifecycle. Cloud Run instances support stop/start and
`--sandbox-launcher`, but not Agent Identity. Chromium on Cloud Run gVisor is
fragile (OpenBot deployment notes).

## Decision

- **Compose:** `supervisor` plus `computer` (Playwright Chromium), computer off the
  `data` network.
- **Production:** one Cloud Run **instance** per bot with sandbox for untrusted
  shell. If gVisor Chromium fails, escalate to GKE sandboxes.
- **Mastra services:** `--functional-type=agent --identity-type=agent-identity` on
  first deploy.
- **MCP services:** `--functional-type=mcp-server`.
- **API:** plain Cloud Run service (no functional type). It is a gateway, not an
  agent.

## Consequences

A mistaken `functional-type=agent` on the API cannot be unset. Dockerfiles and
`docs/deploy.md` name the flags per image. Compose does not set those flags; the
identity adapter stands in.
