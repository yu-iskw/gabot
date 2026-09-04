# 1. Record architecture decisions

Date: 2026-09-04

## Status

Accepted

## Context

gabot is a Google Cloud reimplementation of OpenBot. The first decisions (control plane,
database, identity, protocols, computers, Cloud Run functional types) need a durable
place that every coding agent can find.

## Decision

Use Architecture Decision Records under `docs/adr`, one decision per file, numbered in
order. Later records may supersede earlier ones; they do not silently rewrite them.

## Consequences

New significant choices get an ADR before they spread through packages. The six records
that follow freeze the split-plane design used by Compose and by Cloud Run mapping.
