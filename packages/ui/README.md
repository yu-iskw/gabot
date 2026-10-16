# @gabot/ui — first OpenBot adoption slice

Minimal, framework-agnostic-to-backend React primitives adapted from pinned OpenBot source. No auth, backend, AG-UI or computer imports.

Run after pnpm resolves dependencies:

```bash
pnpm install
pnpm --filter @gabot/ui typecheck
pnpm --filter @gabot/ui build
```

Styles use OpenBot's Tailwind semantic utility classes; appearance requires a future design-token and Tailwind integration slice. This is **not** a finished visual migration.
