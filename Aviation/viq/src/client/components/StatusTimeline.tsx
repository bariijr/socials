// src/client/components/StatusTimeline.tsx
//
// Chronological history of status changes for one Trip or Service row.
// Reads the same AuditEntry-backed endpoint the ACTIVITY tab already
// uses for a record and filters to field === 'status' client-side --
// no new backend endpoint or table.
import { useEffect, useState } from 'react';
import { getAuditForRecord } from '@/lib/dataStore';
import type { AuditEntry } from '@/data/types';

export function StatusTimeline({ table, recordId }: { table: string; recordId: string }) {
  const [entries, setEntries] = useState<AuditEntry[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    getAuditForRecord(table, recordId)
      .then((rows) => {
        if (!cancelled) setEntries(rows.filter((r) => r.Field === 'status'));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => { cancelled = true; };
  }, [table, recordId]);

  if (loading) return <p className="text-xs text-muted-foreground">Loading status history…</p>;
  if (entries.length === 0) return <p className="text-xs text-muted-foreground">No status changes yet.</p>;

  return (
    <ul className="space-y-1 text-xs">
      {entries.map((entry, i) => (
        <li key={i} className="flex items-center gap-2 text-muted-foreground">
          <span className="font-mono">{new Date(entry.TimestampZ).toISOString()}</span>
          <span>{entry.OldValue} → <span className="font-medium text-foreground">{entry.NewValue}</span></span>
          <span>by {entry.User}</span>
        </li>
      ))}
    </ul>
  );
}
