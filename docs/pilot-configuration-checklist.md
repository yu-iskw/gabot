# Pilot configuration checklist

Tracked by issue #7. Release evidence lives in issue #16. None of these
rows is decided. Do not invent company values to fill them.

| Choice                            | Status     | Notes                                   |
| --------------------------------- | ---------- | --------------------------------------- |
| Identity provider issuer URL      | Unresolved | Must match backend-intended tokens      |
| Identity provider tenant          | Unresolved | Omit when the issuer has no tenant      |
| Token audiences per backend       | Unresolved | Do not reuse audiences across backends  |
| Model endpoints and data handling | Unresolved | Per workspace, not a shared proxy       |
| Permitted test repository         | Unresolved | Engineering write hypothesis only       |
| Authorized external effects       | Unresolved | What the test repo may create or change |
| Internal read-only MCP service    | Unresolved | Payments hypothesis; admit locally      |
| Network and hosting constraints   | Unresolved | Egress, private DNS, secret namespaces  |
| Retention and export policy       | Unresolved | Per workspace; no cross-copy            |
| Service and recovery targets      | Unresolved | Measured in #16, not assumed here       |

Discovery documents may omit issuer and audience until this table is filled.
Discovery is not proof of trust.
