
import { useEffect, useState } from 'react';
import {
  getAirportList, getCountryList, getAircraftList, getProviderList, getCountryRuleList,
  saveAirport, saveCountry, saveAircraft, saveProvider, saveCountryRule, deleteCountryRule,
  getServiceTypes, saveServiceType, getLegPurposes, saveLegPurpose, getPreferredContact,
} from '@/lib/dataStore';
import { useAuth } from '@/lib/authContext';
import type { ServiceTypeDef, LegPurposeDef, CountryRule, Provider } from '@/data/types';
import { useTextFilter } from '@/hooks/useTextFilter';
import { exportToExcel, parseExcelFile, parseBoolCell, parseListCell, parseNumberCell } from '@/lib/excelIO';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { ViewModeToggle, useViewMode, type ViewMode } from '@/components/ui/view-mode-toggle';
import { EntityListCard } from '@/components/ui/master-detail-list';
import { Plane, Globe, Clock, FileText, Fuel, Phone, Tag, Plus, ClipboardList, Download, Upload } from 'lucide-react';

const AIRPORT_TABLE_RENDER_CAP = 200;

// Shared by every Reference Data tab's non-"details" views — "details" mode
// keeps each tab's existing <Table>, this only sizes the card grid for the
// other 3 modes (EntityListCard itself adapts its own internal layout).
function cardGridClass(viewMode: ViewMode) {
  return viewMode === 'small'
    ? 'grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4'
    : viewMode === 'large'
    ? 'grid grid-cols-1 gap-3 md:grid-cols-2'
    : 'flex flex-col gap-2';
}

