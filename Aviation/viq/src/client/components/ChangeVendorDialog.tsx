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
// Shared with the Submission Engine's own "append a status note" call sites
// (structurally identical pattern -- keep the DTO's @MaxLength(2000) note
// budget in one place). Safe despite the import cycle this creates
// (TripDetail.tsx imports ChangeVendorDialog): appendBoundedNote is a
// hoisted function declaration used only inside event handlers here, never
// at module-evaluation time.
import { appendBoundedNote } from '@/pages/TripDetail';
import type { Service, Leg, Trip, TripPersonView, Comm } from '@/data/types';

const VENDOR_CHANGE_REASONS = [
  'Client Requested', 'Vendor Unavailable', 'No Response', 'Price', 'Credit Issue',
  'Operational Requirement', 'Capability Issue', 'Schedule Issue', 'Quality Issue', 'Other',
];

// 'cancel-failed' vs 'swap-failed' are deliberately distinct: the former
// means the cancellation email itself never went out (retrying resends it,
// safely), the latter means the cancellation WAS confirmed sent and only the
// subsequent changeVendor() save failed (retrying must NOT resend it -- see
// handleRetrySwap).
type Step = 'pick' | 'cancelling' | 'cancel-failed' | 'swap-failed' | 'requesting' | 'done' | 'request-failed';

