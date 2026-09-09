# VIQ Vendor Assignment Admin UI (Sub-Project 3a) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give coordinators/admins a UI to create, edit, and view `VendorAssignment` rows (currently API-only) via a new tab in the existing Assets admin page, plus a read-only view of a client's own overrides on that client's profile.

**Architecture:** One new file (`AdminVendorAssignments.tsx`) mirroring the existing `AdminAuthorizations.tsx`'s exact `MasterDetailShell`/`MasterDetailList`/`EntityListCard`/`DetailPanel` tab pattern, wired into `AdminAssets.tsx`'s existing `<Tabs>`. A small read-only section is added to `AdminAssets.tsx`'s existing `ClientPanel`. Zero server changes — every endpoint needed already exists and is tested.

**Tech Stack:** React 19 + Vite + TypeScript client, consuming the already-shipped `VendorAssignment` REST API (NestJS server, untouched by this plan).

**Spec:** [2026-09-09-viq-vendor-assignment-admin-ui-design.md](../specs/2026-09-09-viq-vendor-assignment-admin-ui-design.md)

## Global Constraints

- No client test framework exists in this project — verification is `npm run build:client` plus a manual dev-server check.
- This plan makes ZERO server-side changes — do not touch anything under `src/server/`.
- The create/edit form's disabled-state logic must mirror the server's own validation exactly: `rank` is disabled when `prohibited` is checked (server requires rank unless prohibited); `preferred` and `prohibited` are mutually exclusive (checking one disables the other) — this is UX guidance only, the server remains the actual source of truth and its rejection message must still surface visibly on a violation.
- `getVendorAssignmentList` is a plain async fetch on every call — NOT a synchronous cached getter like `getProviderList`/`getClientList`/`getCountryList`. Do not add a `_vendorAssignmentCache` module-level variable or wire it into the app-boot bulk loader.
- After each task: run `npm run build:client` (clean build required before moving to the next task), then commit.

---

### Task 1: Data layer — `VendorAssignment` type + fetch/save functions

**Files:**
- Modify: `src/client/lib/dataStore.ts` — add the `VendorAssignment` interface and two new functions, placed near the existing `getVendorCandidates`/`getVendorAssignment` functions (around line 1815-1822, the most recently added vendor-related code in this file).

**Interfaces:**
- Produces: `VendorAssignment` interface, `getVendorAssignmentList(filters): Promise<VendorAssignment[]>`, `saveVendorAssignment(a, user?): Promise<VendorAssignment>` — consumed by Task 2 and Task 3.

- [ ] **Step 1: Add the `VendorAssignment` interface and the two functions**

In `src/client/lib/dataStore.ts`, add this block immediately after the existing `getVendorAssignment` function (the one added in sub-project 2, currently ending around line 1822-1825 with its closing `}` after the try/catch):

```typescript
export interface VendorAssignment {
  ID: string;
  ProviderID: string;
  CountryISO2?: string;
  ICAO?: string;
  ServiceType: string;
  PermitType?: string;
  ClientID?: string;
  Preferred: boolean;
  Rank: number | null;
  Prohibited: boolean;
  Active: boolean;
  EffectiveFrom?: string;
  EffectiveUntil?: string;
  Notes?: string;
}

function mapVendorAssignmentFromApi(v: any): VendorAssignment {
  return {
    ID: v.id,
    ProviderID: v.providerId,
    CountryISO2: v.countryIso2 ?? undefined,
    ICAO: v.icao ?? undefined,
    ServiceType: v.serviceType,
    PermitType: v.permitType ?? undefined,
    ClientID: v.clientId ?? undefined,
    Preferred: v.preferred,
    Rank: v.rank ?? null,
    Prohibited: v.prohibited,
    Active: v.active,
    EffectiveFrom: v.effectiveFrom ?? undefined,
    EffectiveUntil: v.effectiveUntil ?? undefined,
    Notes: v.notes ?? undefined,
  };
}

export async function getVendorAssignmentList(filters: { clientId?: string; countryIso2?: string; serviceType?: string } = {}): Promise<VendorAssignment[]> {
  const params = new URLSearchParams();
  if (filters.clientId) params.set('clientId', filters.clientId);
  if (filters.countryIso2) params.set('countryIso2', filters.countryIso2);
  if (filters.serviceType) params.set('serviceType', filters.serviceType);
  const qs = params.toString();
  const rows = await apiJson<any[]>(`/vendor-assignments${qs ? `?${qs}` : ''}`);
  return rows.map(mapVendorAssignmentFromApi);
}

export async function saveVendorAssignment(a: Omit<VendorAssignment, 'ID'> & { ID?: string }, user = currentUser()): Promise<VendorAssignment> {
  const body = JSON.stringify({
    providerId: a.ProviderID,
    countryIso2: a.CountryISO2 || undefined,
    icao: a.ICAO || undefined,
    serviceType: a.ServiceType,
    permitType: a.PermitType || undefined,
    clientId: a.ClientID || undefined,
    preferred: a.Preferred,
    rank: a.Prohibited ? undefined : a.Rank,
    prohibited: a.Prohibited,
    active: a.Active,
    effectiveFrom: a.EffectiveFrom || undefined,
    effectiveUntil: a.EffectiveUntil || undefined,
    notes: a.Notes || undefined,
    user,
  });
  const row = a.ID
    ? await apiJson<any>(`/vendor-assignments/${a.ID}`, { method: 'PATCH', body })
    : await apiJson<any>('/vendor-assignments', { method: 'POST', body });
  return mapVendorAssignmentFromApi(row);
}
```

