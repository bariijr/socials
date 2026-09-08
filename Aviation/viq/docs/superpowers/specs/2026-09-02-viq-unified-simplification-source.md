# VIQ Unified Simplification, Operations & Platform Upgrade — Source Document

User-authored, pasted twice this session (2026-09-02 and again 2026-09-09
after the first paste was lost to context compaction). This is the full
97-section source behind
[2026-09-02-viq-phase0-architectural-assessment.md](2026-09-02-viq-phase0-architectural-assessment.md),
which classified every section (ADOPT/MODIFY/DEFER/REJECT/ALREADY
IMPLEMENTED) against the codebase as it stood on 2026-09-02. Saved here
permanently as source material — the assessment is the authority on
what's actually needed and in what order; this document is the raw ask
each later phase's design work should be checked against for anything
the assessment's own one-line summaries compressed away.

**Status as of 2026-09-09:** Phases 1-6 of the assessment's own
recommended build sequence are complete (test foundation, status/locking,
leg/stop correction, route/service generation refinements — §11/13/14 —,
submission engine — §12/88 —, change impact + reconfirmation — §17-19).
Phase 8 (§55-60, Tasks/Attention/Escalation) is the active work item.
Phase 7 (§21-24, Contextual Composer) was explicitly assessed as "smaller
than the document implies (~70% done at service level)" and folded into
"don't let it consume a full phase" rather than treated as its own phase
— the one real gap (`ComposeDrawer.tsx` already does everything at
service level; only a trip-level Leg→Service launcher is missing) remains
a small backlog item, not yet scheduled.

---

# VIQ UNIFIED SIMPLIFICATION, OPERATIONS & PLATFORM UPGRADE

Act as a **Senior Aviation Operations Systems Architect, Flight Planning Architect, Aviation UX/Product Designer, NestJS/React Engineer, PostgreSQL/PostGIS Engineer, Financial Systems Architect, Messaging Engineer, Security Engineer, and Scalability Architect**.

Your task is to **assess the current VIQ implementation, debate this proposed direction against what already exists, improve the proposal where necessary, and then upgrade VIQ incrementally**.

This is **not a greenfield rewrite**.

Preserve all working aviation logic, data, security controls, document intelligence work, communications, auditability, and current functionality unless a deliberate migration improves them safely.

The objective is:

> **Make VIQ simpler to understand, dramatically faster to operate, highly automated, intuitive across desktop/tablet/mobile, and capable of supporting the complete lifecycle of a flight-support trip without exposing unnecessary backend complexity to coordinators.**

The governing product principle remains:

> **Complexity belongs inside VIQ, not inside the coordinator's head.**

---

## 1. START BY ASSESSING THE EXISTING IMPLEMENTATION

Before writing code, inspect:

* current Trip creation and Trip Detail workflows;
* route/leg creation;
* current great-circle country detection;
* permits and service-generation logic;
* Requirement → Service Case → Service Order model;
* permit request workflows;
* revision/reconfirmation workflows;
* vendor model;
* billing/invoice implementation;
* Communications/Composer;
* configured email infrastructure;
* Documents/OCR;
* Persons;
* Fleet/Aircraft;
* airports/countries/FIR data;
* Action Board;
* tasks or assignment logic;
* responsive shell;
* mobile/tablet behavior;
* sidebar;
* global search;
* background jobs/BullMQ/Redis;
* status implementations;
* auditing/activity;
* admin/settings implementation;
* current automated tests.

For every major proposal in this document, classify it:

```text
ADOPT
MODIFY
DEFER
REJECT
ALREADY IMPLEMENTED
```

Explain significant disagreements before implementing them.

Do not rebuild something that already has a cleaner implementation.

---

## 2. TARGET VIQ MENTAL MODEL

The normal coordinator should experience:

```text
ACTION BOARD
    ↓
TRIP
    ↓
LEG / SECTOR
    ↓
REQUIRED SERVICES
    ↓
WHAT NEEDS ATTENTION?
    ↓
TAKE ACTION
    ↓
CONFIRM / REVISE / COMPLETE
```

Internally VIQ can maintain:

```text
Trip
Leg
Stop
Requirement
Service Case
Service Order
Vendor
Communication
Confirmation
Revision
Reconfirmation
Document
Authorization
Task
Invoice
Payment
Flight Plan
Job
Audit
```

Do not force the coordinator to understand this hierarchy unnecessarily.

---

## 3. PRIMARY MODULE ARCHITECTURE

VIQ should ultimately manage six major business capabilities:

```text
1. Flight Planning & Routing
2. Permits, Handling & Ground Logistics
3. Financials, Navigation Fees & Cost Estimation
4. Aeronautical Mapping & GIS Visualization
5. Fleet, Aircraft & Configuration
6. Document & Notification Hub
```

These are **domain modules**, not necessarily six isolated pages or microservices.

They should work together around the Trip.

The Trip remains the operational container.

---

## 4. KEEP VIQ A MODULAR MONOLITH

Do not introduce unnecessary microservices.

Preferred architecture:

```text
VIQ React Application
        ↓
VIQ NestJS API
        ↓
PostgreSQL + PostGIS
Redis / BullMQ
Private Document Storage
Mail Infrastructure
Optional Python Planning/OCR Workers
External Aviation Providers
```

Workers may run separately when compute-intensive.

Use shared contracts and the same application domain.

Only separate a capability into an independent service if measurable scale or technical requirements justify it.

---

## 5. ONE CONSISTENT STATE-MACHINE CONCEPT

Claude's existing recommendation is accepted.

Do not force every entity to have identical statuses.

Instead make every stateful entity use the same mechanism:

```text
status
allowedTransitions
statusChangedAt
statusChangedBy
version
statusHistory / audit
```

Create reusable:

```text
StatusBadge
StatusTimeline
TransitionValidator
TransitionMenu
```

---

## 6. TRIP STATUS

Maintain the deliberately simple primary lifecycle:

```text
PLANNING
ACTIVE
COMPLETE
```

Support exceptional states only where operationally necessary:

```text
ON_HOLD
CANCELLED
```

Avoid unnecessary trip-state complexity.

---

## 7. SERVICE STATUS MODEL

The service lifecycle must support the real workflow.

Recommended operational statuses:

```text
DRAFT
READY
REQUESTED
ACKNOWLEDGED
CONFIRMED
CHANGED
DENIED
CANCELLED
COMPLETE
```

Where appropriate:

```text
ACTION_REQUIRED
```

may be a derived attention state rather than another source-of-truth service status.

### Automatic transitions

When a permit/service is generated:

```text
DRAFT / READY
```

When submitted:

```text
→ REQUESTED
```

If vendor acknowledges without confirmation:

```text
→ ACKNOWLEDGED
```

When a permit/confirmation is loaded and verified:

```text
→ CONFIRMED
```

