"use client";

import { useState, useEffect } from "react";
import { Search } from "lucide-react";

interface FilterSearchProps {
  value: string | undefined;
  onChange: (value: string) => void;
  placeholder?: string;
  debounceMs?: number;
}

export default function FilterSearch({
  value,
  onChange,
  placeholder = "Search…",
  debounceMs = 300,
}: FilterSearchProps) {
  const [local, setLocal] = useState(value ?? "");
  useEffect(() => {
    setLocal(value ?? "");
  }, [value]);
  useEffect(() => {
    if (local === (value ?? "")) return;
    const t = setTimeout(() => onChange(local), debounceMs);
    return () => clearTimeout(t);
  }, [local, debounceMs, onChange, value]);
  return (
    <div className="relative">
      <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-neutral-400" />
      <input
        type="search"
        value={local}
        onChange={(e) => setLocal(e.target.value)}
        placeholder={placeholder}
        className="w-full rounded-lg border border-neutral-200 bg-neutral-50 py-2 pl-9 pr-3 text-sm placeholder-neutral-400 outline-none focus:border-bizzi-blue focus:ring-1 focus:ring-bizzi-blue/20 dark:border-neutral-700 dark:bg-neutral-900 dark:placeholder-neutral-500 dark:focus:border-bizzi-cyan dark:focus:ring-bizzi-cyan/20"
      />
    </div>
  );
}
