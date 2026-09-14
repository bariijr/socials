// src/client/components/CancelLegDialog.tsx
import { useEffect, useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Label } from '@/components/ui/label';
import {
  ApiError, CANCELLATION_REASONS, cancelLeg, changeVendorAllowedClient, getLegCancellationPreview,
  getProviderList, saveComm, sendComm,
} from '@/lib/dataStore';
import type { LegCancellationPreview } from '@/lib/dataStore';
import { generateEmail, defaultTemplateForCancellation } from '@/lib/emailTemplates';
import type { Leg, Trip, TripPersonView, Comm, Service } from '@/data/types';

type Step = 'preview' | 'cancelling' | 'done';

// Modeled directly on ChangeVendorDialog.tsx's own cancellation-send
// block (its handleConfirm, around lines 149-182) -- after the
// server-side cancellation commits, this loops every affected service
// with a provider on file and sends the exact same cancellation email
// that block already sends for a single service, via the same
// generateEmail/saveComm/sendComm primitives, adjusted only to run once
// per affected service instead of once. A send failure is shown per
// service and never rolled back or retried automatically -- the
// cancellation itself already committed. Providers are fetched with
// getProviderList() directly (the same synchronous in-memory-cache call
// ChangeVendorDialog.tsx itself uses via `useState(getProviderList())`)
// rather than taken as a prop -- TripDetail.tsx has no ready provider
// list of its own to pass down; confirmed by checking how
// <ChangeVendorDialog> is actually invoked there (around line 1215),
// which passes no `providers` prop either.
export function CancelLegDialog({
  open, onClose, leg, trip, legs, persons, legServices, onCancelled,
}: {
  open: boolean; onClose: () => void; leg: Leg; trip: Trip; legs: Leg[]; persons: TripPersonView[]; legServices: Service[];
  onCancelled: () => Promise<void> | void;
}) {
  const [providers] = useState(getProviderList());
  const [preview, setPreview] = useState<LegCancellationPreview | null>(null);
  const [reason, setReason] = useState<typeof CANCELLATION_REASONS[number] | ''>('');
  const [remarks, setRemarks] = useState('');
  const [step, setStep] = useState<Step>('preview');
  const [error, setError] = useState('');
  const [sendResults, setSendResults] = useState<{ provider: string; ok: boolean; error?: string }[]>([]);

  useEffect(() => {
    if (!open) return;
    setPreview(null);
    setReason('');
    setRemarks('');
    setStep('preview');
    setError('');
    setSendResults([]);
    getLegCancellationPreview(leg.LegID).then(setPreview).catch(() => setError('Could not load cancellation impact — try again.'));
  }, [open, leg.LegID]);

  const handleConfirm = async () => {
    if (!reason) return;
    setStep('cancelling');
    setError('');
    try {
      await cancelLeg(leg.LegID, { reason, remarks: remarks.trim() || undefined, version: leg.Version });
    } catch (err) {
      const msg = err instanceof ApiError ? `Could not cancel this leg: ${err.message}` : 'Could not cancel this leg — try again.';
      setError(msg);
      setStep('preview');
      return;
    }

    const results: { provider: string; ok: boolean; error?: string }[] = [];
    const withProvider = legServices.filter((s) => s.ProviderID && changeVendorAllowedClient(s.Status));
    for (const svc of withProvider) {
      const provider = providers.find((p) => p.ProviderID === svc.ProviderID);
      const recipients = provider?.Channels?.filter((c) => c.ChannelType === 'Email').map((c) => c.Value) ?? [];
      if (!provider || recipients.length === 0) continue;
      try {
        // Exact call shape from ChangeVendorDialog.tsx's own cancellation
        // send (line 157) -- same 17 positional args, same trailing
        // issuedRef/previousItinerary handling.
        const generated = generateEmail(
          defaultTemplateForCancellation(svc.ServiceType), trip.TripID, leg.LegID, svc.SVCID, legs, persons, '',
          trip.Registration, trip.AircraftICAOType || '', trip.AircraftMTOWKg || 0,
          trip.Client, trip.Operator, trip.SupportRef || '', svc.CountryISO2 ?? null, recipients,
          null, svc.RefNumber || '',
        );
        const comm: Comm = {
          CommID: `COMM-${svc.SVCID}-CANCEL-${Date.now()}`,
          Direction: 'OUTBOUND',
          TripID: trip.TripID,
          SVCID: svc.SVCID,
          Token: svc.SVCID,
          From: 'operations@viq.local',
          To: recipients.join(', '),
          Subject: generated.subject,
          Body: generated.body,
          TimestampZ: new Date().toISOString(),
          Status: 'Draft',
        };
        await saveComm(comm);
        const sent = await sendComm(comm.CommID);
        results.push({ provider: provider.Name, ok: sent.Status === 'Sent', error: sent.ErrorMessage });
      } catch {
        results.push({ provider: provider.Name, ok: false, error: 'send failed' });
      }
    }
    setSendResults(results);
    setStep('done');
    await onCancelled();
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader><DialogTitle>Cancel Leg {leg.Seq}: {leg.DepICAO} → {leg.ArrICAO}</DialogTitle></DialogHeader>
        {error && <p className="text-sm text-destructive">{error}</p>}
        {step === 'preview' && preview && (
          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-2 text-sm">
              <div>Services affected: <strong>{preview.servicesAffected}</strong></div>
              <div>Confirmed: <strong>{preview.confirmed}</strong></div>
              <div>Requested: <strong>{preview.requested}</strong></div>
              <div>Not started: <strong>{preview.notStarted}</strong></div>
              <div>Not required: <strong>{preview.notRequired}</strong></div>
              <div>Crew: <strong>{preview.crewCount}</strong></div>
              <div>Passengers: <strong>{preview.paxCount}</strong></div>
              <div>Vendor notifications: <strong>{preview.vendorNotifications}</strong></div>
            </div>
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
              <Button variant="outline" onClick={onClose}>Cancel</Button>
              <Button variant="destructive" disabled={!reason} onClick={handleConfirm}>Cancel &amp; Notify</Button>
            </div>
          </div>
        )}
        {step === 'cancelling' && <p className="text-sm text-muted-foreground">Cancelling…</p>}
        {step === 'done' && (
          <div className="space-y-2">
            <p className="text-sm">Leg cancelled.</p>
            {sendResults.map((r, i) => (
              <p key={i} className={`text-xs ${r.ok ? 'text-emerald-600' : 'text-amber-600'}`}>
                {r.ok ? `Notified ${r.provider}.` : `Could not notify ${r.provider}${r.error ? ` (${r.error})` : ''}.`}
              </p>
            ))}
            <Button size="sm" onClick={onClose}>Close</Button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
