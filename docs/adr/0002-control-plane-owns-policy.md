# 2. Control plane owns policy and audit

Date: 2026-09-04

## Status

Accepted

## Context

OpenBot's product is a fail-closed gateway: every file, shell, MCP, and
component call is decided and recorded before it happens. Mastra agents and remote
AG-UI bots must not reach those surfaces directly.

## Decision

`packages/api` is the only process allowed to call MCP servers and the
credential vault. Agents receive tool _descriptions_ and emit AG-UI tool calls. The
API evaluates CEL policy, writes an audit row, then forwards or refuses.

Agents never hold database credentials for product tables.

## Consequences

A compromised coworker container cannot skip the boundary. Compose keeps
untrusted runtimes off the AlloyDB Omni network. Cloud Run should keep the same
split: the API service is not `--functional-type=agent`.
