# VIQ Vendor Assignment, Preference & Resolution Engine — Upgrade Prompt

Source material (user-authored, pasted verbatim 2026-09-09) for a future
brainstorm → assessment → spec → plan cycle, matching the treatment the
97-section "VIQ Unified Simplification" document received as the source
behind the Phase 0 architectural assessment. This is **not itself a
design or a plan** — no assessment against the current codebase has been
done yet. Queued in the backlog behind the Phase 0 sequence's remaining
phases (see `2026-09-02-viq-phase0-architectural-assessment.md`); pick up
with a fresh "assess before building" pass (§1 of this document) whenever
this becomes the active work item.

---

# VIQ VENDOR ASSIGNMENT, PREFERENCE & RESOLUTION ENGINE — UPGRADE PROMPT

Act as a **Senior Aviation Operations Architect, Vendor Management Systems Designer, NestJS/React Engineer, Data Architect, Workflow Architect, and UX Product Designer**.

Your task is to assess the current VIQ Vendor/Service assignment implementation and upgrade it into a **single Vendor Assignment & Resolution Engine** that supports:

* country-level vendor rankings;
* airport/station-level vendor rankings;
* service-specific rankings;
* permit-type-specific rankings;
* client-specific overrides;
* prohibited vendors;
* validity periods;
* vendor operational eligibility;
* fallback providers;
* equal-rank preferred vendors;
* explicit coordinator selection where ambiguity exists;
* automatic vendor selection during Trip/Leg service generation;
* preserved history when vendors are changed;
* multi-vendor quote requests as a separate workflow;
* vendor preference management from both Vendor Assignments and Client Profiles.

This is **not a second Vendor database**.

All logic must operate on the existing Vendor/Organization records and existing Service/Service Case architecture wherever possible.

The governing principle is:

> **VIQ should automatically choose the correct vendor when the choice is unambiguous, ask the coordinator only when there is a real operational choice, and preserve the full history of why each vendor was selected or replaced.**

---

## 1. ASSESS BEFORE BUILDING

Before changing code, inspect:

* current Vendor model;
* Organization model if one exists;
* Client model;
* Country/Airport/ICAO reference models;
* Service Type model;
* Permit Type model;
* current default vendor fields;
* current country service rules;
* airport service rules;
* Trip Builder;
* Leg service generation;
* Requirement/Service Case/Service Order relationships;
* vendor selection UI;
* existing service submission workflow;
* vendor questionnaire capability work;
* vendor active/suspended state;
* existing audit/activity implementation;
* existing client/vendor relationship logic;
* pricing/quote workflow if already present.

For every recommendation below classify:

```text
ALREADY IMPLEMENTED
ADOPT
MODIFY
DEFER
REJECT
```

Do not create parallel data structures if equivalent ones already exist.

---

## 2. CORE CONCEPT

Do **not** store a single global:

```text
vendor.priority = 1
```

Priority is contextual.

A Vendor may simultaneously be:

```text
Priority 1
Tanzania
Overflight Permit
```

and:

```text
Priority 3
Tanzania
Landing Permit
```

and:

```text
Priority 1
HTDA
Ground Handling
```

and:

```text
Not Eligible
HTKJ
Ground Handling
```

Therefore model Vendor Assignment as a relationship between a Vendor and an operational context.

---

## 3. SEPARATE PREFERRED FROM RANK

These are deliberately different concepts.

Example:

```text
Vendor A
Preferred: YES
Rank: 1

Vendor B
Preferred: YES
Rank: 2

Vendor C
Preferred: NO
Rank: 3
```

`Preferred` indicates the business/operational preference category.

`Rank` controls ordering.

Do not infer that `Rank 1` automatically means `Preferred`.

Allow Admin to configure each independently.

---

## 4. EQUAL RANKS ARE VALID

Equal ranks must be deliberately supported.

Example:

```text
Tanzania
Overflight Permit

Vendor A
Preferred: YES
Rank: 1

Vendor B
Preferred: YES
Rank: 1

Vendor C
Preferred: YES
Rank: 2
```

Interpretation:

```text
Vendor A and Vendor B
=
equally preferred
```

Trip Builder must ask the coordinator which Rank-1 vendor to use.

Do not arbitrarily choose one based on database order.

---

## 5. PROPOSED ASSIGNMENT MODEL

Adapt to existing VIQ schema rather than blindly creating this exact table.

Conceptually:

```text
VendorAssignment

id

vendorId

countryId nullable
airportId nullable

serviceTypeId
permitTypeId nullable

clientId nullable

preferred boolean
rank integer

clientEligibility
    ALLOWED
    DO_NOT_USE
or equivalent

active boolean

effectiveFrom nullable
effectiveUntil nullable

notes nullable

createdAt
createdBy
updatedAt
updatedBy
```

