import { store } from '../lib/store.js';
import { getScopeCandidates, scopeTypeForServiceType } from '../lib/scope.js';
import { computeRequiredByZ, computeUrgency, resolveCountryRuleForService } from '../lib/core-logic.js';
import { buildEmailDraft } from '../lib/templates.js';
import { escapeHtml } from './ui-helpers.js';
import { formatDateTimeZ, countryNameFor } from '../lib/format.js';

let drawerOpen = false;
let drawerServiceType = null;
let drawerScopeId = '';
let cancelServiceId = null;
let providerServiceId = null;

// Duplicated (in spirit) by trip-sheet-messages.js in Task 14 — each tab resolves scope labels
// independently since there's no shared page-level helpers file in this plan's structure.
// Shows the country NAME for SEGMENT scope, not the raw ISO2 — `getScopeCandidates` (Task 5,
// already built before this task) still returns a raw-ISO2 label internally, but every page-level
// consumer resolves it to a name at render time instead, since scope.js has no access to
// `countries` and wasn't worth retrofitting after the fact — see this task's ledger note.
function scopeLabelFor(scopeType, scopeId, legs, stops) {
  if (scopeType === 'LEG') {
    const leg = legs.find((l) => l.id === scopeId);
    return leg ? `${leg.depIcao} → ${leg.arrIcao}` : scopeId;
  }
  if (scopeType === 'STOP') {
    const stop = stops.find((s) => s.id === scopeId);
    return stop ? stop.icao : scopeId;
  }
  const [legId, iso2] = scopeId.split(':');
  const leg = legs.find((l) => l.id === legId);
  return leg ? `${leg.depIcao} → ${leg.arrIcao} (${countryNameFor(iso2, store.state.countries)})` : scopeId;
}

export function renderServiceGroupTab(container, tripId, { title, serviceTypes }) {
  // Guard against drawer state left over from the OTHER tab that shares this module (Permits vs
  // Services). Checked unconditionally (not just while drawerOpen) because the Add Service button
  // handler calls renderDrawer() directly without going through this guard — so a serviceType left
  // over from a PREVIOUS, already-closed drawer session on the other tab (e.g. Add Service on
  // Services, confirm, then switch to Permits and open Add Service again) must be caught here, on
  // the next render of this tab, not only while a drawer happens to still be open.
  if (drawerServiceType === null || !serviceTypes.includes(drawerServiceType)) {
    drawerServiceType = serviceTypes[0];
    drawerScopeId = '';
  }

  const tripServices = store.state.services.filter((s) => s.tripId === tripId && serviceTypes.includes(s.serviceType));
  const tripLegsForRows = store.state.legs.filter((l) => l.tripId === tripId);
  const tripStopsForRows = store.state.stops.filter((s) => s.tripId === tripId);

  container.innerHTML = `
    <div style="display:flex; justify-content:space-between; align-items:center;">
      <h2>${escapeHtml(title)}</h2>
      <button id="add-service-btn" class="btn">Add ${escapeHtml(title.replace(/s$/, ''))}</button>
    </div>
    <table>
      <thead><tr><th>Service</th><th>Type</th><th>Scope</th><th>Provider</th><th>Status</th><th></th></tr></thead>
      <tbody>
        ${tripServices.map((s) => {
          const provider = store.state.providers.find((p) => p.id === s.providerId);
          return `
          <tr data-service-id="${s.id}">
            <td>${escapeHtml(s.id)}</td><td>${escapeHtml(s.serviceType)}</td>
            <td>${escapeHtml(scopeLabelFor(s.scopeType, s.scopeId, tripLegsForRows, tripStopsForRows))}</td>
            <td>${escapeHtml(provider ? provider.name : 'None')}</td>
            <td>${escapeHtml(s.status)}</td>
            <td>
              ${s.status === 'CANCELLED' ? '' : '<button class="btn change-provider-btn">Change Provider</button> <button class="btn cancel-service-btn">Cancel</button>'}
            </td>
          </tr>
        `;
        }).join('')}
      </tbody>
    </table>
    <div id="service-drawer"></div>
    <div id="cancel-drawer"></div>
    <div id="provider-drawer"></div>
  `;

  document.getElementById('add-service-btn').addEventListener('click', () => {
    drawerOpen = true;
    renderDrawer(tripId, serviceTypes);
  });

  container.querySelectorAll('.cancel-service-btn').forEach((btn) => {
    btn.addEventListener('click', (e) => {
      cancelServiceId = e.target.closest('tr').dataset.serviceId;
      renderCancelDrawer(tripId);
    });
  });

  container.querySelectorAll('.change-provider-btn').forEach((btn) => {
    btn.addEventListener('click', (e) => {
      providerServiceId = e.target.closest('tr').dataset.serviceId;
      renderProviderDrawer();
    });
  });

  if (drawerOpen) renderDrawer(tripId, serviceTypes);
  if (cancelServiceId) renderCancelDrawer(tripId);
  if (providerServiceId) renderProviderDrawer();
}

