/** Merge optional class names without requiring OpenBot's app-level alias or Tailwind merge. */
export function cn(...values: Array<string | false | null | undefined>): string {
  return values.filter(Boolean).join(" ");
}