Potential future fields may include:

```text
contractId
creditArrangement
currency
responseSlaMinutes
cancellationPolicy
commercialNotes
```

but do not overbuild these now.

---

## 6. ONE CENTRAL ASSIGNMENT SYSTEM

Vendor relationships must be managed through one source of truth.

Expose the same relationship through multiple useful UI entry points:

```text
Admin / Vendor Assignments
```

and:

```text
Client Profile
→ Vendor Preferences
```

and where useful:

```text
Vendor Profile
→ Assignments
```

Do not duplicate assignments into separate client/vendor preference tables.

All screens must edit/view the same underlying records.

---

## 7. GENERAL VS CLIENT-SPECIFIC RULES

Support both:

```text
GENERAL ASSIGNMENT
```

and:

```text
CLIENT-SPECIFIC ASSIGNMENT
```

Example general rule:

```text
Tanzania
Overflight Permit

Vendor A
Preferred
Rank 1
```

Client-specific override:

```text
Client:
ABC Aviation

Tanzania
Overflight Permit

Vendor C
Preferred
Rank 1
```

For Client ABC, Vendor C must override the general country default.

---

## 8. RESOLUTION HIERARCHY

Use the most specific applicable assignment first.

Recommended hierarchy:

```text
1. CLIENT + AIRPORT + SERVICE + PERMIT TYPE

2. CLIENT + COUNTRY + SERVICE + PERMIT TYPE

3. CLIENT + GLOBAL + SERVICE + PERMIT TYPE

4. AIRPORT + SERVICE + PERMIT TYPE

5. COUNTRY + SERVICE + PERMIT TYPE

6. CLIENT + AIRPORT + SERVICE

7. CLIENT + COUNTRY + SERVICE

8. CLIENT + GLOBAL + SERVICE

9. AIRPORT + SERVICE

10. COUNTRY + SERVICE

11. GLOBAL SERVICE DEFAULT
```

Claude may simplify redundant layers if the existing schema supports an equivalent cleaner precedence system.

But these principles are mandatory:

```text
Client-specific overrides general rules.

Airport-specific overrides country-level rules.

Permit-type-specific overrides generic service rules.

More-specific rules beat broader defaults.
```

---

## 9. CLIENT-WIDE DEFAULTS

Support global Client-specific vendor preferences structurally.

Example:

```text
Client ABC
Preferred Permit Vendor Worldwide:
Vendor X
```

This may then be overridden by:

```text
Client ABC
Tanzania Overflight
→ Vendor C
```

and further overridden by:

```text
Client ABC
HTDA Ground Handling
→ Vendor D
```

Do not force users to configure global client defaults.

Make them optional.

---

## 10. CLIENT-SPECIFIC PROHIBITED VENDORS

Clients must be able to prohibit a Vendor.

Example:

```text
GENERAL:
Tanzania Overflight
Vendor A
Rank 1

CLIENT ABC:
Vendor A
DO NOT USE

Vendor B
Preferred
Rank 1
```

For Client ABC:

```text
Vendor A
=
ineligible
```

even though Vendor A is the general default.

The resolver must remove prohibited vendors before ranking.

---

## 11. SERVICE-SPECIFIC CLIENT PREFERENCES

Client preferences must be service-specific.

Example:

```text
Client ABC

Tanzania Overflight
→ Vendor A

Tanzania Landing
→ Vendor B

HTDA Ground Handling
→ Vendor C

HTDA Fuel
→ Vendor D
```

Do not use one generic "preferred Tanzania Vendor" where different services require different suppliers.

---

## 12. AIRPORT RULES OVERRIDE COUNTRY RULES

Example:

```text
Tanzania
Ground Handling
Default:
Vendor A
```

but:

```text
HTDA
Ground Handling
Default:
Vendor B
```

and:

```text
HTKJ
Ground Handling
Default:
Vendor C
```

For HTDA:

```text
Vendor B
```

must be selected.

Do not ask the coordinator unless there is an unresolved tie or no valid vendor.

---

## 13. SERVICE TYPES

The assignment engine must support detailed Service Types such as:

```text
Overflight Permit
Landing Permit
Diplomatic Clearance
Ground Handling
Fuel
Catering
Crew Transportation
Hotel
GPU
Lavatory
Water
Parking
Navigation Services
Other Configured Services
```

Do not collapse every permit into one generic `PERMIT` assignment.

---

## 14. PERMIT-TYPE-SPECIFIC ASSIGNMENTS

Vendor suitability may differ between:

