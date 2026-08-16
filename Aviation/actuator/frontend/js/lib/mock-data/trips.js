export const trips = [
  {
    id: 'TRIP-0041', tripCode: 'T26-0041', clientOperator: 'Acacia Charters', registration: '5H-ABC',
    ownerName: 'B. Minja', status: 'CONFIRMED',
    notifyRecipients: ['crew.5habc@example.com', 'flightdept@acaciacharters.example'],
    createdAtZ: '2026-08-01T09:00:00.000Z',
  },
  {
    id: 'TRIP-0052', tripCode: 'T26-0052', clientOperator: 'Kilimanjaro Air', registration: 'A6-DEF',
    ownerName: 'B. Minja', status: 'DRAFT', notifyRecipients: ['crew.a6def@example.com'],
    createdAtZ: '2026-08-10T11:00:00.000Z',
  },
];

export const legs = [
  { id: 'LEG-0041-1', tripId: 'TRIP-0041', sequence: 1, callSign: 'ACJ041A', depIcao: 'HTDA', arrIcao: 'HKJK', etdZ: '2026-08-20T05:00:00.000Z', etaZ: '2026-08-20T06:15:00.000Z', overflightCountries: [], revision: 0 },
  { id: 'LEG-0041-2', tripId: 'TRIP-0041', sequence: 2, callSign: 'ACJ041B', depIcao: 'HKJK', arrIcao: 'HAAB', etdZ: '2026-08-20T09:00:00.000Z', etaZ: '2026-08-20T10:45:00.000Z', overflightCountries: ['ET'], revision: 1 },
  { id: 'LEG-0041-3', tripId: 'TRIP-0041', sequence: 3, callSign: 'ACJ041C', depIcao: 'HAAB', arrIcao: 'HTDA', etdZ: '2026-08-21T07:00:00.000Z', etaZ: null, overflightCountries: ['KE'], revision: 0 },
  { id: 'LEG-0052-1', tripId: 'TRIP-0052', sequence: 1, callSign: 'KLA052A', depIcao: 'FAOR', arrIcao: 'OMDB', etdZ: '2026-08-16T18:00:00.000Z', etaZ: '2026-08-17T04:30:00.000Z', overflightCountries: ['SA'], revision: 0 },
];

export const stops = [
  { id: 'STOP-0041-HTDA-1', tripId: 'TRIP-0041', icao: 'HTDA', arrZ: null, depZ: '2026-08-20T05:00:00.000Z', groundTimeHours: null, purpose: 'TURNAROUND' },
  { id: 'STOP-0041-HKJK', tripId: 'TRIP-0041', icao: 'HKJK', arrZ: '2026-08-20T06:15:00.000Z', depZ: '2026-08-20T09:00:00.000Z', groundTimeHours: 2.75, purpose: 'TECH_STOP' },
  { id: 'STOP-0041-HAAB', tripId: 'TRIP-0041', icao: 'HAAB', arrZ: '2026-08-20T10:45:00.000Z', depZ: '2026-08-21T07:00:00.000Z', groundTimeHours: 20.25, purpose: 'NIGHT_STOP' },
  { id: 'STOP-0041-HTDA-2', tripId: 'TRIP-0041', icao: 'HTDA', arrZ: null, depZ: null, groundTimeHours: null, purpose: 'TURNAROUND' },
  { id: 'STOP-0052-FAOR', tripId: 'TRIP-0052', icao: 'FAOR', arrZ: null, depZ: '2026-08-16T18:00:00.000Z', groundTimeHours: null, purpose: 'TURNAROUND' },
  { id: 'STOP-0052-OMDB', tripId: 'TRIP-0052', icao: 'OMDB', arrZ: '2026-08-17T04:30:00.000Z', depZ: null, groundTimeHours: null, purpose: 'TURNAROUND' },
];

