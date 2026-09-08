# VIQ Vendor Assignment & Resolution Engine — Sub-Project 1: Core Data Model + Resolver

**Source:** [2026-09-09-viq-vendor-assignment-engine-upgrade-prompt.md](2026-09-09-viq-vendor-assignment-engine-upgrade-prompt.md)
(87-section user-authored spec; itself explicitly states "do not merely
implement this document literally," requiring an architecture decision
report first, per its own §1/§87.)

**Written 2026-09-08 during an unattended work window** (user authorized
proceeding through phases without stopping to ask, returning ~15:00,
reserving questions until then — see `docs/superpowers/plans/2026-09-08-viq-tasks-attention-engine.md`'s
SDD ledger for the immediately-preceding Phase 8 work done the same way).
Every decision below that would normally be a clarifying question is
instead a documented ruling, following the same "rulings, not stalls"
approach used throughout Phase 8's SDD execution. All rulings are listed
in §0 for a fast review when the user returns.

## 0. Rulings made in place of clarifying questions

1. **Scope: sub-project 1 only, not the whole 87-section document.**
   The source document is too large for one plan (writing-plans skill's
   own scope-check rule). Decomposed into 4 sub-projects (§1 below);
   this spec covers only sub-project 1 — the `VendorAssignment` model
   and the resolver service. Sub-projects 2-4 (live Trip Builder wiring,
   Client/Vendor Assignment UI, Change-Vendor + RFQ workflows) are
   listed but not designed here.
2. **Isolated-first, matching the Phase 8 pattern.** Sub-project 1 does
   NOT wire the resolver into `generateOverflightServices`/
   `generateArrivalServices` yet — it ships as a fully tested, callable
   service with zero behavior change to any live user-facing flow.
   Wiring it in (sub-project 2) is a live-UX decision (how ties get
   presented to a coordinator, what "Why this vendor" looks like) better
   made with the user present, and touches the same generation methods
   Phase 4/6 already hardened — lower risk to leave that seam for a
   reviewed session.
3. **No `PermitType` entity.** The existing codebase treats `serviceType`
   as a plain string everywhere (DTO `@IsIn` arrays, no DB enum, no
   reference table) — modeling permit type as a new full entity would be
   the first reference-table for either dimension and is inconsistent
   with established convention. `VendorAssignment.permitType` is an
   optional plain string, mirroring `Service.serviceType`.
4. **No Vendor Questionnaire integration (§49).** The questionnaire
   approval workflow itself doesn't exist in VIQ yet (checked: no
   `questionnaire`/`capability` module, `CountryRule.docsRequired` is the
   closest thing and is unrelated). Nothing to integrate with — deferred
   entirely, not partially stubbed.
5. **Vendor human-readable IDs (§78) — deferred out of sub-project 1.**
   `Provider.providerId` is a plain string primary key today with no
   generator/counter table (unlike `Trip`/soon `Task`, which do have
   this pattern). Retrofitting ID generation onto an existing populated
   table is a data-migration concern separate from the resolver's own
   logic — tracked as a sub-project 2+ item, not blocking the resolver.
6. **Quote/RFQ naming avoids "Quote."** A `Quote`-named model would
   collide conceptually with the existing, unrelated `QuotesModule`
   (the public LandingPage's client-facing trip-request submission flow
   — confirmed via reading `quotes.service.ts`, nothing to do with
   vendors). The source document's §44-48 multi-vendor RFQ workflow
   (sub-project 4, not designed here) will use `VendorRfq`/
   `VendorRfqInvitation` naming when it's built, to avoid the collision.

## 1. Sub-project decomposition

```
Sub-project 1 (THIS SPEC): VendorAssignment model + Resolver
  - New VendorAssignment entity (context: vendor × country/airport ×
    serviceType/permitType × client), Preferred/Rank/prohibition/validity.
  - VendorResolverService: pure resolution logic, returns
    RESOLVED / CHOICE_REQUIRED / NO_ELIGIBLE_VENDOR / BLOCKED with a
    full "why" explanation.
  - Fully isolated: zero changes to services.service.ts / legs.service.ts
    / trips.service.ts. Not called from anywhere live yet.

Sub-project 2 (future): Live wiring + tie-break UX
  - Call VendorResolverService from generateOverflightServices/
    generateArrivalServices, replacing resolveProvider.
  - Capture selectedVendorId/selectionSource/selectedAt/selectedBy on
    Service (§25).
  - Coordinator tie-break UI during Trip Builder ("2 preferred vendors,
    pick one") + "Why this vendor?" panel.
  - Historical stability test: a later master-ranking change must not
    rewrite an already-created Service's vendor (§26).

Sub-project 3 (future): Change Vendor + Client/Admin management UI
  - Client Profile "Vendor Preferences" tab + central "Vendor
    Assignments" admin workspace (§34-41) — same underlying records,
    multiple entry points, per the source doc's own "one source of
    truth" mandate (§6).
  - Post-submission "Change Vendor" workflow (§28-29, §57-59): cancel/
    withdraw old request, preserve history, create replacement order,
    assist with the cancellation communication.

Sub-project 4 (future): Multi-vendor RFQ workflow
  - Separate from normal single-vendor execution (§44-48) — a distinct
    "VendorRfq" flow for cases needing competitive quotes.
```

