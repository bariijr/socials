# VIQ Per-Service Compose + Real Email Sending + Dark Mode Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Move VIQ's Comms off localStorage onto the real API, add actual SMTP email sending, let a coordinator compose and send a message directly from a leg's service card (vendor/template pre-filled from the service's own data), and add a light/dark theme toggle.

**Architecture:** Backend gains a small `MailModule` (Nodemailer) and one new `CommsController` endpoint (`POST /comms/:commId/send`) that actually dispatches email and records the real outcome. `dataStore.ts`'s Comm functions get the same async/API-backed treatment as Trips/Legs/Stops/Services did in the prior slice. The existing `generateEmail` template function moves out of `ComposerPage.tsx` into a shared module so a new `ComposeDrawer` component (opened from `TripDetail.tsx`'s service cards) and the existing standalone Composer page both use the same templates. Dark mode uses Tailwind's already-configured `class` strategy and the already-defined `.dark` CSS variables — just needs a toggle.

**Tech Stack:** NestJS 10 + Prisma 5 (backend), Nodemailer for SMTP; React 18 + Vite (frontend), no new frontend dependency.

**Spec:** `docs/superpowers/specs/2026-08-25-viq-compose-per-service-design.md`

## Global Constraints

- Do NOT `git commit` any of this work — explicit user instruction, carried over from every prior slice. Each task's "commit" step is replaced with a filesystem snapshot note in the ledger, same pattern as the trip-core-rewire plan.
- No SMTP credentials in any `VITE_`-prefixed env var (bundled into client JS) — only plain `SMTP_*` keys (server-only) carry secrets. `.env.example` gets placeholder/empty values, never real credentials.
- **Scope reduction from the spec, decided during plan-writing:** the spec proposed a Prisma migration adding `Contacts` to the backend `Provider` model. Investigation found nothing in this feature actually reads Providers via the API — `ComposeDrawer`'s vendor resolution uses `refProviders` (the frontend's already-bundled JSON), matching the trip-core-rewire's explicit "reference-data reads stay bundled JSON" decision. Dropped the backend Provider schema change entirely; `Contacts` is added only to the frontend `Provider` type and the two JSON data files (`src/client/data/json/providers.json` and, for consistency with the existing dual-copy pattern, `prisma/seed-data/providers.json`) — no migration, no DTO change, no backend risk.
- `dataStore.ts` has `// @ts-nocheck`. `TripDetail.tsx` does NOT — real type-checking applies there. `ComposerPage.tsx` does NOT have `// @ts-nocheck` either (confirmed via Task 8 of the prior plan) — real type-checking applies.
- Reuse the existing `apiFetch`/`apiJson` pattern from `dataStore.ts` for all new API calls — no new HTTP client.

---

### Task 1: Backend — `Comm` gains `sentAtZ`/`errorMessage`, Mail module, `POST /comms/:commId/send`

**Files:**
- Modify: `prisma/schema.prisma` (`Comm` model)
- Create: a new Prisma migration (via `npm run prisma:migrate`)
- Create: `src/server/modules/mail/mail.module.ts`, `src/server/modules/mail/mail.service.ts`
- Modify: `src/server/modules/comms/comms.module.ts`, `comms.service.ts`, `comms.controller.ts`
- Modify: `src/server/app.module.ts`
- Modify: `.env`, `.env.example`
- Modify: `package.json` (add `nodemailer` + `@types/nodemailer`)

**Interfaces:**
- Produces: `MailService.send({ to, subject, body }): Promise<{ ok: true } | { ok: false; error: string }>` — never throws. `POST /comms/:commId/send` — loads the comm, sends it, updates `status`/`sentAtZ`/`errorMessage`, returns the updated `Comm`.

- [ ] **Step 1: Add `sentAtZ`/`errorMessage` to the `Comm` model**

In `prisma/schema.prisma`, find the `Comm` model (currently ends with `status String @default("Draft")` before the `trip Trip @relation(...)` line). Add two lines immediately after `status`:

```prisma
  sentAtZ      DateTime? @map("sent_at_z")
  errorMessage String?   @map("error_message")
```

- [ ] **Step 2: Generate and apply the migration**

Run: `npm run prisma:migrate -- --name add_comm_send_tracking`
Expected: a new migration directory under `prisma/migrations/` with `ALTER TABLE "comms" ADD COLUMN "sent_at_z" TIMESTAMP(3), ADD COLUMN "error_message" TEXT;`, exits 0.

- [ ] **Step 3: Install Nodemailer**

Run: `npm install nodemailer && npm install --save-dev @types/nodemailer`

- [ ] **Step 4: Create the Mail module**

`src/server/modules/mail/mail.service.ts`:

```typescript
import { Injectable } from '@nestjs/common';
import * as nodemailer from 'nodemailer';

export interface SendMailResult {
  ok: boolean;
  error?: string;
}

@Injectable()
export class MailService {
  private transporter = nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: Number(process.env.SMTP_PORT) || 587,
    secure: process.env.SMTP_SECURE === 'true',
    auth: process.env.SMTP_USER
      ? { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS }
      : undefined,
  });

  async send({ to, subject, body }: { to: string; subject: string; body: string }): Promise<SendMailResult> {
    try {
      await this.transporter.sendMail({
        from: process.env.SMTP_FROM || 'VIQ Operations <ops@example.com>',
        to,
        subject,
        text: body,
      });
      return { ok: true };
    } catch (e) {
      return { ok: false, error: e instanceof Error ? e.message : 'Unknown SMTP error' };
    }
  }
}
```

