import { store } from '../lib/store.js';
import { computeRequiredByZ, computeUrgency, resolveCountryRuleForService } from '../lib/core-logic.js';
import { mountNav } from './nav.js';
import { urgencyBadgeHtml, escapeHtml } from './ui-helpers.js';
import { formatDateTimeZ } from '../lib/format.js';

function render() {
  mountNav();
  const now = new Date().toISOString();
  const rows = store.state.services
    .filter((svc) => svc.status !== 'CONFIRMED' && svc.status !== 'CANCELLED' && svc.status !== 'NOT_REQUIRED')
    .map((svc) => {
      // resolveCountryRuleForService resolves the rule for THIS service's actual country, not
      // just any rule sharing its serviceType — see the comment on that function (Task 2).
      const rule = resolveCountryRuleForService(svc, store.state.countryRules, store.state.legs, store.state.stops, store.state.airports);
      const requiredByZ = rule ? computeRequiredByZ(svc.basedOnEtdZ, rule) : svc.basedOnEtdZ;
      const urgency = computeUrgency(requiredByZ, now);
      const trip = store.state.trips.find((t) => t.id === svc.tripId);
      return { svc, trip, requiredByZ, urgency };
    })
    .sort((a, b) => new Date(a.requiredByZ).getTime() - new Date(b.requiredByZ).getTime());

  document.getElementById('action-board-table').innerHTML = `
    <table>
      <thead><tr><th>Service</th><th>Trip</th><th>Type</th><th>Status</th><th>Required By (Z)</th><th>Urgency</th></tr></thead>
      <tbody>
        ${rows.map(({ svc, trip, requiredByZ, urgency }) => `
          <tr>
            <td>${escapeHtml(svc.id)}</td>
            <td>${trip ? `<a href="trip-sheet.html?id=${encodeURIComponent(trip.id)}">${escapeHtml(trip.tripCode)}</a>` : escapeHtml(svc.tripId)}</td>
            <td>${escapeHtml(svc.serviceType)}</td>
            <td>${escapeHtml(svc.status)}</td>
            <td>${escapeHtml(formatDateTimeZ(requiredByZ))}</td>
            <td>${urgencyBadgeHtml(urgency)}</td>
          </tr>
        `).join('')}
      </tbody>
    </table>
  `;
}

store.subscribe(render);
render();
