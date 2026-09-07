# 19. Atlas Community Edition for schema migrations

Date: 2026-09-07

## Status

Accepted

Amends [0003](0003-alloydb-system-of-record.md) and
[0017](0017-clean-bootstrap-prototype-is-reference.md) by replacing the
idempotent Node `SCHEMA_SQL` migrate path with versioned SQL migrations.

## Context

Product DDL lived in `packages/api/src/db/schema-sql.ts` and was applied by
`packages/api/src/migrate.ts` as one idempotent blob (`CREATE IF NOT EXISTS`
plus backfill DML and seed). That model cannot express ordered schema history,
blocks PR review of diffs, and mixed DDL with catalog seed.

Atlas Community Edition (Apache 2.0) provides `migrate apply`, `status`, and
`hash` without Atlas Cloud or Pro. Official GitHub Actions lint/`migrate push`
paths assume the standard distribution and often Registry login. Full
`migrate lint` on the default CLI is Pro-gated from Atlas v0.38. PostgreSQL
extensions are outside the Community schema graph, but `CREATE EXTENSION` still
runs when present in a migration file.

## Decision

1. Store versioned SQL under `db/migrations/` with `atlas.sum` integrity hashes.
2. Pin **`arigaio/atlas:<version>-community`** for Compose and Cloud Run migrate
   Jobs. Do not require `ATLAS_CLOUD_TOKEN` or Atlas Registry for apply.
3. Configure `atlas.hcl` with `local` and `ci` envs pointing at
   `file://db/migrations`.
4. Keep **seed** separate in `db/seed/dev.sql` (Compose only). Do not use Atlas
   Pro declarative data sync.
5. Lint migration SQL in CI with **Squawk**, not Atlas Pro `migrate lint`.
6. Hand-author migrations for now. Any future `migrate diff` must use a
   pgvector-capable dev URL (`docker://pgvector/pg17/dev`).
7. Remove Drizzle from the migrate path (`drizzle-orm` / `schema.ts` / Node
   migrate entrypoint).

## Consequences

Compose runs Atlas apply, then a one-shot seed. Cloud Run migrate Jobs run Atlas
apply only (no Compose seed). ADR 0018 catalog sketch remains a follow-up
migration. Developers must run `atlas migrate hash` (Community CLI or container)
after editing migration files.
