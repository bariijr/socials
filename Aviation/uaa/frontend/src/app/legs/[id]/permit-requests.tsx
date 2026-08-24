'use client';

import { useEffect, useState } from 'react';
import {
  createPermitRequest,
  listPermitRequests,
  updatePermitRequest,
  checkCompatiblePermitRequest,
  mergePermitRequest,
  type PermitRequest,
  type CompatibleCandidate,
} from '@/lib/api-client';

const RESPONSIBILITIES: PermitRequest['responsibility'][] = [
  'OUR_ARRANGEMENT',
  'CLIENT_ARRANGEMENT',
  'OPERATOR_ARRANGEMENT',
  'THIRD_PARTY_ARRANGEMENT',
  'NOT_REQUIRED',
  'WAIVED',
  'TBD',
];

const SERVICE_TYPES: PermitRequest['serviceType'][] = ['OVERFLIGHT', 'LANDING'];

export default function PermitRequests({ legId, country }: { legId: string; country: string | null }) {
  const [requests, setRequests] = useState<PermitRequest[]>([]);
  const [clearanceDrafts, setClearanceDrafts] = useState<Record<string, string>>({});
  const [requesting, setRequesting] = useState(false);
  const [serviceType, setServiceType] = useState<PermitRequest['serviceType']>('OVERFLIGHT');
  const [candidate, setCandidate] = useState<CompatibleCandidate | null>(null);

  function refresh() {
    const token = localStorage.getItem('uaa_token');
    if (!token) return Promise.resolve();
    return listPermitRequests(token, legId)
      .then(setRequests)
      .catch(() => setRequests([]));
  }

  useEffect(() => {
    refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [legId]);

  async function handleRequest() {
    const token = localStorage.getItem('uaa_token');
    if (!token || !country) return;
    setRequesting(true);
    try {
      const found = await checkCompatiblePermitRequest(token, legId, country, serviceType);
      if (found) {
        setCandidate(found);
      } else {
        await createPermitRequest(token, legId, country, serviceType);
        await refresh();
      }
    } finally {
      setRequesting(false);
    }
  }

  async function handleMergeConfirm() {
    const token = localStorage.getItem('uaa_token');
    if (!token || !candidate) return;
    await mergePermitRequest(token, legId, candidate.requirementId);
    setCandidate(null);
    await refresh();
  }

  async function handleCreateSeparate() {
    const token = localStorage.getItem('uaa_token');
    if (!token || !country) return;
    await createPermitRequest(token, legId, country, serviceType);
    setCandidate(null);
    await refresh();
  }

  async function handleConfirm(id: string) {
    const token = localStorage.getItem('uaa_token');
    if (!token) return;
    await updatePermitRequest(token, id, { status: 'CONFIRMED', clearanceNumber: clearanceDrafts[id] ?? '' });
    await refresh();
  }

  async function handleResponsibilityChange(id: string, responsibility: PermitRequest['responsibility']) {
    const token = localStorage.getItem('uaa_token');
    if (!token) return;
    await updatePermitRequest(token, id, { responsibility });
    await refresh();
  }

  return (
    <fieldset className="permits-section">
      <legend>Permits</legend>

      {country && !candidate && (
        <div className="permit-request-form">
          <label htmlFor="service-type-select" className="sr-only">
            Permit Type
          </label>
          <select
            id="service-type-select"
            value={serviceType}
            onChange={(e) => setServiceType(e.target.value as PermitRequest['serviceType'])}
          >
            {SERVICE_TYPES.map((t) => (
              <option key={t} value={t}>
                {t}
              </option>
            ))}
          </select>
          <button type="button" className="btn-primary" onClick={handleRequest} disabled={requesting}>
            {requesting ? 'Checking…' : `Request Permit — ${country}`}
          </button>
        </div>
      )}

      {candidate && (
        <div className="permit-merge-confirm">
          <p>
            A {serviceType} request for {country} already exists for this trip (covers leg
            {candidate.legIds.length > 1 ? 's' : ''} {candidate.legIds.join(', ')}).
          </p>
          <button type="button" className="btn-primary" onClick={handleMergeConfirm}>
            Merge into it
          </button>
          <button type="button" className="btn-link" onClick={handleCreateSeparate}>
            Create separate request
          </button>
        </div>
      )}

      <table className="legs-table permits-table">
        <thead>
          <tr>
            <th>Country</th>
            <th>Type</th>
            <th>Status</th>
            <th>Responsibility</th>
            <th>Legs</th>
            <th>Clearance No</th>
            <th />
          </tr>
        </thead>
        <tbody>
          {requests.map((r) => (
            <tr key={r.id}>
              <td>{r.country}</td>
              <td>{r.serviceType}</td>
              <td>{r.status}</td>
              <td>
                <label htmlFor={`responsibility-${r.id}`} className="sr-only">
                  Responsibility
                </label>
                <select
                  id={`responsibility-${r.id}`}
                  value={r.responsibility}
                  onChange={(e) => handleResponsibilityChange(r.id, e.target.value as PermitRequest['responsibility'])}
                >
                  {RESPONSIBILITIES.map((value) => (
                    <option key={value} value={value}>
                      {value.replace(/_/g, ' ')}
                    </option>
                  ))}
                </select>
              </td>
              <td className="col-muted">{r.legIds.length > 1 ? `${r.legIds.length} legs` : '—'}</td>
              <td>
                {r.status === 'CONFIRMED' ? (
                  r.clearanceNumber
                ) : (
                  <>
                    <label htmlFor={`clearance-${r.id}`} className="sr-only">
                      Clearance Number
                    </label>
                    <input
                      id={`clearance-${r.id}`}
                      value={clearanceDrafts[r.id] ?? ''}
                      onChange={(e) => setClearanceDrafts((prev) => ({ ...prev, [r.id]: e.target.value }))}
                    />
                  </>
                )}
              </td>
              <td>
                {r.status !== 'CONFIRMED' && (
                  <button type="button" className="btn-link" onClick={() => handleConfirm(r.id)}>
                    Mark Confirmed
                  </button>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </fieldset>
  );
}
