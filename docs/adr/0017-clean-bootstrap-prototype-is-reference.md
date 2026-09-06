# 17. Clean-bootstrap the enterprise schema; PR #1 is reference

Date: 2026-09-06

## Status

Accepted

## Context

`main` is the TypeScript template (`69d4f2f`). Product tables and seed live on
`feat/openbot-equivalent-coworker` / draft [PR #1](https://github.com/yu-iskw/gabot/pull/1).
Issue #7 says PR #1 is not an automatic merge target. It also requires an
inventory before choosing migration versus clean bootstrap.

No production workspace data is in this repository. `SCHEMA_SQL` mixes DDL,
legacy tables, unique-owner constraints, and seed. Identity is `users.email
UNIQUE`. Workspaces are `UNIQUE (owner_user_id)`. Agents are global.
`channel_policies` cannot encode empty deny. Credentials store encrypted
values. Runs have `owner_user_id` and no sponsor or audience.

## Decision

Do not merge PR #1 into `main` as the enterprise baseline. Keep it as a
reference prototype for protocol, AG-UI, grants, and durable runs.

Build the enterprise schema as a clean bootstrap from the empty `main` line
(or an additive module that does not import unique-owner invariants). Map
people to issuer/tenant/subject plus explicit memberships when any
non-disposable data appears. Preserve run and artifact ids only inside scoped
resource references. Reauthorize connections, installations, and grants.
Never copy OAuth secrets, `credential_ref` material, or grants across
workspace boundaries. Do not replay uncertain provider outcomes. Pause and
drain before any later cutover that has real data.

If a feat deployment later holds non-disposable rows, inventory those rows
before delete. Until then there is nothing to migrate.

Pilot configuration that is still unknown is listed in
[docs/pilot-configuration-checklist.md](../pilot-configuration-checklist.md).
Do not invent company IdP, model, egress, or retention values.

### Prototype inventory (not copied)

| Area                      | Prototype fact                    | Enterprise handling                           |
| ------------------------- | --------------------------------- | --------------------------------------------- |
| Users                     | `email UNIQUE`; upsert on email   | Identity key is issuer/tenant/subject         |
| Workspaces                | One owner; unique `owner_user_id` | Multi-human membership (#8)                   |
| Agents                    | Global table, unscoped list       | Workspace-local teammates                     |
| Credentials / connections | Encrypted values; owner-scoped    | Reauthorize per workspace; never copy         |
| Runs                      | `owner_user_id`; no audience      | Principal, sponsor, audience; keep ids scoped |
| Channel policies          | Missing rows inherit              | Empty deny is explicit (ADR 0015)             |
| Computer snapshot         | Required sandbox                  | Out of product (ADR 0016)                     |
| Legacy membership tables  | Kept for idempotent migrate       | Do not seed or revive                         |

## Consequences

Issue #8 can introduce membership without rewriting unique-owner rows in place.
CI on `feat` stays until the enterprise line carries the same gates (AC-22).
The computer deletion slice of #7 has landed. Closing #7 still requires a
filled checklist for #16, not this ADR alone.