## 2. Data model (sub-project 1 scope)

```prisma
// One row = "this Vendor may fill this operational context, at this
// preference." Context specificity ranges from fully general (country
// only) to fully specific (client + airport + serviceType + permitType).
// Deliberately NOT a single global vendor.priority -- priority is
// always contextual (source doc §2).
model VendorAssignment {
  id             String    @id @default(cuid())
  providerId     String    @map("provider_id")
  countryIso2    String?   @map("country_iso2")
  icao           String?
  serviceType    String    @map("service_type")
  permitType     String?   @map("permit_type")
  clientId       String?   @map("client_id")

  preferred      Boolean   @default(false)
  rank           Int?      // required by the service layer unless prohibited: true — a
                            // prohibition row (§10's "Vendor X, DO NOT USE") has no
                            // meaningful rank; forcing one would just invite a fake number
  prohibited     Boolean   @default(false)

  active         Boolean   @default(true)
  effectiveFrom  DateTime? @map("effective_from")
  effectiveUntil DateTime? @map("effective_until")

  notes          String?
  createdBy      String?   @map("created_by")
  createdAtZ     DateTime  @default(now()) @map("created_at_z")

  provider Provider @relation(fields: [providerId], references: [providerId], onDelete: Cascade)
  client   Client?  @relation(fields: [clientId], references: [clientId], onDelete: Cascade)
  country  Country? @relation(fields: [countryIso2], references: [iso2])

  @@index([countryIso2, icao, serviceType, permitType, clientId])
  @@index([providerId])
  @@map("vendor_assignments")
}
```

**Preferred vs. Rank stay independent fields** (source §3) — never
inferred from each other. **Equal ranks are valid** (§4) — no unique
constraint on `(context, rank)`; the resolver's job is to detect ties,
not the schema.

**`prohibited: Boolean` instead of a separate eligibility enum.** The
source's proposed `clientEligibility: ALLOWED|DO_NOT_USE` (§5) collapses
to a boolean here since `ALLOWED` is simply the field's default/absence
— a prohibition row is created only when a client explicitly bans a
vendor for a context, matching §10's actual worked examples (prohibition
rows are always sparse exceptions, never the common case).

**Duplicate/conflict validation (§52-53)** happens in the service layer
at write time, not a DB constraint — a genuine duplicate (identical
`providerId`+context+`clientId`) is rejected; two different providers at
the same rank for the same context is valid (tied preference, §4).
Self-contradiction (`preferred: true` + `prohibited: true` for the same
row) is rejected too.

## 3. Resolver

```typescript
type VendorResolutionStatus = 'RESOLVED' | 'CHOICE_REQUIRED' | 'NO_ELIGIBLE_VENDOR' | 'BLOCKED';

interface VendorResolutionContext {
  countryIso2?: string;
  icao?: string;
  serviceType: string;
  permitType?: string;
  clientId?: string;
  asOfZ?: Date; // defaults to now(); pinned for historical re-derivation / tests
}

interface VendorResolutionResult {
  status: VendorResolutionStatus;
  selectedVendorId?: string;
  selectionSource?: string;      // e.g. 'CLIENT_AIRPORT_OVERRIDE', 'COUNTRY_DEFAULT'
  matchedRule?: { id: string; rank: number; preferred: boolean };
  alternatives: { vendorId: string; rank: number }[]; // populated for CHOICE_REQUIRED
  reason: string;                // human-readable, source of "Why this vendor?"
}
```

