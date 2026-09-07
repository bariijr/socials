import { useState, useMemo, useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router';
import { getTripsPaginated, getTripSheet, refProviders as providers, getAircraft, getProvider, getCountry, getCallSign, formatZ, formatDate, urgencyColor, saveService, saveLeg, computeCountriesOverflown, generateOverflightServices, generateArrivalServices } from '@/lib/dataStore';
import type { TripSheet } from '@/lib/dataStore';
import type { Trip, Leg, Service, ServiceResponsibility } from '@/data/types';

// Not a state machine (unlike Status) -- freely reclassifiable at any time.
const SERVICE_RESPONSIBILITIES: ServiceResponsibility[] = ['VIQ Arrangement', 'Client Own', 'Operator Own', 'Other'];

type PagedTrip = Trip & { Legs: Leg[]; Counts: { Stops: number; Services: number; Comms: number } };
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { StatusBadge } from '@/components/StatusBadge';
import { } from '@/components/ui/separator';
import { MasterDetailShell } from '@/components/ui/master-detail-shell';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue
} from '@/components/ui/select';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter
} from '@/components/ui/dialog';
import {
  Accordion, AccordionContent, AccordionItem, AccordionTrigger
} from '@/components/ui/accordion';
import {
  Search, Plane, Users, Clock, MapPin,
  Plus, Edit3, CheckCircle2, AlertTriangle,
  FileText, ChevronRight, Send, XCircle, HelpCircle, Inbox
} from 'lucide-react';
import { useAuth } from '@/lib/authContext';

// ─── Helpers ────────────────────────────────────────────────────────────────

const PAGE_SIZE = 40;


function serviceIcon(type: string) {
  switch (type) {
    case 'Permit': return <FileText className="h-4 w-4" />;
    case 'Overflight': return <Plane className="h-4 w-4" />;
    case 'GroundHandling': return <MapPin className="h-4 w-4" />;
    case 'Fuel': return <CheckCircle2 className="h-4 w-4" />;
    case 'Catering': return <Users className="h-4 w-4" />;
    case 'CrewTransport': return <ChevronRight className="h-4 w-4" />;
    default: return <HelpCircle className="h-4 w-4" />;
  }
}

function statusIcon(status: string) {
  switch (status) {
    case 'Confirmed': return <CheckCircle2 className="h-4 w-4 text-emerald-600" />;
    case 'Requested': return <Clock className="h-4 w-4 text-blue-600" />;
    case 'Chasing': return <AlertTriangle className="h-4 w-4 text-amber-600" />;
    case 'Not Started': return <HelpCircle className="h-4 w-4 text-slate-400" />;
    case 'Cancelled': return <XCircle className="h-4 w-4 text-gray-400" />;
    default: return <HelpCircle className="h-4 w-4 text-slate-400" />;
  }
}

// ─── Service Editor Dialog ──────────────────────────────────────────────────

