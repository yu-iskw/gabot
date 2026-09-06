import { cn } from '../../lib/utils.js';

import type { TextareaHTMLAttributes } from 'react';

export function Textarea({ className, ...props }: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return (
    <textarea
      className={cn(
        'min-h-20 w-full rounded-lg border border-input bg-background px-3 py-2 text-sm outline-none',
        'placeholder:text-muted-foreground focus-visible:ring-3 focus-visible:ring-ring/50',
        className,
      )}
      {...props}
    />
  );
}
