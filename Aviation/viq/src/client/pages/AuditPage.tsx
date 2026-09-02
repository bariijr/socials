import { useState, useMemo, useEffect } from 'react';
import { getAudit, formatZ } from '@/lib/dataStore';
import type { AuditEntry } from '@/data/types';
import { Card } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { ArrowRight, User, Calendar, Search } from 'lucide-react';

export default function AuditPage() {
  const [search, setSearch] = useState('');
  const [audit, setAudit] = useState<AuditEntry[]>([]);

  useEffect(() => { getAudit().then(setAudit); }, []);

  const filtered = useMemo(() => {
    let list = [...audit].sort((a, b) => new Date(b.TimestampZ).getTime() - new Date(a.TimestampZ).getTime());
    if (search.trim()) {
      const q = search.toLowerCase();
      list = list.filter(
        (e) =>
          e.User.toLowerCase().includes(q) ||
          e.Table.toLowerCase().includes(q) ||
          e.RecordID.toLowerCase().includes(q) ||
          e.Field.toLowerCase().includes(q) ||
          e.OldValue.toLowerCase().includes(q) ||
          e.NewValue.toLowerCase().includes(q)
      );
    }
    return list;
  }, [audit, search]);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Audit Trail</h1>
        <p className="text-muted-foreground">Field-level change history for accountability</p>
      </div>

      <div className="relative">
        <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
        <Input
          placeholder="Search by user, table, record ID, field, or change value..."
          className="pl-9"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </div>

      <Card>
        <div className="p-3 text-xs text-muted-foreground border-b">
          {filtered.length} entr{filtered.length !== 1 ? 'ies' : 'y'}
          {search.trim() ? ` matching "${search}"` : ''}
        </div>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Time</TableHead>
              <TableHead>User</TableHead>
              <TableHead>Table</TableHead>
              <TableHead>Record</TableHead>
              <TableHead>Field</TableHead>
              <TableHead>Change</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filtered.map((entry, idx) => (
              <TableRow key={idx}>
                <TableCell className="text-sm whitespace-nowrap">
                  <div className="flex items-center gap-1">
                    <Calendar className="h-3 w-3 text-muted-foreground" />
                    {formatZ(entry.TimestampZ)}
                  </div>
                </TableCell>
                <TableCell>
                  <div className="flex items-center gap-1 text-sm">
                    <User className="h-3 w-3 text-muted-foreground" />
                    {entry.User}
                  </div>
                </TableCell>
                <TableCell><Badge variant="outline">{entry.Table}</Badge></TableCell>
                <TableCell className="font-mono text-xs">{entry.RecordID}</TableCell>
                <TableCell className="text-sm font-medium">{entry.Field}</TableCell>
                <TableCell>
                  <div className="flex items-center gap-2 text-sm">
                    <span className="rounded bg-red-50 px-1.5 py-0.5 text-red-700 line-through">{entry.OldValue || '—'}</span>
                    <ArrowRight className="h-3 w-3 text-muted-foreground" />
                    <span className="rounded bg-emerald-50 px-1.5 py-0.5 text-emerald-700">{entry.NewValue}</span>
                  </div>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
        {filtered.length === 0 && (
          <div className="p-8 text-center text-muted-foreground">
            {search.trim() ? 'No audit entries match your search.' : 'No audit entries yet.'}
          </div>
        )}
      </Card>
    </div>
  );
}
