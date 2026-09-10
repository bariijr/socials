// src/client/components/StatusTimeline.tsx
//
// Chronological history of status changes for one Trip or Service row.
// Reads the same AuditEntry-backed endpoint the ACTIVITY tab already
// uses for a record and filters to field === 'status' client-side --
// no new backend endpoint or table.
import { useEffect, useState } from 'react';
import type { ReactNode } from 'react';
import { getAuditForRecord } from '@/lib/dataStore';
import type { AuditEntry } from '@/data/types';

// Lets a caller merge in entries that don't come from the audit log at all
// (e.g. Service's VendorChangeLog rows) so they interleave chronologically
// with ordinary status-change entries instead of being rendered separately.
export interface TimelineExtraEntry {
  timestampZ: string;
  node: ReactNode;
}

export function StatusTimeline({ table, recordId, extraEntries = [] }: { table: string; recordId: string; extraEntries?: TimelineExtraEntry[] }) {
  const [entries, setEntries] = useState<AuditEntry[]>([]);
  const [loading, setLoading] = useState(true);
  // A failed fetch must not read as "no history" -- this is a
  // compliance-adjacent view, so an empty list has to mean genuinely empty.
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setFailed(false);
    getAuditForRecord(table, recordId)
      .then((rows) => {
        if (!cancelled) setEntries(rows.filter((r) => r.Field === 'status'));
      })
      .catch(() => {
        if (!cancelled) setFailed(true);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => { cancelled = true; };
  }, [table, recordId]);

  if (loading) return <p className="text-xs text-muted-foreground">Loading status history…</p>;
  if (failed) return <p className="text-xs text-destructive">Couldn't load status history.</p>;

  const merged = [
    ...entries.map((entry) => ({
      timestampZ: entry.TimestampZ,
      node: (
        <>
          <span>{entry.OldValue} → <span className="font-medium text-foreground">{entry.NewValue}</span></span>
          <span>by {entry.User}</span>
        </>
      ),
    })),
    ...extraEntries,
  ].sort((a, b) => new Date(a.timestampZ).getTime() - new Date(b.timestampZ).getTime());

  if (merged.length === 0) return <p className="text-xs text-muted-foreground">No status changes yet.</p>;

  return (
    <ul className="space-y-1 text-xs">
      {merged.map((item, i) => (
        <li key={i} className="flex flex-wrap items-center gap-2 text-muted-foreground">
          <span className="font-mono">{new Date(item.timestampZ).toISOString()}</span>
          {item.node}
        </li>
      ))}
    </ul>
  );
}
