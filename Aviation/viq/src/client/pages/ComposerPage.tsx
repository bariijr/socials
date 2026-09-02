import { useState, useEffect } from 'react';
import { getTrips, getLegsForTrip, getAircraft, getServices, getCommsForTrip, getPersonsForTrip, getPersonsForLeg, dedupeToTripPersonView, getAirport, saveComm, sendComm } from '@/lib/dataStore';
import {
  generateEmail, hasRequestRevisionToggle, defaultTemplateFor, toggleTemplateAction,
  isActionTemplate, type TemplateType,
} from '@/lib/emailTemplates';
import type { Comm, Trip, Leg, Service, TripPersonView, TripLegPersonView } from '@/data/types';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { Mail, Copy, ExternalLink, Send } from 'lucide-react';
import { useAuth } from '@/lib/authContext';

export default function ComposerPage() {
  const { canEdit } = useAuth();
  const [tripId, setTripId] = useState('2608004');
  const [legId, setLegId] = useState<string | null>(null);
  const [svcId, setSvcId] = useState<string | null>(null);
  const [template, setTemplate] = useState<TemplateType>('VIQ_OverflyRequest');
  const [to, setTo] = useState('');
  const [notes, setNotes] = useState('');
  const [composed, setComposed] = useState<{ subject: string; body: string; token: string } | null>(null);
  const [copied, setCopied] = useState(false);
  const [sent, setSent] = useState(false);
  const [sendError, setSendError] = useState<string | null>(null);

  const [trips, setTrips] = useState<Trip[]>([]);
  const [legs, setLegs] = useState<Leg[]>([]);
  const [tripServices, setTripServices] = useState<Service[]>([]);
  const [comms, setComms] = useState<Comm[]>([]);
  const [tripPersonRegister, setTripPersonRegister] = useState<TripLegPersonView[]>([]);
  const [persons, setPersons] = useState<TripPersonView[]>([]);

  useEffect(() => {
    getTrips().then(setTrips);
  }, []);

  useEffect(() => {
    let cancelled = false;
    if (!tripId) { setLegs([]); setTripServices([]); setComms([]); setTripPersonRegister([]); return; }
    Promise.all([getLegsForTrip(tripId), getServices(), getCommsForTrip(tripId), getPersonsForTrip(tripId)]).then(([l, s, c, p]) => {
      if (!cancelled) { setLegs(l); setTripServices(s.filter((svc) => svc.TripID === tripId)); setComms(c); setTripPersonRegister(p); }
    });
    return () => { cancelled = true; };
  }, [tripId]);

  useEffect(() => {
    let cancelled = false;
    if (legId) {
      getPersonsForLeg(legId).then((p) => { if (!cancelled) setPersons(p); });
    } else {
      setPersons(dedupeToTripPersonView(tripPersonRegister));
    }
    return () => { cancelled = true; };
  }, [legId, tripPersonRegister]);

  const trip = trips.find(t => t.TripID === tripId);
  const ac = trip ? getAircraft(trip.Registration) : null;
  const selectedService = tripServices.find((s) => s.SVCID === svcId) ?? null;
  const selectedLeg = legs.find((l) => l.LegID === legId) ?? null;
  const countryISO2 = selectedService && (selectedService.ServiceType === 'Overflight' || selectedService.ServiceType === 'Permit')
    ? (selectedService.CountryISO2 ?? null)
    : (selectedLeg ? (getAirport(selectedLeg.ArrICAO)?.CountryISO2 ?? null) : null);

  // Default the template to REQUEST/REVISION based on whether this service
  // already has a prior sent message, whenever the linked service changes.
  useEffect(() => {
    if (!selectedService || !hasRequestRevisionToggle(selectedService.ServiceType)) return;
    const hasPriorSent = comms.some((c) => c.SVCID === svcId && c.Direction === 'OUTBOUND' && c.Status === 'Sent');
    setTemplate(defaultTemplateFor(selectedService.ServiceType, hasPriorSent ? 'Revision' : 'Request'));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [svcId, comms]);

  const handleCompose = () => {
    if (!trip) return;
    const email = generateEmail(
      template,
      tripId,
      legId,
      svcId,
      legs,
      persons,
      notes,
      trip.Registration,
      ac?.ICAOType || 'TBD',
      ac?.MTOW_kg || 0,
      trip.Client,
      trip.Operator,
      trip.SupportRef || '',
      countryISO2,
      to.split(',').map(s => s.trim()).filter(Boolean)
    );
    setComposed(email);
    setCopied(false);
    setSent(false);
    setSendError(null);
  };

  const sendAndLog = async () => {
    if (!canEdit || !composed || !trip) return;
    const comm: Comm = {
      CommID: `COMM-${Date.now()}`,
      Direction: 'OUTBOUND',
      TripID: trip.TripID,
      SVCID: svcId,
      Token: composed.token,
      From: 'operations@viq.local',
      To: to || 'recipient@pending.local',
      Subject: composed.subject,
      Body: composed.body,
      TimestampZ: new Date().toISOString(),
      Status: 'Draft',
    };
    await saveComm(comm);
    const result = await sendComm(comm.CommID);
    setSent(result.Status === 'Sent');
    setSendError(result.Status === 'Failed' ? (result.ErrorMessage || 'Send failed') : null);
  };

  const mailtoLink = composed
    ? `mailto:${to}?subject=${encodeURIComponent(composed.subject)}&body=${encodeURIComponent(composed.body)}`
    : '';

  const templateGroups = {
    'Standard': ['Fuel', 'Catering', 'CrewTransport', 'Customs', 'Hotel', 'Generic'] as TemplateType[],
    'VIQ Permit Requests': [
      'VIQ_OverflyRequest', 'VIQ_OverflyRevision', 'VIQ_LandingRequest', 'VIQ_LandingRevision',
      'VIQ_GroundHandlingRequest', 'VIQ_GroundHandlingRevision', 'VIQ_MultiLegPermit',
    ] as TemplateType[],
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Email Composer</h1>
        <p className="text-muted-foreground">Generate pre-filled request emails with correlation tokens — including country-overridable permit request templates</p>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        {/* Compose Form */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base font-semibold flex items-center gap-2">
              <Send className="h-4 w-4" /> Compose
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <Label>Trip</Label>
              <Select value={tripId} onValueChange={(v) => { setTripId(v); setLegId(null); setSvcId(null); }}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {trips.map(t => <SelectItem key={t.TripID} value={t.TripID}>{t.TripID} — {t.Client}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>

            <div>
              <Label>Leg (optional)</Label>
              <Select value={legId || ''} onValueChange={(v) => setLegId(v || null)}>
                <SelectTrigger><SelectValue placeholder="Select leg..." /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="">None</SelectItem>
                  {legs.map(l => (
                    <SelectItem key={l.LegID} value={l.LegID}>
                      Leg {l.Seq}: {l.DepICAO} → {l.ArrICAO} {l.CallSign ? `(CS: ${l.CallSign})` : ''}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div>
              <Label>Link to Service (optional)</Label>
              <Select value={svcId || ''} onValueChange={(v) => setSvcId(v || null)}>
                <SelectTrigger><SelectValue placeholder="Select service..." /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="">None — generate new token</SelectItem>
                  {tripServices.map(s => (
                    <SelectItem key={s.SVCID} value={s.SVCID}>
                      {s.SVCID} — {s.ServiceType}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {isActionTemplate(template) && (
              <div>
                <Label>Request / Revision</Label>
                <div className="mt-1 grid grid-cols-2 gap-2">
                  {(() => {
                    const isRevision = template.endsWith('Revision');
                    return (
                      <>
                        <Button type="button" size="sm" variant={isRevision ? 'outline' : 'default'} onClick={() => isRevision && setTemplate(toggleTemplateAction(template))}>
                          REQUEST
                        </Button>
                        <Button type="button" size="sm" variant={isRevision ? 'default' : 'outline'} onClick={() => !isRevision && setTemplate(toggleTemplateAction(template))}>
                          REVISION
                        </Button>
                      </>
                    );
                  })()}
                </div>
              </div>
            )}

            <div>
              <Label>Template</Label>
              <Select value={template} onValueChange={(v) => setTemplate(v as TemplateType)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {Object.entries(templateGroups).map(([group, items]) => (
                    <div key={group}>
                      <div className="px-2 py-1.5 text-xs font-semibold text-muted-foreground">{group}</div>
                      {items.map(t => (
                        <SelectItem key={t} value={t}>{t}</SelectItem>
                      ))}
                    </div>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div>
              <Label>To</Label>
              <Input value={to} onChange={(e) => setTo(e.target.value)} placeholder="recipient@example.com" />
            </div>

            <div>
              <Label>Additional Notes / Sign-off Name</Label>
              <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Any special instructions or sign-off name for UW templates..." rows={3} />
            </div>

            <Button onClick={handleCompose} className="w-full">
              <Mail className="mr-2 h-4 w-4" />
              Generate Email
            </Button>
          </CardContent>
        </Card>

        {/* Preview */}
        {composed && (
          <Card>
            <CardHeader>
              <CardTitle className="text-base font-semibold flex items-center gap-2">
                <Mail className="h-4 w-4" /> Preview
              </CardTitle>
              <Badge variant="outline" className="font-mono">{composed.token}</Badge>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <Label className="text-xs text-muted-foreground">Subject</Label>
                <Input value={composed.subject} onChange={(event) => setComposed({ ...composed, subject: event.target.value })} />
              </div>
              <div>
                <Label className="text-xs text-muted-foreground">Body</Label>
                <Textarea className="max-h-96 text-xs" rows={16} value={composed.body} onChange={(event) => setComposed({ ...composed, body: event.target.value })} />
              </div>

              <Separator />

              <div className="flex gap-2">
                <Button className="flex-1" onClick={() => canEdit && sendAndLog()} disabled={sent || !canEdit}>
                  <Send className="mr-2 h-4 w-4" />
                  {sent ? 'Logged as Sent' : sendError ? 'Retry Send' : 'Send & Log'}
                </Button>
                <a
                  href={mailtoLink}
                  className="inline-flex flex-1 items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground shadow hover:bg-primary/90"
                >
                  <ExternalLink className="mr-2 h-4 w-4" />
                  Open in Mail Client
                </a>
                <Button
                  variant="outline"
                  className="flex-1"
                  onClick={() => {
                    navigator.clipboard.writeText(`Subject: ${composed.subject}\n\n${composed.body}`);
                    setCopied(true);
                    setTimeout(() => setCopied(false), 2000);
                  }}
                >
                  <Copy className="mr-2 h-4 w-4" />
                  {copied ? 'Copied!' : 'Copy'}
                </Button>
              </div>
              {sendError && <p className="text-xs text-destructive">{sendError}</p>}
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}
