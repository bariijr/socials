import { useState, useMemo, useEffect } from 'react';
import { getComms, formatZ } from '@/lib/dataStore';
import type { Comm } from '@/data/types';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Separator } from '@/components/ui/separator';
import { Input } from '@/components/ui/input';
import { Mail, ArrowDownLeft, ArrowUpRight, Search } from 'lucide-react';

export default function CommsPage() {
  const [selectedComm, setSelectedComm] = useState<string | null>(null);
  const [search, setSearch] = useState('');

  const [comms, setComms] = useState<Comm[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    getComms()
      .then((list) => { if (!cancelled) { setComms(list); setLoading(false); } })
      .catch((e) => { if (!cancelled) { setError(e.message); setLoading(false); } });
    return () => { cancelled = true; };
  }, []);

  const filtered = useMemo(() => {
    let list = [...comms].sort((a, b) => new Date(b.TimestampZ).getTime() - new Date(a.TimestampZ).getTime());
    if (search.trim()) {
      const q = search.toLowerCase();
      list = list.filter(
        (c) =>
          c.TripID.toLowerCase().includes(q) ||
          c.Subject.toLowerCase().includes(q) ||
          c.Token.toLowerCase().includes(q) ||
          c.From.toLowerCase().includes(q) ||
          c.To.toLowerCase().includes(q) ||
          c.Body.toLowerCase().includes(q) ||
          c.Direction.toLowerCase().includes(q)
      );
    }
    return list;
  }, [comms, search]);

  if (loading) return <p className="p-4 text-sm text-muted-foreground">Loading…</p>;
  if (error) return <p className="p-4 text-sm text-destructive">Error: {error}</p>;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Communications Log</h1>
        <p className="text-muted-foreground">All inbound and outbound emails, sorted by time</p>
      </div>

      <div className="relative">
        <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
        <Input
          placeholder="Search by trip, subject, token, sender, recipient..."
          className="pl-9"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </div>

      <Card>
        <div className="p-3 text-xs text-muted-foreground border-b">
          {filtered.length} message{filtered.length !== 1 ? 's' : ''}
          {search.trim() ? ` matching "${search}"` : ''}
        </div>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Direction</TableHead>
              <TableHead>Token</TableHead>
              <TableHead>Trip</TableHead>
              <TableHead>Subject</TableHead>
              <TableHead>To / From</TableHead>
              <TableHead>Time</TableHead>
              <TableHead>Status</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filtered.map((comm) => (
              <TableRow
                key={comm.CommID}
                className="cursor-pointer hover:bg-muted/50"
                onClick={() => setSelectedComm(selectedComm === comm.CommID ? null : comm.CommID)}
              >
                <TableCell>
                  {comm.Direction === 'INBOUND' ? (
                    <Badge variant="secondary" className="gap-1 bg-blue-100 text-blue-700">
                      <ArrowDownLeft className="h-3 w-3" /> In
                    </Badge>
                  ) : (
                    <Badge variant="secondary" className="gap-1 bg-emerald-100 text-emerald-700">
                      <ArrowUpRight className="h-3 w-3" /> Out
                    </Badge>
                  )}
                </TableCell>
                <TableCell className="font-mono text-xs">{comm.Token}</TableCell>
                <TableCell className="font-medium">{comm.TripID}</TableCell>
                <TableCell className="max-w-xs truncate">{comm.Subject}</TableCell>
                <TableCell className="text-xs text-muted-foreground">
                  {comm.Direction === 'OUTBOUND' ? comm.To : comm.From}
                </TableCell>
                <TableCell className="text-sm">{formatZ(comm.TimestampZ)}</TableCell>
                <TableCell>
                  <Badge variant="outline">{comm.Status}</Badge>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
        {filtered.length === 0 && (
          <div className="p-8 text-center text-muted-foreground">
            {search.trim() ? 'No messages match your search.' : 'No communications yet.'}
          </div>
        )}
      </Card>

      {selectedComm && (
        <Card>
          <CardContent className="p-5">
            {(() => {
              const comm = comms.find(c => c.CommID === selectedComm)!;
              return (
                <div>
                  <div className="mb-3 flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <Mail className="h-5 w-5 text-muted-foreground" />
                      <h3 className="font-semibold">{comm.Subject}</h3>
                    </div>
                    <Badge variant="outline" className="font-mono">{comm.Token}</Badge>
                  </div>
                  <div className="mb-2 grid grid-cols-2 gap-4 text-sm">
                    <div><span className="text-muted-foreground">From:</span> {comm.From}</div>
                    <div><span className="text-muted-foreground">To:</span> {comm.To}</div>
                    <div><span className="text-muted-foreground">Trip:</span> {comm.TripID}</div>
                    <div><span className="text-muted-foreground">Time:</span> {formatZ(comm.TimestampZ)}</div>
                  </div>
                  <Separator className="my-3" />
                  <pre className="whitespace-pre-wrap text-sm text-muted-foreground">{comm.Body}</pre>
                </div>
              );
            })()}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
