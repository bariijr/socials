import { store } from '../lib/store.js';
import { filterTrips } from '../lib/trips-filter.js';
import { mountNav } from './nav.js';
import { escapeHtml } from './ui-helpers.js';

let searchQuery = '';
let statusFilter = 'ALL';

function render() {
  mountNav();
  const rows = filterTrips(store.state.trips, searchQuery, statusFilter);
  document.getElementById('trips-table').innerHTML = `
    <table>
      <thead><tr><th>Trip</th><th>Client</th><th>Registration</th><th>Status</th></tr></thead>
      <tbody>
        ${rows.map((t) => `
          <tr>
            <td><a href="trip-sheet.html?id=${encodeURIComponent(t.id)}">${escapeHtml(t.tripCode)}</a></td>
            <td>${escapeHtml(t.clientOperator)}</td>
            <td>${escapeHtml(t.registration)}</td>
            <td>${escapeHtml(t.status)}</td>
          </tr>
        `).join('')}
      </tbody>
    </table>
  `;
}

document.getElementById('search-input').addEventListener('input', (e) => { searchQuery = e.target.value; render(); });
document.getElementById('status-filter').addEventListener('change', (e) => { statusFilter = e.target.value; render(); });

store.subscribe(render);
render();