```text
Overflight
Landing
Diplomatic
Block
Blanket
Seasonal
Medical
Military/Special
```

Therefore allow rules such as:

```text
Tanzania
Overflight Permit
→ Vendor A
```

and:

```text
Tanzania
Diplomatic Clearance
→ Vendor B
```

where appropriate.

---

## 15. VALIDITY DATES

Vendor Assignments must support:

```text
Effective From
Effective Until
Active
```

Example:

```text
Vendor A
Tanzania Overflight
Rank 1

Valid:
01 JAN 2026
to
31 DEC 2026
```

Expired assignments must not qualify for automatic selection.

Future assignments may exist but must not become active before their effective date.

---

## 16. OPERATIONAL ELIGIBILITY BEFORE RANKING

Before rank is considered, filter Vendors by operational eligibility.

At minimum check:

```text
Vendor active?
Vendor not suspended?
Assignment active?
Within validity?
Service supported?
Country/airport supported?
Approved capability?
Client does not prohibit vendor?
```

Future checks may include:

```text
Aircraft restriction
Operator restriction
Mission restriction
Contract validity
Credit arrangement
Vendor questionnaire validity
```

Build the resolver so such rules can be added without redesign.

---

## 17. SELECTION ALGORITHM

Conceptually:

```text
SERVICE REQUIRED
      ↓
Determine context
      ↓
Find applicable assignment rules
      ↓
Apply specificity hierarchy
      ↓
Apply client prohibitions
      ↓
Remove operationally ineligible vendors
      ↓
Identify Preferred candidates
      ↓
Apply Rank
      ↓
Resolve outcome
```

---

## 18. ONE CLEAR HIGHEST-RANKED VENDOR

If the result contains one unambiguous best Vendor:

```text
AUTO-SELECT
```

Example:

```text
Tanzania Overflight
Vendor A
Preferred
Rank 1
```

Trip Builder should create the Service with Vendor A preselected.

Do not interrupt the coordinator.

---

## 19. MULTIPLE TOP-RANKED VENDORS

If several eligible Vendors are tied at the highest applicable rank:

```text
ASK COORDINATOR
```

Example:

```text
TANZANIA OVERFLIGHT

2 preferred vendors available:

○ ABC Aviation
○ East Africa Flight Support

[USE SELECTED]
```

This decision should occur while building Leg services.

Do not force the coordinator to open the full Service Case editor just to choose a Vendor.

---

## 20. NO PREFERRED VENDOR

If eligible Vendors exist but none is marked Preferred, make behavior Admin-configurable.

Possible modes:

```text
USE HIGHEST RANKED ELIGIBLE
```

or:

```text
ASK COORDINATOR
```

Default recommendation:

```text
USE HIGHEST RANKED
```

when the ranking is unambiguous.

---

## 21. NO ELIGIBLE VENDOR

If no valid Vendor is available:

```text
VENDOR REQUIRED
```

The Service should still be created.

Example:

```text
Kenya Overflight

Vendor:
Not assigned

ACTION REQUIRED
```

It must not auto-submit.

This should feed the Action Board.

---

## 22. AUTO-SUBMIT INTERACTION

Existing service automation modes remain:

```text
MANUAL ONLY
AUTO-PREPARE
AUTO-SUBMIT
```

Vendor resolution affects auto-submit.

### Case A

```text
AUTO-SUBMIT
+
one clear eligible Rank-1 Vendor
```

Result:

```text
May auto-submit
```

subject to all other service/document rules.

### Case B

```text
AUTO-SUBMIT
+
two equal Rank-1 Vendors
```

Result:

```text
STOP
Ask coordinator
```

Never arbitrarily auto-submit to one.

### Case C

```text
AUTO-SUBMIT
+
no eligible Vendor
```

Result:

```text
ACTION REQUIRED
No submission
```

---

## 23. VENDOR ASSIGNMENT DURING SERVICE GENERATION

Resolve the Vendor **while Trip/Leg services are being generated**.

Do not wait until after Trip creation unless necessary.

Example:

```text
ROUTE ANALYSIS

Tanzania Overflight
Vendor A ✓

HTDA Ground Handling
Vendor B ✓

South Africa Landing
Vendor C / Vendor D
SELECT

Kenya Overflight
No eligible Vendor
ACTION REQUIRED
```

The coordinator should resolve only exceptions.

---

## 24. SERVICE GENERATION OUTCOME

Ideal end state:

```text
Trip Builder

12 services generated

9 vendors resolved automatically
2 services require vendor choice
1 service has no eligible vendor

[RESOLVE 3 ITEMS]
```

After resolution:

```text
12 services ready

[CREATE TRIP]
[CREATE & SUBMIT READY]
```

