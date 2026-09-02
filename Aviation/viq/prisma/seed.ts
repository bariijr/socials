// ─────────────────────────────────────────────────────────────────────────────
// JetFlow API — Database Seed
// Loads reference data from prisma/seed-data/*.json (copied from the
// frontend's src/data/json/) plus a small set of demo trips/legs/services so
// the API starts with data that lines up with the existing frontend demo.
// ─────────────────────────────────────────────────────────────────────────────

import { PrismaClient } from '@prisma/client';
import * as fs from 'fs';
import * as path from 'path';

const prisma = new PrismaClient();

function loadJson<T = any>(name: string): T {
  const file = path.join(__dirname, 'seed-data', name);
  return JSON.parse(fs.readFileSync(file, 'utf-8'));
}

async function seedCountries() {
  const countries = loadJson<any[]>('countries.json');
  for (const c of countries) {
    await prisma.country.upsert({
      where: { iso2: c.ISO2 },
      update: {},
      create: {
        iso2: c.ISO2,
        iso3: c.ISO3,
        name: c.Name,
        region: c.Region,
        subRegion: c.SubRegion,
        overflightPermitRequired: !!c.OverflightPermitRequired,
        landingPermitRequired: !!c.LandingPermitRequired,
        aocDocsRequired: !!c.AOCDocsRequired,
        ciqRequired: !!c.CIQRequired,
        escalationContact: c.EscalationContact,
        caaWebsite: c.CAAWebsite,
        notes: c.Notes,
        centroidLat: c.CentroidLat,
        centroidLng: c.CentroidLng,
      },
    });
  }
  console.log(`  countries: ${countries.length}`);
}

async function seedAirports() {
  const airports = loadJson<any[]>('airports.json');
  for (const a of airports) {
    await prisma.airport.upsert({
      where: { icao: a.ICAO },
      update: {},
      create: {
        icao: a.ICAO,
        iata: a.IATA,
        name: a.Name,
        city: a.City,
        countryIso2: a.CountryISO2,
        tz: a.TZ,
        latitude: a.Latitude,
        longitude: a.Longitude,
        elevationFt: a.ElevationFt,
        runwayLengthFt: a.RunwayLengthFt,
        category: a.Category,
        fboCount: a.FBOCount,
      },
    });
  }
  console.log(`  airports: ${airports.length}`);
}

async function seedCities() {
  const cities = loadJson<any[]>('cities.json');
  for (const c of cities) {
    await prisma.city.upsert({
      where: { name_countryIso2: { name: c.Name, countryIso2: c.CountryISO2 } },
      update: {},
      create: { name: c.Name, countryIso2: c.CountryISO2, tz: c.TZ },
    });
  }
  console.log(`  cities: ${cities.length}`);
}

async function seedAircraftTypes() {
  const types = loadJson<any[]>('aircraft-types.json');
  for (const t of types) {
    await prisma.aircraftType.upsert({
      where: { icaoType: t.ICAOType },
      update: {},
      create: {
        icaoType: t.ICAOType,
        manufacturer: t.Manufacturer,
        model: t.Model,
        category: t.Category,
        mtowKg: t.MTOW_kg,
        maxRangeNm: t.MaxRangeNM,
        maxPax: t.MaxPax,
        typicalPax: t.TypicalPax,
        crewRequired: t.CrewRequired,
        maxCrew: t.MaxCrew,
        cruiseSpeedKts: t.CruiseSpeedKts,
        ceilingFt: t.CeilingFt,
        fuelBurnKgPerHour: t.FuelBurnKgPerHour,
        noiseCert: t.NoiseCert,
        wakeCategory: t.WakeCategory,
        approachCategory: t.ApproachCategory,
        landingDistanceFt: t.LandingDistanceFt,
        takeoffDistanceFt: t.TakeoffDistanceFt,
        wingspanFt: t.WingspanFt,
        lengthFt: t.LengthFt,
        description: t.Description,
      },
    });
  }
  console.log(`  aircraft types: ${types.length}`);
}