If relevant trip/leg/service data changes after submission or confirmation:

```text
→ CHANGED
```

After a revision is submitted:

```text
→ REQUESTED
```

or use a clearly defined revision sub-state if the current model makes this safer.

When reconfirmation is received:

```text
→ CONFIRMED
```

Never change status blindly.

Use transition rules and audit every automatic transition.

---

## 8. ROUTE-DRIVEN TRIP BUILD

The Trip Builder should become highly automated.

Given:

```text
Departure
Intermediate destinations
Final destination
Aircraft
Dates/times
```

VIQ should calculate the route and determine likely country/FIR involvement.

### Important distinction

Do not assume a geometric great-circle country intersection is automatically the legally required permit list.

Treat it initially as:

```text
ROUTE-DERIVED PERMIT CANDIDATES
```

and refine using:

* FIR boundaries;
* flight-planning route;
* country/authority rules;
* include FIR instructions;
* exclude FIR instructions;
* manual coordinator additions/removals;
* known permit exemptions/rules.

The result should remain human-reviewable.

---

## 9. AUTOMATIC SERVICE PRESETTING

Once Trip Builder determines stops and route countries, VIQ should automatically prepare likely operational services.

For overflight countries:

```text
OVERFLIGHT PERMIT
```

For landing locations:

```text
LANDING PERMIT
GROUND HANDLING
```

and any configured airport/country defaults.

Example:

```text
HECA → HTDA → FALA
```

VIQ may prepare:

```text
Ethiopia Overflight
Kenya Overflight
Tanzania Landing
HTDA Ground Handling
South Africa Landing
FALA Ground Handling
```

depending on actual routing/rules/responsibility selections.

These should appear **ready for review/submission**, not require the user to manually create each case.

---

## 10. USER MAY MODIFY ROUTE REQUIREMENTS

Route generation is assistance, not imprisonment.

Coordinator must be able to:

```text
+ Add Country/FIR
- Remove Candidate
+ Add Service
Change Responsibility
Change Vendor
Change Permit Type
```

Every manual override should be retained and, where appropriate, audited.

---

## 11. SERVICE RESPONSIBILITY

Every service should clearly identify responsibility:

```text
VIQ ARRANGEMENT
CLIENT OWN
OPERATOR OWN
OTHER
```

Services marked as client/operator-owned should remain visible for operational awareness but should not automatically trigger VIQ vendor submissions unless explicitly changed.

---

## 12. ZERO-EDIT DEFAULT SUBMISSION

A major UX objective:

> A correctly configured service should not require opening its individual message before sending.

After generation, the coordinator should be able to:

```text
[SUBMIT]
```

or select several compatible services:

```text
☑ Eritrea Overflight
☑ Djibouti Overflight
☑ Ethiopia Overflight

[SUBMIT SELECTED]
```

VIQ should generate the proper messages from:

```text
Trip data
Leg data
Aircraft
Crew/Pax
Country/Airport rules
Service template
Vendor
Required attachments
```

and send them using default settings.

The coordinator can optionally preview/edit.

Editing should not be mandatory for routine submissions.

---

## 13. BULK SUBMISSION COMPATIBILITY

Do not naïvely combine unrelated permit requests.

Maintain the aviation rule:

```text
Same Country
+
Same Permit Type
+
Compatible Legs
=
May be grouped
```

Examples:

```text
Two Landing Permits
→ may be coupled
```

```text
Two Overflight Permits
→ may be coupled
```

```text
Landing + Overflight
→ NEVER automatically couple
```

VIQ should calculate grouping compatibility automatically.

---

## 14. PERMIT TYPES

Model Permit Type independently from the generic Service Type.

Support extensibility including:

```text
Landing Permit
Overflight Permit
Diplomatic Clearance
Block Permit
Blanket Permit
Seasonal Permit
Medical Permit
Special/Military Permit
Positioning Permit
Other Configurable Permit Type
```

### Block Permit

Allow validity periods such as:

```text
week
month
multiple months
custom date range
```

### Blanket Permit

May apply to:

```text
one operator
multiple aircraft
callsigns
defined validity
defined operation type
```

Do not assume permit applicability only to one Trip.

Verified blanket/block/seasonal permits should become reusable operational authorizations where applicable.

---

## 15. AUTOMATED SUBMISSION RULES

Allow Admin to configure per:

```text
Country
Airport
Service Type
Permit Type
Vendor
```

whether a service may be:

```text
MANUAL ONLY
AUTO-PREPARE
AUTO-SUBMIT
```

Auto-submission should be used only where policy/business rules permit it.

It is particularly appropriate for arrangements with:

```text
zero cancellation cost
low cancellation cost
highly standardized process
```

but the actual policy remains Admin-configurable.

Always audit automatic submissions.

---

## 16. REQUIRED DOCUMENT ATTACHMENT ENGINE

Country/service rules may define required documents.

Example:

```text
Tanzania Landing Permit

Required:
Registration
Airworthiness
Insurance
AOC
Crew Gendec
```

VIQ should resolve the current verified versions automatically through the Document Intelligence Engine.

If all required documents exist:

```text
ATTACH AUTOMATICALLY
```

If one or more are missing:

```text
MISSING REQUIRED DOCUMENTS

AOC unavailable
PIC Passport unavailable

[SUBMIT WITHOUT DOCUMENTS]
[CANCEL]
```

The user must be allowed to submit without missing documents where operational policy permits it.

If submitted without required documents:

1. send the service request;
2. clearly state/flag missing documents appropriately;
3. automatically create an internal follow-up;
4. email/notify the responsible Admin/Coordinator that documents still need submission;
5. maintain the service as requiring document follow-up.

Do not silently pretend the package was complete.

---

## 17. CHANGE IMPACT ENGINE

This is one of VIQ's most important automation systems.

When Trip/Leg/Service data changes, calculate exactly which submitted/confirmed services are affected.

Examples:

```text
ETD/ETA
Date
ICAO
Route
Aircraft
Registration
Callsign
Passenger/Crew
Service selection
Landing airport
Tech stop
Ground handling requirements
```

Affected services should automatically become:

```text
CHANGED
```

Do not mark unrelated services as changed.

Record:

```text
Changed field
Old value
New value
Affected service
Timestamp
Actor
```

---

## 18. REVISION WORKFLOW

Changed services should appear together:

```text
REVISION REQUIRED

3 affected services

Ethiopia Overflight
FALA Handling
Fuel FALA
```

Allow:

```text
[SUBMIT REVISION]
```

or:

```text
[SUBMIT ALL COMPATIBLE REVISIONS]
```

Generate revision messages from the same contextual data/template system.

Do not require opening every message first.

---

## 19. RECONFIRMATION

After revision submission, allow vendor/authority reconfirmation to be loaded.

Reconfirmation must retain:

```text
Reference
Date/time
Coordinator
Source communication
Remarks
Attachment
```

