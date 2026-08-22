'use client';

import { useEffect, useState } from 'react';
import { getLegs, type Leg } from '@/lib/api-client';

export default function LegsPage() {
  const [legs, setLegs] = useState<Leg[]>([]);

  useEffect(() => {
    const token = localStorage.getItem('uaa_token');
    if (!token) return;
    getLegs(token).then(setLegs).catch(() => setLegs([]));
  }, []);

  return (
    <table>
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
            <td>{leg.tripNo}</td>
            <td>{leg.icao}</td>
            <td>{leg.tail}</td>
            <td>{leg.country}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