async function seedAircraft() {
  const aircraft = loadJson<any[]>('aircraft.json');
  for (const a of aircraft) {
    await prisma.aircraft.upsert({
      where: { registration: a.Registration },
      update: {},
      create: {
        registration: a.Registration,
        icaoType: a.ICAOType,
        manufacturerOverride: a.ManufacturerOverride,
        modelOverride: a.ModelOverride,
        mtowOverrideKg: a.MTOWOverride_kg,
        maxRangeOverrideNm: a.MaxRangeOverrideNM,
        fuelBurnOverrideKgPerHour: a.FuelBurnOverrideKgPerHour,
        noiseCertOverride: a.NoiseCertOverride,
        currentOperatorId: a.CurrentOperatorID,
        previousOperators: a.PreviousOperators ?? [],
        yearOfManufacture: a.YearOfManufacture,
        serialNumber: a.SerialNumber,
        insuranceValidUntil: a.InsuranceValidUntil ? new Date(a.InsuranceValidUntil) : null,
        airworthinessValidUntil: a.AirworthinessValidUntil ? new Date(a.AirworthinessValidUntil) : null,
        homeBaseIcao: a.HomeBaseICAO,
        status: a.Status,
        notes: a.Notes,
      },
    });
  }
  console.log(`  aircraft: ${aircraft.length}`);
}

async function seedOperators() {
  const operators = loadJson<any[]>('operators.json');
  for (const o of operators) {
    await prisma.operator.upsert({
      where: { operatorId: o.OperatorID },
      update: {},
      create: {
        operatorId: o.OperatorID,
        name: o.Name,
        type: o.Type,
        address: o.Address,
        email: o.Email,
        phone: o.Phone,
        fleet: o.Fleet ?? [],
        primaryContact: o.PrimaryContact,
        billingAddress: o.BillingAddress,
        paymentTerms: o.PaymentTerms,
        status: o.Status,
        notes: o.Notes,
      },
    });
  }
  console.log(`  operators: ${operators.length}`);
}

async function seedProviders() {
  const providers = loadJson<any[]>('providers.json');
  for (const p of providers) {
    await prisma.provider.upsert({
      where: { providerId: p.ProviderID },
      update: {},
      create: {
        providerId: p.ProviderID,
        name: p.Name,
        serviceTypes: p.ServiceTypes ?? [],
        scopeType: p.ScopeType,
        scope: p.Scope,
        email: p.Email,
        aogContact: p.AOGContact,
        workingHoursZ: p.WorkingHoursZ,
        currency: p.Currency,
        paymentTerms: p.PaymentTerms,
        rating: p.Rating,
        contractActive: p.ContractActive ?? true,
        notes: p.Notes,
      },
    });
  }
  console.log(`  providers: ${providers.length}`);
}

async function seedCountryRules() {
  const rules = loadJson<any[]>('country-rules.json');
  for (const r of rules) {
    await prisma.countryRule.upsert({
      where: { countryIso2_serviceType: { countryIso2: r.CountryISO2, serviceType: r.ServiceType } },
      update: {},
      create: {
        countryIso2: r.CountryISO2,
        serviceType: r.ServiceType,
        leadTimeHours: r.LeadTimeHours,
        workingDaysOnly: !!r.WorkingDaysOnly,
        toleranceHours: r.ToleranceHours ?? 0,
        exceptionAirports: r.ExceptionAirports ?? [],
        docsRequired: r.DocsRequired ?? [],
        notes: r.Notes,
      },
    });
  }
  console.log(`  country rules: ${rules.length}`);
}

async function seedICAORules() {
  const rules = loadJson<any[]>('icao-rules.json');
  for (const r of rules) {
    await prisma.iCAORule.upsert({
      where: { icao: r.ICAO },
      update: {},
      create: {
        icao: r.ICAO,
        inheritedCountryIso2: r.InheritedCountryISO2,
        rules: r.Rules ?? [],
        exceptions: r.Exceptions ?? [],
        preferredProviders: r.PreferredProviders ?? [],
      },
    });
  }
  console.log(`  ICAO rules: ${rules.length}`);
}

async function seedDocTemplates() {
  const templates = loadJson<any[]>('doc-templates.json');
  for (const t of templates) {
    await prisma.docTemplate.upsert({
      where: { docType: t.DocType },
      update: {},
      create: {
        docType: t.DocType,
        category: t.Category,
        description: t.Description,
        requiredFor: t.RequiredFor ?? [],
        validityRequired: !!t.ValidityRequired,
        defaultValidityMonths: t.DefaultValidityMonths,
        issuedBy: t.IssuedBy,
        format: t.Format,
      },
    });
  }
  console.log(`  doc templates: ${templates.length}`);
}

