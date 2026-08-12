export interface Column<T> {
  header: string;
  priority?: 1 | 2 | 3;
  render: (row: T) => React.ReactNode;
}

export function DataTable<T>({ columns, rows, rowKey }: { columns: Column<T>[]; rows: T[]; rowKey: (row: T) => string }) {
  return (
    <div className="overflow-x-auto rounded-lg border border-fg/10">
      <table className="w-full min-w-max text-left text-sm">
        <thead className="bg-fg/5 text-xs uppercase tracking-wide text-fg/60">
          <tr>
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
          {rows.map((row) => (
            <tr key={rowKey(row)} className="hover:bg-fg/5">
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
          ))}
          {rows.length === 0 && (
            <tr>
              <td colSpan={columns.length} className="px-3 py-6 text-center text-fg/50">
                No rows.
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}