where permissions and automation rules allow.

---

## 25. COPY SELECTION ONTO SERVICE CASE

When a Vendor is resolved, capture the choice on the operational Service/Service Case.

Conceptually store:

```text
selectedVendorId
vendorSelectionSource
vendorAssignmentRuleId
selectedAt
selectedBy
```

Possible `selectedBy`:

```text
SYSTEM
USER
```

Possible selection sources:

```text
CLIENT_AIRPORT_OVERRIDE
CLIENT_COUNTRY_OVERRIDE
CLIENT_GLOBAL_DEFAULT
AIRPORT_DEFAULT
COUNTRY_DEFAULT
GLOBAL_DEFAULT
PRIORITY_RESOLUTION
USER_SELECTED
CLIENT_REQUIRED
OPERATOR_REQUIRED
FALLBACK
MANUAL_OVERRIDE
```

Use naming that fits current VIQ conventions.

---

## 26. HISTORICAL STABILITY

Vendor preference changes must not mutate historical operational Services.

Example:

Today:

```text
Vendor A
Rank 1
```

Trip service is created.

Tomorrow Admin changes:

```text
Vendor B
Rank 1
```

Existing Service must remain:

```text
Vendor A
```

Newly generated Services use Vendor B.

Do not dynamically re-resolve existing submitted Services every time preference tables change.

---

## 27. PRE-SUBMISSION FALLBACK

Before a Service has been submitted:

```text
Vendor A
Rank 1
Inactive
```

and:

```text
Vendor B
Rank 2
Active
```

VIQ may automatically propose/select Vendor B according to the rule engine.

Record:

```text
Selection Source:
FALLBACK
```

---

## 28. AFTER SUBMISSION — NEVER SILENTLY SWITCH

Once a Service Request has been submitted to Vendor A:

```text
Vendor A
```

must remain part of the permanent history.

If Vendor A can no longer perform:

```text
DO NOT
silently replace Vendor A with Vendor B
```

Instead use:

```text
CHANGE VENDOR
```

workflow.

---

## 29. CHANGE VENDOR WORKFLOW

When Coordinator changes Vendor after a Request exists:

```text
Service Case
Vendor A
REQUESTED
```

Coordinator chooses:

```text
[CHANGE VENDOR]
```

VIQ should:

```text
1. require/select replacement Vendor
2. capture reason
3. preserve Vendor A history
4. cancel/withdraw with Vendor A where operationally appropriate
5. record the cancellation communication
6. mark Vendor A order/request cancelled/replaced
7. create replacement Service Order/request for Vendor B
8. generate new request
9. send to Vendor B
10. retain all previous communications and references
```

Do not overwrite Vendor A.

---

## 30. SERVICE CASE VS SERVICE ORDER

Use the existing rich backend hierarchy where appropriate.

Recommended conceptual behavior:

```text
Service Case
Tanzania Landing
```

may have:

```text
Service Order 1
Vendor A
CANCELLED / REPLACED
```

and:

```text
Service Order 2
Vendor B
REQUESTED
```

This preserves operational history without making multiple Vendors appear as simultaneous active suppliers unless intended.

---

## 31. CHANGE-VENDOR REASON

If a Coordinator bypasses the current valid preferred Vendor, capture a reason.

Suggested reasons:

```text
CLIENT REQUESTED
VENDOR UNAVAILABLE
NO RESPONSE
PRICE
CREDIT ISSUE
OPERATIONAL REQUIREMENT
CAPABILITY ISSUE
SCHEDULE ISSUE
QUALITY ISSUE
OTHER
```

When bypassing a valid active top-ranked Vendor, reason should be required.

Allow notes.

---

## 32. MANUAL OVERRIDE

Authorized Coordinators may:

```text
[CHANGE VENDOR]
```

or during initial build:

```text
[CHOOSE ANOTHER]
```

but only from eligible Vendors unless the user has elevated permission to override eligibility.

If overriding an ineligibility rule, require:

```text
Reason
Audit
Appropriate permission
```

---

## 33. WHY THIS VENDOR?

Every automatically selected Vendor should expose an explanation.

Example:

```text
ABC Aviation
Preferred ✓
```

Click:

```text
WHY THIS VENDOR?
```

Display:

```text
Client:
CLI-000027 · Example Aviation

Country:
Tanzania

Service:
Overflight Permit

Selection:
Client-specific country preference

Preferred:
Yes

Rank:
1

Assignment Valid:
01 JAN 2026 – 31 DEC 2026

Alternatives:
Vendor B — Rank 2
Vendor C — Rank 3
```

If Airport override:

```text
Selection Source:
HTDA Airport Override
```

This explanation must come from the actual resolver, not reconstructed separately in React.

