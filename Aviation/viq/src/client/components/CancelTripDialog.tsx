// src/client/components/CancelTripDialog.tsx
import { useEffect, useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Label } from '@/components/ui/label';
import { ApiError, CANCELLATION_REASONS, cancelTrip, getTripCancellationPreview } from '@/lib/dataStore';
import type { TripCancellationPreview } from '@/lib/dataStore';
import type { Trip } from '@/data/types';

// Unlike CancelLegDialog, this dialog does NOT send vendor cancellation
// emails. Sending is entirely client-orchestrated in this codebase (the
// server's cancelTrip()/cancelLegs() only write DB rows, audit, and emit
// in-process events — no mailer runs on that path), and looping every
// affected service across every cancelled Leg here would need its own
// design (e.g. one combined email per vendor instead of one per service,
// unlike CancelLegDialog's per-service loop) — deferred to the
// notification-engine phase (Cluster G), not built in this pass.
export function CancelTripDialog({
  open, onClose, trip, onCancelled,
}: {
  open: boolean; onClose: () => void; trip: Trip; onCancelled: () => Promise<void> | void;
}) {
  const [preview, setPreview] = useState<TripCancellationPreview | null>(null);
  const [reason, setReason] = useState<typeof CANCELLATION_REASONS[number] | ''>('');
  const [remarks, setRemarks] = useState('');
  const [cancelling, setCancelling] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!open) return;
    setPreview(null);
    setReason('');
    setRemarks('');
    setError('');
    getTripCancellationPreview(trip.TripID).then(setPreview).catch(() => setError('Could not load cancellation impact — try again.'));
  }, [open, trip.TripID]);

  const handleConfirm = async () => {
    if (!reason) return;
    setCancelling(true);
    setError('');
    try {
      await cancelTrip(trip.TripID, { reason, remarks: remarks.trim() || undefined, version: trip.Version });
      await onCancelled();
      onClose();
    } catch (err) {
      const msg = err instanceof ApiError ? `Could not cancel this trip: ${err.message}` : 'Could not cancel this trip — try again.';
      setError(msg);
    } finally {
      setCancelling(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader><DialogTitle>Cancel Trip {trip.TripID}</DialogTitle></DialogHeader>
        {error && <p className="text-sm text-destructive">{error}</p>}
        {preview && (
          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-2 text-sm">
              <div>Legs to cancel: <strong>{preview.legsToCancel}</strong></div>
              <div>Services affected: <strong>{preview.servicesAffected}</strong></div>
              <div>Confirmed: <strong>{preview.confirmed}</strong></div>
              <div>Requested: <strong>{preview.requested}</strong></div>
              <div>Not started: <strong>{preview.notStarted}</strong></div>
              <div>Not required: <strong>{preview.notRequired}</strong></div>
              <div>Vendor notifications: <strong>{preview.vendorNotifications}</strong></div>
            </div>
            <p className="text-xs text-muted-foreground">Already-Completed legs are left exactly as they are.</p>
            <p className="text-xs text-amber-600">
              Note: vendor cancellation notices are not sent automatically for a whole-Trip
              cancellation yet. Cancel affected Legs individually if you need vendors notified.
            </p>
            <div className="space-y-1">
              <Label>Reason</Label>
              <Select value={reason} onValueChange={(v) => setReason(v as typeof reason)}>
                <SelectTrigger><SelectValue placeholder="Select a reason…" /></SelectTrigger>
                <SelectContent>
                  {CANCELLATION_REASONS.map((r) => <SelectItem key={r} value={r}>{r}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label>Remarks (optional)</Label>
              <Textarea value={remarks} onChange={(e) => setRemarks(e.target.value)} />
            </div>
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={onClose}>Close</Button>
              <Button variant="destructive" disabled={!reason || cancelling} onClick={handleConfirm}>
                {cancelling ? 'Cancelling…' : 'Cancel Trip'}
              </Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