**Resolution hierarchy (§8)** — the source's 11-tier list collapses to a
single specificity score computed per candidate row, rather than 11
separate sequential queries: fetch every active, validity-window-matching,
non-prohibited `VendorAssignment` row for the context (client's own rows
plus general rows, permit-type-specific plus generic-service rows,
airport-specific plus country-specific plus global rows — a bounded `OR`
query, not N+1 per tier), then rank candidates by a specificity tuple
`(hasClient, hasPermitType, hasIcao, hasCountry)` descending before
applying `preferred`/`rank`. **Field order matters and was verified
against the source's own literal 11-tier list, not assumed**: tier 3 in
that list (`CLIENT + GLOBAL + SERVICE + PERMIT TYPE`) outranks tier 4
(`AIRPORT + SERVICE + PERMIT TYPE`, no client) — i.e. client-status
dominates over geography specificity, and permit-type match dominates
over geography specificity too (tier 2, `CLIENT+COUNTRY+PERMIT TYPE`,
outranks tier 6, `CLIENT+AIRPORT` with no permit type). So the tuple
must check `hasClient` first, `hasPermitType` second, and only then
geography (`hasIcao` before `hasCountry`, satisfying §12's "airport
overrides country"). This satisfies the source's four **mandatory**
principles (§8/§86: client beats general, permit-type beats generic
service, airport beats country, more-specific beats broader) without
hand-coding 11 fallback queries — same performance benefit the source
doc's own §76 asks for (avoid N+1 across tiers).

**Selection algorithm (§17-21, §64):**
1. Load candidate rows for the context (one bounded query).
2. Filter: `active`, within `effectiveFrom`/`effectiveUntil` at `asOfZ`,
   `provider.contractActive`, not `prohibited` for this client.
3. Group by specificity tier (most specific wins outright — a client+
   airport row beats a general country row regardless of rank).
4. Within the winning tier: if any row has `preferred: true`, restrict to
   those; else use all eligible rows in that tier (source §20 default:
   "use highest ranked" when no preferred row exists and ranking is
   unambiguous).
5. Take the lowest `rank` number among the (possibly preferred-filtered)
   set.
6. If exactly one vendor has that rank → `RESOLVED`.
7. If multiple vendors tie at that rank → `CHOICE_REQUIRED`, with all
   tied vendors in `alternatives`.
8. If the candidate set is empty after filtering → `NO_ELIGIBLE_VENDOR`.

`BLOCKED` (§64) is reserved for a future higher-level business rule
(none exists yet in VIQ) — the resolver's type includes it for forward
compatibility but no code path produces it in sub-project 1.

**Historical stability (§26) and concurrency (§77)** are satisfied by
construction: the resolver is a pure read-then-return function, never
writes anything itself. Sub-project 2 is responsible for copying the
result onto the `Service` row at creation time — once written there, no
later `VendorAssignment` change can retroactively affect it, since
nothing in sub-project 1 re-queries or caches a resolution.

## 4. Testing (source §75, adopted directly)

Real `jetflow_test` Postgres, no mocked Prisma — matching this project's
established convention (Phase 8, Change Impact Engine, Submission
Engine all followed this rule).

- General ranking: Rank 1 selected over Rank 2.
- Preferred + rank independence: a `preferred:false, rank:1` row beats a
  `preferred:true, rank:2` row (rank still governs within a tier once
  the preferred-only filter is applied — test both the filter and the
  ordering explicitly, since it's easy to conflate).
- Equal rank: two eligible top-rank vendors → `CHOICE_REQUIRED` with both
  in `alternatives`.
- Client override: client-scoped row for the same specificity wins over
  a general row.
- Client airport override: wins over airport-only and country-only rows.
- Client prohibition: a prohibited Rank-1 vendor is excluded; next
  eligible vendor resolves.
- Airport override: airport-scoped row wins over country-scoped row for
  the same client-less context.
- Permit-type override: permit-type-scoped row wins over a generic
  service-type row for the same country/airport.
- Validity: an expired row (`effectiveUntil` in the past relative to
  `asOfZ`) is excluded; a not-yet-effective row is excluded.
- Provider inactive: `provider.contractActive: false` excludes an
  otherwise-winning row, falling through to the next eligible one.
- No vendor: `NO_ELIGIBLE_VENDOR` when every candidate is filtered out.
- Self-contradiction rejected: creating a `preferred:true,
  prohibited:true` row for the same context throws.
- Duplicate rejected: creating two identical `(providerId, context,
  clientId)` rows throws; two *different* providers at the same rank for
  the same context does not (§52's distinction).

## 5. Explicitly out of scope for this sub-project

- Any change to `services.service.ts`, `legs.service.ts`, or
  `trips.service.ts` — the resolver is not called from anywhere yet.
- Any UI (tie-break prompt, "Why this vendor?" panel, Client Profile
  Vendor Preferences, central Assignment Workspace).
- `selectedVendorId`/`selectionSource` fields on `Service` — belongs to
  sub-project 2, when the resolver actually gets called during
  generation.
- Change Vendor workflow, RFQ workflow, vendor performance analytics,
  bulk client assignments, vendor questionnaire integration, human-
  readable vendor IDs.
