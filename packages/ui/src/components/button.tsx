/** OpenBot-inspired button styling, rewritten to avoid OpenBot's app aliases and Base UI dependency. */
import type { ButtonHTMLAttributes } from "react";
import { cn } from "../lib/cn";
export type ButtonVariant = "default" | "outline" | "secondary" | "ghost" | "destructive" | "link";
export type ButtonSize = "default" | "sm" | "lg" | "icon";
export type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & { variant?: ButtonVariant; size?: ButtonSize };
const variants: Record<ButtonVariant, string> = {
  default: "bg-primary text-primary-foreground hover:opacity-80",
  outline: "border-border bg-background hover:bg-muted",
  secondary: "bg-secondary text-secondary-foreground hover:opacity-80",
  ghost: "hover:bg-muted",
  destructive: "bg-destructive text-white hover:opacity-80",
  link: "underline underline-offset-4",
};
const sizes: Record<ButtonSize, string> = {
  default: "h-9 gap-1.5 px-2.5", sm: "h-7 gap-1 px-2.5 text-xs", lg: "h-10 gap-2 px-3", icon: "size-8",
};
export function Button({ className, variant = "default", size = "default", type = "button", ...props }: ButtonProps) {
  return <button type={type} data-slot="button" data-variant={variant} className={cn("inline-flex shrink-0 items-center justify-center rounded-lg border border-transparent text-sm font-medium transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring disabled:pointer-events-none disabled:opacity-50", variants[variant], sizes[size], className)} {...props} />;
}