export default function ReferencePage() {
  const { isAdmin } = useAuth();
  // getAirportList()/getCountryList()/getAircraftList()/getProviderList()
  // read a module-level cache that saveAirport/saveCountry (and, from
  // Task 5/6 onward, saveAircraft/saveProvider) mutate directly (no
  // fetch/refetch involved) — this component has no other state tied to
  // that cache, so nothing forces a re-render after an Excel import
  // mutates it. setRefreshKey (called, never read) is a bump-to-force-a
  // re-render escape hatch so the next render's getXList() calls below
  // pick up the mutated cache.
  const [, setRefreshKey] = useState(0);
  const airports = getAirportList();
  const countries = getCountryList();
  const aircraft = getAircraftList();
  const providers = getProviderList();

  // Read-only for now — the Aircraft/Providers/Country Rules TabsContent
  // blocks below are untouched by this task and still read these three
  // variable names directly, so all three must exist even before this
  // task adds any UI for them. Task 5 adds create/edit/delete for
  // Country Rules; Tasks 5/6 add search+Excel UI for all three tabs.
  const [countryRules, setCountryRules] = useState<CountryRule[]>([]);
  const [editingRule, setEditingRule] = useState<CountryRule | null>(null);
  const [ruleDialogOpen, setRuleDialogOpen] = useState(false);
  const reloadCountryRules = () => setCountryRules(getCountryRuleList());

  const [serviceTypes, setServiceTypes] = useState<ServiceTypeDef[]>([]);
  const [editingType, setEditingType] = useState<ServiceTypeDef | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);

  const reloadServiceTypes = () => { getServiceTypes().then(setServiceTypes); };
  useEffect(reloadServiceTypes, []);
  useEffect(reloadCountryRules, []);

  const openNewType = () => { setEditingType({ code: '', label: '', category: 'Handling', active: true, sortOrder: (serviceTypes.length + 1) * 10 }); setDialogOpen(true); };
  const openEditType = (def: ServiceTypeDef) => { setEditingType({ ...def }); setDialogOpen(true); };

  const saveEditingType = async () => {
    if (!editingType || !editingType.code || !editingType.label) return;
    await saveServiceType(editingType);
    setDialogOpen(false);
    setEditingType(null);
    reloadServiceTypes();
  };

  const toggleActive = async (def: ServiceTypeDef) => {
    await saveServiceType({ ...def, active: !def.active });
    reloadServiceTypes();
  };

  const [legPurposes, setLegPurposes] = useState<LegPurposeDef[]>([]);
  const [editingPurpose, setEditingPurpose] = useState<LegPurposeDef | null>(null);
  const [purposeDialogOpen, setPurposeDialogOpen] = useState(false);

  const reloadLegPurposes = () => { getLegPurposes().then(setLegPurposes); };
  useEffect(reloadLegPurposes, []);

  const openNewPurpose = () => { setEditingPurpose({ code: '', label: '', active: true, sortOrder: (legPurposes.length + 1) * 10 }); setPurposeDialogOpen(true); };
  const openEditPurpose = (def: LegPurposeDef) => { setEditingPurpose({ ...def }); setPurposeDialogOpen(true); };

  const saveEditingPurpose = async () => {
    if (!editingPurpose || !editingPurpose.code || !editingPurpose.label) return;
    await saveLegPurpose(editingPurpose);
    setPurposeDialogOpen(false);
    setEditingPurpose(null);
    reloadLegPurposes();
  };

  const togglePurposeActive = async (def: LegPurposeDef) => {
    await saveLegPurpose({ ...def, active: !def.active });
    reloadLegPurposes();
  };

  const [airportView, setAirportView, airportViewStored] = useViewMode('viq_reference_airports_view', 'details');
  const [countryView, setCountryView, countryViewStored] = useViewMode('viq_reference_countries_view', 'details');
  const [ruleView, setRuleView, ruleViewStored] = useViewMode('viq_reference_rules_view', 'details');
  const [aircraftView, setAircraftView, aircraftViewStored] = useViewMode('viq_reference_aircraft_view', 'large');
  const [providerView, setProviderView, providerViewStored] = useViewMode('viq_reference_providers_view', 'large');
  const [serviceTypeView, setServiceTypeView, serviceTypeViewStored] = useViewMode('viq_reference_service_types_view', 'details');
  const [legPurposeView, setLegPurposeView, legPurposeViewStored] = useViewMode('viq_reference_leg_purposes_view', 'details');

  const airportFilter = useTextFilter(airports, (a) => `${a.ICAO} ${a.IATA} ${a.Name} ${a.City}`);
  const countryFilter = useTextFilter(countries, (c) => `${c.Name} ${c.ISO2} ${c.Region}`);

  const openNewRule = () => { setEditingRule({ ID: 0, CountryISO2: countries[0]?.ISO2 || '', ServiceType: 'Permit', LeadTimeHours: 24, WorkingDaysOnly: false, ToleranceHours: 0, ExceptionAirports: [], DocsRequired: [], Notes: '' }); setRuleDialogOpen(true); };
  const openEditRule = (rule: CountryRule) => { setEditingRule({ ...rule }); setRuleDialogOpen(true); };

  const saveEditingRule = async () => {
    if (!editingRule || !editingRule.CountryISO2 || !editingRule.ServiceType) return;
    await saveCountryRule(editingRule.ID ? editingRule : { ...editingRule, ID: undefined });
    setRuleDialogOpen(false);
    setEditingRule(null);
    reloadCountryRules();
  };

  const deleteRule = async (rule: CountryRule) => {
    await deleteCountryRule(rule.ID);
    reloadCountryRules();
  };

  const ruleFilter = useTextFilter(countryRules, (r) => `${countries.find((c) => c.ISO2 === r.CountryISO2)?.Name || r.CountryISO2} ${r.ServiceType}`);
  const aircraftFilter = useTextFilter(aircraft, (a) => `${a.Registration} ${a.ICAOType} ${a.Manufacturer}`);
  const providerFilter = useTextFilter(providers, (p) => `${p.Name} ${p.ProviderID} ${p.Scope}`);
  const serviceTypeFilter = useTextFilter(serviceTypes, (s) => `${s.code} ${s.label} ${s.category}`);
  const legPurposeFilter = useTextFilter(legPurposes, (p) => `${p.code} ${p.label}`);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Reference Data</h1>
        <p className="text-muted-foreground">Airports, countries, rules, aircraft, providers, and service types</p>
      </div>

      <Tabs defaultValue="airports">
        <TabsList className="mb-4 flex-wrap">
          <TabsTrigger value="airports">Airports</TabsTrigger>
          <TabsTrigger value="countries">Countries</TabsTrigger>
          <TabsTrigger value="rules">Country Rules</TabsTrigger>
          <TabsTrigger value="aircraft">Aircraft</TabsTrigger>
          <TabsTrigger value="providers">Providers</TabsTrigger>
          <TabsTrigger value="service-types">Service Types</TabsTrigger>
          <TabsTrigger value="leg-purposes">Leg Purposes</TabsTrigger>
        </TabsList>

        <TabsContent value="airports">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0">
              <CardTitle className="text-base font-semibold flex items-center gap-2">
                <Plane className="h-4 w-4" /> Airports
              </CardTitle>
              <div className="flex items-center gap-2">
                <Input placeholder="Search airports..." value={airportFilter.query} onChange={(e) => airportFilter.setQuery(e.target.value)} className="h-9 w-56" />
                <ViewModeToggle value={airportViewStored} onChange={setAirportView} />
                <Button size="sm" variant="outline" onClick={() => exportToExcel(airports, 'airports.xlsx', 'Airports')}>
                  <Download className="h-4 w-4" /> Download
                </Button>
                <label className="inline-flex">
                  <input
                    type="file"
                    accept=".xlsx"
                    className="hidden"
                    onChange={async (e) => {
                      const file = e.target.files?.[0];
                      if (!file) return;
                      const rows = await parseExcelFile(file);
                      let ok = 0; const errors: string[] = [];
                      for (const [i, row] of rows.entries()) {
                        try {
                          await saveAirport({
                            ICAO: row.ICAO, IATA: row.IATA, Name: row.Name, City: row.City,
                            CountryISO2: row.CountryISO2, TZ: row.TZ,
                            Latitude: parseNumberCell(row.Latitude), Longitude: parseNumberCell(row.Longitude),
                            ElevationFt: parseNumberCell(row.ElevationFt), RunwayLengthFt: parseNumberCell(row.RunwayLengthFt),
                            Category: row.Category, FBOCount: parseNumberCell(row.FBOCount),
                          });
                          ok++;
                        } catch (err) {
                          errors.push(`Row ${i + 2}: ${err instanceof Error ? err.message : 'failed'}`);
                        }
                      }
                      alert(`${ok} imported${errors.length ? `, ${errors.length} failed:\n${errors.join('\n')}` : ''}`);
                      e.target.value = '';
                      setRefreshKey((k) => k + 1);
                    }}
                  />
                  <span className="inline-flex h-9 cursor-pointer items-center gap-1 rounded-md border border-dashed px-3 text-xs text-muted-foreground hover:bg-muted">
                    <Upload className="h-3.5 w-3.5" /> Upload
                  </span>
                </label>
              </div>
            </CardHeader>
            <CardContent className="p-0">
              {/* Item 17's world-airport import made this a ~34,000-row list —
                  rendering every filtered row into the DOM (as this table did
                  until now) is what actually froze the tab, not the fetch.
                  Download/Upload still operate on the full in-memory array
                  below, unchanged — only what's rendered is capped. */}
              {airportFilter.filtered.length > AIRPORT_TABLE_RENDER_CAP && (
                <p className="px-4 py-2 text-xs text-muted-foreground">
                  Showing the first {AIRPORT_TABLE_RENDER_CAP} of {airportFilter.filtered.length} matches — refine your search to narrow this down.
                </p>
              )}
              {airportView === 'details' ? (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>ICAO</TableHead>
                      <TableHead>IATA</TableHead>
                      <TableHead>Name</TableHead>
                      <TableHead>Country</TableHead>
                      <TableHead>TZ</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {airportFilter.filtered.slice(0, AIRPORT_TABLE_RENDER_CAP).map(ap => (
                      <TableRow key={ap.ICAO}>
                        <TableCell className="font-mono font-bold">{ap.ICAO}</TableCell>
                        <TableCell className="font-mono">{ap.IATA}</TableCell>
                        <TableCell>{ap.Name}</TableCell>
                        <TableCell>{countries.find(c => c.ISO2 === ap.CountryISO2)?.Name || ap.CountryISO2}</TableCell>
                        <TableCell className="text-xs text-muted-foreground">{ap.TZ}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              ) : (
                <div className={`p-4 ${cardGridClass(airportView)}`}>
                  {airportFilter.filtered.slice(0, AIRPORT_TABLE_RENDER_CAP).map((ap) => (
                    <EntityListCard
                      key={ap.ICAO}
                      viewMode={airportView}
                      selected={false}
                      icon={<Plane className="h-4 w-4 text-muted-foreground" />}
                      title={`${ap.ICAO} / ${ap.IATA}`}
                      subtitle={ap.Name}
                      meta={<div className="text-xs text-muted-foreground">{ap.City}, {countries.find((c) => c.ISO2 === ap.CountryISO2)?.Name || ap.CountryISO2} | {ap.TZ}</div>}
                    />
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="countries">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0">
              <CardTitle className="text-base font-semibold flex items-center gap-2">
                <Globe className="h-4 w-4" /> Countries
              </CardTitle>
              <div className="flex items-center gap-2">
                <Input placeholder="Search countries..." value={countryFilter.query} onChange={(e) => countryFilter.setQuery(e.target.value)} className="h-9 w-56" />
                <ViewModeToggle value={countryViewStored} onChange={setCountryView} />
                <Button size="sm" variant="outline" onClick={() => exportToExcel(countries, 'countries.xlsx', 'Countries')}>
                  <Download className="h-4 w-4" /> Download
                </Button>
                <label className="inline-flex">
                  <input
                    type="file"
                    accept=".xlsx"
                    className="hidden"
                    onChange={async (e) => {
                      const file = e.target.files?.[0];
                      if (!file) return;
                      const rows = await parseExcelFile(file);
                      let ok = 0; const errors: string[] = [];
                      for (const [i, row] of rows.entries()) {
                        try {
                          await saveCountry({
                            Name: row.Name, ISO2: row.ISO2, Region: row.Region,
                            OverflightPermitRequired: parseBoolCell(row.OverflightPermitRequired),
                            LandingPermitRequired: parseBoolCell(row.LandingPermitRequired),
                            AOCDocsRequired: parseBoolCell(row.AOCDocsRequired),
                            EscalationContact: row.EscalationContact,
                            CentroidLat: parseNumberCell(row.CentroidLat), CentroidLng: parseNumberCell(row.CentroidLng),
                          });
                          ok++;
                        } catch (err) {
                          errors.push(`Row ${i + 2}: ${err instanceof Error ? err.message : 'failed'}`);
                        }
                      }
                      alert(`${ok} imported${errors.length ? `, ${errors.length} failed:\n${errors.join('\n')}` : ''}`);
                      e.target.value = '';
                      setRefreshKey((k) => k + 1);
                    }}
                  />
                  <span className="inline-flex h-9 cursor-pointer items-center gap-1 rounded-md border border-dashed px-3 text-xs text-muted-foreground hover:bg-muted">
                    <Upload className="h-3.5 w-3.5" /> Upload
                  </span>
                </label>
              </div>
            </CardHeader>
            <CardContent className="p-0">
              {countryView === 'details' ? (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Name</TableHead>
                      <TableHead>ISO2</TableHead>
                      <TableHead>Region</TableHead>
                      <TableHead>Overflight</TableHead>
                      <TableHead>Landing</TableHead>
                      <TableHead>AOC Docs</TableHead>
                      <TableHead>Escalation</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {countryFilter.filtered.map(c => (
                      <TableRow key={c.ISO2}>
                        <TableCell className="font-medium">{c.Name}</TableCell>
                        <TableCell className="font-mono">{c.ISO2}</TableCell>
                        <TableCell>{c.Region}</TableCell>
                        <TableCell>
                          {c.OverflightPermitRequired ? (
                            <Badge variant="outline" className="border-red-300 text-red-700">Required</Badge>
                          ) : (
                            <Badge variant="outline" className="border-emerald-300 text-emerald-700">No</Badge>
                          )}
                        </TableCell>
                        <TableCell>
                          {c.LandingPermitRequired ? (
                            <Badge variant="outline" className="border-red-300 text-red-700">Required</Badge>
                          ) : (
                            <Badge variant="outline" className="border-emerald-300 text-emerald-700">No</Badge>
                          )}
                        </TableCell>
                        <TableCell>
                          {c.AOCDocsRequired ? (
                            <Badge variant="outline" className="border-amber-300 text-amber-700">Yes</Badge>
                          ) : (
                            <Badge variant="outline" className="border-emerald-300 text-emerald-700">No</Badge>
                          )}
                        </TableCell>
                        <TableCell className="text-xs text-muted-foreground">{c.EscalationContact}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              ) : (
                <div className={`p-4 ${cardGridClass(countryView)}`}>
                  {countryFilter.filtered.map((c) => (
                    <EntityListCard
                      key={c.ISO2}
                      viewMode={countryView}
                      selected={false}
                      icon={<Globe className="h-4 w-4 text-muted-foreground" />}
                      title={c.Name}
                      subtitle={c.ISO2}
                      meta={<div className="text-xs text-muted-foreground">Region: {c.Region}</div>}
                      badges={<>
                        {c.OverflightPermitRequired && <Badge variant="outline" className="border-red-300 text-[10px] text-red-700">Overflight</Badge>}
                        {c.LandingPermitRequired && <Badge variant="outline" className="border-red-300 text-[10px] text-red-700">Landing</Badge>}
                        {c.AOCDocsRequired && <Badge variant="outline" className="border-amber-300 text-[10px] text-amber-700">AOC Docs</Badge>}
                      </>}
                    />
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="rules">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0">
              <CardTitle className="text-base font-semibold flex items-center gap-2">
                <FileText className="h-4 w-4" /> Country Rules — Lead Times & Tolerances
              </CardTitle>
              <div className="flex items-center gap-2">
                <Input placeholder="Search rules..." value={ruleFilter.query} onChange={(e) => ruleFilter.setQuery(e.target.value)} className="h-9 w-56" />
                <ViewModeToggle value={ruleViewStored} onChange={setRuleView} />
                <Button size="sm" variant="outline" onClick={() => exportToExcel(countryRules, 'country-rules.xlsx', 'CountryRules')}>
                  <Download className="h-4 w-4" /> Download
                </Button>
                <label className="inline-flex">
                  <input
                    type="file"
                    accept=".xlsx"
                    className="hidden"
                    title="Creates new rules; does not update existing ones by ID"
                    onChange={async (e) => {
                      const file = e.target.files?.[0];
                      if (!file) return;
                      const rows = await parseExcelFile(file);
                      let ok = 0; const errors: string[] = [];
                      for (const [i, row] of rows.entries()) {
                        try {
                          await saveCountryRule({
                            CountryISO2: row.CountryISO2, ServiceType: row.ServiceType,
                            LeadTimeHours: parseNumberCell(row.LeadTimeHours), WorkingDaysOnly: parseBoolCell(row.WorkingDaysOnly),
                            ToleranceHours: parseNumberCell(row.ToleranceHours),
                            ExceptionAirports: parseListCell(row.ExceptionAirports), DocsRequired: parseListCell(row.DocsRequired),
                            Notes: row.Notes,
                          });
                          ok++;
                        } catch (err) {
                          errors.push(`Row ${i + 2}: ${err instanceof Error ? err.message : 'failed'}`);
                        }
                      }
                      alert(`${ok} imported${errors.length ? `, ${errors.length} failed:\n${errors.join('\n')}` : ''}`);
                      e.target.value = '';
                      reloadCountryRules();
                    }}
                  />
                  <span title="Creates new rules; does not update existing ones by ID" className="inline-flex h-9 cursor-pointer items-center gap-1 rounded-md border border-dashed px-3 text-xs text-muted-foreground hover:bg-muted">
                    <Upload className="h-3.5 w-3.5" /> Upload
                  </span>
                </label>
                <Button size="sm" variant="outline" disabled={!isAdmin} onClick={() => isAdmin && openNewRule()}><Plus className="h-4 w-4" /> Add Rule</Button>
              </div>
            </CardHeader>
            <CardContent className="p-0">
              {ruleView === 'details' ? (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Country</TableHead>
                      <TableHead>Service Type</TableHead>
                      <TableHead>Lead Time</TableHead>
                      <TableHead>Working Days</TableHead>
                      <TableHead>Tolerance</TableHead>
                      <TableHead>Notes</TableHead>
                      <TableHead></TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {ruleFilter.filtered.map((rule) => {
                      const country = countries.find(c => c.ISO2 === rule.CountryISO2);
                      return (
                        <TableRow key={rule.ID}>
                          <TableCell className="font-medium">{country?.Name || rule.CountryISO2}</TableCell>
                          <TableCell>{rule.ServiceType}</TableCell>
                          <TableCell>{rule.LeadTimeHours}h</TableCell>
                          <TableCell>
                            {rule.WorkingDaysOnly ? (
                              <Badge variant="outline" className="border-amber-300 text-amber-700">Yes</Badge>
                            ) : (
                              <Badge variant="outline" className="border-emerald-300 text-emerald-700">No</Badge>
                            )}
                          </TableCell>
                          <TableCell>{rule.ToleranceHours}h</TableCell>
                          <TableCell className="text-xs text-muted-foreground">{rule.Notes}</TableCell>
                          <TableCell className="flex gap-2">
                            <Button size="sm" variant="outline" disabled={!isAdmin} onClick={() => isAdmin && openEditRule(rule)}>Edit</Button>
                            <Button size="sm" variant="outline" disabled={!isAdmin} onClick={() => isAdmin && deleteRule(rule)}>Delete</Button>
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              ) : (
                <div className={`p-4 ${cardGridClass(ruleView)}`}>
                  {ruleFilter.filtered.map((rule) => {
                    const country = countries.find((c) => c.ISO2 === rule.CountryISO2);
                    return (
                      <EntityListCard
                        key={rule.ID}
                        viewMode={ruleView}
                        selected={false}
                        icon={<FileText className="h-4 w-4 text-muted-foreground" />}
                        title={country?.Name || rule.CountryISO2}
                        subtitle={rule.ServiceType}
                        meta={<div className="text-xs text-muted-foreground">Lead: {rule.LeadTimeHours}h | Tolerance: {rule.ToleranceHours}h{rule.WorkingDaysOnly ? ' | Working days only' : ''}</div>}
                        badges={<>
                          <Button size="sm" variant="outline" disabled={!isAdmin} onClick={() => isAdmin && openEditRule(rule)}>Edit</Button>
                          <Button size="sm" variant="outline" disabled={!isAdmin} onClick={() => isAdmin && deleteRule(rule)}>Delete</Button>
                        </>}
                      />
                    );
                  })}
                </div>
              )}
            </CardContent>
          </Card>

          <Dialog open={ruleDialogOpen} onOpenChange={(v) => !v && setRuleDialogOpen(false)}>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>{editingRule?.ID ? 'Edit Country Rule' : 'New Country Rule'}</DialogTitle>
              </DialogHeader>
              {editingRule && (
                <div className="space-y-4">
                  <div>
                    <Label>Country</Label>
                    <Select value={editingRule.CountryISO2} onValueChange={(v) => setEditingRule({ ...editingRule, CountryISO2: v })}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {countries.map((c) => <SelectItem key={c.ISO2} value={c.ISO2}>{c.Name}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label>Service Type</Label>
                    <Select value={editingRule.ServiceType} onValueChange={(v) => setEditingRule({ ...editingRule, ServiceType: v })}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {serviceTypes.map((s) => <SelectItem key={s.code} value={s.code}>{s.label}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label>Lead Time (hours)</Label>
                    <Input type="number" value={editingRule.LeadTimeHours} onChange={(e) => setEditingRule({ ...editingRule, LeadTimeHours: Number(e.target.value) || 0 })} />
                  </div>
                  <div>
                    <Label>Tolerance (hours)</Label>
                    <Input type="number" value={editingRule.ToleranceHours} onChange={(e) => setEditingRule({ ...editingRule, ToleranceHours: Number(e.target.value) || 0 })} />
                  </div>
                  <label className="flex items-center gap-2 text-sm">
                    <input type="checkbox" checked={editingRule.WorkingDaysOnly} onChange={(e) => setEditingRule({ ...editingRule, WorkingDaysOnly: e.target.checked })} />
                    Working days only
                  </label>
                  <div>
                    <Label>Notes</Label>
                    <Input value={editingRule.Notes || ''} onChange={(e) => setEditingRule({ ...editingRule, Notes: e.target.value })} />
                  </div>
                </div>
              )}
              <DialogFooter>
                <Button variant="outline" onClick={() => setRuleDialogOpen(false)}>Cancel</Button>
                <Button onClick={saveEditingRule} disabled={!isAdmin || !editingRule?.CountryISO2 || !editingRule?.ServiceType}>Save</Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </TabsContent>

        <TabsContent value="aircraft">
          <div className="mb-4 flex items-center justify-end gap-2">
            <Input placeholder="Search aircraft..." value={aircraftFilter.query} onChange={(e) => aircraftFilter.setQuery(e.target.value)} className="h-9 w-56" />
            <ViewModeToggle value={aircraftViewStored} onChange={setAircraftView} />
            <Button size="sm" variant="outline" onClick={() => exportToExcel(aircraft, 'aircraft.xlsx', 'Aircraft')}>
              <Download className="h-4 w-4" /> Download
            </Button>
            <label className="inline-flex">
              <input
                type="file"
                accept=".xlsx"
                className="hidden"
                onChange={async (e) => {
                  const file = e.target.files?.[0];
                  if (!file) return;
                  const rows = await parseExcelFile(file);
                  let ok = 0; const errors: string[] = [];
                  for (const [i, row] of rows.entries()) {
                    try {
                      await saveAircraft({
                        Registration: row.Registration, ICAOType: row.ICAOType, Manufacturer: row.Manufacturer,
                        MTOW_kg: parseNumberCell(row.MTOW_kg), NoiseCert: row.NoiseCert,
                        SerialNumber: row.SerialNumber || undefined, CurrentOperatorID: row.CurrentOperatorID,
                        Colors: row.Colors || undefined, OperationType: row.OperationType || undefined,
                        MaxRangeOverrideNm: row.MaxRangeOverrideNm ? parseNumberCell(row.MaxRangeOverrideNm) : undefined,
                        FuelBurnOverrideKgPerHour: row.FuelBurnOverrideKgPerHour ? parseNumberCell(row.FuelBurnOverrideKgPerHour) : undefined,
                      });
                      ok++;
                    } catch (err) {
                      errors.push(`Row ${i + 2}: ${err instanceof Error ? err.message : 'failed'}`);
                    }
                  }
                  alert(`${ok} imported${errors.length ? `, ${errors.length} failed:\n${errors.join('\n')}` : ''}`);
                  e.target.value = '';
                  setRefreshKey((k) => k + 1);
                }}
              />
              <span className="inline-flex h-9 cursor-pointer items-center gap-1 rounded-md border border-dashed px-3 text-xs text-muted-foreground hover:bg-muted">
                <Upload className="h-3.5 w-3.5" /> Upload
              </span>
            </label>
          </div>
          {aircraftView === 'details' ? (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Registration</TableHead>
                  <TableHead>Manufacturer</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead>MTOW</TableHead>
                  <TableHead>Noise</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {aircraftFilter.filtered.map((ac) => (
                  <TableRow key={ac.Registration}>
                    <TableCell className="font-mono font-bold">{ac.Registration}</TableCell>
                    <TableCell>{ac.Manufacturer}</TableCell>
                    <TableCell>{ac.ICAOType}</TableCell>
                    <TableCell>{ac.MTOW_kg.toLocaleString()} kg</TableCell>
                    <TableCell className="text-xs text-muted-foreground">{ac.NoiseCert}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          ) : aircraftView === 'large' ? (
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
              {aircraftFilter.filtered.map(ac => (
                <Card key={ac.Registration}>
                  <CardContent className="p-5">
                    <div className="mb-2 flex items-center gap-2">
                      <Plane className="h-5 w-5 text-primary" />
                      <h3 className="text-lg font-bold">{ac.Registration}</h3>
                    </div>
                    <p className="text-sm font-medium text-muted-foreground">{ac.Manufacturer}</p>
                    <div className="mt-3 space-y-1 text-sm">
                      <div className="flex justify-between"><span className="text-muted-foreground">Type:</span> <span>{ac.ICAOType}</span></div>
                      <div className="flex justify-between"><span className="text-muted-foreground">MTOW:</span> <span>{ac.MTOW_kg.toLocaleString()} kg</span></div>
                      <div className="flex justify-between"><span className="text-muted-foreground">Noise:</span> <span>{ac.NoiseCert}</span></div>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          ) : (
            <div className={cardGridClass(aircraftView)}>
              {aircraftFilter.filtered.map((ac) => (
                <EntityListCard
                  key={ac.Registration}
                  viewMode={aircraftView}
                  selected={false}
                  icon={<Plane className="h-4 w-4 text-muted-foreground" />}
                  title={ac.Registration}
                  subtitle={ac.Manufacturer}
                  meta={<div className="text-xs text-muted-foreground">Type: {ac.ICAOType} | MTOW: {ac.MTOW_kg.toLocaleString()} kg</div>}
                />
              ))}
            </div>
          )}
        </TabsContent>

        <TabsContent value="providers">
          <div className="mb-4 flex items-center justify-end gap-2">
            <Input placeholder="Search providers..." value={providerFilter.query} onChange={(e) => providerFilter.setQuery(e.target.value)} className="h-9 w-56" />
            <ViewModeToggle value={providerViewStored} onChange={setProviderView} />
            <Button size="sm" variant="outline" onClick={() => exportToExcel(providers.map(({ Channels, ...rest }) => rest), 'providers.xlsx', 'Providers')}>
              <Download className="h-4 w-4" /> Download
            </Button>
            <label className="inline-flex">
              <input
                type="file"
                accept=".xlsx"
                className="hidden"
                onChange={async (e) => {
                  const file = e.target.files?.[0];
                  if (!file) return;
                  const rows = await parseExcelFile(file);
                  let ok = 0; const errors: string[] = [];
                  for (const [i, row] of rows.entries()) {
                    try {
                      await saveProvider({
                        ProviderID: row.ProviderID, Name: row.Name,
                        ServiceTypes: parseListCell(row.ServiceTypes),
                        ScopeType: row.ScopeType as Provider['ScopeType'], Scope: row.Scope,
                        WorkingHoursZ: row.WorkingHoursZ, Channels: [],
                      });
                      ok++;
                    } catch (err) {
                      errors.push(`Row ${i + 2}: ${err instanceof Error ? err.message : 'failed'}`);
                    }
                  }
                  alert(`${ok} imported${errors.length ? `, ${errors.length} failed:\n${errors.join('\n')}` : ''}`);
                  e.target.value = '';
                  setRefreshKey((k) => k + 1);
                }}
              />
              <span className="inline-flex h-9 cursor-pointer items-center gap-1 rounded-md border border-dashed px-3 text-xs text-muted-foreground hover:bg-muted">
                <Upload className="h-3.5 w-3.5" /> Upload
              </span>
            </label>
          </div>
          {providerView === 'details' ? (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>Provider ID</TableHead>
                  <TableHead>Scope</TableHead>
                  <TableHead>Service Types</TableHead>
                  <TableHead>Email</TableHead>
                  <TableHead>AOG</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {providerFilter.filtered.map((p) => (
                  <TableRow key={p.ProviderID}>
                    <TableCell className="font-medium">{p.Name}</TableCell>
                    <TableCell className="font-mono text-xs">{p.ProviderID}</TableCell>
                    <TableCell>{p.Scope}</TableCell>
                    <TableCell className="text-xs text-muted-foreground">{p.ServiceTypes.join(', ')}</TableCell>
                    <TableCell className="text-xs text-muted-foreground">{getPreferredContact(p.Channels, 'Email')}</TableCell>
                    <TableCell className="text-xs text-muted-foreground">{getPreferredContact(p.Channels, 'Phone')}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          ) : providerView === 'large' ? (
            <div className="grid gap-4 md:grid-cols-2">
              {providerFilter.filtered.map(p => (
                <Card key={p.ProviderID}>
                  <CardContent className="p-5">
                    <div className="mb-2 flex items-start justify-between">
                      <h3 className="font-bold">{p.Name}</h3>
                      <Badge variant="outline" className="font-mono text-xs">{p.ProviderID}</Badge>
                    </div>
                    <p className="mb-2 text-xs text-muted-foreground">Scope: {p.Scope}</p>
                    <div className="mb-2 flex flex-wrap gap-1">
                      {p.ServiceTypes.map(st => (
                        <Badge key={st} variant="secondary" className="text-xs">{st}</Badge>
                      ))}
                    </div>
                    <div className="space-y-1 text-xs text-muted-foreground">
                      <div className="flex items-center gap-1">
                        <Fuel className="h-3 w-3" />
                        {getPreferredContact(p.Channels, 'Email')}
                      </div>
                      <div className="flex items-center gap-1">
                        <Phone className="h-3 w-3" />
                        {getPreferredContact(p.Channels, 'Phone')}
                      </div>
                      <div className="flex items-center gap-1">
                        <Clock className="h-3 w-3" />
                        {p.WorkingHoursZ}
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          ) : (
            <div className={cardGridClass(providerView)}>
              {providerFilter.filtered.map((p) => (
                <EntityListCard
                  key={p.ProviderID}
                  viewMode={providerView}
                  selected={false}
                  icon={<Phone className="h-4 w-4 text-muted-foreground" />}
                  title={p.Name}
                  subtitle={p.Scope}
                  meta={<div className="text-xs text-muted-foreground">{getPreferredContact(p.Channels, 'Email')}</div>}
                  badges={p.ServiceTypes.slice(0, 3).map((st) => <Badge key={st} variant="secondary" className="text-[10px]">{st}</Badge>)}
                />
              ))}
            </div>
          )}
        </TabsContent>

        <TabsContent value="service-types">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0">
              <CardTitle className="text-base font-semibold flex items-center gap-2">
                <Tag className="h-4 w-4" /> Service Types
              </CardTitle>
              <div className="flex items-center gap-2">
                <Input placeholder="Search service types..." value={serviceTypeFilter.query} onChange={(e) => serviceTypeFilter.setQuery(e.target.value)} className="h-9 w-56" />
                <ViewModeToggle value={serviceTypeViewStored} onChange={setServiceTypeView} />
                <Button size="sm" variant="outline" onClick={() => exportToExcel(serviceTypes.map(({ variants, ...rest }) => rest), 'service-types.xlsx', 'ServiceTypes')}>
                  <Download className="h-4 w-4" /> Download
                </Button>
                <label className="inline-flex">
                  <input
                    type="file"
                    accept=".xlsx"
                    className="hidden"
                    onChange={async (e) => {
                      const file = e.target.files?.[0];
                      if (!file) return;
                      const rows = await parseExcelFile(file);
                      let ok = 0; const errors: string[] = [];
                      for (const [i, row] of rows.entries()) {
                        try {
                          await saveServiceType({
                            code: row.code, label: row.label,
                            category: row.category as ServiceTypeDef['category'],
                            active: parseBoolCell(row.active), sortOrder: parseNumberCell(row.sortOrder),
                          });
                          ok++;
                        } catch (err) {
                          errors.push(`Row ${i + 2}: ${err instanceof Error ? err.message : 'failed'}`);
                        }
                      }
                      alert(`${ok} imported${errors.length ? `, ${errors.length} failed:\n${errors.join('\n')}` : ''}`);
                      e.target.value = '';
                      reloadServiceTypes();
                    }}
                  />
                  <span className="inline-flex h-9 cursor-pointer items-center gap-1 rounded-md border border-dashed px-3 text-xs text-muted-foreground hover:bg-muted">
                    <Upload className="h-3.5 w-3.5" /> Upload
                  </span>
                </label>
                <Button size="sm" variant="outline" disabled={!isAdmin} onClick={() => isAdmin && openNewType()}><Plus className="h-4 w-4" /> Add Type</Button>
              </div>
            </CardHeader>
            <CardContent className="p-0">
              {serviceTypeView === 'details' ? (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Code</TableHead>
                      <TableHead>Label</TableHead>
                      <TableHead>Category</TableHead>
                      <TableHead>Variants</TableHead>
                      <TableHead>Active</TableHead>
                      <TableHead></TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {serviceTypeFilter.filtered.map((def) => (
                      <TableRow key={def.code}>
                        <TableCell className="font-mono">{def.code}</TableCell>
                        <TableCell className="font-medium">{def.label}</TableCell>
                        <TableCell><Badge variant="outline">{def.category}</Badge></TableCell>
                        <TableCell className="text-xs text-muted-foreground">{def.variants?.length ? def.variants.map((v) => v.label).join(', ') : '—'}</TableCell>
                        <TableCell>
                          {def.active ? (
                            <Badge variant="outline" className="border-emerald-300 text-emerald-700">Active</Badge>
                          ) : (
                            <Badge variant="outline" className="border-slate-300 text-slate-600">Inactive</Badge>
                          )}
                        </TableCell>
                        <TableCell className="flex gap-2">
                          <Button size="sm" variant="outline" disabled={!isAdmin} onClick={() => isAdmin && openEditType(def)}>Edit</Button>
                          <Button size="sm" variant="outline" disabled={!isAdmin} onClick={() => isAdmin && toggleActive(def)}>{def.active ? 'Deactivate' : 'Activate'}</Button>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              ) : (
                <div className={`p-4 ${cardGridClass(serviceTypeView)}`}>
                  {serviceTypeFilter.filtered.map((def) => (
                    <EntityListCard
                      key={def.code}
                      viewMode={serviceTypeView}
                      selected={false}
                      icon={<Tag className="h-4 w-4 text-muted-foreground" />}
                      title={def.label}
                      subtitle={def.code}
                      meta={<div className="text-xs text-muted-foreground">{def.category}</div>}
                      badges={<>
                        {def.active ? (
                          <Badge variant="outline" className="border-emerald-300 text-[10px] text-emerald-700">Active</Badge>
                        ) : (
                          <Badge variant="outline" className="border-slate-300 text-[10px] text-slate-600">Inactive</Badge>
                        )}
                        <Button size="sm" variant="outline" disabled={!isAdmin} onClick={() => isAdmin && openEditType(def)}>Edit</Button>
                        <Button size="sm" variant="outline" disabled={!isAdmin} onClick={() => isAdmin && toggleActive(def)}>{def.active ? 'Deactivate' : 'Activate'}</Button>
                      </>}
                    />
                  ))}
                </div>
              )}
            </CardContent>
          </Card>

          <Dialog open={dialogOpen} onOpenChange={(v) => !v && setDialogOpen(false)}>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>{editingType && serviceTypes.some((d) => d.code === editingType.code) ? 'Edit Service Type' : 'New Service Type'}</DialogTitle>
              </DialogHeader>
              {editingType && (
                <div className="space-y-4">
                  <div>
                    <Label>Code</Label>
                    <Input
                      value={editingType.code}
                      disabled={serviceTypes.some((d) => d.code === editingType.code)}
                      onChange={(e) => setEditingType({ ...editingType, code: e.target.value })}
                      placeholder="e.g. SLOT_COORDINATION"
                    />
                  </div>
                  <div>
                    <Label>Label</Label>
                    <Input value={editingType.label} onChange={(e) => setEditingType({ ...editingType, label: e.target.value })} placeholder="e.g. Slot Coordination" />
                  </div>
                  <div>
                    <Label>Category</Label>
                    <Select value={editingType.category} onValueChange={(v) => setEditingType({ ...editingType, category: v as ServiceTypeDef['category'] })}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="Permit">Permit</SelectItem>
                        <SelectItem value="Handling">Handling</SelectItem>
                        <SelectItem value="Other">Other</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>
              )}
              <DialogFooter>
                <Button variant="outline" onClick={() => setDialogOpen(false)}>Cancel</Button>
                <Button onClick={saveEditingType} disabled={!isAdmin || !editingType?.code || !editingType?.label}>Save</Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </TabsContent>

        <TabsContent value="leg-purposes">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0">
              <CardTitle className="text-base font-semibold flex items-center gap-2">
                <ClipboardList className="h-4 w-4" /> Leg Purposes
              </CardTitle>
              <div className="flex items-center gap-2">
                <Input placeholder="Search leg purposes..." value={legPurposeFilter.query} onChange={(e) => legPurposeFilter.setQuery(e.target.value)} className="h-9 w-56" />
                <ViewModeToggle value={legPurposeViewStored} onChange={setLegPurposeView} />
                <Button size="sm" variant="outline" onClick={() => exportToExcel(legPurposes, 'leg-purposes.xlsx', 'LegPurposes')}>
                  <Download className="h-4 w-4" /> Download
                </Button>
                <label className="inline-flex">
                  <input
                    type="file"
                    accept=".xlsx"
                    className="hidden"
                    onChange={async (e) => {
                      const file = e.target.files?.[0];
                      if (!file) return;
                      const rows = await parseExcelFile(file);
                      let ok = 0; const errors: string[] = [];
                      for (const [i, row] of rows.entries()) {
                        try {
                          await saveLegPurpose({
                            code: row.code, label: row.label,
                            active: parseBoolCell(row.active), sortOrder: parseNumberCell(row.sortOrder),
                          });
                          ok++;
                        } catch (err) {
                          errors.push(`Row ${i + 2}: ${err instanceof Error ? err.message : 'failed'}`);
                        }
                      }
                      alert(`${ok} imported${errors.length ? `, ${errors.length} failed:\n${errors.join('\n')}` : ''}`);
                      e.target.value = '';
                      reloadLegPurposes();
                    }}
                  />
                  <span className="inline-flex h-9 cursor-pointer items-center gap-1 rounded-md border border-dashed px-3 text-xs text-muted-foreground hover:bg-muted">
                    <Upload className="h-3.5 w-3.5" /> Upload
                  </span>
                </label>
                <Button size="sm" variant="outline" disabled={!isAdmin} onClick={() => isAdmin && openNewPurpose()}><Plus className="h-4 w-4" /> Add Purpose</Button>
              </div>
            </CardHeader>
            <CardContent className="p-0">
              {legPurposeView === 'details' ? (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Code</TableHead>
                      <TableHead>Label</TableHead>
                      <TableHead>Active</TableHead>
                      <TableHead></TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {legPurposeFilter.filtered.map((def) => (
                      <TableRow key={def.code}>
                        <TableCell className="font-mono">{def.code}</TableCell>
                        <TableCell className="font-medium">{def.label}</TableCell>
                        <TableCell>
                          {def.active ? (
                            <Badge variant="outline" className="border-emerald-300 text-emerald-700">Active</Badge>
                          ) : (
                            <Badge variant="outline" className="border-slate-300 text-slate-600">Inactive</Badge>
                          )}
                        </TableCell>
                        <TableCell className="flex gap-2">
                          <Button size="sm" variant="outline" disabled={!isAdmin} onClick={() => isAdmin && openEditPurpose(def)}>Edit</Button>
                          <Button size="sm" variant="outline" disabled={!isAdmin} onClick={() => isAdmin && togglePurposeActive(def)}>{def.active ? 'Deactivate' : 'Activate'}</Button>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              ) : (
                <div className={`p-4 ${cardGridClass(legPurposeView)}`}>
                  {legPurposeFilter.filtered.map((def) => (
                    <EntityListCard
                      key={def.code}
                      viewMode={legPurposeView}
                      selected={false}
                      icon={<ClipboardList className="h-4 w-4 text-muted-foreground" />}
                      title={def.label}
                      subtitle={def.code}
                      badges={<>
                        {def.active ? (
                          <Badge variant="outline" className="border-emerald-300 text-[10px] text-emerald-700">Active</Badge>
                        ) : (
                          <Badge variant="outline" className="border-slate-300 text-[10px] text-slate-600">Inactive</Badge>
                        )}
                        <Button size="sm" variant="outline" disabled={!isAdmin} onClick={() => isAdmin && openEditPurpose(def)}>Edit</Button>
                        <Button size="sm" variant="outline" disabled={!isAdmin} onClick={() => isAdmin && togglePurposeActive(def)}>{def.active ? 'Deactivate' : 'Activate'}</Button>
                      </>}
                    />
                  ))}
                </div>
              )}
            </CardContent>
          </Card>

          <Dialog open={purposeDialogOpen} onOpenChange={(v) => !v && setPurposeDialogOpen(false)}>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>{editingPurpose && legPurposes.some((d) => d.code === editingPurpose.code) ? 'Edit Leg Purpose' : 'New Leg Purpose'}</DialogTitle>
              </DialogHeader>
              {editingPurpose && (
                <div className="space-y-4">
                  <div>
                    <Label>Code</Label>
                    <Input
                      value={editingPurpose.code}
                      disabled={legPurposes.some((d) => d.code === editingPurpose.code)}
                      onChange={(e) => setEditingPurpose({ ...editingPurpose, code: e.target.value })}
                      placeholder="e.g. AIR_AMBULANCE"
                    />
                  </div>
                  <div>
                    <Label>Label</Label>
                    <Input value={editingPurpose.label} onChange={(e) => setEditingPurpose({ ...editingPurpose, label: e.target.value })} placeholder="e.g. Air Ambulance" />
                  </div>
                </div>
              )}
              <DialogFooter>
                <Button variant="outline" onClick={() => setPurposeDialogOpen(false)}>Cancel</Button>
                <Button onClick={saveEditingPurpose} disabled={!isAdmin || !editingPurpose?.code || !editingPurpose?.label}>Save</Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </TabsContent>
      </Tabs>
    </div>
  );
}