Once valid reconfirmation is entered:

```text
CHANGED / REQUESTED
→ CONFIRMED
```

Preserve previous confirmations and revisions historically.

---

## 20. CONFIRMATION BOX

The Service confirmation field must support proper multiline content.

Do not limit it to a single-line text input.

Support:

```text
confirmation reference
multiline confirmation text
limitations
conditions
remarks
validity
attachment
received time
source
confirmed by
```

Preserve exactly what the vendor/authority confirmed.

---

## 21. SERVICE COMMUNICATION TIMELINE

Every operational service should have its own communications timeline.

Whenever a coordinator contacts a vendor/authority by:

```text
Email
WhatsApp
SMS
Phone Call
ARINC
SITA
AFTN
Fax
Other
```

allow the update to be recorded against the Service.

Examples:

```text
10:14Z
EMAIL SENT
Requested permit update.
```

```text
11:07Z
CALL
Spoke with CAA officer.
Permit expected in approximately 30 minutes.
```

```text
11:42Z
WHATSAPP
Vendor advised permit has been approved.
```

Allow:

```text
message content
call notes
attachment/screenshot
message ID
sender
recipient
timestamp
coordinator
```

Do not make the coordinator duplicate emails already sent through VIQ.

Messages generated through VIQ should automatically enter the timeline.

---

## 22. ONE COMMUNICATION ENGINE

Use one communications engine underneath:

```text
Email
WhatsApp
SMS
ARINC
SITA
AFTN
Fax
```

where configured.

Every message should carry context:

```text
tripId
legId
serviceCaseId
serviceOrderId if relevant
vendorId
```

This enables complete traceability.

---

## 23. COMPOSER SHOULD BECOME CONTEXTUAL

Do not remove the current Composer tab yet.

Instead build a new contextual Composer accessible from:

```text
Trip
Leg
Service
Vendor context where appropriate
```

### Inside Trip

User clicks:

```text
COMPOSER
```

Trip is already known.

Do **not** ask for Trip No.

Then:

```text
Select Leg
Select Service or General Trip Message
Select Recipient
Select Template
```

VIQ pre-populates available context.

Example:

```text
Trip: VIQ-260902-0042
Aircraft: N1FLY

Leg:
HTDA → FALA

Service:
South Africa Landing

Recipient:
Default Permit Vendor
```

Then compose/send.

### Migration strategy

Keep the existing standalone Composer tab until:

* contextual Composer supports existing functions;
* tests are complete;
* coordinators have used it successfully;
* no workflow regressions exist.

Only then consider reducing the standalone Composer's prominence.

---

## 24. EMAIL FORMAT SETTINGS

All outbound email messages should default to:

```text
Courier
11
```

Interpret this as the currently required operational default:

```text
Font Family: Courier
Font Size: 11
```

Admin Settings must allow configurable defaults for:

```text
font family
font size
case style
sentence case
UPPERCASE
lowercase
default signature
spacing
template style
```

Prefer standards-safe HTML email with plain-text fallback.

Do not rely on recipient email clients honoring every style exactly.

Message content must remain readable even if styling is stripped.

---

## 25. TRIP BRIEF

Introduce a clean Trip Brief intended to answer:

> What does someone taking over this trip need to know immediately?

Recommended sections:

```text
TRIP BRIEF

Trip No
Mission / Operation Type
Status
Coordinator / Owner
Client
Operator
Aircraft
Registration
Callsign

ROUTE
Full itinerary
Dates/times UTC
Local times where relevant
Purpose
Route/FIR constraints

CREW & PASSENGERS
Crew summary
Passenger count
VIP/special status where appropriate
Crew changes
Visa/document alerts

PERMITS
Country
Permit type
Status
Reference
Validity
Outstanding action

GROUND SERVICES
Airport
Handling
Fuel
Catering
Transport
Hotel
GPU
Lav/Water
Other

FLIGHT PLANNING
Current route
Distance
ETE
FIRs
Special routing constraints
Latest plan/revision

DOCUMENT READINESS
Aircraft
Operator
Crew
Missing/expiring documents

OPERATIONAL WARNINGS
Time-sensitive items
Airport restrictions
Permit deadlines
NOTAM/weather references where integrated
Special instructions

COMMUNICATION
Latest significant vendor/client updates

FINANCIAL
Estimate
Major confirmed costs
Payment/Credit concerns if operationally relevant

NEXT ACTIONS
What
Who
No Later Than
```

Allow:

```text
View
Print
PDF
Email
Share internally
```

The Trip Brief should be generated from structured VIQ data rather than manually maintained duplicate text.

Allow a coordinator Notes/Special Instructions section.

---

## 26. TRIP DELIVERY / HANDOVER BRIEF

Trip Delivery/Handover should be optimized for shift change or coordinator delegation.

Include:

```text
Current trip condition
What has been completed
What remains outstanding
Changed items
Revisions awaiting reconfirmation
Outstanding vendor responses
Outstanding client response
Missing documents
Payment/credit blockers
Upcoming deadlines
Next departure
Assigned tasks
Recent important communications
Known risks/escalations
```

Include:

```text
Generated At
Generated By
Data Current As Of
```

The goal:

> Another coordinator should be able to take over the trip without reading the entire Activity log.

---

## 27. SECTOR / LEG BRIEF

Each Leg should have its own concise operational brief.

Example:

```text
LEG 3

FALA → HECA

Aircraft:
N1FLY

Callsign:
N1FLY

ETD:
021200Z

ETA:
021830Z

ROUTE:
...

DISTANCE:
...

ETE:
...

DEPARTURE
Airport
Handling
Fuel
Catering
Transport
Crew/pax status
Local restrictions

EN ROUTE
FIRs
Overflight permits
Route constraints

ARRIVAL
Landing permit
Handling
Parking
Fuel
Transport
Hotel
Local restrictions

CREW/PAX
Crew operating leg
Passengers on leg
Crew swap
Visa issues

DOCUMENTS
Required/current/missing

OUTSTANDING
2 items

NEXT ACTION
...
```

Make this available as:

```text
Screen
Print
PDF
Email
```

and suitable for mobile use.

---

## 28. STOP MODEL MUST BE FIXED

The current display of:

```text
HTDA → FALA
0 stops
```

is incorrect for the intended operational interpretation.

For VIQ, distinguish:

```text
ROUTE LEG
STOP EVENT
DEPARTURE/EXIT EVENT
```

### Example 1

```text
HTDA → FALA
```

should normally show:

```text
1 STOP
FALA
```

and optionally:

```text
2 OPERATIONAL EVENTS
HTDA EXIT
FALA STOP
```

if the departure/exit airport is explicitly included in that view.

### Example 2

```text
FALA → HECA → HAAB
```

should produce:

```text
2 STOPS
HECA
HAAB
```

Optionally:

