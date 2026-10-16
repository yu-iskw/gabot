/**
 * Adapted from CopilotKit/OpenBot app/src/components/ui/empty.tsx
 * Upstream commit: 9f58e7fd9350c11e2b3496953b0e50883fc7e67e (MIT).
 * Changes: relative import; remove class-variance-authority dependency in favor of a simple discriminated variant.
 */
import type { ComponentProps } from "react";
import { cn } from "../lib/cn";

type DivProps = ComponentProps<"div">;
export function Empty({ className, ...props }: DivProps) {
  return <div data-slot="empty" className={cn("flex w-full min-w-0 flex-1 flex-col items-center justify-center gap-4 rounded-xl border-dashed p-6 text-center text-balance", className)} {...props} />;
}
export function EmptyHeader({ className, ...props }: DivProps) {
  return <div data-slot="empty-header" className={cn("flex max-w-sm flex-col items-center gap-2", className)} {...props} />;
}
export function EmptyMedia({ className, variant = "default", ...props }: DivProps & { variant?: "default" | "icon" }) {
  const variantClasses = variant === "icon" ? "flex size-8 shrink-0 items-center justify-center rounded-lg bg-muted text-foreground [&_svg:not([class*='size-'])]:size-4" : "bg-transparent";
  return <div data-slot="empty-icon" data-variant={variant} className={cn("mb-2 flex shrink-0 items-center justify-center [&_svg]:pointer-events-none [&_svg]:shrink-0", variantClasses, className)} {...props} />;
}
export function EmptyTitle({ className, ...props }: DivProps) {
  return <div data-slot="empty-title" className={cn("font-heading text-sm font-medium tracking-tight", className)} {...props} />;
}
export function EmptyDescription({ className, ...props }: DivProps) {
  return <div data-slot="empty-description" className={cn("text-sm/relaxed text-muted-foreground [&>a]:underline [&>a]:underline-offset-4 [&>a:hover]:text-primary", className)} {...props} />;
}
export function EmptyContent({ className, ...props }: DivProps) {
  return <div data-slot="empty-content" className={cn("flex w-full max-w-sm min-w-0 flex-col items-center gap-2.5 text-sm text-balance", className)} {...props} />;
}
