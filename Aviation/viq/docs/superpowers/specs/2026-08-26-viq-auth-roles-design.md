# VIQ Multi-User Auth with Roles

## Context

VIQ has exactly one identity today: `ADMIN_USERNAME`/`ADMIN_PASSWORD_HASH` in
`.env`, checked directly by `AuthService.login`, with `role: 'admin'`
hardcoded into every issued JWT. `JwtAuthGuard` (registered globally via
`APP_GUARD`) only checks "is there a valid bearer token" — there is no role
concept anywhere in the request pipeline, and no second user could ever log
in.

**A real, separate bug found during investigation**: every `dataStore.ts`
mutation function (`saveTrip`, `saveLeg`, `savePerson`, `saveService`, etc.)
takes a `user = 'SYSTEM'` default parameter used for audit attribution
(`AuditService.log(user, ...)` on the backend). Almost no call site in any
page ever passes a real value — a full-repo search found exactly three
explicit `'SYSTEM'` literals (`BillingPage.tsx`, `PersonDetail.tsx`,
`TripDetail.tsx`); everything else relies on the default. **The audit trail
today always says "SYSTEM," never the actual logged-in person**, even though
`useAuth().user.username` has been available client-side since the auth
slice shipped — nothing was ever wired to use it. This spec fixes that as
part of adding real identities.

Confirmed with the user during brainstorming:

- **Three roles**: Admin, Coordinator, Viewer.
- **Admin** manages: user accounts, reference data (aircraft/providers/
  airports/countries/operators/country fees), the service-type catalog,
  and message templates.
- **Coordinator**: everyday trip/leg/service/comms/roster work — everything
  a user does today.
- **Viewer**: read-only everywhere.
- **Account management**: admin-only creation via a new `/admin/users`
  page (no self-signup) — same shape as `AdminAssets.tsx`'s other tabs.
- **Audit attribution**: frontend-supplied (the logged-in user's own
  claimed identity), not re-derived server-side from the JWT on every
  mutation. This app is a single internal operations team, not a
  multi-tenant or adversarial context — the cheap fix (send the real
  username instead of `'SYSTEM'`) closes the actual bug; a fully
  spoof-proof audit trail (deriving `user` server-side via a
  `@CurrentUser()` decorator on every one of ~14 mutating controllers) was
  considered and explicitly deferred as disproportionate to the risk here.
- **Viewer UI enforcement**: full sweep this round — Viewer accounts should
  never see an Edit/Add/Delete/Save control that would just 403, not only
  be blocked server-side.

## Goal

Real per-person login backed by a `User` table, three enforced roles,
admin-only user management, and an audit trail that records who actually
did something.

## Design decisions

- **`User` is a new, minimal Prisma model** — no profile fields beyond what
  auth needs (username, password hash, role, active). Anything richer
  (display name, email) can follow later; nothing today needs it.
- **The current `.env` admin becomes the seeded first Admin user, not a
  parallel auth path.** `prisma/seed.ts` inserts a `User` row using
  `ADMIN_USERNAME`/`ADMIN_PASSWORD_HASH` verbatim — the value already *is*
  a bcrypt hash, so no new password is needed and today's login keeps
  working unchanged after migration. `AuthService` stops reading those env
  vars at runtime once this ships; they become seed-time-only.
- **Soft-deactivate only, no delete** — `User.active`, matching this
  project's established pattern for `ServiceTypeDef` and others. Deleting a
  user row would orphan every audit entry and `AssignedTo`/`user` string
  that references their username; deactivating just blocks future logins.
- **Two independent role checks, not a permission matrix.** `RolesGuard`
  enforces exactly two rules: (1) any non-`GET` request from a `Viewer`
  is rejected, (2) routes explicitly tagged `@Roles('Admin')` reject
  anyone who isn't Admin. Everything else (the entire trip/leg/service/
  comms/docs/persons/invoices surface) requires no tag — Coordinator and
  Admin both pass by default once rule (1) clears. This avoids hand-listing
  every Coordinator-permitted route (the much larger set) and only requires
  tagging the smaller Admin-only set.
- **`/admin/assets` is not split into two pages.** It mixes true admin
  config (Aircraft/Vendors/Airports/Countries/Operators/Fees tabs) with
  everyday roster management (Persons/Expiry tabs) in one tabbed page.
  Splitting that apart is an unrelated restructuring this spec doesn't take
  on. Instead, gating happens at the control level within the page: the six
  reference-data tabs' Add/Edit/Delete buttons check `isAdmin`; the
  Persons/Expiry tabs' controls check `canEdit` (Coordinator-usable).
