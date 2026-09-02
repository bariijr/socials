# VIQ Auth — Minimal Stub (Sub-project 1 of 6)

## Context

VIQ (`Aviation/kimiactuate/viq/`) has a complete NestJS + Prisma + PostgreSQL
backend and a React/Vite admin UI, but the frontend (`src/client/lib/dataStore.ts`)
is still 100% localStorage — it makes zero `fetch()` calls to the API. No
route in the API requires authentication today.

This is sub-project 1 of a 6-part plan to close that gap:

1. **Auth (this spec)** — minimal login, unblocks everything behind it.
2. Frontend → API rewire (`dataStore.ts` from localStorage to `fetch`).
3. LEG REGISTER / TripDetail UX audit against the originally requested
   feature list, once data is real.
4. True FIR polygon boundaries (replacing the centroid approximation).
5. Real SMTP sending in `ComposerPage.tsx` / "Send & Log".
6. Cleanup: remove stray unused files (e.g. `PartyRolePicker.tsx` sitting in
   the sibling `Jetelio_v3` tree) and bring `README.md` / `ARCHITECTURE.md`
   back in line with actual behavior.

Per explicit user instruction: **do not `git commit` any of this work** —
everything is staged in the working tree for local preview only.

## Goal

A single hardcoded admin credential (`admin` / `Admin123!`) gates the
NestJS API and the React admin shell. No roles, no user table, no refresh
tokens — those are explicitly deferred to a later "full pattern" pass if the
project ever needs it (matches this repo's usual JWT+roles admin/ops/readonly
pattern, but that's out of scope here).

## Backend

New module: `src/server/modules/auth/`

- `auth.controller.ts` — `POST /auth/login` (mounted under the global `/api`
  prefix). Body: `{ username: string, password: string }`.
  - Success: `200 { accessToken: string, user: { username: 'admin', role: 'admin' } }`.
  - Failure (bad username or password): `401`.
- `auth.service.ts` — validates `username === process.env.ADMIN_USERNAME`
  and `bcrypt.compare(password, process.env.ADMIN_PASSWORD_HASH)`. Issues a
  JWT signed with `process.env.JWT_SECRET`, 12h expiry, payload
  `{ sub: 'admin', role: 'admin' }`.
- `jwt-auth.guard.ts` — verifies `Authorization: Bearer <token>`, rejects
  missing/invalid/expired tokens with `401`.
- `public.decorator.ts` — `@Public()` metadata marker.
- Register the guard globally via `APP_GUARD` in `app.module.ts` so every
  `/api/*` route requires a valid token **unless** annotated `@Public()`.
- Mark `@Public()` on:
  - `AuthController.login`
  - `QuotesController.create` (`POST /quotes`) — the public quote tool from
    `LandingPage.tsx` must stay reachable without login once it's wired to
    the API in sub-project 2.

No other routes are exempted. Reference-data GETs, trips, legs, services,
etc. all require the token.

## Frontend

- New `src/client/pages/LoginPage.tsx` — username/password form, `POST`s to
  `/api/auth/login`. On success, stores the JWT under `localStorage` key
  `viq_auth_token` and the username under `viq_auth_user`.
- New `src/client/lib/authContext.tsx` (or equivalent) — exposes
  `{ token, user, login(), logout() }` to the app; reads the stored token on
  boot.
- Router guard around the admin app shell: if there's no valid token,
  redirect to `/login`. `LandingPage.tsx` (public quote tool) remains
  reachable without a token.
- A logout control in the admin shell header (clears `localStorage`, redirects
  to `/login`).
- `src/client/lib/apiClient.ts` (new, small) — a `fetch` wrapper that reads
  `viq_auth_token` and attaches `Authorization: Bearer <token>`. Not consumed
  by `dataStore.ts` yet (that's sub-project 2) — this sub-project only needs
  it for the login call itself and to be ready for the rewire.

## Config

Add to `.env` and `.env.example`:

```
JWT_SECRET=<random 32+ byte value, generated during setup, not committed as a real secret in .env.example>
ADMIN_USERNAME=admin
ADMIN_PASSWORD_HASH=<bcrypt hash of "Admin123!", generated via a one-off script/CLI at setup time>
```

`.env.example` gets placeholder values, never the real hash/secret.

## Testing

Manual verification (no test framework changes needed for this stub):

```powershell
npm run build
npm run start:prod
# 1. Login with correct credentials -> 200 + token
Invoke-WebRequest -Method POST http://localhost:4001/api/auth/login -Body (@{username='admin';password='Admin123!'} | ConvertTo-Json) -ContentType 'application/json'
# 2. Login with wrong password -> 401
Invoke-WebRequest -Method POST http://localhost:4001/api/auth/login -Body (@{username='admin';password='wrong'} | ConvertTo-Json) -ContentType 'application/json'
# 3. Protected route with no token -> 401
Invoke-WebRequest http://localhost:4001/api/reference/aircraft
# 4. Protected route with valid token -> 200
Invoke-WebRequest http://localhost:4001/api/reference/aircraft -Headers @{Authorization = "Bearer <token from step 1>"}
```

Browser check: visiting the admin app with no token redirects to `/login`;
logging in redirects into the app; logout clears the session and redirects
back to `/login`; the public landing/quote page loads without a token.

## Out of scope

Roles (admin/ops/readonly), a real `User`/`Person`-backed login table,
password reset, refresh tokens, session revocation. These belong to a future
"full pattern" auth pass, not this stub.

## Do not

- Do not `git commit` (working-tree only, per explicit instruction).
- Do not touch `dataStore.ts`'s localStorage read/write logic — that's
  sub-project 2.
- Do not add roles or a user table "while we're in here" — explicitly
  deferred.
