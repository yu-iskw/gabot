# 18. Catalog templates, marketplaces, and dual identity

Date: 2026-09-07

## Status

Accepted

Amends [0011](0011-bots-hold-no-downstream-credentials.md),
[0012](0012-catalog-connect-grant-invoke.md), and
[0014](0014-enterprise-workspace-contracts.md). Aligns clean-bootstrap notes with
[0017](0017-clean-bootstrap-prototype-is-reference.md). Does not change
[0016](0016-built-in-computer-out-of-product-scope.md): collaboration stays on
channel + runs + `work_items`, not a shared computer.

## Context

Bots, skills, and MCP tools are adjacent admin surfaces today, but share and
marketplace semantics are undefined. Grok Bot ships portable bot templates that
copy identity, skills, and routines without logins or secrets; MCP Server Cards
identify servers by a machine-readable `name`; A2A agent cards expose discovery
`skills[].id` that must not be confused with gabot Skill rows. Enterprise
backends need opaque durable ids that survive rename while keeping kebab handles
for `@mention`, `/skill`, and `mcp__{server}__{tool}` wire names.

## Decision

### Typed catalog spine

One catalog stores typed entries. Marketplace UIs are filtered views over that
catalog, not separate trust planes.

Entry types:

- `bot-template`
- `bot-team-template`
- `skill`
- `mcp-server`
- `a2a-agent`

Publisher kind is a field (`builtin` | `workspace` | `remote`), not a second
store.

Catalog stages remain `publish → admit → install → connect → grant → invoke`
([0012](0012-catalog-connect-grant-invoke.md)). Install copies declarations.
Connect and grant stay workspace-local. Invoke still requires
`invocationAuthorized`.

Scoped resources keep using `resourceType: 'catalog-entry'` with an `entryType`
on the payload so [`RESOURCE_TYPES`](../../packages/common/src/resource-ref.ts)
does not explode.

### Dual identity: UUID + slug

Every durable catalog or instance row carries both:

| Field  | Role                                                                                                                                     |
| ------ | ---------------------------------------------------------------------------------------------------------------------------------------- |
| `id`   | Canonical opaque primary key (UUID string). FKs, installs, grants, share URLs, and `ScopedResourceRef.localId` for catalog/instance rows |
| `slug` | Human / wire handle (kebab). Scoped uniqueness. Used for `@mention`, `/skill`, and MCP tool prefix                                       |

Template dependency refs serialize **UUIDs**. Slug snapshots may appear for
display only. Templates never embed `credential_ref`, tokens, connection ids, or
API keys ([0011](0011-bots-hold-no-downstream-credentials.md)).

| Type                | Slug uniqueness             | Notes                                                                        |
| ------------------- | --------------------------- | ---------------------------------------------------------------------------- |
| `bot-template`      | per catalog origin          | Share key = `id`                                                             |
| bot instance        | per workspace               | Mention-safe slug; UUID is durable PK                                        |
| `bot-team-template` | per catalog origin          | Members list bot-template **ids**                                            |
| `skill`             | per backend/workspace scope | Matches existing `skills.id` + `slug` pattern                                |
| `mcp-server`        | per backend/workspace scope | Tools named `mcp__{slug}__{tool}`; maps to MCP Server Card `serverInfo.name` |
| `a2a-agent`         | per backend                 | Agent-card URL + trust tier; remote card `skills[].id` are attributes only   |

Executable contracts live in `@gabot/common` (`catalog-templates.ts`): parsers,
`newCatalogId`, slug validation, secret rejection, and install checklist types.

### Bot and team shapes

A bot template is name, title, instruction (standing rules), optional skill UUID
refs, capability requirements (capability id + optional resource hint + optional
mcp catalog UUID), and a never-list. A bot-team template is a roster of bot
template UUID refs with roles. Installing a team materializes bot instances onto
a **channel** roster ([0008](0008-channel-durable-collaboration-context.md)); it
does not replace the channel.

### Marketplace views

1. Builtin bots — `bot-template`
2. Bot teams — `bot-team-template`
3. Skills — `skill`
4. MCP / plugins — `mcp-server`
5. A2A agents — `a2a-agent` (discovery/admit; hops remain gabot Runs)

### Schema sketch

Clean-bootstrap DDL for `catalog_entries`, `bot_instances`, and bindings is
recorded in [0018-catalog-bootstrap-sketch.sql](0018-catalog-bootstrap-sketch.sql).
It is not applied by the prototype migrate path; enterprise bootstrap consumes
it per [0017](0017-clean-bootstrap-prototype-is-reference.md).

## Consequences

Shareable coworker packs become credential-safe by construction. Renaming a bot
slug does not break team templates that point at UUIDs. Prototype kebab-only
`agents.id` remains until a later UUID migration of channel participants. UI
marketplace tabs and install APIs are follow-on work after these contracts.
