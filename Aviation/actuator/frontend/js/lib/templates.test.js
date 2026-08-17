import { describe, it, expect } from 'vitest';
import { buildEmailDraft } from './templates.js';

const trip = { id: 'T1', tripCode: '2608001', clientOperator: 'Acacia', registration: '5HABC', ownerName: 'X', status: 'DRAFT', notifyRecipients: [], createdAtZ: '2026-01-01T00:00:00.000Z' };
const provider = { id: 'P1', name: 'EA Fuel', serviceType: 'FUEL', scopeIcao: 'HKJK', email: 'fuel@example.com', aogContact: '+1', workingHoursZ: '00:00-23:59' };
const fuelSvc = { id: 'SVC-1', tripId: 'T1', scopeType: 'STOP', scopeId: 'S1', serviceType: 'FUEL', providerId: 'P1', status: 'NOT_STARTED', refNumber: null, basedOnEtdZ: '2026-08-20T09:00:00.000Z', assignedTo: null };

describe('buildEmailDraft — REQUEST mode (default)', () => {
  it('embeds the correlation token in the subject', () => {
    const draft = buildEmailDraft(fuelSvc, trip, 'HKJK', provider);
    expect(draft.token).toBe('[2608001/SVC-1]');
    expect(draft.subject).toContain('[2608001/SVC-1]');
  });

  it('includes a numbered PENDING CONFIRMATION block naming the scope', () => {
    const draft = buildEmailDraft(fuelSvc, trip, 'HKJK', provider);
    expect(draft.body).toContain('PENDING CONFIRMATION');
    expect(draft.body).toContain('HKJK');
    expect(draft.body).toContain(trip.registration);
  });
});

describe('buildEmailDraft — REVISION mode', () => {
  it('shows PREVIOUS ITINERARY against NEW ITINERARY and keeps the same token', () => {
    const draft = buildEmailDraft(fuelSvc, trip, 'HKJK', provider, {
      mode: 'REVISION', previousBasedOnEtdZ: '2026-08-20T09:00:00.000Z', newBasedOnEtdZ: '2026-08-20T20:00:00.000Z',
    });
    expect(draft.token).toBe('[2608001/SVC-1]');
    expect(draft.body).toContain('PREVIOUS ITINERARY');
    expect(draft.body).toContain('2026-08-20T09:00:00.000Z');
    expect(draft.body).toContain('NEW ITINERARY');
    expect(draft.body).toContain('2026-08-20T20:00:00.000Z');
  });
});

describe('buildEmailDraft — CANCEL mode', () => {
  it('includes a CANCEL block naming the service and scope', () => {
    const draft = buildEmailDraft(fuelSvc, trip, 'HKJK', provider, { mode: 'CANCEL' });
    expect(draft.subject).toContain('CANCEL');
    expect(draft.body).toContain('CANCEL');
    expect(draft.body).toContain('HKJK');
  });
});