async function seedPriceList() {
  const items = loadJson<any[]>('pricelist.json');
  for (const p of items) {
    const exists = await prisma.priceItem.findFirst({
      where: { providerId: p.ProviderID, serviceType: p.ServiceType, unit: p.Unit },
    });
    if (exists) continue;
    await prisma.priceItem.create({
      data: {
        providerId: p.ProviderID,
        serviceType: p.ServiceType,
        unit: p.Unit,
        price: p.Price,
        currency: p.Currency ?? 'USD',
        notes: p.Notes,
      },
    });
  }
  console.log(`  price list: ${items.length}`);
}

async function seedServiceTypeDefs() {
  const defs = loadJson<any[]>('service-type-defs.json');
  for (const d of defs) {
    await prisma.serviceTypeDef.upsert({
      where: { code: d.code },
      update: {},
      create: {
        code: d.code,
        label: d.label,
        category: d.category,
        variants: d.variants ?? undefined,
        sortOrder: d.sortOrder ?? 0,
      },
    });
  }
  console.log(`  service type defs: ${defs.length}`);
}

async function seedLegPurposeDefs() {
  const defs = loadJson<any[]>('leg-purpose-defs.json');
  for (const d of defs) {
    await prisma.legPurposeDef.upsert({
      where: { code: d.code },
      update: {},
      create: {
        code: d.code,
        label: d.label,
        sortOrder: d.sortOrder ?? 0,
      },
    });
  }
  console.log(`  leg purpose defs: ${defs.length}`);
}

// ─── Demo transactional data (mirrors the frontend's src/lib/seed-data.ts) ──