export const services = [
  { id: 'SVC-0041-01', tripId: 'TRIP-0041', scopeType: 'STOP', scopeId: 'STOP-0041-HKJK', serviceType: 'HANDLING', providerId: 'PRV-KE-HANDLE', status: 'CONFIRMED', refNumber: 'HKJK-HDL-8823', basedOnEtdZ: '2026-08-20T09:00:00.000Z', assignedTo: 'B. Minja' },
  { id: 'SVC-0041-02', tripId: 'TRIP-0041', scopeType: 'STOP', scopeId: 'STOP-0041-HKJK', serviceType: 'FUEL', providerId: 'PRV-KE-FUEL', status: 'CONFIRMED', refNumber: 'FUEL-KE-4471', basedOnEtdZ: '2026-08-20T09:00:00.000Z', assignedTo: 'B. Minja' },
  { id: 'SVC-0041-03', tripId: 'TRIP-0041', scopeType: 'SEGMENT', scopeId: 'LEG-0041-2:ET', serviceType: 'OVERFLIGHT_PERMIT', providerId: 'PRV-ET-PERMIT', status: 'REQUESTED', refNumber: null, basedOnEtdZ: '2026-08-20T09:00:00.000Z', assignedTo: 'B. Minja' },
  { id: 'SVC-0041-04', tripId: 'TRIP-0041', scopeType: 'LEG', scopeId: 'LEG-0041-2', serviceType: 'LANDING_PERMIT', providerId: null, status: 'RECONFIRM_REQUIRED', refNumber: 'ET-LAND-2201', basedOnEtdZ: '2026-08-20T01:00:00.000Z', assignedTo: 'B. Minja' },
  { id: 'SVC-0041-05', tripId: 'TRIP-0041', scopeType: 'SEGMENT', scopeId: 'LEG-0041-3:KE', serviceType: 'OVERFLIGHT_PERMIT', providerId: null, status: 'NOT_STARTED', refNumber: null, basedOnEtdZ: '2026-08-21T07:00:00.000Z', assignedTo: null },
  { id: 'SVC-0052-01', tripId: 'TRIP-0052', scopeType: 'SEGMENT', scopeId: 'LEG-0052-1:SA', serviceType: 'OVERFLIGHT_PERMIT', providerId: 'PRV-SA-OVERFLIGHT', status: 'CHASING', refNumber: null, basedOnEtdZ: '2026-08-16T18:00:00.000Z', assignedTo: 'B. Minja' },
  { id: 'SVC-0052-02', tripId: 'TRIP-0052', scopeType: 'STOP', scopeId: 'STOP-0052-OMDB', serviceType: 'CATERING', providerId: 'PRV-AE-CATER', status: 'NOT_STARTED', refNumber: null, basedOnEtdZ: '2026-08-17T04:30:00.000Z', assignedTo: null },
];

export const comms = [
  { id: 'COMM-0041-01', tripId: 'TRIP-0041', serviceId: 'SVC-0041-01', direction: 'OUT', kind: 'REQUEST', token: '[T26-0041/SVC-0041-01]', from: 'ops@insider.co.tz', to: ['ops@nbohandling.example'], subject: 'Handling request — 5H-ABC [T26-0041/SVC-0041-01]', body: 'Requesting handling for 5H-ABC arriving HKJK 2026-08-20T06:15Z, departing 2026-08-20T09:00Z. Full crew and pax per manifest.', timestampZ: '2026-08-02T08:00:00.000Z' },
  { id: 'COMM-0041-02', tripId: 'TRIP-0041', serviceId: 'SVC-0041-01', direction: 'IN', kind: 'REQUEST', token: '[T26-0041/SVC-0041-01]', from: 'ops@nbohandling.example', to: ['ops@insider.co.tz'], subject: 'RE: Handling request — 5H-ABC [T26-0041/SVC-0041-01]', body: 'Confirmed, ref HKJK-HDL-8823.', timestampZ: '2026-08-02T10:30:00.000Z' },
  { id: 'COMM-0041-03', tripId: 'TRIP-0041', serviceId: null, direction: 'OUT', kind: 'NOTIFICATION', token: null, from: 'ops@insider.co.tz', to: ['crew.5habc@example.com', 'flightdept@acaciacharters.example'], subject: 'Trip T26-0041 confirmed', body: 'Trip T26-0041 (HTDA-HKJK-HAAB-HTDA) is now confirmed.', timestampZ: '2026-08-05T12:00:00.000Z' },
];

export const auditEntries = [
  { id: 'AUD-0041-01', timestampZ: '2026-08-02T08:00:00.000Z', user: 'B. Minja', table: 'Service', recordId: 'SVC-0041-01', field: 'status', oldValue: 'NOT_STARTED', newValue: 'REQUESTED' },
  { id: 'AUD-0041-02', timestampZ: '2026-08-02T10:30:00.000Z', user: 'B. Minja', table: 'Service', recordId: 'SVC-0041-01', field: 'status', oldValue: 'REQUESTED', newValue: 'CONFIRMED' },
  { id: 'AUD-0041-03', timestampZ: '2026-08-14T06:00:00.000Z', user: 'B. Minja', table: 'Leg', recordId: 'LEG-0041-2', field: 'etdZ', oldValue: '2026-08-20T01:00:00.000Z', newValue: '2026-08-20T09:00:00.000Z' },
  { id: 'AUD-0041-04', timestampZ: '2026-08-14T06:00:01.000Z', user: 'system', table: 'Service', recordId: 'SVC-0041-04', field: 'status', oldValue: 'CONFIRMED', newValue: 'RECONFIRM_REQUIRED' },
];
