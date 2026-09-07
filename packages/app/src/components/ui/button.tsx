import { cva, type VariantProps } from 'class-variance-authority';

import { cn } from '../../lib/utils.js';

import type { ButtonHTMLAttributes } from 'react';

const buttonVariants = cva(
  'inline-flex shrink-0 items-center justify-center gap-1.5 rounded-lg border border-transparent text-sm font-medium whitespace-nowrap transition-colors outline-none select-none focus-visible:ring-3 focus-visible:ring-ring/50 disabled:pointer-events-none disabled:opacity-50',
  {
    variants: {
      variant: {
        default: 'bg-primary text-primary-foreground hover:bg-primary/80',
        outline: 'border-border bg-background hover:bg-muted',
        secondary: 'bg-secondary text-secondary-foreground hover:bg-muted',
        ghost: 'hover:bg-muted hover:text-foreground',
        destructive: 'bg-destructive/10 text-destructive hover:bg-destructive/20',
      },
      size: {
        default: 'h-9 px-2.5',
        sm: 'h-7 px-2.5 text-[0.8rem]',
        lg: 'h-10 px-3',
        icon: 'size-8',
      },
    },
    defaultVariants: {
      variant: 'default',
      size: 'default',
    },
  },
);

type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & VariantProps<typeof buttonVariants>;

export function Button({ className, variant, size, type = 'button', ...props }: ButtonProps) {
  return (
    <button type={type} className={cn(buttonVariants({ variant, size, className }))} {...props} />
  );
}