---

## 34. CLIENT PROFILE — VENDOR PREFERENCES

Add a Client Profile section:

```text
Overview
Contacts
Aircraft / Operators
Vendor Preferences
Trips
Documents
Billing
Activity
```

Adapt exact navigation to existing Client UI.

---

## 35. CLIENT VENDOR PREFERENCE VIEW

Show both:

```text
CLIENT OVERRIDE
```

and:

```text
EFFECTIVE RESULT
```

Example:

```text
CLIENT: ABC AVIATION

VENDOR PREFERENCES

Tanzania
Overflight Permit

Effective:
Vendor C

Source:
Client Country Override

Client Override:
Vendor C — Preferred — Rank 1

General Default:
Vendor A — Preferred — Rank 1
```

---

## 36. INHERITED RESULT DISPLAY

When the Client has no override:

```text
HTDA
Ground Handling

Effective Vendor:
Vendor B

Source:
Airport Default

Client Override:
None

[CREATE CLIENT OVERRIDE]
```

Do not force the user to duplicate a general rule merely to see it from the Client.

---

## 37. CLIENT VENDOR TABLE

Suggested compact view:

```text
COUNTRY / STATION | SERVICE | EFFECTIVE VENDOR | SOURCE
```

Example:

```text
Tanzania | Overflight | Vendor A | Client Country
Tanzania | Landing    | Vendor B | Country Default
HTDA     | Handling   | Vendor C | Client Airport
HTDA     | Fuel       | Vendor D | Airport Default
FALA     | Handling   | Vendor E | Country Default
```

Allow filtering by:

```text
Country
Airport
Service
Vendor
Override/Inherited
Active/Expired
```

---

## 38. LINK TO CENTRAL ASSIGNMENTS

Inside Client Vendor Preferences include:

```text
[MANAGE ASSIGNMENTS]
```

This opens the centralized Vendor Assignment workspace already filtered to the Client.

Likewise from a Vendor Profile:

```text
[VIEW ASSIGNMENTS]
```

may show where that Vendor is ranked.

Same data.

No duplication.

---

## 39. CENTRAL VENDOR ASSIGNMENT WORKSPACE

Build a management view suitable for Admin/Operations Manager.

Possible filters:

```text
Client
Country
Airport
Service
Permit Type
Vendor
Preferred
Rank
Active
Validity
Prohibited
```

Example rows:

```text
Tanzania
Overflight
General
Vendor A
Preferred
Rank 1
```

```text
Tanzania
Overflight
Client ABC
Vendor C
Preferred
Rank 1
```

```text
HTDA
Handling
Client ABC
Vendor X
DO NOT USE
```

---

## 40. PERMISSIONS

Recommended:

### ADMIN / AUTHORIZED MANAGER

Can:

```text
create assignment
edit assignment
change priority
mark preferred
prohibit vendor
change validity
activate/deactivate
```

### COORDINATOR

Can:

```text
see effective Vendor
see Why This Vendor
choose between tied Vendors
override Vendor for one Trip/Service
change Vendor operationally
```

but cannot alter the organization's master Vendor ranking matrix unless specifically granted that permission.

---

## 41. CLIENT PROHIBITION UX

Inside Client Profile:

```text
Vendor A

Status for this Client:
DO NOT USE
```

Explain scope:

```text
Tanzania Overflight
```

or:

```text
All Services
```

where broad prohibition is intentionally configured.

Do not accidentally interpret a service-specific prohibition as a global ban.

---

## 42. FUTURE VENDOR PERFORMANCE DATA

Prepare the model so future analysis can compare:

```text
Configured Rank
Average Response Time
Confirmation Rate
Cancellation Rate
Price
Invoice Variance
Credit Terms
Service Issues
Client Overrides
Manual Bypass Count
```

Do **not** automatically reorder Admin priority based on these metrics in the initial implementation.

Admin ranking remains authoritative.

Later VIQ may show:

```text
Vendor A
Rank 1
Avg response: 42m

Vendor B
Rank 2
Avg response: 18m
```

as decision support only.

---

## 43. TRACK OVERRIDES FOR FUTURE ANALYTICS

Capture enough structured information to answer:

```text
How often was Rank-1 Vendor bypassed?
```

and:

```text
Why?
```

Example:

```text
Vendor A bypassed 37 times

17 Vendor unavailable
12 Client requested alternative
5 Price
3 Slow response
```

This may later inform ranking reviews.

Do not use it to silently change rankings.

---

## 44. QUOTE REQUEST IS A DIFFERENT WORKFLOW

Do not confuse:

```text
VENDOR SELECTION
```

with:

```text
MULTI-VENDOR QUOTE REQUEST
```

