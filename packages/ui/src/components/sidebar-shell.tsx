/** Gabot workspace shell inspired by OpenBot sidebar layout; no backend or auth coupling. */
import type { ReactNode } from "react";
import { cn } from "../lib/cn";
export interface SidebarShellProps {
  sidebar: ReactNode;
  children: ReactNode;
  className?: string;
  sidebarLabel?: string;
}
export function SidebarShell({ sidebar, children, className, sidebarLabel = "Workspace navigation" }: SidebarShellProps) {
  return <div className={cn("flex min-h-svh w-full bg-background text-foreground", className)}>
    <aside aria-label={sidebarLabel} className="hidden w-64 shrink-0 border-r border-sidebar-border bg-sidebar text-sidebar-foreground md:block">{sidebar}</aside>
    <main className="min-w-0 flex-1">{children}</main>
  </div>;
}
