// src/client/components/ConflictDialog.tsx
//
// Shown when a save is rejected with 409 because someone else changed the
// record first. RELOAD discards the local draft and refetches; COMPARE
// shows a read-only, field-by-field diff of the abandoned draft against
// the current server state -- no merge UI, the coordinator re-edits by
// hand after reviewing.
import { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';

export function ConflictDialog({
  open, onOpenChange, entityLabel, changedBy, changedAt, draft, current, onReload,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  entityLabel: string;
  changedBy?: string;
  changedAt?: string;
  draft: Record<string, unknown>;
  current: Record<string, unknown>;
  onReload: () => void;
}) {
  const [comparing, setComparing] = useState(false);

  const changedFields = Object.keys({ ...draft, ...current }).filter(
    (key) => JSON.stringify(draft[key]) !== JSON.stringify(current[key]),
  );

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>THIS {entityLabel.toUpperCase()} HAS CHANGED</DialogTitle>
        </DialogHeader>
        <div className="space-y-3 text-sm">
          <p className="text-muted-foreground">
            Updated by <span className="font-medium text-foreground">{changedBy ?? 'someone else'}</span>
            {changedAt && <> at <span className="font-medium text-foreground">{new Date(changedAt).toISOString()}</span></>}
          </p>
          {comparing && (
            <div className="rounded border">
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b bg-muted/50">
                    <th className="p-2 text-left">Field</th>
                    <th className="p-2 text-left">Your unsaved draft</th>
                    <th className="p-2 text-left">Current server state</th>
                  </tr>
                </thead>
                <tbody>
                  {changedFields.map((key) => (
                    <tr key={key} className="border-b last:border-0">
                      <td className="p-2 font-medium">{key}</td>
                      <td className="p-2">{String(draft[key] ?? '—')}</td>
                      <td className="p-2">{String(current[key] ?? '—')}</td>
                    </tr>
                  ))}
                  {changedFields.length === 0 && (
                    <tr><td className="p-2 text-muted-foreground" colSpan={3}>No field differences detected.</td></tr>
                  )}
                </tbody>
              </table>
            </div>
          )}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => setComparing((c) => !c)}>
            {comparing ? 'HIDE COMPARE' : 'COMPARE'}
          </Button>
          <Button onClick={onReload}>RELOAD</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
