import { useEffect, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Textarea } from '@/components/ui/textarea';
import {
  approveVendorCapabilityRequest,
  listVendorCapabilityRequests,
  rejectVendorCapabilityRequest,
} from '@/lib/dataStore';
import type { VendorCapabilityRequest } from '@/lib/dataStore';

export default function VendorCapabilityQueue() {
  const [requests, setRequests] = useState<VendorCapabilityRequest[]>([]);
  const [notes, setNotes] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  // Both of these exist because a silent failure here is actively dangerous:
  // a stuck "Loading…" hides the queue entirely, and a silently-failed
  // Approve invites the Admin to click again and re-review a decided request.
  const [loadError, setLoadError] = useState('');
  const [actError, setActError] = useState('');
  const [actingId, setActingId] = useState<string | null>(null);

  const reload = async () => {
    setLoading(true);
    setLoadError('');
    try {
      setRequests(await listVendorCapabilityRequests());
    } catch {
      setLoadError('Could not load capability requests — try again.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    reload();
  }, []);

  const pending = requests.filter((r) => r.status === 'SUBMITTED' || r.status === 'UNDER_REVIEW');
  const decided = requests.filter((r) => r.status === 'APPROVED' || r.status === 'REJECTED');
  const awaitingVendor = requests.filter((r) => r.status === 'PENDING');

  const act = async (id: string, action: 'approve' | 'reject') => {
    if (actingId) return;
    const fn = action === 'approve' ? approveVendorCapabilityRequest : rejectVendorCapabilityRequest;
    setActingId(id);
    setActError('');
    try {
      await fn(id, notes[id]);
      await reload();
    } catch {
      setActError(`Could not ${action} that request — it may have already been decided. Reload and check before retrying.`);
    } finally {
      setActingId(null);
    }
  };

  if (loading) return <div className="p-6">Loading…</div>;
  if (loadError) {
    return (
      <div className="p-6 space-y-3">
        <p className="text-sm text-destructive">{loadError}</p>
        <Button size="sm" variant="outline" onClick={reload}>Retry</Button>
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6">
      <h1 className="text-xl font-semibold">Vendor Capability Requests</h1>

      {actError && <p className="text-sm text-destructive">{actError}</p>}

      <Card>
        <CardHeader><CardTitle>Awaiting Review ({pending.length})</CardTitle></CardHeader>
        <CardContent className="space-y-4">
          {pending.length === 0 && <p className="text-sm text-muted-foreground">Nothing to review.</p>}
          {pending.map((r) => (
            <div key={r.id} className="border rounded-md p-3 space-y-2">
              <div className="flex items-center justify-between">
                <div className="font-medium">{r.provider.name} · {r.serviceType} · {r.countryIso2 || r.icao}</div>
                <Badge variant={r.canService ? 'default' : 'destructive'}>{r.canService ? 'Vendor says YES' : 'Vendor says NO'}</Badge>
              </div>
              <div className="text-sm text-muted-foreground">Contact: {r.contactName} {r.contactEmail ? `(${r.contactEmail})` : ''}</div>
              {r.vendorNotes && <div className="text-sm">{r.vendorNotes}</div>}
              <Textarea placeholder="Review notes (optional)" value={notes[r.id] || ''} onChange={(e) => setNotes({ ...notes, [r.id]: e.target.value })} />
              <div className="flex gap-2">
                <Button size="sm" disabled={actingId !== null} onClick={() => act(r.id, 'approve')}>
                  {actingId === r.id ? 'Working…' : 'Approve'}
                </Button>
                <Button size="sm" variant="destructive" disabled={actingId !== null} onClick={() => act(r.id, 'reject')}>Reject</Button>
              </div>
            </div>
          ))}
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle>Awaiting Vendor ({awaitingVendor.length})</CardTitle></CardHeader>
        <CardContent className="space-y-2">
          {awaitingVendor.map((r) => (
            <div key={r.id} className="text-sm flex justify-between">
              <span>{r.provider.name} · {r.serviceType} · {r.countryIso2 || r.icao}</span>
              <span className="text-muted-foreground">Sent {new Date(r.tokenExpiresAtZ).toLocaleDateString()}</span>
            </div>
          ))}
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle>Decided ({decided.length})</CardTitle></CardHeader>
        <CardContent className="space-y-2">
          {decided.map((r) => (
            <div key={r.id} className="text-sm flex justify-between">
              <span>{r.provider.name} · {r.serviceType} · {r.countryIso2 || r.icao}</span>
              <Badge variant={r.status === 'APPROVED' ? 'default' : 'destructive'}>{r.status}</Badge>
            </div>
          ))}
        </CardContent>
      </Card>
    </div>
  );
}
