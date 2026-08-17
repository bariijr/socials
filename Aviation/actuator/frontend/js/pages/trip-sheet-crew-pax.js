import { store } from '../lib/store.js';
import { escapeHtml } from './ui-helpers.js';

let addFormOpen = false;

export function renderCrewPaxTab(container, tripId) {
  const tripPersons = store.state.persons.filter((p) => p.tripId === tripId && !p.removed);

  container.innerHTML = `
    <div style="display:flex; justify-content:space-between; align-items:center;">
      <h2>Crew &amp; Pax</h2>
      <button id="add-person-btn" class="btn">Add Person</button>
    </div>
    <table>
      <thead><tr><th>Name</th><th>Role</th><th>Notes</th><th></th></tr></thead>
      <tbody>
        ${tripPersons.map((p) => {
          const role = store.state.personRoles.find((r) => r.id === p.roleId);
          return `
            <tr data-person-id="${p.id}">
              <td>${escapeHtml(p.name)}</td>
              <td>${escapeHtml(role ? role.label : p.roleId)}</td>
              <td>${escapeHtml(p.notes || '')}</td>
              <td><button class="btn remove-person-btn">Remove</button></td>
            </tr>
          `;
        }).join('')}
      </tbody>
    </table>
    <div id="add-person-form"></div>
  `;

  container.querySelectorAll('.remove-person-btn').forEach((btn) => {
    btn.addEventListener('click', (e) => {
      store.removePerson(e.target.closest('tr').dataset.personId, 'Current User');
    });
  });

  document.getElementById('add-person-btn').addEventListener('click', () => {
    addFormOpen = true;
    renderAddForm(tripId);
  });

  if (addFormOpen) renderAddForm(tripId);
}

function renderAddForm(tripId) {
  const formEl = document.getElementById('add-person-form');
  // Deliberately not re-rendered on every keystroke (unlike the Service drawer's <select>-driven
  // re-renders elsewhere in this plan) — re-rendering a free-text <input> on 'input' resets its
  // cursor position on every character typed. Name/role are read directly from the DOM at
  // Add-click time instead.
  formEl.innerHTML = `
    <div class="drawer">
      <div class="field">
        <label for="person-name">Name</label>
        <input id="person-name" />
      </div>
      <div class="field">
        <label for="person-role">Role</label>
        <select id="person-role">
          <option value="">Select…</option>
          ${store.state.personRoles.map((r) => `<option value="${r.id}">${escapeHtml(r.label)}</option>`).join('')}
        </select>
      </div>
      <button id="confirm-add-person-btn" class="btn btn-primary">Add</button>
      <button id="cancel-add-person-btn" class="btn">Cancel</button>
    </div>
  `;

  document.getElementById('cancel-add-person-btn').addEventListener('click', () => {
    addFormOpen = false;
    formEl.innerHTML = '';
  });
  document.getElementById('confirm-add-person-btn').addEventListener('click', () => {
    // UPPERCASE at capture, per the spec's display/input conventions.
    const name = document.getElementById('person-name').value.trim().toUpperCase();
    const roleId = document.getElementById('person-role').value;
    if (!name || !roleId) return;
    addFormOpen = false;
    store.addPerson({ tripId, name, roleId });
  });
}
