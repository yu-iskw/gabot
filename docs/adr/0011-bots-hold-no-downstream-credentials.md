# 11. Bots hold no downstream credentials

Date: 2026-09-05

## Status

Accepted

## Context

P0 gave each workspace an owner and a tool-name Run envelope
([ADR 0010](0010-delegation-attenuates-authority.md)). Authorization was still
`plugin_grants` keyed by bot id. A bot that "had GitHub" would look like it
owned the token.

## Decision

Owner **connections** hold an opaque `credential_ref`. Bots request
capabilities from the catalog. The gateway resolves the connection only after
the Run envelope and a resource grant both allow the call. Agents never receive
the ref or any token material.

## Consequences

Catalog listing is not permission. Per-bot grant switches are gone. Live OAuth
and approval waits are later P1 work. The subset envelope rule still holds
before any connection lookup.