`src/server/modules/mail/mail.module.ts`:

```typescript
import { Module } from '@nestjs/common';
import { MailService } from './mail.service';

@Module({
  providers: [MailService],
  exports: [MailService],
})
export class MailModule {}
```

- [ ] **Step 5: Wire `MailModule` into `CommsModule` and add the send endpoint**

`src/server/modules/comms/comms.module.ts` — add the import and register it:

```typescript
import { Module } from '@nestjs/common';
import { CommsService } from './comms.service';
import { CommsController } from './comms.controller';
import { MailModule } from '../mail/mail.module';

@Module({
  imports: [MailModule],
  controllers: [CommsController],
  providers: [CommsService],
  exports: [CommsService],
})
export class CommsModule {}
```

`src/server/modules/comms/comms.service.ts` — inject `MailService` and add a `send` method:

```typescript
import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { MailService } from '../mail/mail.service';
import { CreateCommDto } from './dto/create-comm.dto';
import { UpdateCommDto } from './dto/update-comm.dto';

@Injectable()
export class CommsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly mail: MailService,
  ) {}

  // ...existing findAll/findOne/create/update/remove, unchanged...

  async send(commId: string) {
    const comm = await this.findOne(commId);
    const result = await this.mail.send({ to: comm.to, subject: comm.subject, body: comm.body });
    const updated = await this.prisma.comm.update({
      where: { commId },
      data: {
        status: result.ok ? 'Sent' : 'Failed',
        sentAtZ: result.ok ? new Date() : null,
        errorMessage: result.ok ? null : result.error,
      },
    });
    await this.audit.log(
      'SYSTEM',
      'Comm',
      commId,
      result.ok ? 'Sent' : 'Send failed',
      '',
      result.ok ? 'Sent' : (result.error || ''),
    );
    return updated;
  }
}
```

(Only add the `mail` constructor param and the new `send` method — every other existing method in this file stays exactly as it is.)

`src/server/modules/comms/comms.controller.ts` — add one route:

```typescript
  @Post(':commId/send')
  send(@Param('commId') commId: string) {
    return this.comms.send(commId);
  }
```

(Place it near the other `:commId`-scoped routes; the file already imports `Post`/`Param` from `@nestjs/common`.)

- [ ] **Step 6: Add SMTP config and sender-identity config to `.env`/`.env.example`**

Append to both files:

```
SMTP_HOST=
SMTP_PORT=587
SMTP_SECURE=false
SMTP_USER=
SMTP_PASS=
SMTP_FROM="VIQ Operations <ops@example.com>"

VITE_SENDER_NAME="Operations Desk"
VITE_SENDER_TEAM="Operations"
VITE_SENDER_PHONE=
VITE_SENDER_FAX=
VITE_SENDER_SITA=
VITE_SENDER_ARINC=
VITE_SENDER_FROM="ops@example.com"
```

`.env` and `.env.example` get identical placeholder (mostly-empty) values here — there's no real SMTP account to configure yet; sending will return `{ ok: false }` until the user fills in real credentials themselves later, which is expected and fine (verified in Step 7). The `VITE_`-prefixed keys are non-sensitive signature-block text (Task 4 reads them client-side via `import.meta.env.VITE_SENDER_*`) — safe to bundle into client JS, unlike the plain `SMTP_*` keys above them.

- [ ] **Step 7: Verify the build and the send endpoint's failure path**

Run: `npm run build`
Expected: exits 0.

With the server started and a valid bearer token:

```powershell
# Create a draft comm
$comm = Invoke-RestMethod -Method POST http://localhost:4001/api/comms -Headers @{Authorization="Bearer $token"} -Body (@{commId='TEST-COMM-1'; direction='OUTBOUND'; tripId='<any existing tripId>'; from='ops@example.com'; to='test@example.com'; subject='Test'; body='Test body'; status='Draft'} | ConvertTo-Json) -ContentType 'application/json'
# Attempt to send it (SMTP_HOST is empty, so this should fail cleanly, not crash)
Invoke-RestMethod -Method POST "http://localhost:4001/api/comms/TEST-COMM-1/send" -Headers @{Authorization="Bearer $token"}
```

