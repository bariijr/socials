'use client';

import { useEffect, useState } from 'react';
import { createPermitRequest, listPermitRequests, updatePermitRequest, type PermitRequest } from '@/lib/api-client';

export default function PermitRequests({ legId, country }: { legId: string; country: string | null }) {
  const [requests, setRequests] = useState<PermitRequest[]>([]);
  const [clearanceDrafts, setClearanceDrafts] = useState<Record<string, string>>({});
  const [requesting, setRequesting] = useState(false);

  function refresh() {
    const token = localStorage.getItem('uaa_token');
    if (!token) return Promise.resolve();
    return listPermitRequests(token, legId).then(setRequests);
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
      await createPermitRequest(token, legId, country);
      await refresh();
    } finally {
      setRequesting(false);
    }
  }

  async function handleConfirm(id: string) {
    const token = localStorage.getItem('uaa_token');
    if (!token) return;
    await updatePermitRequest(token, id, { status: 'CONFIRMED', clearanceNumber: clearanceDrafts[id] ?? '' });
    await refresh();
  }

  return (
    <fieldset className="permits-section">
      <legend>Permits</legend>

      {country && (
        <button type="button" className="btn-primary" onClick={handleRequest} disabled={requesting}>
          {requesting ? 'Requesting…' : `Request Permit — ${country}`}
        </button>
      )}

      <table className="legs-table permits-table">
        <thead>
          <tr>
            <th>Country</th>
            <th>Status</th>
            <th>Clearance No</th>
            <th />
          </tr>
        </thead>
        <tbody>
          {requests.map((r) => (
            <tr key={r.id}>
              <td>{r.country}</td>
              <td>{r.status}</td>
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
