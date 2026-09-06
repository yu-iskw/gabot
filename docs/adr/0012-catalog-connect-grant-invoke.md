# 12. Catalog, connect, grant, and invoke are separate

Date: 2026-09-05

## Status

Accepted

## Context

Admin copy treated "the model cannot see this tool" as the same fact as "the
bot may not call it." MCP tools were always in `TURN_TOOLS`. Grants lived on
the bot.

## Decision

These stages stay distinct:

1. Catalog. The tool exists (`TURN_TOOLS`, plugin catalogue).
2. Connect. The owner has a connection for a provider.
3. Grant. A capability grant names a resource on that connection.
4. Invoke. The gateway checks the Run envelope, then the grant, then resolves
   `credential_ref`.

Install of a catalog entry does not authorize invoke.

## Consequences

Plugin admin grants are workspace resource grants. A denied resource fails
closed even when the tool is catalogued. Approval transactions are a later
stage, not folded into grant.
