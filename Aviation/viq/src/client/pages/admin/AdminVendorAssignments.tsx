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