// "Alter permit vendor" — changing an existing service's provider after creation (e.g. the
// first vendor doesn't respond, switch to a backup). Doesn't send anything itself; use Compose
// (Task 14) afterward to notify the new provider — this action only updates the assignment.
function renderProviderDrawer() {
  const drawerEl = document.getElementById('provider-drawer');
  const service = store.state.services.find((s) => s.id === providerServiceId);
  const candidateProviders = store.state.providers.filter((p) => p.serviceType === service.serviceType);

  drawerEl.innerHTML = `
    <div class="drawer">
      <h3>Change Provider — ${escapeHtml(service.id)}</h3>
      <div class="field">
        <label for="provider-select">Provider</label>
        <select id="provider-select">
          <option value="">None</option>
          ${candidateProviders.map((p) => `<option value="${p.id}" ${p.id === service.providerId ? 'selected' : ''}>${escapeHtml(p.name)}</option>`).join('')}
        </select>
      </div>
      <button id="confirm-change-provider-btn" class="btn btn-primary">Save</button>
      <button id="cancel-change-provider-btn" class="btn">Close</button>
    </div>
  `;

  document.getElementById('cancel-change-provider-btn').addEventListener('click', () => {
    providerServiceId = null;
    drawerEl.innerHTML = '';
  });
  document.getElementById('confirm-change-provider-btn').addEventListener('click', () => {
    const newProviderId = document.getElementById('provider-select').value || null;
    // Local drawer state closed BEFORE calling the store mutator, per the store re-render
    // ordering convention.
    providerServiceId = null;
    store.updateServiceProvider(service.id, newProviderId, 'Current User');
  });
}

function renderCancelDrawer(tripId) {
  const drawerEl = document.getElementById('cancel-drawer');
  const service = store.state.services.find((s) => s.id === cancelServiceId);
  const trip = store.state.trips.find((t) => t.id === tripId);
  const provider = store.state.providers.find((p) => p.id === service.providerId);
  const tripLegs = store.state.legs.filter((l) => l.tripId === tripId);
  const tripStops = store.state.stops.filter((s) => s.tripId === tripId);
  const scopeLabel = scopeLabelFor(service.scopeType, service.scopeId, tripLegs, tripStops);
  const draft = buildEmailDraft(service, trip, scopeLabel, provider, { mode: 'CANCEL' });

  drawerEl.innerHTML = `
    <div class="drawer">
      <h3>Cancel ${escapeHtml(service.id)}</h3>
      <p style="white-space:pre-wrap; font-size:0.8rem; background:#fff; border:1px solid #e2e8f0; padding:0.5rem;">${escapeHtml(draft.subject)}\n\n${escapeHtml(draft.body)}</p>
      <button id="confirm-cancel-btn" class="btn btn-primary">Send Cancellation</button>
      <button id="dismiss-cancel-btn" class="btn">Back</button>
    </div>
  `;

  document.getElementById('dismiss-cancel-btn').addEventListener('click', () => {
    cancelServiceId = null;
    drawerEl.innerHTML = '';
  });
  document.getElementById('confirm-cancel-btn').addEventListener('click', () => {
    const commPayload = {
      tripId, serviceId: service.id, direction: 'OUT', kind: 'CANCEL', token: draft.token,
      from: 'ops@insider.co.tz', to: provider ? [provider.email] : [], subject: draft.subject, body: draft.body,
    };
    cancelServiceId = null;
    store.addComm(commPayload);
    store.updateServiceStatus(service.id, 'CANCELLED', 'Current User');
  });
}

