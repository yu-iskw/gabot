# 5. AG-UI for people, A2A for discovery and hops

Date: 2026-09-04

## Status

Accepted

## Context

OpenBot used AG-UI so any framework could be a coworker. Google Agent Registry
introspects `/.well-known/agent-card.json` (A2A). Mastra speaks both. Mastra's A2A
task store is in-memory and is unsafe across Cloud Run replicas.

## Decision

Human turns stream AG-UI events through the API. Each Mastra service also serves an
A2A agent card for Registry auto-registration. Bot-to-bot handoff is a `work_items`
row in AlloyDB, not a Mastra A2A paused task.

Built-in coworkers run on Mastra. Remote coworkers remain AG-UI HTTP endpoints.

## Consequences

Compose can assert the agent card without GCP. Handoff survives replica restarts.
Registry in production fills from the card; Compose uses `RegistryPort` YAML.

AG-UI wire format and Mastra bridging use official `@ag-ui/core`, `@ag-ui/encoder`,
`@ag-ui/client`, and `@ag-ui/mastra` (`MastraAgent` + `clientTools`), not bespoke
event/SSE adapters. The control plane still executes tools and durable hops remain
AlloyDB `work_items` (see ADR 0009).
