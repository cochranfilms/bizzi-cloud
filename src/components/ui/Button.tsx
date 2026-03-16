"use client";

import { forwardRef } from "react";

export type ButtonVariant = "primary" | "secondary" | "ghost" | "danger";

interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  loading?: boolean;
}

const variantStyles: Record<ButtonVariant, string> = {
  primary:
    "bg-bizzi-blue text-white hover:bg-bizzi-cyan disabled:hover:bg-bizzi-blue dark:hover:bg-bizzi-cyan",
  secondary:
    "border border-neutral-200 bg-white text-neutral-700 hover:bg-neutral-50 dark:border-neutral-700 dark:bg-neutral-800 dark:text-neutral-300 dark:hover:bg-neutral-700",
  ghost:
    "text-neutral-700 hover:bg-neutral-100 dark:text-neutral-300 dark:hover:bg-neutral-800",
  danger:
    "bg-red-600 text-white hover:bg-red-500 disabled:hover:bg-red-600 dark:bg-red-700 dark:hover:bg-red-600",
};

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  ({ variant = "primary", loading, disabled, children, className = "", ...props }, ref) => {
    const base =
      "inline-flex items-center justify-center gap-2 rounded-lg px-4 py-2 text-sm font-medium transition-colors touch-manipulation disabled:cursor-not-allowed disabled:opacity-50";
    const styles = variantStyles[variant];

    return (
      <button
        ref={ref}
        disabled={disabled || loading}
        className={`${base} ${styles} ${className}`}
        aria-busy={loading}
        {...props}
      >
        {loading ? (
          <>
            <span
              className="size-4 animate-spin rounded-full border-2 border-current border-t-transparent"
              aria-hidden
            />
            <span>{children}</span>
          </>
        ) : (
          children
        )}
      </button>
    );
  }
);

Button.displayName = "Button";