```text
3 OPERATIONAL EVENTS
FALA EXIT
HECA STOP
HAAB STOP
```

if departure/exit is selected.

Do not use a simplistic `legs - 1` assumption where it produces misleading operational results.

---

## 29. MANUAL STOP SUPPORT IS REQUIRED

Keep manual additions.

A physical airport may legitimately appear multiple times.

Examples:

```text
HTDA → FALA → FALA
```

for a demonstration flight.

Or:

```text
FALA → FALA → FBMN
```

where the same airport is intentionally visited as a separate operational event before final departure.

Do not deduplicate stops by ICAO code.

Use unique Stop/Leg IDs.

---

## 30. STOP TYPES

Support configurable stop classifications including:

```text
NORMAL STOP
RON — Remaining Overnight
TECHNICAL STOP
FUEL STOP
DEMO STOP
MILITARY DRILL
CREW SWAP
CREW REST
POSITIONING
CUSTOM
```

Potentially allow more than one characteristic where operationally logical:

```text
TECH STOP
+
CREW SWAP
```

Do not hardcode airport identity as the stop identity.

Each stop/event must have its own unique record.

---

## 31. ICAO/AIRPORT AUTOCOMPLETE

Every airport field in Leg editing should be an intelligent type-to-filter selector.

Search priority:

```text
1. ICAO
2. IATA
3. Airport/Port Name
```

Example:

```text
HT
```

results should prioritize ICAO matches.

Example:

```text
DAR
```

should recognize IATA and airport names.

Display useful context:

```text
HTDA · DAR
Julius Nyerere International Airport
Tanzania
```

Do not require exact airport codes.

---

## 32. ROUTE INPUT MUST DRIVE MAPPING

If an ICAO/ATS route string is entered:

```text
FAOR DCT VASUR UZ21 ITROL UQ25 RUDAS UM731 FL UT237 INISA UM998 BOD UM508 TGU UJ36 BSA UJ66 ALR UN856 SADAF N856 SURIB L129 MEBUT DCT LEPA
```

VIQ should parse and plot the route rather than treating it as plain text.

Resolve:

```text
Airports
Waypoints
Airways
Segments
Coordinates
FIR intersections
Countries
```

Where resolution is uncertain, clearly flag it.

Never silently invent coordinates for an unknown point.

---

## 33. INCLUDE / EXCLUDE FIR

Flight planning should support:

```text
INCLUDE FIR
EXCLUDE FIR
```

Examples:

```text
Avoid Sudan
Include Ethiopia
Avoid Mozambique
```

Routing engine should then recalculate route candidates where the selected provider/algorithm supports it.

Display the consequences.

---

## 34. AERONAUTICAL GIS

Use the user's Mapbox integration for frontend visualization where appropriate.

Build an aviation geospatial database using:

```text
PostgreSQL
PostGIS
```

Seed permitted/free aviation data from sources such as OpenAIP where licensing and current API/data terms permit.

Before bulk ingestion, Claude must verify current:

```text
licensing
attribution
redistribution
update terms
API limits
```

Do not assume third-party aviation datasets can be redistributed merely because access is free.

Store normalized aviation objects such as:

```text
Airports
Runways
Waypoints
Navaids
FIR/UIR boundaries
Airspace
Routes/Airways where available
Coordinates
```

---

## 35. FLIGHT PLANNING ARCHITECTURE

Implement Flight Planning as a **platform module/capability** with two user experiences.

### Primary operational experience

Inside Trip:

```text
TRIP
 → FLIGHT PLANNING
```

The Trip already supplies:

```text
Aircraft
Departure
Destination
Schedule
Leg
Callsign
Constraints
```

Coordinator should not have to re-enter them.

### Advanced standalone workspace

Retain/provide:

```text
FLIGHT PLANNING
```

as a standalone module for:

```text
route experimentation
planning before Trip creation
route library
provider comparison
advanced planning
administrative/testing use
```

A planned route should be assignable to a Trip/Leg.

This gives both simplicity and power.

---

## 36. MULTIPLE FLIGHT PLANNING PROVIDERS

Create a provider abstraction.

Conceptually:

```text
FlightPlanningProvider
```

Possible integrations can include commercial providers such as:

```text
RocketRoute
ForeFlight Developer
Other supported commercial APIs
```

but **verify current API availability, licensing and permitted use before implementing any provider**.

Admin should configure:

```text
Provider
Enabled
Priority
Credentials
API tokens
Capabilities
Timeout
Environment
Fallback behavior
```

Do not expose credentials to frontend code.

Encrypt sensitive provider credentials at rest.

---

## 37. INTERNAL ROUTING ENGINE

Also support a lightweight internal planning engine.

A Python worker is acceptable where it makes aviation/geospatial computation simpler.

Use:

```text
PostGIS
geodesic/great-circle calculations
route geometry
FIR polygon intersection
airport/waypoint data
```

Python may provide:

```text
distance
bearing
great-circle path
FIR intersections
country intersections
basic route geometry
```

Do not confuse this basic routing engine with a certified operational flight-plan system.

Commercial/provider-generated operational routes may contain considerably more performance/regulatory logic.

Keep those capabilities distinct.

---

## 38. ROUTE PROVIDER STRATEGY

A sensible hierarchy:

```text
COMMERCIAL PROVIDER
        ↓ if unavailable/disabled
INTERNAL ROUTING ENGINE
        ↓
MANUAL ROUTE
```

Admin should decide which provider is primary.

Users with permission may choose another enabled provider.

Record:

```text
routeSource
provider
generatedAt
routeVersion
```

---

## 39. VENDOR MODEL

Vendor Profiles must support multiple capabilities.

A Vendor may provide:

```text
Ground Handling
Permits
Fuel
Catering
Transport
Hotel
Navigation/CAA Services
Other
```

Do not duplicate Vendor records for every service.

Use capability relationships.

---

## 40. VENDOR IDs

Generate vendor identifiers automatically.

Example pattern:

```text
VEN-000001
```

or a cleaner existing VIQ convention.

Coordinator should see/select:

```text
VEN-000041 · ABC Aviation
```

but should never be required to manually invent/database-enter an internal ID.

The actual DB primary key may remain UUID.

Human-readable ID is a display/business identifier.

---

## 41. CLIENT IDs

Likewise generate Client IDs:

```text
CLI-000001
```

Display:

```text
CLI-000027 · Example Aviation Ltd
```

Do not ask users to manually create internal IDs.

Use DB-safe concurrency guarantees for generation.

Do not use `count()+1`.

---

## 42. VENDOR AS MULTIPLE BUSINESS ROLES

Where required, an organization may be:

```text
Vendor
Client
Operator
System Entry Point
```

Do not duplicate the underlying organization unnecessarily.

Prefer:

```text
Organization
+
OrganizationRole[]
```

if this fits the existing Client/Vendor architecture cleanly.

