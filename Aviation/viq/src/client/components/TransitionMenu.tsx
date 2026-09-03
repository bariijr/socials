// src/client/components/TransitionMenu.tsx
//
// A status dropdown restricted to what the server says is currently
// legal (allowedTransitions) plus the current value itself -- never the
// full status vocabulary. The transition graph itself lives server-side
// only (src/server/common/statusTransitions.ts); this component renders
// whatever the last response said was allowed and nothing more.
export function TransitionMenu({
  status, allowedTransitions, onChange, disabled,
}: {
  status: string;
  allowedTransitions: string[];
  onChange: (next: string) => void;
  disabled?: boolean;
}) {
  const options = [status, ...allowedTransitions.filter((s) => s !== status)];
  return (
    <select
      className="h-8 min-w-0 rounded border bg-background px-1 text-xs"
      disabled={disabled}
      value={status}
      onChange={(event) => onChange(event.target.value)}
      title="Status"
    >
      {options.map((s) => <option key={s} value={s}>{s}</option>)}
    </select>
  );
}