function resolveBasedOnEtdZ(serviceType, scopeId, legs, stops) {
  if (!scopeId) return null;
  const scopeType = scopeTypeForServiceType(serviceType);
  if (scopeType === 'LEG') {
    const leg = legs.find((l) => l.id === scopeId);
    return leg ? leg.etdZ : null;
  }
  if (scopeType === 'SEGMENT') {
    const [legId] = scopeId.split(':');
    const leg = legs.find((l) => l.id === legId);
    return leg ? leg.etdZ : null;
  }
  const stop = stops.find((s) => s.id === scopeId);
  return stop ? (stop.depZ || stop.arrZ) : null;
}

function renderDrawer(tripId, serviceTypes) {
  const drawerEl = document.getElementById('service-drawer');
  const tripLegs = store.state.legs.filter((l) => l.tripId === tripId);
  const tripStops = store.state.stops.filter((s) => s.tripId === tripId);
  const candidates = getScopeCandidates(drawerServiceType, tripLegs, tripStops);
  const candidateScopeType = scopeTypeForServiceType(drawerServiceType);
  const basedOnEtdZ = resolveBasedOnEtdZ(drawerServiceType, drawerScopeId, tripLegs, tripStops);
  // No full Service object exists yet at preview time — pass a minimal pseudo-object carrying
  // only the 3 fields resolveCountryRuleForService reads (scopeType/scopeId/serviceType), so the
  // preview resolves the rule for the country the candidate scope actually points at, not just
  // whichever rule happens to share this serviceType (see the resolver's doc comment, Task 2).
  const rule = resolveCountryRuleForService(
    { scopeType: candidateScopeType, scopeId: drawerScopeId, serviceType: drawerServiceType },
    store.state.countryRules, tripLegs, tripStops, store.state.airports,
  );

  let preview = null;
  if (basedOnEtdZ && rule) {
    const requiredByZ = computeRequiredByZ(basedOnEtdZ, rule);
    preview = { requiredByZ, urgency: computeUrgency(requiredByZ, new Date().toISOString()) };
  }

  drawerEl.innerHTML = `
    <div class="drawer">
      <h3>Add Service</h3>
      <div class="field">
        <label for="service-type-select">Service Type</label>
        <select id="service-type-select">
          ${serviceTypes.map((st) => `<option value="${st}" ${st === drawerServiceType ? 'selected' : ''}>${st}</option>`).join('')}
        </select>
      </div>
      <div class="field">
        <label for="scope-select">Scope</label>
        <select id="scope-select">
          <option value="">Select…</option>
          ${candidates.map((c) => `<option value="${c.scopeId}" ${c.scopeId === drawerScopeId ? 'selected' : ''}>${escapeHtml(scopeLabelFor(candidateScopeType, c.scopeId, tripLegs, tripStops))}</option>`).join('')}
        </select>
      </div>
      ${preview ? `<p data-testid="required-by-preview">Required by ${escapeHtml(formatDateTimeZ(preview.requiredByZ))} — <strong>${preview.urgency}</strong></p>` : ''}
      <button id="confirm-add-service-btn" class="btn btn-primary" ${drawerScopeId ? '' : 'disabled'}>Add Service</button>
      <button id="cancel-add-service-btn" class="btn">Close</button>
    </div>
  `;

  document.getElementById('service-type-select').addEventListener('change', (e) => {
    drawerServiceType = e.target.value;
    drawerScopeId = '';
    renderDrawer(tripId, serviceTypes);
  });
  document.getElementById('scope-select').addEventListener('change', (e) => {
    drawerScopeId = e.target.value;
    renderDrawer(tripId, serviceTypes);
  });
  document.getElementById('cancel-add-service-btn').addEventListener('click', () => {
    drawerOpen = false;
    drawerScopeId = '';
    drawerEl.innerHTML = '';
  });
  document.getElementById('confirm-add-service-btn').addEventListener('click', () => {
    if (!drawerScopeId || !basedOnEtdZ) return;
    const defaultProvider = store.state.providers.find((p) => p.serviceType === drawerServiceType);
    const newService = {
      tripId, scopeType: scopeTypeForServiceType(drawerServiceType), scopeId: drawerScopeId,
      serviceType: drawerServiceType, providerId: defaultProvider ? defaultProvider.id : null,
      status: 'NOT_STARTED', refNumber: null, basedOnEtdZ, assignedTo: null,
    };
    // Local drawer state is closed BEFORE calling the store mutator, per the store
    // re-render ordering convention: addService() re-renders this tab synchronously,
    // so drawerOpen must already reflect "closed" by the time that render runs.
    drawerOpen = false;
    drawerScopeId = '';
    store.addService(newService);
  });
}