However, preserve domain distinctions between:

```text
Client
Operator
Vendor
```

in workflows even if they share an organization identity underneath.

---

## 43. VENDOR QUESTIONNAIRES

Create dynamic vendor capability questionnaires.

Admin defines fields by:

```text
Country
Airport
Service
Vendor Type
```

Vendor may submit capability information through a controlled portal/link.

Lifecycle:

```text
DRAFT
SUBMITTED
UNDER REVIEW
APPROVED
REJECTED
```

Only approved capability data becomes operationally selectable.

Audit:

```text
what changed
who approved
when
previous values
```

---

## 44. VENDOR CAPABILITY SYNC

Once approved:

```text
Vendor Questionnaire
      ↓
Approved Capability
      ↓
Operational Vendor Profile
      ↓
Vendor selection/routing rules
```

Do not let unapproved questionnaire answers silently alter operational defaults.

---

## 45. FINANCIALS MUST SEPARATE AP AND AR

Create a clear distinction:

```text
ACCOUNTS PAYABLE
Money VIQ/client owes Vendors
```

versus:

```text
ACCOUNTS RECEIVABLE
Money Client owes VIQ
```

Do not confuse vendor invoices with VIQ invoices to clients.

---

## 46. VENDOR INVOICE INTAKE

Vendor invoices should have a controlled lifecycle.

Suggested:

```text
RECEIVED
CAPTURED
MATCHING
REVIEW_REQUIRED
APPROVED
SCHEDULED_FOR_PAYMENT
PAID
DISPUTED
VOID
```

Capture:

```text
Vendor
Vendor Invoice Number
Invoice Date
Currency
Subtotal
Tax
Total
Trip(s)
Leg(s)
Service(s)
Line Items
Due Date
Payment Terms
Original Invoice Document
```

---

## 47. VENDOR INVOICE DUPLICATE PREVENTION

Do not rely only on filename.

Use multiple checks:

```text
Vendor ID
Invoice Number
Invoice Date
Currency
Invoice Total
Document Hash
```

Exact duplicate document:

```text
SHA-256 match
```

Potential accounting duplicate:

```text
same vendor
+
same invoice number
```

should trigger a strong warning/block according to policy.

Near-duplicates should trigger review.

Do not prevent legitimate credit notes/reissued invoices; model these explicitly.

---

## 48. VENDOR INVOICE MATCHING

Every vendor invoice line should be matched where possible to:

```text
Trip
Leg
Service Case
Service Order
Expected Cost
Vendor
```

Example:

```text
Vendor Invoice
ABC Handling

Line:
Tanzania CAA Landing Permit Fee
USD 250

Matched:
Trip VIQ-260902-0042
HTDA Landing Permit
```

Show differences:

```text
Expected 250
Invoiced 250
MATCH
```

or:

```text
Expected 250
Invoiced 320
VARIANCE +70
REVIEW REQUIRED
```

---

## 49. THIRD-PARTY VENDOR DISBURSEMENTS

Ground handlers may consolidate third-party charges such as:

```text
CAA permit fee
Navigation charge
Airport fee
Lighting
Parking
Lavatory
Water
GPU
Local transport
Other airport services
```

A single Vendor Invoice may therefore contain multiple service/disbursement lines.

Model them as structured invoice lines.

Do not treat a consolidated invoice as one unexplained total.

Each line should ideally link to a cost/service category.

---

## 50. VENDOR INVOICE APPROVAL

Support configurable approval based on:

```text
amount
variance
vendor
service category
currency
risk
```

Do not allow the person who captured an invoice to necessarily approve/pay it where segregation of duties is required.

Record:

```text
CapturedBy
ReviewedBy
ApprovedBy
PaidBy
timestamps
```

---

## 51. VENDOR PAYMENT

When paid, record:

```text
Payment Reference
Amount
Currency
Payment Date
Payment Method
Bank/Provider Reference
Supporting Document
Paid By
```

Support:

```text
full payment
partial payment
multiple payments
credit note
```

Do not merely switch a boolean `paid=true`.

---

## 52. BILLING / CLIENT INVOICE WORKBENCH

Billing should show trips/services ready or overdue for billing.

Example:

```text
READY TO BILL
PAST DUE BILLING
PARTIALLY BILLED
INVOICED
PAID
```

Billing Admin decides:

```text
Bill Entire Trip
```

or:

```text
Select Individual Services
```

Support:

```text
one trip → one invoice
one trip → multiple invoices
multiple trips → consolidated client invoice
```

depending on client policy.

---

## 53. CLIENT PAYMENT

Client invoices must have their own lifecycle:

```text
DRAFT
ISSUED
PARTIALLY_PAID
PAID
OVERDUE
VOID
CREDITED
```

Receiving client payment should update:

```text
Invoice
Outstanding Balance
Trip Billing Status
Client Account
```

Do not mark the operational Trip `COMPLETE` purely because payment was received unless that is the defined business policy.

Keep:

```text
Operational Status
Billing Status
```

separate.

---

## 54. COST ESTIMATION

Financial module should eventually support:

```text
Permit fees
Navigation fees
Airport fees
Handling
Fuel
Catering
Transport
Hotels
Vendor markups
Taxes
Currency conversions
Other services
```

Maintain:

```text
Estimated
Quoted
Confirmed
Invoiced by Vendor
Billed to Client
Paid
```

as distinct values/stages.

---

## 55. TASK MANAGEMENT

Do not build a separate generic project-management application.

Tasks should be deeply contextual to aviation operations.

A Task should contain:

```text
Title
Description
Trip
Leg if applicable
Service if applicable
Client if applicable
Owner
Shared With
Priority
No Later Than
Status
Escalation Rule
Created By
Created At
Completed At
```

Possible task statuses:

```text
OPEN
IN_PROGRESS
WAITING
COMPLETE
CANCELLED
```

---

## 56. NO LATER THAN

Use an explicit aviation-friendly deadline field:

```text
NO LATER THAN
```

Support:

```text
UTC
Local display
```

Examples:

```text
Call Client
NLT 021400Z
```

```text
Chase Ethiopia Permit
NLT 021130Z
```

---

## 57. TASK SOURCES

Tasks may be:

```text
Manually created
System generated
Service generated
Document generated
Billing generated
Client follow-up generated
```

Examples:

```text
Call client
Chase permit
Send missing documents
Confirm fuel
Review passport OCR
Approve vendor invoice
Resolve route conflict
```

---

## 58. ESCALATIONS

Tasks/attention items can escalate based on:

```text
deadline proximity
missed NLT
service SLA
trip departure
vendor response SLA
permit lead time
priority
```

Example:

```text
NLT - 2 hours
→ AMBER
```

```text
NLT breached
→ RED
→ Coordinator + Team Lead
```

Admin should configure escalation rules.

Avoid endless notification spam.

Escalate meaningful exceptions.

---

