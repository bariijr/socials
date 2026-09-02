import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router';
import { getTrips, getServices, getLegs, getRosterExpiryStatuses, urgencyRank, serviceCountryName } from '@/lib/dataStore';
import type { RosterExpiryEntry } from '@/lib/dataStore';
import type { Trip, Leg, Service } from '@/data/types';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { ExpiryBadge } from '@/components/ExpiryBadge';
import {
  AlertTriangle, CheckCircle2, Clock, FileText, Plane,
  Users, Mail, TrendingUp
} from 'lucide-react';

// Same ranking as expiry.ts's internal SEVERITY — kept local since it's
// only needed here to sort the top-N, not to decide a badge's tone.
const ISSUE_WEIGHT: Record<string, number> = { expired: 3, missing: 3, soon: 2 };

const NOW_Z = '2026-08-15T12:00:00Z';

export default function AdminDashboard() {
  const [trips, setTrips] = useState<Trip[]>([]);
  const [services, setServices] = useState<Service[]>([]);
  const [legs, setLegs] = useState<Leg[]>([]);
  const [expiryEntries, setExpiryEntries] = useState<RosterExpiryEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    Promise.all([getTrips(), getServices(), getLegs(), getRosterExpiryStatuses()])
      .then(([t, s, l, x]) => { if (!cancelled) { setTrips(t); setServices(s); setLegs(l); setExpiryEntries(x); setLoading(false); } })
      .catch((e) => { if (!cancelled) { setError(e.message); setLoading(false); } });
    return () => { cancelled = true; };
  }, []);

  const rosterAttention = useMemo(() => {
    return expiryEntries
      .filter((e) => e.status.issues.length > 0)
      .sort((a, b) => (ISSUE_WEIGHT[b.status.worstTone] || 0) - (ISSUE_WEIGHT[a.status.worstTone] || 0));
  }, [expiryEntries]);

  const urgentServices = useMemo(() => {
    return services
      .filter((s) => s.Urgency === 'URGENT' || s.Urgency === 'BREACH')
      .sort((a, b) => urgencyRank(b.Urgency) - urgencyRank(a.Urgency) || new Date(a.RequiredByZ).getTime() - new Date(b.RequiredByZ).getTime());
  }, [services]);

  const stats = useMemo(() => {
    const totalTrips = trips.length;
    const activeTrips = trips.filter((t) => t.Status === 'Active').length;
    const planningTrips = trips.filter((t) => t.Status === 'Planning').length;

    const openServices = services.filter(
      (s) => s.Status !== 'Confirmed' && s.Status !== 'Not Required' && s.Status !== 'Cancelled'
    );
    const urgentServices = services.filter((s) => s.Urgency === 'URGENT' || s.Urgency === 'BREACH');
    const chasingServices = services.filter((s) => s.Status === 'Chasing');

    const next72hLegs = legs.filter((l) => {
      const etd = new Date(l.ETDZ).getTime();
      const now = new Date(NOW_Z).getTime();
      const diff = etd - now;
      return diff >= 0 && diff <= 72 * 60 * 60 * 1000;
    });

    return {
      totalTrips,
      activeTrips,
      planningTrips,
      openServices: openServices.length,
      urgentServices: urgentServices.length,
      chasingServices: chasingServices.length,
      next72hLegs: next72hLegs.length,
    };
  }, [trips, services, legs]);

  if (loading) return <p className="p-4 text-sm text-muted-foreground">Loading…</p>;
  if (error) return <p className="p-4 text-sm text-destructive">Error: {error}</p>;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Admin Dashboard</h1>
        <p className="text-muted-foreground">Operations overview and drill-down</p>
      </div>

      {/* Stats Grid */}
      <div className="grid gap-4 md:grid-cols-4">
        <StatCard title="Total Trips" value={stats.totalTrips} icon={Plane} color="text-blue-600" />
        <StatCard title="Active" value={stats.activeTrips} icon={TrendingUp} color="text-emerald-600" />
        <StatCard title="Planning" value={stats.planningTrips} icon={Clock} color="text-amber-600" />
        <StatCard title="Next 72h Legs" value={stats.next72hLegs} icon={FileText} color="text-purple-600" />
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        <StatCard title="Open Services" value={stats.openServices} icon={Mail} color="text-slate-600" />
        <StatCard title="Urgent" value={stats.urgentServices} icon={AlertTriangle} color="text-red-600" />
        <StatCard title="Chasing" value={stats.chasingServices} icon={Users} color="text-orange-600" />
      </div>

      {/* Urgent Items */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base font-semibold flex items-center gap-2">
            <AlertTriangle className="h-4 w-4 text-red-600" />
            Urgent & Breached Services
          </CardTitle>
        </CardHeader>
        <CardContent>
          {urgentServices.length === 0 ? (
            <div className="flex items-center gap-2 text-sm text-emerald-600">
              <CheckCircle2 className="h-4 w-4" />
              No urgent or breached services — all clear
            </div>
          ) : (
            <div className="space-y-2">
              {urgentServices.map((s) => {
                  const trip = trips.find((t) => t.TripID === s.TripID);
                  const country = serviceCountryName(s);
                  return (
                    <Link key={s.SVCID} to={`/trips/${s.TripID}`} title={s.SVCID} className="flex items-center justify-between rounded-md border p-3 hover:bg-accent/50 transition-colors">
                      <div className="space-y-1">
                        <div className="flex items-center gap-2">
                          <Badge variant={s.Urgency === 'BREACH' ? 'destructive' : 'default'}>
                            {s.Urgency}
                          </Badge>
                          <span className="font-medium text-sm">{s.ServiceType}</span>
                        </div>
                        <div className="text-xs text-muted-foreground">
                          Trip: {trip?.TripID} — {trip?.Registration}{country && ` — ${country}`} — Assigned: {s.AssignedTo}
                        </div>
                      </div>
                      <div className="text-xs text-muted-foreground">
                        Required by {s.RequiredByZ.replace('T', ' ').replace('Z', '')}
                      </div>
                    </Link>
                  );
                })}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Open Services by Trip */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base font-semibold flex items-center gap-2">
            <Clock className="h-4 w-4 text-amber-600" />
            Open Services by Trip
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {trips.map((trip) => {
            const svcs = services.filter((s) => s.TripID === trip.TripID && s.Status !== 'Confirmed' && s.Status !== 'Not Required');
            if (svcs.length === 0) return null;
            return (
              <div key={trip.TripID} className="rounded-md border p-3">
                <div className="flex items-center justify-between mb-2">
                  <Link to={`/trips/${trip.TripID}`} className="font-medium text-sm hover:underline">{trip.TripID} — {trip.Registration}</Link>
                  <Badge variant="outline" className="text-xs">{svcs.length} open</Badge>
                </div>
                <div className="flex flex-wrap gap-1">
                  {svcs.map((s) => (
                    <Badge key={s.SVCID} variant="secondary" className="text-[10px]">
                      {s.ServiceType}: {s.Status}
                    </Badge>
                  ))}
                </div>
              </div>
            );
          })}
        </CardContent>
      </Card>

      {/* Roster Attention */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0">
          <CardTitle className="text-base font-semibold flex items-center gap-2">
            <Users className="h-4 w-4 text-red-600" />
            Roster Attention
          </CardTitle>
          <Link to="/admin/assets" className="text-xs text-primary hover:underline">VIEW ALL →</Link>
        </CardHeader>
        <CardContent>
          {rosterAttention.length === 0 ? (
            <div className="flex items-center gap-2 text-sm text-emerald-600">
              <CheckCircle2 className="h-4 w-4" />
              No expired, expiring, or missing crew documents — all clear
            </div>
          ) : (
            <div className="space-y-2">
              {rosterAttention.slice(0, 5).map((e) => (
                <div key={e.person.PersonID} className="flex items-center justify-between rounded-md border p-3">
                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                      <Link to={`/admin/persons/${e.person.PersonID}`} className="text-sm font-medium hover:underline">
                        {e.person.Name}
                      </Link>
                      {e.person.DefaultRole && <span className="text-xs text-muted-foreground">{e.person.DefaultRole}</span>}
                      <ExpiryBadge tone={e.status.worstTone} />
                    </div>
                    <div className="text-xs text-muted-foreground">
                      {e.status.issues.map((i) => i.label).join(', ')}
                    </div>
                  </div>
                </div>
              ))}
              {rosterAttention.length > 5 && (
                <p className="text-xs text-muted-foreground">+ {rosterAttention.length - 5} more — see Assets → Expiry</p>
              )}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function StatCard({
  title, value, icon: Icon, color
}: {
  title: string;
  value: number;
  icon: React.ElementType;
  color: string;
}) {
  return (
    <Card>
      <CardContent className="p-4">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-xs text-muted-foreground">{title}</p>
            <p className="text-2xl font-bold">{value}</p>
          </div>
          <Icon className={`h-6 w-6 ${color}`} />
        </div>
      </CardContent>
    </Card>
  );
}
