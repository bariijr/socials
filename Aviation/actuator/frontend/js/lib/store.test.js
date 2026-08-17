import { describe, it, expect } from 'vitest';
import { createStore } from './store.js';

describe('store', () => {
  it('seeds state from the mock-data fixtures', () => {
    const store = createStore();
    expect(store.state.trips.length).toBeGreaterThan(0);
    expect(store.state.airports.length).toBeGreaterThan(0);
  });

  it('addTrip appends a new trip with a generated id and createdAtZ', () => {
    const store = createStore();
    const before = store.state.trips.length;
    store.addTrip({ tripCode: '2608999', clientOperator: 'Test Op', registration: '5HABC', ownerName: 'Tester', status: 'DRAFT', notifyRecipients: [] });
    expect(store.state.trips.length).toBe(before + 1);
    const created = store.state.trips.find((t) => t.tripCode === '2608999');
    expect(created.id).toBeTruthy();
    expect(created.createdAtZ).toBeTruthy();
  });

  it('updateLegEtd changes the leg, bumps revision, and records an audit entry', () => {
    const store = createStore();
    const leg = store.state.legs.find((l) => l.id === 'LEG-0041-1');
    // Snapshot as a primitive, not a live reference — updateLegEtd mutates the found leg object
    // in place (same pattern as updateServiceStatus/removePerson elsewhere in this store), so
    // `leg` and `updated` below end up being the SAME object; comparing `leg.revision` after the
    // call would compare the post-mutation value against itself.
    const revisionBefore = leg.revision;
    const before = store.state.audit.length;
    store.updateLegEtd('LEG-0041-1', '2026-09-01T00:00:00.000Z', 'Tester');
    const updated = store.state.legs.find((l) => l.id === 'LEG-0041-1');
    expect(updated.etdZ).toBe('2026-09-01T00:00:00.000Z');
    expect(updated.revision).toBe(revisionBefore + 1);
    expect(store.state.audit.length).toBe(before + 1);
  });

  it('updateLegEtd flips affected CONFIRMED services to RECONFIRM_REQUIRED when the shift exceeds tolerance', () => {
    const store = createStore();
    store.updateLegEtd('LEG-0041-2', '2026-08-20T20:00:00.000Z', 'Tester');
    const svc = store.state.services.find((s) => s.id === 'SVC-0041-01');
    expect(svc.status).toBe('RECONFIRM_REQUIRED');
  });

  it("updateLegEtd resolves each affected service's own country tolerance, not a shared same-serviceType rule", () => {
    // CountryRule is keyed by (countryIso2, serviceType) — there are multiple OVERFLIGHT_PERMIT
    // rules in the seed data, one per country, with different toleranceHours (SA: 2h, ET: 6h — see
    // mock-data/countryRules.js). A lookup that filters by serviceType alone would silently grab
    // whichever OVERFLIGHT_PERMIT rule sorts first in the array (TZ, toleranceHours: 4) for BOTH
    // services below, producing a wrong reconfirm decision. This is the regression test that would
    // have caught that bug.
    const store = createStore();
    const leg = store.addLeg({ tripId: 'TRIP-0041', sequence: 99, callSign: 'TEST99', depIcao: 'HTDA', arrIcao: 'HKJK', etdZ: '2026-08-20T05:00:00.000Z', etaZ: null, overflightCountries: ['SA', 'ET'] });
    const svcSA = store.addService({ tripId: 'TRIP-0041', scopeType: 'SEGMENT', scopeId: `${leg.id}:SA`, serviceType: 'OVERFLIGHT_PERMIT', providerId: 'PRV-SA-OVERFLIGHT', status: 'CONFIRMED', refNumber: 'SA-OVF-1', basedOnEtdZ: leg.etdZ, assignedTo: 'Tester' });
    const svcET = store.addService({ tripId: 'TRIP-0041', scopeType: 'SEGMENT', scopeId: `${leg.id}:ET`, serviceType: 'OVERFLIGHT_PERMIT', providerId: 'PRV-ET-PERMIT', status: 'CONFIRMED', refNumber: 'ET-OVF-1', basedOnEtdZ: leg.etdZ, assignedTo: 'Tester' });

    // Shift ETD by 3 hours: exceeds SA's 2h tolerance (must flip), stays within ET's 6h tolerance (must not flip).
    store.updateLegEtd(leg.id, '2026-08-20T08:00:00.000Z', 'Tester');

    expect(store.state.services.find((s) => s.id === svcSA.id).status).toBe('RECONFIRM_REQUIRED');
    expect(store.state.services.find((s) => s.id === svcET.id).status).toBe('CONFIRMED');
  });

  it('updateLegEta fills in a TBD ETA, bumps revision, and audits, without touching any service status', () => {
    const store = createStore();
    const leg = store.state.legs.find((l) => l.id === 'LEG-0041-3');
    expect(leg.etaZ).toBeNull();
    const revisionBefore = leg.revision; // primitive snapshot — see the comment on the updateLegEtd test above.
    const confirmedBefore = store.state.services.filter((s) => s.status === 'CONFIRMED').map((s) => s.id);
    store.updateLegEta('LEG-0041-3', '2026-08-21T09:30:00.000Z', 'Tester');
    const updated = store.state.legs.find((l) => l.id === 'LEG-0041-3');
    expect(updated.etaZ).toBe('2026-08-21T09:30:00.000Z');
    expect(updated.revision).toBe(revisionBefore + 1);
    const confirmedAfter = store.state.services.filter((s) => s.status === 'CONFIRMED').map((s) => s.id);
    expect(confirmedAfter).toEqual(confirmedBefore);
  });

  it('addPerson appends a person to state; removePerson soft-deletes it (kept, flagged) and audits', () => {
    const store = createStore();
    const before = store.state.persons.length;
    const created = store.addPerson({ tripId: 'TRIP-0041', name: 'Test Person', roleId: 'ROLE-PAX' });
    expect(store.state.persons.length).toBe(before + 1);
    expect(created.id).toBeTruthy();
    const auditBefore = store.state.audit.length;
    store.removePerson(created.id, 'Tester');
    // Still present (soft delete) so its audit trail stays reachable from the trip's History tab.
    expect(store.state.persons.length).toBe(before + 1);
    expect(store.state.persons.find((p) => p.id === created.id).removed).toBe(true);
    expect(store.state.audit.length).toBe(auditBefore + 1);
  });

  it('addService appends a service to state', () => {
    const store = createStore();
    const before = store.state.services.length;
    store.addService({ tripId: 'TRIP-0041', scopeType: 'STOP', scopeId: 'STOP-0041-HKJK', serviceType: 'CATERING', providerId: null, status: 'NOT_STARTED', refNumber: null, basedOnEtdZ: '2026-08-20T09:00:00.000Z', assignedTo: null });
    expect(store.state.services.length).toBe(before + 1);
  });

  it('updateServiceProvider changes a service\'s provider (including to null) and audits', () => {
    const store = createStore();
    const svc = store.state.services.find((s) => s.id === 'SVC-0041-05'); // seeded providerId: null
    const auditBefore = store.state.audit.length;
    store.updateServiceProvider('SVC-0041-05', 'PRV-ET-PERMIT', 'Tester');
    expect(store.state.services.find((s) => s.id === 'SVC-0041-05').providerId).toBe('PRV-ET-PERMIT');
    expect(store.state.audit.length).toBe(auditBefore + 1);
    store.updateServiceProvider('SVC-0041-05', null, 'Tester');
    expect(store.state.services.find((s) => s.id === 'SVC-0041-05').providerId).toBeNull();
  });

  it('addComm appends a comm with a generated id and timestamp', () => {
    const store = createStore();
    const before = store.state.comms.length;
    store.addComm({ tripId: 'TRIP-0041', serviceId: 'SVC-0041-01', direction: 'OUT', kind: 'REQUEST', token: '[2608001/SVC-0041-01]', from: 'ops@insider.co.tz', to: ['x@example.com'], subject: 'Test', body: 'Body' });
    expect(store.state.comms.length).toBe(before + 1);
  });

  it('rebuildStops updates stops for a trip and returns the diff result', () => {
    const store = createStore();
    const diff = store.rebuildStops('TRIP-0041', 'Tester');
    expect(diff.kept).toBeDefined();
    expect(diff.added).toBeDefined();
    expect(diff.orphaned).toBeDefined();
  });

  it('starts with empty documents/billing arrays (no seed data exists until Tasks 18-19)', () => {
    const store = createStore();
    expect(store.state.documents).toEqual([]);
    expect(store.state.billing).toEqual([]);
  });

  it('addDocument appends a document; removeDocument soft-deletes it (kept, flagged) and audits', () => {
    const store = createStore();
    const created = store.addDocument({ tripId: 'TRIP-0041', name: 'AOC Certificate', docType: 'AOC' });
    expect(store.state.documents.length).toBe(1);
    expect(created.id).toBeTruthy();
    expect(created.uploadedAtZ).toBeTruthy();
    const auditBefore = store.state.audit.length;
    store.removeDocument(created.id, 'Tester');
    expect(store.state.documents.length).toBe(1);
    expect(store.state.documents.find((d) => d.id === created.id).removed).toBe(true);
    expect(store.state.audit.length).toBe(auditBefore + 1);
  });

  it('addBillingLineItem appends a line item; removeBillingLineItem soft-deletes it; updateBillingLineItemStatus changes status and audits', () => {
    const store = createStore();
    const created = store.addBillingLineItem({ tripId: 'TRIP-0041', description: 'Handling fee', amount: 500, currency: 'USD', status: 'PENDING' });
    expect(store.state.billing.length).toBe(1);
    expect(created.id).toBeTruthy();
    store.updateBillingLineItemStatus(created.id, 'INVOICED', 'Tester');
    expect(store.state.billing.find((b) => b.id === created.id).status).toBe('INVOICED');
    const auditBefore = store.state.audit.length;
    store.removeBillingLineItem(created.id, 'Tester');
    expect(store.state.billing.length).toBe(1);
    expect(store.state.billing.find((b) => b.id === created.id).removed).toBe(true);
    expect(store.state.audit.length).toBe(auditBefore + 1);
  });

  it('notifies subscribers on every mutation', () => {
    const store = createStore();
    let calls = 0;
    store.subscribe(() => { calls += 1; });
    store.addTrip({ tripCode: '2608888', clientOperator: 'X', registration: '5HABC', ownerName: 'X', status: 'DRAFT', notifyRecipients: [] });
    expect(calls).toBe(1);
  });
});
