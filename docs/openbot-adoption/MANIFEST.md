# Upstream adoption manifest

Upstream repository: https://github.com/CopilotKit/OpenBot
Pinned source commit: `9f58e7fd9350c11e2b3496953b0e50883fc7e67e`
Upstream license: MIT. Preserve OpenBot copyright/license notices; see upstream LICENSE before redistribution.

| Gabot file | OpenBot source | Changes |
|---|---|---|
| `packages/ui/src/components/skeleton.tsx` | `app/src/components/ui/skeleton.tsx` | relative `cn` import; explicit React types |
| `packages/ui/src/components/empty.tsx` | `app/src/components/ui/empty.tsx` | relative `cn` import; removed CVA dependency |
| `packages/ui/src/lib/cn.ts` | inspired by `app/src/lib/utils.ts` | independent lightweight implementation; no clsx/Tailwind merge |

**Caveat:** `cn` intentionally does not resolve conflicting Tailwind classes. Before broadening UI reuse, evaluate `clsx` + `tailwind-merge` and snapshot visual behavior. The UI package is source-only until dependency installation, typechecking, and CSS integration are validated in CI. These tests have **not** been run.

**No upstream root configuration, lockfile, backend, computer or supervisor code has been copied.**
