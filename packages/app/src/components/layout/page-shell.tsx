import { IconChevronLeft, IconChevronRight } from '@tabler/icons-react';
import { Link } from '@tanstack/react-router';

import { cn } from '../../lib/utils.js';

import { SidebarToggle } from './sidebar-toggle.js';

import type { ReactNode } from 'react';

export function PageShell({
  action,
  backButton,
  children,
  description,
  title,
  width = 'prose',
}: {
  action?: ReactNode;
  backButton?: { label: string; to: string };
  children: ReactNode;
  description?: ReactNode;
  title: string;
  width?: 'prose' | 'wide';
}) {
  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex h-14 shrink-0 items-center gap-1 px-3">
        <SidebarToggle />
        {backButton ? (
          <Link
            to={backButton.to}
            className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
          >
            <IconChevronLeft className="size-4" />
            {backButton.label}
          </Link>
        ) : null}
      </div>
      <div
        className={cn(
          'mx-auto flex w-full flex-1 flex-col overflow-y-auto px-4 pb-12 pt-8',
          width === 'wide' ? 'max-w-5xl' : 'max-w-2xl',
        )}
      >
        <header className="flex flex-col gap-2">
          <div className="flex flex-row items-center justify-between gap-4">
            <h1 className="text-2xl font-bold">{title}</h1>
            {action}
          </div>
          {description ? (
            <p className="max-w-prose text-pretty text-sm leading-relaxed text-muted-foreground">
              {description}
            </p>
          ) : null}
        </header>
        {children}
      </div>
    </div>
  );
}

export function PageSection({
  action,
  children,
  description,
  title,
}: {
  action?: ReactNode;
  children?: ReactNode;
  description?: ReactNode;
  title?: string;
}) {
  return (
    <section className="mt-12">
      {title ? (
        <div className="flex min-h-8 flex-row items-center justify-between gap-4">
          <h2 className="text-lg font-bold">{title}</h2>
          {action}
        </div>
      ) : null}
      {description ? (
        <p className="mt-1 max-w-prose text-pretty text-sm leading-relaxed text-muted-foreground">
          {description}
        </p>
      ) : null}
      {children}
    </section>
  );
}

export function PageRows({ children }: { children: ReactNode }) {
  return (
    <div className="mt-4 overflow-hidden rounded-lg border border-border bg-card">{children}</div>
  );
}

export function PageEmpty({ children }: { children: ReactNode }) {
  return <p className="mt-4 text-sm text-muted-foreground">{children}</p>;
}

export function ItemRow({
  description,
  icon,
  summary,
  title,
  to,
}: {
  description: string;
  icon?: ReactNode;
  summary?: string;
  title: string;
  to: string;
}) {
  return (
    <Link to={to} className="flex items-center gap-3 px-4 py-3 hover:bg-muted/60">
      {icon ? <span className="text-muted-foreground">{icon}</span> : null}
      <span className="flex min-w-0 flex-1 flex-col gap-0.5">
        <span className="text-sm font-medium">{title}</span>
        <span className="text-sm text-muted-foreground">{description}</span>
      </span>
      {summary ? <span className="shrink-0 text-xs text-muted-foreground">{summary}</span> : null}
      <IconChevronRight className="size-4 shrink-0 text-muted-foreground" />
    </Link>
  );
}

export function FactRow({
  action,
  description,
  title,
}: {
  action?: ReactNode;
  description: string;
  title: string;
}) {
  return (
    <div className="flex items-center gap-3 px-4 py-3">
      <span className="flex min-w-0 flex-1 flex-col gap-0.5">
        <span className="text-sm font-medium">{title}</span>
        <span className="text-sm text-muted-foreground">{description}</span>
      </span>
      {action}
    </div>
  );
}