Normal operational Service fulfillment selects one active Vendor.

However, where a quote is required, support:

```text
REQUEST QUOTE FROM MULTIPLE VENDORS
```

Example:

```text
Ground Handling Quote
FALA

☑ Vendor A
☑ Vendor B
☑ Vendor C

[SEND RFQ]
```

This is intentionally multi-vendor.

---

## 45. QUOTE REQUEST MODEL

A Quote Request may target multiple Vendors.

Each Vendor response remains separate.

Conceptually:

```text
Quote Request
    ↓
Quote Invitations[]
    ↓
Vendor Quotations[]
```

Capture:

```text
Vendor
Requested At
Response Due
Response Received
Currency
Quoted Amount
Terms
Validity
Attachments
Notes
Status
```

---

## 46. QUOTE COMPARISON

Allow Coordinator/Admin to compare:

```text
Vendor A
USD 1,300

Vendor B
USD 1,150

Vendor C
USD 1,420
```

alongside useful context such as:

```text
Configured Rank
Response Time
Terms
Included Services
Cancellation Conditions
Credit Terms
```

Then:

```text
[SELECT VENDOR]
```

creates/updates the operational Service Order.

---

## 47. SELECTING QUOTE WINNER

Once a Vendor is chosen:

```text
Vendor B
SELECTED
```

other quote responses remain historical:

```text
Vendor A
NOT SELECTED

Vendor C
NOT SELECTED
```

Do not delete them.

Quote selection reason may be captured.

---

## 48. DO NOT SEND NORMAL PERMIT REQUESTS TO MULTIPLE VENDORS

For normal permit execution:

```text
one active selected Vendor
```

unless the business workflow explicitly enters Quote Request mode.

Do not accidentally send the same permit request to competing agents because two Vendors shared Rank 1.

A tie means:

```text
ASK WHICH ONE
```

not:

```text
SEND TO BOTH
```

---

## 49. VENDOR QUESTIONNAIRE INTEGRATION

Approved Vendor capabilities should influence eligibility.

Example:

```text
Vendor Questionnaire:
Approved

HTDA
Ground Handling
YES

Tanzania Permit Services
YES
```

Only approved operational capability information should qualify a Vendor where capability approval is required.

Unapproved questionnaire submissions must not automatically alter Vendor selection.

---

## 50. CLIENT PROFILE MANAGEMENT SHORTCUT

From:

```text
Client ABC
→ Vendor Preferences
```

authorized users should be able to:

```text
Add Override
Prohibit Vendor
Change Rank
Set Preferred
Set Validity
```

without navigating through several Admin menus.

But these actions edit the same central assignment records.

---

## 51. BULK CLIENT ASSIGNMENTS

Consider allowing Admin to apply a Vendor preference across several stations/countries.

Example:

```text
Client ABC

Vendor:
Vendor X

Service:
Ground Handling

Apply to:
☑ HTDA
☑ HTKJ
☑ HSSS
```

Do not make bulk assignment mandatory for first release if it complicates implementation excessively.

The core resolver is more important.

---

## 52. DUPLICATE/CONFLICT RULES

Prevent ambiguous duplicate rules that are identical in specificity unless intentionally representing equal-rank alternatives.

Example duplicate:

```text
Client ABC
HTDA
Ground Handling
Vendor A
Rank 1
```

entered twice should be blocked.

But:

```text
Vendor A
Rank 1
```

and:

```text
Vendor B
Rank 1
```

is valid and means tied preference.

---

## 53. CONFLICT VALIDATION

Admin UI should warn on unusual configurations such as:

```text
Vendor A
Preferred
Rank 1

Vendor A
DO NOT USE
```

for the exact same context.

Do not permit self-contradictory rules.

---

## 54. EXPIRED ASSIGNMENTS

Expired assignments remain visible historically.

Example:

```text
Vendor A
Tanzania Overflight
Rank 1

EXPIRED
31 AUG 2026
```

but must not participate in current Vendor resolution.

Provide:

```text
[RENEW]
```

or duplication/new validity workflow where useful.

---

## 55. AUDIT

Audit every master assignment change:

```text
Vendor
Client
Country
Airport
Service
Permit Type
Preferred
Rank
Eligibility
Effective Dates
Changed By
Changed At
Old Value
New Value
```

Also audit each operational resolution:

```text
Vendor selected
Selection source
Rule used
System/User
Time
```

---

## 56. SERVICE ACTIVITY

When Vendor is automatically selected:

```text
10:00Z
VENDOR SELECTED

ABC Aviation

Reason:
Client-specific Tanzania Overflight preference
```

When changed:

