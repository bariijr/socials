"use client";

interface Props {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
}

export function SearchInput({ value, onChange, placeholder = "Search…" }: Props) {
  return (
    <input
      type="search"
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
      className="h-10 w-full max-w-xs rounded-md border border-fg/20 bg-transparent px-3 text-sm text-fg placeholder:text-fg/40"
    />
  );
}