## 59. TASKS + ACTION BOARD

Tasks should feed the same operational Action Board.

Do not create an isolated To-Do app users must remember to open.

Action Board can include:

```text
MY TASKS
TEAM TASKS
OVERDUE
DUE SOON
UNASSIGNED
ESCALATED
```

---

## 60. ATTENTION ENGINE

Maintain one unified concept for things requiring action.

Possible:

```text
AttentionItem
```

generated from:

```text
Tasks
Changed services
Permit deadlines
Missing documents
Failed communication
OCR review
Expired documents
Vendor invoice variance
Unassigned enquiries
Billing overdue
```

Do not create duplicate truth.

Claude must determine whether AttentionItem is best:

```text
computed
persisted
event-derived
hybrid
```

based on current architecture.

---

## 61. INTERNAL MAIL CLIENT

Add a VIQ Mail workspace for configured mailboxes.

Users with permission should be able to:

```text
view inbox
view sent
search
open thread
reply
reply all
forward
compose
attach files
tag/link message
```

Support multiple configured mailboxes.

---

## 62. EMAIL LINKING

Use email standards rather than only subject matching.

Store:

```text
Message-ID
In-Reply-To
References
Mailbox
Thread ID where provider supplies one
Sender
Recipients
Subject
Received/Sent At
```

VIQ-specific outbound messages should also carry internal context links.

Automatically associate emails when reliable.

Allow manual:

```text
LINK TO TRIP
LINK TO LEG
LINK TO SERVICE
LINK TO VENDOR
LINK TO CLIENT
```

---

## 63. EMAIL TAGGING

Example:

```text
Trip VIQ-260902-0042
Leg HTDA → FALA
Service Tanzania Landing
Vendor ABC Aviation
```

One message/thread may have multiple relevant links.

Do not change the actual external email Message-ID merely to represent VIQ linkage.

Use VIQ relational metadata.

---

## 64. EMAIL THREAD TIMELINE

When an email is linked to a Service, it should automatically appear in that Service's communication timeline.

Likewise:

```text
Trip Activity
Vendor Communication History
```

where authorized.

Avoid duplicate manual entry.

---

## 65. MAIL SECURITY

Mail credentials belong in secure server-side configuration.

Support:

```text
OAuth where provider supports it
App passwords/SMTP-IMAP credentials where necessary
encrypted credentials
RBAC
audit
```

Never return mailbox credentials to the browser.

---

## 66. ONE SHARED UI GRAMMAR

Continue Claude's recommendation.

Standardize:

```text
AppShell
MasterDetailShell
WorkspaceHeader
SummaryStrip
StatusBadge
EntityCard
ActionDrawer
ActivityTimeline
DataTable
FilterBar
Search
EmptyState
LoadingState
ErrorState
```

Do not let each module invent its own navigation/layout conventions.

---

## 67. COLLAPSIBLE VIQ SIDEBAR

The main side pane must be collapsible.

Desktop:

```text
Expanded:
Icon + Label

Collapsed:
Icon
```

Remember user preference.

Provide clear tooltips while collapsed.

Tablet/mobile should use appropriate drawer navigation.

Do not let sidebar consume valuable mobile screen width.

---

## 68. RESPONSIVE REASSESSMENT

Revisit all principal workflows for:

```text
DESKTOP
TABLET
MOBILE
```

Desktop may use:

```text
List | Workspace | Drawer
```

Tablet:

```text
List | Workspace
```

Mobile:

```text
List → Detail → Action
```

Do not merely shrink desktop.

---

## 69. TRIP WORKSPACE

Target primary Trip navigation:

```text
OVERVIEW
ROUTE
SERVICES
PEOPLE
DOCUMENTS
ACTIVITY
FINANCIALS
```

Flight Planning may exist within:

```text
ROUTE
```

or as a clearly accessible Trip-level workspace if it needs more depth.

Avoid exposing:

```text
Requirement
Service Case
Service Order
```

as top-level tabs.

---

## 70. ONE SERVICE EXPERIENCE

A user sees:

```text
ETHIOPIA OVERFLIGHT

CHANGED
Vendor ABC

Revision Required

[MESSAGE]
[SUBMIT REVISION]
[OPEN]
```

Opening reveals details.

Keep complex service architecture underneath.

---

## 71. MINIMAL CREATION FLOWS

New Person:

```text
Name
Role
Contact
```

Then enrich.

New Aircraft:

```text
Registration
Aircraft Type
Operator
```

Then enrich.

New Vendor:

```text
Name
Main Location
Primary Capability
Email
```

Then enrich.

New Client:

```text
Name
Primary Contact
Billing Details minimum
```

Then enrich.

Do not make initial creation synonymous with completing the entire master record.

---

## 72. GLOBAL SEARCH / SUPERSEARCH

Preserve and expand VIQ Supersearch.

Search while typing across:

```text
Trip No
Aircraft registration
Operator
Client
Mission
Callsign
Date
Airport
Vendor
Permit reference
Person
Invoice number
Fuel release
Service
```

Prioritize exact identifiers first.

---

## 73. COMMAND PALETTE

Evaluate:

```text
Ctrl/Cmd + K
```

for search/actions.

Possible:

```text
New Trip
Upload Document
Add Service
Open N1FLY
Open Trip VIQ-...
```

Do not duplicate Supersearch unnecessarily.

One unified command/search experience may be better.

---

## 74. ADMIN TOP BAR / CURRENT STATIC TEXT

Rebuild the static:

```text
Admin
Seed data loaded.
All times UTC.
Dark mode
Log out
```

into a useful dynamic account/system control.

Example concept:

```text
[System Health] [UTC 12:22Z] [Notifications] [Profile ▾]
```

Profile menu may contain:

```text
Signed in as
Role
Theme
Preferences
UTC/Local display preference
Admin Settings if authorized
Log Out
```

`Seed data loaded` belongs in Admin/System Health or deployment diagnostics, not permanent operational chrome.

Keep the operational top bar clean.

---

## 75. UTC DISPLAY

Aviation operations should continue using UTC prominently.

Do not remove this.

Use:

```text
1200Z
```

where appropriate.

Optionally show local time alongside:

```text
1200Z
15:00 EAT
```

depending on context/user preference.

---

## 76. ADMIN SETTINGS

Centralize configurable behavior.

Include:

```text
General
Branding
Email formatting
Mailboxes
Message providers
Flight planning providers
Mapbox
OCR/document providers
Automation
Country rules
Airport rules
Service rules
Permit rules
Task escalation
Billing
Currency
Security
Backups
```

Avoid credentials spread across `.env` and UI unpredictably.

Secrets still require secure server-side handling/encryption.

---

## 77. DOCUMENT INTELLIGENCE

Retain the new architecture:

```text
Original Document
→ Extraction
→ Verification
→ Structured Operational Data
```

Never silently trust OCR or AI.