- **Route-level gating for the pages that are wholly admin-config**:
  `/admin/message-templates`, `/admin/settings`, and the new `/admin/users`
  become inaccessible (nav hidden, route guarded) to non-Admins. `/admin`,
  `/admin/trips`, `/admin/assets`, `/admin/billing` stay open to
  Coordinator+Admin — all four are everyday-work surfaces despite the
  `/admin` URL prefix (that prefix has always meant "back-office page," not
  "admin-role-only," confirmed by reading `AdminTrips.tsx`, which is
  ordinary trip/leg/service management, not configuration).
- **The Viewer sweep reuses each page's existing edit-toggle pattern
  rather than adding new state.** `TripDetail.tsx`'s `TripInfoEditor` and
  `LegEditor`, and `PersonDetail.tsx`'s `BiodataCard`/`MedicalCard`, already
  gate their entire body behind a local `editing` boolean flipped by one
  "EDIT" button — every nested control already checks `editing`/`disabled`.
  Gating just that one entry-point button with `canEdit` cascades correctly
  through everything already built; no per-field changes needed in those
  four components. Components with no single toggle (`AdminAssets.tsx`'s
  Add/Edit/Delete icon buttons, `PersonDetail.tsx`'s `RatingsCard`/
  `AssignedTripsCard`/`DocsCard`, `BillingPage.tsx`'s status buttons,
  `ComposerPage.tsx`/`ComposeDrawer.tsx`'s send buttons, `ReferencePage.tsx`'s
  Service Types tab) need their own `canEdit`/`isAdmin` conditionals added
  directly.

## Backend

### `User` Prisma model

```prisma
model User {
  id           String   @id @default(cuid())
  username     String   @unique
  passwordHash String   @map("password_hash")
  role         String   // 'Admin' | 'Coordinator' | 'Viewer'
  active       Boolean  @default(true)
  createdAt    DateTime @default(now()) @map("created_at")

  @@map("users")
}
```

Migration via `npm run prisma:migrate -- --name add_users`.

### Seed

`prisma/seed.ts` gains, after its existing upserts:

```typescript
await prisma.user.upsert({
  where: { username: process.env.ADMIN_USERNAME! },
  update: {},
  create: {
    username: process.env.ADMIN_USERNAME!,
    passwordHash: process.env.ADMIN_PASSWORD_HASH!,
    role: 'Admin',
  },
});
```

### `AuthService` rework

```typescript
async login(username: string, password: string) {
  const user = await this.prisma.user.findUnique({ where: { username } });
  if (!user || !user.active) throw new UnauthorizedException('Invalid credentials');

  const matches = await bcrypt.compare(password, user.passwordHash);
  if (!matches) throw new UnauthorizedException('Invalid credentials');

  const accessToken = this.jwtService.sign({ sub: user.id, username: user.username, role: user.role });
  return { accessToken, user: { username: user.username, role: user.role } };
}
```

`AuthModule` needs `PrismaModule` added to its `imports`.

### `RolesGuard` + `@Roles` decorator

`src/server/modules/auth/roles.decorator.ts`:

```typescript
import { SetMetadata } from '@nestjs/common';
export const ROLES_KEY = 'roles';
export const Roles = (...roles: string[]) => SetMetadata(ROLES_KEY, roles);
```

`src/server/modules/auth/roles.guard.ts`:

```typescript
import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { IS_PUBLIC_KEY } from './public.decorator';
import { ROLES_KEY } from './roles.decorator';

@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(), context.getClass(),
    ]);
    if (isPublic) return true;

    const request = context.switchToHttp().getRequest();
    const role: string | undefined = request.user?.role;

    if (request.method !== 'GET' && role === 'Viewer') {
      throw new ForbiddenException('Viewer accounts are read-only');
    }

    const requiredRoles = this.reflector.getAllAndOverride<string[]>(ROLES_KEY, [
      context.getHandler(), context.getClass(),
    ]);
    if (requiredRoles && !requiredRoles.includes(role || '')) {
      throw new ForbiddenException(`Requires role: ${requiredRoles.join(', ')}`);
    }

    return true;
  }
}
```

Registered in `auth.module.ts` as a second global guard, after
`JwtAuthGuard` (so `request.user` is already populated):

