import { hashHue } from '../../lib/hash-hue.js';

export function ChannelAvatar({ name, size = 32 }: { name: string; size?: number }) {
  const hue = hashHue(name);
  return (
    <div
      aria-hidden
      className="shrink-0 overflow-hidden rounded-full"
      style={{
        height: size,
        width: size,
        background: `conic-gradient(from 210deg, oklch(0.72 0.16 ${String(hue)}), oklch(0.68 0.14 ${String((hue + 40) % 360)}), oklch(0.78 0.1 ${String((hue + 80) % 360)}))`,
      }}
    />
  );
}