```text
13:10Z
VENDOR CHANGED

ABC Aviation
→ East Africa Flight Support

Reason:
No response

Previous request cancelled.
Replacement request created.
```

This belongs in the Service Activity timeline.

---

## 57. CHANGE VENDOR + COMMUNICATIONS

If a previously requested Vendor is being replaced, VIQ should assist with the cancellation/withdrawal message.

Example:

```text
CHANGE VENDOR

Current:
Vendor A

Replacement:
Vendor B

Previous request:
ET-12345

[PREPARE CANCELLATION]
```

After successful cancellation:

```text
Vendor A request
CANCELLED / REPLACED
```

Then proceed with Vendor B submission.

If cancellation communication fails, show this explicitly.

Do not imply Vendor A was successfully cancelled.

---

## 58. EXISTING SERVICE STATUS INTERACTION

Changing the Vendor after submission is operationally significant.

The parent Service Case may become:

```text
CHANGED
```

or another appropriate state according to the existing status engine.

The new Vendor Order/request must then proceed through:

```text
READY
→ REQUESTED
→ CONFIRMED
```

Do not destroy previous confirmation/request history.

---

## 59. TRIP CHANGE IMPACT

Vendor ranking changes in Admin are **not** themselves Trip changes.

Do not mark existing Trips `CHANGED` merely because a master Vendor ranking was modified.

However, if a Coordinator explicitly changes the Vendor on an active Trip Service:

```text
record operational change
```

and apply any required status/revision logic.

---

## 60. CLIENT CHANGE DURING TRIP

If the Trip Client is changed before Service submission:

```text
re-run Vendor resolution
```

for unsubmitted Services because Client preferences may differ.

Show affected vendor changes before saving where practical.

After submission:

```text
do not silently change Vendors
```

Flag services for review.

---

## 61. AIRPORT CHANGE DURING TRIP

If a Leg airport changes before submission:

```text
re-resolve Vendor
```

using the new station hierarchy.

Example:

```text
HTDA
→ HTKJ
```

may change:

```text
Ground Handler
Fuel Vendor
Transport Vendor
Landing Permit Provider
```

After submission, integrate with VIQ's existing Change Impact Engine.

---

## 62. SERVICE CHANGE

If Service Type changes:

```text
Ground Handling
→ Fuel Only
```

re-run Vendor resolution before submission.

After submission:

```text
treat according to Change Impact / replacement workflow
```

not silent replacement.

---

## 63. WHY THIS VENDOR API

Prefer a backend resolver response similar conceptually to:

```text
selectedVendor
selectionStatus
selectionSource
matchedRule
alternatives
reason
requiresUserChoice
```

React should render this.

Do not reproduce the resolver logic independently in the frontend.

---

## 64. RESOLUTION RESULT STATES

A clean resolver might return:

```text
RESOLVED
```

```text
CHOICE_REQUIRED
```

```text
NO_ELIGIBLE_VENDOR
```

Potentially:

```text
BLOCKED
```

if a higher-level business rule forbids Vendor assignment.

Keep result semantics explicit.

---

## 65-74. WORKED EXAMPLES

(General country default; client override; client prohibition; airport
override; client airport override; equal rank; inactive rank 1; expired
assignment; after-request vendor change; quote request — see the
original pasted prompt in conversation history for the full worked
examples if needed when this phase starts; omitted here only to keep
this reference document a reasonable length, not because they're
unimportant. Re-request the full text from the user if any example's
exact wording matters during implementation.)

---

## 75. AUTOMATED TESTS

Build strong tests for the resolver.

At minimum:

- General ranking: Rank 1 selected over Rank 2
- Preferred + rank separation: treated independently
- Equal rank: two eligible top-rank vendors → CHOICE_REQUIRED
- Client override: Client country override wins over country default
- Client airport override: wins over airport/country defaults
- Client prohibition: Rank-1 prohibited → next eligible Vendor
- Airport override: wins over country rule
- Validity: expired assignment excluded
- Vendor inactive: inactive Rank-1 → fallback
- No vendor: NO_ELIGIBLE_VENDOR
- Historical stability: change master Rank after Service created → existing Service Vendor unchanged
- Client changed before submit: re-resolve
- Client changed after submit: no silent Vendor replacement
- Airport changed: re-resolve before submission
- Change Vendor: previous order preserved, replacement order created
- Quote request: multiple Vendors allowed, but normal execution request → one selected Vendor

---

## 76. PERFORMANCE

Vendor resolution will run during Trip service generation and potentially across many Services.

Avoid 1 query per Vendor / 1 query per rule / N+1 resolution. Load relevant rules efficiently. Use appropriate database indexes for: `clientId`, `countryId`, `airportId`, `serviceTypeId`, `permitTypeId`, `vendorId`, `active`, `effectiveFrom`/`effectiveUntil`.

