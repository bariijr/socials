import { airports } from './mock-data/airports.js';
import { countries } from './mock-data/countries.js';
import { countryRules } from './mock-data/countryRules.js';
import { aircraft } from './mock-data/aircraft.js';
import { providers } from './mock-data/providers.js';
import { personRoles } from './mock-data/personRoles.js';
import { trips as seedTrips, legs as seedLegs, stops as seedStops, services as seedServices, comms as seedComms, auditEntries as seedAudit } from './mock-data/trips.js';
import { persons as seedPersons } from './mock-data/persons.js';
import { needsReconfirm } from './core-logic.js';
import { diffStopsForRebuild } from './stops.js';

let idCounter = 0;
function nextId(prefix) {
  idCounter += 1;
  return `${prefix}-${Date.now()}-${idCounter}`;
}

export function createStore() {
  const state = {
    airports, countries, countryRules, aircraft, providers, personRoles,
    trips: seedTrips.map((t) => ({ ...t })),
    persons: seedPersons.map((p) => ({ ...p })),
    legs: seedLegs.map((l) => ({ ...l })),
    stops: seedStops.map((s) => ({ ...s })),
    services: seedServices.map((s) => ({ ...s })),
    comms: seedComms.map((c) => ({ ...c })),
    audit: seedAudit.map((a) => ({ ...a })),
    documents: [],
    billing: [],
  };
  const listeners = new Set();

  function notify() {
    for (const listener of listeners) listener();
  }

  function subscribe(listener) {
    listeners.add(listener);
    return () => listeners.delete(listener);
  }

  function addAuditEntry(entry) {
    state.audit.push({ ...entry, id: nextId('AUD'), timestampZ: new Date().toISOString() });
  }

  function addTrip(trip) {
    const created = { ...trip, id: nextId('TRIP'), createdAtZ: new Date().toISOString() };
    state.trips.push(created);
    notify();
    return created;
  }

  function addPerson(person) {
    const created = { ...person, id: nextId('PER') };
    state.persons.push(created);
    notify();
    return created;
  }

  function removePerson(personId, user) {
    const person = state.persons.find((p) => p.id === personId);
    if (!person) return;
    // Soft delete — kept in state (not spliced out) so this audit entry stays reachable from
    // the trip's History tab, which finds entries by joining recordId back to a live record.
    addAuditEntry({ user, table: 'Person', recordId: personId, field: 'removed', oldValue: 'false', newValue: 'true' });
    person.removed = true;
    notify();
  }

  function addLeg(leg) {
    const created = { ...leg, id: nextId('LEG'), revision: 0 };
    state.legs.push(created);
    notify();
    return created;
  }

  function updateLegEta(legId, newEtaZ, user) {
    const leg = state.legs.find((l) => l.id === legId);
    if (!leg) return;
    addAuditEntry({ user, table: 'Leg', recordId: legId, field: 'etaZ', oldValue: leg.etaZ === null ? 'TBD' : leg.etaZ, newValue: newEtaZ });
    leg.etaZ = newEtaZ;
    leg.revision += 1;
    notify();
  }

  function updateLegEtd(legId, newEtdZ, user) {
    const leg = state.legs.find((l) => l.id === legId);
    if (!leg) return;
    const oldEtdZ = leg.etdZ;
    addAuditEntry({ user, table: 'Leg', recordId: legId, field: 'etdZ', oldValue: oldEtdZ, newValue: newEtdZ });

    for (const svc of state.services) {
      if (svc.status !== 'CONFIRMED') continue;
      const rule = state.countryRules.find((r) => r.serviceType === svc.serviceType);
      const tolerance = rule ? rule.toleranceHours : 0;
      const affects =
        (svc.scopeType === 'LEG' && svc.scopeId === legId) ||
        (svc.scopeType === 'SEGMENT' && svc.scopeId.startsWith(`${legId}:`)) ||
        (svc.scopeType === 'STOP' && state.stops.some((s) => s.id === svc.scopeId && (s.arrZ === oldEtdZ || s.depZ === oldEtdZ)));
      if (affects && needsReconfirm(svc.basedOnEtdZ, newEtdZ, tolerance)) {
        addAuditEntry({ user: 'system', table: 'Service', recordId: svc.id, field: 'status', oldValue: svc.status, newValue: 'RECONFIRM_REQUIRED' });
        svc.status = 'RECONFIRM_REQUIRED';
      }
    }

    leg.etdZ = newEtdZ;
    leg.revision += 1;
    notify();
  }

  function addStops(newStops) {
    const created = newStops.map((s) => ({ ...s, id: nextId('STOP') }));
    state.stops.push(...created);
    notify();
    return created;
  }

  function rebuildStops(tripId, user) {
    const tripLegs = state.legs.filter((l) => l.tripId === tripId);
    const tripStops = state.stops.filter((s) => s.tripId === tripId);
    const hasAttachedServices = (stopId) => state.services.some((svc) => svc.scopeType === 'STOP' && svc.scopeId === stopId);
    const result = diffStopsForRebuild(tripId, tripLegs, tripStops, hasAttachedServices);
    const addedWithIds = result.added.map((s) => ({ ...s, id: nextId('STOP') }));

    state.stops = [
      ...state.stops.filter((s) => s.tripId !== tripId || result.kept.some((k) => k.id === s.id)),
      ...addedWithIds,
    ];
    addAuditEntry({ user, table: 'Trip', recordId: tripId, field: 'stops', oldValue: `${tripStops.length} stops`, newValue: `${result.kept.length + addedWithIds.length} stops` });
    notify();
    return { ...result, added: addedWithIds };
  }

  function addService(service) {
    const created = { ...service, id: nextId('SVC') };
    state.services.push(created);
    notify();
    return created;
  }

  function updateServiceStatus(serviceId, status, user) {
    const svc = state.services.find((s) => s.id === serviceId);
    if (!svc) return;
    addAuditEntry({ user, table: 'Service', recordId: serviceId, field: 'status', oldValue: svc.status, newValue: status });
    svc.status = status;
    notify();
  }

  function updateServiceProvider(serviceId, providerId, user) {
    const svc = state.services.find((s) => s.id === serviceId);
    if (!svc) return;
    addAuditEntry({ user, table: 'Service', recordId: serviceId, field: 'providerId', oldValue: svc.providerId ?? 'none', newValue: providerId ?? 'none' });
    svc.providerId = providerId;
    notify();
  }

  function addComm(comm) {
    const created = { ...comm, id: nextId('COMM'), timestampZ: new Date().toISOString() };
    state.comms.push(created);
    notify();
    return created;
  }

  function addDocument(doc) {
    const created = { ...doc, id: nextId('DOC'), uploadedAtZ: new Date().toISOString() };
    state.documents.push(created);
    notify();
    return created;
  }

  function removeDocument(documentId, user) {
    const doc = state.documents.find((d) => d.id === documentId);
    if (!doc) return;
    addAuditEntry({ user, table: 'Document', recordId: documentId, field: 'removed', oldValue: 'false', newValue: 'true' });
    doc.removed = true;
    notify();
  }

  function addBillingLineItem(item) {
    const created = { ...item, id: nextId('BILL') };
    state.billing.push(created);
    notify();
    return created;
  }

  function removeBillingLineItem(lineItemId, user) {
    const item = state.billing.find((b) => b.id === lineItemId);
    if (!item) return;
    addAuditEntry({ user, table: 'Billing', recordId: lineItemId, field: 'removed', oldValue: 'false', newValue: 'true' });
    item.removed = true;
    notify();
  }

  function updateBillingLineItemStatus(lineItemId, status, user) {
    const item = state.billing.find((b) => b.id === lineItemId);
    if (!item) return;
    addAuditEntry({ user, table: 'Billing', recordId: lineItemId, field: 'status', oldValue: item.status, newValue: status });
    item.status = status;
    notify();
  }

  return {
    state, subscribe, addTrip, addPerson, removePerson, addLeg, updateLegEtd, updateLegEta, addStops, rebuildStops,
    addService, updateServiceStatus, updateServiceProvider, addComm, addAuditEntry,
    addDocument, removeDocument, addBillingLineItem, removeBillingLineItem, updateBillingLineItemStatus,
  };
}

export const store = createStore();
