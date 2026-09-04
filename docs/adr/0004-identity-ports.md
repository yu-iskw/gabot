# 4. Identity and people auth are ports

Date: 2026-09-04

## Status

Accepted

## Context

Cloud Run Agent Identity (SPIFFE, certificate-bound tokens) is Preview as of
2026-09-01 and exists only on services and jobs. Docker Compose cannot mint those
principals. People sign-in in production is Identity Platform; locally it is the
Firebase Auth emulator.

## Decision

`packages/common` defines `PeopleAuthPort`, `AgentIdentityPort`, and `RegistryPort`.

- Compose people auth: Auth emulator (`FIREBASE_AUTH_EMULATOR_HOST`).
- Compose agent identity: HMAC-signed tokens whose `sub` uses the SPIFFE-shaped
  principal string.
- Production people auth: Identity Platform.
- Production agent identity: Cloud Run metadata server / ADC.

The API verifies people tokens the same way in both environments (Firebase Admin).
The emulator accepts unsigned tokens when the host env var is set.

## Consequences

Playwright and Vitest never need a GCP project. Production can swap adapters without
changing gateway or channel code.
