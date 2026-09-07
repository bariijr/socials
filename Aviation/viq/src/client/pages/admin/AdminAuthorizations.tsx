import { useState, useEffect } from 'react';
import {
  getPermitAuthorizationList, savePermitAuthorization, verifyPermitAuthorization, revokePermitAuthorization,
  getOperatorList, getCountryList,
} from '@/lib/dataStore';
import type { PermitAuthorization, AuthorizationType } from '@/lib/dataStore';
import { useAuth } from '@/lib/authContext';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { MasterDetailList, EntityListCard, DetailPanel } from '@/components/ui/master-detail-list';
import { MasterDetailShell } from '@/components/ui/master-detail-shell';
import { FileCheck } from 'lucide-react';

const AUTHORIZATION_TYPES: AuthorizationType[] = ['Blanket', 'Block', 'Seasonal'];
const SERVICE_TYPES = ['Permit', 'Overflight'] as const;

function isExpired(a: PermitAuthorization): boolean {
  return new Date(a.ValidUntil).getTime() < Date.now();
}

// AdminAssets.tsx's useSelection()/PanelActions helpers are private to that
// file (not exported) — this tab replicates the same tiny pattern locally
// rather than exporting them out of an unrelated file for one new caller.
function useAuthSelection() {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  return {
    selectedId, adding,
    select: (id: string) => { setSelectedId(id); setAdding(false); },
    startAdd: () => { setSelectedId(null); setAdding(true); },
    clear: () => { setSelectedId(null); setAdding(false); },
  };
}

