'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { listAllPermitRequests, type PermitRequestWithUrgency } from '@/lib/api-client';

const URGENCY_ORDER: Record<PermitRequestWithUrgency['urgency'], number> = {
  BREACH: 0,
  URGENT: 1,
  DUE: 2,
  OK: 3,
};

function sortKey(r: PermitRequestWithUrgency): number {
  if (r.status === 'RECONFIRM_REQUIRED') return -1;
  return URGENCY_ORDER[r.urgency];
}

export default function ActionBoardPage() {
  const [requests, setRequests] = useState<PermitRequestWithUrgency[]>([]);
  const router = useRouter();

  useEffect(() => {
    const token = localStorage.getItem('uaa_token');
    if (!token) {
      router.replace('/login');
      return;
    }
    listAllPermitRequests(token)
      .then(setRequests)
      .catch(() => setRequests([]));
  }, [router]);

  const sorted = [...requests].sort((a, b) => sortKey(a) - sortKey(b));

  return (
    <div className="board-shell">
      <div className="board-header">
        <h1 className="board-title">UAA Coordinator — Action Board</h1>
        <a className="btn-link" href="/legs">
          Back to legs
        </a>
      </div>
      <div className="runway-rule" />
      <div className="board-table-wrap">
        <table className="legs-table">
          <thead>
            <tr>
              <th>Trip No</th>
              <th>ICAO</th>
              <th>Country</th>
              <th>Status</th>
              <th>Urgency</th>
            </tr>
          </thead>
          <tbody>
            {sorted.map((r) => (
              <tr key={r.id}>
                <td className="col-mono">
                  <a href={`/legs/${r.legId}`}>{r.legSummary?.tripNo ?? r.legId}</a>
                </td>
                <td className="col-mono">{r.legSummary?.icao}</td>
                <td>{r.country}</td>
                <td>{r.status}</td>
                <td>
                  <span className={`urgency-badge urgency-${r.urgency.toLowerCase()}`}>{r.urgency}</span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
