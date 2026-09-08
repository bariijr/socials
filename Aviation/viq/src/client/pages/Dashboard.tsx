import { useEffect, useState } from 'react';
import { getUpcomingLegs, getTasks, getFailedMessagesWidget, updateTask, formatZ } from '@/lib/dataStore';
import type { Task, Leg, Comm } from '@/data/types';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { StatusBadge, EscalationBadge } from '@/components/StatusBadge';
import { Button } from '@/components/ui/button';
import { Link } from 'react-router';
import { Plane, AlertTriangle, ListChecks, Clock } from 'lucide-react';

const WIDGET_LIMIT = 8;

type UpcomingLeg = Leg & { Trip: { TripID: string; Registration: string; Status: string } };
type FailedComm = Comm & { Trip: { TripID: string; Registration: string } };

function TaskRow({ task, onComplete }: { task: Task; onComplete: (task: Task) => void }) {
  return (
    <div className="flex items-center justify-between gap-2 rounded-md border p-2 text-xs hover:bg-accent/50 transition-colors">
      <Link to={task.TripID ? `/trips/${task.TripID}` : '#'} className="flex-1 min-w-0">
        <span className="font-medium">{task.Title}</span>
        {task.TripID && <span className="text-muted-foreground ml-2">{task.TripID}</span>}
        <div className="flex items-center gap-2 mt-0.5">
          {task.NoLaterThanZ && <span className="text-muted-foreground">NLT {formatZ(task.NoLaterThanZ)}</span>}
          {task.EscalationTier && <EscalationBadge tier={task.EscalationTier} className="text-[9px]" />}
          <StatusBadge status={task.Status} entityType="task" className="text-[9px]" />
        </div>
      </Link>
      {task.Status !== 'Complete' && task.Status !== 'Cancelled' && (
        <Button
          variant="ghost"
          size="sm"
          className="h-6 px-2 text-[10px] shrink-0"
          onClick={(e) => { e.preventDefault(); onComplete(task); }}
        >
          Complete
        </Button>
      )}
    </div>
  );
}

function TaskList({ tasks, loading, emptyLabel, onComplete }: { tasks: Task[]; loading: boolean; emptyLabel: string; onComplete: (task: Task) => void }) {
  if (loading) return <p className="text-xs text-muted-foreground">Loading…</p>;
  if (tasks.length === 0) return <p className="text-xs text-muted-foreground">{emptyLabel}</p>;
  return <div className="space-y-2">{tasks.map((t) => <TaskRow key={t.TaskID} task={t} onComplete={onComplete} />)}</div>;
}

