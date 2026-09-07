# 10. Delegation can only attenuate authority

Date: 2026-09-04

## Status

Accepted

## Context

Child bots may be more capable than the parent that invoked them. Without an
envelope, a child could call tools the parent was never allowed to use, or that
the owner did not pass down for this Run ([ADR
0009](0009-durable-run.md)).

## Decision

`child_authority ⊆ parent_authority`. The P0 envelope is the set of allowed
tool names (not OAuth tokens). The gateway checks the run envelope **before**
`plugin_grants`. A more-privileged child bot cannot invoke tools the parent did
not pass.

P0 budgets: max depth 3, max children per run 8, max runs per root 16.

P1 will add owner connections and capability grants. This subset rule still
holds.

## Consequences

Delegation is a narrowing operation, never a privilege escalation. Envelope
violations fail closed at the gateway even if the child agent asks. Budget
caps bound fan-out; raising them is a later decision, not an implicit default.
