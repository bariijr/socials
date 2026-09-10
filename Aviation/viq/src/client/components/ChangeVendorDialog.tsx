// src/client/components/ChangeVendorDialog.tsx
//
// Sub-project 3b of the Vendor Assignment Engine: the guided "Change
// Vendor" workflow (source doc §28-29, §57-58). Available only once a
// service has a real, previously-sent request (changeVendorAllowed on the
// server side gates this the same way) -- never silently swaps the
// provider like the raw field edit used to.
import { useEffect, useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  ApiError, getChangeVendorCandidates, changeVendor, patchVendorChangeLogNewRequestComm, getVendorChangeLogsForService,
  saveComm, sendComm, saveService, getProviderList,
} from '@/lib/dataStore';
import { generateEmail, defaultTemplateFor, defaultTemplateForCancellation } from '@/lib/emailTemplates';
import { useAuth } from '@/lib/authContext';
import type { Service, Leg, Trip, TripPersonView, Comm } from '@/data/types';

const VENDOR_CHANGE_REASONS = [
  'Client Requested', 'Vendor Unavailable', 'No Response', 'Price', 'Credit Issue',
  'Operational Requirement', 'Capability Issue', 'Schedule Issue', 'Quality Issue', 'Other',
];

type Step = 'pick' | 'cancelling' | 'cancel-failed' | 'requesting' | 'done' | 'request-failed';

