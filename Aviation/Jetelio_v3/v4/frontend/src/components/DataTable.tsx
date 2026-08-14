export interface Column<T> {
  header: string;
  priority?: 1 | 2 | 3;
  render: (row: T) => React.ReactNode;
}

// Optional bulk-select support (task #133 UI/UX proposal, item 3) — the
// Services tab's checkbox + action-bar pattern was the only place in the
// app with multi-select; this promotes the same capability into the one
// table component every list page already shares, rather than adding a
// second, parallel selection implementation.
export interface BulkSelect<T> {
  selectedKeys: Set<string>;
  onToggleRow: (key: string) => void;
  onToggleAll: (rows: T[]) => void;
}

export function DataTable<T>({
  columns,
  rows,
  rowKey,
  emptyMessage = "No rows.",
  bulkSelect,
}: {
  columns: Column<T>[];
  rows: T[];
  rowKey: (row: T) => string;
  emptyMessage?: string;
  bulkSelect?: BulkSelect<T>;
}) {
  const allSelected = !!bulkSelect && rows.length > 0 && rows.every((r) => bulkSelect.selectedKeys.has(rowKey(r)));
  const someSelected = !!bulkSelect && rows.some((r) => bulkSelect.selectedKeys.has(rowKey(r)));

  return (
    <div className="overflow-x-auto rounded-lg border border-fg/10">
      <table className="w-full min-w-max text-left text-sm">
        <thead className="bg-fg/5 text-xs uppercase tracking-wide text-fg/60">
          <tr>
            {bulkSelect && (
              <th className="w-10 px-3 py-2">
                <input
                  type="checkbox"
                  checked={allSelected}
                  ref={(el) => {
                    if (el) el.indeterminate = someSelected && !allSelected;
                  }}
                  onChange={() => bulkSelect.onToggleAll(rows)}
                  aria-label="Select all rows"
                  className="h-4 w-4 accent-primary"
                />
              </th>
            )}
            {columns.map((c) => (
              <th
                key={c.header}
                className={
                  "px-3 py-2 " + (c.priority === 3 ? "hidden lg:table-cell" : c.priority === 2 ? "hidden sm:table-cell" : "")
                }
              >
                {c.header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-fg/10">
          {rows.map((row) => {
            const key = rowKey(row);
            return (
              <tr key={key} className="hover:bg-fg/5">
                {bulkSelect && (
                  <td className="px-3 py-2">
                    <input
                      type="checkbox"
                      checked={bulkSelect.selectedKeys.has(key)}
                      onChange={() => bulkSelect.onToggleRow(key)}
                      aria-label={`Select row ${key}`}
                      className="h-4 w-4 accent-primary"
                    />
                  </td>
                )}
                {columns.map((c) => (
                  <td
                    key={c.header}
                    className={
                      "px-3 py-2 " +
                      (c.priority === 3 ? "hidden lg:table-cell" : c.priority === 2 ? "hidden sm:table-cell" : "")
                    }
                  >
                    {c.render(row)}
                  </td>
                ))}
              </tr>
            );
          })}
          {rows.length === 0 && (
            <tr>
              <td colSpan={columns.length + (bulkSelect ? 1 : 0)} className="px-3 py-6 text-center text-fg/50">
                {emptyMessage}
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}
