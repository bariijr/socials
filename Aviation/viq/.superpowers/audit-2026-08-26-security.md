# VIQ Security Audit — 2026-08-26

Static, read-only code audit of the VIQ trip-management application (NestJS + Prisma/PostgreSQL server, React/Vite client). Scope: authentication/session handling, RBAC, input validation, secrets handling, file upload safety, the public quote-submission endpoint, CORS, and XSS surface. No live traffic was sent; no files were modified.

## Executive Summary

VIQ's core security posture is solid for an internal ops tool with one public-facing form: passwords are bcrypt-hashed, JWTs are signed with an environment-only secret and verified before any route executes, class-validator + Prisma close off the classic injection/mass-assignment vectors, and `.env` is gitignored. The real gaps are authorization *granularity* rather than authentication bypass: several controllers that handle sensitive data (Billing/Invoices in particular) have no `@Roles('Admin')` guard at all — matching a corresponding gap in the client router — so any authenticated Coordinator account can read and write invoices via the API even though the UI implies it's an admin surface. The public `/api/quotes` endpoint has no rate limiting and no upper bound on array/string sizes, making it a low-cost spam/storage-bloat vector. File uploads trust the client-supplied MIME type for both storage-type validation and the `Content-Type` served back on download, which is a narrow but real stored-content risk. Nothing found rises to Critical; findings are High/Medium/Low as detailed below.

---

## High

