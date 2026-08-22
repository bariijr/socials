'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { createLeg, getLegs, type CreateLegInput, type Leg } from '@/lib/api-client';
import { findMostRecentByTail } from '@/lib/leg-lookup';

const PREFILLABLE_FIELDS = [
  'operatorName',
  'clientName',
  'clientNo',
  'agentName',
  'agentContacts',
  'acType',
  'mtowLb',
  'captName',
  'captEmail',
  'country',
  'region',
  'tssTeam',
  'pgh',
] as const satisfies readonly (keyof CreateLegInput)[];

type FormState = Record<keyof CreateLegInput, string>;

const EMPTY_FORM: FormState = {
  tripNo: '',
  icao: '',
  country: '',
  region: '',
  refNo: '',
  clientName: '',
  operatorName: '',
  clientNo: '',
  agentName: '',
  agentContacts: '',
  tail: '',
  arrDate: '',
  depDate: '',
  arrFrom: '',
  depToIcao: '',
  activityType: '',
  captName: '',
  captEmail: '',
  acType: '',
  mtowLb: '',
  pgh: '',
  tssTeam: '',
  serviceReportSent: '',
  returnedInTime: '',
};

function TextField({
  id,
  label,
  value,
  onChange,
  onBlur,
  required,
  type = 'text',
}: {
  id: keyof FormState;
  label: string;
  value: string;
  onChange: (id: keyof FormState, value: string) => void;
  onBlur?: () => void;
  required?: boolean;
  type?: string;
}) {
  return (
    <div className="field">
      <label htmlFor={id}>
        {label}
        {required ? ' *' : ''}
      </label>
      <input
        id={id}
        type={type}
        value={value}
        onChange={(e) => onChange(id, e.target.value)}
        onBlur={onBlur}
      />
    </div>
  );
}

function CheckField({
  id,
  label,
  checked,
  onChange,
}: {
  id: keyof FormState;
  label: string;
  checked: boolean;
  onChange: (id: keyof FormState, value: string) => void;
}) {
  return (
    <label className="checkfield">
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(id, e.target.checked ? 'true' : '')}
      />
      {label}
    </label>
  );
}

function toCreateLegInput(form: FormState): CreateLegInput {
  const input: CreateLegInput = { tripNo: form.tripNo.trim(), icao: form.icao.trim() };
  if (form.country) input.country = form.country;
  if (form.region) input.region = form.region;
  if (form.refNo) input.refNo = form.refNo;
  if (form.clientName) input.clientName = form.clientName;
  if (form.operatorName) input.operatorName = form.operatorName;
  if (form.clientNo) input.clientNo = form.clientNo;
  if (form.agentName) input.agentName = form.agentName;
  if (form.agentContacts) input.agentContacts = form.agentContacts;
  if (form.tail) input.tail = form.tail;
  if (form.arrDate) input.arrDate = form.arrDate;
  if (form.depDate) input.depDate = form.depDate;
  if (form.arrFrom) input.arrFrom = form.arrFrom;
  if (form.depToIcao) input.depToIcao = form.depToIcao;
  if (form.activityType) input.activityType = form.activityType;
  if (form.captName) input.captName = form.captName;
  if (form.captEmail) input.captEmail = form.captEmail;
  if (form.acType) input.acType = form.acType;
  if (form.mtowLb) input.mtowLb = Number(form.mtowLb);
  if (form.pgh) input.pgh = form.pgh;
  if (form.tssTeam) input.tssTeam = form.tssTeam;
  if (form.serviceReportSent) input.serviceReportSent = true;
  if (form.returnedInTime) input.returnedInTime = true;
  return input;
}