```typescript
providers: [
  AuthService,
  JwtAuthGuard,
  RolesGuard,
  { provide: APP_GUARD, useClass: JwtAuthGuard },
  { provide: APP_GUARD, useClass: RolesGuard },
],
```

### `@Roles('Admin')` applied to

- New `UsersController` (every route).
- `ReferenceController`: the write routes only (`POST`/`PATCH`/`DELETE` on
  countries, airports, aircraft, operators, providers, country-fees) — its
  `GET` routes stay unrestricted, same as today.
- `ServiceTypesController`: `POST`/`PATCH`.
- `MessageTemplatesController`: `POST`/`PATCH`/`DELETE`.

Everything else (Trips/Legs/Stops/Services/Comms/Docs/Persons/
PersonRatings/Invoices/Quotes/Audit) gets no `@Roles` tag — Coordinator and
Admin both pass once the blanket Viewer-write check clears.

### New `UsersModule`

`src/server/modules/users/` — `users.module.ts`, `users.controller.ts`,
`users.service.ts`, `dto/create-user.dto.ts` (`username`, `password`,
`role`), `dto/update-user.dto.ts` (`role?`, `active?`, `password?` —
re-hashed if provided). Routes, all `@Roles('Admin')`:

- `GET /users` — list (never returns `passwordHash`).
- `POST /users` — create; hashes `password` with bcrypt before storing.
- `PATCH /users/:id` — update role/active, or reset password (re-hash if
  `password` provided).

No `DELETE` route — deactivate via `PATCH { active: false }`.

Register in `app.module.ts`.

## Frontend

### `dataStore.ts`

```typescript
function currentUser(): string {
  try {
    const raw = localStorage.getItem('viq_auth_user');
    return raw ? (JSON.parse(raw).username as string) : 'SYSTEM';
  } catch {
    return 'SYSTEM';
  }
}
```

Every mutation function's `user = 'SYSTEM'` default parameter becomes
`user = currentUser()`. Default parameters evaluate at call time, so each
call re-reads whoever is currently logged in — no call site needs to
change. The three explicit `'SYSTEM'` literal call sites
(`BillingPage.tsx`, `PersonDetail.tsx`, `TripDetail.tsx`) drop that literal
argument so the new default applies.

New functions for the Users admin page, same async/API-backed shape as
every other resource:

```typescript
export async function getUsers(): Promise<AppUser[]> {
  return apiJson<AppUser[]>('/users');
}
export async function saveUser(user: { id?: string; username: string; password?: string; role: string; active?: boolean }): Promise<AppUser> {
  const body = JSON.stringify(user);
  return user.id
    ? apiJson<AppUser>(`/users/${user.id}`, { method: 'PATCH', body })
    : apiJson<AppUser>('/users', { method: 'POST', body });
}
```

`AppUser` (new, in `data/types.ts`): `{ id: string; username: string; role: 'Admin' | 'Coordinator' | 'Viewer'; active: boolean; createdAt: string }`.

### `authContext.tsx`

`AuthContextValue` gains two derived booleans, computed from `user?.role`:

```typescript
canEdit: user?.role !== 'Viewer',
isAdmin: user?.role === 'Admin',
```

### `RequireRole.tsx` (new, alongside `RequireAuth.tsx`)

```tsx
export default function RequireRole({ role, children }: { role: string; children: ReactNode }) {
  const { user } = useAuth();
  if (user?.role !== role) return <Navigate to="/" replace />;
  return <>{children}</>;
}
```

`App.tsx` wraps the `/admin/message-templates`, `/admin/settings`, and new
`/admin/users` routes: `<RequireRole role="Admin"><MessageTemplatesPage /></RequireRole>` (etc).

### `Layout.tsx`

`adminItems` gains a `{ path: '/admin/users', label: 'Users', icon: Users }`
entry. The nav list filters out `/admin/message-templates`, `/admin/settings`,
and `/admin/users` when `!isAdmin` before rendering `NavSection`.

### Viewer sweep (`canEdit`)

- `TripDetail.tsx`: `TripInfoEditor`'s and `LegEditor`'s "EDIT" button —
  `disabled={!canEdit}` (or hidden) — cascades through every nested
  control already gated on `editing`.
- `PersonDetail.tsx`: `BiodataCard`/`MedicalCard`'s "EDIT" button, same
  cascade. `RatingsCard`'s "ADD RATING" + row EDIT/DELETE,
  `AssignedTripsCard`'s "ASSIGN TO TRIP" + row UNASSIGN, `DocsCard`'s
  upload/OCR/verify/delete controls — each gated individually with
  `canEdit &&`.