Expected: the send call returns `200` (not a 500) with the updated comm showing `"status":"Failed"` and a non-empty `errorMessage` (since `SMTP_HOST` is blank — Nodemailer will fail to connect, and `MailService.send`'s try/catch converts that into `{ ok: false, error: ... }` rather than throwing). This proves the failure path works correctly without needing real SMTP credentials to verify it.

- [ ] **Step 8: Snapshot (no git commit)**

---

### Task 2: Frontend — Provider gains `Contacts`

**Files:**
- Modify: `src/client/data/types.ts` (`Provider` interface)
- Modify: `src/client/data/json/providers.json`
- Modify: `prisma/seed-data/providers.json` (consistency with the existing dual-copy pattern; not read by this feature, but kept in sync per established practice)

**Interfaces:**
- Produces: `Provider.Contacts: { Label: string; Email: string }[]`

- [ ] **Step 1: Add `Contacts` to the `Provider` type**

In `src/client/data/types.ts`, find `export interface Provider { ... }` (currently has `ProviderID, Name, ServiceTypes, ScopeType, Scope, Email, AOGContact, WorkingHoursZ`). Add:

```typescript
  Contacts: { Label: string; Email: string }[];
```

- [ ] **Step 2: Backfill `Contacts` in both `providers.json` copies**

For every provider entry in `src/client/data/json/providers.json` AND `prisma/seed-data/providers.json`, add a `"Contacts"` array derived from the existing `"Email"` field:

```json
"Contacts": [{ "Label": "Primary", "Email": "<the provider's existing Email value>" }]
```

Do this for every entry in both files (write a small one-off Node/PowerShell script to do the transform mechanically rather than hand-editing each entry, to avoid transcription errors — read both files first to see how many providers exist).

- [ ] **Step 3: Verify**

Run: `npm run build:client` — expect 0 exit, no new errors (this is a pure data + type addition, nothing consumes `Contacts` yet until Task 5).

- [ ] **Step 4: Snapshot (no git commit)**

---

### Task 3: Frontend — `dataStore.ts` Comms migration

**Files:**
- Modify: `src/client/lib/dataStore.ts`

**Interfaces:**
- Produces: `getComms(): Promise<Comm[]>`, `getCommsForTrip(tripId): Promise<Comm[]>`, `saveComm(comm, user?): Promise<Comm>`, `sendComm(commId): Promise<Comm>` (new).

- [ ] **Step 1: Add a Comm mapper**

Near the other mapper functions (`mapServiceFromApi`/`mapServiceToApi` etc.), add:

```typescript
function mapCommFromApi(c: any): Comm {
  return {
    CommID: c.commId,
    Direction: c.direction,
    TripID: c.tripId,
    SVCID: c.svcId ?? null,
    Token: c.token ?? '',
    From: c.from,
    To: c.to,
    Subject: c.subject,
    Body: c.body,
    TimestampZ: c.timestampZ,
    Status: c.status,
  };
}

function mapCommToApi(comm: Comm): Record<string, unknown> {
  return {
    commId: comm.CommID,
    direction: comm.Direction,
    tripId: comm.TripID,
    svcId: comm.SVCID,
    token: comm.Token,
    from: comm.From,
    to: comm.To,
    subject: comm.Subject,
    body: comm.Body,
    status: comm.Status,
  };
}
```

- [ ] **Step 2: Replace Comm CRUD**

Find the `// ─── Comm CRUD ───` block (`getComms`, `getCommsForTrip`, `saveComm`) and replace with:

```typescript
// ─── Comm CRUD ────────────────────────────────────────────────────────────────

export async function getComms(): Promise<Comm[]> {
  const rows = await apiJson<any[]>('/comms');
  return rows.map(mapCommFromApi);
}

export async function getCommsForTrip(tripId: string): Promise<Comm[]> {
  const rows = await apiJson<any[]>(`/comms?tripId=${encodeURIComponent(tripId)}`);
  return rows.map(mapCommFromApi);
}

export async function saveComm(comm: Comm, user = 'SYSTEM'): Promise<Comm> {
  const comms = await getCommsForTrip(comm.TripID);
  const exists = comms.some((c) => c.CommID === comm.CommID);
  const body = JSON.stringify({ ...mapCommToApi(comm), user });
  const row = exists
    ? await apiJson<any>(`/comms/${comm.CommID}`, { method: 'PATCH', body })
    : await apiJson<any>('/comms', { method: 'POST', body });
  return mapCommFromApi(row);
}

export async function sendComm(commId: string): Promise<Comm> {
  const row = await apiJson<any>(`/comms/${commId}/send`, { method: 'POST' });
  return mapCommFromApi(row);
}
```

(This drops the old function's client-side `addAuditEntry` call, same reasoning as every other resource converted in the prior slice — the backend now logs audit entries itself.)

- [ ] **Step 3: Add `SentAtZ`/`ErrorMessage` to the frontend `Comm` type**

In `src/client/data/types.ts`'s `Comm` interface, add after `Status: CommStatus;`:

```typescript
  SentAtZ?: string;
  ErrorMessage?: string;
```

Update `mapCommFromApi` (from Step 1) to include them:
```typescript
    SentAtZ: c.sentAtZ ?? undefined,
    ErrorMessage: c.errorMessage ?? undefined,
```

- [ ] **Step 4: Verify**

Run: `npm run build:client` — expect the usual pattern: 0 errors attributable to `dataStore.ts` itself (it has `// @ts-nocheck`); `ComposerPage.tsx` will show new errors here since it still calls the now-async `saveComm` synchronously — that's expected, Task 4 fixes it.

- [ ] **Step 5: Snapshot (no git commit)**

---

### Task 9: Fix `CommsPage.tsx` and `TripsPage.tsx` (Task 3 fallout, missed consumers)

**Plan-defect note:** Task 3 made `getComms`/`getCommsForTrip` async. Two consumer files weren't in this plan's file list and now have real `tsc` errors: `CommsPage.tsx` (the standalone Comms history page — never assigned to any task in this plan, analogous to the trip-core-rewire plan's Task 8 gap) and `TripsPage.tsx` (already correctly rewired for Trips/Legs/Stops/Services by the prior plan, but its one `getCommsForTrip` call — Comms being out of scope for that plan — was never touched, and is broken now that this plan converted it).

**Files:**
- Modify: `src/client/pages/CommsPage.tsx`
- Modify: `src/client/pages/TripsPage.tsx`

**Interfaces:**
- Consumes: `getComms`, `getCommsForTrip` (both `Promise`-returning per Task 3).

- [ ] **Step 1: Fix `CommsPage.tsx`**

Read the full file first (137 lines). Replace:

```tsx
const comms = getComms();
```

with:

```tsx
const [comms, setComms] = useState<Comm[]>([]);
const [loading, setLoading] = useState(true);
const [error, setError] = useState<string | null>(null);

useEffect(() => {
  let cancelled = false;
  getComms()
    .then((list) => { if (!cancelled) { setComms(list); setLoading(false); } })
    .catch((e) => { if (!cancelled) { setError(e.message); setLoading(false); } });
  return () => { cancelled = true; };
}, []);
```

Add `useEffect` to the existing `import { useState, useMemo } from 'react';` line, and `import type { Comm } from '@/data/types';`.

Add loading/error early returns after the `filtered` `useMemo` (which already exists and can stay as-is — it derives from `comms` state, no change needed there beyond `comms` now being state instead of a direct call result) and before the main JSX return:

```tsx
if (loading) return <p className="p-4 text-sm text-muted-foreground">Loading…</p>;
if (error) return <p className="p-4 text-sm text-destructive">Error: {error}</p>;
```

Replace the second call site, `const comm = getComms().find(c => c.CommID === selectedComm)!;` (around line 111), with `const comm = comms.find(c => c.CommID === selectedComm)!;` — reuse the already-fetched state instead of calling the async function again.

- [ ] **Step 2: Fix `TripsPage.tsx`**

This file already has the exact `trips`/`legsByTrip`/`stopsByTrip`/`servicesByTrip` fetch-on-mount pattern from the prior plan — extend it with the same shape for Comms. Add a new state:

```tsx
const [commsByTrip, setCommsByTrip] = useState<Record<string, Comm[]>>({});
```

(Add `Comm` to the existing `import type { Trip, Leg, Stop, Service } from '@/data/types';` line.)

In the `useEffect`'s `Promise.all` array, add a fourth parallel fetch:

```tsx
const [legsEntries, stopsEntries, servicesEntries, commsEntries] = await Promise.all([
  Promise.all(list.map(async (t) => [t.TripID, await getLegsForTrip(t.TripID)] as const)),
  Promise.all(list.map(async (t) => [t.TripID, await getStopsForTrip(t.TripID)] as const)),
  Promise.all(list.map(async (t) => [t.TripID, await getServicesForTrip(t.TripID)] as const)),
  Promise.all(list.map(async (t) => [t.TripID, await getCommsForTrip(t.TripID)] as const)),
]);
```

Add the corresponding `setCommsByTrip(Object.fromEntries(commsEntries));` alongside the existing three `set*ByTrip` calls.

Replace the render-time line `const comms = getCommsForTrip(trip.TripID);` (around line 64) with `const comms = commsByTrip[trip.TripID] ?? [];`.

- [ ] **Step 3: Verify — build**

Run: `npm run build:client` — expect 0 errors in either file.

- [ ] **Step 4: Verify — manual browser check**

Log in, open `/comms` — confirm the message list loads and clicking a message still shows its detail. Open `/trips` — confirm each trip card's "N comms" count still displays correctly.

- [ ] **Step 5: Snapshot (no git commit)**

---

### Task 4: Frontend — extract `emailTemplates.ts`, update `ComposerPage.tsx` for real sending

**Files:**
- Create: `src/client/lib/emailTemplates.ts`
- Modify: `src/client/pages/ComposerPage.tsx`

**Interfaces:**
- Produces: `generateEmail(template, tripId, legId, svcId, legs, notes, reg, acType, mtow, client, operator, supportRef): { subject: string; body: string; token: string }` (same signature as today, now exported from the new module). `SERVICE_TYPE_TO_TEMPLATE: Record<ServiceType, TemplateType>`. `TemplateType` (moved from `ComposerPage.tsx`).

- [ ] **Step 1: Read `ComposerPage.tsx` in full first**

Confirm the exact current `generateEmail` function body (it was last touched by the prior plan's Task 8, which added a `legs: Leg[]` parameter) before moving it — line numbers may have shifted.

- [ ] **Step 2: Create `emailTemplates.ts`**

Move `TemplateType`, `formatUWDate`, and `generateEmail` out of `ComposerPage.tsx` verbatim (every line of every template case, unchanged) into `src/client/lib/emailTemplates.ts`. Add the imports the moved code needs (`getPersonsForTrip`, `getAirport` from `@/lib/dataStore`; `Leg` type from `@/data/types`).

Add the sender-identity block and `REQUEST SENT TO:` line to the three `UW_*` cases (`UW_HandlingRevision`, `UW_HandlingRequest`, `UW_Permit`, `UW_MultiLegPermit`) — insert this near the top of `generateEmail`, after the existing `pic`/`crew`/`pax` derivation:

```typescript
  const senderBlock = `PHONE: ${import.meta.env.VITE_SENDER_PHONE || 'TBD'}   FAX: ${import.meta.env.VITE_SENDER_FAX || 'TBD'}   E-MAIL: ${import.meta.env.VITE_SENDER_FROM || 'ops@example.com'}\nSITA: ${import.meta.env.VITE_SENDER_SITA || 'TBD'}  ARINC: ${import.meta.env.VITE_SENDER_ARINC || 'TBD'}  /END`;
  const senderName = `${import.meta.env.VITE_SENDER_NAME || 'Operations'} / ${import.meta.env.VITE_SENDER_TEAM || 'Operations'} TEAM`;
```

Then, in each of the four `UW_*` template bodies, append (via template-string concatenation, not replacing anything already there) right before the final `/END` marker each body already ends with:

```
\n\nTHANK YOU AND BEST REGARDS — ${senderName} / ${tripId} / END\n\nREQUEST SENT TO: <recipients — passed in as a new function parameter, see Step 3>\n${senderBlock}
```

(Adjust each case's existing closing text minimally — every one currently ends with a variant of `THANK YOU AND BEST REGARDS — ${notes || 'Operations'} / ${tripId} / END`; replace just that closing line with the block above, keeping everything before it in each case untouched.)

- [ ] **Step 3: Add a `recipients` parameter to `generateEmail`**

Add a new parameter after `supportRef: string` in the function signature: `recipients: string[] = []`. Use it in the `REQUEST SENT TO:` line added in Step 2: `${recipients.join(' ')}`. Update the function's full signature and its one call site (in `ComposerPage.tsx`'s `handleCompose`, Step 5 below).

- [ ] **Step 4: Add `SERVICE_TYPE_TO_TEMPLATE`**

In the same new file, add:

```typescript
import type { ServiceType } from '@/data/types';

export const SERVICE_TYPE_TO_TEMPLATE: Record<ServiceType, TemplateType> = {
  Permit: 'Permit',
  Overflight: 'Overflight',
  GroundHandling: 'GroundHandling',
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
```

- [ ] **Step 5: Update `ComposerPage.tsx`**

Remove `TemplateType`, `formatUWDate`, and `generateEmail` from this file (now imported instead): `import { generateEmail, type TemplateType } from '@/lib/emailTemplates';`.

Update the `generateEmail(...)` call site in `handleCompose` to pass a `recipients` argument — for the standalone Composer page (no specific vendor context), pass `to.split(',').map(s => s.trim()).filter(Boolean)` (the existing `to` field the user typed into) as the new last argument.

Update `sendAndLog` (the function that currently builds a `Comm` with `Status: 'Sent'` hardcoded and calls `saveComm`) to:

```tsx
const sendAndLog = async () => {
  if (!composed || !trip) return;
  const comm: Comm = {
    CommID: `COMM-${Date.now()}`,
    Direction: 'OUTBOUND',
    TripID: trip.TripID,
    SVCID: svcId,
    Token: composed.token,
    From: 'operations@viq.local',
    To: to || 'recipient@pending.local',
    Subject: composed.subject,
    Body: composed.body,
    TimestampZ: new Date().toISOString(),
    Status: 'Draft',
  };
  await saveComm(comm);
  const result = await sendComm(comm.CommID);
  setSent(result.Status === 'Sent');
  setSendError(result.Status === 'Failed' ? (result.ErrorMessage || 'Send failed') : null);
};
```

Add `import { saveComm, sendComm } from '@/lib/dataStore';` (merge with the existing dataStore import line rather than adding a duplicate) and a new `const [sendError, setSendError] = useState<string | null>(null);` state near the existing `const [sent, setSent] = useState(false);`. Display `sendError` near wherever `sent` is currently rendered (read the file to find that spot) — e.g. `{sendError && <p className="text-xs text-destructive">{sendError}</p>}`.

- [ ] **Step 6: Verify**

Run: `npm run build:client` — expect 0 exit, no errors in `ComposerPage.tsx` or `emailTemplates.ts`.

- [ ] **Step 7: Manual verify**

Log in, open `/composer`, compose and send a message with the backend's `SMTP_HOST` still blank — confirm the UI now shows a visible "send failed" indicator instead of a false success (this is the expected, correct behavior until real SMTP credentials are configured).

- [ ] **Step 8: Snapshot (no git commit)**

---

### Task 5: Frontend — `ComposeDrawer` component

**Files:**
- Create: `src/client/components/ComposeDrawer.tsx`

**Interfaces:**
- Consumes: `generateEmail`, `SERVICE_TYPE_TO_TEMPLATE` from `@/lib/emailTemplates`; `saveComm`, `sendComm` from `@/lib/dataStore`; `refProviders` from `@/lib/dataStore`.
- Produces: `<ComposeDrawer service={Service} leg={Leg} trip={Trip} legs={Leg[]} open={boolean} onClose={() => void} onSent={() => void} />`

- [ ] **Step 1: Read the existing `Sheet`/`Dialog` UI primitives**

Check `src/client/components/ui/` for whatever drawer/sheet component this project already uses (the codebase uses shadcn-style primitives — `Dialog` is confirmed already in use elsewhere, e.g. `BillingPage.tsx`; check if a `Sheet` component exists too for a true slide-in drawer, and use whichever matches the project's existing modal patterns most closely — don't introduce a new UI library).

- [ ] **Step 2: Build the component**

```tsx
import { useEffect, useState } from 'react';
import { generateEmail, SERVICE_TYPE_TO_TEMPLATE, type TemplateType } from '@/lib/emailTemplates';
import { saveComm, sendComm, refProviders } from '@/lib/dataStore';
import type { Service, Leg, Trip, Comm, Provider } from '@/data/types';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

export function ComposeDrawer({ service, leg, trip, legs, open, onClose, onSent }: {
  service: Service; leg: Leg; trip: Trip; legs: Leg[];
  open: boolean; onClose: () => void; onSent: () => void;
}) {
  const eligibleProviders = refProviders.filter((p) =>
    p.ServiceTypes.includes(service.ServiceType) &&
    (p.ScopeType === 'Global' || p.Scope === leg.ArrICAO || p.Scope === leg.DepICAO)
  );
  const defaultProvider = refProviders.find((p) => p.ProviderID === service.ProviderID) ?? eligibleProviders[0] ?? null;

  const [providerId, setProviderId] = useState(defaultProvider?.ProviderID ?? '');
  const [template, setTemplate] = useState<TemplateType>(SERVICE_TYPE_TO_TEMPLATE[service.ServiceType]);
  const [subject, setSubject] = useState('');
  const [body, setBody] = useState('');
  const [sending, setSending] = useState(false);
  const [result, setResult] = useState<{ ok: boolean; message: string } | null>(null);

  const selectedProvider = refProviders.find((p) => p.ProviderID === providerId) ?? null;
  const recipients = selectedProvider?.Contacts.map((c) => c.Email) ?? [];

  useEffect(() => {
    if (!open) return;
    setResult(null);
    const generated = generateEmail(
      template, trip.TripID, leg.LegID, service.SVCID, legs, '',
      trip.Registration, trip.AircraftICAOType || '', trip.AircraftMTOWKg || 0,
      trip.Client, trip.Operator, trip.SupportRef || '', recipients
    );
    setSubject(generated.subject);
    setBody(generated.body);
  }, [open, template, providerId]);

  const handleSend = async () => {
    if (!selectedProvider) return;
    setSending(true);
    setResult(null);
    try {
      const comm: Comm = {
        CommID: `COMM-${service.SVCID}-${Date.now()}`,
        Direction: 'OUTBOUND',
        TripID: trip.TripID,
        SVCID: service.SVCID,
        Token: service.SVCID,
        From: 'operations@viq.local',
        To: recipients.join(', '),
        Subject: subject,
        Body: body,
        TimestampZ: new Date().toISOString(),
        Status: 'Draft',
      };
      await saveComm(comm);
      const sent = await sendComm(comm.CommID);
      setResult(
        sent.Status === 'Sent'
          ? { ok: true, message: 'Sent successfully.' }
          : { ok: false, message: sent.ErrorMessage || 'Send failed.' }
      );
      onSent();
    } catch (e) {
      setResult({ ok: false, message: e instanceof Error ? e.message : 'Send failed.' });
    } finally {
      setSending(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Compose — {service.ServiceType} — {leg.DepICAO} → {leg.ArrICAO}</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label>Template</Label>
              <Select value={template} onValueChange={(v) => setTemplate(v as TemplateType)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {(['Permit', 'Overflight', 'GroundHandling', 'Fuel', 'Catering', 'CrewTransport', 'Customs', 'Hotel', 'Generic'] as TemplateType[]).map((t) => (
                    <SelectItem key={t} value={t}>{t}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Vendor</Label>
              <Select value={providerId} onValueChange={setProviderId}>
                <SelectTrigger><SelectValue placeholder="Select vendor..." /></SelectTrigger>
                <SelectContent>
                  {eligibleProviders.map((p) => (
                    <SelectItem key={p.ProviderID} value={p.ProviderID}>{p.Name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <div>
            <Label>Recipients</Label>
            <Input value={recipients.join(', ')} readOnly />
          </div>
          <div>
            <Label>Subject</Label>
            <Input value={subject} onChange={(e) => setSubject(e.target.value)} />
          </div>
          <div>
            <Label>Body</Label>
            <Textarea rows={14} value={body} onChange={(e) => setBody(e.target.value)} className="font-mono text-xs" />
          </div>
          {result && (
            <p className={`text-sm ${result.ok ? 'text-emerald-600' : 'text-destructive'}`}>{result.message}</p>
          )}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Close</Button>
          <Button onClick={handleSend} disabled={sending || !providerId}>
            {sending ? 'Sending…' : 'Send'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
```

Adjust import paths/component names to whatever Step 1 found actually exists in this codebase (e.g. if there's no `Textarea rows` prop support, check the component's actual props first).

- [ ] **Step 3: Verify**

Run: `npm run build:client` — expect 0 exit, no errors in this new file (not yet wired into any page, so it should be inert but type-clean).

- [ ] **Step 4: Snapshot (no git commit)**

---

### Task 6: Frontend — wire `ComposeDrawer` into `TripDetail.tsx`

**Files:**
- Modify: `src/client/pages/TripDetail.tsx`

**Interfaces:**
- Consumes: `ComposeDrawer` from `@/components/ComposeDrawer`.

- [ ] **Step 1: Read `ServiceInlineEditor` and its render call sites**

`ServiceInlineEditor` (in the current file, confirmed present per the prior plan's Task 7 work) is where each service card renders. It needs a "Compose" button. It currently receives `service`, `editing`, `selected`, `onSelect`, `onDelete`, `onSaved` as props — it does NOT currently receive `leg`, `trip`, or `legs`, all of which `ComposeDrawer` needs. Find every place `ServiceInlineEditor` is rendered (inside the leg's expanded service list) and thread `leg`/`trip`/`legs` down as new props from there — the ancestor component already has all three in scope (per Task 7's `getTripSheet`-centralized `sheet` destructure).

- [ ] **Step 2: Add Compose state and button to `ServiceInlineEditor`**

Add `leg: Leg; trip: Trip; legs: Leg[];` to the component's prop types. Add:

```tsx
const [composeOpen, setComposeOpen] = useState(false);
```

Add a "Compose" button next to the existing controls in the card header (near the trash/delete icon):

```tsx
<Button size="icon-sm" variant="ghost" onClick={() => setComposeOpen(true)} title="Compose message">
  <Send className="h-3.5 w-3.5" />
</Button>
```

(Import `Send` from `lucide-react` if not already imported in this file — check first, `TripDetail.tsx` may already import it for something else.)

At the end of the component's JSX (as a sibling to the card `<div>`, not nested inside it — dialogs render as portals so placement in the tree doesn't affect layout):

```tsx
<ComposeDrawer
  service={service}
  leg={leg}
  trip={trip}
  legs={legs}
  open={composeOpen}
  onClose={() => setComposeOpen(false)}
  onSent={onSaved}
/>
```

Add `import { ComposeDrawer } from '@/components/ComposeDrawer';`.

- [ ] **Step 3: Thread `leg`/`trip`/`legs` through every `ServiceInlineEditor` render call site**

Read the file to find each of the (likely 2-3, per the earlier call-site inventory from the prior plan's Task 7) places `<ServiceInlineEditor service={...} ... />` is rendered, and add `leg={leg} trip={trip} legs={legs}` to each — the enclosing scope already has `leg` (the leg this service belongs to), `trip`, and `legs` available at every one of these call sites (confirmed via the prior plan's `getTripSheet` centralization).

- [ ] **Step 4: Verify — build**

Run: `npm run build:client` — expect 0 exit, no new errors in `TripDetail.tsx`.

- [ ] **Step 5: Verify — manual browser check**

Log in, open a trip, expand a leg, click "Compose" on a service — confirm the drawer opens with a sensible default template and vendor (matching the service's `ProviderID` if it has one), recipients populated from that vendor's contacts. Change the vendor dropdown, confirm recipients update. Send (with `SMTP_HOST` still blank) — confirm a visible "Send failed" message appears rather than a false success, and the trip's Comms history (check via `GET /api/comms?tripId=...`) shows the new `Comm` with `Status: 'Failed'` and a real `ErrorMessage`.

- [ ] **Step 6: Snapshot (no git commit)**

---

### Task 7: Frontend — dark mode toggle

**Files:**
- Create: `src/client/lib/theme.ts`
- Modify: `src/client/components/Layout.tsx`

**Interfaces:**
- Produces: `useTheme(): { theme: 'light' | 'dark'; toggleTheme: () => void }`

- [ ] **Step 1: Create the theme hook**

`src/client/lib/theme.ts`:

```typescript
import { useEffect, useState } from 'react';

const STORAGE_KEY = 'viq_theme';

function getInitialTheme(): 'light' | 'dark' {
  const stored = localStorage.getItem(STORAGE_KEY);
  if (stored === 'light' || stored === 'dark') return stored;
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

export function useTheme() {
  const [theme, setTheme] = useState<'light' | 'dark'>(getInitialTheme);

  useEffect(() => {
    document.documentElement.classList.toggle('dark', theme === 'dark');
    localStorage.setItem(STORAGE_KEY, theme);
  }, [theme]);

  const toggleTheme = () => setTheme((t) => (t === 'dark' ? 'light' : 'dark'));

  return { theme, toggleTheme };
}
```

- [ ] **Step 2: Add the toggle to `Layout.tsx`**

Import `useTheme` and `Sun`/`Moon` icons (`lucide-react` — already used elsewhere in this file for other icons):

```tsx
import { useTheme } from '../lib/theme';
import { Sun, Moon } from 'lucide-react';
```

Inside `export default function Layout()`, add:

```tsx
const { theme, toggleTheme } = useTheme();
```

In the sidebar footer area (the `<div className="absolute bottom-0 w-full border-t p-4">` block, right before the "Log out" button), add:

```tsx
<button
  onClick={toggleTheme}
  className="mb-2 flex w-full items-center rounded-lg px-3 py-2 text-sm font-medium text-muted-foreground hover:bg-accent hover:text-accent-foreground"
>
  {theme === 'dark' ? <Sun className="mr-2 h-4 w-4" /> : <Moon className="mr-2 h-4 w-4" />}
  {theme === 'dark' ? 'Light mode' : 'Dark mode'}
</button>
```

- [ ] **Step 3: Verify — build**

Run: `npm run build:client` — expect 0 exit.

- [ ] **Step 4: Verify — manual browser check**

Log in, click the new toggle in the sidebar — confirm the whole app switches between light and dark palettes (background/text/card colors all flip, since every component already uses the `bg-background`/`text-foreground`/etc. CSS-variable-backed Tailwind classes). Refresh the page — confirm the choice persists (reads back from `localStorage`). Check a few different pages (`/trips`, a trip detail page, `/admin`) to confirm dark mode applies app-wide, not just the sidebar.

- [ ] **Step 5: Snapshot (no git commit)**

---

### Task 10: Fix the Messages tab's status badge (Task 8 verification finding)

**Plan-defect note:** found during Task 8's own manual verification. `TripDetail.tsx`'s "MESSAGES" tab (pre-existing UI, not previously touched by this plan) renders each `Comm`'s badge from `comm.Direction` (`'RECEIVED'` for `INBOUND`, always `'SENT'` for `OUTBOUND`), never looking at `comm.Status` at all. Before this plan, every `Comm`'s `Status` was unconditionally hardcoded to `'Sent'` at creation time, so this bug was invisible — the badge and the real status always happened to agree by coincidence. Now that `Status` genuinely reflects `'Draft'`/`'Queued'`/`'Sent'`/`'Failed'` (Task 1), the badge is actively wrong: confirmed live during Task 8 — two real `Comm` records with `status: "Failed"` in the database (verified via `GET /api/comms?tripId=2608008`) both displayed a green "SENT" badge in the UI, directly contradicting the record and defeating the entire point of this plan's real-send tracking.

**Files:**
- Modify: `src/client/pages/TripDetail.tsx`

**Interfaces:**
- No signature changes — this is a pure render-logic fix in the MESSAGES tab section.

- [ ] **Step 1: Read the current MESSAGES tab section**

Find the `{/* ─── MESSAGES TAB ─────────────────────────────────────────── */}` comment (currently around line 1276) and the `comms.map(comm => (...))` block beneath it. Confirm the current badge logic still matches:
```tsx
<Badge variant={comm.Direction === 'INBOUND' ? 'secondary' : 'default'}>
  {comm.Direction === 'INBOUND' ? 'RECEIVED' : 'SENT'}
</Badge>
```

- [ ] **Step 2: Fix the badge to reflect real status**

Replace the badge with one that shows the real outcome for outbound messages, while keeping `'RECEIVED'` for inbound (status tracking doesn't apply to messages the app received):

```tsx
<Badge
  variant={comm.Direction === 'INBOUND' ? 'secondary' : comm.Status === 'Failed' ? 'destructive' : 'default'}
>
  {comm.Direction === 'INBOUND' ? 'RECEIVED' : comm.Status.toUpperCase()}
</Badge>
```

(`comm.Status` is one of `'Draft' | 'Queued' | 'Sent' | 'Failed' | 'Received'` — `.toUpperCase()` renders `SENT`/`FAILED`/`DRAFT`/`QUEUED` correctly for the outbound case. Check that the `Badge` component actually supports a `variant="destructive"` — grep other usages in this file or `BillingPage.tsx`/`AdminTrips.tsx` for `variant="destructive"` to confirm the exact prop value this codebase's `Badge` component accepts before using it; adjust to whatever the real supported variant name is if `"destructive"` isn't it.)

- [ ] **Step 3: Show the error message when a send failed**

Immediately after the existing `<div className="mb-2 text-xs text-muted-foreground">{comm.Direction === 'OUTBOUND' ? 'TO:' : 'FROM:'} ...</div>` line, add:

```tsx
{comm.Status === 'Failed' && comm.ErrorMessage && (
  <div className="mb-2 text-xs text-destructive">Send failed: {comm.ErrorMessage}</div>
)}
```

- [ ] **Step 4: Verify — build**

Run: `npm run build:client` — expect 0 exit, no new errors.

- [ ] **Step 5: Verify — manual browser check**

Log in, open trip 2608008's MESSAGES tab (or any trip with a `Failed` comm from this plan's earlier testing) — confirm the two existing `Failed` comms now show a red/destructive "FAILED" badge with their real error message displayed, not a green "SENT" badge. Compose and send one more message from a service card to confirm the badge correctly shows "FAILED" immediately (matching the live `onSaved`/`reload()` refresh already verified in Task 6).

- [ ] **Step 6: Snapshot (no git commit)**

---

### Task 8: Full-stack build + end-to-end verification (controller-performed)

Per the pattern established in the prior plan's final task: this task produces no diff of its own, so it's performed directly by the controller rather than dispatched to an implementer, and has no task review of its own.

- [ ] **Step 1:** `npm run build` — exits 0.
- [ ] **Step 2:** Start the stack, confirm Postgres has the new `Comm` columns via a live `GET /api/comms`.
- [ ] **Step 3:** Full browser walkthrough: compose-and-send from a service card (Task 6), compose-and-send from the standalone Composer page (Task 4) — confirm both use visibly identical template output for the same service type, proving the shared extraction actually is shared. Toggle dark mode (Task 7) and confirm it persists across a refresh and applies on every page touched by this plan.
- [ ] **Step 4:** Report: build status, which checks passed, any deviations ledgered as rulings.
