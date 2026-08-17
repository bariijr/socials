import { store } from '../lib/store.js';
import { escapeHtml } from './ui-helpers.js';
import { formatDateTimeZ } from '../lib/format.js';

let lastRebuildResult = null;

export function renderRouteTab(container, tripId) {
  const tripLegs = store.state.legs.filter((l) => l.tripId === tripId).sort((a, b) => a.sequence - b.sequence);
  const tripStops = store.state.stops.filter((s) => s.tripId === tripId);
  const reconfirmServices = store.state.services.filter((s) => s.tripId === tripId && s.status === 'RECONFIRM_REQUIRED');

  container.innerHTML = `
    <h2>Legs</h2>
    <table>
      <thead><tr><th>Call Sign</th><th>Route</th><th>ETD (Z)</th><th></th><th>ETA (Z)</th><th></th></tr></thead>
      <tbody>
        ${tripLegs.map((leg) => `
          <tr data-leg-id="${leg.id}">
            <td>${escapeHtml(leg.callSign)}</td>
            <td>${escapeHtml(leg.depIcao)} → ${escapeHtml(leg.arrIcao)}</td>
            <td>
              <div>${escapeHtml(formatDateTimeZ(leg.etdZ))}</div>
              <input type="datetime-local" class="etd-input" value="${leg.etdZ.slice(0, 16)}" aria-label="ETD ${leg.id}" />
            </td>
            <td><button class="btn save-etd-btn">Save</button></td>
            <td>
              ${leg.etaZ === null
                ? '<span class="banner-warning" style="padding:0.1rem 0.4rem;">TBD</span>'
                : `<div>${escapeHtml(formatDateTimeZ(leg.etaZ))}</div>`}
              <input type="datetime-local" class="eta-input" value="${leg.etaZ ? leg.etaZ.slice(0, 16) : ''}" aria-label="ETA ${leg.id}" />
            </td>
            <td><button class="btn save-eta-btn">Save</button></td>
          </tr>
        `).join('')}
      </tbody>
    </table>
    ${reconfirmServices.length > 0 ? `<p class="banner-warning">Re-confirm Required: ${reconfirmServices.map((s) => escapeHtml(s.id)).join(', ')}</p>` : ''}
    <h2>Stops</h2>
    <table>
      <thead><tr><th>ICAO</th><th>Purpose</th><th>Ground Time (h)</th></tr></thead>
      <tbody>
        ${tripStops.map((s) => `<tr><td>${escapeHtml(s.icao)}</td><td>${escapeHtml(s.purpose)}</td><td>${s.groundTimeHours ?? (s.arrZ === null ? 'TBD' : '—')}</td></tr>`).join('')}
      </tbody>
    </table>
    <button id="rebuild-stops-btn" class="btn">Rebuild Stops</button>
    ${lastRebuildResult ? `<p>Rebuild complete: ${lastRebuildResult.kept.length} kept, ${lastRebuildResult.added.length} added, ${lastRebuildResult.orphaned.length} orphaned.</p>` : ''}
  `;

  container.querySelectorAll('.save-etd-btn').forEach((btn) => {
    btn.addEventListener('click', (e) => {
      const row = e.target.closest('tr');
      const input = row.querySelector('.etd-input');
      store.updateLegEtd(row.dataset.legId, new Date(input.value).toISOString(), 'Current User');
    });
  });

  container.querySelectorAll('.save-eta-btn').forEach((btn) => {
    btn.addEventListener('click', (e) => {
      const row = e.target.closest('tr');
      const input = row.querySelector('.eta-input');
      // Empty input means still TBD — store null rather than an empty string.
      store.updateLegEta(row.dataset.legId, input.value ? new Date(input.value).toISOString() : null, 'Current User');
    });
  });

  document.getElementById('rebuild-stops-btn').addEventListener('click', () => {
    // rebuildStops() notifies subscribers (re-rendering this tab) before returning, so the
    // result is cached at module scope and read back on the next render per the store
    // re-render ordering convention — see Global Constraints.
    lastRebuildResult = store.rebuildStops(tripId, 'Current User');
  });
}