export default function Dashboard() {
  const [myTasks, setMyTasks] = useState<Task[]>([]);
  const [teamTasks, setTeamTasks] = useState<Task[]>([]);
  const [unassignedTasks, setUnassignedTasks] = useState<Task[]>([]);
  const [escalatedTasks, setEscalatedTasks] = useState<Task[]>([]);
  const [tasksLoading, setTasksLoading] = useState(true);

  const [failedMessages, setFailedMessages] = useState<FailedComm[]>([]);
  const [failedLoading, setFailedLoading] = useState(true);

  const [upcomingLegs, setUpcomingLegs] = useState<UpcomingLeg[]>([]);
  const [departuresLoading, setDeparturesLoading] = useState(true);

  const [reloadToken, setReloadToken] = useState(0);

  useEffect(() => {
    let cancelled = false;
    setTasksLoading(true);
    Promise.all([
      getTasks({ scope: 'mine', limit: WIDGET_LIMIT }),
      getTasks({ scope: 'team', limit: WIDGET_LIMIT }),
      getTasks({ scope: 'unassigned', limit: WIDGET_LIMIT }),
      getTasks({ scope: 'escalated', limit: WIDGET_LIMIT }),
    ])
      .then(([mine, team, unassigned, escalated]) => {
        if (cancelled) return;
        setMyTasks(mine);
        setTeamTasks(team);
        setUnassignedTasks(unassigned);
        setEscalatedTasks(escalated);
        setTasksLoading(false);
      })
      .catch(() => { if (!cancelled) setTasksLoading(false); });
    return () => { cancelled = true; };
  }, [reloadToken]);

  useEffect(() => {
    let cancelled = false;
    setFailedLoading(true);
    getFailedMessagesWidget(WIDGET_LIMIT)
      .then((rows) => { if (!cancelled) { setFailedMessages(rows); setFailedLoading(false); } })
      .catch(() => { if (!cancelled) setFailedLoading(false); });
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    let cancelled = false;
    setDeparturesLoading(true);
    getUpcomingLegs(WIDGET_LIMIT)
      .then((legs) => { if (!cancelled) { setUpcomingLegs(legs); setDeparturesLoading(false); } })
      .catch(() => { if (!cancelled) setDeparturesLoading(false); });
    return () => { cancelled = true; };
  }, []);

  async function handleCompleteTask(task: Task) {
    await updateTask(task.TaskID, { Status: 'Complete', Version: task.Version });
    setReloadToken((n) => n + 1);
  }

  const activeTripsCount = new Set(
    [...myTasks, ...teamTasks, ...unassignedTasks].filter((t) => t.TripID).map((t) => t.TripID),
  ).size;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">ACTION BOARD</h1>
        <p className="text-muted-foreground">OPERATIONS OVERVIEW</p>
      </div>

      <div className="grid gap-4 md:grid-cols-4">
        <Card><CardContent className="p-4"><div className="flex items-center justify-between"><div><p className="text-xs text-muted-foreground">TRIPS WITH OPEN TASKS</p><p className="text-2xl font-bold">{activeTripsCount}</p></div><Plane className="h-6 w-6 text-blue-600" /></div></CardContent></Card>
        <Card><CardContent className="p-4"><div className="flex items-center justify-between"><div><p className="text-xs text-muted-foreground">MY OPEN TASKS</p><p className="text-2xl font-bold">{myTasks.length}</p></div><ListChecks className="h-6 w-6 text-emerald-600" /></div></CardContent></Card>
        <Card><CardContent className="p-4"><div className="flex items-center justify-between"><div><p className="text-xs text-muted-foreground">ESCALATED</p><p className="text-2xl font-bold">{escalatedTasks.length}</p></div><AlertTriangle className="h-6 w-6 text-red-600" /></div></CardContent></Card>
        <Card><CardContent className="p-4"><div className="flex items-center justify-between"><div><p className="text-xs text-muted-foreground">UPCOMING DEPARTURES</p><p className="text-2xl font-bold">{upcomingLegs.length}</p></div><Clock className="h-6 w-6 text-amber-600" /></div></CardContent></Card>
      </div>

      <div className="grid gap-6 md:grid-cols-2">
        <Card>
          <CardHeader><CardTitle className="text-base">MY TASKS</CardTitle></CardHeader>
          <CardContent><TaskList tasks={myTasks} loading={tasksLoading} emptyLabel="No open tasks — all clear." onComplete={handleCompleteTask} /></CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle className="text-base">TEAM TASKS</CardTitle></CardHeader>
          <CardContent><TaskList tasks={teamTasks} loading={tasksLoading} emptyLabel="No team tasks." onComplete={handleCompleteTask} /></CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle className="text-base">UNASSIGNED</CardTitle></CardHeader>
          <CardContent><TaskList tasks={unassignedTasks} loading={tasksLoading} emptyLabel="Nothing unassigned." onComplete={handleCompleteTask} /></CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle className="text-base">ESCALATED</CardTitle></CardHeader>
          <CardContent><TaskList tasks={escalatedTasks} loading={tasksLoading} emptyLabel="Nothing escalated." onComplete={handleCompleteTask} /></CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle className="text-base">FAILED MESSAGES</CardTitle></CardHeader>
          <CardContent className="space-y-2">
            {failedLoading ? (
              <p className="text-xs text-muted-foreground">Loading…</p>
            ) : failedMessages.length === 0 ? (
              <p className="text-xs text-muted-foreground">No failed messages.</p>
            ) : (
              failedMessages.map((c) => (
                <Link key={c.CommID} to={`/trips/${c.TripID}`} className="flex items-center justify-between rounded-md border p-2 text-xs hover:bg-accent/50 transition-colors">
                  <div className="min-w-0">
                    <span className="font-medium">{c.Subject}</span>
                    <span className="text-muted-foreground ml-2">{c.Trip.TripID}</span>
                  </div>
                  <Badge variant="outline" className="text-[9px] bg-red-100 text-red-700 shrink-0">FAILED</Badge>
                </Link>
              ))
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle className="text-base">UPCOMING DEPARTURES</CardTitle></CardHeader>
          <CardContent className="space-y-3">
            {departuresLoading ? (
              <p className="text-xs text-muted-foreground">Loading…</p>
            ) : upcomingLegs.length === 0 ? (
              <p className="text-xs text-muted-foreground">No upcoming departures.</p>
            ) : (
              upcomingLegs.map((leg) => (
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
      </div>
    </div>
  );
}
