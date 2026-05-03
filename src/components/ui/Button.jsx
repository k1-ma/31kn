import React from "react";

export default function Button({ variant = "primary", size = "md", className = "", ...props }) {
  // Accessibility: icon-only buttons need an accessible name. If the caller
  // supplied a `title` (visible tooltip) but no `aria-label`, mirror it so
  // screen readers can announce the button. In development, warn when an
  // icon-sized button has neither label nor textual children.
  if (size === "icon") {
    const hasAriaLabel = "aria-label" in props || "aria-labelledby" in props;
    if (!hasAriaLabel && typeof props.title === "string" && props.title) {
      props = { ...props, "aria-label": props.title };
    } else if (
      !hasAriaLabel &&
      process.env.NODE_ENV !== "production" &&
      typeof props.children !== "string"
    ) {
      // eslint-disable-next-line no-console
      console.warn("[a11y] icon Button without aria-label or title");
    }
  }

  const base =
    "inline-flex items-center justify-center gap-2 font-semibold transition-all duration-200 " +
    "focus:outline-none focus-visible:ring-2 focus-visible:ring-accent/40 focus-visible:ring-offset-1 focus-visible:ring-offset-background " +
    "disabled:opacity-40 disabled:cursor-not-allowed disabled:pointer-events-none " +
    "active:scale-[0.97]";

  const sizes = {
    sm: "h-8 px-3 text-[12px] rounded-lg",
    md: "h-9 px-4 text-[13px] rounded-lg",
    lg: "h-10 px-5 text-sm rounded-lg",
    icon: "h-9 w-9 rounded-lg",
  };

  const variants = {
    primary:
      "bg-accent text-on-accent border border-accent/80 " +
      "shadow-sm " +
      "hover:bg-accent/90 hover:shadow-md " +
      "active:bg-accent/80",
    secondary:
      "bg-muted/50 dark:bg-white/[0.04] border border-border/50 dark:border-white/[0.08] text-foreground " +
      "shadow-sm " +
      "hover:bg-muted dark:hover:bg-white/[0.07] hover:border-border dark:hover:border-white/[0.14]",
    ghost: "text-muted-foreground hover:bg-muted/50 dark:hover:bg-white/[0.06] hover:text-foreground",
    outline:
      "border border-border/50 dark:border-white/[0.1] text-foreground " +
      "hover:bg-muted/30 dark:hover:bg-white/[0.05] hover:border-border dark:hover:border-white/[0.18]",
    danger:
      "bg-danger text-on-danger border border-danger/80 " +
      "shadow-sm " +
      "hover:bg-danger/90 hover:shadow-md",
  };

  return (
    <button
      className={`${base} ${sizes[size] || sizes.md} ${variants[variant] || variants.primary} ${className}`}
      {...props}
    />
  );
}
