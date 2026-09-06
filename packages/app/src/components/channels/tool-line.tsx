import { cn } from '../../lib/utils.js';

import type { ReactNode } from 'react';

export function ToolLine({
  children,
  detail,
  failed,
  label,
  refused,
  running,
}: {
  children?: ReactNode;
  detail?: string;
  failed?: boolean;
  label: string;
  refused?: boolean;
  running?: boolean;
}) {
  const text = (
    <span
      className={cn(
        'inline-flex min-w-0 max-w-full items-baseline gap-1.5 text-sm',
        lineTone(refused, failed),
      )}
    >
      <span className={cn('shrink-0', running ? 'tool-line-running' : undefined)}>
        {lineLabel(label, refused, failed)}
      </span>
      {detail ? <span className="truncate opacity-70">{detail}</span> : null}
    </span>
  );
  if (!children) {
    return <div className="my-1.5">{text}</div>;
  }
  return (
    <details className="my-1.5 min-w-0">
      <summary className="flex cursor-pointer list-none items-baseline gap-1.5">
        <span aria-hidden className="shrink-0 text-xs text-muted-foreground">
          ▸
        </span>
        {text}
      </summary>
      <div className="mt-2 max-h-80 overflow-auto border-l pl-3 text-xs">{children}</div>
    </details>
  );
}

function lineTone(refused?: boolean, failed?: boolean): string {
  if (refused) {
    return 'text-destructive';
  }
  if (failed) {
    return 'text-amber-600 dark:text-amber-500';
  }
  return 'text-muted-foreground';
}

function lineLabel(label: string, refused?: boolean, failed?: boolean): string {
  if (refused) {
    return 'Blocked';
  }
  if (failed) {
    return `${label}, didn't work`;
  }
  return label;
}
