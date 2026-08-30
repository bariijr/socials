import { useParams, Link } from 'react-router';
import { useState, useEffect, useMemo } from 'react';
import {
  getPerson, getPersonRatings, savePerson, savePersonRating, deletePersonRating,
  unassignPersonFromLeg, assignPersonToLeg, assignPersonToAllLegs, getTrips, getLegsForTrip,
  getDocsForPerson, uploadDoc, downloadDocFile, deleteDoc, runDocOcr, formatZ,
  getPersonAssignments, getPreferredContact, setPreferredChannelValue,
} from '@/lib/dataStore';
import type { PersonAssignment } from '@/lib/dataStore';
import type { Person, PersonRating, PersonRole, DocAttachment, Trip, Leg } from '@/data/types';
import { personExpiryStatus } from '@/lib/expiry';
import { ExpiryBadge } from '@/components/ExpiryBadge';
import { DocVerifyDialog } from '@/components/DocVerifyDialog';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { ArrowLeft, User, ShieldCheck, Award, FileText, Plane, Plus, Edit3, Save } from 'lucide-react';
import { useAuth } from '@/lib/authContext';

const PERSON_ROLES: PersonRole[] = [
  'PIC', 'SIC', 'FA', 'Mechanic', 'Engineer', 'Medical Staff', 'Other', 'Pax', 'VIP', 'Principal',
];
const DOC_TYPES = [
  'Registration Certificate', 'Airworthiness Certificate', 'Insurance Certificate',
  'Permit Application Form', 'AOC', 'Noise Certificate', 'PAX List',
  'Crew Licence', 'Medical Certificate', 'Other',
];

// Every expiry-bearing field here is a plain YYYY-MM-DD date (no time
// component) — a pure string slice for display and, on save, an unmodified
// string round-trip. No `new Date(...)` construction touches it client-side,
// so there is no timezone-shift risk (see ARCHITECTURE.md's zero-conversion
// invariant note, which covers datetime-local fields; date-only fields were
// never subject to that bug since JS parses date-only ISO strings as UTC).
function dateInput(value?: string): string {
  return value ? value.slice(0, 10) : '';
}

// ─── Biodata ────────────────────────────────────────────────────────────────