async function seedDemoTrips() {
  const trips = [
    { tripId: '2608001', client: 'Apex Capital', operator: 'JetStream Executive Aviation', registration: 'MABCD', status: 'Active', owner: 'Sarah Mitchell', createdZ: '2026-08-10T09:00:00Z', supportRef: 'UVS-88214' },
    { tripId: '2608002', client: 'Horizon Trust Aviation', operator: 'Horizon Trust Aviation', registration: 'GTEST', status: 'Planning', owner: 'Ops Desk', createdZ: '2026-08-18T14:30:00Z' },
    { tripId: '2608003', client: 'Universal Trip Support Services', operator: 'Universal Trip Support Services', registration: 'N868KE', status: 'Complete', owner: 'Ops Desk', createdZ: '2026-08-01T08:00:00Z', supportRef: 'UVS-87102' },
    { tripId: '2608004', client: 'Solairus Aviation', operator: 'Solairus Aviation', registration: 'N80TE', status: 'Active', owner: 'Ops Desk', createdZ: '2026-08-16T11:00:00Z' },
  ];
  for (const t of trips) {
    await prisma.trip.upsert({ where: { tripId: t.tripId }, update: {}, create: t });
  }

  const legs = [
    { legId: 'LEG-0001-1', tripId: '2608001', seq: 1, depIcao: 'EGLL', arrIcao: 'OMDB', etdZ: '2026-08-22T08:00:00Z', etaZ: '2026-08-22T15:30:00Z', blockHours: 7.5, paxCount: 6, crewCount: 3, countriesOverflown: ['FR', 'IT', 'GR', 'EG', 'SA'], revision: 1, callSign: 'ACW169' },
    { legId: 'LEG-0001-2', tripId: '2608001', seq: 2, depIcao: 'OMDB', arrIcao: 'HKJK', etdZ: '2026-08-24T06:00:00Z', etaZ: '2026-08-24T11:15:00Z', blockHours: 5.25, paxCount: 6, crewCount: 3, countriesOverflown: ['SA', 'SD'], revision: 1, callSign: 'ACW169' },
    { legId: 'LEG-0002-1', tripId: '2608002', seq: 1, depIcao: 'LFPG', arrIcao: 'EGLL', etdZ: '2026-08-25T10:00:00Z', etaZ: '2026-08-25T10:55:00Z', blockHours: 0.9, paxCount: 4, crewCount: 2, countriesOverflown: [], revision: 1 },
    { legId: 'LEG-0003-1', tripId: '2608003', seq: 1, depIcao: 'EGLL', arrIcao: 'OMDB', etdZ: '2026-08-03T09:00:00Z', etaZ: '2026-08-03T16:20:00Z', blockHours: 7.3, paxCount: 8, crewCount: 3, countriesOverflown: ['FR', 'IT', 'GR', 'EG', 'SA'], revision: 2 },
    { legId: 'LEG-0004-1', tripId: '2608004', seq: 1, depIcao: 'HECA', arrIcao: 'FACT', etdZ: '2026-08-21T05:00:00Z', etaZ: '2026-08-21T12:40:00Z', blockHours: 7.6, paxCount: 5, crewCount: 2, countriesOverflown: ['SD', 'ET', 'KE', 'MW', 'ZA'], revision: 1 },
  ];
  for (const l of legs) {
    await prisma.leg.upsert({ where: { legId: l.legId }, update: {}, create: l });
  }

  const stops = [
    { stopId: 'STOP-0001-1', tripId: '2608001', icao: 'OMDB', arrZ: '2026-08-22T15:30:00Z', depZ: '2026-08-24T06:00:00Z', groundTimeHours: 38.5, purpose: 'Night' },
    { stopId: 'STOP-0003-1', tripId: '2608003', icao: 'OMDB', arrZ: '2026-08-03T16:20:00Z', depZ: '2026-08-05T09:00:00Z', groundTimeHours: 40.7, purpose: 'CrewChange' },
  ];
  for (const s of stops) {
    await prisma.stop.upsert({ where: { stopId: s.stopId }, update: {}, create: s });
  }

  const services = [
    { svcId: 'SVC-0001-1', tripId: '2608001', scopeType: 'LEG', scopeId: 'LEG-0001-2', serviceType: 'Permit', providerId: 'P008', status: 'Requested', refNumber: '', basedOnEtdZ: '2026-08-24T06:00:00Z', requiredByZ: '2026-08-21T06:00:00Z', urgency: 'DUE', assignedTo: 'Ops Desk', notes: 'Kenya landing permit for HKJK arrival.', countryIso2: 'KE' },
    { svcId: 'SVC-0001-2', tripId: '2608001', scopeType: 'SEGMENT', scopeId: 'LEG-0001-1', serviceType: 'Overflight', providerId: 'P007', status: 'Confirmed', refNumber: 'SA-OVF-44210', basedOnEtdZ: '2026-08-22T08:00:00Z', requiredByZ: '2026-08-20T08:00:00Z', urgency: 'OK', assignedTo: 'Ops Desk', notes: 'Saudi overflight, EGLL–OMDB sector.', confirmedBy: 'GACA Permit Desk', confirmedAtZ: '2026-08-18T10:12:00Z', validityZ: '2026-08-23T00:00:00Z', countryIso2: 'SA' },
    { svcId: 'SVC-0001-3', tripId: '2608001', scopeType: 'STOP', scopeId: 'STOP-0001-1', serviceType: 'GroundHandling', providerId: 'P001', status: 'Confirmed', refNumber: 'JAD-99021', basedOnEtdZ: '2026-08-22T15:30:00Z', requiredByZ: '2026-08-21T15:30:00Z', urgency: 'OK', assignedTo: 'Ops Desk', notes: 'Jet Aviation Dubai, VIP handling + lounge.', confirmedBy: 'Jet Aviation Dubai', confirmedAtZ: '2026-08-15T09:00:00Z' },
    { svcId: 'SVC-0001-4', tripId: '2608001', scopeType: 'STOP', scopeId: 'STOP-0001-1', serviceType: 'Fuel', providerId: 'P001', status: 'Confirmed', refNumber: 'JAD-99021-F', basedOnEtdZ: '2026-08-24T06:00:00Z', requiredByZ: '2026-08-23T06:00:00Z', urgency: 'OK', assignedTo: 'Ops Desk', notes: 'Uplift for OMDB–HKJK sector, Jet A-1.', confirmedBy: 'Jet Aviation Dubai', confirmedAtZ: '2026-08-15T09:00:00Z' },
    { svcId: 'SVC-0002-1', tripId: '2608002', scopeType: 'LEG', scopeId: 'LEG-0002-1', serviceType: 'Slot', providerId: 'P003', status: 'Not Started', refNumber: '', basedOnEtdZ: '2026-08-25T10:55:00Z', requiredByZ: '2026-08-23T10:55:00Z', urgency: 'OK', assignedTo: 'Ops Desk', notes: 'LHR arrival slot required.' },
    { svcId: 'SVC-0002-2', tripId: '2608002', scopeType: 'LEG', scopeId: 'LEG-0002-1', serviceType: 'GroundHandling', providerId: 'P003', status: 'Not Started', refNumber: '', basedOnEtdZ: '2026-08-25T10:55:00Z', requiredByZ: '2026-08-24T10:55:00Z', urgency: 'OK', assignedTo: 'Ops Desk', notes: 'Signature Flight Support LHR.' },
    { svcId: 'SVC-0003-1', tripId: '2608003', scopeType: 'SEGMENT', scopeId: 'LEG-0003-1', serviceType: 'Overflight', providerId: 'P011', status: 'Confirmed', refNumber: 'UNI-33291', basedOnEtdZ: '2026-08-03T09:00:00Z', requiredByZ: '2026-08-01T09:00:00Z', urgency: 'OK', assignedTo: 'Universal Weather', notes: 'Full-route overflight package.', confirmedBy: 'Universal Weather', confirmedAtZ: '2026-07-29T12:00:00Z' },
    { svcId: 'SVC-0003-2', tripId: '2608003', scopeType: 'STOP', scopeId: 'STOP-0003-1', serviceType: 'GroundHandling', providerId: 'P001', status: 'Confirmed', refNumber: 'JAD-98110', basedOnEtdZ: '2026-08-03T16:20:00Z', requiredByZ: '2026-08-02T16:20:00Z', urgency: 'OK', assignedTo: 'Ops Desk', notes: 'Crew-change handling, OMDB.', confirmedBy: 'Jet Aviation Dubai', confirmedAtZ: '2026-07-30T09:00:00Z' },
    { svcId: 'SVC-0003-3', tripId: '2608003', scopeType: 'TRIP', scopeId: '2608003', serviceType: 'Catering', providerId: 'P001', status: 'Confirmed', refNumber: 'JAD-CAT-771', basedOnEtdZ: '2026-08-03T09:00:00Z', requiredByZ: '2026-08-02T09:00:00Z', urgency: 'OK', assignedTo: 'Ops Desk', notes: 'VIP catering, both sectors.', confirmedBy: 'Jet Aviation Dubai', confirmedAtZ: '2026-07-30T09:00:00Z' },
    { svcId: 'SVC-0004-1', tripId: '2608004', scopeType: 'LEG', scopeId: 'LEG-0004-1', serviceType: 'Permit', providerId: 'P004', status: 'Chasing', refNumber: '', basedOnEtdZ: '2026-08-21T05:00:00Z', requiredByZ: '2026-08-18T05:00:00Z', urgency: 'BREACH', assignedTo: 'Ops Desk', notes: 'South Africa landing permit — provider unresponsive since Aug 17, deadline passed.', countryIso2: 'ZA' },
    { svcId: 'SVC-0004-2', tripId: '2608004', scopeType: 'STOP', scopeId: 'STOP-0001-1', serviceType: 'CrewTransport', providerId: 'P013', status: 'Requested', refNumber: '', basedOnEtdZ: '2026-08-21T12:40:00Z', requiredByZ: '2026-08-20T18:00:00Z', urgency: 'URGENT', assignedTo: 'Ops Desk', notes: 'Crew hotel transfer, FACT arrival.' },
  ];
  for (const s of services) {
    await prisma.service.upsert({ where: { svcId: s.svcId }, update: {}, create: s as any });
  }

  const persons = [
    { personId: 'PER-0001-1', tripId: '2608001', name: 'James Carter', role: 'PIC', licenceNumber: 'ATPL-44201', medicalValidUntil: '2027-03-01' },
    { personId: 'PER-0001-2', tripId: '2608001', name: 'Elena Ruiz', role: 'SIC', licenceNumber: 'ATPL-51820', medicalValidUntil: '2026-11-15' },
    { personId: 'PER-0001-3', tripId: '2608001', name: 'Marcus Webb', role: 'FA', medicalValidUntil: '2027-01-10' },
    { personId: 'PER-0001-4', tripId: '2608001', name: 'David Langford', role: 'Principal', passportNationality: 'GB' },
    { personId: 'PER-0001-5', tripId: '2608001', name: 'Amara Langford', role: 'VIP', passportNationality: 'GB' },
    { personId: 'PER-0004-1', tripId: '2608004', name: 'Priya Nair', role: 'PIC', licenceNumber: 'ATPL-30987', medicalValidUntil: '2026-09-05' },
  ];
  for (const p of persons) {
    await prisma.person.upsert({
      where: { personId: p.personId },
      update: {},
      create: { ...p, medicalValidUntil: p.medicalValidUntil ? new Date(p.medicalValidUntil) : undefined } as any,
    });
  }

  const comms = [
    { commId: 'COM-0001-1', direction: 'OUTBOUND', tripId: '2608001', svcId: 'SVC-0001-1', token: 'TKN-A1B2', from: 'ops@viq.aero', to: 'permits@kcaa.go.ke', subject: 'Landing Permit Request — HKJK, ACW169, 24 Aug', body: 'Requesting landing permit for M-ABCD (ACW169) arriving HKJK 24 Aug 1115Z.', timestampZ: '2026-08-18T09:00:00Z', status: 'Sent' },
    { commId: 'COM-0001-2', direction: 'INBOUND', tripId: '2608001', svcId: 'SVC-0001-2', token: 'TKN-A1B2', from: 'permits@gaca.gov.sa', to: 'ops@viq.aero', subject: 'RE: Overflight Confirmation SA-OVF-44210', body: 'Overflight approved, ref SA-OVF-44210, valid through 23 Aug 2026.', timestampZ: '2026-08-18T10:12:00Z', status: 'Received' },
    { commId: 'COM-0004-1', direction: 'OUTBOUND', tripId: '2608004', svcId: 'SVC-0004-1', token: 'TKN-C3D4', from: 'ops@viq.aero', to: 'ops@africanaviation.co.ke', subject: 'URGENT: South Africa Permit Status — Deadline Passed', body: 'Following up urgently, RequiredByZ has passed for the FACT landing permit.', timestampZ: '2026-08-19T07:00:00Z', status: 'Sent' },
  ];
  for (const c of comms) {
    await prisma.comm.upsert({ where: { commId: c.commId }, update: {}, create: c as any });
  }

  const docs = [
    { docId: 'DOC-0001-1', tripId: '2608001', svcId: null, docType: 'Registration Certificate', fileName: 'M-ABCD_reg_cert.pdf', uploadedZ: '2026-08-10T09:15:00Z', uploadedBy: 'Sarah Mitchell' },
    { docId: 'DOC-0001-2', tripId: '2608001', svcId: null, docType: 'Insurance Certificate', fileName: 'M-ABCD_insurance.pdf', uploadedZ: '2026-08-10T09:16:00Z', uploadedBy: 'Sarah Mitchell', validUntil: '2026-12-31' },
    { docId: 'DOC-0001-3', tripId: '2608001', svcId: 'SVC-0001-1', docType: 'Permit Application Form', fileName: '2608001_KE_permit_app.pdf', uploadedZ: '2026-08-18T08:45:00Z', uploadedBy: 'Ops Desk' },
    { docId: 'DOC-0003-1', tripId: '2608003', svcId: null, docType: 'PAX List', fileName: '2608003_paxlist.pdf', uploadedZ: '2026-08-01T08:30:00Z', uploadedBy: 'Ops Desk' },
  ];
  for (const d of docs) {
    await prisma.docAttachment.upsert({
      where: { docId: d.docId },
      update: {},
      create: { ...d, validUntil: d.validUntil ? new Date(d.validUntil) : undefined } as any,
    });
  }

  console.log(`  demo trips: ${trips.length}, legs: ${legs.length}, stops: ${stops.length}, services: ${services.length}, persons: ${persons.length}, comms: ${comms.length}, docs: ${docs.length}`);
}

async function seedUsers() {
  await prisma.user.upsert({
    where: { username: process.env.ADMIN_USERNAME! },
    update: {},
    create: {
      username: process.env.ADMIN_USERNAME!,
      passwordHash: process.env.ADMIN_PASSWORD_HASH!,
      role: 'Admin',
    },
  });
  console.log(`  users: 1`);
}

async function main() {
  console.log('Seeding reference data...');
  await seedCountries();
  await seedAirports();
  await seedCities();
  await seedAircraftTypes();
  await seedAircraft();
  await seedOperators();
  await seedProviders();
  await seedCountryRules();
  await seedICAORules();
  await seedDocTemplates();
  await seedPriceList();
  await seedServiceTypeDefs();
  await seedLegPurposeDefs();
  await seedUsers();

  console.log('Seeding demo transactional data...');
  await seedDemoTrips();

  console.log('Done.');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
