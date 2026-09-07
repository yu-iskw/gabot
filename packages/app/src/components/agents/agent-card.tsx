import { hashHue } from '../../lib/hash-hue.js';
import { cn } from '../../lib/utils.js';

export function AgentCard({
  name,
  onClick,
  roleDescription,
  selected,
  testId,
}: {
  name: string;
  onClick?: () => void;
  roleDescription: string;
  selected?: boolean;
  testId?: string;
}) {
  const hue = hashHue(name);
  const card = (
    <>
      <div
        className="absolute top-1/2 left-1/2 size-[250px] -translate-x-1/2 -translate-y-1/2 rounded-full opacity-80"
        style={{
          background: `conic-gradient(from 200deg, oklch(0.7 0.16 ${String(hue)}), oklch(0.65 0.12 ${String((hue + 50) % 360)}), oklch(0.78 0.08 ${String((hue + 110) % 360)}))`,
        }}
      />
      <div className="absolute inset-0 bg-background/40 dark:bg-background/50" />
      <div className="absolute inset-0 flex flex-col justify-end gap-2 p-3">
        <span className="line-clamp-1 text-sm font-medium">{name}</span>
        <span className="line-clamp-3 text-xs">{roleDescription}</span>
      </div>
    </>
  );
  const className = cn(
    'relative h-[180px] w-[144px] overflow-hidden rounded-2xl bg-foreground/10 text-left',
    selected ? 'ring-2 ring-ring' : undefined,
  );
  if (!onClick) {
    return (
      <div className={className} data-testid={testId}>
        {card}
      </div>
    );
  }
  return (
    <button
      type="button"
      aria-pressed={selected}
      className={className}
      data-testid={testId}
      onClick={onClick}
    >
      {card}
    </button>
  );
}
