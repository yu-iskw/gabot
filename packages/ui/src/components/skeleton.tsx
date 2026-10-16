/**
 * Adapted from CopilotKit/OpenBot app/src/components/ui/skeleton.tsx
 * Upstream commit: 9f58e7fd9350c11e2b3496953b0e50883fc7e67e (MIT).
 * Changes: relative import; explicit React type-only import.
 */
import type { ComponentProps } from "react";
import { cn } from "../lib/cn";

export function Skeleton({ className, ...props }: ComponentProps<"div">) {
  return (
    <div
      data-slot="skeleton"
      className={cn("animate-pulse rounded-md bg-muted", className)}
      {...props}
    />
  );
}
