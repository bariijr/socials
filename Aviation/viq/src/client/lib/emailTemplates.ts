import { getAirport, getCountry, getMessageTemplateOverride } from '@/lib/dataStore';
import type { Leg, ServiceType, TripPersonView } from '@/data/types';

export type TemplateType =
  | 'VIQ_OverflyRequest'
  | 'VIQ_OverflyRevision'
  | 'VIQ_LandingRequest'
  | 'VIQ_LandingRevision'
  | 'VIQ_GroundHandlingRequest'
  | 'VIQ_GroundHandlingRevision'
  | 'Fuel'
  | 'Catering'
  | 'CrewTransport'
  | 'Customs'
  | 'Hotel'
  | 'VIQ_MultiLegPermit'
  | 'Generic';

export type RequestAction = 'Request' | 'Revision';

// The three service types that carry an explicit REQUEST/REVISION subject
// and a PREVIOUS/NEW itinerary body on revision.
const ACTION_TEMPLATE_PAIRS: Record<'Overflight' | 'Permit' | 'GroundHandling', Record<RequestAction, TemplateType>> = {
  Overflight: { Request: 'VIQ_OverflyRequest', Revision: 'VIQ_OverflyRevision' },
  Permit: { Request: 'VIQ_LandingRequest', Revision: 'VIQ_LandingRevision' },
  GroundHandling: { Request: 'VIQ_GroundHandlingRequest', Revision: 'VIQ_GroundHandlingRevision' },
};

export function hasRequestRevisionToggle(serviceType: ServiceType): boolean {
  return serviceType === 'Overflight' || serviceType === 'Permit' || serviceType === 'GroundHandling';
}

export function defaultTemplateFor(serviceType: ServiceType, action: RequestAction): TemplateType {
  const pair = (ACTION_TEMPLATE_PAIRS as Partial<Record<ServiceType, Record<RequestAction, TemplateType>>>)[serviceType];
  return pair ? pair[action] : (SERVICE_TYPE_TO_TEMPLATE[serviceType] ?? 'Generic');
}

export function toggleTemplateAction(template: TemplateType): TemplateType {
  for (const pair of Object.values(ACTION_TEMPLATE_PAIRS)) {
    if (template === pair.Request) return pair.Revision;
    if (template === pair.Revision) return pair.Request;
  }
  return template;
}

export function isRevisionTemplate(template: TemplateType): boolean {
  return Object.values(ACTION_TEMPLATE_PAIRS).some((pair) => pair.Revision === template);
}

export function isActionTemplate(template: TemplateType): boolean {
  return Object.values(ACTION_TEMPLATE_PAIRS).some((pair) => pair.Request === template || pair.Revision === template);
}

export const SERVICE_TYPE_TO_TEMPLATE: Partial<Record<string, TemplateType>> = {
  Permit: 'VIQ_LandingRequest',
  Overflight: 'VIQ_OverflyRequest',
  GroundHandling: 'VIQ_GroundHandlingRequest',
  Fuel: 'Fuel',
  Catering: 'Catering',
  CrewTransport: 'CrewTransport',
  Customs: 'Customs',
  Hotel: 'Hotel',
  Slot: 'Generic',
  PPR: 'Generic',
  Visa: 'Generic',
  FlightPlanning: 'Generic',
};

function countryNameFor(countryISO2: string | null | undefined): string {
  if (!countryISO2) return 'TBD';
  return (getCountry(countryISO2)?.Name || countryISO2).toUpperCase();
}

// Single-pass literal {{KEY}} substitution — deliberately not a general
// templating language (no conditionals, no loops). Used for both the
// code-level defaults below and any DB-stored country override, so
// there is exactly one rendering mechanism.
function renderTemplate(str: string, vars: Record<string, string>): string {
  return str.replace(/\{\{(\w+)\}\}/g, (_match, key) => vars[key] ?? '');
}

export const COUNTRY_AWARE_TEMPLATE_TYPES: TemplateType[] = [
  'VIQ_OverflyRequest', 'VIQ_OverflyRevision',
  'VIQ_LandingRequest', 'VIQ_LandingRevision',
  'VIQ_GroundHandlingRequest', 'VIQ_GroundHandlingRevision',
];

