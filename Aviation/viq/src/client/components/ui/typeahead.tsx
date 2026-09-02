import { useState } from 'react';
import { Input } from '@/components/ui/input';

// Free-typed input with a filtered suggestion dropdown — unlike the shadcn
// Combobox (which only accepts a value already in its option list), this
// keeps whatever the user typed as the value and treats matches as
// shortcuts, since Registration/Client/Owner all need to support "not in
// the system yet, type a new one" as a valid path (Items 12, 13, 14).
export function Typeahead<T>({ value, onChange, options, getLabel, getKey, onSelect, placeholder, className }: {
  value: string;
  onChange: (v: string) => void;
  options: T[];
  getLabel: (o: T) => string;
  getKey: (o: T) => string;
  onSelect: (o: T) => void;
  placeholder?: string;
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  const q = value.trim().toLowerCase();
  const filtered = q.length > 0 ? options.filter((o) => getLabel(o).toLowerCase().includes(q)).slice(0, 8) : [];

  return (
    <div className="relative">
      <Input
        value={value}
        placeholder={placeholder}
        className={className}
        onChange={(e) => { onChange(e.target.value); setOpen(true); }}
        onFocus={() => setOpen(true)}
        onBlur={() => setTimeout(() => setOpen(false), 150)}
      />
      {open && filtered.length > 0 && (
        <div className="absolute z-20 mt-1 max-h-48 w-full overflow-auto rounded-md border bg-popover shadow-md">
          {filtered.map((o) => (
            <button
              key={getKey(o)}
              type="button"
              className="block w-full px-3 py-1.5 text-left text-sm hover:bg-accent"
              onMouseDown={() => { onSelect(o); setOpen(false); }}
            >
              {getLabel(o)}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