function AuthorizationPanel({ authorization, isNew, isAdmin, onSaved, onCancel }: {
  authorization: PermitAuthorization | null; isNew: boolean; isAdmin: boolean;
  onSaved: (id: string) => void; onCancel: () => void;
}) {
  const [operators, setOperators] = useState<{ OperatorID: string; Name: string }[]>([]);
  const [countries, setCountries] = useState<{ ISO2: string; Name: string }[]>([]);
  useEffect(() => {
    setOperators(getOperatorList());
    setCountries(getCountryList());
  }, []);

  const [operatorId, setOperatorId] = useState(authorization?.OperatorID || '');
  const [countryIso2, setCountryIso2] = useState(authorization?.CountryISO2 || '');
  const [serviceType, setServiceType] = useState(authorization?.ServiceType || 'Overflight');
  const [authorizationType, setAuthorizationType] = useState<AuthorizationType>(authorization?.AuthorizationType || 'Blanket');
  const [referenceNumber, setReferenceNumber] = useState(authorization?.ReferenceNumber || '');
  const [validFrom, setValidFrom] = useState(authorization?.ValidFrom?.slice(0, 10) || '');
  const [validUntil, setValidUntil] = useState(authorization?.ValidUntil?.slice(0, 10) || '');
  const [notes, setNotes] = useState(authorization?.Notes || '');
  const [saving, setSaving] = useState(false);

  const canEditFields = isAdmin && (isNew || authorization?.Status === 'Draft');
  const valid = operatorId && countryIso2 && referenceNumber.trim() && validFrom && validUntil;

  const handleSave = async () => {
    if (!canEditFields || !valid) return;
    setSaving(true);
    try {
      const saved = await savePermitAuthorization({
        ID: authorization?.ID,
        OperatorID: operatorId,
        CountryISO2: countryIso2,
        ServiceType: serviceType,
        AuthorizationType: authorizationType,
        ReferenceNumber: referenceNumber.trim(),
        ValidFrom: new Date(validFrom).toISOString(),
        ValidUntil: new Date(validUntil + 'T23:59:59.999Z').toISOString(),
        Notes: notes.trim() || undefined,
      });
      onSaved(saved.ID);
    } finally {
      setSaving(false);
    }
  };

  const handleVerify = async () => {
    if (!authorization || !isAdmin) return;
    setSaving(true);
    try {
      const updated = await verifyPermitAuthorization(authorization.ID);
      onSaved(updated.ID);
    } finally {
      setSaving(false);
    }
  };

  const handleRevoke = async () => {
    if (!authorization || !isAdmin) return;
    setSaving(true);
    try {
      const updated = await revokePermitAuthorization(authorization.ID);
      onSaved(updated.ID);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base font-semibold">
          {isNew ? 'Add Authorization' : `Edit ${authorization?.ReferenceNumber}`}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {authorization && (
          <div className="flex items-center gap-2">
            <Badge variant={authorization.Status === 'Verified' ? 'default' : 'outline'}>{authorization.Status}</Badge>
            {authorization.Status === 'Verified' && isExpired(authorization) && (
              <Badge variant="outline" className="text-amber-600">Expired</Badge>
            )}
          </div>
        )}
        <div className="space-y-1">
          <Label>Operator</Label>
          <Select value={operatorId} onValueChange={setOperatorId} disabled={!canEditFields}>
            <SelectTrigger><SelectValue placeholder="Select operator" /></SelectTrigger>
            <SelectContent>
              {operators.map((o) => <SelectItem key={o.OperatorID} value={o.OperatorID}>{o.Name}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1">
          <Label>Country</Label>
          <Select value={countryIso2} onValueChange={setCountryIso2} disabled={!canEditFields}>
            <SelectTrigger><SelectValue placeholder="Select country" /></SelectTrigger>
            <SelectContent>
              {countries.map((c) => <SelectItem key={c.ISO2} value={c.ISO2}>{c.Name}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1">
            <Label>Service Type</Label>
            <Select value={serviceType} onValueChange={setServiceType} disabled={!canEditFields}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {SERVICE_TYPES.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <Label>Authorization Type</Label>
            <Select value={authorizationType} onValueChange={(v) => setAuthorizationType(v as AuthorizationType)} disabled={!canEditFields}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {AUTHORIZATION_TYPES.map((t) => <SelectItem key={t} value={t}>{t}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
        </div>
        <div className="space-y-1">
          <Label>Reference Number</Label>
          <Input value={referenceNumber} onChange={(e) => setReferenceNumber(e.target.value)} disabled={!canEditFields} />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1">
            <Label>Valid From</Label>
            <Input type="date" value={validFrom} onChange={(e) => setValidFrom(e.target.value)} disabled={!canEditFields} />
          </div>
          <div className="space-y-1">
            <Label>Valid Until</Label>
            <Input type="date" value={validUntil} onChange={(e) => setValidUntil(e.target.value)} disabled={!canEditFields} />
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
          {!isNew && authorization?.Status === 'Draft' && isAdmin && (
            <Button onClick={handleVerify} disabled={saving}>Verify</Button>
          )}
          {!isNew && authorization?.Status === 'Verified' && isAdmin && (
            <Button onClick={handleRevoke} disabled={saving} variant="destructive">Revoke</Button>
          )}
          <div className="flex-1" />
          <Button variant="outline" onClick={onCancel}>Cancel</Button>
        </div>
      </CardContent>
    </Card>
  );
}

export function AuthorizationsTab() {
  const { isAdmin } = useAuth();
  const [authorizations, setAuthorizations] = useState<PermitAuthorization[]>([]);
  useEffect(() => { setAuthorizations(getPermitAuthorizationList()); }, []);
  const sel = useAuthSelection();
  const refresh = () => setAuthorizations(getPermitAuthorizationList());
  const selected = authorizations.find((a) => a.ID === sel.selectedId) || null;

  return (
    <MasterDetailShell
      heightClassName="h-[calc(100vh-14rem)]"
      listWidthClassName="md:w-64 lg:w-96"
      detailOpen={!!(sel.selectedId || sel.adding)}
      onDetailOpenChange={(open) => { if (!open) sel.clear(); }}
      detailTitle={selected?.ReferenceNumber ?? (sel.adding ? 'Add Authorization' : undefined)}
      list={
        <MasterDetailList
          title="Authorizations" subtitle={`${authorizations.length} total`} items={authorizations}
          getId={(a) => a.ID} searchText={(a) => `${a.OperatorID} ${a.CountryISO2} ${a.ReferenceNumber}`}
          viewStorageKey="viq_assets_authorizations_view" selectedId={sel.selectedId || (sel.adding ? 'new' : null)}
          onSelect={sel.select} onAddNew={sel.startAdd} addLabel="Add Authorization" canAdd={isAdmin}
          emptyText="No permit authorizations yet"
          renderItem={(a, { viewMode, selected: isSelected }) => (
            <EntityListCard
              viewMode={viewMode} selected={isSelected}
              icon={<FileCheck className="h-4 w-4 text-muted-foreground" />}
              title={a.ReferenceNumber}
              subtitle={`${a.OperatorID} — ${a.CountryISO2} — ${a.AuthorizationType}`}
              badges={<Badge variant={a.Status === 'Verified' ? 'default' : 'outline'} className="text-[10px]">{a.Status}</Badge>}
            />
          )}
        />
      }
      detail={
        <DetailPanel empty={!selected && !sel.adding}>
          {!selected && !sel.adding ? 'Select an authorization from the left, or add a new one' : (
            <AuthorizationPanel
              key={selected?.ID ?? 'new'}
              authorization={selected} isNew={sel.adding} isAdmin={isAdmin}
              onSaved={(id) => { refresh(); sel.select(id); }}
              onCancel={sel.clear}
            />
          )}
        </DetailPanel>
      }
    />
  );
}