- `AdminAssets.tsx`: Persons/Expiry tabs' Add/Edit/Delete — `canEdit`.
  Aircraft/Vendors/Airports/Countries/Operators/Fees tabs' Add/Edit/Delete
  — `isAdmin` (stricter than `canEdit`, per the Admin-only backend rule
  for these).
- `BillingPage.tsx`: status-change buttons, "Generate Invoice" — `canEdit`.
- `ComposerPage.tsx`/`ComposeDrawer.tsx`: send controls — `canEdit`.
- `ReferencePage.tsx`: Service Types tab's add/edit/deactivate controls —
  `isAdmin`.
- `AdminTrips.tsx`: its own leg/service save controls (separate from
  `TripDetail.tsx`'s) — `canEdit`. Its "New Trip" button (which navigates
  to `/admin/trips/new`) — `canEdit`.
- `NewTripWizard.tsx`: final "Create Trip" submit — `canEdit` (reaching the
  wizard itself is harmless if the entry button above is hidden, but the
  submit is gated too as defense in depth).

`DocVerifyDialog.tsx` needs no separate gating — every button that opens it
(`DocsCard`'s VERIFY/RE-VERIFY) is already covered above, so a Viewer never
reaches it. `MessageTemplatesPage.tsx` and `AdminSettings.tsx` need no
in-page changes — the route guard already keeps non-Admins out entirely.

### New `/admin/users` page (`UsersPage.tsx`)

Same shape as `AdminAssets.tsx`'s other tabs: a list (username, role badge,
active/inactive), an "Add User" button opening a dialog (username,
temporary password, role), and per-row Edit (role/active toggle/reset
password) — no delete, `active` toggle only.

## Testing

No test framework in this project — manual verification, same pattern as
every prior slice:

```powershell
npm run build
npm run start:prod
# 1. Log in with the existing admin credentials — confirm they still work
#    unchanged (proves the seed correctly carried over the .env hash).
# 2. GET /api/users (as Admin) — confirm the seeded admin row appears,
#    passwordHash is never in the response.
# 3. Create a Coordinator user via /admin/users, log in as them in a
#    different session — confirm they can create/edit a trip/leg/service
#    (audit entry shows their real username, not SYSTEM) but /admin/users,
#    /admin/settings, /admin/message-templates are gone from nav and
#    redirect if visited directly; confirm Admin-only reference-data
#    Add/Edit/Delete buttons are gone on /admin/assets' Aircraft tab but
#    Persons tab's Add Person still works.
# 4. Create a Viewer user, log in as them — confirm every Edit/Add/Delete/
#    Save control across Trips, Persons, Billing, Composer is gone/disabled;
#    confirm a direct API POST/PATCH/DELETE call still 403s even if a
#    button were somehow clicked (backend is the real gate).
# 5. Deactivate a user via PATCH active=false — confirm their next login
#    attempt fails, and their existing JWT (if not yet expired) still
#    reaches RolesGuard's checks correctly (active status isn't currently
#    re-checked per-request, only at login — see "Out of scope" below).
```

## Out of scope

- Per-request re-validation of `User.active` against the database on every
  guarded request (only checked at login time). A deactivated user's
  existing token remains valid until it expires (max 12h, matching the
  existing `JwtModule` `expiresIn`). Real-time revocation would need a
  token blocklist or a DB lookup per request — disproportionate for a
  12-hour window on an internal tool.
- Self-service password change/reset ("forgot password" flow, changing
  your own password while logged in). Admin resets a user's password via
  `/admin/users` if needed.
- Server-derived (JWT-sourced) audit attribution — see "Audit attribution"
  design decision above; explicitly deferred.
- Splitting `AdminAssets.tsx` into separate admin-config and roster pages.
- Any change to `JwtModule`'s 12-hour token expiry.
- Profile fields beyond username/role/active (display name, email, etc.).

## Do not

- Do not remove `ADMIN_USERNAME`/`ADMIN_PASSWORD_HASH` from `.env.example`
  — they're still read once, by the seed script.
- Do not make `User.role` a Prisma enum — stays an app-level-constrained
  string, matching this project's established pattern for every comparable
  field (`Service.status`, `ServiceTypeDef.category`, etc.).
- Do not add a hard-delete route for users — soft-deactivate only.
- Do not re-derive `user` server-side from the JWT on mutations in this
  slice — that's the deferred "spoof-proof" approach, not this one.
