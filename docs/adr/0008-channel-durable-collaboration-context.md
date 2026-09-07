# 8. Channel is the durable collaboration context

Date: 2026-09-04

## Status

Accepted

## Context

A chat log of `messages` is not enough for humans and bots that share work across
turns. Runs, delegations, and tool effects need a durable place that outlives a
single AG-UI stream. The channel must belong to a Project (and thus a
single-owner Workspace per [ADR 0007](0007-workspace-single-execution-owner.md)).

## Decision

A Channel is first-class collaboration context, not just a message bag.

- Persist `channel_participants` (`user` | `bot`).
- Persist `channel_events` (`message.user`, `run.started`,
  `agent.delegation.*`, `run.*`, `tool.*`, and related kinds).
- Keep `messages` as the chat projection (dual-write).

The UI projects those events into a Slack-like transcript with expandable
run and delegation details.

## Consequences

Channel membership and history are queryable without replaying an in-memory
stream. New event kinds can land in `channel_events` without breaking the
`messages` projection. Clients must not treat `messages` as the only source of
truth for runs or bot-to-bot work.