Do not prematurely cache incorrect/stale resolution results. If caching is later used, invalidation must occur on assignment changes.

---

## 77. CONCURRENCY

Admin may modify assignments while Coordinators are building Trips.

Use normal database transactions and record versions where needed.

The Vendor chosen for a saved Service should reflect the resolution at the time of Service creation.

Do not let an Admin preference edit mutate an already-created Service behind the user's back.

---

## 78. HUMAN-READABLE VENDOR IDS

Continue the broader VIQ business ID principle. Vendor should appear as `VEN-000143 · ABC Aviation`; Client as `CLI-000027 · ABC Aviation Client`. Do not require users to know UUIDs.

---

## 79. UI SIMPLICITY

Do not expose the entire precedence hierarchy during normal Trip Building. Only when the user asks "Why this vendor?" show the detailed reasoning.

---

## 80. DO NOT OVER-PROMPT

Coordinator should **not** be asked to choose a Vendor if VIQ has one clear valid result. Only interrupt when: multiple equally ranked valid Vendors; no eligible Vendor; policy requires manual choice; user explicitly chooses override.

---

## 81. IMPLEMENTATION ORDER

1. Assess current Vendor/default-provider logic.
2. Introduce/normalize Vendor Assignment data model.
3. Build server-side Vendor Resolver + tests.
4. Integrate Country/Airport/Service rules.
5. Add Client-specific overrides/prohibitions.
6. Integrate resolution into Trip/Leg service generation.
7. Add tied-Vendor selection UI.
8. Add Why This Vendor.
9. Add Client Profile Vendor Preferences.
10. Add central Vendor Assignments workspace.
11. Add operational Change Vendor workflow.
12. Add multi-Vendor Quote Request workflow.
13. Add vendor-performance analytics fields/views only after enough real operational data exists.

---

## 82-85. ACCEPTANCE WORKFLOWS

(Standard trip with mixed auto-resolve/choice-required/prohibition
outcomes; client prohibition; change-vendor after submission; client
profile vendor-preferences view — see the original pasted prompt in
conversation history for full worked walkthroughs when this phase starts.)

---

## 86. FINAL RULES (non-negotiable)

1. Preferred and Rank are separate.
2. Equal ranks are valid and intentionally trigger a choice.
3. Client-specific rules override general rules.
4. Client rules may prohibit Vendors.
5. Client preferences are service-specific.
6. Airport rules override country rules.
7. Assignments support validity dates.
8. Operational eligibility is evaluated before ranking.
9. Pre-submission fallback is allowed.
10. Post-submission Vendor replacement is never silent.
11. Replacing a Vendor preserves/cancels the previous request and creates a new one.
12. Multi-Vendor Quote Request is separate from normal single-Vendor Service execution.
13. Vendor resolution happens during Trip/Leg service generation.
14. The selected Vendor and selection source are copied onto the operational Service Case/Order.
15. Changing the master ranking later does not rewrite historical Trips.
16. Client Profile shows both Client overrides and inherited/effective Vendor selections.
17. Master ranking changes are restricted to Admin/authorized managers.
18. Coordinator may override a Vendor for a specific Service with audit and reason.
19. Bypassing a valid top-ranked Vendor requires a reason.
20. The model should support future vendor-performance analytics without allowing analytics to silently override Admin priority.
21. Global Client defaults are supported but remain optional.
22. Every automatic choice can explain "Why this Vendor?"
23. One Vendor Assignment system powers Country, Airport, Client and Vendor views.
24. Never create a second Vendor database for Client-specific preferences.
25. Normal coordinators should deal only with exceptions and genuine choices, not manually select a provider for every Service.

---

## 87. CLAUDE'S FINAL ASSIGNMENT

Do not merely implement this document literally. First compare it with the existing VIQ architecture. Specifically determine: what current Vendor fields can be migrated; what default-provider logic already exists; whether VendorAssignment should be a new entity or extension of existing rules; how current Service Cases/Orders hold Vendor relationships; how Client should integrate without duplication; how Vendor Questionnaire approval should affect eligibility; how to preserve existing Vendor assignments during migration; what indexes are needed; what tests must exist before migration. Then produce a short migration/architecture decision report. After that, implement this upgrade incrementally.

The desired operational behavior is:

> VIQ chooses the right Vendor automatically when the rules are clear, asks when there is a real tie, honors Client-specific preferences and prohibitions, and never destroys the history of who was actually contacted or used.

And the desired UX is:

> Generate Trip services → resolve Vendors automatically → coordinator handles only exceptions → submit.
