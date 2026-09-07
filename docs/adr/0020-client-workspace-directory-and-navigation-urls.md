# 20. Client workspace directory and navigation URLs

Date: 2026-09-07

## Status

Accepted

Amends [0014](0014-enterprise-workspace-contracts.md). Aligns navigation dual
identity with [0018](0018-catalog-templates-dual-identity.md). Schema changes
use Atlas ([0019](0019-atlas-community-schema-migrations.md)).

## Context

ADR 0014 requires a company-hosted client that switches workspaces like Slack
and binds each session to one backend origin. The app still used a single API
proxy and shallow routes (`/channel/$channelId`). Compose can run two backends
(`dual` profile), but the UI could not select between them. Deep links need a
human workspace handle and a durable channel id that survives rename.

## Decision

The company-hosted client ships a **workspace directory**: a JSON list of
approved entries

`{ slug, displayName, upstream, backendId, workspaceId, authDomain, tokenAudience, domain? }`.

`slug` is globally unique in the directory (cross-backend). Each entry maps to
exactly one backend origin (`upstream`) and that backend’s `workspaceId`.
`authDomain` and `tokenAudience` bind the browser IdP to that backend
([0021](0021-per-backend-membership-gated-workspace-login.md)). Optional `domain`
is the Slack-like locator handle. Switching workspace signs out and re-auths;
it does not reuse the previous IdP token under a new slug header.

Browser calls stay same-origin (`/api/*`). The app BFF selects the upstream from
the `X-Gabot-Workspace-Slug` request header. Unknown slugs are rejected. The
client does not aggregate APIs across backends.

Navigation URLs:

`/workspaces/<slug>/channels/<channelPublicId>`

- **slug**: directory + `workspaces.slug` (human handle; kebab).
- **channelPublicId**: `channels.public_id` (UUID). Internal `channels.id` TEXT
  remains the FK primary key (dual identity per ADR 0018 pattern).

Switching workspace updates the active slug, rebinds BFF upstream, navigates
into that workspace’s routes, and clears client caches keyed by session scope
(origin / workspace / generation).

Legacy `/channel/$channelId` redirects into the new scheme when resolvable.

## Consequences

Compose dual backends become first-class in the UI via directory entries
`gabot` → `http://api:3001` and `gabot-b` → `http://api-b:3001`. Each entry also
names `authDomain` and `tokenAudience` so login cannot be shared across backends
([0021](0021-per-backend-membership-gated-workspace-login.md)). API channel
routes accept `public_id` or internal `id`. Product chrome keeps the gabot
brand; a dedicated workspace switcher owns selection. No cross-workspace search,
credentials, or gateway aggregation in this release.