export default function NewLegPage() {
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [existingLegs, setExistingLegs] = useState<Leg[]>([]);
  const [prefillNotice, setPrefillNotice] = useState<string | null>(null);
  const router = useRouter();

  useEffect(() => {
    const token = localStorage.getItem('uaa_token');
    if (!token) {
      router.replace('/login');
      return;
    }
    getLegs(token)
      .then(setExistingLegs)
      .catch(() => setExistingLegs([]));
  }, [router]);

  function handleChange(id: keyof FormState, value: string) {
    setForm((prev) => ({ ...prev, [id]: value }));
  }

  function handleTailBlur() {
    const match = findMostRecentByTail(existingLegs, form.tail);
    if (!match) return;

    setForm((prev) => {
      const next = { ...prev };
      for (const field of PREFILLABLE_FIELDS) {
        if (next[field]) continue;
        const value = match[field as keyof Leg];
        if (value != null) next[field] = String(value);
      }
      return next;
    });
    setPrefillNotice(`Prefilled from a previous leg for ${match.tail} (Trip ${match.tripNo}). Review before saving.`);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    if (!form.tripNo.trim()) {
      setError('Trip No is required.');
      return;
    }
    if (!form.icao.trim()) {
      setError('ICAO is required.');
      return;
    }

    const token = localStorage.getItem('uaa_token');
    if (!token) {
      router.replace('/login');
      return;
    }

    setSaving(true);
    try {
      await createLeg(token, toCreateLegInput(form));
      router.push('/legs');
    } catch {
      setError('Could not save this leg. Check the details and try again.');
      setSaving(false);
    }
  }

  return (
    <div className="board-shell">
      <div className="board-header">
        <h1 className="board-title">UAA Coordinator — New Leg</h1>
        <a className="btn-link" href="/legs">
          Back to legs
        </a>
      </div>
      <div className="runway-rule" />

      <form className="leg-form" onSubmit={handleSubmit}>
        {error && (
          <p className="login-error" role="alert">
            {error}
          </p>
        )}
        {prefillNotice && <p className="prefill-notice">{prefillNotice}</p>}

        <fieldset>
          <legend>Flight</legend>
          <div className="field-grid">
            <TextField id="tripNo" label="Trip No" value={form.tripNo} onChange={handleChange} required />
            <TextField id="icao" label="ICAO" value={form.icao} onChange={handleChange} required />
            <TextField id="tail" label="Tail" value={form.tail} onChange={handleChange} onBlur={handleTailBlur} />
            <TextField id="acType" label="A/C Type" value={form.acType} onChange={handleChange} />
            <TextField id="mtowLb" label="MTOW (LB)" type="number" value={form.mtowLb} onChange={handleChange} />
            <TextField id="arrDate" label="Arrival" type="datetime-local" value={form.arrDate} onChange={handleChange} />
            <TextField id="depDate" label="Departure" type="datetime-local" value={form.depDate} onChange={handleChange} />
            <TextField id="arrFrom" label="Arriving From" value={form.arrFrom} onChange={handleChange} />
            <TextField id="depToIcao" label="Departing To" value={form.depToIcao} onChange={handleChange} />
            <TextField id="activityType" label="Activity Type" value={form.activityType} onChange={handleChange} />
          </div>
        </fieldset>

        <fieldset>
          <legend>Client &amp; Agent</legend>
          <div className="field-grid">
            <TextField id="country" label="Country" value={form.country} onChange={handleChange} />
            <TextField id="region" label="Region" value={form.region} onChange={handleChange} />
            <TextField id="refNo" label="Ref No" value={form.refNo} onChange={handleChange} />
            <TextField id="clientName" label="Client Name" value={form.clientName} onChange={handleChange} />
            <TextField id="clientNo" label="Client No" value={form.clientNo} onChange={handleChange} />
            <TextField id="operatorName" label="Operator Name" value={form.operatorName} onChange={handleChange} />
            <TextField id="agentName" label="Agent Name" value={form.agentName} onChange={handleChange} />
            <TextField id="agentContacts" label="Agent Contacts" value={form.agentContacts} onChange={handleChange} />
          </div>
        </fieldset>

        <fieldset>
          <legend>Crew</legend>
          <div className="field-grid">
            <TextField id="captName" label="Captain Name" value={form.captName} onChange={handleChange} />
            <TextField id="captEmail" label="Captain Email" type="email" value={form.captEmail} onChange={handleChange} />
          </div>
        </fieldset>

        <fieldset>
          <legend>Ops</legend>
          <div className="field-grid">
            <TextField id="tssTeam" label="TSS Team" value={form.tssTeam} onChange={handleChange} />
            <TextField id="pgh" label="PGH" value={form.pgh} onChange={handleChange} />
          </div>
          <div className="checkfield-row">
            <CheckField
              id="serviceReportSent"
              label="Service report sent"
              checked={!!form.serviceReportSent}
              onChange={handleChange}
            />
            <CheckField
              id="returnedInTime"
              label="Returned in time"
              checked={!!form.returnedInTime}
              onChange={handleChange}
            />
          </div>
        </fieldset>

        <button className="btn-primary" type="submit" disabled={saving}>
          {saving ? 'Saving…' : 'Save leg'}
        </button>
      </form>
    </div>
  );
}
