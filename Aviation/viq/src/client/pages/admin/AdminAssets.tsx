import { useState, useEffect } from 'react';
import { Link } from 'react-router';
import {
  getAircraftList, saveAircraft, deleteAircraft,
  getProviderList, saveProvider, deleteProvider,
  getAirportList, saveAirport, deleteAirport,
  getCountryList, saveCountry, deleteCountry,
  getOperatorList, saveOperator, deleteOperator,
  getPersonRoster, savePerson, deletePerson, getCountry, normalizeRegistration,
  getRosterExpiryStatuses,
  getCountryFeeList, saveCountryFee, deleteCountryFee,
  getClientList, saveClient, deleteClient,
  getPreferredContact, getVendorAssignmentList,
  createVendorCapabilityRequest,
} from '@/lib/dataStore';
import type { RosterExpiryEntry, Operator, CountryFee, Client, VendorAssignment } from '@/lib/dataStore';
import type { Aircraft, Provider, Airport, Country, Person, PersonRole, ServiceType, ContactChannel } from '@/data/types';
import { useAuth } from '@/lib/authContext';
import { ExpiryBadge } from '@/components/ExpiryBadge';
import { ContactChannelEditor } from '@/components/ContactChannelEditor';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { MasterDetailList, EntityListCard, DetailPanel } from '@/components/ui/master-detail-list';
import { MasterDetailShell } from '@/components/ui/master-detail-shell';
import { Plane, Building2, MapPin, Globe, Users, AlertTriangle, Receipt, Briefcase, ArrowRight, FileCheck, Copy } from 'lucide-react';
import { AuthorizationsTab } from './AdminAuthorizations';
import { VendorAssignmentsTab, contextSummary, providerName } from './AdminVendorAssignments';

const SERVICE_TYPES: ServiceType[] = [
  'Permit', 'Overflight', 'GroundHandling', 'Fuel', 'Catering',
  'CrewTransport', 'Customs', 'Hotel', 'Slot', 'PPR',
];
const PERSON_ROLES: PersonRole[] = [
  'PIC', 'SIC', 'FA', 'Mechanic', 'Engineer', 'Medical Staff', 'Other', 'Pax', 'VIP', 'Principal',
];
const FEE_TYPES = [
  'Overfly Permit Fee', 'Landing Permit Fee', 'VSAT', 'NAFISAT', 'ASECNA',
  'Navigation Fee', 'CAA Fee', 'Billing Info', 'Other',
];

// ─── Shared selection state ─────────────────────────────────────────────────
// One instance per tab: which item is open in the right-hand panel, or
// whether the panel is showing a blank "new" form. Mirrors AdminTrips'
// selectedTripId pattern so every tab follows the same select → edit-in-place
// flow instead of a modal dialog.
function useSelection() {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  return {
    selectedId, adding,
    select: (id: string) => { setSelectedId(id); setAdding(false); },
    startAdd: () => { setSelectedId(null); setAdding(true); },
    clear: () => { setSelectedId(null); setAdding(false); },
  };
}

function PanelActions({ onCancel, onDelete, onSave, saveDisabled, saveLabel = 'Save', showDelete }: {
  onCancel: () => void;
  onDelete?: () => void;
  onSave: () => void;
  saveDisabled?: boolean;
  saveLabel?: string;
  showDelete?: boolean;
}) {
  return (
    <div className="flex items-center gap-2">
      {showDelete && onDelete && (
        <Button variant="ghost" className="text-destructive hover:text-destructive" onClick={onDelete}>
          Delete
        </Button>
      )}
      <div className="flex-1" />
      <Button variant="outline" onClick={onCancel}>Cancel</Button>
      <Button onClick={onSave} disabled={saveDisabled}>{saveLabel}</Button>
    </div>
  );
}

// ─── Aircraft ───────────────────────────────────────────────────────────────