function BiodataCard({ person, onSaved }: { person: Person; onSaved: () => Promise<void> | void }) {
  const { canEdit } = useAuth();
  const [draft, setDraft] = useState(person);
  const [editing, setEditing] = useState(false);

  useEffect(() => { if (!editing) setDraft(person); }, [person, editing]);

  const save = async () => {
    await savePerson(draft);
    setEditing(false);
    await onSaved();
  };

  const field = (label: string, key: keyof Person, type = 'text') => (
    <label className="text-xs font-medium text-muted-foreground">
      {label}
      <input
        className="mt-1 h-9 w-full rounded-md border bg-background px-2 text-sm text-foreground"
        type={type}
        value={type === 'date' ? dateInput(draft[key] as string | undefined) : ((draft[key] as string | undefined) || '')}
        disabled={!editing}
        onChange={(event) => setDraft({ ...draft, [key]: event.target.value })}
      />
    </label>
  );

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0">
        <div>
          <CardTitle className="text-base font-semibold flex items-center gap-2"><User className="h-4 w-4" /> BIODATA</CardTitle>
          <p className="mt-1 text-xs text-muted-foreground">Identity, contact and passport details</p>
        </div>
        <Button size="sm" variant={editing ? 'default' : 'outline'} disabled={!canEdit} onClick={() => canEdit && (editing ? save() : setEditing(true))}>
          {editing ? <Save className="h-4 w-4" /> : <Edit3 className="h-4 w-4" />}
          {editing ? 'SAVE' : 'EDIT'}
        </Button>
      </CardHeader>
      <CardContent>
        <div className="grid gap-3 md:grid-cols-3 lg:grid-cols-4">
          {field('NAME', 'Name')}
          <label className="text-xs font-medium text-muted-foreground">
            DEFAULT ROLE
            <select
              className="mt-1 h-9 w-full rounded-md border bg-background px-2 text-sm text-foreground"
              disabled={!editing}
              value={draft.DefaultRole || ''}
              onChange={(event) => setDraft({ ...draft, DefaultRole: event.target.value as PersonRole })}
            >
              <option value="">—</option>
              {PERSON_ROLES.map((r) => <option key={r} value={r}>{r}</option>)}
            </select>
          </label>
          <label className="text-xs font-medium text-muted-foreground">
            PHONE
            <input
              className="mt-1 h-9 w-full rounded-md border bg-background px-2 text-sm text-foreground"
              type="text"
              value={getPreferredContact(draft.Channels, 'Phone') || ''}
              disabled={!editing}
              onChange={(event) => setDraft({ ...draft, Channels: setPreferredChannelValue(draft.Channels, 'Phone', event.target.value) })}
            />
          </label>
          <label className="text-xs font-medium text-muted-foreground">
            EMAIL
            <input
              className="mt-1 h-9 w-full rounded-md border bg-background px-2 text-sm text-foreground"
              type="text"
              value={getPreferredContact(draft.Channels, 'Email') || ''}
              disabled={!editing}
              onChange={(event) => setDraft({ ...draft, Channels: setPreferredChannelValue(draft.Channels, 'Email', event.target.value) })}
            />
          </label>
          {field('LICENCE NUMBER', 'LicenceNumber')}
          {field('PASSPORT NUMBER', 'PassportNumber')}
          {field('PASSPORT NATIONALITY', 'PassportNationality')}
          {field('PASSPORT ISSUING COUNTRY', 'PassportIssuingCountry')}
          {field('PASSPORT SEX', 'PassportSex')}
          {field('PASSPORT DOB', 'PassportDateOfBirth', 'date')}
          {field('PASSPORT EXPIRY', 'PassportExpiryDate', 'date')}
        </div>
        {!editing && person.PassportExpiryDate && (
          <div className="mt-3"><ExpiryBadge date={person.PassportExpiryDate} label="PASSPORT" /></div>
        )}
      </CardContent>
    </Card>
  );
}

// ─── Medical ────────────────────────────────────────────────────────────────

function MedicalCard({ person, onSaved }: { person: Person; onSaved: () => Promise<void> | void }) {
  const { canEdit } = useAuth();
  const [draft, setDraft] = useState(person);
  const [editing, setEditing] = useState(false);

  useEffect(() => { if (!editing) setDraft(person); }, [person, editing]);

  const save = async () => {
    await savePerson(draft);
    setEditing(false);
    await onSaved();
  };

  const field = (label: string, key: keyof Person, type = 'text') => (
    <label className="text-xs font-medium text-muted-foreground">
      {label}
      <input
        className="mt-1 h-9 w-full rounded-md border bg-background px-2 text-sm text-foreground"
        type={type}
        value={type === 'date' ? dateInput(draft[key] as string | undefined) : ((draft[key] as string | undefined) || '')}
        disabled={!editing}
        onChange={(event) => setDraft({ ...draft, [key]: event.target.value })}
      />
    </label>
  );

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0">
        <CardTitle className="text-base font-semibold flex items-center gap-2"><ShieldCheck className="h-4 w-4" /> MEDICAL</CardTitle>
        <Button size="sm" variant={editing ? 'default' : 'outline'} disabled={!canEdit} onClick={() => canEdit && (editing ? save() : setEditing(true))}>
          {editing ? <Save className="h-4 w-4" /> : <Edit3 className="h-4 w-4" />}
          {editing ? 'SAVE' : 'EDIT'}
        </Button>
      </CardHeader>
      <CardContent>
        <div className="grid gap-3 md:grid-cols-3 lg:grid-cols-4">
          {field('CLASS', 'MedicalClass')}
          {field('EXAMINER', 'MedicalExaminer')}
          {field('VALID UNTIL', 'MedicalValidUntil', 'date')}
        </div>
        {!editing && person.MedicalValidUntil && (
          <div className="mt-3"><ExpiryBadge date={person.MedicalValidUntil} label="MEDICAL" /></div>
        )}
      </CardContent>
    </Card>
  );
}

