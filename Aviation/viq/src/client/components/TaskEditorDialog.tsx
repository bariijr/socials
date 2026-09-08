// src/client/components/TaskEditorDialog.tsx
//
// Manual create/edit dialog for the Task entity introduced in Phase 8
// (Tasks/Attention/Escalation Engine). POST /tasks and PATCH /tasks/:id
// already existed and were fully tested -- this is purely the missing UI
// entry point, mirroring AdminTrips.tsx's ServiceEditorDialog pattern.
// A null `task` prop means create mode; a Task means edit mode -- one
// component handles both, same convention as ServiceEditorDialog.
import { useEffect, useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { createTask, updateTask, getUsers, ApiError } from '@/lib/dataStore';
import type { Task, TaskPriority, AppUser } from '@/data/types';
import { useAuth } from '@/lib/authContext';

const PRIORITIES: TaskPriority[] = ['Low', 'Normal', 'High', 'Urgent'];

// Every time in this app is Zulu/UTC -- the digits typed into a
// datetime-local input ARE the UTC clock time, so no `new Date(...)`
// round-trip is used (same convention as TripDetail.tsx's
// toInputDate/fromInputDate).
function toInputDate(value?: string): string {
  return value ? value.slice(0, 16) : '';
}
function fromInputDate(value: string): string | undefined {
  return value ? `${value}:00.000Z` : undefined;
}

export function TaskEditorDialog({
  open, onClose, task, onSaved,
}: {
  open: boolean;
  onClose: () => void;
  task: Task | null;
  onSaved: () => void;
}) {
  const { user } = useAuth();
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [ownerUserId, setOwnerUserId] = useState<string>('');
  const [priority, setPriority] = useState<TaskPriority>('Normal');
  const [noLaterThanZ, setNoLaterThanZ] = useState('');
  const [users, setUsers] = useState<AppUser[]>([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    getUsers().then(setUsers).catch(() => {});
  }, [open]);

  useEffect(() => {
    if (!open) return;
    setError(null);
    if (task) {
      setTitle(task.Title);
      setDescription(task.Description || '');
      setOwnerUserId(task.OwnerUserID || '');
      setPriority(task.Priority);
      setNoLaterThanZ(toInputDate(task.NoLaterThanZ));
    } else {
      setTitle('');
      setDescription('');
      setPriority('Normal');
      setNoLaterThanZ('');
      // Default a newly created task's owner to the current user, looked
      // up by username since useAuth()'s user carries no id -- only the
      // /users list does.
      setOwnerUserId('');
    }
  }, [open, task]);

  useEffect(() => {
    if (!open || task || !user || users.length === 0) return;
    const me = users.find((u) => u.Username === user.username);
    if (me) setOwnerUserId(me.ID);
  }, [open, task, user, users]);

  async function handleSave() {
    if (!title.trim()) {
      setError('Title is required.');
      return;
    }
    setSaving(true);
    setError(null);
    try {
      if (task) {
        await updateTask(task.TaskID, {
          Title: title.trim(),
          Description: description.trim() || undefined,
          OwnerUserID: ownerUserId || undefined,
          Priority: priority,
          NoLaterThanZ: fromInputDate(noLaterThanZ),
          Version: task.Version,
        });
      } else {
        await createTask({
          Title: title.trim(),
          Description: description.trim() || undefined,
          OwnerUserID: ownerUserId || undefined,
          Priority: priority,
          NoLaterThanZ: fromInputDate(noLaterThanZ),
        });
      }
      onSaved();
      onClose();
    } catch (err) {
      if (err instanceof ApiError && err.status === 409) {
        setError('This task was updated elsewhere. Close and reopen it to see the latest version.');
      } else {
        setError('Could not save this task. Please try again.');
      }
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>{task ? 'Edit Task' : 'New Task'}</DialogTitle>
        </DialogHeader>

        <div className="space-y-4 py-2">
          {error && (
            <div className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">{error}</div>
          )}

          <div>
            <Label>Title</Label>
            <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. Call client re: schedule change" />
          </div>

          <div>
            <Label>Description</Label>
            <Textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={3} />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label>Owner</Label>
              <Select value={ownerUserId || 'unassigned'} onValueChange={(v) => setOwnerUserId(v === 'unassigned' ? '' : v)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="unassigned">Unassigned</SelectItem>
                  {users.map((u) => (
                    <SelectItem key={u.ID} value={u.ID}>{u.FirstName ? `${u.FirstName} ${u.LastName || ''}`.trim() : u.Username}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div>
              <Label>Priority</Label>
              <Select value={priority} onValueChange={(v) => setPriority(v as TaskPriority)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {PRIORITIES.map((p) => <SelectItem key={p} value={p}>{p}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div>
            <Label>No Later Than (UTC)</Label>
            <Input type="datetime-local" value={noLaterThanZ} onChange={(e) => setNoLaterThanZ(e.target.value)} />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={saving}>Cancel</Button>
          <Button onClick={handleSave} disabled={saving}>{saving ? 'Saving…' : 'Save'}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