// The 6 CAA-facing templates' default subject/body, expressed with the
// same {{PLACEHOLDER}} syntax a country override uses — an admin's
// "reset to default" action loads this text verbatim as their starting
// point. Universal-Weather-specific wording ("UNIVERSAL REFERENCE NBR",
// the thirdparty@universalweather.com billing address) has been
// genericized here — these are no longer tied to one specific vendor.
export const DEFAULT_TEMPLATES: Partial<Record<TemplateType, { subject: string; body: string }>> = {
  VIQ_OverflyRequest: {
    subject: 'OVERFLY PERMIT REQUEST - {{TRIP_ID}} - {{REG}} - {{COUNTRY_NAME}}',
    body: `ATTN: CAA: {{COUNTRY_NAME}}, RESPECTFULLY REQUEST OVERFLY PERMISSION WITH A 72 HOUR VALIDITY IN CASE OF DELAY BASED ON:
A. OPERATOR: {{OPERATOR}}
    ADDRESS: C/O {{OPERATOR}}
             BILLING ADDRESS: SEE INVOICE INSTRUCTIONS ON FILE
B. REGISTRY: {{REG}}  ACFT TYPE: {{ACTYPE}}   MTOW: {{MTOW}} LB
C. AIRCRAFT CLASSIFICATION: Private - Non Revenue
D. ITINERARY:
        ETD {{DEP_NAME}} / {{DEP}}          {{ETD}}
        ETA {{ARR_NAME}} / {{ARR}}               {{ETA}}
E. ROUTE: VIA APPROVED ATS ROUTES
F. PURPOSE OF FLIGHT: BUSINESS
G. CREW: CAPTAIN {{PIC}} PLUS {{CREW_COUNT}} CREW AND {{PAX_COUNT}} PAX.
THANK YOU FOR YOUR CONSIDERATION OF THIS REQUEST AND AWAITING YOUR APPROVAL WE REMAIN VERY TRULY YOURS.
{{SENDER_NAME}} / {{TRIP_ID}} / {{REG}} / END

REQUEST SENT TO: {{RECIPIENTS}}
{{SENDER_BLOCK}}
ATTACHMENTS:
1. REGISTRATION CERTIFICATE
2. AIRWORTHINESS CERTIFICATE
3. INSURANCE CERTIFICATE
4. PERMIT APPLICATION FORM`,
  },
  VIQ_OverflyRevision: {
    subject: 'OVERFLY PERMIT REVISION - {{TRIP_ID}} - {{REG}} - {{COUNTRY_NAME}}',
    body: `ATTN: CIVIL AVIATION AUTHORITY
REF: OVERFLY PERMIT REVISION FOR {{COUNTRY_NAME}}:
A. OPERATOR: {{OPERATOR}}
B. REGISTRY: {{REG}}  ACFT TYPE: {{ACTYPE}}   MTOW: {{MTOW}} LB
C. AIRCRAFT CLASSIFICATION: Private - Non Revenue
D. PREVIOUSLY GRANTED CLEARANCE REF: {{ISSUED_REF}}

PREVIOUS ITINERARY:
        ETD {{DEP_NAME}} / {{DEP}}          {{PREV_ETD}}
        ETA {{ARR_NAME}} / {{ARR}}               {{PREV_ETA}}

NEW ITINERARY:
        ETD {{DEP_NAME}} / {{DEP}}          {{ETD}}
        ETA {{ARR_NAME}} / {{ARR}}               {{ETA}}

E. ROUTE: VIA APPROVED ATS ROUTES
F. PURPOSE OF FLIGHT: BUSINESS
G. CREW: CAPTAIN {{PIC}} PLUS {{CREW_COUNT}} CREW AND {{PAX_COUNT}} PAX.

PLEASE REVISE THE PREVIOUSLY GRANTED OVERFLY PERMIT TO REFLECT THE ABOVE ITINERARY CHANGE AND CONFIRM CONTINUED VALIDITY.

ALL OTHER INFORMATION REMAINS UNCHANGED.

THANK YOU FOR YOUR CONSIDERATION OF THIS REQUEST.
{{SENDER_NAME}} / {{TRIP_ID}} / {{REG}} / END

REQUEST SENT TO: {{RECIPIENTS}}
{{SENDER_BLOCK}}`,
  },
  VIQ_LandingRequest: {
    subject: 'LANDING PERMIT REQUEST - {{TRIP_ID}} - {{REG}} - {{COUNTRY_NAME}}',
    body: `ATTN: CAA: {{COUNTRY_NAME}}, RESPECTFULLY REQUEST LANDING PERMISSION WITH A 72 HOUR VALIDITY IN CASE OF DELAY BASED ON:
A. OPERATOR: {{OPERATOR}}
    ADDRESS: C/O {{OPERATOR}}
             BILLING ADDRESS: SEE INVOICE INSTRUCTIONS ON FILE
B. REGISTRY: {{REG}}  ACFT TYPE: {{ACTYPE}}   MTOW: {{MTOW}} LB
C. AIRCRAFT CLASSIFICATION: Private - Non Revenue
D. ITINERARY:
        ETD {{DEP_NAME}} / {{DEP}}          {{ETD}}
        ETA {{ARR_NAME}} / {{ARR}}               {{ETA}}
E. PURPOSE OF FLIGHT: BUSINESS
F. CREW: CAPTAIN {{PIC}} PLUS {{CREW_COUNT}} CREW AND {{PAX_COUNT}} PAX.
THANK YOU FOR YOUR CONSIDERATION OF THIS REQUEST AND AWAITING YOUR APPROVAL WE REMAIN VERY TRULY YOURS.
{{SENDER_NAME}} / {{TRIP_ID}} / {{REG}} / END

REQUEST SENT TO: {{RECIPIENTS}}
{{SENDER_BLOCK}}
ATTACHMENTS:
1. REGISTRATION CERTIFICATE
2. AIRWORTHINESS CERTIFICATE
3. INSURANCE CERTIFICATE
4. PERMIT APPLICATION FORM`,
  },
  VIQ_LandingRevision: {
    subject: 'LANDING PERMIT REVISION - {{TRIP_ID}} - {{REG}} - {{COUNTRY_NAME}}',
    body: `ATTN: CIVIL AVIATION AUTHORITY
REF: LANDING PERMIT REVISION FOR {{COUNTRY_NAME}}:
A. OPERATOR: {{OPERATOR}}
B. REGISTRY: {{REG}}  ACFT TYPE: {{ACTYPE}}   MTOW: {{MTOW}} LB
C. AIRCRAFT CLASSIFICATION: Private - Non Revenue
D. PREVIOUSLY GRANTED CLEARANCE REF: {{ISSUED_REF}}

PREVIOUS ITINERARY:
        ETD {{DEP_NAME}} / {{DEP}}          {{PREV_ETD}}
        ETA {{ARR_NAME}} / {{ARR}}               {{PREV_ETA}}

NEW ITINERARY:
        ETD {{DEP_NAME}} / {{DEP}}          {{ETD}}
        ETA {{ARR_NAME}} / {{ARR}}               {{ETA}}

E. PURPOSE OF FLIGHT: BUSINESS
F. CREW: CAPTAIN {{PIC}} PLUS {{CREW_COUNT}} CREW AND {{PAX_COUNT}} PAX.

PLEASE REVISE THE PREVIOUSLY GRANTED LANDING PERMIT TO REFLECT THE ABOVE ITINERARY CHANGE AND CONFIRM CONTINUED VALIDITY.

ALL OTHER INFORMATION REMAINS UNCHANGED.

THANK YOU FOR YOUR CONSIDERATION OF THIS REQUEST.
{{SENDER_NAME}} / {{TRIP_ID}} / {{REG}} / END

REQUEST SENT TO: {{RECIPIENTS}}
{{SENDER_BLOCK}}`,
  },
  VIQ_GroundHandlingRequest: {
    subject: 'GROUND HANDLING REQUEST - {{TRIP_ID}} - {{REG}} - {{COUNTRY_NAME}}',
    body: `GROUND HANDLING REQUEST
ATTN:      {{OPERATOR}}/{{ARR}}
REF:       {{CLIENT}}
           REGISTRY {{REG}} / {{ACTYPE}} / FLIGHT NBR {{CALL_SIGN}}
           CAPTAIN {{PIC}}
           REFERENCE NBR {{SUPPORT_REF}}

ITINERARY:
DEPART {{DEP_NAME}} / {{DEP}}           {{ETD}}
ARRIVE {{ARR_NAME}} / {{ARR}}        {{ETA}}

PLEASE SPECIFICALLY CONFIRM THE FOLLOWING:

PENDING CONFIRMATION
   1. PAX TRANS RAMP ACCESS:
      PLEASE ARRANGE RAMP ACCESS FOR THE PASSENGER TRANSPORTATION.
      IF VEHICLE ACCESS ISN'T POSSIBLE, THEN ARRANGE FOR A VAN TO TRANSPORT PAX TO/FROM AIRCRAFT TO/FROM TERMINAL/FBO.
   2. DRIVER DETAILS:
      PLEASE PROVIDE THE FOLLOWING INFORMATION ALONG WITH THE TRANSPORTATION CONFIRMATIONS:
      - DRIVER'S NAME:
      - DRIVER'S MOBILE NUMBER:
      - VEHICLE MAKE/MODEL
      - VEHICLE LICENSE PLATE NUMBER
   3. CREW TRANS:
      PLEASE ARRANGE A COMMERCIAL PICK UP FOR CREW MEMBER AND TAKE TO HOTEL.
   4. INFORMATION:
      KINDLY PROVIDE O2 SERVICE FOR THE AIRCRAFT ON ARRIVAL

CANCEL
   1. AIRCRAFT ACCESS

ALL OTHER INFORMATION REMAINS UNCHANGED.

PLEASE ACKNOWLEDGE AND CONFIRM RECEIPT OF THIS MESSAGE CONFIRMING ALL ITEMS CAN BE ARRANGED AS REQUESTED.

THANK YOU AND BEST REGARDS — {{SENDER_NAME}} / {{TRIP_ID}} / END

REQUEST SENT TO: {{RECIPIENTS}}
{{SENDER_BLOCK}}`,
  },
  VIQ_GroundHandlingRevision: {
    subject: 'GROUND HANDLING REVISION - {{TRIP_ID}} - {{REG}} - {{COUNTRY_NAME}}',
    body: `GROUND HANDLING REVISION/CHANGE
ATTN:      {{OPERATOR}}/{{ARR}}
REF:       {{CLIENT}}
           {{REG}} / {{ACTYPE}} / CAPTAIN {{PIC}}
           REFERENCE NBR {{SUPPORT_REF}}

PREVIOUS ITINERARY:
DEPART {{DEP_NAME}} / {{DEP}}             {{PREV_ETD}}
ARRIVE {{ARR_NAME}} / {{ARR}}           {{PREV_ETA}}

NEW ITINERARY:
DEPART {{DEP_NAME}} / {{DEP}}             {{ETD}}
ARRIVE {{ARR_NAME}} / {{ARR}}           {{ETA}}

PLEASE SPECIFICALLY CONFIRM THE FOLLOWING:

CHANGES
1. ITINERARY HAS CHANGED TO THE ABOVE.

PENDING CONFIRMATION
   1. VIP HANDLING:
      PLEASE ARRANGE VIP HANDLING FOR THE ARRIVAL AND DEPARTURE.
   2. CIQ:
      PLEASE ASSIST WITH CUSTOMS
   3. PARKING:
      PLEASE ARRANGE PARKING FOR THE DURATION OF THE STAY
   4. LANDING PERMIT:
      PLEASE ASSIST WITH THE LANDING PERMIT.
   5. INVOICE REQUIREMENT:
      PLS CONFIRM ALL INVOICES AND SUPPORTING DOCUMENTATION ARE SUBMITTED WITHIN 7 DAYS AFTER THE DATE(S) OF SERVICE.

      TO ENSURE PAYMENT, PLEASE ENSURE CREW SIGNATURES ON ALL 3RD PARTY INVOICES.

      SEND INVOICES PER STANDARD BILLING INSTRUCTIONS ON FILE.

ALL OTHER INFORMATION REMAINS UNCHANGED.

PLEASE ACKNOWLEDGE AND CONFIRM RECEIPT OF THIS MESSAGE CONFIRMING ALL ITEMS CAN BE ARRANGED AS REQUESTED.

THANK YOU AND BEST REGARDS — {{SENDER_NAME}} / {{TRIP_ID}} / END

REQUEST SENT TO: {{RECIPIENTS}}
{{SENDER_BLOCK}}`,
  },
};