export function ChangeVendorDialog({
  open, onClose, svc, leg, trip, legs, persons, onChanged,
}: {
  open: boolean;
  onClose: () => void;
  svc: Service;
  leg: Leg;
  trip: Trip;
  legs: Leg[];
  persons: TripPersonView[];
  onChanged: () => Promise<void> | void;
}) {
  const { isAdmin } = useAuth();
  const [candidates, setCandidates] = useState<{ vendorId: string; providerName: string }[]>([]);
  const [loadingCandidates, setLoadingCandidates] = useState(true);
  const [overrideMode, setOverrideMode] = useState(false);
  const [allProviders, setAllProviders] = useState<{ ProviderID: string; Name: string }[]>([]);
  const [toProviderId, setToProviderId] = useState('');
  const [reason, setReason] = useState('');
  const [notes, setNotes] = useState('');
  const [step, setStep] = useState<Step>('pick');
  const [error, setError] = useState('');

  useEffect(() => {
    if (!open) return;
    setStep('pick');
    setToProviderId('');
    setReason('');
    setNotes('');
    setOverrideMode(false);
    setError('');
    setLoadingCandidates(true);
    getChangeVendorCandidates(svc.SVCID)
      .then((result) => setCandidates(result))
      .catch(() => setCandidates([]))
      .finally(() => setLoadingCandidates(false));
    setAllProviders(getProviderList());
  }, [open, svc.SVCID]);

  const currentProvider = allProviders.find((p) => p.ProviderID === svc.ProviderID);
  const pickerOptions = overrideMode ? allProviders : candidates.map((c) => ({ ProviderID: c.vendorId, Name: c.providerName }));

  async function handleConfirm() {
    if (!toProviderId || !reason || !svc.ProviderID) return;
    setError('');
    setStep('cancelling');

    const fromProvider = getProviderList().find((p) => p.ProviderID === svc.ProviderID) ?? null;
    const recipients = fromProvider?.Channels?.filter((c) => c.ChannelType === 'Email').map((c) => c.Value) ?? [];
    if (recipients.length === 0) {
      setError('The current provider has no email address on file — cannot send a cancellation. Fix the provider contact details first.');
      setStep('cancel-failed');
      return;
    }

    const cancelTemplate = defaultTemplateForCancellation(svc.ServiceType);
    const generatedCancel = generateEmail(
      cancelTemplate, trip.TripID, leg.LegID, svc.SVCID, legs, persons, '',
      trip.Registration, trip.AircraftICAOType || '', trip.AircraftMTOWKg || 0,
      trip.Client, trip.Operator, trip.SupportRef || '', svc.CountryISO2 ?? null, recipients,
      null, svc.RefNumber || '',
    );
    const cancelComm: Comm = {
      CommID: `COMM-${svc.SVCID}-CANCEL-${Date.now()}`,
      Direction: 'OUTBOUND',
      TripID: trip.TripID,
      SVCID: svc.SVCID,
      Token: svc.SVCID,
      From: 'operations@viq.local',
      To: recipients.join(', '),
      Subject: generatedCancel.subject,
      Body: generatedCancel.body,
      TimestampZ: new Date().toISOString(),
      Status: 'Draft',
    };

    try {
      await saveComm(cancelComm);
      const sentCancel = await sendComm(cancelComm.CommID);
      if (sentCancel.Status !== 'Sent') {
        setError(`Cancellation to ${fromProvider?.Name ?? 'the current vendor'} could not be sent: ${sentCancel.ErrorMessage || 'unknown error'}. Nothing has changed — you can retry.`);
        setStep('cancel-failed');
        return;
      }
    } catch (err) {
      setError('Cancellation send failed — nothing has changed. You can retry.');
      setStep('cancel-failed');
      return;
    }

    let pending: Service;
    try {
      pending = await changeVendor(svc.SVCID, {
        toProviderId, reason, notes: notes || undefined,
        cancellationCommId: cancelComm.CommID, version: svc.Version,
      });
    } catch (err) {
      const message = err instanceof ApiError && err.status === 409
        ? 'This service was modified elsewhere — close and reopen to retry.'
        : 'The cancellation to the previous vendor was sent, but the vendor swap failed to save. Please retry — do not resend the cancellation.';
      setError(message);
      setStep('cancel-failed');
      return;
    }

    setStep('requesting');
    const toProvider = getProviderList().find((p) => p.ProviderID === toProviderId) ?? null;
    const newRecipients = toProvider?.Channels?.filter((c) => c.ChannelType === 'Email').map((c) => c.Value) ?? [];
    if (newRecipients.length === 0) {
      await saveService({ ...pending, Notes: `${pending.Notes} Change Vendor: new provider has no email on file.`.trim() });
      setError('Vendor cancelled and swapped, but the new provider has no email address on file. This service now needs a manual submission.');
      setStep('request-failed');
      await onChanged();
      return;
    }

    const requestTemplate = defaultTemplateFor(svc.ServiceType, 'Request');
    const newRef = `REQ-${svc.SVCID}-${Date.now()}`;
    const generatedRequest = generateEmail(
      requestTemplate, trip.TripID, leg.LegID, pending.SVCID, legs, persons, '',
      trip.Registration, trip.AircraftICAOType || '', trip.AircraftMTOWKg || 0,
      trip.Client, trip.Operator, trip.SupportRef || '', pending.CountryISO2 ?? null, newRecipients,
      null, newRef,
    );
    const requestComm: Comm = {
      CommID: `COMM-${pending.SVCID}-${Date.now()}`,
      Direction: 'OUTBOUND',
      TripID: pending.TripID,
      SVCID: pending.SVCID,
      Token: pending.SVCID,
      From: 'operations@viq.local',
      To: newRecipients.join(', '),
      Subject: generatedRequest.subject,
      Body: generatedRequest.body,
      TimestampZ: new Date().toISOString(),
      Status: 'Draft',
    };

    try {
      await saveComm(requestComm);
      const sentRequest = await sendComm(requestComm.CommID);
      if (sentRequest.Status === 'Sent') {
        await saveService({ ...pending, Status: 'Requested', RefNumber: newRef });
        // Cross-reference the new request Comm onto the VendorChangeLog row
        // changeVendor() just wrote (it only knows the cancellation Comm at
        // that point, since the new request hasn't been sent yet). This is
        // a convenience link for later display -- if it fails, the vendor
        // swap and both emails have already fully succeeded, so don't fail
        // the whole flow over it.
        try {
          const logs = await getVendorChangeLogsForService(pending.SVCID);
          const log = logs.find((l) => l.CancellationCommID === cancelComm.CommID) ?? logs[logs.length - 1];
          if (log) await patchVendorChangeLogNewRequestComm(log.ID, requestComm.CommID);
        } catch {
          // Non-critical -- see comment above.
        }
        setStep('done');
      } else {
        await saveService({ ...pending, Status: 'Submission Failed', Notes: `${pending.Notes} Send failed: ${sentRequest.ErrorMessage || 'unknown error'}.`.trim() });
        setStep('request-failed');
      }
    } catch (err) {
      await saveService({ ...pending, Status: 'Submission Failed', Notes: `${pending.Notes} Send failed: unexpected error.`.trim() });
      setStep('request-failed');
    }

    await onChanged();
  }

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Change Vendor</DialogTitle>
        </DialogHeader>

        <div className="space-y-4 py-2">
          <div className="text-sm">
            <div className="text-muted-foreground">Current vendor</div>
            <div className="font-medium">{currentProvider?.Name ?? svc.ProviderID}</div>
            {svc.RefNumber && <div className="text-xs text-muted-foreground">Previous request: {svc.RefNumber}</div>}
          </div>

          {step === 'pick' && (
            <>
              <div>
                <Label>Replacement vendor</Label>
                {loadingCandidates ? (
                  <div className="text-xs text-muted-foreground">Loading eligible vendors…</div>
                ) : (
                  <Select value={toProviderId} onValueChange={setToProviderId}>
                    <SelectTrigger><SelectValue placeholder="Choose a vendor" /></SelectTrigger>
                    <SelectContent>
                      {pickerOptions.map((p) => <SelectItem key={p.ProviderID} value={p.ProviderID}>{p.Name}</SelectItem>)}
                    </SelectContent>
                  </Select>
                )}
                {!loadingCandidates && candidates.length === 0 && !overrideMode && (
                  <div className="mt-1 text-xs text-muted-foreground">No eligible vendors found for this context.</div>
                )}
                {isAdmin && (
                  <button type="button" className="mt-1 text-xs text-blue-600 underline" onClick={() => setOverrideMode((v) => !v)}>
                    {overrideMode ? 'Show eligible vendors only' : 'Choose any vendor (Admin override)'}
                  </button>
                )}
              </div>
              <div>
                <Label>Reason</Label>
                <Select value={reason} onValueChange={setReason}>
                  <SelectTrigger><SelectValue placeholder="Select a reason" /></SelectTrigger>
                  <SelectContent>
                    {VENDOR_CHANGE_REASONS.map((r) => <SelectItem key={r} value={r}>{r}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Notes (optional)</Label>
                <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} />
              </div>
            </>
          )}

          {step === 'cancelling' && <div className="text-sm">Sending cancellation to {currentProvider?.Name}…</div>}
          {step === 'requesting' && <div className="text-sm">Sending new request to the replacement vendor…</div>}
          {step === 'done' && <div className="text-sm text-emerald-600">Done — previous request cancelled, replacement request sent.</div>}

          {(step === 'cancel-failed' || step === 'request-failed') && (
            <div className="text-sm text-red-600">{error}</div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>{step === 'done' ? 'Close' : 'Cancel'}</Button>
          {step === 'pick' && (
            <Button disabled={!toProviderId || !reason} onClick={handleConfirm}>Confirm Change</Button>
          )}
          {step === 'cancel-failed' && (
            <Button onClick={handleConfirm}>Retry Cancellation</Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
