"use client";

import { forwardRef } from "react";
import { Search } from "lucide-react";
import { Input } from "./Input";

interface SearchInputProps extends Omit<React.InputHTMLAttributes<HTMLInputElement>, "type"> {
  error?: boolean;
}

export const SearchInput = forwardRef<HTMLInputElement, SearchInputProps>(
  ({ error, className = "", ...props }, ref) => {
    return (
      <div className="relative w-full">
        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-neutral-400 pointer-events-none" />
        <Input
          ref={ref}
          type="search"
          error={error}
          className={`pl-9 ${className}`}
          {...props}
        />
      </div>
    );
  }
);

SearchInput.displayName = "SearchInput";