// Critical 3 (final-review fix wave): the in-memory sentCancellationCommId
// state only survives for as long as THIS dialog instance stays mounted --
// closing and reopening it (e.g. after landing on 'swap-failed') used to
// reset that to null, so the user could fall through handleConfirm again
// and send a genuinely SECOND cancellation email to the old vendor. This
// module-level map is the fix: it survives a close/reopen (indeed any
// remount) within the same browser session/tab, keyed by the service whose
// change is in flight, so the dialog can always tell "a cancellation was
// already sent for this service's in-progress change" regardless of its own
// mount history. Entries are written the instant a cancellation is
// confirmed Sent and are deleted ONLY once the entire change completes
// (the 'done' step) -- see attemptSwapAndRequest's success path. A
// service's own changeVendorAllowed status gating (server) /
// changeVendorAllowedClient (client) additionally makes the dialog
// unreachable again once a change has fully resolved (successfully or via
// 'request-failed', which already flips status away from the allowed set),
// so this map only ever needs to answer for the narrow "cancellation sent,
// swap not yet saved" window.
type PendingCancellation = { cancellationCommId: string; toProviderId: string; reason: string; notes?: string };
const pendingCancellations = new Map<string, PendingCancellation>();

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
  // Distinct from "no candidates" (an empty, successful result) -- a fetch
  // failure must surface visibly rather than being indistinguishable from a
  // genuinely empty eligible pool (see JSX below).
  const [candidatesError, setCandidatesError] = useState(false);
  const [overrideMode, setOverrideMode] = useState(false);
  const [allProviders, setAllProviders] = useState<{ ProviderID: string; Name: string }[]>([]);
  const [toProviderId, setToProviderId] = useState('');
  const [reason, setReason] = useState('');
  const [notes, setNotes] = useState('');
  const [step, setStep] = useState<Step>('pick');
  const [error, setError] = useState('');
  // Remembered once the cancellation email is confirmed Sent, so a
  // swap-failed retry can reuse it instead of building + sending a brand
  // new cancellation Comm (which would notify the old vendor twice).
  const [sentCancellationCommId, setSentCancellationCommId] = useState<string | null>(null);
  const [retryingSwap, setRetryingSwap] = useState(false);

  function loadCandidates() {
    setLoadingCandidates(true);
    setCandidatesError(false);
    getChangeVendorCandidates(svc.SVCID)
      .then((result) => setCandidates(result))
      .catch(() => {
        setCandidates([]);
        setCandidatesError(true);
      })
      .finally(() => setLoadingCandidates(false));
  }

  useEffect(() => {
    if (!open) return;
    setAllProviders(getProviderList());

    const resume = pendingCancellations.get(svc.SVCID);
    if (resume) {
      // A cancellation was already confirmed Sent for this exact service in
      // a previous dialog session that never reached 'done' -- resuming at
      // 'pick' would let the coordinator build and send a second, real
      // cancellation email to the same vendor. Skip 'pick' entirely and land
      // on the safe resumed state, pre-populated with exactly what was in
      // effect when the cancellation went out, so a retry can only ever
      // reattempt the (not-yet-saved) swap -- never resend the cancellation.
      setToProviderId(resume.toProviderId);
      setReason(resume.reason);
      setNotes(resume.notes || '');
      setOverrideMode(false);
      setSentCancellationCommId(resume.cancellationCommId);
      setError("The vendor swap couldn't be saved. The previous vendor has already been sent a cancellation — do not restart this Change Vendor from scratch. Retry the swap below.");
      setStep('swap-failed');
      return;
    }

    setStep('pick');
    setToProviderId('');
    setReason('');
    setNotes('');
    setOverrideMode(false);
    setError('');
    setSentCancellationCommId(null);
    loadCandidates();
    // eslint-disable-next-line react-hooks/exhaustive-deps
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

    // The cancellation is now confirmed Sent -- remember its Comm id (both in
    // this component's own state, for a same-session swap-failed retry, AND
    // in the module-level map, so the "already sent" fact survives a
    // close/reopen of this dialog -- see Critical 3, Part B).
    setSentCancellationCommId(cancelComm.CommID);
    pendingCancellations.set(svc.SVCID, {
      cancellationCommId: cancelComm.CommID,
      toProviderId,
      reason,
      notes: notes || undefined,
    });
    await attemptSwapAndRequest(cancelComm.CommID);
  }

  // Part A of Critical 3: a 409 from changeVendor() carries the fresh
  // record in its ConflictException body (`current.version`) -- most
  // conflicts (a merely-stale svc.Version prop, a concurrent edit, or
  // Critical 1's own now-fixed failure mode) recover from this automatically
  // without ever needing a manual retry. Attempted exactly once; never
  // touches saveComm/sendComm, so it can never cause a second cancellation
  // to be sent. Returns the swapped Service on success, or null after
  // putting the dialog in the 'swap-failed' terminal state.
  async function trySwapWithVersionRecovery(cancellationCommId: string): Promise<Service | null> {
    try {
      return await changeVendor(svc.SVCID, {
        toProviderId, reason, notes: notes || undefined,
        cancellationCommId, version: svc.Version,
      });
    } catch (err) {
      const freshVersion = err instanceof ApiError && err.status === 409
        ? (err.body as { current?: { version?: number } } | undefined)?.current?.version
        : undefined;
      if (typeof freshVersion === 'number') {
        try {
          return await changeVendor(svc.SVCID, {
            toProviderId, reason, notes: notes || undefined,
            cancellationCommId, version: freshVersion,
          });
        } catch {
          // Auto-retry also failed -- fall through to swap-failed below.
        }
      }
      setError("The vendor swap couldn't be saved. The previous vendor has already been sent a cancellation — do not restart this Change Vendor from scratch. Retry the swap below.");
      setStep('swap-failed');
      return null;
    }
  }

  // Everything from "save the vendor swap" onward, factored out so a
  // swap-failed retry can re-run it with the ALREADY-SENT cancellation
  // Comm id, without ever touching saveComm/sendComm for the cancellation
  // again. Only reached once a cancellation email has been confirmed Sent
  // (either just now, in handleConfirm, or on a prior attempt, via
  // handleRetrySwap).
  async function attemptSwapAndRequest(cancellationCommId: string) {
    const pending = await trySwapWithVersionRecovery(cancellationCommId);
    if (!pending) return; // trySwapWithVersionRecovery already set swap-failed.

    // The swap itself is now durably saved server-side -- the specific risk
    // Critical 3 guards against (resending THIS cancellation) is over, since
    // any future Change Vendor on this service would target its new current
    // provider. Everything from here on is Important 1's territory: no
    // matter what throws below (including a recovery saveService() call
    // itself throwing), the dialog must land on a terminal, user-visible
    // state rather than hanging on "Sending new request..." forever.
    try {
      setStep('requesting');
      const toProvider = getProviderList().find((p) => p.ProviderID === toProviderId) ?? null;
      const newRecipients = toProvider?.Channels?.filter((c) => c.ChannelType === 'Email').map((c) => c.Value) ?? [];
      if (newRecipients.length === 0) {
        // Structurally identical to the "send failed" branch below -- both
        // are "needs manual attention" outcomes, so both must consistently
        // flag the service as Submission Failed, not just one of them.
        await saveService({ ...pending, Status: 'Submission Failed', Notes: appendBoundedNote(pending.Notes, 'Change Vendor: new provider has no email on file.') });
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
          const log = logs.find((l) => l.CancellationCommID === cancellationCommId) ?? logs[logs.length - 1];
          if (log) await patchVendorChangeLogNewRequestComm(log.ID, requestComm.CommID);
        } catch {
          // Non-critical -- see comment above.
        }
        // Part B of Critical 3: the entire change has now fully completed
        // (old vendor cancelled, swap saved, new vendor requested) -- only
        // now is it safe to forget that a cancellation was ever sent for
        // this service, so a genuinely NEW Change Vendor attempt later
        // isn't mistaken for a resumable in-progress one.
        pendingCancellations.delete(svc.SVCID);
        setStep('done');
      } else {
        await saveService({ ...pending, Status: 'Submission Failed', Notes: appendBoundedNote(pending.Notes, `Send failed: ${sentRequest.ErrorMessage || 'unknown error'}.`) });
        setStep('request-failed');
      }
    } catch (err) {
      // Important 1: catches anything unexpected from the block above,
      // including a recovery saveService() call itself throwing (e.g. an
      // unrelated 409) -- without this, that rejection would escape the
      // function entirely and leave the dialog stuck on "Sending new
      // request..." with no way out except closing it.
      setError('Something went wrong while sending the replacement request. The vendor swap has already been saved and the previous vendor has been sent a cancellation — this service needs manual follow-up.');
      setStep('request-failed');
    }

    await onChanged();
  }

  // Retries ONLY the swap-and-request step, reusing the cancellation Comm
  // id remembered when the cancellation was confirmed Sent -- it never
  // calls saveComm/sendComm for a cancellation again, so the old vendor
  // cannot receive a second cancellation notice from this retry.
  async function handleRetrySwap() {
    if (!sentCancellationCommId) return;
    setError('');
    setRetryingSwap(true);
    try {
      await attemptSwapAndRequest(sentCancellationCommId);
    } finally {
      setRetryingSwap(false);
    }
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
                {!loadingCandidates && candidatesError && (
                  <div className="mt-1 text-xs text-red-600">
                    Couldn't load eligible vendors — try again.{' '}
                    <button type="button" className="underline" onClick={loadCandidates}>Retry</button>
                  </div>
                )}
                {!loadingCandidates && !candidatesError && candidates.length === 0 && !overrideMode && (
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

          {(step === 'cancel-failed' || step === 'swap-failed' || step === 'request-failed') && (
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
          {step === 'swap-failed' && (
            <Button disabled={retryingSwap} onClick={handleRetrySwap}>{retryingSwap ? 'Retrying…' : 'Retry Swap'}</Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