### H1 — Billing/Invoices has no server-side or route-side Admin gate
- **Files**: `src/server/modules/invoices/invoices.controller.ts:1-34` (zero `@Roles` decorators on any route, including `create`, `update`, `remove`), `src/client/App.tsx:44` (`/admin/billing` route is NOT wrapped in `<RequireRole role="Admin">`, unlike `/admin/settings`, `/admin/users`, `/admin/message-templates` at lines 46/48/49).
- **Description**: Any authenticated non-Viewer user (role `Coordinator`) can list, create, edit, and delete invoices — both through the UI (the nav item and route render for non-admins) and directly via `POST/PATCH/DELETE /api/invoices`. This is inconsistent with the rest of the admin surface, where Settings/Users/Message-Templates are correctly restricted to `Admin` on both the client route and (for message-templates) the server controller.
- **Why it matters**: Billing data (rates, amounts, invoice status) is usually the most sensitive data in an ops tool. A Coordinator account — or anyone who obtains a Coordinator's JWT — can alter financial records with no audit-independent barrier beyond "wasn't supposed to click that."
- **Fix**: Add `@Roles('Admin')` to `InvoicesController` (mirror `UsersController`'s class-level decorator at `users.controller.ts:8`), and wrap the `/admin/billing` route in `<RequireRole role="Admin">` in `App.tsx` for consistency with the other admin-only pages.

---

## Medium

### M1 — Public `/api/quotes` endpoint has no rate limiting or abuse protection
- **Files**: `src/server/modules/quotes/quotes.controller.ts:10-14` (`@Public() @Post()`), `src/server/main.ts` (no `@nestjs/throttler` or equivalent registered anywhere — confirmed via `package.json`, no throttle/rate-limit/helmet dependency present).
- **Description**: `POST /api/quotes` is intentionally unauthenticated (it's the landing-page enquiry form) and creates a full Trip + Legs + Services + Persons in one transaction per call. There is no per-IP or per-window request cap anywhere in the stack.
- **Why it matters**: A scripted flood of POSTs can create unbounded numbers of "Web Enquiry" trips, bloating the database and the new admin "New Enquiries" badge/filter (itself a feature shipped this session) into uselessness. This is a real but low-severity risk for a low-traffic B2B tool — not a Critical DoS, but a nuisance/cost vector worth closing before the landing page gets wider exposure.
- **Fix**: Add `@nestjs/throttler` (or a simple in-memory/Redis token-bucket) scoped to the `quotes` route, e.g. 5 requests/minute/IP. Pair with M2 below.

### M2 — `CreateQuoteDto` has no upper bounds on array sizes or string lengths
- **File**: `src/server/modules/quotes/dto/create-quote.dto.ts` — `legs` has `@ArrayMinSize(1)` (line 107) but no `@ArrayMaxSize`; `services` and `persons` arrays (lines 112-122) have no size cap at all; free-text fields `notes` (line 104), `client` (line 84), `QuoteServiceDto.notes` (line 67) have no `@MaxLength`.
- **Description**: A single public, unauthenticated request could submit a quote with e.g. 10,000 legs or a 10MB `notes` string, since `ValidationPipe`'s `forbidNonWhitelisted: false` (`main.ts:22`) only strips unknown fields — it does not bound the size of accepted ones.
- **Why it matters**: Combined with M1's lack of rate limiting, this turns one HTTP request into a large database write and downstream rendering cost (the trip sheet, admin trip list, etc. all iterate over `legs`/`persons`).
- **Fix**: Add `@ArrayMaxSize(20)` to `legs`/`services`/`persons` (adjust to realistic max trip size) and `@MaxLength(2000)` (or similar) to free-text fields.

### M3 — File upload MIME type is trusted from the client, not verified server-side
- **Files**: `src/server/modules/docs/docs.service.ts:12-22` (`ALLOWED_MIME_TYPES` checked against `file.mimetype` at line 48), `docs.service.ts:71` (the client-supplied `file.mimetype` is stored verbatim as `doc.mimeType`), `docs.controller.ts:28` (`res.setHeader('Content-Type', doc.mimeType)` — the stored, attacker-controlled value is replayed verbatim on download with `Content-Disposition: inline`).
- **Description**: `file.mimetype` is the `Content-Type` header the uploading client chose to send with the multipart form field — it is not derived from the file's actual bytes (no magic-number/signature sniffing, e.g. via `file-type` package). An attacker can upload arbitrary content (e.g. an HTML file containing a `<script>`) while declaring `mimetype: 'text/plain'` or `'image/png'`, and it will pass the allowlist check, be stored, and later be served back with that same attacker-chosen `Content-Type` and `inline` disposition.
- **Why it matters**: This is a narrow but classic "MIME confusion" stored-content risk — the practical exploitability depends on how strictly the viewing browser respects the declared `Content-Type` vs. sniffing actual content, and this app's users are internal/authenticated staff, not the general public, which caps real-world impact. Still worth closing since docs are viewed inline by other staff (`inline; filename=...`).
- **Fix**: Validate the file's actual type server-side from its magic bytes (e.g. `file-type` npm package) rather than trusting `file.mimetype`, or at minimum force `Content-Disposition: attachment` (not `inline`) for any non-PDF/image type, and add `X-Content-Type-Options: nosniff` globally in `main.ts`.

### M4 — CORS reflects any origin and allows credentials when `CORS_ORIGIN` is unset
- **File**: `src/server/main.ts:13-16`.
- **Description**: `corsOrigin` defaults to `'*'` when `CORS_ORIGIN` is not set. The code then does `origin: corsOrigin.length === 1 && corsOrigin[0] === '*' ? true : corsOrigin`. Passing `origin: true` to `@nestjs/core`'s CORS handling makes it **reflect whatever `Origin` header the browser sent** (allow-all-with-reflection), and this is combined with `credentials: true`.
- **Why it matters**: In this app, the JWT lives in `localStorage` and is attached manually via an `Authorization: Bearer` header (confirmed in `jwt-auth.guard.ts:23`) rather than a cookie, so `credentials: true` does not by itself leak the auth token to a malicious origin the way it would for cookie-based sessions — this meaningfully lowers real-world impact. It is still bad practice to combine unbounded origin reflection with `credentials: true`, and if any future feature introduces a cookie (e.g. a "remember me" refresh token) this becomes an actual cross-origin credential leak with no code change required to trigger it.
- **Fix**: Set `CORS_ORIGIN` explicitly in every deployed environment (the `.env.example` already models this correctly at `.env.example:3`) and change the `main.ts` fallback so an unset `CORS_ORIGIN` does **not** silently become `origin: true` — e.g. default to `false`/deny in production and only allow the permissive fallback when `NODE_ENV !== 'production'`.

### M5 — Client-side-only enforcement on Trips/Persons/Legs/Services/Stops/Comms/Person-Ratings controllers
- **Files**: `src/server/modules/trips/trips.controller.ts`, `persons/persons.controller.ts`, `legs/legs.controller.ts`, `services/services.controller.ts`, `stops/stops.controller.ts`, `comms/comms.controller.ts`, `person-ratings/person-ratings.controller.ts` — none carry any `@Roles()` decorator.
- **Description**: These controllers rely entirely on (a) the global `JwtAuthGuard` (must be authenticated) and (b) `RolesGuard`'s blanket rule that blocks any non-GET request from a `Viewer` role (`roles.guard.ts:20-22`). There is no distinction beyond that — any `Coordinator` account can write to any of these resources, and the frontend's `canEdit` checks (`grep` hits in `TripDetail.tsx`, `PersonDetail.tsx`, `ComposerPage.tsx`, etc.) are the only place any finer-grained business rule is enforced.
- **Why it matters**: This appears to be a deliberate, previously-made design decision for this session's leg-scoped crew/pax and reference-data features (Coordinators are expected to manage trip operational data day-to-day, so gating it to Admin-only would break the intended workflow) — it is **not** an oversight in the same way H1 is. Flagging it here because "client hides the button" is not a security boundary: anyone with a valid Coordinator JWT (or a stolen one) can issue raw HTTP requests that bypass any client-side `canEdit` logic entirely. Since Coordinator is the normal operational role, this is a real but low-marginal-risk gap — the same account could already do the equivalent action through the UI.
- **Fix**: No change required if the intended trust model is "any Coordinator can operate on any trip" (which matches how this session designed the features). If finer scoping is later desired (e.g. only trips a Coordinator is assigned to), it must be enforced server-side, not just by hiding UI controls.

---

## Low

### L1 — Uploaded filename is embedded unsanitized in `Content-Disposition`
- **File**: `src/server/modules/docs/docs.controller.ts:29` — `res.setHeader('Content-Disposition', 'inline; filename="${doc.fileName}"')` where `doc.fileName` is the original, attacker-controlled upload filename (`docs.service.ts:69`, `file.originalname`).
- **Description**: A filename containing a `"` character could break out of the quoted filename parameter. Node's HTTP layer rejects raw CR/LF in header values (mitigating classic header injection), but malformed/unexpected `Content-Disposition` parsing in edge-case clients is still possible.
- **Fix**: Sanitize/escape `doc.fileName` (strip or percent-encode `"`, use the `content-disposition` npm package which handles RFC 6266 encoding correctly) before setting the header.

### L2 — Audit trail is readable by all authenticated roles, including Viewer
- **File**: `src/server/modules/audit/audit.controller.ts:8-16` — no `@Roles` restriction, and both routes are `GET`, so even `Viewer` accounts can read the full audit log via `RolesGuard`'s Viewer rule (which only blocks writes).
- **Description**: The audit trail records who changed what, including presumably Coordinator/Admin usernames tied to sensitive actions (billing edits, doc deletions, etc.).
- **Why it matters**: Low severity since this is an internal ops tool and Viewer is already a trusted-but-limited internal role, not an external user — this is an information-disclosure hardening note rather than an exploitable vulnerability.
- **Fix**: If Viewer is meant to be a "read dashboards, not read internals" role, gate `/audit` to `Coordinator`/`Admin` only.

### L3 — `forbidNonWhitelisted: false` silently drops unexpected fields instead of rejecting the request
- **File**: `src/server/main.ts:18-24`.
- **Description**: `whitelist: true` strips properties not declared on the DTO (good — this is what prevents Prisma mass-assignment via extra JSON fields), but `forbidNonWhitelisted: false` means a client sending unexpected extra fields gets a silently-trimmed request instead of a `400`. This is a hardening/debuggability note, not a vulnerability — `whitelist: true` alone already closes the actual injection/mass-assignment risk.
- **Fix**: Consider `forbidNonWhitelisted: true` in a non-production/staging environment to catch client/server drift early; leaving it `false` in production to avoid breaking older clients on a field rename is a defensible tradeoff.

---

## Info

### I1 — JWT has no refresh/rotation mechanism; 12h expiry is a fixed session lifetime
- **File**: `src/server/modules/auth/auth.module.ts:16` (`expiresIn: '12h'`).
- **Note**: There is no logout-side token invalidation (JWTs are stateless) and no refresh-token flow — a leaked token remains valid for up to 12 hours with no way to revoke it server-side. Reasonable for an internal tool at this scale; worth a denylist/short-lived-token+refresh design only if the threat model changes (e.g. shared/kiosk devices).

### I2 — `dangerouslySetInnerHTML` usage is safe (not user-input-driven)
- **File**: `src/client/components/ui/chart.tsx:83-99`.
- **Note**: The only `dangerouslySetInnerHTML` in the client codebase is shadcn/ui's standard chart-theming boilerplate, which injects CSS custom-property declarations built from a developer-supplied `ChartConfig` object (color/theme values defined in code, not end-user input). Confirmed not exploitable.

---

## Already Handled Well

- **Password storage**: bcrypt with cost factor 10 (`users.service.ts:21,35`), minimum 8-character policy enforced via `class-validator` (`create-user.dto.ts:10`, `update-user.dto.ts:16`). Generic `'Invalid credentials'` error on both wrong-username and wrong-password (`auth.service.ts:16,21`) — no username enumeration.
- **JWT secret**: read only from `process.env.JWT_SECRET` (`auth.module.ts:15`) with **no hardcoded fallback** — if `.env` is missing, `jsonwebtoken` fails closed (signing throws) rather than silently using a known/weak default secret.
- **Guard ordering**: `JwtAuthGuard` is registered before `RolesGuard` in `APP_GUARD` providers (`auth.module.ts:25-26`), and NestJS's `APP_GUARD` array runs in registration order — so an unauthenticated request is rejected by `JwtAuthGuard` before `RolesGuard`'s role logic ever runs. No bypass path found.
- **`@Public()` audit**: only three routes are public — `POST /auth/login` (must be, it's how you get a token), `POST /quotes` (the intentional unauthenticated landing-page enquiry form), and `GET /legs/compute-overflight` (a stateless geo-computation helper with no data-store side effects and no evident sensitive-data leak — reasonable to be public, used by the same landing page before a trip exists).
- **SQL injection**: no `$queryRaw`/`$executeRaw` usage anywhere in the codebase — 100% of database access goes through Prisma's parameterized query builder, which closes off classic SQL injection by construction.
- **Secrets hygiene**: `.env` is gitignored (`.gitignore:3`) alongside `node_modules/`, `dist/`, `uploads/`; `.env.example` correctly ships only placeholder values (`replace-with-a-long-random-secret`, etc.), never real secrets. No hardcoded API keys, passwords, or tokens found anywhere in `src/` via pattern search.
- **XSS**: React's default JSX escaping is relied on throughout the client; the one `dangerouslySetInnerHTML` call site is non-user-controlled (see I2).
- **File upload**: server-side allowlist of MIME types and a 20MB size cap are enforced in `docs.service.ts` (not just a client `accept=` attribute) — the only refinement needed is validating actual file signatures rather than the declared `Content-Type` (see M3).
- **Path traversal**: uploaded files are stored under a server-generated `docId`-derived filename (`docs.service.ts:55-57`), never the client-supplied original name — eliminates path-traversal-via-filename entirely.
- **RBAC for the two Admin-only feature areas that matter most for account/config takeover**: Users (`users.controller.ts:8`, class-level `@Roles('Admin')`) and Reference Data writes (`reference.controller.ts`, every mutating route individually decorated) are correctly restricted, both server-side and (for Users/Settings/Message-Templates) client-route-side.