function ServiceEditorDialog({
  open, onClose, service, onSave
}: {
  open: boolean;
  onClose: () => void;
  service: Service | null;
  onSave: (svc: Service) => void;
}) {
  if (!service) return null;
  const { canEdit } = useAuth();
  const [status, setStatus] = useState(service.Status);
  const [responsibility, setResponsibility] = useState(service.Responsibility);
  const [refNumber, setRefNumber] = useState(service.RefNumber || '');
  const [notes, setNotes] = useState(service.Notes || '');
  const [confirmedBy, setConfirmedBy] = useState(service.ConfirmedBy || '');
  const [confirmedAt, setConfirmedAt] = useState(service.ConfirmedAtZ || '');
  const [validity, setValidity] = useState(service.ValidityZ || '');
  const [sendToCaptain, setSendToCaptain] = useState(service.SentToCaptain || false);
  const [attachments, setAttachments] = useState<string[]>(service.Attachments || []);
  const [newAttachment, setNewAttachment] = useState('');

  const handleSave = () => {
    if (!canEdit) return;
    const updated: Service = {
      ...service,
      Status: status,
      Responsibility: responsibility,
      RefNumber: refNumber,
      Notes: notes,
      ConfirmedBy: confirmedBy || undefined,
      ConfirmedAtZ: confirmedAt || undefined,
      ValidityZ: validity || undefined,
      SentToCaptain: sendToCaptain,
      Attachments: attachments.length > 0 ? attachments : undefined,
    };
    onSave(updated);
    onClose();
  };

  const addAttachment = () => {
    if (newAttachment.trim()) {
      setAttachments([...attachments, newAttachment.trim()]);
      setNewAttachment('');
    }
  };

  const removeAttachment = (idx: number) => {
    setAttachments(attachments.filter((_, i) => i !== idx));
  };

  const isPermitLike = service.ServiceType === 'Permit' || service.ServiceType === 'Overflight';

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-xl max-h-[90vh] overflow-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            {serviceIcon(service.ServiceType)}
            Edit Service — {service.ServiceType}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4 py-2">
          <div className="rounded-md bg-slate-50 p-3 text-xs font-mono text-slate-600">
            {service.SVCID} | Scope: {service.ScopeType} | Trip: {service.TripID}
          </div>

          <div>
            <Label>Status</Label>
            <Select value={status} onValueChange={(v) => setStatus(v as Service['Status'])}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {/* Restricted to what the server's transition graph actually
                    allows from the last-saved status -- same [current,
                    ...allowedTransitions] pattern as TransitionMenu, just
                    rendered through this dialog's existing shadcn Select
                    for visual consistency with its other fields. */}
                {[service.Status, ...(service.AllowedTransitions ?? []).filter((s) => s !== service.Status)].map((s) => (
                  <SelectItem key={s} value={s}>{s}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div>
            <Label>Responsibility</Label>
            <Select value={responsibility} onValueChange={(v) => setResponsibility(v as ServiceResponsibility)}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {SERVICE_RESPONSIBILITIES.map((r) => <SelectItem key={r} value={r}>{r}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>

          <div>
            <Label>Reference / Permit Number</Label>
            <Input
              value={refNumber}
              onChange={(e) => setRefNumber(e.target.value.toUpperCase())}
              placeholder="e.g. GACA-2026-07123"
              className="uppercase"
            />
          </div>

          <div>
            <Label>Notes</Label>
            <textarea
              className="w-full rounded-md border bg-background px-3 py-2 text-sm"
              rows={3}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
            />
          </div>

          {/* Permit confirmation fields */}
          {isPermitLike && (
            <div className="rounded-lg border border-amber-200 bg-amber-50/50 p-4 space-y-4">
              <div className="text-sm font-semibold text-amber-800 flex items-center gap-2">
                <CheckCircle2 className="h-4 w-4" />
                Confirmation Details
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label className="text-xs">Confirmed By</Label>
                  <Input
                    value={confirmedBy}
                    onChange={(e) => setConfirmedBy(e.target.value.toUpperCase())}
                    placeholder="e.g. SARAH MITCHELL"
                    className="uppercase"
                  />
                </div>
                <div>
                  <Label className="text-xs">Confirmed At (UTC)</Label>
                  <Input
                    type="datetime-local"
                    value={confirmedAt ? confirmedAt.slice(0, 16) : ''}
                    onChange={(e) => setConfirmedAt(e.target.value ? e.target.value + ':00Z' : '')}
                  />
                </div>
              </div>

              <div>
                <Label className="text-xs">Validity Until (UTC)</Label>
                <Input
                  type="datetime-local"
                  value={validity ? validity.slice(0, 16) : ''}
                  onChange={(e) => setValidity(e.target.value ? e.target.value + ':00Z' : '')}
                />
              </div>

              <div className="flex items-center gap-2">
                <input
                  type="checkbox"
                  id="send-captain"
                  checked={sendToCaptain}
                  onChange={(e) => setSendToCaptain(e.target.checked)}
                  className="h-4 w-4 rounded border-gray-300"
                />
                <Label htmlFor="send-captain" className="text-sm font-medium cursor-pointer">
                  Send confirmation to Captain
                </Label>
              </div>
            </div>
          )}

          {/* Attachments */}
          <div className="rounded-lg border p-4 space-y-3">
            <div className="text-sm font-semibold flex items-center gap-2">
              <FileText className="h-4 w-4" />
              Attachments
            </div>
            {attachments.length > 0 && (
              <div className="space-y-1">
                {attachments.map((att, idx) => (
                  <div key={idx} className="flex items-center justify-between rounded-md bg-slate-50 px-3 py-1.5 text-xs">
                    <span className="font-mono">{att}</span>
                    <Button variant="ghost" size="sm" className="h-6 text-red-600" onClick={() => removeAttachment(idx)}>
                      Remove
                    </Button>
                  </div>
                ))}
              </div>
            )}
            <div className="flex gap-2">
              <Input
                placeholder="Attachment filename (e.g. permit.pdf)"
                value={newAttachment}
                onChange={(e) => setNewAttachment(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && addAttachment()}
              />
              <Button variant="outline" onClick={addAttachment}>
                <Plus className="h-4 w-4" />
              </Button>
            </div>
          </div>

          <div className="flex items-center gap-2 rounded-md bg-emerald-50 p-3 text-xs text-emerald-800">
            <FileText className="h-4 w-4 shrink-0" />
            <span>Changes are saved to localStorage immediately.</span>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button onClick={() => canEdit && handleSave()} disabled={!canEdit}>
            <CheckCircle2 className="mr-2 h-4 w-4" />
            Save Changes
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─── Add Service Dialog ─────────────────────────────────────────────────────

function AddServiceDialog({
  open, onClose, tripId, legId, stopId, onAdd
}: {
  open: boolean;
  onClose: () => void;
  tripId: string;
  legId: string | null;
  stopId: string | null;
  onAdd: (svc: Service) => void;
}) {
  const { canEdit } = useAuth();
  const [serviceType, setServiceType] = useState<Service['ServiceType']>('Permit');
  const [providerId, setProviderId] = useState<string>('');
  const [notes, setNotes] = useState('');
  const [assignedTo, setAssignedTo] = useState('');

  const scopeType: Service['ScopeType'] = stopId ? 'STOP' : 'LEG';
  const scopeId = stopId || legId || '';

  const handleAdd = () => {
    if (!canEdit) return;
    const svc: Service = {
      SVCID: `${tripId}-SVC-${Date.now().toString(36).toUpperCase()}`,
      TripID: tripId,
      ScopeType: scopeType,
      ScopeID: scopeId,
      ServiceType: serviceType,
      ProviderID: providerId || null,
      Status: 'Not Started',
      Version: 1,
      Responsibility: 'VIQ Arrangement',
      RefNumber: '',
      BasedOnETDZ: new Date().toISOString(),
      RequiredByZ: new Date(Date.now() + 48 * 60 * 60 * 1000).toISOString(),
      Urgency: 'OK',
      AssignedTo: assignedTo || 'Unassigned',
      Notes: notes,
    };
    onAdd(svc);
    onClose();
    // Reset
    setServiceType('Permit');
    setProviderId('');
    setNotes('');
    setAssignedTo('');
  };

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Plus className="h-4 w-4" />
            Add Service
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4 py-2">
          <div>
            <Label>Service Type</Label>
            <Select value={serviceType} onValueChange={(v) => setServiceType(v as Service['ServiceType'])}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="Permit">Permit</SelectItem>
                <SelectItem value="Overflight">Overflight</SelectItem>
                <SelectItem value="GroundHandling">Ground Handling</SelectItem>
                <SelectItem value="Fuel">Fuel</SelectItem>
                <SelectItem value="Catering">Catering</SelectItem>
                <SelectItem value="CrewTransport">Crew Transport</SelectItem>
                <SelectItem value="Customs">Customs</SelectItem>
                <SelectItem value="Hotel">Hotel</SelectItem>
                <SelectItem value="Slot">Slot</SelectItem>
                <SelectItem value="PPR">PPR</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div>
            <Label>Provider</Label>
            <Select value={providerId} onValueChange={setProviderId}>
              <SelectTrigger><SelectValue placeholder="Select provider..." /></SelectTrigger>
              <SelectContent>
                <SelectItem value="">None — unassigned</SelectItem>
                {providers.map((p) => (
                  <SelectItem key={p.ProviderID} value={p.ProviderID}>
                    {p.Name} ({p.Scope})
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div>
            <Label>Assigned To</Label>
            <Input
              value={assignedTo}
              onChange={(e) => setAssignedTo(e.target.value.toUpperCase())}
              placeholder="e.g. SARAH MITCHELL"
              className="uppercase"
            />
          </div>

          <div>
            <Label>Notes</Label>
            <textarea
              className="w-full rounded-md border bg-background px-3 py-2 text-sm"
              rows={3}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Special instructions for this service..."
            />
          </div>

          <div className="text-xs text-muted-foreground">
            Scope: <Badge variant="outline">{scopeType}</Badge> | ID: <span className="font-mono">{scopeId}</span>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button onClick={() => canEdit && handleAdd()} disabled={!canEdit}>
            <Plus className="mr-2 h-4 w-4" />
            Add Service
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─── Add Leg Dialog ─────────────────────────────────────────────────────────

function AddLegDialog({
  open, onClose, tripId, nextSeq, onAdd
}: {
  open: boolean;
  onClose: () => void;
  tripId: string;
  nextSeq: number;
  onAdd: (leg: Leg) => void;
}) {
  const { canEdit } = useAuth();
  const [depIcao, setDepIcao] = useState('');
  const [arrIcao, setArrIcao] = useState('');
  const [etd, setEtd] = useState('');
  const [eta, setEta] = useState('');
  const [callSign, setCallSign] = useState('');
  const [paxCount, setPaxCount] = useState(0);
  const [crewCount, setCrewCount] = useState(1);

  const handleAdd = async () => {
    if (!canEdit || !depIcao || !arrIcao || !etd || !eta) return;
    const countries = await computeCountriesOverflown(depIcao.toUpperCase(), arrIcao.toUpperCase());
    const leg: Leg = {
      LegID: `${tripId}-L${nextSeq.toString().padStart(2, '0')}`,
      TripID: tripId,
      Seq: nextSeq,
      DepICAO: depIcao.toUpperCase(),
      ArrICAO: arrIcao.toUpperCase(),
      // Zero conversion: `etd`/`eta` are datetime-local values (no
      // timezone), and every time in this app is already Zulu/UTC — the
      // digits typed ARE the UTC clock time. Appending "Z" directly avoids
      // `new Date(...)` reinterpreting them in the browser's local zone.
      ETDZ: `${etd}:00.000Z`,
      ETAZ: `${eta}:00.000Z`,
      BlockHours: 0,
      PaxCount: paxCount,
      CrewCount: crewCount,
      CountriesOverflown: countries,
      Revision: 1,
      Version: 1,
      CallSign: callSign || undefined,
    };
    onAdd(leg);
    onClose();
    // Reset
    setDepIcao('');
    setArrIcao('');
    setEtd('');
    setEta('');
    setCallSign('');
    setPaxCount(0);
    setCrewCount(1);
  };

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Plus className="h-4 w-4" />
            Add Leg — Seq {nextSeq}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4 py-2">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label>Departure ICAO</Label>
              <Input
                value={depIcao}
                onChange={(e) => setDepIcao(e.target.value.toUpperCase())}
                placeholder="e.g. EGLL"
                maxLength={4}
                style={{ textTransform: 'uppercase' }}
              />
            </div>
            <div>
              <Label>Arrival ICAO</Label>
              <Input
                value={arrIcao}
                onChange={(e) => setArrIcao(e.target.value.toUpperCase())}
                placeholder="e.g. OMDB"
                maxLength={4}
                style={{ textTransform: 'uppercase' }}
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label>ETD (UTC)</Label>
              <Input
                type="datetime-local"
                value={etd}
                onChange={(e) => setEtd(e.target.value)}
              />
            </div>
            <div>
              <Label>ETA (UTC)</Label>
              <Input
                type="datetime-local"
                value={eta}
                onChange={(e) => setEta(e.target.value)}
              />
            </div>
          </div>

          <div>
            <Label>Call Sign (optional)</Label>
            <Input
              value={callSign}
              onChange={(e) => setCallSign(e.target.value.toUpperCase())}
              placeholder="e.g. ACW169"
              style={{ textTransform: 'uppercase' }}
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label>Pax Count</Label>
              <Input
                type="number"
                min={0}
                value={paxCount}
                onChange={(e) => setPaxCount(parseInt(e.target.value) || 0)}
              />
            </div>
            <div>
              <Label>Crew Count</Label>
              <Input
                type="number"
                min={1}
                value={crewCount}
                onChange={(e) => setCrewCount(Math.max(1, parseInt(e.target.value) || 1))}
              />
            </div>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button onClick={() => canEdit && handleAdd()} disabled={!depIcao || !arrIcao || !etd || !eta || !canEdit}>
            <Plus className="mr-2 h-4 w-4" />
            Add Leg
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─── Service Row Component ──────────────────────────────────────────────────

function ServiceRow({ svc, onEdit }: { svc: Service; onEdit: () => void }) {
  const { canEdit } = useAuth();
  const provider = svc.ProviderID ? getProvider(svc.ProviderID) : null;
  const urgency = svc.Urgency;

  return (
    <div className="rounded-lg border p-3 space-y-2 hover:bg-accent/30 transition-colors">
      <div className="flex items-start justify-between">
        <div className="flex items-center gap-2">
          {statusIcon(svc.Status)}
          <span className="font-medium text-sm">{svc.ServiceType}</span>
          <StatusBadge status={svc.Status} entityType="service" className="text-[10px]" />
          {urgency && urgency !== 'OK' && (
            <Badge variant="outline" className={`text-[10px] ${urgencyColor(urgency)}`}>
              {urgency}
            </Badge>
          )}
        </div>
        <div className="flex gap-1">
          <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => canEdit && onEdit()} disabled={!canEdit}>
            <Edit3 className="h-3.5 w-3.5" />
          </Button>
        </div>
      </div>

      {svc.RefNumber && (
        <div className="text-xs font-mono text-muted-foreground">
          Ref: {svc.RefNumber}
        </div>
      )}
      {svc.CountryISO2 && (
        <Badge variant="outline" className="text-[10px] border-blue-300 text-blue-700">
          <MapPin className="h-3 w-3 mr-1" />
          {(getCountry(svc.CountryISO2)?.Name || svc.CountryISO2).toUpperCase()}
        </Badge>
      )}

      {svc.ConfirmedBy && (
        <div className="flex items-center gap-2 text-xs text-emerald-700 bg-emerald-50 rounded px-2 py-1">
          <CheckCircle2 className="h-3 w-3" />
          Confirmed by {svc.ConfirmedBy}
          {svc.ConfirmedAtZ && ` at ${formatZ(svc.ConfirmedAtZ)}`}
          {svc.ValidityZ && ` • Valid until ${formatZ(svc.ValidityZ)}`}
        </div>
      )}

      {svc.SentToCaptain && (
        <Badge variant="outline" className="text-[10px] border-blue-300 text-blue-700">
          <Send className="h-3 w-3 mr-1" />
          Sent to Captain
        </Badge>
      )}

      {svc.Attachments && svc.Attachments.length > 0 && (
        <div className="flex flex-wrap gap-1">
          {svc.Attachments.map((att, idx) => (
            <Badge key={idx} variant="outline" className="text-[10px] font-mono">
              <FileText className="h-3 w-3 mr-1" />
              {att}
            </Badge>
          ))}
        </div>
      )}

      {svc.Notes && (
        <div className="text-xs text-muted-foreground">{svc.Notes}</div>
      )}

      <div className="flex items-center gap-4 text-xs text-muted-foreground">
        {provider && <span>Provider: {provider.Name}</span>}
        <span>Required by: {formatZ(svc.RequiredByZ)}</span>
      </div>

      {svc.SubItems && svc.SubItems.length > 0 && (
        <div className="mt-2 space-y-1 border-l-2 border-slate-200 pl-3">
          {svc.SubItems.map((sub, idx) => (
            <div key={idx} className="flex items-center justify-between text-xs">
              <span className="text-muted-foreground">{sub.label}: {sub.value}</span>
              <Badge variant="outline" className="text-[10px]">{sub.status}</Badge>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Admin Trips Page ───────────────────────────────────────────────────────

export default function AdminTrips() {
  const navigate = useNavigate();
  const { canEdit } = useAuth();
  const [searchParams] = useSearchParams();
  const [search, setSearch] = useState(searchParams.get('trip') || '');
  const [showEnquiriesOnly, setShowEnquiriesOnly] = useState(false);
  const [selectedTripId, setSelectedTripId] = useState<string | null>(searchParams.get('trip'));
  const [selectedLegId, setSelectedLegId] = useState<string | null>(null);
  const [editingService, setEditingService] = useState<Service | null>(null);
  const [editorOpen, setEditorOpen] = useState(false);
  const [addServiceOpen, setAddServiceOpen] = useState(false);
  const [addLegOpen, setAddLegOpen] = useState(false);

  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [total, setTotal] = useState(0);
  const [pageTrips, setPageTrips] = useState<PagedTrip[]>([]);
  const [enquiryCount, setEnquiryCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [listLoading, setListLoading] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);

  // The trip currently open in the right pane gets its own single-trip
  // fetch (GET /trips/:id/sheet, one query) instead of pulling from a
  // full-table fetch — this is what actually lets the left-pane list stay
  // paginated without starving the right pane of legs/stops/services.
  const [tripSheet, setTripSheet] = useState<TripSheet | null>(null);
  const [tripSheetLoading, setTripSheetLoading] = useState(false);

  const reloadList = async () => {
    const res = await getTripsPaginated(page, PAGE_SIZE, search.trim() || undefined, {
      upcomingHours: !search.trim() && !showEnquiriesOnly ? 72 : undefined,
      enquiriesOnly: showEnquiriesOnly,
    });
    setPageTrips(res.data);
    setTotalPages(res.totalPages);
    setTotal(res.total);
  };

  const reloadSelected = async () => {
    if (!selectedTripId) { setTripSheet(null); return; }
    setTripSheetLoading(true);
    const sheet = await getTripSheet(selectedTripId);
    setTripSheet(sheet);
    setTripSheetLoading(false);
  };

  const reload = async () => { await Promise.all([reloadList(), reloadSelected()]); };

  // Initial load only — fetches the list, the enquiry-count badge, and
  // whatever trip was pre-selected via ?trip= in one pass.
  useEffect(() => {
    let cancelled = false;
    Promise.all([
      getTripsPaginated(1, PAGE_SIZE, search.trim() || undefined, {
        upcomingHours: !search.trim() ? 72 : undefined,
      }),
      getTripsPaginated(1, 1, undefined, { enquiriesOnly: true }),
    ])
      .then(([res, enq]) => {
        if (cancelled) return;
        setPageTrips(res.data); setTotalPages(res.totalPages); setTotal(res.total);
        setEnquiryCount(enq.total);
        setLoading(false);
      })
      .catch((e) => { if (!cancelled) { setLoadError(e.message); setLoading(false); } });
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Every subsequent page/search/filter change re-fetches just the list,
  // inline (listLoading), never blocking the already-rendered right pane.
  const isInitialListFetch = loading;
  useEffect(() => {
    if (isInitialListFetch) return;
    let cancelled = false;
    setListLoading(true);
    reloadList()
      .then(() => { if (!cancelled) setListLoading(false); })
      .catch((e) => { if (!cancelled) { setLoadError(e.message); setListLoading(false); } });
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [page, search, showEnquiriesOnly]);

  // Reset to page 1 whenever the search/filter mode changes.
  useEffect(() => { setPage(1); }, [search, showEnquiriesOnly]);

  useEffect(() => {
    let cancelled = false;
    if (!selectedTripId) { setTripSheet(null); return; }
    setTripSheetLoading(true);
    getTripSheet(selectedTripId).then((sheet) => {
      if (cancelled) return;
      setTripSheet(sheet);
      setTripSheetLoading(false);
    });
    return () => { cancelled = true; };
  }, [selectedTripId]);

  const filteredTrips = pageTrips;

  const selectedTrip = tripSheet?.trip ?? null;
  const tripLegs = tripSheet?.legs ?? [];
  const tripStops = tripSheet?.stops ?? [];
  const tripServices = tripSheet?.services ?? [];
  const selectedLeg = selectedLegId ? tripLegs.find((l) => l.LegID === selectedLegId) : tripLegs[0];

  const legServices = useMemo(() => {
    if (!selectedLeg) return [];
    return tripServices.filter(
      (s) => s.ScopeType === 'LEG' && s.ScopeID === selectedLeg.LegID
    );
  }, [tripServices, selectedLeg]);

  const stopServices = useMemo(() => {
    if (!selectedLeg) return [];
    const stop = tripStops.find((s) => s.ICAO === selectedLeg.ArrICAO);
    if (!stop) return [];
    return tripServices.filter(
      (s) => s.ScopeType === 'STOP' && s.ScopeID === stop.StopID
    );
  }, [tripServices, selectedLeg, tripStops]);

  if (loading) return <p className="p-4 text-sm text-muted-foreground">Loading…</p>;
  if (loadError) return <p className="p-4 text-sm text-destructive">Error: {loadError}</p>;

  const handleSaveService = async (updated: Service) => {
    await saveService(updated);
    await reload();
    setEditorOpen(false);
    setEditingService(null);
  };

  const handleAddService = async (svc: Service) => {
    await saveService(svc);
    await reload();
    setAddServiceOpen(false);
  };

  const handleRecalculateRoute = async (leg: Leg) => {
    if (!canEdit) return;
    const countries = await computeCountriesOverflown(leg.DepICAO, leg.ArrICAO);
    const updated = { ...leg, CountriesOverflown: countries };
    await saveLeg(updated);
    await generateOverflightServices(updated.LegID);
    await generateArrivalServices(updated.LegID);
    await reload();
  };

  const handleAddDepartureGroundHandling = async (leg: Leg) => {
    if (!canEdit) return;
    await generateArrivalServices(leg.LegID, { departureGroundHandling: true });
    await reload();
  };

  const handleAddLeg = async (leg: Leg) => {
    await saveLeg(leg);
    await generateOverflightServices(leg.LegID);
    await generateArrivalServices(leg.LegID);
    await reload();
    setAddLegOpen(false);
    // Auto-select the new leg
    setSelectedLegId(leg.LegID);
  };

  const openEditor = (svc: Service) => {
    setEditingService(svc);
    setEditorOpen(true);
  };

  const getStopForLeg = (leg: Leg | undefined) => {
    if (!leg) return null;
    return tripStops.find((s) => s.ICAO === leg.ArrICAO) || null;
  };

  return (
    <>
      <MasterDetailShell
        heightClassName="h-[calc(100vh-6rem)]"
        listWidthClassName="md:w-64 lg:w-80"
        detailOpen={!!selectedTripId}
        onDetailOpenChange={(open) => { if (!open) setSelectedTripId(null); }}
        detailTitle={selectedTrip?.TripID}
        list={
          <div className="flex h-full flex-col gap-3 overflow-hidden">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-xl font-bold tracking-tight">Manage Trips</h1>
            <p className="text-xs text-muted-foreground">Select a trip to manage legs & services</p>
          </div>
          <Button size="sm" onClick={() => canEdit && navigate('/admin/trips/new')} disabled={!canEdit}>
            <Plus className="mr-1 h-4 w-4" />
            New Trip
          </Button>
        </div>

        <div className="relative">
          <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="SEARCH TRIP, REG, ROUTE..."
            className="pl-9 uppercase"
            value={search}
            onChange={(e) => setSearch(e.target.value.toUpperCase())}
          />
        </div>

        <button
          type="button"
          onClick={() => setShowEnquiriesOnly((v) => !v)}
          className={`flex w-fit items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-medium transition-colors ${
            showEnquiriesOnly
              ? 'border-primary bg-primary/10 text-primary'
              : 'text-muted-foreground hover:bg-accent hover:text-accent-foreground'
          }`}
        >
          <Inbox className="h-3.5 w-3.5" />
          New Enquiries ({enquiryCount})
        </button>

        {showEnquiriesOnly ? (
          <Badge variant="outline" className="w-fit text-xs">
            Showing unreviewed web enquiries only
          </Badge>
        ) : !search.trim() && (
          <Badge variant="outline" className="w-fit text-xs">
            Showing next 72hrs — type to search all
          </Badge>
        )}

        <div className="flex-1 space-y-2 overflow-auto pr-1">
          {listLoading && <p className="text-xs text-muted-foreground">Loading…</p>}
          {filteredTrips.map((trip) => {
            const tls = trip.Legs;
            const first = tls[0];
            const last = tls[tls.length - 1];
            const isActive = selectedTripId === trip.TripID;
            const sameClientOperator = trip.Operator && trip.Operator.trim().toLowerCase() === trip.Client.trim().toLowerCase();

            return (
              <Card
                key={trip.TripID}
                className={`cursor-pointer transition-colors ${
                  isActive ? 'border-primary bg-primary/5' : 'hover:bg-accent/50'
                }`}
                onClick={() => {
                  setSelectedTripId(trip.TripID);
                  setSelectedLegId(trip.Legs[0]?.LegID || null);
                }}
              >
                <CardContent className="p-3 space-y-1">
                  <div className="flex items-start justify-between gap-2">
                    <div className="text-sm font-bold">{trip.TripID} <span className="font-normal text-muted-foreground">|</span> {trip.Registration}</div>
                    <StatusBadge status={trip.Status} entityType="trip" className="text-[9px] px-1.5 py-0 h-4 shrink-0" />
                  </div>
                  <div className="text-xs text-muted-foreground truncate">
                    {trip.Client}{!sameClientOperator && trip.Operator ? ` | ${trip.Operator}` : ''}
                  </div>
                  {first && last && (
                    <div className="text-xs text-muted-foreground">
                      {formatDate(first.ETDZ)} – {formatDate(last.ETAZ)}
                    </div>
                  )}
                  <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[10px] text-muted-foreground">
                    <span>{tls.length} Leg{tls.length === 1 ? '' : 's'}, {trip.Counts.Stops} Stop{trip.Counts.Stops === 1 ? '' : 's'}</span>
                    <span>{trip.Counts.Services} services</span>
                    <span>{trip.Counts.Comms} comms</span>
                  </div>
                  <div className="text-[10px] text-muted-foreground">
                    Owner: {trip.Owner || '—'}{first && <span> · Origin: {first.DepICAO}</span>}
                  </div>
                </CardContent>
              </Card>
            );
          })}
          {!listLoading && filteredTrips.length === 0 && (
            <div className="text-center text-sm text-muted-foreground py-8">
              {search.trim()
                ? 'No trips match your search'
                : `0 of ${total} trips have a leg departing in the next 72h — type to search all trips`}
            </div>
          )}
        </div>

        {totalPages > 1 && (
          <div className="flex items-center justify-between text-xs text-muted-foreground">
            <span>Page {page} of {totalPages} ({total} total)</span>
            <div className="flex gap-1">
              <Button variant="outline" size="sm" className="h-6 px-2 text-[10px]" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>Prev</Button>
              <Button variant="outline" size="sm" className="h-6 px-2 text-[10px]" disabled={page >= totalPages} onClick={() => setPage((p) => p + 1)}>Next</Button>
            </div>
          </div>
        )}
          </div>
        }
        detail={
          <div className="flex h-full flex-col gap-4 overflow-hidden">
        {tripSheetLoading ? (
          <div className="flex h-full items-center justify-center text-muted-foreground">
            Loading trip…
          </div>
        ) : !selectedTrip ? (
          <div className="flex h-full items-center justify-center text-muted-foreground">
            Select a trip from the left to manage legs & services
          </div>
        ) : (
          <>
            {/* Trip Placard */}
            <Card>
              <CardContent className="p-4">
                <div className="flex items-start justify-between">
                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                      <h2 className="text-lg font-bold">{selectedTrip.TripID}</h2>
                      <StatusBadge status={selectedTrip.Status} entityType="trip" />
                      {selectedTrip.SupportRef && (
                        <Badge variant="outline" className="font-mono text-xs">
                          REF:{selectedTrip.SupportRef}
                        </Badge>
                      )}
                    </div>
                    <div className="text-sm text-muted-foreground">
                      {selectedTrip.Registration} — {getAircraft(selectedTrip.Registration)?.ICAOType} — {selectedTrip.Client}
                    </div>
                    <div className="text-xs text-muted-foreground">
                      Owner: {selectedTrip.Owner}
                    </div>
                  </div>
                  <div className="flex gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => navigate(`/trips/${selectedTrip.TripID}`)}
                    >
                      <FileText className="mr-1 h-3.5 w-3.5" />
                      Trip Sheet
                    </Button>
                    <Button variant="outline" size="sm" onClick={() => canEdit && setAddLegOpen(true)} disabled={!canEdit}>
                      <Plus className="mr-1 h-3.5 w-3.5" />
                      Add Leg
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Leg Selector + Leg Detail */}
            {tripLegs.length > 0 && (
              <Card>
                <CardContent className="p-4 space-y-4">
                  <div className="flex items-center gap-4">
                    <div className="flex-1">
                      <Label className="text-xs text-muted-foreground">Select Leg</Label>
                      <Select
                        value={selectedLeg?.LegID || ''}
                        onValueChange={(v) => setSelectedLegId(v)}
                      >
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {tripLegs.map((l) => (
                            <SelectItem key={l.LegID} value={l.LegID}>
                              Leg {l.Seq}: {l.DepICAO} → {l.ArrICAO}
                              {` (CS: ${getCallSign(l, selectedTrip?.Registration || '')})`}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  </div>

                  {selectedLeg && (
                    <div className="grid grid-cols-2 gap-4 text-sm">
                      <div className="space-y-2">
                        <div className="flex items-center gap-2">
                          <MapPin className="h-4 w-4 text-muted-foreground" />
                          <span className="font-medium">{selectedLeg.DepICAO}</span>
                          <ChevronRight className="h-3 w-3 text-muted-foreground" />
                          <span className="font-medium">{selectedLeg.ArrICAO}</span>
                        </div>
                        <div className="flex items-center gap-2 text-muted-foreground">
                          <Clock className="h-4 w-4" />
                          <span>ETD: {formatZ(selectedLeg.ETDZ)}</span>
                        </div>
                        <div className="flex items-center gap-2 text-muted-foreground">
                          <Clock className="h-4 w-4" />
                          <span>ETA: {formatZ(selectedLeg.ETAZ)}</span>
                        </div>
                        <div className="text-xs font-mono text-muted-foreground">
                          Call Sign: {getCallSign(selectedLeg, selectedTrip?.Registration || '')}
                        </div>
                      </div>
                      <div className="space-y-2">
                        <div className="flex items-center gap-2 text-muted-foreground">
                          <Users className="h-4 w-4" />
                          <span>Pax: {selectedLeg.PaxCount} | Crew: {selectedLeg.CrewCount}</span>
                        </div>
                        <div className="text-xs text-muted-foreground">
                          Block: {selectedLeg.BlockHours}h
                        </div>
                        <div className="flex items-center gap-2 text-xs text-muted-foreground">
                          <span>
                            Overfly: {selectedLeg.CountriesOverflown.length > 0
                              ? selectedLeg.CountriesOverflown.map((iso2) => getCountry(iso2)?.Name || iso2).join(', ')
                              : 'None'}
                          </span>
                          <Button
                            size="sm" variant="ghost" className="h-5 px-1.5 text-[10px]"
                            onClick={() => canEdit && handleRecalculateRoute(selectedLeg)}
                            disabled={!canEdit}
                          >
                            Recalculate Route
                          </Button>
                          <Button
                            size="sm" variant="ghost" className="h-5 px-1.5 text-[10px]"
                            onClick={() => canEdit && handleAddDepartureGroundHandling(selectedLeg)}
                            disabled={!canEdit}
                          >
                            + Ground Handling at Departure (on request)
                          </Button>
                        </div>
                      </div>
                    </div>
                  )}
                </CardContent>
              </Card>
            )}

            {/* Services Accordion */}
            <Card className="flex-1 overflow-hidden flex flex-col">
              <CardHeader className="pb-2">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-base font-semibold">Leg Services</CardTitle>
                  <Button size="sm" variant="outline" onClick={() => canEdit && setAddServiceOpen(true)} disabled={!canEdit}>
                    <Plus className="mr-1 h-3.5 w-3.5" />
                    Add Service
                  </Button>
                </div>
              </CardHeader>
              <CardContent className="flex-1 overflow-auto">
                {selectedLeg ? (
                  <Accordion type="multiple" className="w-full">
                    {/* Leg-scoped services */}
                    {legServices.length > 0 && (
                      <AccordionItem value="leg-services">
                        <AccordionTrigger className="text-sm font-medium">
                          <span className="flex items-center gap-2">
                            <Plane className="h-4 w-4" />
                            En-Route Services ({legServices.length})
                          </span>
                        </AccordionTrigger>
                        <AccordionContent>
                          <div className="space-y-2">
                            {legServices.map((svc) => (
                              <ServiceRow
                                key={svc.SVCID}
                                svc={svc}
                                onEdit={() => openEditor(svc)}
                              />
                            ))}
                          </div>
                        </AccordionContent>
                      </AccordionItem>
                    )}

                    {/* Stop-scoped services */}
                    {stopServices.length > 0 && (
                      <AccordionItem value="stop-services">
                        <AccordionTrigger className="text-sm font-medium">
                          <span className="flex items-center gap-2">
                            <MapPin className="h-4 w-4" />
                            Ground Services ({stopServices.length})
                          </span>
                        </AccordionTrigger>
                        <AccordionContent>
                          <div className="space-y-2">
                            {stopServices.map((svc) => (
                              <ServiceRow
                                key={svc.SVCID}
                                svc={svc}
                                onEdit={() => openEditor(svc)}
                              />
                            ))}
                          </div>
                        </AccordionContent>
                      </AccordionItem>
                    )}

                    {legServices.length === 0 && stopServices.length === 0 && (
                      <div className="text-center text-sm text-muted-foreground py-8">
                        No services for this leg. Click "Add Service" to create one.
                      </div>
                    )}
                  </Accordion>
                ) : (
                  <div className="text-center text-sm text-muted-foreground py-8">
                    Select a leg to view services
                  </div>
                )}
              </CardContent>
            </Card>
          </>
        )}
          </div>
        }
      />

      {/* Dialogs — unchanged, moved outside MasterDetailShell since they're
          modals independent of the responsive shell */}
      <ServiceEditorDialog
        open={editorOpen}
        onClose={() => { setEditorOpen(false); setEditingService(null); }}
        service={editingService}
        onSave={handleSaveService}
      />

      <AddServiceDialog
        open={addServiceOpen}
        onClose={() => setAddServiceOpen(false)}
        tripId={selectedTripId || ''}
        legId={selectedLeg?.LegID || null}
        stopId={getStopForLeg(selectedLeg)?.StopID || null}
        onAdd={handleAddService}
      />

      <AddLegDialog
        open={addLegOpen}
        onClose={() => setAddLegOpen(false)}
        tripId={selectedTripId || ''}
        nextSeq={tripLegs.length + 1}
        onAdd={handleAddLeg}
      />
    </>
  );
}