Use Document Intelligence for automatic permit attachments and Trip readiness.

---

## 78. AUTOMATED TESTING

This upgrade must create a real test foundation.

At minimum:

```text
Domain unit tests
State-transition tests
Route/service-generation tests
Permit grouping tests
Change-impact tests
API integration tests
RBAC tests
Invoice duplicate tests
Document pipeline tests
Task escalation tests
Key E2E workflows
```

Particularly test:

```text
Trip route
→ permit candidates
→ services preset
→ bulk submit
→ REQUESTED
→ confirmation loaded
→ CONFIRMED
→ schedule change
→ affected services CHANGED
→ bulk revision
→ reconfirmation
→ CONFIRMED
```

This is a core VIQ invariant.

---

## 79. STOP TEST CASES

Add explicit automated tests.

### Test 1

```text
HTDA → FALA
```

Expected stop destinations:

```text
FALA
```

Optional operational event view:

```text
HTDA EXIT
FALA STOP
```

### Test 2

```text
FALA → HECA → HAAB
```

Expected:

```text
HECA
HAAB
```

Optional with exit:

```text
FALA EXIT
HECA STOP
HAAB STOP
```

### Test 3

```text
HTDA → FALA → FALA
```

Must retain two separate arrival/operation events at FALA if manually created.

### Test 4

```text
FALA → FALA → FBMN
```

Must preserve first FALA operational event and subsequent FBMN stop.

No deduplication by ICAO.

---

## 80. ROUTE TEST

Input:

```text
FAOR DCT VASUR UZ21 ITROL UQ25 RUDAS UM731 FL UT237 INISA UM998 BOD UM508 TGU UJ36 BSA UJ66 ALR UN856 SADAF N856 SURIB L129 MEBUT DCT LEPA
```

Expected:

```text
parse known route tokens
resolve supported waypoints/airways
plot geometry
identify unresolved tokens
calculate FIR intersections
derive permit candidates
honor configured FIR include/exclude rules
```

Do not report successful full route parsing if important points remain unresolved.

---

## 81. OPERATIONAL AUTOMATION PHILOSOPHY

The ideal Trip creation result is not:

```text
Trip Created
```

and then an empty workspace.

It should be:

```text
TRIP CREATED

Route analyzed.

12 operational requirements identified.

8 services ready for submission.
2 client-arranged.
1 document missing.
1 route item needs review.

[SUBMIT READY SERVICES]
```

That is the direction VIQ should move toward.

---

## 82. BULK ACTIONS

Where actions are compatible, allow:

```text
Submit Selected
Submit Revisions
Assign Vendor
Assign Coordinator
Mark Reviewed
Request Update
Attach Documents
```

Never bulk actions that violate service-specific business rules.

Backend calculates compatibility.

---

## 83. ACTION BOARD

Coordinator home should emphasize:

```text
Action Required
Changed Services
Permit Deadlines
Vendor Responses Due
Tasks Due
Missing Documents
Failed Messages
New Enquiries
Upcoming Departures
```

Not lifetime database statistics.

---

## 84. MULTI-USER OPERATION

Use optimistic locking/versioning for important shared records.

If changed by someone else:

```text
THIS RECORD HAS CHANGED

Updated by:
...

[COMPARE]
[RELOAD]
```

No silent overwrites.

Show last-updated context where useful.

---

## 85. AUDIT VS ACTIVITY

Keep robust Audit for technical/legal accountability.

Use Activity as human-readable operational history.

Do not necessarily duplicate everything into a new table.

Evaluate whether Activity can be:

```text
projection
filtered Audit view
event stream
hybrid
```

Choose the simplest maintainable approach.

---

## 86. PERFORMANCE

Use:

```text
Pagination
Server-side filtering
Database indexes
PostGIS indexes
Lazy loading
Route code splitting
Background jobs
Small API payloads
Query projections
Streaming file processing
```

Avoid frontend filtering of enormous datasets.

---

## 87. BACKGROUND JOBS

Standardize BullMQ/Redis for:

```text
OCR
Document classification
Email
Bulk submission
PDF generation
Route calculations where expensive
Status emails
Expiry checks
Vendor questionnaire processing
Invoice OCR
Imports
```

Provide Admin job visibility.

---

## 88. FAIL SAFELY

If a permit email fails:

```text
Service remains NOT successfully requested.
```

Do not set:

```text
REQUESTED
```

until the communications system records a successful submission state according to defined provider semantics.

If the email is queued:

```text
SUBMISSION_PENDING
```

may be represented as job/action state rather than corrupting the service lifecycle.

Define this carefully.

---

## 89. FINANCIAL SAFETY

Never allow:

```text
Vendor Invoice
→ Paid
```

without retained payment evidence/record.

Never allow accidental duplicate Vendor payment.

Never allow vendor payable data to silently become client receivable data.

Maintain full audit.

---

## 90. GENERATED BUSINESS IDS

Generate user-facing IDs for:

```text
Trips
Clients
Vendors
Invoices
Tasks where useful
```

through concurrency-safe mechanisms.

Example:

```text
TRP-260902-0042
CLI-000027
VEN-000143
INV-2026-001782
```

Final patterns may follow existing VIQ conventions.

Do not expose raw UUIDs as normal coordinator identifiers.

Do not ask coordinators to invent IDs.

---

## 91. DO NOT REMOVE CURRENT COMPOSER YET

Explicit migration requirement:

```text
Existing Composer Tab
=
KEEP
```

until contextual Trip Composer has:

```text
feature parity
successful tests
successful coordinator use
no critical workflow gaps
```

Then reassess.

Do not prematurely delete it.

---

## 92. DO NOT OVER-AUTOMATE AVIATION DECISIONS

VIQ may:

```text
suggest
calculate
prepopulate
classify
prepare
attach
send where explicitly permitted
```

but important ambiguous operational decisions remain reviewable.

Examples:

* uncertain FIR route;
* conflicting permit applicability;
* missing mandatory document;
* unusual military/demo movement;
* unclear blanket permit applicability.

Expose uncertainty.

---

## 93. RECOMMENDED IMPLEMENTATION ORDER

### PHASE 0 — ARCHITECTURAL ASSESSMENT

Compare this prompt to actual code.

Produce:

```text
Keep
Change
Merge
Delete
Defer
```

and an implementation plan.

---

### PHASE 1 — TEST SAFETY NET

Before high-risk workflow changes:

```text
Trip tests
Leg tests
Service status tests
Permit grouping tests
Route-generation tests
RBAC
Communication tests
```

---

### PHASE 2 — SHARED UI + STATUS FOUNDATION

```text
State-machine conventions
StatusBadge
MasterDetailShell
ActionDrawer
Design tokens
Responsive foundation
Collapsible sidebar
Dynamic top bar
```

---

### PHASE 3 — LEG / STOP CORRECTION

Fix:

