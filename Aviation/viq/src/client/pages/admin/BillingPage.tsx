// @ts-nocheck
import { useState, useMemo, useRef, useEffect } from 'react';
import { useNavigate } from 'react-router';
import { useAuth } from '@/lib/authContext';
import {
  getInvoices, saveInvoice, getTrips, getTrip,
  getServicesForTrip, generateInvoiceFromTrip, generateQRCode,
  formatDate, formatZ, resolveBillToAddress
} from '@/lib/dataStore';
import type { Invoice, InvoiceChange, InvoiceLineItem } from '@/lib/dataStore';
import type { Trip } from '@/data/types';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter
} from '@/components/ui/dialog';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue
} from '@/components/ui/select';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow
} from '@/components/ui/table';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  DollarSign, FileText, Plus, QrCode, Send, CheckCircle2,
  Clock, XCircle, AlertTriangle, Download, ArrowLeft, Eye,
  RefreshCw, ChevronRight, Trash2, Save
} from 'lucide-react';

const INVOICE_STATUSES = ['Draft', 'Sent', 'Viewed', 'Paid', 'Overdue', 'Cancelled'] as const;

type InvoiceStatus = typeof INVOICE_STATUSES[number];

const STATUS_ICONS: Record<InvoiceStatus, React.ReactNode> = {
  Draft: <FileText className="h-4 w-4 text-slate-500" />,
  Sent: <Send className="h-4 w-4 text-blue-500" />,
  Viewed: <Eye className="h-4 w-4 text-purple-500" />,
  Paid: <CheckCircle2 className="h-4 w-4 text-emerald-500" />,
  Overdue: <AlertTriangle className="h-4 w-4 text-red-500" />,
  Cancelled: <XCircle className="h-4 w-4 text-gray-500" />,
};

const STATUS_COLORS: Record<InvoiceStatus, string> = {
  Draft: 'bg-slate-100 text-slate-700',
  Sent: 'bg-blue-100 text-blue-700',
  Viewed: 'bg-purple-100 text-purple-700',
  Paid: 'bg-emerald-100 text-emerald-700',
  Overdue: 'bg-red-100 text-red-700',
  Cancelled: 'bg-gray-100 text-gray-500',
};

// ─── Helpers ────────────────────────────────────────────────────────────────

function canTransition(from: InvoiceStatus, to: InvoiceStatus): boolean {
  const flow: Record<InvoiceStatus, InvoiceStatus[]> = {
    Draft: ['Sent', 'Cancelled'],
    Sent: ['Viewed', 'Paid', 'Overdue', 'Cancelled'],
    Viewed: ['Paid', 'Overdue', 'Cancelled'],
    Paid: [],
    Overdue: ['Paid', 'Cancelled'],
    Cancelled: ['Draft'],
  };
  return flow[from]?.includes(to) ?? false;
}

// ─── Components ─────────────────────────────────────────────────────────────

