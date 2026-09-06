# 3. AlloyDB is the system of record

Date: 2026-09-04

## Status

Accepted

## Context

OpenBot stored product data in PostgreSQL and threads in CopilotKit Intelligence.
gabot cannot depend on CopilotKit. Vertex Sessions and Memory Bank cannot be the
Compose system of record. Firebase Data Connect is Cloud SQL, not AlloyDB.

## Decision

All product tables, audit rows, grants, and conversation threads live in one
PostgreSQL-compatible database. Local: AlloyDB Omni (`google/alloydbomni`) with
`PGDATA` in a subdirectory. Production: AlloyDB. Mastra `PostgresStore` uses the
same instance for agent memory, not a second database.

If Omni's ARM image fails on Apple Silicon, the Compose `pgvector` profile using
`pgvector/pgvector:pg17` is the fallback. The schema is identical.

## Consequences

Compose tests prove the real schema. Memory Bank, if added later, is a port behind
`ModelPort` / a memory port, never the conversation log.