```text
Stop calculation
Repeated ICAO stop support
Stop types
Manual stops
ICAO autocomplete
```

before building more route automation on incorrect semantics.

---

### PHASE 4 — ROUTE + SERVICE GENERATION

Implement:

```text
Great-circle/FIR route candidates
Include/exclude FIR
Manual country/FIR additions
Auto permit candidates
Landing services
Ground handling services
Responsibility
```

---

### PHASE 5 — SUBMISSION ENGINE

Implement:

```text
Default messages
Zero-edit submit
Bulk compatible submit
Document attachment resolution
REQUESTED transition
Submission failure safety
```

---

### PHASE 6 — CHANGE/REVISION ENGINE

Implement:

```text
Impact calculation
CHANGED
Single revision
Bulk revision
Reconfirmation
Confirmation history
```

---

### PHASE 7 — CONTEXTUAL COMPOSER

Trip:

```text
Composer
→ choose Leg
→ choose Service
→ generate
```

Keep existing Composer.

---

### PHASE 8 — TASKS / ATTENTION / ESCALATIONS

Implement:

```text
Task
No Later Than
Assignment
Sharing
Escalation
Action Board integration
```

---

### PHASE 9 — MAIL CLIENT

Implement:

```text
Configured mailboxes
Inbox/Sent
Threads
Reply
Compose
Trip/Leg/Service tagging
Message-ID linkage
```

---

### PHASE 10 — VENDOR UPGRADE

Implement:

```text
Vendor IDs
Multi-service capability
Organization roles
Questionnaires
Approval
Capability sync
```

---

### PHASE 11 — FINANCIALS

Implement in order:

```text
Expected cost
Vendor invoices/AP
Duplicate detection
Matching
Approval
Payments
Client billing/AR
Consolidated billing
Client payment
```

Do not attempt consolidated billing before reliable line-item accounting.

---

### PHASE 12 — FLIGHT PLANNING / GIS

Implement:

```text
PostGIS aviation data
Mapbox visualization
Route parser
FIR intersection
Internal routing
Provider abstraction
Commercial API connectors
Trip integration
Standalone advanced workspace
```

---

### PHASE 13 — BRIEFS

Implement:

```text
Trip Brief
Trip Handover
Leg/Sector Brief
PDF/Print/Email
```

after the underlying data sources are trustworthy.

---

### PHASE 14 — CROSS-DEVICE REFINEMENT

Perform complete:

```text
Desktop
Tablet
Mobile
```

workflow audit.

Do not treat responsive QA as merely CSS cleanup.

---

## 94. CORE ACCEPTANCE WORKFLOW

A user creates:

```text
N1FLY

HECA
→ HTDA
→ FALA
→ HAAB
```

with selected route constraints.

VIQ should:

```text
build legs/stops correctly
calculate route
identify FIR/country permit candidates
allow manual additions/exclusions
preset overflight services
preset landing permits
preset ground handling
identify required documents
select defaults/vendors where configured
show everything ready for review
```

Coordinator can select:

```text
[SUBMIT ALL READY]
```

without opening individual messages.

Successful submissions become:

```text
REQUESTED
```

A permit is loaded:

```text
→ CONFIRMED
```

Schedule changes:

```text
Affected services only
→ CHANGED
```

Coordinator chooses:

```text
[SUBMIT AFFECTED REVISIONS]
```

Reconfirmations arrive:

```text
→ CONFIRMED
```

Every email/WhatsApp/call is visible in the appropriate Service timeline.

That is a fundamental VIQ workflow and must be heavily tested.

---

## 95. FINAL PRODUCT TEST

The coordinator should be able to answer within seconds:

```text
What flight am I working?
What is the next sector?
What must be arranged?
What has already been requested?
What is confirmed?
What changed?
What needs revision?
What documents are missing?
Who am I waiting for?
What must I do next?
What is the deadline?
What communications have happened?
What does it cost?
What remains unpaid/unbilled?
```

If VIQ requires several pages or specialist knowledge to answer those questions, the simplification is not complete.

---

## 96. FINAL ARCHITECTURAL PRINCIPLES

Keep these non-negotiable:

### 1.

**Trip is the primary operational container.**

### 2.

**Leg is the primary movement unit.**

### 3.

**Services should be generated from route and operational context wherever possible.**

### 4.

**Routine service requests should support zero-edit submission.**

### 5.

**Bulk operations must obey aviation compatibility rules.**

### 6.

**Relevant changes automatically identify affected services.**

### 7.

**Revisions and reconfirmations are first-class workflows.**

### 8.

**Documents are automatically attached from verified evidence when rules require them.**

### 9.

**Missing documents are explicit exceptions, not silent failures.**

### 10.

**Service communications form a complete operational timeline.**

### 11.

**Composer should become contextual without prematurely removing the existing Composer.**

### 12.

**Trip Brief and Leg Brief are generated operational views, not duplicate manually maintained records.**

### 13.

**Tasks, NLT deadlines and escalations belong in the aviation workflow, not a disconnected to-do app.**

### 14.

**Vendor AP and Client AR remain distinct accounting flows.**

### 15.

**Vendor invoices require duplicate detection, matching, approval and payment history.**

### 16.

**Flight Planning is a reusable platform capability primarily consumed within Trip.**

### 17.

**GIS/routing and legal permit applicability are related but not assumed to be identical.**

### 18.

**Repeated airports and non-standard demo/military movements must remain possible.**

### 19.

**Business IDs are generated by VIQ, not invented by coordinators.**

### 20.

**One responsive design language should cover web, tablet and mobile.**

### 21.

**The VIQ sidebar must be collapsible.**

### 22.

**Admin chrome should show useful dynamic system/user information rather than static development messages.**

### 23.

**Critical aviation/business rules belong on the server/domain layer, not duplicated in React.**

### 24.

**Automation must reduce repetitive work without hiding uncertainty or failures.**

### 25.

**Existing working functionality must survive the upgrade unless an intentionally tested replacement is demonstrably better.**

---

## 97. CLAUDE'S ASSIGNMENT

Do not simply agree with this document.

First inspect VIQ and challenge it.

Specifically identify:

```text
What is already solved?
What recommendations duplicate current functionality?
What should be simplified further?
What carries unnecessary complexity?
What needs schema changes?
What can be implemented purely in UI?
What needs migration?
What is dangerous to change?
What should be sequenced differently?
What requires external API/licensing validation?
What requires aviation-domain verification?
```

Then produce a concise architectural decision report.

After assessment, execute the upgrade **incrementally**, preserving data and maintaining a buildable/testable VIQ after every phase.

The desired result is:

> **Create the Trip once, allow VIQ to infer and prepare the repetitive operational work, let the coordinator deal primarily with exceptions, and maintain complete traceability underneath.**

The final system should feel substantially simpler than the sophistication of the aviation operation it is managing.
