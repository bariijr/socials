import { useEffect, useMemo, useState } from 'react';
import { getTrips, getServices, getUpcomingLegs, getOpenServicesWidget, closeService, formatZ, urgencyColor, statusColor, serviceCountryName } from '@/lib/dataStore';
import type { Trip, Service, Leg } from '@/data/types';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Link } from 'react-router';
import { Plane, AlertTriangle, Clock, TrendingUp, Search, X } from 'lucide-react';

const WIDGET_LIMIT = 8;

type UpcomingLeg = Leg & { Trip: { TripID: string; Registration: string; Status: string } };
type OpenService = Service & { Trip: { TripID: string; Registration: string } };

export default function Dashboard() {
  const [trips, setTrips] = useState<Trip[]>([]);
  const [services, setServices] = useState<Service[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [departuresSearch, setDeparturesSearch] = useState('');
  const [upcomingLegs, setUpcomingLegs] = useState<UpcomingLeg[]>([]);
  const [departuresLoading, setDeparturesLoading] = useState(true);

  const [servicesSearch, setServicesSearch] = useState('');
  const [openServices, setOpenServices] = useState<OpenService[]>([]);
  const [servicesLoading, setServicesLoading] = useState(true);
  const [closingId, setClosingId] = useState<string | null>(null);

  // Stat-card data — unchanged full-fetch, needed for true aggregate totals.
  useEffect(() => {
    let cancelled = false;
    Promise.all([getTrips(), getServices()])
      .then(([t, s]) => { if (!cancelled) { setTrips(t); setServices(s); setLoading(false); } })
      .catch((e) => { if (!cancelled) { setError(e.message); setLoading(false); } });
    return () => { cancelled = true; };
  }, []);

  // Upcoming Departures card — its own search + widget fetch.
  useEffect(() => {
    let cancelled = false;
    setDeparturesLoading(true);
    getUpcomingLegs(WIDGET_LIMIT, departuresSearch.trim() || undefined)
      .then((legs) => { if (!cancelled) { setUpcomingLegs(legs); setDeparturesLoading(false); } })
      .catch(() => { if (!cancelled) setDeparturesLoading(false); });
    return () => { cancelled = true; };
  }, [departuresSearch]);

  // Open Services card — its own search + widget fetch. Re-fetches after a
  // close action too, via the `reloadServicesToken` bump below.
  const [reloadServicesToken, setReloadServicesToken] = useState(0);
  useEffect(() => {
    let cancelled = false;
    setServicesLoading(true);
    getOpenServicesWidget(WIDGET_LIMIT, servicesSearch.trim() || undefined)
      .then((svcs) => { if (!cancelled) { setOpenServices(svcs); setServicesLoading(false); } })
      .catch(() => { if (!cancelled) setServicesLoading(false); });
    return () => { cancelled = true; };
  }, [servicesSearch, reloadServicesToken]);

  const stats = useMemo(() => {
    const totalTrips = trips.length;
    const activeTrips = trips.filter(t => t.Status === 'Active').length;
    const openServicesCount = services.filter(s => s.Status !== 'Confirmed' && s.Status !== 'Not Required').length;
    const urgent = services.filter(s => s.Urgency === 'URGENT' || s.Urgency === 'BREACH').length;
    return { totalTrips, activeTrips, openServices: openServicesCount, urgent };
  }, [trips, services]);

  async function handleClose(svcId: string, version: number) {
    setClosingId(svcId);
    try {
      await closeService(svcId, version);
      setReloadServicesToken((n) => n + 1);
    } finally {
      setClosingId(null);
    }
  }

  if (loading) return <p className="p-4 text-sm text-muted-foreground">Loading…</p>;
  if (error) return <p className="p-4 text-sm text-destructive">Error: {error}</p>;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">ACTION BOARD</h1>
        <p className="text-muted-foreground">OPERATIONS OVERVIEW</p>
      </div>

      <div className="grid gap-4 md:grid-cols-4">
        <Card><CardContent className="p-4"><div className="flex items-center justify-between"><div><p className="text-xs text-muted-foreground">TOTAL TRIPS</p><p className="text-2xl font-bold">{stats.totalTrips}</p></div><Plane className="h-6 w-6 text-blue-600" /></div></CardContent></Card>
        <Card><CardContent className="p-4"><div className="flex items-center justify-between"><div><p className="text-xs text-muted-foreground">ACTIVE</p><p className="text-2xl font-bold">{stats.activeTrips}</p></div><TrendingUp className="h-6 w-6 text-emerald-600" /></div></CardContent></Card>
        <Card><CardContent className="p-4"><div className="flex items-center justify-between"><div><p className="text-xs text-muted-foreground">OPEN SERVICES</p><p className="text-2xl font-bold">{stats.openServices}</p></div><Clock className="h-6 w-6 text-amber-600" /></div></CardContent></Card>
        <Card><CardContent className="p-4"><div className="flex items-center justify-between"><div><p className="text-xs text-muted-foreground">URGENT</p><p className="text-2xl font-bold">{stats.urgent}</p></div><AlertTriangle className="h-6 w-6 text-red-600" /></div></CardContent></Card>
      </div>

      <div className="grid gap-6 md:grid-cols-2">
        <Card>
          <CardHeader className="space-y-2">
            <CardTitle className="text-base">UPCOMING DEPARTURES</CardTitle>
            <div className="relative">
              <Search className="absolute left-2.5 top-2.5 h-3.5 w-3.5 text-muted-foreground" />
              <Input
                placeholder="Search trip, registration, route…"
                className="h-8 pl-8 text-sm"
                value={departuresSearch}
                onChange={(e) => setDeparturesSearch(e.target.value)}
              />
            </div>
          </CardHeader>
          <CardContent className="space-y-3">
            {departuresLoading ? (
              <p className="text-xs text-muted-foreground">Loading…</p>
            ) : upcomingLegs.length === 0 ? (
              <p className="text-xs text-muted-foreground">
                {departuresSearch.trim() ? 'No matching upcoming departures.' : 'No upcoming departures.'}
              </p>
            ) : (
              upcomingLegs.map(leg => (
                <Link key={leg.LegID} to={`/trips/${leg.Trip.TripID}`} className="flex items-center justify-between rounded-lg border p-3 hover:bg-accent/50 transition-colors">
                  <div>
                    <div className="font-bold text-sm">{leg.Trip.TripID} — {leg.Trip.Registration}</div>
                    <div className="text-xs text-muted-foreground">{leg.DepICAO} → {leg.ArrICAO}</div>
                  </div>
                  <div className="text-right">
                    <div className="text-sm font-medium">{formatZ(leg.ETDZ)}</div>
                    <Badge variant="outline" className="text-[9px]">{leg.Trip.Status}</Badge>
                  </div>
                </Link>
              ))
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="space-y-2">
            <CardTitle className="text-base">OPEN SERVICES</CardTitle>
            <div className="relative">
              <Search className="absolute left-2.5 top-2.5 h-3.5 w-3.5 text-muted-foreground" />
              <Input
                placeholder="Search service, trip…"
                className="h-8 pl-8 text-sm"
                value={servicesSearch}
                onChange={(e) => setServicesSearch(e.target.value)}
              />
            </div>
          </CardHeader>
          <CardContent className="space-y-2">
            {servicesLoading ? (
              <p className="text-xs text-muted-foreground">Loading…</p>
            ) : openServices.length === 0 ? (
              <p className="text-xs text-muted-foreground">
                {servicesSearch.trim() ? 'No matching open services.' : 'No open services — all clear.'}
              </p>
            ) : (
              openServices.map(svc => {
                const country = serviceCountryName(svc);
                return (
                  <div key={svc.SVCID} className="flex items-center justify-between gap-2 rounded-md border p-2 text-xs hover:bg-accent/50 transition-colors">
                    <Link to={`/trips/${svc.TripID}`} className="flex-1 min-w-0">
                      <span className="font-medium">{svc.ServiceType}</span>
                      <span className="text-muted-foreground ml-2">{svc.Trip.TripID}</span>
                      {country && <span className="text-muted-foreground ml-2">{country}</span>}
                      <div className="flex items-center gap-2 mt-0.5">
                        <span className="text-muted-foreground">{formatZ(svc.RequiredByZ)}</span>
                        <Badge variant="outline" className={`text-[9px] ${urgencyColor(svc.Urgency)}`}>{svc.Urgency}</Badge>
                        <Badge variant="secondary" className={`text-[9px] ${statusColor(svc.Status)}`}>{svc.Status}</Badge>
                      </div>
                    </Link>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-6 px-2 text-[10px] shrink-0"
                      disabled={closingId === svc.SVCID}
                      onClick={(e) => { e.preventDefault(); handleClose(svc.SVCID, svc.Version); }}
                      title="Mark as Not Required"
                    >
                      <X className="h-3 w-3 mr-1" />
                      {closingId === svc.SVCID ? 'Closing…' : 'Close'}
                    </Button>
                  </div>
                );
              })
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
