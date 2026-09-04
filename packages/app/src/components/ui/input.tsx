import { cn } from '../../lib/utils.js';

import type { InputHTMLAttributes } from 'react';

export function Input({ className, ...props }: InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      className={cn(
        'h-9 w-full rounded-lg border border-input bg-background px-3 text-sm outline-none',
        'placeholder:text-muted-foreground focus-visible:ring-3 focus-visible:ring-ring/50',
        className,
      )}
      {...props}
    />
  );
}
