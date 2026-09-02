# VIQ Upgrade — Phase 1-3 (Fast Fixes, Hardening, Data Hygiene) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Close every finding from the 2026-08-26 VIQ security/UX audit that was scoped as a fast fix, a hardening item, or a data-hygiene cleanup — the three phases the user explicitly approved to execute first, ahead of the larger Reference-Data-consolidation, Docker-deployment, and PWA/mobile-nav phases (each of which gets its own separate spec+plan).

**Architecture:** Eleven small, independent tasks against the existing NestJS server and React client — no new modules, no new abstractions. Two tasks are pure data operations against the Postgres container (no application code). No task introduces a new pattern this codebase doesn't already use elsewhere.

**Tech Stack:** NestJS 10 / Prisma 5 / PostgreSQL 16 (server), React 19 / Vite (client) — unchanged. Two new npm dependencies: `file-type@16.5.4` (magic-byte detection) and `content-disposition@3.0.0` (RFC 6266-correct header encoding), plus `@nestjs/throttler` (rate limiting).

**Spec:** None. Every decision in this plan was already fully resolved by the security audit (`.superpowers/audit-2026-08-26-security.md`), the UX audit (`.superpowers/audit-2026-08-26-ux-preview.md`), and the scoping debate that followed (see the conversation this plan came from) — there is no open design question left for a spec to resolve.

## Global Constraints

- This repo has no automated test framework. Verify every task with `npm run build:server` (server-only changes), `npm run build:client` (client-only changes), or `npm run build` (both) plus the live check the task specifies.
- This project is **not** git-tracked (`viq/` is untracked inside a larger unrelated repo). Do not run any `git` commands, and do not include commit steps.
- Windows/Prisma: if a build reports `EPERM` on `query_engine-windows.dll.node`, run `Get-Process node | Stop-Process -Force` first, then rebuild.
- Start the server for any live check via `npm run build` then `npm run start:prod` (`node dist/main.js`). Never `npm run start` / `nest start` — it deletes `dist/`, including the built client bundle. Stop the process (`Stop-Process -Id <pid> -Force` or Ctrl+C equivalent) when the check is done.
- Postgres runs in the existing Docker container `jetflow_api_postgres` on host port 5442. If it's not running, `docker start jetflow_api_postgres`. Credentials match `.env`'s `DATABASE_URL`: user `jetflow`, password `jetflow`, database `jetflow`.
- **Never type a real password into any UI.** If a task needs an authenticated request, mint a JWT locally: a `node -e` script using the `jsonwebtoken` package and the `.env` file's `JWT_SECRET`, signing a payload shaped exactly like `auth.service.ts`'s `login()` — `{ sub: user.id, username: user.username, role: user.role }` — then either inject it into `localStorage` via a browser tool, or pass it directly as a curl `Authorization: Bearer <token>` header.
- New npm dependencies: install with `npm install <package>[@version]`. Pin `file-type` to exactly `16.5.4` — later majors (17+) are ESM-only and would require this project's existing dynamic-`import()` workaround (already used for `pdfjs-dist` in `ocr.service.ts`); 16.5.4 is the last CommonJS release and needs no such workaround.

---

### Task 1: Deactivate the leftover `sdd_test_admin` account

**Files:** None — this is a data operation against the running Postgres container, not an application-code change.

**Interfaces:** None (no other task depends on this one).

- [ ] **Step 1: Confirm the account and its current state**

```bash
docker start jetflow_api_postgres 2>&1 | tail -1
docker exec jetflow_api_postgres psql -U jetflow -d jetflow -c "SELECT id, username, role, active FROM users WHERE username = 'sdd_test_admin';"
```

Expected output: one row, `role = Admin`, `active = t`.

- [ ] **Step 2: Deactivate it**

```bash
docker exec jetflow_api_postgres psql -U jetflow -d jetflow -c "UPDATE users SET active = false WHERE username = 'sdd_test_admin';"
```

Expected output: `UPDATE 1`.

- [ ] **Step 3: Verify**

```bash
docker exec jetflow_api_postgres psql -U jetflow -d jetflow -c "SELECT username, active FROM users WHERE username = 'sdd_test_admin';"
```

Expected: `active = f`.

