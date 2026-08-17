const URGENCY_CLASS = {
  OK: 'badge badge-ok',
  DUE: 'badge badge-due',
  URGENT: 'badge badge-urgent',
  BREACH: 'badge badge-breach',
};

export function urgencyBadgeHtml(urgency) {
  const cls = URGENCY_CLASS[urgency] || 'badge';
  return `<span class="${cls}" data-testid="urgency-badge">${escapeHtml(urgency)}</span>`;
}

export function escapeHtml(value) {
  const div = document.createElement('div');
  div.textContent = value === null || value === undefined ? '' : String(value);
  return div.innerHTML;
}
