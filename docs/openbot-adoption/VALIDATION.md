# Validation gate for UI adoption

## Important: unverified build
GitHub source commits do not imply CI passed. As of this slice, the environment used for committing cannot run the repository's pnpm installation. The existing `pnpm-lock.yaml` predates the new `packages/ui` workspace package, and **frozen installs may fail until the lockfile is regenerated and committed**. This is a blocking gate, not a successful validation.

## Required remediation before merge
1. On Node >=22 with Corepack and pnpm 11.0.5, run `pnpm install --lockfile-only` (or `pnpm install`) and commit the updated `pnpm-lock.yaml`.
2. Resolve the React peer/dev dependencies and test dependencies for `@gabot/ui` using pnpm; do not manually invent integrity hashes.
3. Run `pnpm install --frozen-lockfile`, `pnpm build`, `pnpm test`, `pnpm lint`, `pnpm knip` and security workflows.
4. Run `pnpm --filter @gabot/ui typecheck` and add `@gabot/ui` tests to the root Vitest test discovery configuration if not already discovered.
5. Integrate `tokens.css` into a Tailwind v4 frontend build; capture light/dark visual snapshots and keyboard accessibility checks. Current CSS is not yet imported by a web app.
6. Check OpenBot MIT attribution and third-party assets before shipping.
7. Run a negative import-graph check to confirm UI code does not import computer/supervisor/server packages.

## Acceptance criteria
- Clean frozen-lockfile install succeeds.
- Build, lint, unit tests and typecheck pass in CI.
- Button disabled and keyboard behavior passes browser checks.
- Sidebar navigation is keyboard reachable; responsive mobile navigation is **not** implemented and must be designed in the next slice.
- Light/dark token snapshot comparison reviewed.
- No OpenBot runtime or computer dependency introduced.

## Scope boundary
This is a reusable UI foundation only. There is no working frontend application, no backend connection registry, no authentication, and no model integration in this slice.
