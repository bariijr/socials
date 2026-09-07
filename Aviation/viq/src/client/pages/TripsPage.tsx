import { useEffect, useState } from 'react';
import { getTripsPaginated, formatDate } from '@/lib/dataStore';
import type { Trip, Leg } from '@/data/types';
import { Card, CardContent } from '@/components/ui/card';
import { StatusBadge } from '@/components/StatusBadge';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Plane, Search, LayoutGrid, List, Grid2X2, Grid3X3 } from 'lucide-react';
import { Link } from 'react-router';

type PagedTrip = Trip & { Legs: Leg[]; Counts: { Stops: number; Services: number; Comms: number } };

const PAGE_SIZE = 24;

type ViewMode = 'tile' | 'details' | 'large' | 'small';
const VIEW_MODE_KEY = 'viq_trips_view_mode';
const VIEW_MODES: { mode: ViewMode; label: string; icon: typeof LayoutGrid }[] = [
  { mode: 'tile', label: 'Tile', icon: LayoutGrid },
  { mode: 'large', label: 'Large Icons', icon: Grid2X2 },
  { mode: 'small', label: 'Small Icons', icon: Grid3X3 },
  { mode: 'details', label: 'Details', icon: List },
];

// The Tripno/Registration · Client/Operator · dates · counts · Owner/Origin
// card layout shared by Tile and Large-Icon views — only sizing differs
// between the two, so one component serves both rather than duplicating
// the markup.
function TripCard({ trip, size }: { trip: PagedTrip; size: 'tile' | 'large' }) {
  const legs = trip.Legs;
  const firstLeg = legs[0];
  const lastLeg = legs[legs.length - 1];
  const large = size === 'large';

  return (
    <Link to={`/trips/${trip.TripID}`} className="group">
      <Card className="h-full transition-shadow hover:shadow-md">
        <CardContent className={large ? 'p-6 space-y-2.5' : 'p-4 space-y-2'}>
          <div className="flex items-start justify-between gap-2">
            <div className={`flex items-baseline gap-2 ${large ? 'text-xl' : 'text-base'} font-bold`}>
              <span className="text-primary group-hover:underline">{trip.TripID}</span>
              <span className="text-muted-foreground font-normal">|</span>
              <span>{trip.Registration}</span>
            </div>
            <StatusBadge status={trip.Status} entityType="trip" />
          </div>

          <div className={`flex items-baseline gap-2 ${large ? 'text-sm' : 'text-xs'} text-muted-foreground`}>
            <span className="truncate">{trip.Client}</span>
            {trip.Operator && trip.Operator.trim().toLowerCase() !== trip.Client.trim().toLowerCase() && (
              <>
                <span>|</span>
                <span className="truncate">{trip.Operator}</span>
              </>
            )}
          </div>

          {firstLeg && lastLeg && (
            <div className={large ? 'text-sm' : 'text-xs'}>
              {formatDate(firstLeg.ETDZ)} – {formatDate(lastLeg.ETAZ)}
            </div>
          )}

          <div className={`flex flex-wrap items-center gap-x-3 gap-y-1 ${large ? 'text-xs' : 'text-[11px]'} text-muted-foreground`}>
            <span>{legs.length} Leg{legs.length === 1 ? '' : 's'}, {trip.Counts.Stops} Stop{trip.Counts.Stops === 1 ? '' : 's'}</span>
            <span>{trip.Counts.Services} services</span>
            <span>{trip.Counts.Comms} comms</span>
          </div>

          <div className={`${large ? 'text-xs' : 'text-[11px]'} text-muted-foreground`}>
            Owner: {trip.Owner || '—'}{firstLeg && <span> · Origin: {firstLeg.DepICAO}</span>}
          </div>
        </CardContent>
      </Card>
    </Link>
  );
}

function SmallIconCard({ trip }: { trip: PagedTrip }) {
  return (
    <Link to={`/trips/${trip.TripID}`} className="group">
      <Card className="transition-shadow hover:shadow-md">
        <CardContent className="p-3 space-y-1">
          <div className="flex items-center justify-between gap-1">
            <Plane className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
            <StatusBadge status={trip.Status} entityType="trip" className="text-[9px] px-1.5 py-0 h-4" />
          </div>
          <div className="text-sm font-bold text-primary group-hover:underline truncate">{trip.TripID}</div>
          <div className="text-xs text-muted-foreground truncate">{trip.Registration} · {trip.Client}</div>
        </CardContent>
      </Card>
    </Link>
  );
}

