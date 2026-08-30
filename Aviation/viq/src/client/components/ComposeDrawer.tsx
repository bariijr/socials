import { useEffect, useState } from 'react';
import {
  generateEmail, SERVICE_TYPE_TO_TEMPLATE, hasRequestRevisionToggle, defaultTemplateFor,
  toggleTemplateAction, isRevisionTemplate, type TemplateType, type RequestAction,
} from '@/lib/emailTemplates';
import { saveComm, sendComm, getProviderList, getAirport } from '@/lib/dataStore';
import type { Service, Leg, Trip, Comm, TripPersonView } from '@/data/types';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useAuth } from '@/lib/authContext';

const TEMPLATE_OPTIONS: TemplateType[] = [
  'VIQ_OverflyRequest', 'VIQ_OverflyRevision', 'VIQ_LandingRequest', 'VIQ_LandingRevision',
  'VIQ_GroundHandlingRequest', 'VIQ_GroundHandlingRevision',
  'Fuel', 'Catering', 'CrewTransport', 'Customs', 'Hotel', 'Generic',
];

export function ComposeDrawer({
  service, leg, trip, legs, comms, persons, open, onClose, onSent,
}: {
  service: Service;
  leg: Leg;
  trip: Trip;
  legs: Leg[];
  comms: Comm[];
  persons: TripPersonView[];
  open: boolean;
  onClose: () => void;
  onSent: () => void;
}) {
  const { canEdit } = useAuth();
  const providers = getProviderList();
  const arrCountryISO2 = getAirport(leg.ArrICAO)?.CountryISO2;
  const depCountryISO2 = getAirport(leg.DepICAO)?.CountryISO2;
  const eligibleProviders = providers.filter((p) =>
    p.ServiceTypes.includes(service.ServiceType) &&
    (
      p.ScopeType === 'Global' ||
      (p.ScopeType === 'ICAO' && (p.Scope === leg.ArrICAO || p.Scope === leg.DepICAO)) ||
      (p.ScopeType === 'Country' && (p.Scope === service.CountryISO2 || p.Scope === arrCountryISO2 || p.Scope === depCountryISO2))
    )
  );
  const defaultProvider = providers.find((p) => p.ProviderID === service.ProviderID) ?? eligibleProviders[0] ?? null;
  // Always keep the service's assigned vendor selectable even if it falls outside the
  // eligibility heuristic above (e.g. a country-scoped permit desk for a leg's country).
  const providerOptions = defaultProvider && !eligibleProviders.some((p) => p.ProviderID === defaultProvider.ProviderID)
    ? [defaultProvider, ...eligibleProviders]
    : eligibleProviders;

  const detectAction = (): RequestAction =>
    comms.some((c) => c.SVCID === service.SVCID && c.Direction === 'OUTBOUND' && c.Status === 'Sent') ? 'Revision' : 'Request';

  const [providerId, setProviderId] = useState(defaultProvider?.ProviderID ?? '');
  const [template, setTemplate] = useState<TemplateType>(() => (
    hasRequestRevisionToggle(service.ServiceType) ? defaultTemplateFor(service.ServiceType, detectAction()) : (SERVICE_TYPE_TO_TEMPLATE[service.ServiceType] ?? 'Generic')
  ));
  const [subject, setSubject] = useState('');
  const [body, setBody] = useState('');
  const [sending, setSending] = useState(false);
  const [result, setResult] = useState<{ ok: boolean; message: string } | null>(null);

  const action: RequestAction = isRevisionTemplate(template) ? 'Revision' : 'Request';
  const selectedProvider = providers.find((p) => p.ProviderID === providerId) ?? null;
  const recipients = selectedProvider?.Channels.filter((c) => c.ChannelType === 'Email').map((c) => c.Value) ?? [];
  const countryISO2 = service.ServiceType === 'GroundHandling' ? (arrCountryISO2 ?? null) : (service.CountryISO2 ?? null);

  // Re-detect the default Request/Revision on every open (comms may have
  // loaded or changed since mount); manual overrides while the drawer stays
  // open are left alone.
  useEffect(() => {
    if (!open || !hasRequestRevisionToggle(service.ServiceType)) return;
    setTemplate(defaultTemplateFor(service.ServiceType, detectAction()));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  useEffect(() => {
    if (!open) return;
    setResult(null);
    const generated = generateEmail(
      template, trip.TripID, leg.LegID, service.SVCID, legs, persons, '',
      trip.Registration, trip.AircraftICAOType || '', trip.AircraftMTOWKg || 0,
      trip.Client, trip.Operator, trip.SupportRef || '', countryISO2, recipients
    );
    setSubject(generated.subject);
    setBody(generated.body);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, template, providerId]);

  const handleSend = async () => {
    if (!canEdit || !selectedProvider) return;
    setSending(true);
    setResult(null);
    try {
      const comm: Comm = {
        CommID: `COMM-${service.SVCID}-${Date.now()}`,
        Direction: 'OUTBOUND',
        TripID: trip.TripID,
        SVCID: service.SVCID,
        Token: service.SVCID,
        From: 'operations@viq.local',
        To: recipients.join(', '),
        Subject: subject,
        Body: body,
        TimestampZ: new Date().toISOString(),
        Status: 'Draft',
      };
      await saveComm(comm);
      const sent = await sendComm(comm.CommID);
      const ok = sent.Status === 'Sent';
      setResult(
        ok
          ? { ok: true, message: 'Sent successfully.' }
          : { ok: false, message: sent.ErrorMessage || 'Send failed.' }
      );
      onSent();
    } catch (e) {
      setResult({ ok: false, message: e instanceof Error ? e.message : 'Send failed.' });
    } finally {
      setSending(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      {/* sm:max-w-*, not bare max-w-* — see BillingPage's InvoiceDetailDialog
          for why an unprefixed override loses to DialogContent's own
          sm:max-w-lg at desktop widths regardless of JSX order. */}
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Compose — {service.ServiceType} — {leg.DepICAO} → {leg.ArrICAO}</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          {hasRequestRevisionToggle(service.ServiceType) && (
            <div>
              <Label>Request / Revision</Label>
              <div className="mt-1 grid grid-cols-2 gap-2">
                {(['Request', 'Revision'] as RequestAction[]).map((option) => (
                  <Button
                    key={option}
                    type="button"
                    size="sm"
                    variant={action === option ? 'default' : 'outline'}
                    onClick={() => action !== option && setTemplate(toggleTemplateAction(template))}
                  >
                    {option.toUpperCase()}
                  </Button>
                ))}
              </div>
            </div>
          )}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label>Template</Label>
              <Select value={template} onValueChange={(v) => setTemplate(v as TemplateType)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {TEMPLATE_OPTIONS.map((t) => (
                    <SelectItem key={t} value={t}>{t}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Vendor</Label>
              <Select value={providerId} onValueChange={setProviderId}>
                <SelectTrigger><SelectValue placeholder="Select vendor..." /></SelectTrigger>
                <SelectContent>
                  {providerOptions.map((p) => (
                    <SelectItem key={p.ProviderID} value={p.ProviderID}>{p.Name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <div>
            <Label>Recipients</Label>
            <Input value={recipients.join(', ')} readOnly />
          </div>
          <div>
            <Label>Subject</Label>
            <Input value={subject} onChange={(e) => setSubject(e.target.value)} />
          </div>
          <div>
            <Label>Body</Label>
            <Textarea rows={14} value={body} onChange={(e) => setBody(e.target.value)} className="font-mono text-xs" />
          </div>
          {result && (
            <p className={`text-sm ${result.ok ? 'text-emerald-600' : 'text-destructive'}`}>{result.message}</p>
          )}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Close</Button>
          <Button onClick={() => canEdit && handleSend()} disabled={sending || !providerId || result?.ok === true || !canEdit}>
            {sending ? 'Sending…' : result?.ok ? 'Sent' : 'Send'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
