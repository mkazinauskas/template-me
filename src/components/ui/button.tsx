// Shared button styling primitive. Several call sites render a <Link> styled
// as a button rather than an actual <button> element, so this is a class
// string factory (not a component) — it can be spread onto either.

export type ButtonVariant = "primary" | "secondary";
export type ButtonSize = "sm" | "md" | "lg";
export type ButtonInteractive = "disabled" | "hover";

const sizeClasses: Record<ButtonSize, string> = {
  sm: "px-3 py-2",
  md: "px-4 py-2",
  lg: "px-6 py-3",
};

const variantStyles: Record<ButtonVariant, { base: string; disabled: string; hover: string }> = {
  primary: {
    base: "bg-black text-white dark:bg-white dark:text-black",
    disabled: "disabled:opacity-50",
    hover: "hover:opacity-90 hover:scale-[1.03] transition-all",
  },
  secondary: {
    base: "border border-border",
    disabled: "disabled:opacity-50",
    hover: "hover:bg-black/[0.03] dark:hover:bg-white/[0.06] hover:scale-[1.03] transition-all",
  },
};

/**
 * Builds the class string for a primary/secondary button at a given size.
 * `interactive: "disabled"` (the default) dims the button via `disabled:opacity-50`,
 * matching in-app form buttons; `interactive: "hover"` instead adds a hover/scale
 * transition, matching the marketing-page buttons that are always enabled.
 */
export function buttonClasses({
  variant = "primary",
  size = "md",
  interactive = "disabled",
  className = "",
}: {
  variant?: ButtonVariant;
  size?: ButtonSize;
  interactive?: ButtonInteractive;
  className?: string;
} = {}): string {
  const style = variantStyles[variant];
  return [
    "rounded-md text-sm font-medium",
    style.base,
    sizeClasses[size],
    interactive === "hover" ? style.hover : style.disabled,
    className,
  ]
    .filter(Boolean)
    .join(" ");
}