export default function TripsPage() {
  const [trips, setTrips] = useState<PagedTrip[]>([]);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [total, setTotal] = useState(0);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [viewMode, setViewMode] = useState<ViewMode>(() => {
    try { return (localStorage.getItem(VIEW_MODE_KEY) as ViewMode) || 'tile'; } catch { return 'tile'; }
  });

  const changeViewMode = (mode: ViewMode) => {
    setViewMode(mode);
    try { localStorage.setItem(VIEW_MODE_KEY, mode); } catch { /* private-browsing / storage blocked — view choice just won't persist */ }
  };

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    getTripsPaginated(page, PAGE_SIZE, search.trim() || undefined)
      .then((res) => {
        if (cancelled) return;
        setTrips(res.data);
        setTotalPages(res.totalPages);
        setTotal(res.total);
        setLoading(false);
      })
      .catch((e) => { if (!cancelled) { setError(e.message); setLoading(false); } });
    return () => { cancelled = true; };
  }, [page, search]);

  // Reset to page 1 whenever the search term changes, so a new search
  // doesn't land on a now-out-of-range page from the previous result set.
  useEffect(() => { setPage(1); }, [search]);

  if (error) return <p className="p-4 text-sm text-destructive">Error: {error}</p>;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Trips</h1>
          <p className="text-muted-foreground">All trips — click a card or row to view full trip sheet</p>
        </div>
        <div className="flex items-center gap-3">
          <div className="relative w-64">
            <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search trip ID, client, registration…"
              className="pl-8"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
          <div className="flex items-center rounded-md border p-0.5">
            {VIEW_MODES.map(({ mode, label, icon: Icon }) => (
              <Button
                key={mode}
                type="button"
                size="icon-sm"
                variant={viewMode === mode ? 'default' : 'ghost'}
                title={label}
                aria-label={label}
                onClick={() => changeViewMode(mode)}
              >
                <Icon className="h-4 w-4" />
              </Button>
            ))}
          </div>
        </div>
      </div>

      {loading ? (
        <p className="text-sm text-muted-foreground">Loading…</p>
      ) : (
        <>
          {trips.length === 0 ? (
            <div className="text-center text-sm text-muted-foreground py-8">
              {search.trim() ? 'No trips match your search' : 'No trips yet'}
            </div>
          ) : viewMode === 'tile' ? (
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {trips.map((trip) => <TripCard key={trip.TripID} trip={trip} size="tile" />)}
            </div>
          ) : viewMode === 'large' ? (
            <div className="grid gap-4 lg:grid-cols-2">
              {trips.map((trip) => <TripCard key={trip.TripID} trip={trip} size="large" />)}
            </div>
          ) : viewMode === 'small' ? (
            <div className="grid gap-3 grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6">
              {trips.map((trip) => <SmallIconCard key={trip.TripID} trip={trip} />)}
            </div>
          ) : (
            <Card>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Trip ID</TableHead>
                    <TableHead>Client</TableHead>
                    <TableHead>Operator</TableHead>
                    <TableHead>Registration</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Owner</TableHead>
                    <TableHead>Dates</TableHead>
                    <TableHead>Legs/Stops</TableHead>
                    <TableHead>Services</TableHead>
                    <TableHead>Comms</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {trips.map((trip) => {
                    const legs = trip.Legs;
                    const firstLeg = legs[0];
                    const lastLeg = legs[legs.length - 1];
                    return (
                      <TableRow key={trip.TripID} className="cursor-pointer hover:bg-muted/50">
                        <TableCell>
                          <Link to={`/trips/${trip.TripID}`} className="font-bold text-primary hover:underline">{trip.TripID}</Link>
                        </TableCell>
                        <TableCell>{trip.Client}</TableCell>
                        <TableCell>{trip.Operator || '—'}</TableCell>
                        <TableCell>{trip.Registration}</TableCell>
                        <TableCell>
                          <StatusBadge status={trip.Status} entityType="trip" />
                        </TableCell>
                        <TableCell>{trip.Owner}</TableCell>
                        <TableCell className="text-xs text-muted-foreground">
                          {firstLeg && lastLeg ? `${formatDate(firstLeg.ETDZ)} – ${formatDate(lastLeg.ETAZ)}` : '—'}
                        </TableCell>
                        <TableCell>{legs.length} / {trip.Counts.Stops}</TableCell>
                        <TableCell>{trip.Counts.Services}</TableCell>
                        <TableCell>{trip.Counts.Comms}</TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </Card>
          )}

          <div className="flex items-center justify-between text-sm text-muted-foreground">
            <span>Showing page {page} of {totalPages} ({total} trips total)</span>
            <div className="flex gap-2">
              <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>Previous</Button>
              <Button variant="outline" size="sm" disabled={page >= totalPages} onClick={() => setPage((p) => p + 1)}>Next</Button>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
