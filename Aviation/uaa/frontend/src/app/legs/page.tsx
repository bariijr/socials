'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { getLegs, type Leg } from '@/lib/api-client';

type SortKey = 'tripNo' | 'icao' | 'tail' | 'country' | 'arrDate' | 'depDate';
type SortDir = 'asc' | 'desc';

function formatDateTime(value: string | null | undefined): string {
  if (!value) return '—';
  return new Date(value).toLocaleString(undefined, {
    year: 'numeric',
    month: 'short',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function compareValues(a: Leg, b: Leg, key: SortKey): number {
  const av = a[key] as string | null;
  const bv = b[key] as string | null;
  if (av == null && bv == null) return 0;
  if (av == null) return -1;
  if (bv == null) return 1;
  if (key === 'arrDate' || key === 'depDate') {
    return new Date(av).getTime() - new Date(bv).getTime();
  }
  return av.localeCompare(bv);
}

export default function LegsPage() {
  const [legs, setLegs] = useState<Leg[]>([]);
  const [search, setSearch] = useState('');
  const [countryFilter, setCountryFilter] = useState('');
  const [sortKey, setSortKey] = useState<SortKey>('tripNo');
  const [sortDir, setSortDir] = useState<SortDir>('asc');
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

  function handleSort(key: SortKey) {
    if (key === sortKey) {
      setSortDir((prev) => (prev === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortKey(key);
      setSortDir('asc');
    }
  }

  const countries = useMemo(
    () => Array.from(new Set(legs.map((leg) => leg.country).filter((c): c is string => !!c))).sort(),
    [legs],
  );

  const visibleLegs = useMemo(() => {
    const term = search.trim().toLowerCase();
    const filtered = legs.filter((leg) => {
      if (countryFilter && leg.country !== countryFilter) return false;
      if (!term) return true;
      return [leg.tripNo, leg.icao, leg.tail, leg.country, leg.agentName]
        .filter(Boolean)
        .some((field) => String(field).toLowerCase().includes(term));
    });
    const sorted = [...filtered].sort((a, b) => compareValues(a, b, sortKey));
    return sortDir === 'asc' ? sorted : sorted.reverse();
  }, [legs, search, countryFilter, sortKey, sortDir]);

  function sortIndicator(key: SortKey) {
    if (key !== sortKey) return '';
    return sortDir === 'asc' ? ' ▲' : ' ▼';
  }

  return (
    <div className="board-shell">
      <div className="board-header">
        <h1 className="board-title">UAA Coordinator — Legs</h1>
        <div className="board-header-right">
          <span className="board-count">
            {visibleLegs.length} of {legs.length} leg{legs.length === 1 ? '' : 's'}
          </span>
          <a className="btn-link" href="/action-board">
            Action board
          </a>
          <a className="btn-link" href="/legs/new">
            + New leg
          </a>
          <button type="button" className="btn-link" onClick={handleSignOut}>
            Sign out
          </button>
        </div>
      </div>
      <div className="runway-rule" />

      <div className="legs-filter-toolbar">
        <label htmlFor="legs-search" className="sr-only">
          Search legs
        </label>
        <input
          id="legs-search"
          className="legs-search"
          placeholder="Search trip no, tail, ICAO, country, agent…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        <label htmlFor="legs-country-filter">Filter by country</label>
        <select id="legs-country-filter" value={countryFilter} onChange={(e) => setCountryFilter(e.target.value)}>
          <option value="">All countries</option>
          {countries.map((country) => (
            <option key={country} value={country}>
              {country}
            </option>
          ))}
        </select>
      </div>

      <div className="board-table-wrap">
        <table className="legs-table">
          <thead>
            <tr>
              <th className="sortable" onClick={() => handleSort('tripNo')}>
                Trip No{sortIndicator('tripNo')}
              </th>
              <th className="sortable" onClick={() => handleSort('icao')}>
                ICAO{sortIndicator('icao')}
              </th>
              <th className="sortable" onClick={() => handleSort('tail')}>
                Tail{sortIndicator('tail')}
              </th>
              <th className="sortable" onClick={() => handleSort('country')}>
                Country{sortIndicator('country')}
              </th>
              <th className="sortable" onClick={() => handleSort('arrDate')}>
                Arrival{sortIndicator('arrDate')}
              </th>
              <th className="sortable" onClick={() => handleSort('depDate')}>
                Departure{sortIndicator('depDate')}
              </th>
            </tr>
          </thead>
          <tbody>
            {visibleLegs.map((leg) => (
              <tr key={leg.id}>
                <td className="col-mono">
                  <a href={`/legs/${leg.id}`}>{leg.tripNo}</a>
                </td>
                <td className="col-mono">{leg.icao}</td>
                <td className="col-mono">{leg.tail}</td>
                <td className="col-muted">{leg.country}</td>
                <td className="col-mono">{formatDateTime(leg.arrDate)}</td>
                <td className="col-mono">{formatDateTime(leg.depDate)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
