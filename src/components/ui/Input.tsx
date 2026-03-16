"use client";

import { forwardRef } from "react";

interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  error?: boolean;
}

const baseStyles =
  "w-full rounded-lg border px-4 py-2 text-sm outline-none transition-colors placeholder:text-neutral-400 dark:placeholder:text-neutral-500";

const stateStyles = {
  default:
    "border-neutral-200 bg-white focus:border-bizzi-blue focus:ring-1 focus:ring-bizzi-blue/20 dark:border-neutral-700 dark:bg-neutral-800 dark:text-white dark:focus:border-bizzi-cyan dark:focus:ring-bizzi-cyan/20",
  error:
    "border-red-500 focus:border-red-500 focus:ring-red-500/20 dark:border-red-600 dark:focus:border-red-600",
};

export const Input = forwardRef<HTMLInputElement, InputProps>(
  ({ error, className = "", ...props }, ref) => {
    const styles = error ? stateStyles.error : stateStyles.default;

    return (
      <input
        ref={ref}
        className={`${baseStyles} ${styles} ${className}`}
        {...props}
      />
    );
  }
);

Input.displayName = "Input";