// ─── Ratings ────────────────────────────────────────────────────────────────

function RatingDialog({ personId, rating, open, onClose, onSaved }: {
  personId: string; rating: PersonRating | null; open: boolean; onClose: () => void; onSaved: () => Promise<void> | void;
}) {
  const [ratingType, setRatingType] = useState(rating?.RatingType || '');
  const [issuingAuthority, setIssuingAuthority] = useState(rating?.IssuingAuthority || '');
  const [issueDate, setIssueDate] = useState(dateInput(rating?.IssueDate));
  const [expiryDate, setExpiryDate] = useState(dateInput(rating?.ExpiryDate));
  const [notes, setNotes] = useState(rating?.Notes || '');
  const [saving, setSaving] = useState(false);

  const handleSave = async () => {
    if (!ratingType.trim()) return;
    setSaving(true);
    try {
      await savePersonRating({
        ID: rating?.ID,
        PersonID: personId,
        RatingType: ratingType.trim(),
        IssuingAuthority: issuingAuthority.trim() || undefined,
        IssueDate: issueDate || undefined,
        ExpiryDate: expiryDate || undefined,
        Notes: notes.trim() || undefined,
      });
      await onSaved();
      onClose();
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader><DialogTitle>{rating ? 'Edit Rating' : 'Add Rating'}</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1">
            <Label>Rating Type</Label>
            <Input value={ratingType} onChange={(e) => setRatingType(e.target.value)} />
          </div>
          <div className="space-y-1">
            <Label>Issuing Authority</Label>
            <Input value={issuingAuthority} onChange={(e) => setIssuingAuthority(e.target.value)} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label>Issue Date</Label>
              <Input type="date" value={issueDate} onChange={(e) => setIssueDate(e.target.value)} />
            </div>
            <div className="space-y-1">
              <Label>Expiry Date</Label>
              <Input type="date" value={expiryDate} onChange={(e) => setExpiryDate(e.target.value)} />
            </div>
          </div>
          <div className="space-y-1">
            <Label>Notes</Label>
            <Input value={notes} onChange={(e) => setNotes(e.target.value)} />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button onClick={handleSave} disabled={!ratingType.trim() || saving}>{saving ? 'Saving…' : 'Save'}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function RatingsCard({ personId, ratings, onChanged }: {
  personId: string; ratings: PersonRating[]; onChanged: () => Promise<void> | void;
}) {
  const { canEdit } = useAuth();
  const [dialogItem, setDialogItem] = useState<PersonRating | null | 'new'>(null);

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0">
        <CardTitle className="text-base font-semibold flex items-center gap-2"><Award className="h-4 w-4" /> RATINGS</CardTitle>
        <Button size="sm" disabled={!canEdit} onClick={() => canEdit && setDialogItem('new')}><Plus className="h-4 w-4" /> ADD RATING</Button>
      </CardHeader>
      <CardContent className="p-0">
        {ratings.length === 0 ? (
          <div className="p-4 text-center text-sm text-muted-foreground">NO RATINGS ON FILE</div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>TYPE</TableHead>
                <TableHead>AUTHORITY</TableHead>
                <TableHead>ISSUED</TableHead>
                <TableHead>EXPIRES</TableHead>
                <TableHead>NOTES</TableHead>
                <TableHead></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {ratings.map((r) => (
                <TableRow key={r.ID}>
                  <TableCell className="font-medium">{r.RatingType?.toUpperCase()}</TableCell>
                  <TableCell className="text-sm text-muted-foreground">{r.IssuingAuthority || '—'}</TableCell>
                  <TableCell className="text-sm">{r.IssueDate ? r.IssueDate.slice(0, 10) : '—'}</TableCell>
                  <TableCell className="text-sm">
                    <div className="flex items-center gap-2">
                      {r.ExpiryDate ? r.ExpiryDate.slice(0, 10) : '—'}
                      <ExpiryBadge date={r.ExpiryDate} />
                    </div>
                  </TableCell>
                  <TableCell className="text-xs text-muted-foreground">{r.Notes || '—'}</TableCell>
                  <TableCell className="flex items-center gap-2">
                    <Button size="sm" variant="outline" disabled={!canEdit} onClick={() => canEdit && setDialogItem(r)}>EDIT</Button>
                    <Button size="sm" variant="outline" disabled={!canEdit} onClick={async () => { if (!canEdit) return; await deletePersonRating(r.ID); await onChanged(); }}>DELETE</Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </CardContent>
      {dialogItem && (
        <RatingDialog
          personId={personId}
          rating={dialogItem === 'new' ? null : dialogItem}
          open={!!dialogItem}
          onClose={() => setDialogItem(null)}
          onSaved={onChanged}
        />
      )}
    </Card>
  );
}

// ─── Assigned Trips ─────────────────────────────────────────────────────────

function AssignTripDialog({ personId, open, onClose, onSaved, existingAssignments }: {
  personId: string; open: boolean; onClose: () => void; onSaved: () => Promise<void> | void;
  existingAssignments: PersonAssignment[];
}) {
  const [trips, setTrips] = useState<Trip[]>([]);
  const [tripId, setTripId] = useState('');
  const [legs, setLegs] = useState<Leg[]>([]);
  const [selectedLegIds, setSelectedLegIds] = useState<string[]>([]);
  const [role, setRole] = useState<PersonRole>('Pax');
  const [saving, setSaving] = useState(false);

  useEffect(() => { getTrips().then(setTrips); }, []);

  const alreadyAssignedLegIds = useMemo(
    () => new Set(existingAssignments.filter((a) => a.TripID === tripId).map((a) => a.LegID)),
    [existingAssignments, tripId]
  );

  useEffect(() => {
    if (!tripId) { setLegs([]); setSelectedLegIds([]); return; }
    getLegsForTrip(tripId).then((l) => {
      setLegs(l);
      setSelectedLegIds(l.filter((leg) => !alreadyAssignedLegIds.has(leg.LegID)).map((leg) => leg.LegID));
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tripId]);

  const toggleLeg = (legId: string) => {
    setSelectedLegIds((current) => current.includes(legId) ? current.filter((id) => id !== legId) : [...current, legId]);
  };

  const handleSave = async () => {
    if (!tripId || selectedLegIds.length === 0) return;
    setSaving(true);
    try {
      if (selectedLegIds.length === legs.length) {
        await assignPersonToAllLegs(personId, { tripId, role });
      } else {
        await Promise.all(selectedLegIds.map((legId) => assignPersonToLeg(personId, { legId, role })));
      }
      await onSaved();
      onClose();
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader><DialogTitle>Assign to Trip</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1">
            <Label>Trip</Label>
            <Select value={tripId} onValueChange={setTripId}>
              <SelectTrigger><SelectValue placeholder="Select trip" /></SelectTrigger>
              <SelectContent>
                {trips.map((t) => <SelectItem key={t.TripID} value={t.TripID}>{t.TripID} — {t.Registration}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          {tripId && (
            <div className="space-y-1">
              <Label>Legs</Label>
              <div className="max-h-40 space-y-1 overflow-y-auto rounded-md border p-2">
                {legs.map((leg) => (
                  <label key={leg.LegID} className="flex items-center gap-2 text-xs">
                    <input
                      type="checkbox"
                      checked={selectedLegIds.includes(leg.LegID)}
                      disabled={alreadyAssignedLegIds.has(leg.LegID)}
                      onChange={() => toggleLeg(leg.LegID)}
                    />
                    LEG {leg.Seq}: {leg.DepICAO} → {leg.ArrICAO}
                    {alreadyAssignedLegIds.has(leg.LegID) && <span className="text-muted-foreground"> (already assigned)</span>}
                  </label>
                ))}
              </div>
            </div>
          )}
          <div className="space-y-1">
            <Label>Role</Label>
            <Select value={role} onValueChange={(v) => setRole(v as PersonRole)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {PERSON_ROLES.map((r) => <SelectItem key={r} value={r}>{r}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button onClick={handleSave} disabled={!tripId || selectedLegIds.length === 0 || saving}>{saving ? 'Saving…' : 'Save'}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function AssignedTripsCard({ personId, assignments, onChanged }: {
  personId: string; assignments: PersonAssignment[]; onChanged: () => Promise<void> | void;
}) {
  const { canEdit } = useAuth();
  const [assignOpen, setAssignOpen] = useState(false);
  const byTrip = useMemo(() => {
    const groups = new Map<string, PersonAssignment[]>();
    for (const a of assignments) {
      const list = groups.get(a.TripID) ?? [];
      list.push(a);
      groups.set(a.TripID, list);
    }
    return Array.from(groups.entries());
  }, [assignments]);

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0">
        <CardTitle className="text-base font-semibold flex items-center gap-2"><Plane className="h-4 w-4" /> ASSIGNED TRIPS</CardTitle>
        <Button size="sm" disabled={!canEdit} onClick={() => canEdit && setAssignOpen(true)}><Plus className="h-4 w-4" /> ASSIGN TO TRIP</Button>
      </CardHeader>
      <CardContent className="p-0">
        {byTrip.length === 0 ? (
          <div className="p-4 text-center text-sm text-muted-foreground">NOT ASSIGNED TO ANY TRIP</div>
        ) : byTrip.map(([tripId, rows]) => (
          <div key={tripId} className="border-b last:border-b-0">
            <div className="flex items-center justify-between bg-muted/30 px-3 py-2">
              <Link to={`/trips/${tripId}`} className="font-mono text-xs text-primary hover:underline">{tripId}</Link>
              <span className="text-xs text-muted-foreground">{rows[0].TripClient} · {rows[0].TripRegistration || '—'} · {rows[0].TripStatus}</span>
            </div>
            <Table>
              <TableBody>
                {rows.map((a) => (
                  <TableRow key={a.LegID}>
                    <TableCell className="text-xs text-muted-foreground">LEG {a.LegSeq}: {a.DepICAO} → {a.ArrICAO}</TableCell>
                    <TableCell><Badge variant="secondary">{a.Role}</Badge></TableCell>
                    <TableCell>
                      <Button size="sm" variant="outline" disabled={!canEdit} onClick={async () => { if (!canEdit) return; await unassignPersonFromLeg(personId, a.LegID); await onChanged(); }}>UNASSIGN</Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        ))}
      </CardContent>
      {assignOpen && (
        <AssignTripDialog
          personId={personId}
          open={assignOpen}
          onClose={() => setAssignOpen(false)}
          onSaved={onChanged}
          existingAssignments={assignments}
        />
      )}
    </Card>
  );
}

// ─── Docs ───────────────────────────────────────────────────────────────────

function DocsCard({ personId, docs, onChanged }: {
  personId: string; docs: DocAttachment[]; onChanged: () => Promise<void> | void;
}) {
  const { canEdit } = useAuth();
  const [uploadDocType, setUploadDocType] = useState('Other');
  const [uploadFile, setUploadFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const [verifyDocId, setVerifyDocId] = useState<string | null>(null);
  const [ocrRunningDocId, setOcrRunningDocId] = useState<string | null>(null);
  const [pdfPasswords, setPdfPasswords] = useState<Record<string, string>>({});

  const handleUpload = async () => {
    if (!canEdit || !uploadFile) return;
    setUploading(true);
    try {
      await uploadDoc(uploadFile, { docType: uploadDocType, personId });
      setUploadFile(null);
      await onChanged();
    } finally {
      setUploading(false);
    }
  };

  const handleRunOcr = async (docId: string) => {
    if (!canEdit) return;
    setOcrRunningDocId(docId);
    try {
      await runDocOcr(docId, pdfPasswords[docId]);
      await onChanged();
    } finally {
      setOcrRunningDocId(null);
    }
  };

  return (
    <>
      <Card>
        <CardHeader>
          <CardTitle className="text-base font-semibold flex items-center gap-2"><FileText className="h-4 w-4" /> UPLOAD DOCUMENT</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-wrap items-center gap-2">
          <select className="h-9 rounded-md border bg-background px-2 text-sm" value={uploadDocType} onChange={(event) => setUploadDocType(event.target.value)}>
            {DOC_TYPES.map((type) => <option key={type} value={type}>{type}</option>)}
          </select>
          <input
            type="file"
            accept="application/pdf,image/jpeg,image/png,image/gif,image/tiff,image/bmp,text/plain,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
            className="text-sm"
            onChange={(event) => setUploadFile(event.target.files?.[0] || null)}
          />
          <Button size="sm" onClick={handleUpload} disabled={!canEdit || !uploadFile || uploading}>
            {uploading ? 'UPLOADING…' : 'UPLOAD'}
          </Button>
        </CardContent>
      </Card>

      {docs.length > 0 ? (
        <Card>
          <CardHeader>
            <CardTitle className="text-base font-semibold flex items-center gap-2"><FileText className="h-4 w-4" /> DOCUMENT ATTACHMENTS</CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>DOC TYPE</TableHead>
                  <TableHead>FILE</TableHead>
                  <TableHead>SIZE</TableHead>
                  <TableHead>UPLOADED Z/UTC</TableHead>
                  <TableHead>BY</TableHead>
                  <TableHead></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {docs.map((doc) => (
                  <TableRow key={doc.DocID}>
                    <TableCell><Badge variant="outline">{doc.DocType?.toUpperCase()}</Badge></TableCell>
                    <TableCell className="font-mono text-xs">{doc.FileName?.toUpperCase()}</TableCell>
                    <TableCell className="text-xs text-muted-foreground">{(doc.FileSizeBytes / 1024).toFixed(0)} KB</TableCell>
                    <TableCell className="text-sm">{formatZ(doc.UploadedZ)}</TableCell>
                    <TableCell className="text-sm">{doc.UploadedBy?.toUpperCase()}</TableCell>
                    <TableCell>
                      <div className="flex flex-wrap items-center gap-2">
                        <Button size="sm" variant="outline" onClick={() => downloadDocFile(doc.DocID, doc.FileName)}>DOWNLOAD</Button>
                        {doc.OcrStatus === 'Complete' ? (
                          <Button size="sm" variant="outline" disabled={!canEdit} onClick={() => canEdit && setVerifyDocId(doc.DocID)}>
                            {doc.VerifiedAt ? 'RE-VERIFY' : 'VERIFY'}
                          </Button>
                        ) : (
                          <>
                            {doc.MimeType === 'application/pdf' && (
                              <Input
                                type="password"
                                placeholder="PDF password (if any)"
                                className="h-8 w-36 text-xs"
                                value={pdfPasswords[doc.DocID] || ''}
                                onChange={(e) => setPdfPasswords((cur) => ({ ...cur, [doc.DocID]: e.target.value }))}
                              />
                            )}
                            <Button size="sm" variant="outline" onClick={() => handleRunOcr(doc.DocID)} disabled={!canEdit || ocrRunningDocId === doc.DocID}>
                              {ocrRunningDocId === doc.DocID ? 'EXTRACTING…' : 'EXTRACT TEXT'}
                            </Button>
                          </>
                        )}
                        {doc.VerifiedAt && <Badge variant="outline" className="border-emerald-300 text-emerald-700 text-[9px]">VERIFIED</Badge>}
                        <Button size="sm" variant="outline" disabled={!canEdit} onClick={async () => { if (!canEdit) return; await deleteDoc(doc.DocID); await onChanged(); }}>DELETE</Button>
                      </div>
                      {doc.OcrStatus === 'Failed' && doc.OcrError && (
                        <div className="mt-1 text-xs text-destructive">{doc.OcrError}</div>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      ) : (
        <div className="py-8 text-center text-muted-foreground">NO DOCUMENTS ATTACHED</div>
      )}
      {verifyDocId && (
        <DocVerifyDialog
          doc={docs.find((d) => d.DocID === verifyDocId)!}
          open={!!verifyDocId}
          onClose={() => setVerifyDocId(null)}
          onSaved={onChanged}
        />
      )}
    </>
  );
}

// ─── Page ───────────────────────────────────────────────────────────────────

export default function PersonDetail() {
  const { personId } = useParams<{ personId: string }>();
  const [person, setPerson] = useState<Person | null>(null);
  const [ratings, setRatings] = useState<PersonRating[]>([]);
  const [assignments, setAssignments] = useState<PersonAssignment[]>([]);
  const [docs, setDocs] = useState<DocAttachment[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const reload = async () => {
    if (!personId) return;
    const [p, r, a, d] = await Promise.all([
      getPerson(personId), getPersonRatings(personId), getPersonAssignments(personId), getDocsForPerson(personId),
    ]);
    setPerson(p);
    setRatings(r);
    setAssignments(a);
    setDocs(d);
  };

  useEffect(() => {
    let cancelled = false;
    if (!personId) { setLoading(false); return; }
    setLoading(true);
    Promise.all([getPerson(personId), getPersonRatings(personId), getPersonAssignments(personId), getDocsForPerson(personId)])
      .then(([p, r, a, d]) => {
        if (cancelled) return;
        setPerson(p);
        setRatings(r);
        setAssignments(a);
        setDocs(d);
        setLoading(false);
      })
      .catch((e) => { if (!cancelled) { setError(e.message); setLoading(false); } });
    return () => { cancelled = true; };
  }, [personId]);

  if (loading) return <p className="p-4 text-sm text-muted-foreground">Loading…</p>;
  if (error) return <p className="p-4 text-sm text-destructive">Error: {error}</p>;

  if (!person) {
    return (
      <div className="py-12 text-center">
        <h2 className="text-xl font-bold">PERSON NOT FOUND</h2>
        <p className="text-muted-foreground">{personId} DOES NOT EXIST IN THE ROSTER.</p>
        <Link to="/admin/assets" className="mt-4 inline-block text-primary hover:underline">← BACK TO PERSONS</Link>
      </div>
    );
  }

  const worstTone = personExpiryStatus(person, ratings).worstTone;

  return (
    <div className="space-y-6">
      <div>
        <Link to="/admin/assets" className="mb-1 flex items-center gap-1 text-xs text-muted-foreground hover:underline">
          <ArrowLeft className="h-3 w-3" /> BACK TO PERSONS
        </Link>
        <div className="mb-1 flex items-center gap-3">
          <h1 className="text-2xl font-bold tracking-tight">{person.Name}</h1>
          {person.DefaultRole && <Badge variant="secondary">{person.DefaultRole}</Badge>}
          <ExpiryBadge tone={worstTone} />
        </div>
        <p className="text-muted-foreground">{person.PersonID}</p>
      </div>

      <BiodataCard person={person} onSaved={reload} />
      <MedicalCard person={person} onSaved={reload} />
      <RatingsCard personId={person.PersonID} ratings={ratings} onChanged={reload} />
      <AssignedTripsCard personId={person.PersonID} assignments={assignments} onChanged={reload} />
      <DocsCard personId={person.PersonID} docs={docs} onChanged={reload} />
    </div>
  );
}
