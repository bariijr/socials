import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router';
import { getUsers, saveUser } from '@/lib/dataStore';
import type { AppUser } from '@/data/types';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { ViewModeToggle, useViewMode } from '@/components/ui/view-mode-toggle';
import { EntityListCard } from '@/components/ui/master-detail-list';
import { ArrowLeft, Plus, Pencil, Search, User as UserIcon } from 'lucide-react';

const ROLES = ['Admin', 'Coordinator', 'Viewer'] as const;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function userDisplayName(u: AppUser): string {
  const parts = [u.FirstName, u.MiddleName, u.LastName].filter(Boolean);
  return parts.length ? parts.join(' ') : u.Username;
}

function UserDialog({ user, open, onClose, onSaved }: {
  user: AppUser | null; open: boolean; onClose: () => void; onSaved: () => void;
}) {
  const isNew = !user;
  const [username, setUsername] = useState(user?.Username || '');
  const [password, setPassword] = useState('');
  const [role, setRole] = useState<(typeof ROLES)[number]>(user?.Role || 'Coordinator');
  const [active, setActive] = useState(user?.Active ?? true);
  const [firstName, setFirstName] = useState(user?.FirstName || '');
  const [middleName, setMiddleName] = useState(user?.MiddleName || '');
  const [lastName, setLastName] = useState(user?.LastName || '');
  const [email, setEmail] = useState(user?.Email || '');
  const [phone, setPhone] = useState(user?.Phone || '');
  const [team, setTeam] = useState(user?.Team || '');
  const [company, setCompany] = useState(user?.Company || '');
  const [designation, setDesignation] = useState(user?.Designation || '');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Reset form state when dialog opens or user changes
  useEffect(() => {
    if (open) {
      setError(null);
      setUsername(user?.Username || '');
      setPassword('');
      setRole(user?.Role || 'Coordinator');
      setActive(user?.Active ?? true);
      setFirstName(user?.FirstName || '');
      setMiddleName(user?.MiddleName || '');
      setLastName(user?.LastName || '');
      setEmail(user?.Email || '');
      setPhone(user?.Phone || '');
      setTeam(user?.Team || '');
      setCompany(user?.Company || '');
      setDesignation(user?.Designation || '');
    }
  }, [open, user]);

  const handleSave = async () => {
    if (!username.trim()) return;
    if (isNew && password.length < 8) {
      setError('Temporary password must be at least 8 characters.');
      return;
    }
    if (isNew && (!firstName.trim() || !lastName.trim())) {
      setError('First and last name are required.');
      return;
    }
    if (isNew && !EMAIL_RE.test(email.trim())) {
      setError('A valid email is required.');
      return;
    }
    setSaving(true);
    setError(null);
    try {
      await saveUser({
        id: user?.ID,
        username: username.trim(),
        role,
        active,
        firstName: firstName.trim() || undefined,
        middleName: middleName.trim() || undefined,
        lastName: lastName.trim() || undefined,
        email: email.trim() || undefined,
        phone: phone.trim() || undefined,
        team: team.trim() || undefined,
        company: company.trim() || undefined,
        designation: designation.trim() || undefined,
        ...(password ? { password } : {}),
      });
      onSaved();
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Save failed');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-md max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{isNew ? 'Add User' : `Edit ${userDisplayName(user)}`}</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-2">
            <div className="space-y-1">
              <Label>First Name{isNew && ' *'}</Label>
              <Input value={firstName} onChange={(e) => setFirstName(e.target.value)} />
            </div>
            <div className="space-y-1">
              <Label>Last Name{isNew && ' *'}</Label>
              <Input value={lastName} onChange={(e) => setLastName(e.target.value)} />
            </div>
          </div>
          <div className="space-y-1">
            <Label>Middle Name (optional)</Label>
            <Input value={middleName} onChange={(e) => setMiddleName(e.target.value)} />
          </div>
          <div className="space-y-1">
            <Label>Email{isNew && ' *'}</Label>
            <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
          </div>
          <div className="space-y-1">
            <Label>Username</Label>
            <Input value={username} onChange={(e) => setUsername(e.target.value)} disabled={!isNew} />
          </div>
          <div className="space-y-1">
            <Label>{isNew ? 'Temporary Password' : 'Reset Password (optional)'}</Label>
            <Input type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder={isNew ? '' : 'Leave blank to keep current password'} />
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div className="space-y-1">
              <Label>Phone (optional)</Label>
              <Input value={phone} onChange={(e) => setPhone(e.target.value)} />
            </div>
            <div className="space-y-1">
              <Label>Team (optional)</Label>
              <Input value={team} onChange={(e) => setTeam(e.target.value)} />
            </div>
            <div className="space-y-1">
              <Label>Company (optional)</Label>
              <Input value={company} onChange={(e) => setCompany(e.target.value)} />
            </div>
            <div className="space-y-1">
              <Label>Designation (optional)</Label>
              <Input value={designation} onChange={(e) => setDesignation(e.target.value)} />
            </div>
          </div>
          <div className="space-y-1">
            <Label>Role</Label>
            <Select value={role} onValueChange={(v) => setRole(v as (typeof ROLES)[number])}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {ROLES.map((r) => <SelectItem key={r} value={r}>{r}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          {!isNew && (
            <div className="flex items-center gap-2">
              <input type="checkbox" id="active" checked={active} onChange={(e) => setActive(e.target.checked)} />
              <Label htmlFor="active">Active (unchecking blocks future logins)</Label>
            </div>
          )}
          {error && <p className="text-sm text-destructive">{error}</p>}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button onClick={handleSave} disabled={!username.trim() || saving}>{saving ? 'Saving…' : 'Save'}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function userBadges(u: AppUser) {
  return (
    <>
      <Badge variant="secondary" className="text-[10px]">{u.Role}</Badge>
      <Badge variant={u.Active ? 'outline' : 'destructive'} className="text-[10px]">{u.Active ? 'Active' : 'Deactivated'}</Badge>
    </>
  );
}

export default function UsersPage() {
  const navigate = useNavigate();
  const [users, setUsers] = useState<AppUser[]>([]);
  const [dialog, setDialog] = useState<{ open: boolean; item: AppUser | null }>({ open: false, item: null });
  const [search, setSearch] = useState('');
  const [viewMode, setViewMode, viewModeStored] = useViewMode('viq_users_view', 'tile');

  const reload = () => { getUsers().then(setUsers); };
  useEffect(() => { reload(); }, []);

  const filtered = users.filter((u) => {
    const q = search.trim().toLowerCase();
    if (!q) return true;
    return `${userDisplayName(u)} ${u.Email || ''} ${u.Username} ${u.Role}`.toLowerCase().includes(q);
  });

  const gridClass =
    viewMode === 'details' ? 'flex flex-col gap-2' :
    viewMode === 'small' ? 'grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4' :
    viewMode === 'large' ? 'grid grid-cols-1 gap-3 md:grid-cols-2' :
    'flex flex-col gap-2';

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <Button variant="outline" size="sm" onClick={() => navigate('/admin')}>
          <ArrowLeft className="mr-1 h-4 w-4" /> Back
        </Button>
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Users</h1>
          <p className="text-sm text-muted-foreground">Accounts and roles</p>
        </div>
      </div>

      <div className="flex items-center justify-between gap-2">
        <div className="relative w-72">
          <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input placeholder="Search users..." className="pl-9" value={search} onChange={(e) => setSearch(e.target.value)} />
        </div>
        <div className="flex items-center gap-2">
          <ViewModeToggle value={viewModeStored} onChange={setViewMode} />
          <Button size="sm" onClick={() => setDialog({ open: true, item: null })}>
            <Plus className="h-4 w-4" /> Add User
          </Button>
        </div>
      </div>

      {filtered.length === 0 ? (
        <div className="py-8 text-center text-sm text-muted-foreground">No users match your search</div>
      ) : viewMode === 'tile' ? (
        <div className={gridClass}>
          {filtered.map((u) => (
            <Card key={u.ID}>
              <CardContent className="p-4 flex items-center justify-between">
                <div>
                  <div className="font-bold">{userDisplayName(u)}</div>
                  <div className="text-xs text-muted-foreground">
                    {u.Email || 'No email on file'} · @{u.Username} · Created {u.CreatedAt.slice(0, 10)}
                  </div>
                  {(u.Team || u.Company || u.Designation) && (
                    <div className="text-xs text-muted-foreground">
                      {[u.Designation, u.Company, u.Team].filter(Boolean).join(' · ')}
                    </div>
                  )}
                </div>
                <div className="flex items-center gap-2">
                  {userBadges(u)}
                  <Button size="icon" variant="ghost" onClick={() => setDialog({ open: true, item: u })}>
                    <Pencil className="h-4 w-4" />
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      ) : (
        <div className={gridClass}>
          {filtered.map((u) => (
            <EntityListCard
              key={u.ID}
              viewMode={viewMode}
              selected={false}
              icon={<UserIcon className="h-4 w-4 text-muted-foreground" />}
              title={userDisplayName(u)}
              subtitle={u.Email || `@${u.Username}`}
              meta={(u.Team || u.Company || u.Designation) && (
                <div className="text-xs text-muted-foreground">{[u.Designation, u.Company, u.Team].filter(Boolean).join(' · ')}</div>
              )}
              badges={<>
                {userBadges(u)}
                <Button size="icon" variant="ghost" onClick={() => setDialog({ open: true, item: u })}>
                  <Pencil className="h-4 w-4" />
                </Button>
              </>}
            />
          ))}
        </div>
      )}

      <UserDialog
        user={dialog.item}
        open={dialog.open}
        onClose={() => setDialog({ open: false, item: null })}
        onSaved={reload}
      />
    </div>
  );
}