export function formatUWDate(z: string): string {
  const d = new Date(z);
  const day = d.getUTCDate().toString().padStart(2, '0');
  const months = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'];
  const month = months[d.getUTCMonth()];
  const hour = d.getUTCHours().toString().padStart(2, '0');
  const min = d.getUTCMinutes().toString().padStart(2, '0');
  return `${day}${month}/${hour}${min} UTC`;
}

export function generateEmail(
  template: TemplateType,
  tripId: string,
  legId: string | null,
  svcId: string | null,
  legs: Leg[],
  persons: TripPersonView[],
  notes: string,
  reg: string,
  acType: string,
  mtow: number,
  client: string,
  operator: string,
  supportRef: string,
  countryISO2: string | null = null,
  recipients: string[] = [],
  previousItinerary: { etdZ: string; etaZ: string } | null = null,
  issuedRef: string = ''
): { subject: string; body: string; token: string } {
  const token = svcId || `${tripId}/GEN-${Date.now().toString(36).toUpperCase()}`;
  const leg = legId ? legs.find(l => l.LegID === legId) : null;
  const dep = leg ? leg.DepICAO : 'TBD';
  const arr = leg ? leg.ArrICAO : 'TBD';
  const etd = leg ? leg.ETDZ.replace('T', ' ').replace('Z', '') : 'TBD';
  const eta = leg ? leg.ETAZ.replace('T', ' ').replace('Z', '') : 'TBD';
  const arrCountryISO2 = leg ? getAirport(leg.ArrICAO)?.CountryISO2 : undefined;
  const pic = persons.find(p => p.Role === 'PIC');
  const crew = persons.filter(p => ['PIC', 'SIC', 'FA'].includes(p.Role));
  const pax = persons.filter(p => ['Pax', 'VIP', 'Principal'].includes(p.Role));

  const senderBlock = `PHONE: ${import.meta.env.VITE_SENDER_PHONE || 'TBD'}   FAX: ${import.meta.env.VITE_SENDER_FAX || 'TBD'}   E-MAIL: ${import.meta.env.VITE_SENDER_FROM || 'ops@example.com'}\nSITA: ${import.meta.env.VITE_SENDER_SITA || 'TBD'}  ARINC: ${import.meta.env.VITE_SENDER_ARINC || 'TBD'}  /END`;
  const senderName = `${import.meta.env.VITE_SENDER_NAME || 'Operations'} / ${import.meta.env.VITE_SENDER_TEAM || 'Operations'} TEAM`;

  let subject = '';
  let body = '';

  if (COUNTRY_AWARE_TEMPLATE_TYPES.includes(template)) {
    const isRevision = template === 'VIQ_OverflyRevision' || template === 'VIQ_LandingRevision' || template === 'VIQ_GroundHandlingRevision';
    const isOverfly = template === 'VIQ_OverflyRequest' || template === 'VIQ_OverflyRevision';
    const lookupCountry = isOverfly ? countryISO2 : arrCountryISO2;
    // Real previous values come from the leg's audit trail (see
    // getPreviousLegItinerary in dataStore.ts) -- callers fetch them
    // asynchronously and pass the result in, since this function stays a
    // pure sync renderer. Falling back to the current itinerary (no visible
    // diff) only when no prior audit entry exists for that field, e.g. a
    // Revision template selected on a leg that was never actually edited.
    const prevEtd = isRevision && previousItinerary?.etdZ ? previousItinerary.etdZ : etd;
    const prevEta = isRevision && previousItinerary?.etaZ ? previousItinerary.etaZ : eta;
    const vars: Record<string, string> = {
      OPERATOR: operator.toUpperCase(),
      REG: reg,
      ACTYPE: acType,
      MTOW: mtow.toLocaleString(),
      DEP: dep,
      DEP_NAME: getAirport(dep)?.Name?.toUpperCase() || dep,
      ARR: arr,
      ARR_NAME: getAirport(arr)?.Name?.toUpperCase() || arr,
      ETD: formatUWDate(leg?.ETDZ || etd),
      ETA: formatUWDate(leg?.ETAZ || eta),
      PREV_ETD: isRevision ? formatUWDate(prevEtd) : '',
      PREV_ETA: isRevision ? formatUWDate(prevEta) : '',
      ISSUED_REF: issuedRef || 'N/A',
      CLIENT: client.toUpperCase(),
      SUPPORT_REF: supportRef || 'TBD',
      PIC: pic?.Name?.toUpperCase() || 'TBD',
      CREW_COUNT: String(Math.max(0, crew.length - 1)),
      PAX_COUNT: String(pax.length),
      TRIP_ID: tripId,
      TOKEN: token,
      SENDER_NAME: senderName,
      SENDER_BLOCK: senderBlock,
      RECIPIENTS: recipients.join(' '),
      COUNTRY_NAME: countryNameFor(lookupCountry),
      CALL_SIGN: leg?.CallSign || 'TBD',
    };
    const override = getMessageTemplateOverride(lookupCountry, template);
    const tpl = override
      ? { subject: override.Subject, body: override.Body }
      : DEFAULT_TEMPLATES[template]!;
    subject = renderTemplate(tpl.subject, vars);
    body = renderTemplate(tpl.body, vars);
  } else {
    switch (template) {
      case 'Fuel':
        subject = `Fuel Uplift Request — ${arr} — ${tripId}/${token.split('/').pop()}`;
        body = `Dear Fuel Supplier,\n\nPlease arrange Jet-A1 uplift for:\n\nAircraft: ${reg} (${acType})\nAirport: ${arr}\nDate: ${eta.split(' ')[0]}\nETA: ${eta}Z\nETD: ${etd}Z\n\nEstimated uplift: TBD L\nInto-plane agent: TBD\n\nToken: ${token}\n\nNotes: ${notes || 'None'}\n\nRegards,\nOperations`;
        break;
      case 'Catering':
        subject = `Catering Request — ${arr} — ${tripId}/${token.split('/').pop()}`;
        body = `Dear Catering,\n\nPlease arrange high-end catering for:\n\nAircraft: ${reg}\nAirport: ${arr}\nDate: ${etd.split(' ')[0]}\nDeparture: ${etd}Z\nPax: ${pax.length}\n\nDietary requirements: TBD\n\nToken: ${token}\n\nNotes: ${notes || 'None'}\n\nRegards,\nOperations`;
        break;
      case 'CrewTransport':
        subject = `Crew Transport Request — ${arr} — ${tripId}/${token.split('/').pop()}`;
        body = `Dear Transport,\n\nPlease arrange crew transport for:\n\nAircraft: ${reg}\nAirport: ${arr}\nArrival: ${eta}Z\nCrew: ${crew.length}\n\nDestination: TBD hotel\n\nToken: ${token}\n\nNotes: ${notes || 'None'}\n\nRegards,\nOperations`;
        break;
      case 'VIQ_MultiLegPermit': {
        subject = `Multi-Leg Overfly Permission — ${reg} — ${tripId}`;
        let itinerarySection = '';
        legs.forEach((l, idx) => {
          itinerarySection += `\n   LEG${idx + 1}: ITINERARY:\n        CALL SIGN: ${l.CallSign || 'TBD'}\n        ETD ${l.DepICAO}          ${formatUWDate(l.ETDZ)}\n        ETA ${l.ArrICAO}          ${l.ETAZ !== 'TBD' ? formatUWDate(l.ETAZ) : 'TBD'}\n`;
        });
        body = `ATTN: CIVIL AVIATION AUTHORITY\nRESPECTFULLY REQUEST OVERFLY PERMISSION WITH A 72 HOUR VALIDITY IN CASE OF DELAY BASED ON:\nA. OPERATOR: ${operator.toUpperCase()}\nB. REGISTRY: ${reg}  ACFT TYPE: ${acType}   MTOW: ${mtow.toLocaleString()} LB\nC. AIRCRAFT CLASSIFICATION: Private - Non Revenue\nD. ${itinerarySection}\nE. ROUTE: VIA APPROVED ATS ROUTES\nF. PURPOSE OF FLIGHT: BUSINESS\nG. CREW: CAPTAIN ${pic?.Name?.toUpperCase() || 'TBD'} PLUS ${Math.max(0, crew.length - 1)} CREW AND ${pax.length} PAX.\nTHANK YOU FOR YOUR CONSIDERATION OF THIS REQUEST.\n${senderName} / ${tripId} / ${reg} / END\n\nREQUEST SENT TO: ${recipients.join(' ')}\n${senderBlock}\nATTACHMENTS:\n1. REGISTRATION CERTIFICATE\n2. AIRWORTHINESS CERTIFICATE\n3. INSURANCE CERTIFICATE\n4. PERMIT APPLICATION FORM`;
        break;
      }
      default:
        subject = `Trip Request — ${tripId}/${token.split('/').pop()}`;
        body = `Dear Team,\n\nRegarding trip ${tripId}:\n\nAircraft: ${reg} (${acType})\n\nToken: ${token}\n\nNotes: ${notes || 'None'}\n\nRegards,\nOperations`;
    }
  }

  return { subject, body, token };
}