function InvoiceDetailDialog({
  invoice,
  open,
  onClose,
  onSaved,
}: {
  invoice: Invoice | null;
  open: boolean;
  onClose: () => void;
  onSaved: () => void;
}) {
  const { canEdit } = useAuth();
  const [status, setStatus] = useState<InvoiceStatus>('Draft');
  const [reason, setReason] = useState('');
  const [qrDataUrl, setQrDataUrl] = useState('');
  const [trip, setTrip] = useState<Trip | null>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  // Line items are edited as a local draft and only written back on
  // "Save Changes" — only permitted while the invoice is still Draft, since
  // amounts shouldn't move once an invoice has actually been sent.
  const [draftLines, setDraftLines] = useState<InvoiceLineItem[]>([]);
  const [savingLines, setSavingLines] = useState(false);

  useEffect(() => {
    if (invoice && open) {
      setStatus(invoice.Status);
      setQrDataUrl(generateQRCode(invoice.InvoiceID));
      getTrip(invoice.TripID).then((t) => setTrip(t ?? null));
      setDraftLines(invoice.LineItems);
    }
  }, [invoice, open]);

  if (!invoice) return null;

  const canEditLines = canEdit && invoice.Status === 'Draft';
  const linesChanged = JSON.stringify(draftLines) !== JSON.stringify(invoice.LineItems);
  const draftSubtotal = draftLines.reduce((sum, l) => sum + l.Total, 0);
  const draftTaxAmount = draftSubtotal * invoice.TaxRate;
  const draftTotal = draftSubtotal + draftTaxAmount;

  const updateLine = (idx: number, patch: Partial<InvoiceLineItem>) => {
    setDraftLines((prev) => prev.map((l, i) => {
      if (i !== idx) return l;
      const next = { ...l, ...patch };
      next.Total = next.Quantity * next.UnitPrice;
      return next;
    }));
  };

  const removeLine = (idx: number) => {
    setDraftLines((prev) => prev.filter((_, i) => i !== idx));
  };

  const addLine = () => {
    setDraftLines((prev) => [...prev, {
      LineID: `LI-MANUAL-${Date.now()}`, SVCID: null, Description: '', Quantity: 1, Unit: 'each', UnitPrice: 0, Total: 0, ProviderID: null,
    }]);
  };

  const saveLines = async () => {
    if (!canEditLines) return;
    setSavingLines(true);
    try {
      const change: InvoiceChange = {
        TimestampZ: new Date().toISOString(),
        User: 'SYSTEM',
        Field: 'LineItems',
        OldValue: `${invoice.LineItems.length} item(s), ${invoice.Total.toFixed(2)} ${invoice.Currency}`,
        NewValue: `${draftLines.length} item(s), ${draftTotal.toFixed(2)} ${invoice.Currency}`,
        Reason: 'Line items edited',
      };
      const updated: Invoice = {
        ...invoice,
        LineItems: draftLines,
        Subtotal: draftSubtotal,
        TaxAmount: draftTaxAmount,
        Total: draftTotal,
        ChangeLog: [change, ...invoice.ChangeLog],
      };
      await saveInvoice(updated);
      onSaved();
    } finally {
      setSavingLines(false);
    }
  };

  const availableTransitions = INVOICE_STATUSES.filter((s) => canTransition(invoice.Status, s));

  const handleStatusChange = async (newStatus: InvoiceStatus) => {
    if (!canEdit) return;
    if (!reason.trim() && newStatus !== invoice.Status) {
      alert('Please provide a reason for the status change.');
      return;
    }
    const change: InvoiceChange = {
      TimestampZ: new Date().toISOString(),
      User: 'SYSTEM',
      Field: 'Status',
      OldValue: invoice.Status,
      NewValue: newStatus,
      Reason: reason,
    };
    const updated: Invoice = {
      ...invoice,
      Status: newStatus,
      SentAtZ: newStatus === 'Sent' ? new Date().toISOString() : invoice.SentAtZ,
      PaidAtZ: newStatus === 'Paid' ? new Date().toISOString() : invoice.PaidAtZ,
      ChangeLog: [change, ...invoice.ChangeLog],
    };
    await saveInvoice(updated);
    setStatus(newStatus);
    setReason('');
    onSaved();
    onClose();
  };

  const downloadQR = () => {
    if (!qrDataUrl) return;
    const a = document.createElement('a');
    a.href = qrDataUrl;
    a.download = `${invoice.InvoiceID}-qr.png`;
    a.click();
  };

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      {/* A4-ish width/height (roughly 210mm at typical screen scaling) —
          bumped up from max-w-4xl specifically so the line-items table has
          room to breathe instead of feeling cramped. Must be sm:max-w-*, not
          a bare max-w-* — DialogContent's own base classes set sm:max-w-lg,
          and a same-specificity unprefixed override loses to that at ≥640px
          regardless of JSX order (Tailwind's cascade resolves same-specificity
          rules by stylesheet position, not by className order). */}
      <DialogContent className="sm:max-w-[900px] max-h-[95vh] overflow-hidden flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            {STATUS_ICONS[invoice.Status]}
            Invoice {invoice.InvoiceID}
          </DialogTitle>
        </DialogHeader>

        {/* Compact header — always visible above the tabs, not buried in a scroll */}
        <div className="flex items-start justify-between shrink-0">
          <div className="space-y-0.5">
            <div className="text-sm text-muted-foreground">
              Trip: <span className="font-mono font-medium">{invoice.TripID}</span>
              {trip && <span> — {trip.Client} — {trip.Registration}</span>}
            </div>
            <div className="text-xs text-muted-foreground">
              Issued {formatDate(invoice.IssueDateZ)} · Due {formatDate(invoice.DueDateZ)}
            </div>
          </div>
          <div className="text-right space-y-1">
            <Badge className={`text-sm ${STATUS_COLORS[invoice.Status]}`}>{invoice.Status}</Badge>
            <div className="text-2xl font-bold">{invoice.Total.toFixed(2)} {invoice.Currency}</div>
          </div>
        </div>

        <Tabs defaultValue="lines" className="flex-1 overflow-hidden flex flex-col">
          <TabsList className="shrink-0">
            <TabsTrigger value="lines">Line Items</TabsTrigger>
            <TabsTrigger value="details">Details & QR</TabsTrigger>
            <TabsTrigger value="status">Status & History</TabsTrigger>
          </TabsList>

          <TabsContent value="lines" className="flex-1 overflow-auto space-y-4">
            {!canEditLines && (
              <p className="text-xs text-muted-foreground">
                {invoice.Status === 'Draft' ? 'You do not have permission to edit line items.' : 'Line items can only be edited while the invoice is still Draft.'}
              </p>
            )}
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="text-sm py-3">Description</TableHead>
                  <TableHead className="text-right text-sm py-3 w-24">Qty</TableHead>
                  <TableHead className="text-right text-sm py-3 w-32">Unit Price</TableHead>
                  <TableHead className="text-right text-sm py-3 w-32">Total</TableHead>
                  {canEditLines && <TableHead className="w-10" />}
                </TableRow>
              </TableHeader>
              <TableBody>
                {draftLines.map((item, idx) => (
                  <TableRow key={item.LineID}>
                    <TableCell className="text-base py-3">
                      {canEditLines ? (
                        <Input className="h-10 text-base" value={item.Description} onChange={(e) => updateLine(idx, { Description: e.target.value })} />
                      ) : item.Description}
                    </TableCell>
                    <TableCell className="text-right text-base py-3">
                      {canEditLines ? (
                        <Input type="number" min={0} step={1} className="h-10 text-base text-right" value={item.Quantity} onChange={(e) => updateLine(idx, { Quantity: parseFloat(e.target.value) || 0 })} />
                      ) : item.Quantity}
                    </TableCell>
                    <TableCell className="text-right text-base py-3">
                      {canEditLines ? (
                        <Input type="number" min={0} step={0.01} className="h-10 text-base text-right" value={item.UnitPrice} onChange={(e) => updateLine(idx, { UnitPrice: parseFloat(e.target.value) || 0 })} />
                      ) : `${item.UnitPrice.toFixed(2)} ${invoice.Currency}`}
                    </TableCell>
                    <TableCell className="text-right text-base py-3 font-medium">{item.Total.toFixed(2)} {invoice.Currency}</TableCell>
                    {canEditLines && (
                      <TableCell>
                        <Button size="icon" variant="ghost" className="h-8 w-8" onClick={() => removeLine(idx)} title="Remove line item">
                          <Trash2 className="h-4 w-4 text-destructive" />
                        </Button>
                      </TableCell>
                    )}
                  </TableRow>
                ))}
                {draftLines.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={canEditLines ? 5 : 4} className="text-center text-sm text-muted-foreground py-6">No line items.</TableCell>
                  </TableRow>
                )}
                <TableRow>
                  <TableCell colSpan={canEditLines ? 4 : 3} className="text-right text-base py-3 font-medium">Subtotal</TableCell>
                  <TableCell className="text-right text-base py-3 font-medium">{draftSubtotal.toFixed(2)} {invoice.Currency}</TableCell>
                </TableRow>
                {invoice.TaxRate > 0 && (
                  <TableRow>
                    <TableCell colSpan={canEditLines ? 4 : 3} className="text-right text-base py-3">Tax ({(invoice.TaxRate * 100).toFixed(0)}%)</TableCell>
                    <TableCell className="text-right text-base py-3">{draftTaxAmount.toFixed(2)} {invoice.Currency}</TableCell>
                  </TableRow>
                )}
                <TableRow>
                  <TableCell colSpan={canEditLines ? 4 : 3} className="text-right text-xl py-3 font-bold">Total</TableCell>
                  <TableCell className="text-right text-xl py-3 font-bold">{draftTotal.toFixed(2)} {invoice.Currency}</TableCell>
                </TableRow>
              </TableBody>
            </Table>
            {canEditLines && (
              <div className="flex items-center justify-between">
                <Button size="sm" variant="outline" onClick={addLine}>
                  <Plus className="mr-1 h-3.5 w-3.5" /> Add Line Item
                </Button>
                <Button size="sm" onClick={saveLines} disabled={!linesChanged || savingLines}>
                  <Save className="mr-1 h-3.5 w-3.5" /> {savingLines ? 'Saving…' : 'Save Changes'}
                </Button>
              </div>
            )}
          </TabsContent>

          <TabsContent value="details" className="flex-1 overflow-auto space-y-4">
            {trip && resolveBillToAddress(trip) && (
              <div className="text-sm">
                <span className="font-medium">Bill To: </span>
                <span className="text-muted-foreground">{resolveBillToAddress(trip)}</span>
              </div>
            )}
            <div className="flex items-center gap-4">
              {qrDataUrl && (
                <div className="rounded-lg border p-2">
                  <img src={qrDataUrl} alt="QR Code" className="h-32 w-32" />
                </div>
              )}
              <div className="space-y-2">
                <div className="text-sm font-medium">Invoice QR Code</div>
                <div className="text-xs text-muted-foreground">Scan to verify invoice authenticity</div>
                <Button variant="outline" size="sm" onClick={downloadQR}>
                  <Download className="mr-1 h-3.5 w-3.5" />
                  Download QR
                </Button>
              </div>
            </div>
          </TabsContent>

          <TabsContent value="status" className="flex-1 overflow-auto space-y-4">
            {availableTransitions.length > 0 && (
              <div className="rounded-lg border p-4 space-y-3">
                <h3 className="text-sm font-semibold">Change Status</h3>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <Label className="text-xs">New Status</Label>
                    <Select value={status} onValueChange={(v) => setStatus(v as InvoiceStatus)}>
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {availableTransitions.map((s) => (
                          <SelectItem key={s} value={s}>{s}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label className="text-xs">Reason</Label>
                    <Input
                      value={reason}
                      onChange={(e) => setReason(e.target.value)}
                      placeholder="Required for audit trail"
                    />
                  </div>
                </div>
                <Button size="sm" onClick={() => canEdit && handleStatusChange(status)} disabled={status === invoice.Status || !canEdit}>
                  <RefreshCw className="mr-1 h-3.5 w-3.5" />
                  Update Status
                </Button>
              </div>
            )}

            {invoice.ChangeLog.length > 0 && (
              <div>
                <h3 className="text-sm font-semibold mb-2">Change History</h3>
                <div className="space-y-2">
                  {invoice.ChangeLog.map((log, idx) => (
                    <div key={idx} className="flex items-start gap-2 text-xs rounded-md bg-slate-50 p-2">
                      <Clock className="h-3 w-3 mt-0.5 text-muted-foreground shrink-0" />
                      <div className="space-y-0.5">
                        <div className="font-medium">{log.Field}: {log.OldValue} → {log.NewValue}</div>
                        <div className="text-muted-foreground">{log.Reason}</div>
                        <div className="text-muted-foreground">{formatZ(log.TimestampZ)} by {log.User}</div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </TabsContent>
        </Tabs>

        <DialogFooter className="shrink-0">
          <Button variant="outline" onClick={onClose}>Close</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function GenerateDialog({
  open,
  onClose,
  onSaved,
}: {
  open: boolean;
  onClose: () => void;
  onSaved: () => void;
}) {
  const { canEdit } = useAuth();
  const [selectedTripId, setSelectedTripId] = useState('');
  const [eligibleTrips, setEligibleTrips] = useState<Trip[]>([]);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    Promise.all([getTrips(), getInvoices()]).then(async ([trips, existingInvoices]) => {
      const withServices = await Promise.all(
        trips.map(async (t) => [t, await getServicesForTrip(t.TripID)] as const)
      );
      if (cancelled) return;
      const filtered = withServices
        .filter(([, svcs]) => svcs.some((s) => s.Status === 'Confirmed'))
        .filter(([t]) => !existingInvoices.some((i) => i.TripID === t.TripID))
        .map(([t]) => t);
      setEligibleTrips(filtered);
    });
    return () => { cancelled = true; };
  }, [open]);

  const handleGenerate = async () => {
    if (!canEdit || !selectedTripId) return;
    const invoice = await generateInvoiceFromTrip(selectedTripId);
    if (invoice) {
      onSaved();
      onClose();
    } else {
      alert('No confirmed services found for this trip.');
    }
  };

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Generate Invoice</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          {eligibleTrips.length === 0 ? (
            <div className="text-center text-muted-foreground py-4">
              No eligible trips. A trip needs at least one confirmed service and no existing invoice.
            </div>
          ) : (
            <div>
              <Label>Select Trip</Label>
              <Select value={selectedTripId} onValueChange={setSelectedTripId}>
                <SelectTrigger>
                  <SelectValue placeholder="Choose a trip..." />
                </SelectTrigger>
                <SelectContent>
                  {eligibleTrips.map((t) => (
                    <SelectItem key={t.TripID} value={t.TripID}>
                      {t.TripID} — {t.Client} — {t.Registration}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button onClick={handleGenerate} disabled={!selectedTripId || !canEdit}>
            <Plus className="mr-1 h-4 w-4" />
            Generate
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─── Main Page ──────────────────────────────────────────────────────────────

export default function BillingPage() {
  const navigate = useNavigate();
  const { canEdit } = useAuth();
  const [search, setSearch] = useState('');
  const [detailOpen, setDetailOpen] = useState(false);
  const [generateOpen, setGenerateOpen] = useState(false);
  const [selectedInvoice, setSelectedInvoice] = useState<Invoice | null>(null);
  const [invoices, setInvoices] = useState<Invoice[]>([]);

  const reload = () => { getInvoices().then(setInvoices); };

  useEffect(() => { reload(); }, []);

  const filtered = useMemo(() => {
    let list = [...invoices].sort(
      (a, b) => new Date(b.IssueDateZ).getTime() - new Date(a.IssueDateZ).getTime()
    );
    if (search.trim()) {
      const q = search.toLowerCase();
      list = list.filter(
        (i) =>
          i.InvoiceID.toLowerCase().includes(q) ||
          i.TripID.toLowerCase().includes(q) ||
          i.Status.toLowerCase().includes(q)
      );
    }
    return list;
  }, [invoices, search]);

  const stats = useMemo(() => {
    const totalOutstanding = invoices
      .filter((i) => i.Status === 'Sent' || i.Status === 'Viewed' || i.Status === 'Overdue')
      .reduce((sum, i) => sum + i.Total, 0);
    const totalPaid = invoices.filter((i) => i.Status === 'Paid').reduce((sum, i) => sum + i.Total, 0);
    const totalDraft = invoices.filter((i) => i.Status === 'Draft').reduce((sum, i) => sum + i.Total, 0);
    const overdueCount = invoices.filter((i) => i.Status === 'Overdue').length;
    return { totalOutstanding, totalPaid, totalDraft, overdueCount };
  }, [invoices]);

  const openDetail = (invoice: Invoice) => {
    setSelectedInvoice(invoice);
    setDetailOpen(true);
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <Button variant="outline" size="sm" onClick={() => navigate('/admin')}>
          <ArrowLeft className="mr-1 h-4 w-4" />
          Back
        </Button>
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Billing</h1>
          <p className="text-sm text-muted-foreground">Invoices, quotes, and payment tracking</p>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-4 gap-4">
        <Card>
          <CardContent className="p-4">
            <div className="text-2xl font-bold">{stats.totalOutstanding.toFixed(0)} USD</div>
            <div className="text-xs text-muted-foreground">Outstanding</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="text-2xl font-bold text-emerald-600">{stats.totalPaid.toFixed(0)} USD</div>
            <div className="text-xs text-muted-foreground">Paid</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="text-2xl font-bold text-slate-600">{stats.totalDraft.toFixed(0)} USD</div>
            <div className="text-xs text-muted-foreground">Draft</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="text-2xl font-bold text-red-600">{stats.overdueCount}</div>
            <div className="text-xs text-muted-foreground">Overdue</div>
          </CardContent>
        </Card>
      </div>

      {/* Actions */}
      <div className="flex items-center justify-between">
        <Input
          placeholder="Search invoices..."
          className="w-80"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        <Button onClick={() => canEdit && setGenerateOpen(true)} disabled={!canEdit}>
          <Plus className="mr-1 h-4 w-4" />
          Generate Invoice
        </Button>
      </div>

      {/* Invoice List */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">All Invoices ({filtered.length})</CardTitle>
        </CardHeader>
        <CardContent>
          {filtered.length === 0 ? (
            <div className="text-center text-muted-foreground py-8">No invoices yet.</div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Invoice ID</TableHead>
                  <TableHead>Trip</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Issued</TableHead>
                  <TableHead className="text-right">Total</TableHead>
                  <TableHead></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.map((inv) => (
                  <TableRow
                    key={inv.InvoiceID}
                    className="cursor-pointer hover:bg-accent/30"
                    onClick={() => openDetail(inv)}
                  >
                    <TableCell className="font-mono text-sm">{inv.InvoiceID}</TableCell>
                    <TableCell className="text-sm">{inv.TripID}</TableCell>
                    <TableCell>
                      <Badge className={`text-xs ${STATUS_COLORS[inv.Status]}`}>
                        {STATUS_ICONS[inv.Status]}
                        <span className="ml-1">{inv.Status}</span>
                      </Badge>
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">{formatDate(inv.IssueDateZ)}</TableCell>
                    <TableCell className="text-right font-medium">{inv.Total.toFixed(2)} {inv.Currency}</TableCell>
                    <TableCell>
                      <ChevronRight className="h-4 w-4 text-muted-foreground" />
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* Dialogs */}
      <InvoiceDetailDialog
        invoice={selectedInvoice}
        open={detailOpen}
        onClose={() => setDetailOpen(false)}
        onSaved={reload}
      />
      <GenerateDialog open={generateOpen} onClose={() => setGenerateOpen(false)} onSaved={reload} />
    </div>
  );
}
