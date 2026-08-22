'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { getLegs, type Leg } from '@/lib/api-client';

export default function LegsPage() {
  const [legs, setLegs] = useState<Leg[]>([]);
  const router = useRouter();

  useEffect(() => {
    const token = localStorage.getItem('uaa_token');
    if (!token) {
      router.replace('/login');
      return;
    }
    getLegs(token)
      .then(setLegs)
      .catch(() => {
        localStorage.removeItem('uaa_token');
        router.replace('/login');
      });
  }, [router]);

  function handleSignOut() {
    localStorage.removeItem('uaa_token');
    router.replace('/login');
  }

  return (
    <div className="board-shell">
      <div className="board-header">
        <h1 className="board-title">UAA Coordinator — Legs</h1>
        <div className="board-header-right">
          <span className="board-count">{legs.length} leg{legs.length === 1 ? '' : 's'}</span>
          <a className="btn-link" href="/legs/new">
            + New leg
          </a>
          <button type="button" className="btn-link" onClick={handleSignOut}>
            Sign out
          </button>
        </div>
      </div>
      <div className="runway-rule" />
      <div className="board-table-wrap">
        <table className="legs-table">
          <thead>
            <tr>
              <th>Trip No</th>
              <th>ICAO</th>
              <th>Tail</th>
              <th>Country</th>
            </tr>
          </thead>
          <tbody>
            {legs.map((leg) => (
              <tr key={leg.id}>
                <td className="col-mono">
                  <a href={`/legs/${leg.id}`}>{leg.tripNo}</a>
                </td>
                <td className="col-mono">{leg.icao}</td>
                <td className="col-mono">{leg.tail}</td>
                <td className="col-muted">{leg.country}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