**Note for whoever reviews this task:** deactivation blocks the account's *next* login attempt (`AuthService` checks `active` at login time only — see README.md's "What's not done yet" section). It does **not** revoke a JWT already issued to this account before its 12h expiry, since tokens are stateless with no server-side denylist. This is a pre-existing, accepted architectural limitation (see the security audit's I1) — not something this task is expected to fix.

---

### Task 2: Gate Billing/Invoices to Admin

**Files:**
- Modify: `src/server/modules/invoices/invoices.controller.ts` (add class-level `@Roles('Admin')`)
- Modify: `src/client/App.tsx:44` (wrap the `/admin/billing` route in `RequireRole`)
- Modify: `src/client/components/Layout.tsx` (hide the Billing nav item from non-Admin sidebars, matching Settings/Users/Message-Templates)

**Interfaces:** None consumed. Produces: the `adminItems` filter array in `Layout.tsx` now excludes `/admin/billing` for non-Admins — Task 3 (also touching `Layout.tsx`) must treat that filter array as already containing `'/admin/billing'` in its "before" state.

- [ ] **Step 1: Gate the server controller**

In `src/server/modules/invoices/invoices.controller.ts`, replace the whole file:

```ts
import { Body, Controller, Delete, Get, Param, Patch, Post, Query } from '@nestjs/common';
import { InvoicesService } from './invoices.service';
import { CreateInvoiceDto } from './dto/create-invoice.dto';
import { UpdateInvoiceDto } from './dto/update-invoice.dto';
import { Roles } from '../auth/roles.decorator';

@Controller('invoices')
@Roles('Admin')
export class InvoicesController {
  constructor(private readonly invoices: InvoicesService) {}

  @Get()
  findAll(@Query('tripId') tripId?: string) {
    return this.invoices.findAll(tripId);
  }

  @Get(':invoiceId')
  findOne(@Param('invoiceId') invoiceId: string) {
    return this.invoices.findOne(invoiceId);
  }

  @Post()
  create(@Body() dto: CreateInvoiceDto) {
    return this.invoices.create(dto);
  }

  @Patch(':invoiceId')
  update(@Param('invoiceId') invoiceId: string, @Body() dto: UpdateInvoiceDto) {
    return this.invoices.update(invoiceId, dto);
  }

  @Delete(':invoiceId')
  remove(@Param('invoiceId') invoiceId: string, @Query('user') user?: string) {
    return this.invoices.remove(invoiceId, user);
  }
}
```

- [ ] **Step 2: Gate the client route**

In `src/client/App.tsx`, find:

```tsx
        <Route path="/admin/billing" element={<BillingPage />} />
```

Replace with:

```tsx
        <Route path="/admin/billing" element={<RequireRole role="Admin"><BillingPage /></RequireRole>} />
```

- [ ] **Step 3: Hide the nav item from non-Admins**

In `src/client/components/Layout.tsx`, find:

```tsx
            items={isAdmin ? adminItems : adminItems.filter((item) => !['/admin/message-templates', '/admin/settings', '/admin/users'].includes(item.path))}
```

Replace with:

```tsx
            items={isAdmin ? adminItems : adminItems.filter((item) => !['/admin/billing', '/admin/message-templates', '/admin/settings', '/admin/users'].includes(item.path))}
```

- [ ] **Step 4: Build**

```bash
npm run build
```

Expected: no TypeScript errors.

- [ ] **Step 5: Live-verify the server gate**

Mint two JWTs locally (Admin and Coordinator — use the seeded `admin`/`coordinator1` user IDs, found via `docker exec jetflow_api_postgres psql -U jetflow -d jetflow -c "SELECT id, username, role FROM users;"`), start the server (`npm run start:prod`), then:

```bash
curl -s -o /dev/null -w "coordinator GET /invoices -> %{http_code}\n" -H "Authorization: Bearer <coordinator JWT>" http://localhost:4001/api/invoices
curl -s -o /dev/null -w "admin GET /invoices -> %{http_code}\n" -H "Authorization: Bearer <admin JWT>" http://localhost:4001/api/invoices
```

Expected: Coordinator gets `403`, Admin gets `200`. Stop the server afterward.

---

### Task 3: Wire the sidebar's "urgent" badge to real data

**Files:**
- Modify: `src/client/components/Layout.tsx`

**Interfaces:**
- Consumes: `getServices(): Promise<Service[]>` from `src/client/lib/dataStore.ts` (already exists, already used identically by `Dashboard.tsx` and `AdminDashboard.tsx`).
- Assumes Task 2's `Layout.tsx` edit (the `adminItems` filter now includes `'/admin/billing'`) has already landed — this task's "before" snippets for the nav-rendering block already contain that.

- [ ] **Step 1: Import `getServices`**

Find:

```tsx
import { preloadReferenceData, getTrips } from '../lib/dataStore';
```

Replace with:

```tsx
import { preloadReferenceData, getTrips, getServices } from '../lib/dataStore';
```

- [ ] **Step 2: Make `UrgencyBadge` take a real count**

Find:

```tsx
function UrgencyBadge() {
  return (
    <span className="ml-auto flex items-center gap-1 rounded-full bg-red-100 px-2 py-0.5 text-xs font-medium text-red-700">
      <AlertTriangle className="h-3 w-3" />
      3 urgent
    </span>
  );
}
```

Replace with:

```tsx
function UrgencyBadge({ count }: { count: number }) {
  if (count <= 0) return null;
  return (
    <span className="ml-auto flex items-center gap-1 rounded-full bg-red-100 px-2 py-0.5 text-xs font-medium text-red-700">
      <AlertTriangle className="h-3 w-3" />
      {count} urgent
    </span>
  );
}
```

- [ ] **Step 3: Thread `urgentCount` through `NavSection`**

Find:

```tsx
function NavSection({ items, title, enquiryCount }: { items: typeof navItems; title?: string; enquiryCount?: number }) {
```

Replace with:

```tsx
function NavSection({ items, title, enquiryCount, urgentCount }: { items: typeof navItems; title?: string; enquiryCount?: number; urgentCount?: number }) {
```

Find:

```tsx
            {item.path === '/dashboard' && <UrgencyBadge />}
```

Replace with:

```tsx
            {item.path === '/dashboard' && <UrgencyBadge count={urgentCount ?? 0} />}
```

- [ ] **Step 4: Add `urgentCount` state**

Find:

```tsx
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [refDataReady, setRefDataReady] = useState(false);
  const [enquiryCount, setEnquiryCount] = useState(0);
  const { user, logout, isAdmin } = useAuth();
```

Replace with:

```tsx
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [refDataReady, setRefDataReady] = useState(false);
  const [enquiryCount, setEnquiryCount] = useState(0);
  const [urgentCount, setUrgentCount] = useState(0);
  const { user, logout, isAdmin } = useAuth();
```

- [ ] **Step 5: Fetch both counts together**

Find:

```tsx
  // Re-fetch the unreviewed-enquiry count on every navigation — cheap
  // (one trips fetch) and keeps the sidebar badge from going stale after
  // an admin resolves an enquiry in TripDetail and navigates back here.
  useEffect(() => {
    let cancelled = false;
    getTrips().then((trips) => {
      if (cancelled) return;
      setEnquiryCount(trips.filter((t) => t.Owner === 'Web Enquiry' && t.Status === 'Planning').length);
    });
    return () => { cancelled = true; };
  }, [location.pathname]);
```

Replace with:

```tsx
  // Re-fetch the unreviewed-enquiry count and the urgent-services count on
  // every navigation — two cheap fetches, kept in one effect so they share
  // the same refresh trigger. Keeps both sidebar badges from going stale
  // after an admin resolves something elsewhere and navigates back here.
  useEffect(() => {
    let cancelled = false;
    Promise.all([getTrips(), getServices()]).then(([trips, services]) => {
      if (cancelled) return;
      setEnquiryCount(trips.filter((t) => t.Owner === 'Web Enquiry' && t.Status === 'Planning').length);
      setUrgentCount(services.filter((s) => s.Urgency === 'URGENT' || s.Urgency === 'BREACH').length);
    });
    return () => { cancelled = true; };
  }, [location.pathname]);
```

- [ ] **Step 6: Pass the count to the main nav section**

Find:

```tsx
          <NavSection items={navItems} />
          <div className="border-t pt-2" />
          <NavSection
            items={isAdmin ? adminItems : adminItems.filter((item) => !['/admin/billing', '/admin/message-templates', '/admin/settings', '/admin/users'].includes(item.path))}
            title="Admin"
            enquiryCount={enquiryCount}
          />
```

Replace with:

```tsx
          <NavSection items={navItems} urgentCount={urgentCount} />
          <div className="border-t pt-2" />
          <NavSection
            items={isAdmin ? adminItems : adminItems.filter((item) => !['/admin/billing', '/admin/message-templates', '/admin/settings', '/admin/users'].includes(item.path))}
            title="Admin"
            enquiryCount={enquiryCount}
          />
```

- [ ] **Step 7: Build and live-verify**

```bash
npm run build:client
npm run build
```

Then start the server, log in as any user with real urgent/breach services present (the seed data has some — confirm the exact number first via `GET /api/services` filtered client-side, or just read it off the Action Board's own "URGENT" stat card), and confirm the sidebar badge shows that same number on every page, and disappears entirely if the count is ever 0. Stop the server afterward.

---

### Task 4: Add size caps to the public quote DTO

**Files:**
- Modify: `src/server/modules/quotes/dto/create-quote.dto.ts`

**Interfaces:** None (self-contained DTO file; `QuotesService`/`QuotesController` consume the class shape unchanged, no field added or removed).

- [ ] **Step 1: Replace the whole file**

```ts
import { Type } from 'class-transformer';
import {
  ArrayMaxSize, ArrayMinSize, IsArray, IsBoolean, IsDateString, IsEmail, IsIn, IsInt,
  IsOptional, IsString, MaxLength, Min, ValidateNested,
} from 'class-validator';

const SERVICE_TYPES = ['Permit', 'Overflight', 'GroundHandling'] as const;
const PERSON_ROLES = [
  'PIC', 'SIC', 'FA', 'Mechanic', 'Engineer', 'Medical Staff', 'Other', 'Pax', 'VIP', 'Principal',
] as const;

export class QuoteLegDto {
  // Client-side correlation id (e.g. "1", timestamp string) — used to attach
  // services/persons to the right leg; not the final LegID.
  @IsString()
  clientLegId!: string;

  @IsInt()
  seq!: number;

  @IsString()
  depIcao!: string;

  @IsString()
  arrIcao!: string;

  @IsDateString()
  etdZ!: string;

  @IsDateString()
  etaZ!: string;

  @IsOptional()
  @Min(0)
  blockHours?: number;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  countriesOverflown?: string[];

  @IsOptional()
  @IsString()
  callSign?: string;
}

export class QuoteServiceDto {
  @IsString()
  clientLegId!: string;

  @IsIn(SERVICE_TYPES)
  serviceType!: (typeof SERVICE_TYPES)[number];

  @IsString()
  countryIso2!: string;

  @IsInt()
  @Min(0)
  leadTimeHours!: number;

  @IsOptional()
  @IsBoolean()
  auto?: boolean;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  notes?: string;
}

export class QuotePersonDto {
  @IsString()
  name!: string;

  @IsIn(PERSON_ROLES)
  role!: (typeof PERSON_ROLES)[number];

  @IsOptional()
  @IsString()
  passportNationality?: string;
}

export class CreateQuoteDto {
  @IsString()
  @MaxLength(200)
  client!: string;

  @IsOptional()
  @IsEmail()
  contactEmail?: string;

  @IsOptional()
  @IsString()
  registration?: string;

  @IsOptional()
  @IsString()
  operationType?: string;

  @IsOptional()
  @IsString()
  missionType?: string;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  notes?: string;

  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(20)
  @ValidateNested({ each: true })
  @Type(() => QuoteLegDto)
  legs!: QuoteLegDto[];

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(20)
  @ValidateNested({ each: true })
  @Type(() => QuoteServiceDto)
  services?: QuoteServiceDto[];

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(20)
  @ValidateNested({ each: true })
  @Type(() => QuotePersonDto)
  persons?: QuotePersonDto[];
}
```

- [ ] **Step 2: Build**

```bash
npm run build:server
```

Expected: no TypeScript errors.

- [ ] **Step 3: Live-verify the cap rejects an oversized payload**

Start the server, then:

```bash
node -e "
const legs = Array.from({length: 25}, (_, i) => ({clientLegId: String(i), seq: i, depIcao: 'KJFK', arrIcao: 'EGLL', etdZ: '2026-09-01T10:00:00Z', etaZ: '2026-09-01T18:00:00Z'}));
console.log(JSON.stringify({client: 'Cap Test', legs}));
" > ./tmp-quote-payload.json
curl -s -o /dev/null -w "25 legs -> %{http_code}\n" -H "Content-Type: application/json" -d @./tmp-quote-payload.json http://localhost:4001/api/quotes
rm ./tmp-quote-payload.json
```

Expected: `400` (fails `ArrayMaxSize(20)`). Then confirm a normal 1-leg payload still succeeds:

```bash
curl -s -o /dev/null -w "1 leg -> %{http_code}\n" -H "Content-Type: application/json" -d '{"client":"Normal Test","legs":[{"clientLegId":"1","seq":1,"depIcao":"KJFK","arrIcao":"EGLL","etdZ":"2026-09-01T10:00:00Z","etaZ":"2026-09-01T18:00:00Z"}]}' http://localhost:4001/api/quotes
```

Expected: `201`. **This second call creates a real trip in the database** — delete it afterward the same way Task 11 deletes trips (find its `tripId` via `docker exec jetflow_api_postgres psql -U jetflow -d jetflow -c "SELECT trip_id, client FROM trips WHERE client = 'Normal Test';"`, then `DELETE FROM trips WHERE trip_id = '<id>';`). Stop the server afterward.

---

### Task 5: Sanitize the download filename header

**Files:**
- Modify: `src/server/modules/docs/docs.controller.ts`

**Interfaces:** None.

- [ ] **Step 1: Install the package**

```bash
npm install content-disposition
npm install --save-dev @types/content-disposition
```

- [ ] **Step 2: Use it**

In `src/server/modules/docs/docs.controller.ts`, find:

```ts
import { Controller, Get, Post, Patch, Delete, Param, Query, Body, UploadedFile, UseInterceptors, Res, NotFoundException } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import type { Response } from 'express';
import { DocsService } from './docs.service';
```

Replace with:

```ts
import { Controller, Get, Post, Patch, Delete, Param, Query, Body, UploadedFile, UseInterceptors, Res, NotFoundException } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import type { Response } from 'express';
import contentDisposition from 'content-disposition';
import { DocsService } from './docs.service';
```

Find:

```ts
  @Get(':docId/file')
  async getFile(@Param('docId') docId: string, @Res() res: Response) {
    const { doc, filePath } = await this.docs.getFile(docId);
    res.setHeader('Content-Type', doc.mimeType);
    res.setHeader('Content-Disposition', `inline; filename="${doc.fileName}"`);
    res.sendFile(filePath, { root: '.' });
  }
```

Replace with:

```ts
  @Get(':docId/file')
  async getFile(@Param('docId') docId: string, @Res() res: Response) {
    const { doc, filePath } = await this.docs.getFile(docId);
    res.setHeader('Content-Type', doc.mimeType);
    res.setHeader('Content-Disposition', contentDisposition(doc.fileName, { type: 'inline' }));
    res.sendFile(filePath, { root: '.' });
  }
```

- [ ] **Step 3: Build**

```bash
npm run build:server
```

- [ ] **Step 4: Live-verify**

Start the server, mint an Admin JWT, find any existing `docId` via `curl -H "Authorization: Bearer <JWT>" http://localhost:4001/api/docs`, then:

```bash
curl -sI -H "Authorization: Bearer <JWT>" http://localhost:4001/api/docs/<docId>/file | grep -i content-disposition
```

Expected: a well-formed `Content-Disposition: inline; filename="..."` header (or `filename*=UTF-8''...` if the original filename has non-ASCII characters — `content-disposition` handles that encoding automatically). Stop the server afterward.

---

### Task 6: Lock down the CORS default in production

**Files:**
- Modify: `src/server/main.ts`

**Interfaces:** None.

- [ ] **Step 1: Replace the whole file**

```ts
import 'reflect-metadata';
import * as fs from 'fs';
import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { AppModule } from './app.module';

async function bootstrap() {
  const uploadsDir = process.env.UPLOADS_DIR || './uploads';
  fs.mkdirSync(uploadsDir, { recursive: true });

  const app = await NestFactory.create(AppModule);

  const isProduction = process.env.NODE_ENV === 'production';
  const corsOriginEnv = process.env.CORS_ORIGIN;
  let corsOrigin: string[] | boolean;
  if (!corsOriginEnv) {
    // Unset CORS_ORIGIN used to silently reflect any origin (origin: true)
    // regardless of environment. Now it only does that outside production —
    // production with no CORS_ORIGIN configured denies cross-origin requests
    // by default instead of reflecting the caller's Origin header.
    corsOrigin = !isProduction;
  } else {
    const origins = corsOriginEnv.split(',').map((o) => o.trim());
    corsOrigin = origins.length === 1 && origins[0] === '*' ? true : origins;
  }
  app.enableCors({ origin: corsOrigin, credentials: true });

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      transform: true,
      forbidNonWhitelisted: false,
    }),
  );

  app.setGlobalPrefix('api');

  const port = process.env.PORT ? Number(process.env.PORT) : 4001;
  await app.listen(port);
  // eslint-disable-next-line no-console
  console.log(`jetflow listening on http://localhost:${port}`);
}

bootstrap();
```

- [ ] **Step 2: Build**

```bash
npm run build:server
```

- [ ] **Step 3: Live-verify both branches**

Production branch (should deny/not reflect):

```bash
$env:NODE_ENV = 'production'
Remove-Item Env:\CORS_ORIGIN -ErrorAction SilentlyContinue
npm run start:prod
```

In another shell:

```bash
curl -sI -H "Origin: http://evil.example.com" http://localhost:4001/api/reference/aircraft | grep -i access-control-allow-origin
```

Expected: no `Access-Control-Allow-Origin` header at all (or a fixed value that isn't `evil.example.com`) — never the reflected attacker origin. Stop the server.

Dev branch (should keep today's permissive behavior — most existing local dev has no `NODE_ENV` set):

```bash
Remove-Item Env:\NODE_ENV -ErrorAction SilentlyContinue
Remove-Item Env:\CORS_ORIGIN -ErrorAction SilentlyContinue
npm run start:prod
```

```bash
curl -sI -H "Origin: http://localhost:5173" http://localhost:4001/api/reference/aircraft | grep -i access-control-allow-origin
```

Expected: `Access-Control-Allow-Origin: http://localhost:5173` (reflected, same as before this change). Stop the server afterward.

---

### Task 7: Rate-limit the public quote endpoint

**Files:**
- Modify: `src/server/modules/quotes/quotes.module.ts`
- Modify: `src/server/modules/quotes/quotes.controller.ts`

**Interfaces:** None (scoped entirely to the `QuotesModule`; does not touch the global guard chain in `AuthModule`).

- [ ] **Step 1: Install the package**

```bash
npm install @nestjs/throttler
```

- [ ] **Step 2: Register module-scoped throttling**

Replace `src/server/modules/quotes/quotes.module.ts` in full:

```ts
import { Module } from '@nestjs/common';
import { ThrottlerModule } from '@nestjs/throttler';
import { QuotesService } from './quotes.service';
import { QuotesController } from './quotes.controller';
import { TripsModule } from '../trips/trips.module';

@Module({
  imports: [
    TripsModule,
    ThrottlerModule.forRoot([{ ttl: 60000, limit: 5 }]),
  ],
  controllers: [QuotesController],
  providers: [QuotesService],
})
export class QuotesModule {}
```

- [ ] **Step 3: Apply the guard**

Replace `src/server/modules/quotes/quotes.controller.ts` in full:

```ts
import { Body, Controller, Post, UseGuards } from '@nestjs/common';
import { ThrottlerGuard } from '@nestjs/throttler';
import { QuotesService } from './quotes.service';
import { CreateQuoteDto } from './dto/create-quote.dto';
import { Public } from '../auth/public.decorator';

@Controller('quotes')
@UseGuards(ThrottlerGuard)
export class QuotesController {
  constructor(private readonly quotes: QuotesService) {}

  @Public()
  @Post()
  submit(@Body() dto: CreateQuoteDto) {
    return this.quotes.submit(dto);
  }
}
```

This limits `POST /api/quotes` to 5 requests per 60 seconds per client IP — matching the security audit's M1 recommendation exactly. It does not affect any other route (`ThrottlerModule.forRoot` is imported inside `QuotesModule`, not `AppModule`, so it is not registered as a global guard).

- [ ] **Step 4: Build**

```bash
npm run build:server
```

- [ ] **Step 5: Live-verify**

Start the server, then fire 6 requests in a tight loop:

```bash
for i in 1 2 3 4 5 6; do
  curl -s -o /dev/null -w "request $i -> %{http_code}\n" -H "Content-Type: application/json" -d '{"client":"Throttle Test","legs":[{"clientLegId":"1","seq":1,"depIcao":"KJFK","arrIcao":"EGLL","etdZ":"2026-09-01T10:00:00Z","etaZ":"2026-09-01T18:00:00Z"}]}' http://localhost:4001/api/quotes
done
```

Expected: requests 1-5 return `201`, request 6 returns `429`. **This creates up to 5 real trips.** Clean them up:

```bash
docker exec jetflow_api_postgres psql -U jetflow -d jetflow -c "DELETE FROM trips WHERE client = 'Throttle Test';"
```

Stop the server afterward.

---

### Task 8: Verify uploaded file type from its actual bytes

**Files:**
- Modify: `src/server/modules/docs/docs.service.ts`

**Interfaces:** None.

- [ ] **Step 1: Install the package (pinned — see Global Constraints)**

```bash
npm install file-type@16.5.4
```

- [ ] **Step 2: Verify magic bytes for the binary formats that have an unambiguous signature**

Plain text has no magic-byte signature to check (any byte sequence is valid "text"), and DOCX detection by content-sniffing can have edge-case false negatives on some producers — both are deliberately left out of this check to avoid regressing the existing, already-verified upload/OCR pipeline for those formats. PDF and every image format in the allowlist have well-known, unambiguous signatures, so this check covers exactly the MIME-confusion scenario the audit described (declaring `image/png` while uploading arbitrary content).

In `src/server/modules/docs/docs.service.ts`, find:

```ts
import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import * as fs from 'fs';
import * as path from 'path';
import type { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { UploadDocDto } from './dto/upload-doc.dto';
import { VerifyDocDto } from './dto/verify-doc.dto';
import { OcrService } from './ocr.service';

const UPLOADS_DIR = process.env.UPLOADS_DIR || './uploads';
const ALLOWED_MIME_TYPES = [
  'application/pdf',
  'image/jpeg',
  'image/png',
  'image/gif',
  'image/tiff',
  'image/bmp',
  'text/plain',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document', // .docx
];
const MAX_FILE_SIZE_BYTES = 20 * 1024 * 1024;
```

Replace with:

```ts
import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import * as fs from 'fs';
import * as path from 'path';
import { fromBuffer } from 'file-type';
import type { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { UploadDocDto } from './dto/upload-doc.dto';
import { VerifyDocDto } from './dto/verify-doc.dto';
import { OcrService } from './ocr.service';

const UPLOADS_DIR = process.env.UPLOADS_DIR || './uploads';
const ALLOWED_MIME_TYPES = [
  'application/pdf',
  'image/jpeg',
  'image/png',
  'image/gif',
  'image/tiff',
  'image/bmp',
  'text/plain',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document', // .docx
];
// Formats with an unambiguous magic-byte signature — checked against the
// actual uploaded bytes, not just the client-declared mimetype. Plain text
// has no signature to check, and DOCX (a zip container) has occasional
// false-negative detections, so both are intentionally excluded here.
const SIGNATURE_VERIFIABLE_MIME_TYPES = new Set([
  'application/pdf', 'image/jpeg', 'image/png', 'image/gif', 'image/tiff', 'image/bmp',
]);
const MAX_FILE_SIZE_BYTES = 20 * 1024 * 1024;
```

Find:

```ts
    if (!ALLOWED_MIME_TYPES.includes(file.mimetype)) {
      throw new BadRequestException(`Unsupported file type: ${file.mimetype}. Allowed: PDF, JPEG, PNG.`);
    }
    if (file.size > MAX_FILE_SIZE_BYTES) {
      throw new BadRequestException('File exceeds the 20MB limit.');
    }
```

Replace with:

```ts
    if (!ALLOWED_MIME_TYPES.includes(file.mimetype)) {
      throw new BadRequestException(`Unsupported file type: ${file.mimetype}. Allowed: PDF, JPEG, PNG.`);
    }
    if (file.size > MAX_FILE_SIZE_BYTES) {
      throw new BadRequestException('File exceeds the 20MB limit.');
    }
    if (SIGNATURE_VERIFIABLE_MIME_TYPES.has(file.mimetype)) {
      const detected = await fromBuffer(file.buffer);
      if (!detected || detected.mime !== file.mimetype) {
        throw new BadRequestException(
          `File content does not match its declared type (${file.mimetype}).`,
        );
      }
    }
```

- [ ] **Step 3: Build**

```bash
npm run build:server
```

- [ ] **Step 4: Live-verify**

Start the server, mint an Admin JWT, then upload a plain-text file mislabeled as PNG:

```bash
echo "not actually a png" > ./tmp-fake.png
curl -s -o /dev/null -w "%{http_code}\n" -H "Authorization: Bearer <JWT>" -F "file=@./tmp-fake.png;type=image/png" -F "tripId=2608001" -F "docType=Other" -F "uploadedBy=admin" http://localhost:4001/api/docs/upload
```

Expected: `400`. Then confirm a real PNG still uploads successfully:

```bash
node -e "require('fs').writeFileSync('./tmp-real.png', Buffer.from('89504e470d0a1a0a0000000d49484452000000010000000108060000001f15c4890000000a4944415478da6360000002000155041c0000000049454e44ae426082', 'hex'))"
curl -s -o /dev/null -w "%{http_code}\n" -H "Authorization: Bearer <JWT>" -F "file=@./tmp-real.png;type=image/png" -F "tripId=2608001" -F "docType=Other" -F "uploadedBy=admin" http://localhost:4001/api/docs/upload
```

Expected: `201`. Delete both test docs afterward via `DELETE /api/docs/:docId` (find their `docId`s from the upload responses), delete the two local temp files (`rm ./tmp-fake.png ./tmp-real.png`), and stop the server.

---

### Task 9: De-emphasize the raw service ID in Admin Dashboard's urgent list

**Files:**
- Modify: `src/client/pages/admin/AdminDashboard.tsx`

**Interfaces:** None.

**Scope note:** the audit also mentioned `TripDetail.tsx`'s "Open Deadlines" cards showing a raw `SVCID` (`TripDetail.tsx:1117`). That instance is intentionally **not** touched by this task — it's already rendered as a small, de-emphasized `text-[10px] font-mono text-muted-foreground` secondary line beneath a human-readable primary label (`serviceLabel(svc.ServiceType)`), which is exactly the treatment the audit's own suggested remedy describes ("keep the raw ID as a tooltip/secondary line if needed"). `AdminDashboard.tsx`'s version was the one showing it as a same-weight inline span next to the primary label with no human-label alternative nearby other than the raw `s.ServiceType` code — that's the actual defect this task fixes.

- [ ] **Step 1: Move the raw SVCID off the visible line, into a tooltip**

Find:

```tsx
                  return (
                    <Link key={s.SVCID} to={`/trips/${s.TripID}`} className="flex items-center justify-between rounded-md border p-3 hover:bg-accent/50 transition-colors">
                      <div className="space-y-1">
                        <div className="flex items-center gap-2">
                          <Badge variant={s.Urgency === 'BREACH' ? 'destructive' : 'default'}>
                            {s.Urgency}
                          </Badge>
                          <span className="font-medium text-sm">{s.ServiceType}</span>
                          <span className="text-xs text-muted-foreground">{s.SVCID}</span>
                        </div>
                        <div className="text-xs text-muted-foreground">
                          Trip: {trip?.TripID} — {trip?.Registration}{country && ` — ${country}`} — Assigned: {s.AssignedTo}
                        </div>
                      </div>
                      <div className="text-xs text-muted-foreground">
                        Required by {s.RequiredByZ.replace('T', ' ').replace('Z', '')}
                      </div>
                    </Link>
                  );
```

Replace with:

```tsx
                  return (
                    <Link key={s.SVCID} to={`/trips/${s.TripID}`} title={s.SVCID} className="flex items-center justify-between rounded-md border p-3 hover:bg-accent/50 transition-colors">
                      <div className="space-y-1">
                        <div className="flex items-center gap-2">
                          <Badge variant={s.Urgency === 'BREACH' ? 'destructive' : 'default'}>
                            {s.Urgency}
                          </Badge>
                          <span className="font-medium text-sm">{s.ServiceType}</span>
                        </div>
                        <div className="text-xs text-muted-foreground">
                          Trip: {trip?.TripID} — {trip?.Registration}{country && ` — ${country}`} — Assigned: {s.AssignedTo}
                        </div>
                      </div>
                      <div className="text-xs text-muted-foreground">
                        Required by {s.RequiredByZ.replace('T', ' ').replace('Z', '')}
                      </div>
                    </Link>
                  );
```

The internal correlation ID (e.g. `LEG-0004-1-FLIGHTPLANNING-ET-1787670722795`) is still available on hover via the native `title` tooltip, for support/debugging purposes, but no longer sits inline in a human-facing list.

- [ ] **Step 2: Build and manually verify**

```bash
npm run build:client
```

Start the server, open `/admin` (Admin Dashboard) as a logged-in user, confirm the "Urgent & Breached Services" rows no longer show a raw ID string inline, and confirm hovering a row shows the ID as a native browser tooltip. Stop the server afterward.

---

### Task 10: Fix Manage Trips' misleading empty default state

**Files:**
- Modify: `src/client/pages/admin/AdminTrips.tsx`

**Interfaces:** None.

- [ ] **Step 1: Make the empty state explain the implicit 72h filter**

Find:

```tsx
          {filteredTrips.length === 0 && (
            <div className="text-center text-sm text-muted-foreground py-8">No trips match</div>
          )}
```

Replace with:

```tsx
          {filteredTrips.length === 0 && (
            <div className="text-center text-sm text-muted-foreground py-8">
              {search.trim()
                ? 'No trips match your search'
                : `0 of ${trips.length} trips have a leg departing in the next 72h — type to search all trips`}
            </div>
          )}
```

- [ ] **Step 2: Build and manually verify**

```bash
npm run build:client
```

Start the server, open `/admin/trips` as a logged-in user on a day where no trip has a leg departing in the next 72 hours. Confirm the empty state now reads `0 of N trips have a leg departing in the next 72h — type to search all trips` instead of the bare, unexplained `No trips match`. Then type a search query that matches nothing and confirm it instead shows `No trips match your search`. Stop the server afterward.

---

### Task 11: Purge leftover QA/test trips and the stray field value

**Files:** None — this is a data operation against the running Postgres container, not an application-code change.

**Interfaces:** None.

- [ ] **Step 1: Confirm the exact rows before touching anything**

```bash
docker exec jetflow_api_postgres psql -U jetflow -d jetflow -c "SELECT trip_id, client, owner, status FROM trips WHERE trip_id IN ('2608005','2608006','2608007','2608008');"
```

Expected: exactly 4 rows —

| trip_id | client | owner |
|---|---|---|
| 2608005 | TEST QA CLIENT LTD | QA TESTER |
| 2608006 | TASK8 QUOTE FINAL | Web Enquiry |
| 2608007 | TASK11 QA TEST CLIENT | Web Enquiry |
| 2608008 | TASK11 WIZARD QA CLIENT | TASK11 QA TESTER |

**Do not delete `2608009` (client "BARAKA")** — it was not flagged by either audit as test data and may be real; leave it untouched.

- [ ] **Step 2: Delete the 4 confirmed QA/test trips**

`Trip`'s Prisma relations to `Leg`/`Stop`/`Service`/`DocAttachment`/`Comm`/`Invoice` are all `onDelete: Cascade` (see `prisma/schema.prisma`), so a direct `DELETE FROM trips` cleanly removes every dependent row at the database level — no separate cleanup needed for legs/services/etc. Any uploaded document *files* those trips had on disk (under `UPLOADS_DIR`) will become orphaned (the DB row is gone, the file is not) — acceptable for disposable QA trips with no real documents; not worth scripting a filesystem walk for this one-time cleanup.

```bash
docker exec jetflow_api_postgres psql -U jetflow -d jetflow -c "DELETE FROM trips WHERE trip_id IN ('2608005','2608006','2608007','2608008');"
```

Expected: `DELETE 4`.

- [ ] **Step 3: Clear the stray Mission Type value on trip 2608001**

```bash
docker exec jetflow_api_postgres psql -U jetflow -d jetflow -c "UPDATE trips SET mission_type = NULL WHERE trip_id = '2608001';"
```

Expected: `UPDATE 1`.

- [ ] **Step 4: Verify**

```bash
docker exec jetflow_api_postgres psql -U jetflow -d jetflow -c "SELECT trip_id FROM trips WHERE trip_id IN ('2608005','2608006','2608007','2608008');"
docker exec jetflow_api_postgres psql -U jetflow -d jetflow -c "SELECT trip_id, mission_type FROM trips WHERE trip_id = '2608001';"
```

Expected: the first query returns 0 rows; the second returns `mission_type` as an empty/NULL value.

---

## Final note for whoever runs the whole-branch review

After all 11 tasks land, do a full `npm run build` from a clean state and a live click-through of: `/admin/billing` as both an Admin and a Coordinator account, the sidebar on any authenticated page, `/admin/trips` on first load, and `/admin` (Admin Dashboard)'s urgent list. These four are the only places this plan changes user-visible behavior; everything else (Tasks 4, 6, 7, 8) is server-side hardening with no UI change to click through.