- [ ] **Step 2: Build**

Run: `npm run build:client`
Expected: clean.

- [ ] **Step 3: Commit**

```bash
git add src/client/lib/dataStore.ts
git commit -m "feat: add VendorAssignment client data layer"
```

---

### Task 2: "Vendor Assignments" admin tab

**Files:**
- Create: `src/client/pages/admin/AdminVendorAssignments.tsx`
- Modify: `src/client/pages/admin/AdminAssets.tsx` — import + wire the new tab into the existing `<Tabs>`.

**Interfaces:**
- Consumes: `VendorAssignment`, `getVendorAssignmentList`, `saveVendorAssignment` (Task 1); `getProviderList`, `getCountryList`, `getClientList` (already exist, already imported into `AdminAssets.tsx` — this new file imports them independently, same as `AdminAuthorizations.tsx` does for `getOperatorList`/`getCountryList`).
- Produces: `VendorAssignmentsTab` component (no props, matching `AuthorizationsTab`'s exact shape) — consumed by `AdminAssets.tsx`'s `TabsContent`.

- [ ] **Step 1: Write `src/client/pages/admin/AdminVendorAssignments.tsx`**

```typescript
import { useState, useEffect } from 'react';
import {
  getVendorAssignmentList, saveVendorAssignment,
  getProviderList, getCountryList, getClientList,
} from '@/lib/dataStore';
import type { VendorAssignment } from '@/lib/dataStore';
import { useAuth } from '@/lib/authContext';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { MasterDetailList, EntityListCard, DetailPanel } from '@/components/ui/master-detail-list';
import { MasterDetailShell } from '@/components/ui/master-detail-shell';
import { Building2 } from 'lucide-react';

// AdminAssets.tsx's useSelection() helper is private to that file (not
// exported) — this tab replicates the same tiny pattern locally rather
// than exporting it out of an unrelated file for one new caller, same
// approach AdminAuthorizations.tsx already takes.
function useVASelection() {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  return {
    selectedId, adding,
    select: (id: string) => { setSelectedId(id); setAdding(false); },
    startAdd: () => { setSelectedId(null); setAdding(true); },
    clear: () => { setSelectedId(null); setAdding(false); },
  };
}

function contextSummary(v: VendorAssignment): string {
  const parts: string[] = [];
  if (v.ClientID) parts.push(v.ClientID);
  if (v.ICAO) parts.push(v.ICAO);
  else if (v.CountryISO2) parts.push(v.CountryISO2);
  else parts.push('Global');
  parts.push(v.ServiceType);
  if (v.PermitType) parts.push(v.PermitType);
  return parts.join(' — ');
}

function VendorAssignmentPanel({ assignment, isNew, isAdmin, onSaved, onCancel }: {
  assignment: VendorAssignment | null; isNew: boolean; isAdmin: boolean;
  onSaved: (id: string) => void; onCancel: () => void;
}) {
  const [providers, setProviders] = useState(getProviderList());
  const [countries, setCountries] = useState(getCountryList());
  const [clients, setClients] = useState(getClientList());
  useEffect(() => {
    setProviders(getProviderList());
    setCountries(getCountryList());
    setClients(getClientList());
  }, []);

  const [providerId, setProviderId] = useState(assignment?.ProviderID || '');
  const [countryIso2, setCountryIso2] = useState(assignment?.CountryISO2 || '');
  const [icao, setIcao] = useState(assignment?.ICAO || '');
  const [serviceType, setServiceType] = useState(assignment?.ServiceType || '');
  const [permitType, setPermitType] = useState(assignment?.PermitType || '');
  const [clientId, setClientId] = useState(assignment?.ClientID || '');
  const [preferred, setPreferred] = useState(assignment?.Preferred || false);
  const [rank, setRank] = useState(assignment?.Rank != null ? String(assignment.Rank) : '1');
  const [prohibited, setProhibited] = useState(assignment?.Prohibited || false);
  const [active, setActive] = useState(assignment?.Active ?? true);
  const [effectiveFrom, setEffectiveFrom] = useState(assignment?.EffectiveFrom?.slice(0, 10) || '');
  const [effectiveUntil, setEffectiveUntil] = useState(assignment?.EffectiveUntil?.slice(0, 10) || '');
  const [notes, setNotes] = useState(assignment?.Notes || '');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const canEditFields = isAdmin;
  const valid = providerId && serviceType.trim() && (prohibited || rank.trim());

  const handleSave = async () => {
    if (!canEditFields || !valid) return;
    setSaving(true);
    setError(null);
    try {
      const saved = await saveVendorAssignment({
        ID: assignment?.ID,
        ProviderID: providerId,
        CountryISO2: countryIso2 || undefined,
        ICAO: icao.trim().toUpperCase() || undefined,
        ServiceType: serviceType.trim(),
        PermitType: permitType.trim() || undefined,
        ClientID: clientId || undefined,
        Preferred: preferred,
        Rank: prohibited ? null : (Number(rank) || 1),
        Prohibited: prohibited,
        Active: active,
        EffectiveFrom: effectiveFrom ? new Date(effectiveFrom).toISOString() : undefined,
        EffectiveUntil: effectiveUntil ? new Date(effectiveUntil + 'T23:59:59.999Z').toISOString() : undefined,
        Notes: notes.trim() || undefined,
      });
      onSaved(saved.ID);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not save this vendor assignment. Please try again.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base font-semibold">
          {isNew ? 'Add Vendor Assignment' : `Edit — ${assignment ? contextSummary(assignment) : ''}`}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {error && (
          <div className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">{error}</div>
        )}
        <div className="space-y-1">
          <Label>Provider</Label>
          <Select value={providerId} onValueChange={setProviderId} disabled={!canEditFields}>
            <SelectTrigger><SelectValue placeholder="Select provider…" /></SelectTrigger>
            <SelectContent>
              {providers.map((p) => <SelectItem key={p.ProviderID} value={p.ProviderID}>{p.Name}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1">
          <Label>Service Type</Label>
          <Input value={serviceType} onChange={(e) => setServiceType(e.target.value)} disabled={!canEditFields} placeholder="e.g. Overflight" />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1">
            <Label>Country (optional)</Label>
            <Select value={countryIso2 || 'none'} onValueChange={(v) => setCountryIso2(v === 'none' ? '' : v)} disabled={!canEditFields}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="none">— None —</SelectItem>
                {countries.map((c) => <SelectItem key={c.ISO2} value={c.ISO2}>{c.Name}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <Label>Airport ICAO (optional)</Label>
            <Input value={icao} onChange={(e) => setIcao(e.target.value.toUpperCase())} disabled={!canEditFields} placeholder="e.g. HTDA" />
          </div>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1">
            <Label>Permit Type (optional)</Label>
            <Input value={permitType} onChange={(e) => setPermitType(e.target.value)} disabled={!canEditFields} />
          </div>
          <div className="space-y-1">
            <Label>Client (optional)</Label>
            <Select value={clientId || 'none'} onValueChange={(v) => setClientId(v === 'none' ? '' : v)} disabled={!canEditFields}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="none">— General rule —</SelectItem>
                {clients.map((c) => <SelectItem key={c.ClientID} value={c.ClientID}>{c.Name}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
        </div>
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2">
            <Checkbox
              checked={preferred}
              onCheckedChange={(v) => { setPreferred(!!v); if (v) setProhibited(false); }}
              disabled={!canEditFields}
              id="va-preferred"
            />
            <Label htmlFor="va-preferred">Preferred</Label>
          </div>
          <div className="flex items-center gap-2">
            <Checkbox
              checked={prohibited}
              onCheckedChange={(v) => { setProhibited(!!v); if (v) setPreferred(false); }}
              disabled={!canEditFields}
              id="va-prohibited"
            />
            <Label htmlFor="va-prohibited">Prohibited (DO NOT USE)</Label>
          </div>
          <div className="flex items-center gap-2">
            <Checkbox checked={active} onCheckedChange={(v) => setActive(!!v)} disabled={!canEditFields} id="va-active" />
            <Label htmlFor="va-active">Active</Label>
          </div>
        </div>
        <div className="space-y-1">
          <Label>Rank</Label>
          <Input
            type="number"
            min={1}
            value={rank}
            onChange={(e) => setRank(e.target.value)}
            disabled={!canEditFields || prohibited}
            placeholder={prohibited ? 'Not applicable (Prohibited)' : ''}
          />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1">
            <Label>Effective From (optional)</Label>
            <Input type="date" value={effectiveFrom} onChange={(e) => setEffectiveFrom(e.target.value)} disabled={!canEditFields} />
          </div>
          <div className="space-y-1">
            <Label>Effective Until (optional)</Label>
            <Input type="date" value={effectiveUntil} onChange={(e) => setEffectiveUntil(e.target.value)} disabled={!canEditFields} />
          </div>
        </div>
        <div className="space-y-1">
          <Label>Notes</Label>
          <Input value={notes} onChange={(e) => setNotes(e.target.value)} disabled={!canEditFields} />
        </div>
        <div className="flex items-center gap-2">
          {canEditFields && (
            <Button onClick={handleSave} disabled={!valid || saving}>{isNew ? 'Create' : 'Save'}</Button>
          )}
          <div className="flex-1" />
          <Button variant="outline" onClick={onCancel}>Cancel</Button>
        </div>
      </CardContent>
    </Card>
  );
}

export function VendorAssignmentsTab() {
  const { isAdmin } = useAuth();
  const [assignments, setAssignments] = useState<VendorAssignment[]>([]);
  const [loading, setLoading] = useState(true);
  const sel = useVASelection();

  const refresh = () => {
    setLoading(true);
    getVendorAssignmentList().then((rows) => { setAssignments(rows); setLoading(false); });
  };
  useEffect(() => { refresh(); }, []);

  const selected = assignments.find((a) => a.ID === sel.selectedId) || null;

  if (loading) return <p className="text-sm text-muted-foreground">Loading…</p>;

  return (
    <MasterDetailShell
      heightClassName="h-[calc(100vh-14rem)]"
      listWidthClassName="md:w-64 lg:w-96"
      detailOpen={!!(sel.selectedId || sel.adding)}
      onDetailOpenChange={(open) => { if (!open) sel.clear(); }}
      detailTitle={selected ? contextSummary(selected) : (sel.adding ? 'Add Vendor Assignment' : undefined)}
      list={
        <MasterDetailList
          title="Vendor Assignments" subtitle={`${assignments.length} total`} items={assignments}
          getId={(a) => a.ID} searchText={(a) => `${a.ProviderID} ${contextSummary(a)}`}
          viewStorageKey="viq_assets_vendor_assignments_view" selectedId={sel.selectedId || (sel.adding ? 'new' : null)}
          onSelect={sel.select} onAddNew={sel.startAdd} addLabel="Add Vendor Assignment" canAdd={isAdmin}
          emptyText="No vendor assignments yet"
          renderItem={(a, { viewMode, selected: isSelected }) => (
            <EntityListCard
              viewMode={viewMode} selected={isSelected}
              icon={<Building2 className="h-4 w-4 text-muted-foreground" />}
              title={a.ProviderID}
              subtitle={contextSummary(a)}
              badges={<>
                {a.Prohibited ? (
                  <Badge variant="outline" className="text-[10px] text-red-600 border-red-300">DO NOT USE</Badge>
                ) : (
                  <>
                    {a.Preferred && <Badge variant="default" className="text-[10px]">Preferred</Badge>}
                    <Badge variant="outline" className="text-[10px]">Rank {a.Rank}</Badge>
                  </>
                )}
                {!a.Active && <Badge variant="outline" className="text-[10px] text-muted-foreground">Inactive</Badge>}
              </>}
            />
          )}
        />
      }
      detail={
        <DetailPanel empty={!selected && !sel.adding}>
          {!selected && !sel.adding ? 'Select a vendor assignment from the left, or add a new one' : (
            <VendorAssignmentPanel
              key={selected?.ID ?? 'new'}
              assignment={selected} isNew={sel.adding} isAdmin={isAdmin}
              onSaved={(id) => { refresh(); sel.select(id); }}
              onCancel={sel.clear}
            />
          )}
        </DetailPanel>
      }
    />
  );
}
```

- [ ] **Step 2: Wire the tab into `AdminAssets.tsx`**

Add the import, alongside the existing `import { AuthorizationsTab } from './AdminAuthorizations';` (line 33):
```typescript
import { VendorAssignmentsTab } from './AdminVendorAssignments';
```

Add a new `TabsTrigger` to the `<TabsList>` (after line 932's `authorizations` trigger):
```tsx
<TabsTrigger value="vendor-assignments" className="flex items-center gap-1"><Building2 className="h-3.5 w-3.5" /> Vendor Assignments</TabsTrigger>
```

Add a new `TabsContent` (after the `authorizations` tab's `TabsContent` block — search for `<TabsContent value="authorizations">` and add this immediately after its closing `</TabsContent>`):
```tsx
{/* ─── Vendor Assignments ─────────────────────────────────────── */}
<TabsContent value="vendor-assignments">
  <VendorAssignmentsTab />
</TabsContent>
```

- [ ] **Step 3: Build**

Run: `npm run build:client`
Expected: clean.

- [ ] **Step 4: Manual verification**

Start the dev server (`npm run start:dev`, then `npm run build:client` again per the `dist/public`-wipe quirk), open the Assets page, click the new "Vendor Assignments" tab, click "Add Vendor Assignment", fill in Provider + Service Type + Rank, save, confirm it appears in the list. Try checking both Preferred and Prohibited — confirm checking one unchecks the other. Try checking Prohibited — confirm the Rank field becomes disabled.

- [ ] **Step 5: Commit**

```bash
git add src/client/pages/admin/AdminVendorAssignments.tsx src/client/pages/admin/AdminAssets.tsx
git commit -m "feat: add Vendor Assignments admin tab"
```

---

### Task 3: Client Profile "Vendor Preferences" section

**Files:**
- Modify: `src/client/pages/admin/AdminAssets.tsx` — `ClientPanel` component (currently lines 645-749).

**Interfaces:**
- Consumes: `getVendorAssignmentList` (Task 1).

- [ ] **Step 1: Add the section to `ClientPanel`**

In `AdminAssets.tsx`'s `ClientPanel` function, add this state near its other `useState` calls (after the existing `const [notes, setNotes] = useState(client?.Notes || '');` line):

```typescript
  const [clientVendorAssignments, setClientVendorAssignments] = useState<VendorAssignment[]>([]);
  useEffect(() => {
    if (client?.ClientID) {
      getVendorAssignmentList({ clientId: client.ClientID }).then(setClientVendorAssignments);
    } else {
      setClientVendorAssignments([]);
    }
  }, [client?.ClientID]);
```

Add the render block immediately before the existing `<PanelActions ... />` call (currently starting at line 739):

```tsx
        {!isNew && client && (
          <div className="space-y-2 rounded-md border p-3">
            <div className="text-sm font-semibold">Vendor Preferences</div>
            {clientVendorAssignments.length === 0 ? (
              <p className="text-xs text-muted-foreground">No client-specific vendor overrides — this client uses the general rules.</p>
            ) : (
              <div className="space-y-1">
                {clientVendorAssignments.map((v) => (
                  <div key={v.ID} className="flex items-center justify-between text-xs">
                    <span>{v.ProviderID} — {v.CountryISO2 || v.ICAO || 'Global'} — {v.ServiceType}</span>
                    {v.Prohibited ? (
                      <Badge variant="outline" className="text-[9px] text-red-600 border-red-300">DO NOT USE</Badge>
                    ) : (
                      <span className="text-muted-foreground">{v.Preferred ? 'Preferred, ' : ''}Rank {v.Rank}</span>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
```

- [ ] **Step 2: Add the necessary imports to `AdminAssets.tsx`**

Add `getVendorAssignmentList` to the existing `dataStore` import list (near `getClientList, saveClient, deleteClient,` at line 12), and add `VendorAssignment` to the existing `import type { RosterExpiryEntry, Operator, CountryFee, Client } from '@/lib/dataStore';` line (line 15):

```typescript
import type { RosterExpiryEntry, Operator, CountryFee, Client, VendorAssignment } from '@/lib/dataStore';
```

- [ ] **Step 3: Build**

Run: `npm run build:client`
Expected: clean.

- [ ] **Step 4: Manual verification**

In the dev server, go to Assets → Clients, select an existing client, confirm the new "Vendor Preferences" section renders (empty state if that client has no overrides). Go to the Vendor Assignments tab, create one row with that client selected, go back to the Clients tab and reselect the same client — confirm the new row now appears in the Vendor Preferences section.

- [ ] **Step 5: Commit**

```bash
git add src/client/pages/admin/AdminAssets.tsx
git commit -m "feat: add Vendor Preferences section to Client Profile"
```

---

## Final Verification

After all 3 tasks:
- [ ] `npm run build:client` clean.
- [ ] Manual dev-server check per Task 2 Step 4 and Task 3 Step 4.
- [ ] Confirm no server-side files were touched anywhere in this plan's diff.
- [ ] Memory file `project_viq.md` updated: Vendor Assignment Engine sub-project 3a complete.
