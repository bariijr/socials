// src/client/components/VendorTieResolutionDialog.tsx
//
// Sub-project 2 of the Vendor Assignment Engine: after generation, any
// created service left as VendorSelectionSource === 'CHOICE_REQUIRED'
// needs a coordinator to pick between tied vendors. This dialog is
// invoked identically from all 4 generation call sites (TripDetail,
// AdminTrips x3, NewTripWizard) -- callers just filter the generation
// result for CHOICE_REQUIRED services and pass them in.
import { useEffect, useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { ApiError, getVendorCandidates, saveService } from '@/lib/dataStore';
import type { Service } from '@/data/types';

interface RowState {
  service: Service;
  alternatives: { vendorId: string; providerName: string }[];
  selected?: string;
  loading: boolean;
  saved: boolean;
  error?: string;
}

export function VendorTieResolutionDialog({
  open, onClose, services,
}: {
  open: boolean;
  onClose: () => void;
  services: Service[];
}) {
  const [rows, setRows] = useState<RowState[]>([]);

  useEffect(() => {
    if (!open) return;
    setRows(services.map((service) => ({ service, alternatives: [], loading: true, saved: false })));
    services.forEach((service, idx) => {
      getVendorCandidates(service.SVCID)
        .then((result) => {
          setRows((prev) => {
            const next = [...prev];
            next[idx] = { ...next[idx], alternatives: result.alternatives, loading: false };
            return next;
          });
        })
        .catch(() => {
          setRows((prev) => {
            const next = [...prev];
            next[idx] = { ...next[idx], loading: false };
            return next;
          });
        });
    });
  }, [open, services]);

  async function handleResolve(idx: number) {
    const row = rows[idx];
    if (!row.selected) return;
    setRows((prev) => {
      const next = [...prev];
      next[idx] = { ...next[idx], error: undefined };
      return next;
    });
    try {
      await saveService({ ...row.service, ProviderID: row.selected });
      setRows((prev) => {
        const next = [...prev];
        next[idx] = { ...next[idx], saved: true };
        return next;
      });
    } catch (err) {
      const message = err instanceof ApiError && err.status === 409
        ? 'This service was modified elsewhere — close and reopen to retry.'
        : 'Could not save this vendor choice. Please try again.';
      setRows((prev) => {
        const next = [...prev];
        next[idx] = { ...next[idx], error: message };
        return next;
      });
    }
  }

  const unresolvedCount = rows.filter((r) => !r.saved).length;

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Resolve Vendor Choices ({unresolvedCount} remaining)</DialogTitle>
        </DialogHeader>

        <div className="space-y-4 py-2 max-h-[60vh] overflow-auto">
          {rows.map((row, idx) => (
            <div key={row.service.SVCID} className="rounded-md border p-3 text-sm">
              <div className="font-medium mb-1">{row.service.ServiceType} — {row.service.CountryISO2 || row.service.ICAO}</div>
              {row.saved ? (
                <div className="text-xs text-emerald-600">Resolved.</div>
              ) : row.loading ? (
                <div className="text-xs text-muted-foreground">Loading options…</div>
              ) : row.alternatives.length === 0 ? (
                <div className="text-xs text-muted-foreground">No alternatives found — this may have already been resolved elsewhere.</div>
              ) : (
                <div className="flex items-center gap-2">
                  <Select value={row.selected} onValueChange={(v) => setRows((prev) => {
                    const next = [...prev];
                    next[idx] = { ...next[idx], selected: v };
                    return next;
                  })}>
                    <SelectTrigger className="flex-1">
                      <SelectValue placeholder="Choose a vendor" />
                    </SelectTrigger>
                    <SelectContent>
                      {row.alternatives.map((a) => <SelectItem key={a.vendorId} value={a.vendorId}>{a.providerName}</SelectItem>)}
                    </SelectContent>
                  </Select>
                  <Button size="sm" disabled={!row.selected} onClick={() => handleResolve(idx)}>Use</Button>
                </div>
              )}
              {row.error && <div className="text-xs text-red-600 mt-1">{row.error}</div>}
            </div>
          ))}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Close</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
