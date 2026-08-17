const SERVICE_TYPE_LABEL = {
  OVERFLIGHT_PERMIT: 'Overflight Permit',
  LANDING_PERMIT: 'Landing Permit',
  FUEL: 'Fuel',
  HANDLING: 'Handling',
  CATERING: 'Catering',
  CREW_TRANSPORT: 'Crew Transport',
  CUSTOMS: 'Customs',
};

function pendingConfirmationLine(service, scopeLabel) {
  switch (service.serviceType) {
    case 'OVERFLIGHT_PERMIT':
    case 'LANDING_PERMIT':
      return `PLEASE ASSIST WITH THE ${SERVICE_TYPE_LABEL[service.serviceType].toUpperCase()} FOR ${scopeLabel}.`;
    case 'FUEL':
      return `PLEASE ARRANGE FUEL UPLIFT AT ${scopeLabel}. CONFIRM INTO-PLANE AGENT AND QUANTITY.`;
    case 'HANDLING':
      return `PLEASE ARRANGE HANDLING AT ${scopeLabel}.`;
    case 'CATERING':
      return `PLEASE ARRANGE CATERING AT ${scopeLabel}.`;
    case 'CREW_TRANSPORT':
      return `PLEASE ARRANGE CREW TRANSPORT AT ${scopeLabel}.`;
    case 'CUSTOMS':
      return `PLEASE ASSIST WITH CUSTOMS AT ${scopeLabel}.`;
    default:
      return `PLEASE CONFIRM ${SERVICE_TYPE_LABEL[service.serviceType]}.`;
  }
}

function referenceBlock(trip) {
  return [`REF: ${trip.tripCode}`, `     REGISTRY ${trip.registration}`].join('\n');
}

function buildRequestBody(service, scopeLabel) {
  return [
    'PLEASE SPECIFICALLY CONFIRM THE FOLLOWING:',
    '',
    'PENDING CONFIRMATION',
    `   1. ${SERVICE_TYPE_LABEL[service.serviceType].toUpperCase()}:`,
    `      ${pendingConfirmationLine(service, scopeLabel)}`,
    '',
    'PLEASE ACKNOWLEDGE AND CONFIRM RECEIPT OF THIS MESSAGE.',
  ].join('\n');
}

function buildRevisionBody(service, scopeLabel, previousBasedOnEtdZ, newBasedOnEtdZ) {
  return [
    'PREVIOUS ITINERARY:',
    `   ETD ${previousBasedOnEtdZ}`,
    '',
    'NEW ITINERARY:',
    `   ETD ${newBasedOnEtdZ}`,
    '',
    'PLEASE SPECIFICALLY CONFIRM THE FOLLOWING:',
    '',
    'CHANGES',
    '   1. ITINERARY HAS CHANGED TO THE ABOVE.',
    '',
    'PENDING CONFIRMATION',
    `   1. ${SERVICE_TYPE_LABEL[service.serviceType].toUpperCase()}:`,
    `      PLEASE RECONFIRM — ${pendingConfirmationLine(service, scopeLabel)}`,
    '',
    'PLEASE ACKNOWLEDGE AND CONFIRM RECEIPT OF THIS MESSAGE.',
  ].join('\n');
}

function buildCancelBody(service, scopeLabel) {
  return [
    'PLEASE CANCEL THE FOLLOWING:',
    '',
    'CANCEL',
    `   1. ${SERVICE_TYPE_LABEL[service.serviceType].toUpperCase()} AT ${scopeLabel}.`,
    '',
    'PLEASE ACKNOWLEDGE AND CONFIRM RECEIPT OF THIS MESSAGE.',
  ].join('\n');
}

export function buildEmailDraft(service, trip, scopeLabel, provider, options = {}) {
  const mode = options.mode || 'REQUEST';
  const token = `[${trip.tripCode}/${service.id}]`;
  const subjectPrefix = mode === 'CANCEL' ? 'CANCEL' : mode === 'REVISION' ? 'REVISION' : SERVICE_TYPE_LABEL[service.serviceType];
  const subject = `${subjectPrefix} — ${trip.registration} ${token}`;

  let body;
  if (mode === 'CANCEL') {
    body = buildCancelBody(service, scopeLabel);
  } else if (mode === 'REVISION') {
    body = buildRevisionBody(service, scopeLabel, options.previousBasedOnEtdZ, options.newBasedOnEtdZ);
  } else {
    body = buildRequestBody(service, scopeLabel);
  }

  return { subject, body: `${referenceBlock(trip)}\n\n${body}`, token };
}
