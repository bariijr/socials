'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { getTrip, type TripWorkspace } from '@/lib/api-client';

function formatDateTime(value: string | null): string {
  if (!value) return '—';
  return new Date(value).toLocaleString(undefined, {
    year: 'numeric',
    month: 'short',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export default function TripWorkspacePage() {
  const { tripNo } = useParams<{ tripNo: string }>();
  const [trip, setTrip] = useState<TripWorkspace | null>(null);
  const router = useRouter();

  useEffect(() => {
    const token = localStorage.getItem('uaa_token');
    if (!token) {
      router.replace('/login');
      return;
    }
    getTrip(token, tripNo)
      .then(setTrip)
      .catch(() => router.replace('/legs'));
  }, [tripNo, router]);

  if (!trip) return null;

  return (
    <div className="board-shell">
      <div className="board-header">
        <h1 className="board-title">UAA Coordinator — Trip {trip.tripNo}</h1>
        <div className="board-header-right">
          <span className={`trip-status-badge trip-status-${trip.status.toLowerCase()}`}>{trip.status}</span>
          <a className="btn-link" href="/legs">
            Back to legs
          </a>
        </div>
      </div>
      <div className="runway-rule" />

      <div className="leg-detail-summary">
        <div>
          <span className="col-muted">Tail{trip.tails.length === 1 ? '' : 's'}</span>
          <span className="col-mono">{trip.tails.join(', ') || '—'}</span>
        </div>
        <div>
          <span className="col-muted">Operator</span>
          <span>{trip.operatorNames.join(', ') || '—'}</span>
        </div>
        <div>
          <span className="col-muted">Countries</span>
          <span>{trip.countries.join(', ') || '—'}</span>
        </div>
        <div>
          <span className="col-muted">Legs</span>
          <span className="col-mono">{trip.legCount}</span>
        </div>
        <div>
          <span className="col-muted">First Departure</span>
          <span className="col-mono">{formatDateTime(trip.firstDeparture)}</span>
        </div>
        <div>
          <span className="col-muted">Last Arrival</span>
          <span className="col-mono">{formatDateTime(trip.lastArrival)}</span>
        </div>
      </div>

      <div className="board-table-wrap">
        <table className="legs-table">
          <thead>
            <tr>
              <th>Leg</th>
              <th>ICAO</th>
              <th>Tail</th>
              <th>Arrival</th>
              <th>Departure</th>
              <th>Status</th>
            </tr>
          </thead>
          <tbody>
            {trip.legs.map((leg) => (
              <tr key={leg.id}>
                <td className="col-mono">
                  <a href={`/legs/${leg.id}`}>{leg.legId}</a>
                </td>
                <td className="col-mono">{leg.icao}</td>
                <td className="col-mono">{leg.tail}</td>
                <td className="col-mono">{formatDateTime(leg.arrDate)}</td>
                <td className="col-mono">{formatDateTime(leg.depDate)}</td>
                <td>{leg.completedAt ? <span className="completed-badge">Completed</span> : null}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
