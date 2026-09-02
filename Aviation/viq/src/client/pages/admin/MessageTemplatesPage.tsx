import { useState, useMemo } from 'react';
import {
  getCountryList, getMessageTemplateList, saveMessageTemplate, deleteMessageTemplate,
} from '@/lib/dataStore';
import { DEFAULT_TEMPLATES, COUNTRY_AWARE_TEMPLATE_TYPES, type TemplateType } from '@/lib/emailTemplates';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';

const TEMPLATE_TYPE_LABELS: Record<string, string> = {
  VIQ_OverflyRequest: 'Overfly Permit — Request',
  VIQ_OverflyRevision: 'Overfly Permit — Revision',
  VIQ_LandingRequest: 'Landing Permit — Request',
  VIQ_LandingRevision: 'Landing Permit — Revision',
  VIQ_GroundHandlingRequest: 'Ground Handling — Request',
  VIQ_GroundHandlingRevision: 'Ground Handling — Revision',
};

const SAMPLE_VARS: Record<string, string> = {
  OPERATOR: 'JETSTREAM EXECUTIVE AVIATION', REG: 'N123AB', ACTYPE: 'GLF6', MTOW: '99,600',
  DEP: 'KTEB', DEP_NAME: 'TETERBORO', ARR: 'EGLL', ARR_NAME: 'LONDON HEATHROW',
  ETD: '25AUG/1200 UTC', ETA: '25AUG/2000 UTC', PREV_ETD: '25AUG/1100 UTC', PREV_ETA: '25AUG/1900 UTC',
  CLIENT: 'SAMPLE CLIENT', SUPPORT_REF: 'SR-12345', PIC: 'JOHN SMITH', CREW_COUNT: '2', PAX_COUNT: '4',
  TRIP_ID: '2608099', TOKEN: '2608099/GEN-SAMPLE', SENDER_NAME: 'OPERATIONS TEAM',
  SENDER_BLOCK: 'PHONE: +1 555 0100   E-MAIL: ops@example.com',
  RECIPIENTS: 'caa@example.gov', COUNTRY_NAME: 'SAMPLE COUNTRY', CALL_SIGN: 'N123AB',
};

function renderPreview(str: string): string {
  return str.replace(/\{\{(\w+)\}\}/g, (_m, key) => SAMPLE_VARS[key] ?? `{{${key}}}`);
}

export default function MessageTemplatesPage() {
  const countries = getCountryList();
  const [refreshKey, setRefreshKey] = useState(0);
  const refresh = () => setRefreshKey((k) => k + 1);
  const overrides = useMemo(() => getMessageTemplateList(), [refreshKey]);

  const [countryIso2, setCountryIso2] = useState(countries[0]?.ISO2 || '');
  const [templateType, setTemplateType] = useState<TemplateType>('VIQ_OverflyRequest');
  const existing = overrides.find((o) => o.CountryISO2 === countryIso2 && o.TemplateType === templateType);
  const defaultTpl = DEFAULT_TEMPLATES[templateType];

  const [subject, setSubject] = useState(existing?.Subject || defaultTpl?.subject || '');
  const [body, setBody] = useState(existing?.Body || defaultTpl?.body || '');

  const selectPair = (iso2: string, type: TemplateType) => {
    setCountryIso2(iso2);
    setTemplateType(type);
    const found = overrides.find((o) => o.CountryISO2 === iso2 && o.TemplateType === type);
    const def = DEFAULT_TEMPLATES[type];
    setSubject(found?.Subject || def?.subject || '');
    setBody(found?.Body || def?.body || '');
  };

  const isUnchanged = subject === (existing?.Subject || defaultTpl?.subject || '') && body === (existing?.Body || defaultTpl?.body || '');

  const handleSave = async () => {
    await saveMessageTemplate({ ID: existing?.ID, CountryISO2: countryIso2, TemplateType: templateType, Subject: subject, Body: body });
    refresh();
  };

  const handleResetToDefault = async () => {
    if (!existing) return;
    await deleteMessageTemplate(existing.ID);
    setSubject(defaultTpl?.subject || '');
    setBody(defaultTpl?.body || '');
    refresh();
  };

  const countryOverridesForType = overrides.filter((o) => o.TemplateType === templateType);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Message Templates</h1>
        <p className="text-muted-foreground">Country-specific overrides for CAA-facing permit request templates</p>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <div className="space-y-1">
          <Label>Country</Label>
          <Select value={countryIso2} onValueChange={(v) => selectPair(v, templateType)}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              {countries.map((c) => <SelectItem key={c.ISO2} value={c.ISO2}>{c.Name} ({c.ISO2})</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1">
          <Label>Template Type</Label>
          <Select value={templateType} onValueChange={(v) => selectPair(countryIso2, v as TemplateType)}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              {COUNTRY_AWARE_TEMPLATE_TYPES.map((t) => <SelectItem key={t} value={t}>{TEMPLATE_TYPE_LABELS[t] || t}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader className="flex flex-row items-center justify-between space-y-0">
            <CardTitle className="text-base font-semibold">
              {countries.find((c) => c.ISO2 === countryIso2)?.Name} — {TEMPLATE_TYPE_LABELS[templateType]}
              {existing && <Badge variant="secondary" className="ml-2">OVERRIDE ACTIVE</Badge>}
            </CardTitle>
            <div className="flex gap-2">
              {existing && <Button size="sm" variant="outline" onClick={handleResetToDefault}>Reset to Default</Button>}
              <Button size="sm" onClick={handleSave} disabled={isUnchanged}>Save Override</Button>
            </div>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="space-y-1">
              <Label>Subject</Label>
              <input
                className="h-9 w-full rounded-md border bg-background px-2 text-sm font-mono"
                value={subject}
                onChange={(e) => setSubject(e.target.value)}
              />
            </div>
            <div className="space-y-1">
              <Label>Body</Label>
              <textarea
                className="w-full rounded-md border bg-background p-2 font-mono text-xs"
                rows={24}
                value={body}
                onChange={(e) => setBody(e.target.value)}
              />
            </div>
          </CardContent>
        </Card>

        <div className="space-y-4">
          <Card>
            <CardHeader><CardTitle className="text-sm font-semibold">Preview (sample data)</CardTitle></CardHeader>
            <CardContent>
              <div className="mb-2 text-xs font-medium text-muted-foreground">{renderPreview(subject)}</div>
              <pre className="max-h-64 overflow-y-auto whitespace-pre-wrap rounded border bg-muted/20 p-2 text-[10px]">{renderPreview(body)}</pre>
            </CardContent>
          </Card>
          <Card>
            <CardHeader><CardTitle className="text-sm font-semibold">Countries with an override for this type</CardTitle></CardHeader>
            <CardContent className="space-y-1">
              {countryOverridesForType.length === 0 ? (
                <p className="text-xs text-muted-foreground">None yet — every country uses the default.</p>
              ) : (
                countryOverridesForType.map((o) => (
                  <button
                    key={o.ID}
                    className="block w-full rounded px-2 py-1 text-left text-xs hover:bg-accent"
                    onClick={() => selectPair(o.CountryISO2, o.TemplateType as TemplateType)}
                  >
                    {countries.find((c) => c.ISO2 === o.CountryISO2)?.Name || o.CountryISO2}
                  </button>
                ))
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
