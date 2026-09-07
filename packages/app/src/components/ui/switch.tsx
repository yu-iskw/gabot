import { cn } from '../../lib/utils.js';

export function Switch({
  checked,
  disabled,
  onCheckedChange,
  'aria-label': ariaLabel,
}: {
  checked: boolean;
  disabled?: boolean;
  onCheckedChange: (next: boolean) => void;
  'aria-label': string;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={ariaLabel}
      disabled={disabled}
      className={cn(
        'relative h-6 w-11 shrink-0 rounded-full border transition-colors',
        checked ? 'border-primary bg-primary' : 'border-border bg-muted',
      )}
      onClick={() => onCheckedChange(!checked)}
    >
      <span
        className={cn(
          'absolute top-0.5 left-0.5 size-5 rounded-full bg-background transition-transform',
          checked ? 'translate-x-5' : 'translate-x-0',
        )}
      />
    </button>
  );
}
