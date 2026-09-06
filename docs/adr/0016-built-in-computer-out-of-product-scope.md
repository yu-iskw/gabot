# 16. Built-in computer is outside gabot

Date: 2026-09-06

## Status

Accepted

Supersedes [0006](0006-computers-and-functional-type.md).

## Context

ADR 0006 put Chromium on a computer service and froze Cloud Run functional
types. The prototype required `COMPUTER_URL` / `COMPUTER_TOKEN`, shipped
`packages/computer` and `packages/supervisor`, and exposed watch and admin
computer UI. A shared browser is a tenancy leak. Issues #2 and #3 remove
built-in computer use from the product (AC-21).

This record is the product decision. The #7 deletion slice has removed those
packages and the `COMPUTER_*` boot requirement.

## Decision

gabot has no built-in browser lifecycle, screenshot interface, computer
supervisor, or mandatory sandbox service. A future independent MCP service may
offer computer use. That service is a separate project. It is not a launch
dependency and is not implemented here. Workspaces admit it only through the
catalog contract in [ADR 0014](0014-enterprise-workspace-contracts.md).

Do not add computer MCP to gabot.

## Consequences

Packages and `COMPUTER_*` boot have been removed by the #7 deletion slice. Do
not add computer MCP to gabot. Do not treat Compose `depends_on: computer` as
target architecture. Functional-type flags for Mastra and MCP services in 0006
remain relevant only where those services still exist.
