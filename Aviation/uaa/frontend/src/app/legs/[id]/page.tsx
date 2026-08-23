'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { getLeg, markLegComplete, type Leg } from '@/lib/api-client';
import PermitRequests from './permit-requests';
import Notifications from './notifications';

export default function LegDetailPage() {
  const { id } = useParams<{ id: string }>();
  const [leg, setLeg] = useState<Leg | null>(null);
  const [completing, setCompleting] = useState(false);
  const router = useRouter();

  useEffect(() => {
    const token = localStorage.getItem('uaa_token');
    if (!token) {
      router.replace('/login');
      return;
    }
    getLeg(token, id)
      .then(setLeg)
      .catch(() => router.replace('/legs'));
  }, [id, router]);

  async function handleMarkComplete() {
    const token = localStorage.getItem('uaa_token');
    if (!token || !leg) return;
    setCompleting(true);
    try {
      const updated = await markLegComplete(token, leg.id);
      setLeg(updated);
    } finally {
      setCompleting(false);
    }
  }

  if (!leg) return null;

  return (
    <div className="board-shell">
      <div className="board-header">
        <h1 className="board-title">
          UAA Coordinator — Trip {leg.tripNo}
        </h1>
        <div className="board-header-right">
          <a className="btn-link" href={`/trips/${leg.tripNo}`}>
            Trip {leg.tripNo}
          </a>
          {leg.completedAt ? (
            <span className="completed-badge">Completed {new Date(leg.completedAt).toLocaleDateString()}</span>
          ) : (
            <button type="button" className="btn-link" onClick={handleMarkComplete} disabled={completing}>
              {completing ? 'Marking…' : 'Mark Complete'}
            </button>
          )}
          <a className="btn-link" href="/legs">
            Back to legs
          </a>
        </div>
      </div>
      <div className="runway-rule" />

      <div className="leg-detail-summary">
        <div>
          <span className="col-muted">ICAO</span>
          <span className="col-mono">{leg.icao}</span>
        </div>
        <div>
          <span className="col-muted">Tail</span>
          <span className="col-mono">{leg.tail}</span>
        </div>
        <div>
          <span className="col-muted">Country</span>
          <span>{leg.country}</span>
        </div>
      </div>

      <PermitRequests legId={leg.id} country={leg.country} />
      <Notifications legId={leg.id} />
    </div>
  );
}
