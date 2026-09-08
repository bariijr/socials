# Submission Engine + Fail-Safety Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make bulk permit-request submission actually send a message per service instead of just flipping status, and make it impossible for a service to end up marked `Requested` unless that send genuinely succeeded.

**Architecture:** Extend the existing `Service.status` string vocabulary with two new values (`'Submission Pending'`, `'Submission Failed'`) and two new edges in the existing `SERVICE_TRANSITIONS` graph — no schema change. Rewrite `PermitSubmissionGroups`'s submit action (client-side, `TripDetail.tsx`) to loop per selected service: skip if no provider assigned, transition to `Submission Pending`, generate+send the request email via the same primitives `ComposeDrawer`/`PermitRevisionGroups` already use, then transition to `Requested` on confirmed send or `Submission Failed` on any failure.

**Tech Stack:** NestJS 10 + Prisma 5.22 + PostgreSQL (server), React 19 + Vite + TypeScript (client, no test framework — verify with `npm run build:client`). Jest integration tests run against the real `jetflow_test` database.

**Spec:** [docs/superpowers/specs/2026-09-09-viq-submission-engine-design.md](../specs/2026-09-09-viq-submission-engine-design.md)

## Global Constraints

- No schema/migration change — `Service.status` is already an unconstrained string column; only the DTO's `@IsIn` list and the `SERVICE_TRANSITIONS` map change.
- A service with no `ProviderID` assigned is skipped before any status change at all — never guess a recipient for an official request.
- A service must never show `'Requested'` unless its send was actually confirmed (`sendComm`'s result has `Status === 'Sent'`).
- `'Not Started' → 'Submission Pending'` is a normal, generally-available graph edge — no role gate, no dedicated bypass method (unlike the permit-authorization work's `serviceAuthorizationLinkAllowed`), since this is an ordinary mid-sequence state reachable via the existing generic `update()` endpoint.
- Every `saveService` call in the new bulk-submit loop must use the `Version` from the most recently returned service object, not a stale pre-loop value — the loop calls `saveService` twice on the same service (once to enter `Submission Pending`, once to exit it), and optimistic locking requires the fresh version each time.

---

### Task 1: Server — status vocabulary + transition graph

**Files:**
- Modify: `src/server/common/statusTransitions.ts`
- Modify: `src/server/modules/services/dto/create-service.dto.ts`
- Create: `src/server/common/statusTransitions.spec.ts`

**Interfaces:**
- Produces: `SERVICE_TRANSITIONS` gains `'Submission Pending'` and `'Submission Failed'` keys; `isValidServiceTransition`/`serviceAllowedTransitions`/`withServiceTransitions` (unchanged signatures) now recognize the two new states since they read directly from the map. `CreateServiceDto`'s `status` field now accepts the two new string values (and `UpdateServiceDto` inherits this automatically via `PartialType`).

- [ ] **Step 1: Write the failing test**

Create `src/server/common/statusTransitions.spec.ts`:
```ts
import { isValidServiceTransition, serviceAllowedTransitions } from './statusTransitions';

describe('Submission Pending / Submission Failed transitions', () => {
  it('allows Not Started -> Submission Pending', () => {
    expect(isValidServiceTransition('Not Started', 'Submission Pending')).toBe(true);
  });

  it('allows Chasing -> Submission Pending (re-sending while chasing)', () => {
    // A "Chasing" service already reached 'Requested' once -- resubmitting
    // is a real re-send, not a first-time request, and needs the exact
    // same fail-safety (don't silently claim Requested if the resend
    // fails) as the first-time Not Started path.
    expect(isValidServiceTransition('Chasing', 'Submission Pending')).toBe(true);
  });

  it('allows Submission Pending -> Requested', () => {
    expect(isValidServiceTransition('Submission Pending', 'Requested')).toBe(true);
  });

  it('allows Submission Pending -> Submission Failed', () => {
    expect(isValidServiceTransition('Submission Pending', 'Submission Failed')).toBe(true);
  });

  it('allows Submission Failed -> Submission Pending (retry)', () => {
    expect(isValidServiceTransition('Submission Failed', 'Submission Pending')).toBe(true);
  });

  it('allows Submission Failed -> Not Started (abandon)', () => {
    expect(isValidServiceTransition('Submission Failed', 'Not Started')).toBe(true);
  });

  it('does not allow Submission Pending -> Not Started directly', () => {
    expect(isValidServiceTransition('Submission Pending', 'Not Started')).toBe(false);
  });

  it('does not allow Requested -> Submission Pending', () => {
    expect(isValidServiceTransition('Requested', 'Submission Pending')).toBe(false);
  });

  it('lists the correct allowed transitions for each new state', () => {
    expect(serviceAllowedTransitions('Submission Pending')).toEqual(['Requested', 'Submission Failed']);
    expect(serviceAllowedTransitions('Submission Failed')).toEqual(['Submission Pending', 'Not Started', 'Not Required', 'Cancelled']);
  });

  it('existing Not Started transitions still include the pre-existing edges', () => {
    expect(serviceAllowedTransitions('Not Started')).toEqual(['Requested', 'Submission Pending', 'Not Required', 'Cancelled']);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- statusTransitions.spec.ts`
Expected: FAIL — `isValidServiceTransition('Not Started', 'Submission Pending')` returns `false` because `'Submission Pending'` isn't yet in the graph.

- [ ] **Step 3: Update the transition graph**

In `src/server/common/statusTransitions.ts`, replace the `SERVICE_TRANSITIONS` constant:

```ts
export const SERVICE_TRANSITIONS: Record<string, string[]> = {
  'Not Started': ['Requested', 'Submission Pending', 'Not Required', 'Cancelled'],
  'Submission Pending': ['Requested', 'Submission Failed'],
  'Submission Failed': ['Submission Pending', 'Not Started', 'Not Required', 'Cancelled'],
  'Requested': ['Chasing', 'Confirmed', 'Not Required', 'Cancelled'],
  'Chasing': ['Requested', 'Submission Pending', 'Confirmed', 'Not Required', 'Cancelled'],
  'Confirmed': ['Re-confirm Required', 'Cancelled'],
  'Re-confirm Required': ['Confirmed', 'Not Required', 'Cancelled'],
  'Not Required': ['Not Started'],
  'Cancelled': ['Not Started', 'Not Required'],
};
```

- [ ] **Step 4: Update the DTO's allowed status list**

In `src/server/modules/services/dto/create-service.dto.ts`, find the `SERVICE_STATUSES` const (near the top of the file, alongside `SCOPE_TYPES` and `SERVICE_RESPONSIBILITIES`) and change it to:

```ts
const SERVICE_STATUSES = [
  'Not Required', 'Not Started', 'Requested', 'Chasing', 'Confirmed', 'Re-confirm Required', 'Cancelled',
  'Submission Pending', 'Submission Failed',
] as const;
```

`update-service.dto.ts` needs no edit — it extends `PartialType(OmitType(CreateServiceDto, ...))`, so it inherits the updated `status` validation automatically.

- [ ] **Step 5: Run test to verify it passes**

Run: `npm test -- statusTransitions.spec.ts`
Expected: PASS, 9 tests.

- [ ] **Step 6: Run the full server test suite**

Run: `npm test`
Expected: PASS, no regressions — this is a pure additive change to a lookup map and a validation list, nothing existing reads or writes the two new values yet.

- [ ] **Step 7: Commit**

```bash
git add src/server/common/statusTransitions.ts src/server/common/statusTransitions.spec.ts src/server/modules/services/dto/create-service.dto.ts
git commit -m "feat: add Submission Pending / Submission Failed service statuses"
```

---

### Task 2: Client — real per-service send in bulk submit + status UI

**Files:**
- Modify: `src/client/pages/TripDetail.tsx` (`PermitSubmissionGroups`'s `submitGroupRequest`, and `bucketForService`)
- Modify: `src/client/components/StatusBadge.tsx`

**Interfaces:**
- Consumes: Task 1's two new status strings (as plain strings — no new client-side types needed, `Service.Status`/`ServiceStatus` is already `string`-backed via the existing union type, which this task extends). `generateEmail`, `defaultTemplateFor` from `@/lib/emailTemplates` (already imported in `TripDetail.tsx`, added in the §13 follow-up). `saveComm`, `sendComm`, `getProviderList`, `getAirport` from `@/lib/dataStore` (already imported).
- Produces: no new exported functions — this is a rewrite of `submitGroupRequest`'s existing body, kept as a private function inside `PermitSubmissionGroups`.

Read the current state of `PermitSubmissionGroups` and `submitGroupRequest` in `src/client/pages/TripDetail.tsx` before editing — this function was rewritten in the immediately-preceding §13 slice (grouped by country+serviceType) and its exact current line numbers will not match any line numbers guessed here. Match against the actual current file content.

- [ ] **Step 1: Add the two new statuses to the client-side type union**

In `src/client/data/types.ts`, find `ServiceStatus` and add the two new values:

```ts
export type ServiceStatus =
  | 'Not Required'
  | 'Not Started'
  | 'Requested'
  | 'Chasing'
  | 'Confirmed'
  | 'Re-confirm Required'
  | 'Cancelled'
  | 'Submission Pending'
  | 'Submission Failed';
```

- [ ] **Step 2: Add StatusBadge colors**

In `src/client/components/StatusBadge.tsx`, add two entries to `SERVICE_STATUS_COLORS`:

```ts
const SERVICE_STATUS_COLORS: Record<string, string> = {
  'Confirmed': 'bg-emerald-100 text-emerald-700',
  'Requested': 'bg-blue-100 text-blue-700',
  'Chasing': 'bg-amber-100 text-amber-700',
  'Not Started': 'bg-slate-100 text-slate-600',
  'Cancelled': 'bg-gray-100 text-gray-500',
  'Re-confirm Required': 'bg-rose-100 text-rose-700',
  'Not Required': 'bg-slate-100 text-slate-600',
  'Submission Pending': 'bg-amber-100 text-amber-700',
  'Submission Failed': 'bg-red-100 text-red-700',
};
```

- [ ] **Step 3: Classify Submission Failed in the attention strip**

In `src/client/pages/TripDetail.tsx`, find `bucketForService` and add a check for the new failed status, placed before the generic urgency/Not-Started fallthrough so a failed submission is never miscategorized as merely "waiting":

```ts
function bucketForService(s: Service): AttentionBucket | null {
  if (s.Status === 'Not Required' || s.Status === 'Cancelled') return null;
  if (s.Status === 'Confirmed') return 'confirmed';
  if (s.Status === 'Re-confirm Required') return 'reconfirm';
  if (s.Status === 'Submission Failed') return 'action';
  if (s.Urgency === 'URGENT' || s.Urgency === 'BREACH' || s.Status === 'Not Started') return 'action';
  return 'waiting';
}
```

(`'Submission Pending'` needs no new branch — it correctly falls through to the final `return 'waiting'`.)

- [ ] **Step 4: Rewrite `submitGroupRequest` to actually send**

Replace `PermitSubmissionGroups`'s `submitGroupRequest` function (currently a pure status-flip loop calling only `saveService`) with:

```ts
  const submitGroupRequest = async (key: string, country: string, groupServices: Service[]) => {
    const legIds = selectedLegs[key] || [];
    if (!legIds.length) return;
    const ref = requestRefs[key] || `REQ-${key}-${Date.now()}`;
    const selectedServices = groupServices.filter((service) => legIds.includes(service.ScopeID));

    const noProvider: Service[] = [];
    const failed: Service[] = [];
    const submitted: Service[] = [];

    for (const service of selectedServices) {
      if (service.Status === 'Requested') continue;
      if (!(service.AllowedTransitions ?? []).includes('Submission Pending')) {
        // Already Confirmed / Cancelled / Not Required / etc -- nothing to
        // (re-)submit. This candidate list is already filtered upstream to
        // AllowedTransitions-includes-Requested, but that filter runs once
        // at render time; re-check here since a concurrent edit could have
        // moved the service since the checkbox was rendered.
        failed.push(service);
        continue;
      }
      if (!service.ProviderID) {
        noProvider.push(service);
        continue;
      }
      const leg = legs.find((item) => item.LegID === service.ScopeID);
      if (!leg) continue;

      try {
        const pending = await saveService({ ...service, Status: 'Submission Pending' });

        const providers = getProviderList();
        const provider = providers.find((p) => p.ProviderID === service.ProviderID) ?? null;
        const recipients = provider?.Channels?.filter((c) => c.ChannelType === 'Email').map((c) => c.Value) ?? [];
        const template = defaultTemplateFor(service.ServiceType, 'Request');
        const generated = generateEmail(
          template, pending.TripID, leg.LegID, pending.SVCID, legs, persons, '',
          trip.Registration, trip.AircraftICAOType || '', trip.AircraftMTOWKg || 0,
          trip.Client, trip.Operator, trip.SupportRef || '', pending.CountryISO2 ?? null, recipients,
        );
        const comm: Comm = {
          CommID: `COMM-${pending.SVCID}-${Date.now()}`,
          Direction: 'OUTBOUND',
          TripID: pending.TripID,
          SVCID: pending.SVCID,
          Token: pending.SVCID,
          From: 'operations@viq.local',
          To: recipients.join(', '),
          Subject: generated.subject,
          Body: generated.body,
          TimestampZ: new Date().toISOString(),
          Status: 'Draft',
        };
        await saveComm(comm);
        const sent = await sendComm(comm.CommID);

        if (sent.Status === 'Sent') {
          await saveService({ ...pending, Status: 'Requested', RefNumber: ref, Notes: `${pending.Notes} Included in combined ${country} permit request.`.trim() });
          submitted.push(service);
        } else {
          await saveService({ ...pending, Status: 'Submission Failed', Notes: `${pending.Notes} Send failed: ${sent.ErrorMessage || 'unknown error'}.`.trim() });
          failed.push(service);
        }
      } catch (err) {
        // The service may or may not have reached Submission Pending before
        // the exception -- re-fetch is unnecessary here since saveService's
        // own conflict handling already surfaces stale-version errors
        // distinctly; any other exception (network failure generating or
        // sending the comm) leaves the service at whatever state the last
        // successful saveService call left it, which is always one of
        // Submission Pending or the original pre-loop status, never a false
        // Requested.
        failed.push(service);
      }
    }

    await onSaved();

    const messages: string[] = [];
    if (submitted.length > 0) messages.push(`${submitted.length} sent successfully.`);
    if (noProvider.length > 0) {
      messages.push(`${noProvider.length} skipped (no provider assigned):\n` + noProvider.map((s) => `• ${serviceLabel(s.ServiceType)} (${s.SVCID})`).join('\n'));
    }
    if (failed.length > 0) {
      messages.push(`${failed.length} failed to submit:\n` + failed.map((s) => `• ${serviceLabel(s.ServiceType)} (${s.SVCID})`).join('\n'));
    }
    if (noProvider.length > 0 || failed.length > 0) {
      window.alert(messages.join('\n\n'));
    }
  };
```

This function needs `persons` in scope — `PermitSubmissionGroups`'s current props are `{ legs, services, onSaved }` with no `trip` or `persons`. Update the component's signature and its call site:

```ts
function PermitSubmissionGroups({ legs, services, trip, persons, onSaved }: { legs: Leg[]; services: Service[]; trip: Trip; persons: TripPersonView[]; onSaved: () => Promise<void> | void }) {
```

And update the render call site (search for `<PermitSubmissionGroups` — it sits immediately before the already-updated `<PermitRevisionGroups ... />` call from the §13 follow-up, which already passes `trip` and `persons` the same way):

```tsx
          <PermitSubmissionGroups
            legs={legs}
            services={services}
            trip={trip}
            persons={persons}
            onSaved={reload}
          />
```

- [ ] **Step 5: Verify the client builds**

Run: `npm run build:client`
Expected: no TypeScript errors.

- [ ] **Step 6: Manual verification**

With the dev server running (rebuild `dist/public` via `npm run build:client` if the server was restarted): open a trip with multiple Overflight or Permit services in the same country needing submission, assign a provider to at least one and leave another without a provider, select legs across both in the submit group, click submit, and confirm: the provider-assigned one ends up `Requested` with a real comm logged in the trip's comms; the no-provider one is reported separately and its status is untouched; and (if reachable) simulate a send failure to confirm a service lands on `Submission Failed` rather than a false `Requested`.

- [ ] **Step 7: Commit**

```bash
git add src/client/pages/TripDetail.tsx src/client/components/StatusBadge.tsx src/client/data/types.ts
git commit -m "feat: send real request emails in bulk permit submission, add Submission Pending/Failed statuses"
```

---

## Final Verification

- [ ] Run `npm test` — full server suite passes, no regressions.
- [ ] Run `npm run build:client` — no TypeScript errors.
- [ ] Restart the local preview (`npm run start:dev` if not already running, then `npm run build:client`) and confirm `http://localhost:4001` serves the app with the updated bulk-submit behavior.
