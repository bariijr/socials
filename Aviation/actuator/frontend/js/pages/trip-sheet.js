import { store } from '../lib/store.js';
import { mountNav } from './nav.js';
import { escapeHtml } from './ui-helpers.js';
import { formatDateTimeZ } from '../lib/format.js';
import { computeRequiredByZ, computeUrgency, resolveCountryRuleForService } from '../lib/core-logic.js';
import { renderRouteTab } from './trip-sheet-route.js';

const tripId = new URLSearchParams(window.location.search).get('id');
let activeTab = 'route';

const TABS = [
  { key: 'route', label: 'Route' },
  { key: 'permits', label: 'Permits' },
  { key: 'services', label: 'Services' },
  { key: 'crew-pax', label: 'Crew & Pax' },
  { key: 'documents', label: 'Documents' },
  { key: 'billing', label: 'Billing' },
  { key: 'messages', label: 'Messages' },
  { key: 'history', label: 'History' },
];

const PLACEHOLDER_TABS = new Set(['permits', 'services', 'crew-pax', 'documents', 'billing', 'messages', 'history']);

function renderHeader() {
  const trip = store.state.trips.find((t) => t.id === tripId);
  const headerEl = document.getElementById('trip-header');
  if (!trip) {
    headerEl.innerHTML = '<p>Trip not found.</p>';
    return;
  }
  headerEl.innerHTML = `
    <h1>${escapeHtml(trip.tripCode)} — ${escapeHtml(trip.clientOperator)}</h1>
    <p>Registration ${escapeHtml(trip.registration)} · Status ${escapeHtml(trip.status)}</p>
    <p>Notify: ${escapeHtml(trip.notifyRecipients.join(', ') || 'none set')}</p>
    <div id="deadline-rail"></div>
  `;
  renderDeadlineRail(trip);
}

function renderDeadlineRail(trip) {
  const rows = store.state.services
    .filter((s) => s.tripId === trip.id && !['CONFIRMED', 'CANCELLED', 'NOT_REQUIRED'].includes(s.status))
    .map((svc) => {
      const rule = resolveCountryRuleForService(svc, store.state.countryRules, store.state.legs, store.state.stops, store.state.airports);
      const requiredByZ = rule ? computeRequiredByZ(svc.basedOnEtdZ, rule) : svc.basedOnEtdZ;
      return { svc, requiredByZ, urgency: computeUrgency(requiredByZ, new Date().toISOString()) };
    })
    .sort((a, b) => new Date(a.requiredByZ).getTime() - new Date(b.requiredByZ).getTime());

  document.getElementById('deadline-rail').innerHTML = rows.length === 0
    ? '<p style="font-size:0.8rem; color:#64748b;">No pending deadlines.</p>'
    : `<div style="display:flex; gap:0.5rem; flex-wrap:wrap; font-size:0.75rem;">
        ${rows.map(({ svc, requiredByZ, urgency }) => `<span class="badge badge-${urgency.toLowerCase()}">${escapeHtml(svc.serviceType)} — ${escapeHtml(formatDateTimeZ(requiredByZ))}</span>`).join('')}
      </div>`;
}

function renderTabs() {
  document.getElementById('trip-tabs').innerHTML = TABS.map((t) =>
    `<button class="tab-btn ${activeTab === t.key ? 'tab-btn-active' : ''}" data-tab="${t.key}">${t.label}</button>`
  ).join('');
  document.querySelectorAll('.tab-btn').forEach((btn) => {
    btn.addEventListener('click', () => { activeTab = btn.dataset.tab; render(); });
  });
}

function renderTabContent() {
  const container = document.getElementById('trip-tab-content');
  if (activeTab === 'route') {
    renderRouteTab(container, tripId);
  } else if (PLACEHOLDER_TABS.has(activeTab)) {
    container.innerHTML = `<p>${escapeHtml(activeTab)} tab — implemented in a later task.</p>`;
  }
}

function render() {
  mountNav();
  renderHeader();
  renderTabs();
  renderTabContent();
}

store.subscribe(render);
render();