function AircraftPanel({ aircraft, isNew, isAdmin, onSaved, onDeleted, onCancel }: {
  aircraft: Aircraft | null; isNew: boolean; isAdmin: boolean;
  onSaved: (reg: string) => void; onDeleted: () => void; onCancel: () => void;
}) {
  const [registration, setRegistration] = useState(aircraft?.Registration || '');
  const [icaoType, setIcaoType] = useState(aircraft?.ICAOType || '');
  const [manufacturer, setManufacturer] = useState(aircraft?.Manufacturer || '');
  const [mtow, setMtow] = useState(String(aircraft?.MTOW_kg ?? ''));
  const [noiseCert, setNoiseCert] = useState(aircraft?.NoiseCert || '');
  const [operatorId, setOperatorId] = useState(aircraft?.CurrentOperatorID || '');
  const [colors, setColors] = useState(aircraft?.Colors || '');
  const [operationType, setOperationType] = useState(aircraft?.OperationType || '');
  const [serialNumber, setSerialNumber] = useState(aircraft?.SerialNumber || '');
  const [maxRange, setMaxRange] = useState(String(aircraft?.MaxRangeOverrideNm ?? ''));
  const [fuelBurn, setFuelBurn] = useState(String(aircraft?.FuelBurnOverrideKgPerHour ?? ''));
  const [operators, setOperators] = useState<Operator[]>([]);
  useEffect(() => { setOperators(getOperatorList()); }, []);

  const valid = registration.trim() && icaoType.trim() && operatorId;

  const handleSave = async () => {
    if (!isAdmin || !valid) return;
    await saveAircraft({
      Registration: registration.trim(),
      ICAOType: icaoType.trim(),
      Manufacturer: manufacturer.trim(),
      MTOW_kg: Number(mtow) || 0,
      NoiseCert: noiseCert.trim(),
      CurrentOperatorID: operatorId,
      Colors: colors.trim() || undefined,
      OperationType: operationType.trim() || undefined,
      SerialNumber: serialNumber.trim() || undefined,
      MaxRangeOverrideNm: maxRange ? Number(maxRange) : undefined,
      FuelBurnOverrideKgPerHour: fuelBurn ? Number(fuelBurn) : undefined,
    });
    onSaved(registration.trim());
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base font-semibold">{isNew ? 'Add Aircraft' : `Edit ${aircraft?.Registration}`}</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="space-y-1">
          <Label>Registration</Label>
          <Input value={registration} onChange={(e) => setRegistration(normalizeRegistration(e.target.value))} disabled={!isNew} />
        </div>
        <div className="space-y-1">
          <Label>ICAO Type</Label>
          <Input value={icaoType} onChange={(e) => setIcaoType(e.target.value.toUpperCase())} placeholder="e.g. GLF6" />
        </div>
        <div className="space-y-1">
          <Label>Manufacturer</Label>
          <Input value={manufacturer} onChange={(e) => setManufacturer(e.target.value)} />
        </div>
        <div className="space-y-1">
          <Label>MTOW (kg)</Label>
          <Input type="number" value={mtow} onChange={(e) => setMtow(e.target.value)} />
        </div>
        <div className="space-y-1">
          <Label>Noise Certification</Label>
          <Input value={noiseCert} onChange={(e) => setNoiseCert(e.target.value)} />
        </div>
        <div className="space-y-1">
          <Label>Operator (required)</Label>
          <Select value={operatorId} onValueChange={setOperatorId}>
            <SelectTrigger><SelectValue placeholder="Select operator" /></SelectTrigger>
            <SelectContent>
              {operators.map((o) => <SelectItem key={o.OperatorID} value={o.OperatorID}>{o.Name}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1">
            <Label>Serial Number</Label>
            <Input value={serialNumber} onChange={(e) => setSerialNumber(e.target.value)} />
          </div>
          <div className="space-y-1">
            <Label>Colors</Label>
            <Input value={colors} onChange={(e) => setColors(e.target.value)} placeholder="e.g. White with blue stripe" />
          </div>
        </div>
        <div className="space-y-1">
          <Label>Operation Type</Label>
          <Input value={operationType} onChange={(e) => setOperationType(e.target.value)} placeholder="e.g. Part 135, Charter, Private" />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1">
            <Label>Max Range Override (nm)</Label>
            <Input type="number" value={maxRange} onChange={(e) => setMaxRange(e.target.value)} />
          </div>
          <div className="space-y-1">
            <Label>Fuel Burn Override (kg/hr)</Label>
            <Input type="number" value={fuelBurn} onChange={(e) => setFuelBurn(e.target.value)} />
          </div>
        </div>
        <PanelActions
          onCancel={onCancel}
          onSave={handleSave}
          saveDisabled={!isAdmin || !valid}
          showDelete={!isNew}
          onDelete={async () => { if (!isAdmin || !aircraft) return; await deleteAircraft(aircraft.Registration); onDeleted(); }}
        />
      </CardContent>
    </Card>
  );
}

// ─── Vendors (Providers) ────────────────────────────────────────────────────

function ProviderPanel({ provider, isNew, isAdmin, onSaved, onDeleted, onCancel }: {
  provider: Provider | null; isNew: boolean; isAdmin: boolean;
  onSaved: (id: string) => void; onDeleted: () => void; onCancel: () => void;
}) {
  const [name, setName] = useState(provider?.Name || '');
  const [scopeType, setScopeType] = useState<Provider['ScopeType']>(provider?.ScopeType || 'ICAO');
  const [scope, setScope] = useState(provider?.Scope || '');
  const [channels, setChannels] = useState<ContactChannel[]>(provider?.Channels ?? []);
  const [workingHours, setWorkingHours] = useState(provider?.WorkingHoursZ || 'H24');
  const [serviceTypes, setServiceTypes] = useState<ServiceType[]>(provider?.ServiceTypes || []);

  const toggleServiceType = (st: ServiceType) => {
    setServiceTypes((prev) => prev.includes(st) ? prev.filter((x) => x !== st) : [...prev, st]);
  };

  // "Request Capability Confirmation" — sends the vendor a token-gated
  // questionnaire link (Task 4/5's backend). Only meaningful for an
  // already-saved provider (isNew has no ProviderID yet to attach it to).
  const [showCapabilityRequest, setShowCapabilityRequest] = useState(false);
  const [reqServiceType, setReqServiceType] = useState<ServiceType>(SERVICE_TYPES[0]);
  const [reqScopeType, setReqScopeType] = useState<'ICAO' | 'Country'>('ICAO');
  const [reqScopeValue, setReqScopeValue] = useState('');
  const [reqSending, setReqSending] = useState(false);
  const [reqError, setReqError] = useState('');
  const [reqLink, setReqLink] = useState<string | null>(null);
  const [reqCopied, setReqCopied] = useState(false);

  const openCapabilityRequest = () => {
    setShowCapabilityRequest(true);
    setReqServiceType(SERVICE_TYPES[0]);
    setReqScopeType('ICAO');
    setReqScopeValue('');
    setReqError('');
    setReqLink(null);
  };

  const handleSendCapabilityRequest = async () => {
    if (!isAdmin || !provider || !reqScopeValue.trim()) return;
    setReqSending(true);
    setReqError('');
    try {
      const created = await createVendorCapabilityRequest({
        providerId: provider.ProviderID,
        serviceType: reqServiceType,
        countryIso2: reqScopeType === 'Country' ? reqScopeValue.trim().toUpperCase() : undefined,
        icao: reqScopeType === 'ICAO' ? reqScopeValue.trim().toUpperCase() : undefined,
      });
      // There is no email-sending in this MVP — Admin copies the link below
      // and sends it manually (see this plan's Global Constraints scope).
      setReqLink(`${window.location.origin}/vendor-capability/${created.token}`);
    } catch {
      setReqError('Could not create the capability request — try again.');
    } finally {
      setReqSending(false);
    }
  };

  const handleCopyCapabilityLink = () => {
    if (!reqLink) return;
    navigator.clipboard.writeText(reqLink);
    setReqCopied(true);
    setTimeout(() => setReqCopied(false), 2000);
  };

  const valid = name.trim();

  const handleSave = async () => {
    if (!isAdmin || !valid) return;
    // Empty, not a user-typed value, for a new provider: the server
    // assigns the real ID atomically (ReferenceService.nextProviderId())
    // and this placeholder only needs to miss every real ProviderID so
    // saveProvider's exists-check routes to POST, not PATCH. The saved
    // result (not this placeholder) carries the real ID onward.
    const id = provider?.ProviderID || '';
    const saved = await saveProvider({
      ProviderID: id,
      Name: name.trim(),
      ServiceTypes: serviceTypes,
      ScopeType: scopeType,
      Scope: scopeType === 'Global' ? 'Global' : scope.trim(),
      WorkingHoursZ: workingHours.trim(),
      Channels: channels,
    });
    onSaved(saved.ProviderID);
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base font-semibold">{isNew ? 'Add Vendor' : `Edit ${provider?.Name}`}</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1">
            <Label>Provider ID</Label>
            <div className="text-sm text-muted-foreground py-2">
              {isNew ? 'Assigned automatically on save' : provider?.ProviderID}
            </div>
          </div>
          <div className="space-y-1">
            <Label>Name</Label>
            <Input value={name} onChange={(e) => setName(e.target.value)} />
          </div>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1">
            <Label>Scope Type</Label>
            <Select value={scopeType} onValueChange={(v) => setScopeType(v as Provider['ScopeType'])}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="ICAO">ICAO (airport)</SelectItem>
                <SelectItem value="Country">Country</SelectItem>
                <SelectItem value="Global">Global</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <Label>Scope Value</Label>
            <Input
              value={scope}
              onChange={(e) => setScope(e.target.value.toUpperCase())}
              placeholder={scopeType === 'ICAO' ? 'e.g. OMDB' : scopeType === 'Country' ? 'e.g. SA' : 'Global'}
              disabled={scopeType === 'Global'}
            />
          </div>
        </div>
        <ContactChannelEditor channels={channels} onChange={setChannels} />
        <div className="space-y-1">
          <Label>Working Hours</Label>
          <Input value={workingHours} onChange={(e) => setWorkingHours(e.target.value)} />
        </div>
        <div className="space-y-1">
          <Label>Service Types</Label>
          <div className="flex flex-wrap gap-2">
            {SERVICE_TYPES.map((st) => (
              <Badge
                key={st}
                variant={serviceTypes.includes(st) ? 'default' : 'outline'}
                className="cursor-pointer select-none"
                onClick={() => toggleServiceType(st)}
              >
                {st}
              </Badge>
            ))}
          </div>
        </div>
        {!isNew && provider && (
          <div className="space-y-2 border-t pt-3">
            {!showCapabilityRequest ? (
              <Button type="button" variant="outline" size="sm" onClick={openCapabilityRequest}>
                Request Capability Confirmation
              </Button>
            ) : (
              <div className="space-y-3 rounded-md border p-3">
                <Label className="text-sm font-medium">Request Capability Confirmation</Label>
                {!reqLink ? (
                  <>
                    <div className="grid grid-cols-2 gap-3">
                      <div className="space-y-1">
                        <Label>Service Type</Label>
                        <Select value={reqServiceType} onValueChange={(v) => setReqServiceType(v as ServiceType)}>
                          <SelectTrigger><SelectValue /></SelectTrigger>
                          <SelectContent>
                            {SERVICE_TYPES.map((st) => <SelectItem key={st} value={st}>{st}</SelectItem>)}
                          </SelectContent>
                        </Select>
                      </div>
                      <div className="space-y-1">
                        <Label>Scope</Label>
                        <Select value={reqScopeType} onValueChange={(v) => { setReqScopeType(v as 'ICAO' | 'Country'); setReqScopeValue(''); }}>
                          <SelectTrigger><SelectValue /></SelectTrigger>
                          <SelectContent>
                            <SelectItem value="ICAO">ICAO (airport)</SelectItem>
                            <SelectItem value="Country">Country ISO2</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                    </div>
                    <div className="space-y-1">
                      <Label>{reqScopeType === 'ICAO' ? 'ICAO Code' : 'Country ISO2'}</Label>
                      <Input
                        value={reqScopeValue}
                        onChange={(e) => setReqScopeValue(e.target.value.toUpperCase())}
                        placeholder={reqScopeType === 'ICAO' ? 'e.g. OMDB' : 'e.g. SA'}
                      />
                    </div>
                    {reqError && <p className="text-xs text-destructive">{reqError}</p>}
                    <div className="flex items-center gap-2">
                      <Button type="button" size="sm" variant="outline" onClick={() => setShowCapabilityRequest(false)}>Cancel</Button>
                      <Button type="button" size="sm" disabled={!reqScopeValue.trim() || reqSending} onClick={handleSendCapabilityRequest}>
                        {reqSending ? 'Sending…' : 'Send Request'}
                      </Button>
                    </div>
                  </>
                ) : (
                  <div className="space-y-2">
                    <p className="text-xs text-muted-foreground">
                      Share this link with the vendor — there is no automatic email in this MVP.
                    </p>
                    <div className="flex items-center gap-2">
                      <Input readOnly value={reqLink} onFocus={(e) => e.target.select()} />
                      <Button type="button" size="sm" variant="outline" onClick={handleCopyCapabilityLink}>
                        <Copy className="mr-1 h-3.5 w-3.5" />
                        {reqCopied ? 'Copied!' : 'Copy'}
                      </Button>
                    </div>
                    <Button type="button" size="sm" variant="ghost" onClick={() => setShowCapabilityRequest(false)}>Done</Button>
                  </div>
                )}
              </div>
            )}
          </div>
        )}
        <PanelActions
          onCancel={onCancel}
          onSave={handleSave}
          saveDisabled={!isAdmin || !valid}
          showDelete={!isNew}
          onDelete={async () => { if (!isAdmin || !provider) return; await deleteProvider(provider.ProviderID); onDeleted(); }}
        />
      </CardContent>
    </Card>
  );
}

// ─── Airports ───────────────────────────────────────────────────────────────

function AirportPanel({ airport, isNew, isAdmin, onSaved, onDeleted, onCancel }: {
  airport: Airport | null; isNew: boolean; isAdmin: boolean;
  onSaved: (icao: string) => void; onDeleted: () => void; onCancel: () => void;
}) {
  const [icao, setIcao] = useState(airport?.ICAO || '');
  const [iata, setIata] = useState(airport?.IATA || '');
  const [name, setName] = useState(airport?.Name || '');
  const [city, setCity] = useState(airport?.City || '');
  const [countryISO2, setCountryISO2] = useState(airport?.CountryISO2 || '');
  const [tz, setTz] = useState(airport?.TZ || '');
  const [lat, setLat] = useState(String(airport?.Latitude ?? ''));
  const [lng, setLng] = useState(String(airport?.Longitude ?? ''));

  const valid = icao.trim() && name.trim();

  const handleSave = async () => {
    if (!isAdmin || !valid) return;
    await saveAirport({
      ICAO: icao.trim().toUpperCase(),
      IATA: iata.trim().toUpperCase(),
      Name: name.trim(),
      City: city.trim(),
      CountryISO2: countryISO2.trim().toUpperCase(),
      TZ: tz.trim(),
      Latitude: Number(lat) || 0,
      Longitude: Number(lng) || 0,
      ElevationFt: airport?.ElevationFt ?? 0,
      RunwayLengthFt: airport?.RunwayLengthFt ?? 0,
      Category: airport?.Category ?? 'Unclassified',
      FBOCount: airport?.FBOCount ?? 0,
    });
    onSaved(icao.trim().toUpperCase());
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base font-semibold">{isNew ? 'Add Airport' : `Edit ${airport?.ICAO}`}</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1">
            <Label>ICAO</Label>
            <Input value={icao} onChange={(e) => setIcao(e.target.value.toUpperCase())} disabled={!isNew} />
          </div>
          <div className="space-y-1">
            <Label>IATA</Label>
            <Input value={iata} onChange={(e) => setIata(e.target.value.toUpperCase())} />
          </div>
        </div>
        <div className="space-y-1">
          <Label>Name</Label>
          <Input value={name} onChange={(e) => setName(e.target.value)} />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1">
            <Label>City</Label>
            <Input value={city} onChange={(e) => setCity(e.target.value)} />
          </div>
          <div className="space-y-1">
            <Label>Country ISO2</Label>
            <Input value={countryISO2} onChange={(e) => setCountryISO2(e.target.value.toUpperCase())} />
          </div>
        </div>
        <div className="space-y-1">
          <Label>Timezone</Label>
          <Input value={tz} onChange={(e) => setTz(e.target.value)} placeholder="e.g. Europe/London" />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1">
            <Label>Latitude</Label>
            <Input type="number" step="0.0001" value={lat} onChange={(e) => setLat(e.target.value)} />
          </div>
          <div className="space-y-1">
            <Label>Longitude</Label>
            <Input type="number" step="0.0001" value={lng} onChange={(e) => setLng(e.target.value)} />
          </div>
        </div>
        <PanelActions
          onCancel={onCancel}
          onSave={handleSave}
          saveDisabled={!isAdmin || !valid}
          showDelete={!isNew}
          onDelete={async () => { if (!isAdmin || !airport) return; await deleteAirport(airport.ICAO); onDeleted(); }}
        />
      </CardContent>
    </Card>
  );
}

// ─── Countries ──────────────────────────────────────────────────────────────

function CountryPanel({ country, isNew, isAdmin, onSaved, onDeleted, onCancel }: {
  country: Country | null; isNew: boolean; isAdmin: boolean;
  onSaved: (iso2: string) => void; onDeleted: () => void; onCancel: () => void;
}) {
  const [name, setName] = useState(country?.Name || '');
  const [iso2, setIso2] = useState(country?.ISO2 || '');
  const [region, setRegion] = useState(country?.Region || '');
  const [overflight, setOverflight] = useState(country?.OverflightPermitRequired ?? false);
  const [landing, setLanding] = useState(country?.LandingPermitRequired ?? false);
  const [aocDocs, setAocDocs] = useState(country?.AOCDocsRequired ?? false);
  const [escalationContact, setEscalationContact] = useState(country?.EscalationContact || '');
  const [centroidLat, setCentroidLat] = useState(String(country?.CentroidLat ?? ''));
  const [centroidLng, setCentroidLng] = useState(String(country?.CentroidLng ?? ''));

  const valid = iso2.trim() && name.trim();

  const handleSave = async () => {
    if (!isAdmin || !valid) return;
    await saveCountry({
      Name: name.trim(),
      ISO2: iso2.trim().toUpperCase(),
      Region: region.trim(),
      CentroidLat: Number(centroidLat) || 0,
      CentroidLng: Number(centroidLng) || 0,
      OverflightPermitRequired: overflight,
      LandingPermitRequired: landing,
      AOCDocsRequired: aocDocs,
      EscalationContact: escalationContact.trim(),
    });
    onSaved(iso2.trim().toUpperCase());
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base font-semibold">{isNew ? 'Add Country' : `Edit ${country?.Name}`}</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1">
            <Label>Name</Label>
            <Input value={name} onChange={(e) => setName(e.target.value)} />
          </div>
          <div className="space-y-1">
            <Label>ISO2</Label>
            <Input value={iso2} onChange={(e) => setIso2(e.target.value.toUpperCase())} disabled={!isNew} />
          </div>
        </div>
        <div className="space-y-1">
          <Label>Region</Label>
          <Input value={region} onChange={(e) => setRegion(e.target.value)} />
        </div>
        <div className="space-y-1">
          <Label>Escalation Contact</Label>
          <Input value={escalationContact} onChange={(e) => setEscalationContact(e.target.value)} />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1">
            <Label>Centroid Latitude</Label>
            <Input type="number" step="0.1" value={centroidLat} onChange={(e) => setCentroidLat(e.target.value)} />
          </div>
          <div className="space-y-1">
            <Label>Centroid Longitude</Label>
            <Input type="number" step="0.1" value={centroidLng} onChange={(e) => setCentroidLng(e.target.value)} />
          </div>
        </div>
        <div className="space-y-2">
          <label className="flex items-center gap-2 text-sm">
            <Checkbox checked={landing} onCheckedChange={(v) => setLanding(v === true)} />
            Landing Permit Required
          </label>
          <label className="flex items-center gap-2 text-sm">
            <Checkbox checked={overflight} onCheckedChange={(v) => setOverflight(v === true)} />
            Overflight Permit Required
          </label>
          <label className="flex items-center gap-2 text-sm">
            <Checkbox checked={aocDocs} onCheckedChange={(v) => setAocDocs(v === true)} />
            AOC Docs Required
          </label>
        </div>
        <PanelActions
          onCancel={onCancel}
          onSave={handleSave}
          saveDisabled={!isAdmin || !valid}
          showDelete={!isNew}
          onDelete={async () => { if (!isAdmin || !country) return; await deleteCountry(country.ISO2); onDeleted(); }}
        />
      </CardContent>
    </Card>
  );
}

// ─── Persons ────────────────────────────────────────────────────────────────

function PersonPanel({ person, isNew, canEdit, onSaved, onDeleted, onCancel }: {
  person: Person | null; isNew: boolean; canEdit: boolean;
  onSaved: (id: string) => void; onDeleted: () => void; onCancel: () => void;
}) {
  const [name, setName] = useState(person?.Name || '');
  const [role, setRole] = useState<PersonRole>(person?.DefaultRole || 'Pax');
  const [channels, setChannels] = useState<ContactChannel[]>(person?.Channels ?? []);
  const [licenceNumber, setLicenceNumber] = useState(person?.LicenceNumber || '');

  const valid = name.trim();

  const handleSave = async () => {
    if (!canEdit || !valid) return;
    const id = person?.PersonID || `PER-${Date.now()}`;
    await savePerson({
      PersonID: id,
      Name: name.trim(),
      DefaultRole: role,
      Channels: channels,
      LicenceNumber: licenceNumber.trim() || undefined,
    });
    onSaved(id);
  };

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between gap-2">
        <CardTitle className="text-base font-semibold">{isNew ? 'Add Person' : `Edit ${person?.Name}`}</CardTitle>
        {!isNew && person && (
          <Button asChild variant="outline" size="sm">
            <Link to={`/admin/persons/${person.PersonID}`}>
              Full Profile <ArrowRight className="ml-1 h-3.5 w-3.5" />
            </Link>
          </Button>
        )}
      </CardHeader>
      <CardContent className="space-y-3">
        {!isNew && (
          <p className="text-xs text-muted-foreground">
            Passport, medical, ratings, docs and trip assignments are managed on the person's full profile.
          </p>
        )}
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1">
            <Label>Name</Label>
            <Input value={name} onChange={(e) => setName(e.target.value)} />
          </div>
          <div className="space-y-1">
            <Label>Role</Label>
            <Select value={role} onValueChange={(v) => setRole(v as PersonRole)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {PERSON_ROLES.map((r) => <SelectItem key={r} value={r}>{r}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
        </div>
        <ContactChannelEditor channels={channels} onChange={setChannels} />
        <div className="space-y-1">
          <Label>Licence Number (crew)</Label>
          <Input value={licenceNumber} onChange={(e) => setLicenceNumber(e.target.value)} />
        </div>
        <PanelActions
          onCancel={onCancel}
          onSave={handleSave}
          saveDisabled={!canEdit || !valid}
          showDelete={!isNew}
          onDelete={async () => { if (!canEdit || !person) return; await deletePerson(person.PersonID); onDeleted(); }}
        />
      </CardContent>
    </Card>
  );
}

// ─── Operators ──────────────────────────────────────────────────────────────

function OperatorPanel({ operator, isNew, isAdmin, onSaved, onDeleted, onCancel }: {
  operator: Operator | null; isNew: boolean; isAdmin: boolean;
  onSaved: (id: string) => void; onDeleted: () => void; onCancel: () => void;
}) {
  const [operatorId, setOperatorId] = useState(operator?.OperatorID || '');
  const [name, setName] = useState(operator?.Name || '');
  const [address, setAddress] = useState(operator?.Address || '');
  const [billingAddress, setBillingAddress] = useState(operator?.BillingAddress || '');
  const [channels, setChannels] = useState<ContactChannel[]>(operator?.Channels ?? []);
  const [primaryContact, setPrimaryContact] = useState(operator?.PrimaryContact || '');
  const [paymentTerms, setPaymentTerms] = useState(operator?.PaymentTerms || '');

  const valid = operatorId.trim() && name.trim();

  const handleSave = async () => {
    if (!isAdmin || !valid) return;
    await saveOperator({
      OperatorID: operatorId.trim().toUpperCase(),
      Name: name.trim(),
      Type: operator?.Type || '',
      Address: address.trim(),
      BillingAddress: billingAddress.trim(),
      Channels: channels,
      Fleet: operator?.Fleet || [],
      PrimaryContact: primaryContact.trim(),
      PaymentTerms: paymentTerms.trim(),
      Status: operator?.Status || 'Active',
      Notes: operator?.Notes || '',
    });
    onSaved(operatorId.trim().toUpperCase());
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base font-semibold">{isNew ? 'Add Operator' : `Edit ${operator?.Name}`}</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1">
            <Label>Operator ID</Label>
            <Input value={operatorId} onChange={(e) => setOperatorId(e.target.value.toUpperCase())} disabled={!isNew} />
          </div>
          <div className="space-y-1">
            <Label>Name</Label>
            <Input value={name} onChange={(e) => setName(e.target.value)} />
          </div>
        </div>
        <div className="space-y-1">
          <Label>Address</Label>
          <Input value={address} onChange={(e) => setAddress(e.target.value)} />
        </div>
        <div className="space-y-1">
          <Label>Billing Address (defaults to Address if blank)</Label>
          <Input value={billingAddress} onChange={(e) => setBillingAddress(e.target.value)} />
        </div>
        <ContactChannelEditor channels={channels} onChange={setChannels} />
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1">
            <Label>Primary Contact</Label>
            <Input value={primaryContact} onChange={(e) => setPrimaryContact(e.target.value)} />
          </div>
          <div className="space-y-1">
            <Label>Payment Terms</Label>
            <Input value={paymentTerms} onChange={(e) => setPaymentTerms(e.target.value)} placeholder="e.g. Net 30" />
          </div>
        </div>
        <PanelActions
          onCancel={onCancel}
          onSave={handleSave}
          saveDisabled={!isAdmin || !valid}
          showDelete={!isNew}
          onDelete={async () => { if (!isAdmin || !operator) return; await deleteOperator(operator.OperatorID); onDeleted(); }}
        />
      </CardContent>
    </Card>
  );
}

// ─── Clients ────────────────────────────────────────────────────────────────

function ClientPanel({ client, isNew, canEdit, operators, onSaved, onDeleted, onCancel }: {
  client: Client | null; isNew: boolean; canEdit: boolean; operators: Operator[];
  onSaved: (id: string) => void; onDeleted: () => void; onCancel: () => void;
}) {
  const [name, setName] = useState(client?.Name || '');
  const [isOperator, setIsOperator] = useState(client?.IsOperator || false);
  const [linkedOperatorId, setLinkedOperatorId] = useState(client?.LinkedOperatorID || '');
  const [channels, setChannels] = useState<ContactChannel[]>(client?.Channels ?? []);
  const [addr1, setAddr1] = useState(client?.BillingAddressLine1 || '');
  const [addr2, setAddr2] = useState(client?.BillingAddressLine2 || '');
  const [city, setCity] = useState(client?.BillingCity || '');
  const [state, setState] = useState(client?.BillingState || '');
  const [postalCode, setPostalCode] = useState(client?.BillingPostalCode || '');
  const [country, setCountry] = useState(client?.BillingCountry || '');
  const [notes, setNotes] = useState(client?.Notes || '');
  const [clientVendorAssignments, setClientVendorAssignments] = useState<VendorAssignment[]>([]);
  const [vendorAssignmentsLoadError, setVendorAssignmentsLoadError] = useState(false);
  const providers = getProviderList();
  useEffect(() => {
    if (client?.ClientID) {
      setVendorAssignmentsLoadError(false);
      getVendorAssignmentList({ clientId: client.ClientID })
        .then(setClientVendorAssignments)
        .catch(() => setVendorAssignmentsLoadError(true));
    } else {
      setClientVendorAssignments([]);
      setVendorAssignmentsLoadError(false);
    }
  }, [client?.ClientID]);

  const valid = name.trim();

  const handleSave = async () => {
    if (!canEdit || !valid) return;
    // Empty, not a fabricated CLI-... value, for a new client: the server
    // assigns the real ID atomically (ClientsService.nextClientId()) and
    // this placeholder only needs to miss every real ClientID so
    // saveClient's exists-check routes to POST, not PATCH. The saved
    // result (not this placeholder) carries the real ID onward.
    const id = client?.ClientID || '';
    const saved = await saveClient({
      ClientID: id,
      Name: name.trim(),
      IsOperator: isOperator,
      LinkedOperatorID: linkedOperatorId || undefined,
      BillingAddressLine1: addr1.trim() || undefined,
      BillingAddressLine2: addr2.trim() || undefined,
      BillingCity: city.trim() || undefined,
      BillingState: state.trim() || undefined,
      BillingPostalCode: postalCode.trim() || undefined,
      BillingCountry: country.trim() || undefined,
      Channels: channels,
      Notes: notes.trim() || undefined,
    });
    onSaved(saved.ClientID);
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base font-semibold">{isNew ? 'Add Client' : `Edit ${client?.Name}`}</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="space-y-1">
          <Label>Name</Label>
          <Input value={name} onChange={(e) => setName(e.target.value)} />
        </div>
        <ContactChannelEditor channels={channels} onChange={setChannels} />
        <div className="flex items-center gap-2">
          <Checkbox checked={isOperator} onCheckedChange={(v) => setIsOperator(!!v)} id="client-is-operator" />
          <Label htmlFor="client-is-operator">This client is (or manages on behalf of) an operator</Label>
        </div>
        {isOperator && (
          <div className="space-y-1">
            <Label>Linked Operator</Label>
            <Select value={linkedOperatorId} onValueChange={setLinkedOperatorId}>
              <SelectTrigger><SelectValue placeholder="Select operator…" /></SelectTrigger>
              <SelectContent>
                {operators.map((o) => <SelectItem key={o.OperatorID} value={o.OperatorID}>{o.Name}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
        )}
        <div className="space-y-1">
          <Label>Billing Address — Line 1</Label>
          <Input value={addr1} onChange={(e) => setAddr1(e.target.value)} />
        </div>
        <div className="space-y-1">
          <Label>Billing Address — Line 2</Label>
          <Input value={addr2} onChange={(e) => setAddr2(e.target.value)} />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1">
            <Label>City</Label>
            <Input value={city} onChange={(e) => setCity(e.target.value)} />
          </div>
          <div className="space-y-1">
            <Label>State / Region</Label>
            <Input value={state} onChange={(e) => setState(e.target.value)} />
          </div>
          <div className="space-y-1">
            <Label>Postal Code</Label>
            <Input value={postalCode} onChange={(e) => setPostalCode(e.target.value)} />
          </div>
          <div className="space-y-1">
            <Label>Country</Label>
            <Input value={country} onChange={(e) => setCountry(e.target.value)} />
          </div>
        </div>
        <div className="space-y-1">
          <Label>Notes</Label>
          <Input value={notes} onChange={(e) => setNotes(e.target.value)} />
        </div>
        {!isNew && client && (
          <div className="space-y-2 rounded-md border p-3">
            <div className="text-sm font-semibold">Vendor Preferences</div>
            {vendorAssignmentsLoadError ? (
              <p className="text-xs text-red-600">Couldn't load vendor preferences — try again.</p>
            ) : clientVendorAssignments.length === 0 ? (
              <p className="text-xs text-muted-foreground">No client-specific vendor overrides — this client uses the general rules.</p>
            ) : (
              <div className="space-y-1">
                {clientVendorAssignments.map((v) => (
                  <div key={v.ID} className="flex items-center justify-between text-xs">
                    <span>{providerName(v.ProviderID, providers)} — {contextSummary(v, [], false)}</span>
                    <div className="flex items-center gap-1">
                      {v.Prohibited ? (
                        <Badge variant="outline" className="text-[9px] text-red-600 border-red-300">DO NOT USE</Badge>
                      ) : (
                        <span className="text-muted-foreground">{v.Preferred ? 'Preferred, ' : ''}Rank {v.Rank}</span>
                      )}
                      {!v.Active && <Badge variant="outline" className="text-[9px] text-muted-foreground">Inactive</Badge>}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
        <PanelActions
          onCancel={onCancel}
          onSave={handleSave}
          saveDisabled={!canEdit || !valid}
          showDelete={!isNew}
          onDelete={async () => { if (!canEdit || !client) return; await deleteClient(client.ClientID); onDeleted(); }}
        />
      </CardContent>
    </Card>
  );
}

// ─── Country Fees ───────────────────────────────────────────────────────────

function CountryFeePanel({ fee, isNew, isAdmin, countries, onSaved, onDeleted, onCancel }: {
  fee: CountryFee | null; isNew: boolean; isAdmin: boolean; countries: Country[];
  onSaved: (id: string) => void; onDeleted: () => void; onCancel: () => void;
}) {
  const [countryIso2, setCountryIso2] = useState(fee?.CountryISO2 || '');
  const [feeType, setFeeType] = useState(fee?.FeeType || '');
  const [amount, setAmount] = useState(String(fee?.Amount ?? ''));
  const [currency, setCurrency] = useState(fee?.Currency || 'USD');
  const [unit, setUnit] = useState(fee?.Unit || '');
  const [notes, setNotes] = useState(fee?.Notes || '');

  const valid = countryIso2 && feeType.trim() && amount.trim();

  const handleSave = async () => {
    if (!isAdmin || !valid) return;
    const saved = await saveCountryFee({
      ID: fee?.ID,
      CountryISO2: countryIso2,
      FeeType: feeType.trim(),
      Amount: Number(amount) || 0,
      Currency: currency.trim() || 'USD',
      Unit: unit.trim() || undefined,
      Notes: notes.trim() || undefined,
    });
    onSaved(String(saved.ID));
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base font-semibold">{isNew ? 'Add Country Fee' : `Edit ${fee?.FeeType}`}</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="space-y-1">
          <Label>Country</Label>
          <Select value={countryIso2} onValueChange={setCountryIso2} disabled={!isNew}>
            <SelectTrigger><SelectValue placeholder="Select country" /></SelectTrigger>
            <SelectContent>
              {countries.map((c) => <SelectItem key={c.ISO2} value={c.ISO2}>{c.Name}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1">
          <Label>Fee Type</Label>
          <Select value={feeType} onValueChange={setFeeType}>
            <SelectTrigger><SelectValue placeholder="Select fee type" /></SelectTrigger>
            <SelectContent>
              {FEE_TYPES.map((t) => <SelectItem key={t} value={t}>{t}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        <div className="grid grid-cols-3 gap-3">
          <div className="space-y-1">
            <Label>Amount</Label>
            <Input type="number" value={amount} onChange={(e) => setAmount(e.target.value)} />
          </div>
          <div className="space-y-1">
            <Label>Currency</Label>
            <Input value={currency} onChange={(e) => setCurrency(e.target.value.toUpperCase())} />
          </div>
          <div className="space-y-1">
            <Label>Unit</Label>
            <Input value={unit} onChange={(e) => setUnit(e.target.value)} placeholder="e.g. per leg" />
          </div>
        </div>
        <div className="space-y-1">
          <Label>Notes</Label>
          <Input value={notes} onChange={(e) => setNotes(e.target.value)} />
        </div>
        <PanelActions
          onCancel={onCancel}
          onSave={handleSave}
          saveDisabled={!isAdmin || !valid}
          showDelete={!isNew}
          onDelete={async () => { if (!isAdmin || !fee) return; await deleteCountryFee(fee.ID); onDeleted(); }}
        />
      </CardContent>
    </Card>
  );
}

// ─── Expiry (read-only roster attention list, same select→detail flow) ─────

function ExpiryPanel({ entry }: { entry: RosterExpiryEntry }) {
  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between gap-2">
        <CardTitle className="text-base font-semibold">{entry.person.Name}</CardTitle>
        <Button asChild variant="outline" size="sm">
          <Link to={`/admin/persons/${entry.person.PersonID}`}>
            Full Profile <ArrowRight className="ml-1 h-3.5 w-3.5" />
          </Link>
        </Button>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="text-sm text-muted-foreground">Role: {entry.person.DefaultRole || '—'}</div>
        <div className="space-y-2">
          {entry.status.issues.map((issue, i) => (
            <div
              key={i}
              className={`rounded-md border px-3 py-2 text-sm ${
                issue.tone === 'soon' ? 'border-amber-300 bg-amber-50 text-amber-800' : 'border-rose-300 bg-rose-50 text-rose-800'
              }`}
            >
              {issue.label}
              {issue.tone === 'missing' ? ' — MISSING' : issue.tone === 'expired' ? ' — EXPIRED' : ` — EXPIRES SOON (${issue.date?.slice(0, 10)})`}
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}

// ─── Page ───────────────────────────────────────────────────────────────────

export default function AdminAssets() {
  const { canEdit, isAdmin } = useAuth();
  const [refreshKey, setRefreshKey] = useState(0);
  const refresh = () => setRefreshKey((k) => k + 1);

  const aircraftSel = useSelection();
  const vendorSel = useSelection();
  const airportSel = useSelection();
  const countrySel = useSelection();
  const personSel = useSelection();
  const operatorSel = useSelection();
  const clientSel = useSelection();
  const feeSel = useSelection();
  const expirySel = useSelection();

  const aircraft = getAircraftList();
  const providers = getProviderList();
  const airports = getAirportList();
  const countries = getCountryList();
  const operators = getOperatorList();
  const countryFees = getCountryFeeList();
  const clients = getClientList();
  const [persons, setPersons] = useState<Person[]>([]);
  const [expiryEntries, setExpiryEntries] = useState<RosterExpiryEntry[]>([]);
  useEffect(() => { getPersonRoster().then(setPersons); }, [refreshKey]);
  useEffect(() => { getRosterExpiryStatuses().then(setExpiryEntries); }, [refreshKey]);
  const expiryByPersonId: Record<string, RosterExpiryEntry> = {};
  expiryEntries.forEach((e) => { expiryByPersonId[e.person.PersonID] = e; });
  const attentionEntries = expiryEntries.filter((e) => e.status.issues.length > 0);

  const selectedAircraft = aircraft.find((a) => a.Registration === aircraftSel.selectedId) || null;
  const selectedProvider = providers.find((p) => p.ProviderID === vendorSel.selectedId) || null;
  const selectedAirport = airports.find((a) => a.ICAO === airportSel.selectedId) || null;
  const selectedCountry = countries.find((c) => c.ISO2 === countrySel.selectedId) || null;
  const selectedPerson = persons.find((p) => p.PersonID === personSel.selectedId) || null;
  const selectedOperator = operators.find((o) => o.OperatorID === operatorSel.selectedId) || null;
  const selectedClient = clients.find((c) => c.ClientID === clientSel.selectedId) || null;
  const selectedFee = countryFees.find((f) => String(f.ID) === feeSel.selectedId) || null;
  const selectedExpiry = attentionEntries.find((e) => e.person.PersonID === expirySel.selectedId) || null;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Assets</h1>
        <p className="text-muted-foreground">Manage aircraft, vendors, airports, countries, and persons</p>
      </div>

      <Tabs defaultValue="aircraft">
        <TabsList className="mb-4 h-auto flex-wrap">
          <TabsTrigger value="aircraft" className="flex items-center gap-1"><Plane className="h-3.5 w-3.5" /> Aircraft</TabsTrigger>
          <TabsTrigger value="vendors" className="flex items-center gap-1"><Building2 className="h-3.5 w-3.5" /> Vendors</TabsTrigger>
          <TabsTrigger value="airports" className="flex items-center gap-1"><MapPin className="h-3.5 w-3.5" /> Airports</TabsTrigger>
          <TabsTrigger value="countries" className="flex items-center gap-1"><Globe className="h-3.5 w-3.5" /> Countries</TabsTrigger>
          <TabsTrigger value="persons" className="flex items-center gap-1"><Users className="h-3.5 w-3.5" /> Persons</TabsTrigger>
          <TabsTrigger value="expiry" className="flex items-center gap-1">
            <AlertTriangle className="h-3.5 w-3.5" /> Expiry
            {attentionEntries.length > 0 && (
              <Badge variant="outline" className="ml-1 border-rose-300 bg-rose-100 text-[9px] text-rose-700">{attentionEntries.length}</Badge>
            )}
          </TabsTrigger>
          <TabsTrigger value="operators" className="flex items-center gap-1"><Building2 className="h-3.5 w-3.5" /> Operators</TabsTrigger>
          <TabsTrigger value="clients" className="flex items-center gap-1"><Briefcase className="h-3.5 w-3.5" /> Clients</TabsTrigger>
          <TabsTrigger value="fees" className="flex items-center gap-1"><Receipt className="h-3.5 w-3.5" /> Fees</TabsTrigger>
          <TabsTrigger value="authorizations" className="flex items-center gap-1"><FileCheck className="h-3.5 w-3.5" /> Authorizations</TabsTrigger>
          <TabsTrigger value="vendor-assignments" className="flex items-center gap-1"><Building2 className="h-3.5 w-3.5" /> Vendor Assignments</TabsTrigger>
        </TabsList>

        {/* ─── Aircraft ───────────────────────────────────────────────── */}
        <TabsContent value="aircraft">
          <MasterDetailShell
            heightClassName="h-[calc(100vh-14rem)]"
            listWidthClassName="md:w-64 lg:w-96"
            detailOpen={!!(aircraftSel.selectedId || aircraftSel.adding)}
            onDetailOpenChange={(open) => { if (!open) aircraftSel.clear(); }}
            detailTitle={selectedAircraft?.Registration ?? (aircraftSel.adding ? 'Add Aircraft' : undefined)}
            list={
              <MasterDetailList
                title="Aircraft" subtitle={`${aircraft.length} total`} items={aircraft}
                getId={(a) => a.Registration} searchText={(a) => `${a.Registration} ${a.ICAOType} ${a.Manufacturer}`}
                viewStorageKey="viq_assets_aircraft_view" selectedId={aircraftSel.selectedId || (aircraftSel.adding ? 'new' : null)}
                onSelect={aircraftSel.select} onAddNew={aircraftSel.startAdd} addLabel="Add Aircraft" canAdd={isAdmin}
                emptyText="No aircraft yet"
                renderItem={(ac, { viewMode, selected }) => (
                  <EntityListCard
                    viewMode={viewMode} selected={selected}
                    icon={<Plane className="h-4 w-4 text-muted-foreground" />}
                    title={ac.Registration}
                    subtitle={`${ac.Manufacturer} (${ac.ICAOType})`}
                    meta={<div className="text-xs text-muted-foreground">MTOW: {ac.MTOW_kg.toLocaleString()} kg | Noise: {ac.NoiseCert}</div>}
                    badges={<Badge variant="outline" className="text-[10px]">{ac.ICAOType}</Badge>}
                  />
                )}
              />
            }
            detail={
              <DetailPanel empty={!selectedAircraft && !aircraftSel.adding}>
                {!selectedAircraft && !aircraftSel.adding ? 'Select an aircraft from the left, or add a new one' : (
                  <AircraftPanel
                    key={selectedAircraft?.Registration ?? 'new'}
                    aircraft={selectedAircraft} isNew={aircraftSel.adding} isAdmin={isAdmin}
                    onSaved={(reg) => { refresh(); aircraftSel.select(reg); }}
                    onDeleted={() => { refresh(); aircraftSel.clear(); }}
                    onCancel={aircraftSel.clear}
                  />
                )}
              </DetailPanel>
            }
          />
        </TabsContent>

        {/* ─── Vendors ────────────────────────────────────────────────── */}
        <TabsContent value="vendors">
          <MasterDetailShell
            heightClassName="h-[calc(100vh-14rem)]"
            listWidthClassName="md:w-64 lg:w-96"
            detailOpen={!!(vendorSel.selectedId || vendorSel.adding)}
            onDetailOpenChange={(open) => { if (!open) vendorSel.clear(); }}
            detailTitle={selectedProvider?.Name ?? (vendorSel.adding ? 'Add Vendor' : undefined)}
            list={
              <MasterDetailList
                title="Vendors" subtitle={`${providers.length} total`} items={providers}
                getId={(p) => p.ProviderID} searchText={(p) => `${p.ProviderID} ${p.Name} ${p.Scope}`}
                viewStorageKey="viq_assets_vendors_view" selectedId={vendorSel.selectedId || (vendorSel.adding ? 'new' : null)}
                onSelect={vendorSel.select} onAddNew={vendorSel.startAdd} addLabel="Add Vendor" canAdd={isAdmin}
                emptyText="No vendors yet"
                renderItem={(p, { viewMode, selected }) => (
                  <EntityListCard
                    viewMode={viewMode} selected={selected}
                    icon={<Building2 className="h-4 w-4 text-muted-foreground" />}
                    title={p.Name}
                    subtitle={getPreferredContact(p.Channels, 'Email')}
                    meta={<div className="text-xs text-muted-foreground">Scope: {p.Scope} | Phone: {getPreferredContact(p.Channels, 'Phone') || '—'}</div>}
                    badges={<>
                      <Badge variant="outline" className="text-[10px]">{p.ProviderID}</Badge>
                      {p.ServiceTypes.slice(0, 3).map((st) => <Badge key={st} variant="secondary" className="text-[10px]">{st}</Badge>)}
                    </>}
                  />
                )}
              />
            }
            detail={
              <DetailPanel empty={!selectedProvider && !vendorSel.adding}>
                {!selectedProvider && !vendorSel.adding ? 'Select a vendor from the left, or add a new one' : (
                  <ProviderPanel
                    key={selectedProvider?.ProviderID ?? 'new'}
                    provider={selectedProvider} isNew={vendorSel.adding} isAdmin={isAdmin}
                    onSaved={(id) => { refresh(); vendorSel.select(id); }}
                    onDeleted={() => { refresh(); vendorSel.clear(); }}
                    onCancel={vendorSel.clear}
                  />
                )}
              </DetailPanel>
            }
          />
        </TabsContent>

        {/* ─── Airports ───────────────────────────────────────────────── */}
        <TabsContent value="airports">
          <MasterDetailShell
            heightClassName="h-[calc(100vh-14rem)]"
            listWidthClassName="md:w-64 lg:w-96"
            detailOpen={!!(airportSel.selectedId || airportSel.adding)}
            onDetailOpenChange={(open) => { if (!open) airportSel.clear(); }}
            detailTitle={selectedAirport?.ICAO ?? (airportSel.adding ? 'Add Airport' : undefined)}
            list={
              <MasterDetailList
                title="Airports" subtitle={`${airports.length} total`} items={airports}
                getId={(a) => a.ICAO} searchText={(a) => `${a.ICAO} ${a.IATA} ${a.Name} ${a.City}`}
                viewStorageKey="viq_assets_airports_view" selectedId={airportSel.selectedId || (airportSel.adding ? 'new' : null)}
                onSelect={airportSel.select} onAddNew={airportSel.startAdd} addLabel="Add Airport" canAdd={isAdmin}
                emptyText="No airports match"
                renderItem={(ap, { viewMode, selected }) => (
                  <EntityListCard
                    viewMode={viewMode} selected={selected}
                    icon={<MapPin className="h-4 w-4 text-muted-foreground" />}
                    title={`${ap.ICAO} / ${ap.IATA}`}
                    subtitle={ap.Name}
                    meta={<div className="text-xs text-muted-foreground">{ap.City}, {getCountry(ap.CountryISO2)?.Name || ap.CountryISO2} | {ap.TZ}</div>}
                  />
                )}
              />
            }
            detail={
              <DetailPanel empty={!selectedAirport && !airportSel.adding}>
                {!selectedAirport && !airportSel.adding ? 'Select an airport from the left, or add a new one' : (
                  <AirportPanel
                    key={selectedAirport?.ICAO ?? 'new'}
                    airport={selectedAirport} isNew={airportSel.adding} isAdmin={isAdmin}
                    onSaved={(icao) => { refresh(); airportSel.select(icao); }}
                    onDeleted={() => { refresh(); airportSel.clear(); }}
                    onCancel={airportSel.clear}
                  />
                )}
              </DetailPanel>
            }
          />
        </TabsContent>

        {/* ─── Countries ──────────────────────────────────────────────── */}
        <TabsContent value="countries">
          <MasterDetailShell
            heightClassName="h-[calc(100vh-14rem)]"
            listWidthClassName="md:w-64 lg:w-96"
            detailOpen={!!(countrySel.selectedId || countrySel.adding)}
            onDetailOpenChange={(open) => { if (!open) countrySel.clear(); }}
            detailTitle={selectedCountry?.Name ?? (countrySel.adding ? 'Add Country' : undefined)}
            list={
              <MasterDetailList
                title="Countries" subtitle={`${countries.length} total`} items={countries}
                getId={(c) => c.ISO2} searchText={(c) => `${c.ISO2} ${c.Name} ${c.Region}`}
                viewStorageKey="viq_assets_countries_view" selectedId={countrySel.selectedId || (countrySel.adding ? 'new' : null)}
                onSelect={countrySel.select} onAddNew={countrySel.startAdd} addLabel="Add Country" canAdd={isAdmin}
                emptyText="No countries match"
                renderItem={(c, { viewMode, selected }) => (
                  <EntityListCard
                    viewMode={viewMode} selected={selected}
                    icon={<Globe className="h-4 w-4 text-muted-foreground" />}
                    title={c.Name}
                    meta={<div className="text-xs text-muted-foreground">Region: {c.Region} | Landing: {c.LandingPermitRequired ? 'Yes' : 'No'} | Overflight: {c.OverflightPermitRequired ? 'Yes' : 'No'}</div>}
                    badges={<Badge variant="outline" className="text-[10px]">{c.ISO2}</Badge>}
                  />
                )}
              />
            }
            detail={
              <DetailPanel empty={!selectedCountry && !countrySel.adding}>
                {!selectedCountry && !countrySel.adding ? 'Select a country from the left, or add a new one' : (
                  <CountryPanel
                    key={selectedCountry?.ISO2 ?? 'new'}
                    country={selectedCountry} isNew={countrySel.adding} isAdmin={isAdmin}
                    onSaved={(iso2) => { refresh(); countrySel.select(iso2); }}
                    onDeleted={() => { refresh(); countrySel.clear(); }}
                    onCancel={countrySel.clear}
                  />
                )}
              </DetailPanel>
            }
          />
        </TabsContent>

        {/* ─── Persons ────────────────────────────────────────────────── */}
        <TabsContent value="persons">
          <MasterDetailShell
            heightClassName="h-[calc(100vh-14rem)]"
            listWidthClassName="md:w-64 lg:w-96"
            detailOpen={!!(personSel.selectedId || personSel.adding)}
            onDetailOpenChange={(open) => { if (!open) personSel.clear(); }}
            detailTitle={selectedPerson?.Name ?? (personSel.adding ? 'Add Person' : undefined)}
            list={
              <MasterDetailList
                title="Persons" subtitle={`${persons.length} total`} items={persons}
                getId={(p) => p.PersonID} searchText={(p) => `${p.Name} ${p.DefaultRole || ''} ${getPreferredContact(p.Channels, 'Phone') || ''}`}
                viewStorageKey="viq_assets_persons_view" selectedId={personSel.selectedId || (personSel.adding ? 'new' : null)}
                onSelect={personSel.select} onAddNew={personSel.startAdd} addLabel="Add Person" canAdd={canEdit}
                emptyText="No persons yet"
                renderItem={(p, { viewMode, selected }) => (
                  <EntityListCard
                    viewMode={viewMode} selected={selected}
                    icon={<Users className="h-4 w-4 text-muted-foreground" />}
                    title={p.Name}
                    subtitle={getPreferredContact(p.Channels, 'Phone')}
                    meta={p.DefaultRole && <div className="text-xs text-muted-foreground">Role: {p.DefaultRole}</div>}
                    badges={<>
                      {p.DefaultRole && <Badge variant="secondary" className="text-[10px]">{p.DefaultRole}</Badge>}
                      <ExpiryBadge tone={expiryByPersonId[p.PersonID]?.status.worstTone} />
                    </>}
                  />
                )}
              />
            }
            detail={
              <DetailPanel empty={!selectedPerson && !personSel.adding}>
                {!selectedPerson && !personSel.adding ? 'Select a person from the left, or add a new one' : (
                  <PersonPanel
                    key={selectedPerson?.PersonID ?? 'new'}
                    person={selectedPerson} isNew={personSel.adding} canEdit={canEdit}
                    onSaved={(id) => { refresh(); personSel.select(id); }}
                    onDeleted={() => { refresh(); personSel.clear(); }}
                    onCancel={personSel.clear}
                  />
                )}
              </DetailPanel>
            }
          />
        </TabsContent>

        {/* ─── Expiry ─────────────────────────────────────────────────── */}
        <TabsContent value="expiry">
          <MasterDetailShell
            heightClassName="h-[calc(100vh-14rem)]"
            listWidthClassName="md:w-64 lg:w-96"
            detailOpen={!!(expirySel.selectedId || expirySel.adding)}
            onDetailOpenChange={(open) => { if (!open) expirySel.clear(); }}
            detailTitle={selectedExpiry?.person.Name}
            list={
              <MasterDetailList
                title="Roster Attention" subtitle={`${attentionEntries.length} need attention`} items={attentionEntries}
                getId={(e) => e.person.PersonID} searchText={(e) => `${e.person.Name} ${e.person.DefaultRole || ''}`}
                viewStorageKey="viq_assets_expiry_view" selectedId={expirySel.selectedId}
                onSelect={expirySel.select}
                emptyText="Nothing needs attention"
                renderItem={(e, { viewMode, selected }) => (
                  <EntityListCard
                    viewMode={viewMode} selected={selected}
                    icon={<AlertTriangle className="h-4 w-4 text-rose-500" />}
                    title={e.person.Name}
                    subtitle={e.person.DefaultRole}
                    badges={e.status.issues.map((issue, i) => (
                      <Badge
                        key={i} variant="outline"
                        className={issue.tone === 'soon' ? 'border-amber-300 bg-amber-100 text-[9px] text-amber-700' : 'border-rose-300 bg-rose-100 text-[9px] text-rose-700'}
                      >
                        {issue.label}
                      </Badge>
                    ))}
                  />
                )}
              />
            }
            detail={
              <DetailPanel empty={!selectedExpiry}>
                {!selectedExpiry ? (attentionEntries.length === 0 ? 'Nothing needs attention' : 'Select a person from the left to see their issues') : (
                  <ExpiryPanel entry={selectedExpiry} />
                )}
              </DetailPanel>
            }
          />
        </TabsContent>

        {/* ─── Operators ──────────────────────────────────────────────── */}
        <TabsContent value="operators">
          <MasterDetailShell
            heightClassName="h-[calc(100vh-14rem)]"
            listWidthClassName="md:w-64 lg:w-96"
            detailOpen={!!(operatorSel.selectedId || operatorSel.adding)}
            onDetailOpenChange={(open) => { if (!open) operatorSel.clear(); }}
            detailTitle={selectedOperator?.Name ?? (operatorSel.adding ? 'Add Operator' : undefined)}
            list={
              <MasterDetailList
                title="Operators" subtitle={`${operators.length} total`} items={operators}
                getId={(o) => o.OperatorID} searchText={(o) => `${o.OperatorID} ${o.Name}`}
                viewStorageKey="viq_assets_operators_view" selectedId={operatorSel.selectedId || (operatorSel.adding ? 'new' : null)}
                onSelect={operatorSel.select} onAddNew={operatorSel.startAdd} addLabel="Add Operator" canAdd={isAdmin}
                emptyText="No operators yet"
                renderItem={(o, { viewMode, selected }) => (
                  <EntityListCard
                    viewMode={viewMode} selected={selected}
                    icon={<Building2 className="h-4 w-4 text-muted-foreground" />}
                    title={o.Name}
                    subtitle={o.Address}
                    badges={<Badge variant="outline" className="text-[10px]">{o.OperatorID}</Badge>}
                  />
                )}
              />
            }
            detail={
              <DetailPanel empty={!selectedOperator && !operatorSel.adding}>
                {!selectedOperator && !operatorSel.adding ? 'Select an operator from the left, or add a new one' : (
                  <OperatorPanel
                    key={selectedOperator?.OperatorID ?? 'new'}
                    operator={selectedOperator} isNew={operatorSel.adding} isAdmin={isAdmin}
                    onSaved={(id) => { refresh(); operatorSel.select(id); }}
                    onDeleted={() => { refresh(); operatorSel.clear(); }}
                    onCancel={operatorSel.clear}
                  />
                )}
              </DetailPanel>
            }
          />
        </TabsContent>

        {/* ─── Clients ────────────────────────────────────────────────── */}
        <TabsContent value="clients">
          <MasterDetailShell
            heightClassName="h-[calc(100vh-14rem)]"
            listWidthClassName="md:w-64 lg:w-96"
            detailOpen={!!(clientSel.selectedId || clientSel.adding)}
            onDetailOpenChange={(open) => { if (!open) clientSel.clear(); }}
            detailTitle={selectedClient?.Name ?? (clientSel.adding ? 'Add Client' : undefined)}
            list={
              <MasterDetailList
                title="Clients" subtitle={`${clients.length} total`} items={clients}
                getId={(c) => c.ClientID} searchText={(c) => `${c.Name} ${getPreferredContact(c.Channels, 'Email') || ''}`}
                viewStorageKey="viq_assets_clients_view" selectedId={clientSel.selectedId || (clientSel.adding ? 'new' : null)}
                onSelect={clientSel.select} onAddNew={clientSel.startAdd} addLabel="Add Client" canAdd={canEdit}
                emptyText="No clients yet — added here or from the New Trip form"
                renderItem={(c, { viewMode, selected }) => (
                  <EntityListCard
                    viewMode={viewMode} selected={selected}
                    icon={<Briefcase className="h-4 w-4 text-muted-foreground" />}
                    title={c.Name}
                    subtitle={[getPreferredContact(c.Channels, 'Email'), getPreferredContact(c.Channels, 'Phone')].filter(Boolean).join(' · ') || 'No contact info on file'}
                    meta={[c.BillingAddressLine1, c.BillingCity, c.BillingCountry].filter(Boolean).length > 0 && (
                      <div className="text-xs text-muted-foreground">{[c.BillingAddressLine1, c.BillingCity, c.BillingCountry].filter(Boolean).join(', ')}</div>
                    )}
                    badges={c.IsOperator && <Badge variant="outline" className="text-[10px]">Operator</Badge>}
                  />
                )}
              />
            }
            detail={
              <DetailPanel empty={!selectedClient && !clientSel.adding}>
                {!selectedClient && !clientSel.adding ? 'Select a client from the left, or add a new one' : (
                  <ClientPanel
                    key={selectedClient?.ClientID ?? 'new'}
                    client={selectedClient} isNew={clientSel.adding} canEdit={canEdit} operators={operators}
                    onSaved={(id) => { refresh(); clientSel.select(id); }}
                    onDeleted={() => { refresh(); clientSel.clear(); }}
                    onCancel={clientSel.clear}
                  />
                )}
              </DetailPanel>
            }
          />
        </TabsContent>

        {/* ─── Fees ───────────────────────────────────────────────────── */}
        <TabsContent value="fees">
          <MasterDetailShell
            heightClassName="h-[calc(100vh-14rem)]"
            listWidthClassName="md:w-64 lg:w-96"
            detailOpen={!!(feeSel.selectedId || feeSel.adding)}
            onDetailOpenChange={(open) => { if (!open) feeSel.clear(); }}
            detailTitle={selectedFee ? String(selectedFee.ID) : (feeSel.adding ? 'Add Country Fee' : undefined)}
            list={
              <MasterDetailList
                title="Country Fees" subtitle={`${countryFees.length} total`} items={countryFees}
                getId={(f) => String(f.ID)} searchText={(f) => `${f.FeeType} ${f.CountryISO2} ${getCountry(f.CountryISO2)?.Name || ''}`}
                viewStorageKey="viq_assets_fees_view" selectedId={feeSel.selectedId || (feeSel.adding ? 'new' : null)}
                onSelect={feeSel.select} onAddNew={feeSel.startAdd} addLabel="Add Fee" canAdd={isAdmin}
                emptyText="No country fees configured"
                renderItem={(f, { viewMode, selected }) => (
                  <EntityListCard
                    viewMode={viewMode} selected={selected}
                    icon={<Receipt className="h-4 w-4 text-muted-foreground" />}
                    title={f.FeeType}
                    subtitle={getCountry(f.CountryISO2)?.Name || f.CountryISO2}
                    meta={<div className="text-xs text-muted-foreground">{f.Currency} {f.Amount.toLocaleString()}{f.Unit ? ` / ${f.Unit}` : ''}</div>}
                    badges={<Badge variant="outline" className="text-[10px]">{f.CountryISO2}</Badge>}
                  />
                )}
              />
            }
            detail={
              <DetailPanel empty={!selectedFee && !feeSel.adding}>
                {!selectedFee && !feeSel.adding ? 'Select a fee from the left, or add a new one' : (
                  <CountryFeePanel
                    key={selectedFee ? String(selectedFee.ID) : 'new'}
                    fee={selectedFee} isNew={feeSel.adding} isAdmin={isAdmin} countries={countries}
                    onSaved={(id) => { refresh(); feeSel.select(id); }}
                    onDeleted={() => { refresh(); feeSel.clear(); }}
                    onCancel={feeSel.clear}
                  />
                )}
              </DetailPanel>
            }
          />
        </TabsContent>

        {/* ─── Authorizations ─────────────────────────────────────────── */}
        <TabsContent value="authorizations">
          <AuthorizationsTab />
        </TabsContent>

        {/* ─── Vendor Assignments ─────────────────────────────────────── */}
        <TabsContent value="vendor-assignments">
          <VendorAssignmentsTab />
        </TabsContent>
      </Tabs>
    </div>
  );
}
