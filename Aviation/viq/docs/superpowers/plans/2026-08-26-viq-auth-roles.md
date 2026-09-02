# VIQ Multi-User Auth with Roles Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the single hardcoded `.env` admin with a real `User` table, three enforced roles (Admin/Coordinator/Viewer), admin-only user management, and an audit trail that records who actually did something instead of always "SYSTEM".

**Architecture:** A new Prisma `User` model backs login; `AuthService` looks it up instead of reading env vars. A second global Nest guard (`RolesGuard`, alongside the existing `JwtAuthGuard`) enforces two rules: Viewers can't write anything, and routes tagged `@Roles('Admin')` reject non-Admins. On the frontend, `authContext.tsx` exposes `canEdit`/`isAdmin` booleans derived from the JWT's role claim; every page's existing edit-toggle/button pattern gets wrapped with one of these two checks. `dataStore.ts`'s `user = 'SYSTEM'` default parameters become `user = currentUser()`, reading the already-logged-in username from `localStorage`.

**Tech Stack:** No new dependencies — reuses `bcryptjs` (already used by `AuthService`), `@nestjs/jwt`, `class-validator`, and this project's established async/API-backed `dataStore.ts` pattern.

**Spec:** `docs/superpowers/specs/2026-08-26-viq-auth-roles-design.md`

## Global Constraints

- No test framework in this project — every task verifies via `npm run build` and, where noted, a manual browser/API check. Do not introduce a test framework.
- `dataStore.ts` has `// @ts-nocheck`. Every other file touched in this plan (backend controllers/services/DTOs, `authContext.tsx`, `Layout.tsx`, `App.tsx`, page components) does NOT — real type-checking applies.
- `User.role` stays a plain `String` column — do not make it a Prisma enum (matches `Service.status`, `ServiceTypeDef.category`, etc.).
- No hard-delete route for users — soft-deactivate only (`active: false`).
- Do not re-derive `user` server-side from the JWT on mutations — audit attribution stays frontend-supplied (`currentUser()`), per the spec's explicit decision.
- This project is not tracked by git (`viq/` is untracked in the parent repo) — no commit steps in this plan.

---

### Task 1: Backend — `User` Prisma model, migration, seed

**Files:**
- Modify: `prisma/schema.prisma`
- Modify: `prisma/seed.ts`
- Create: a new Prisma migration (via `npm run prisma:migrate -- --name add_users`)

**Interfaces:**
- Produces: `User` Prisma model (`id`, `username`, `passwordHash`, `role`, `active`, `createdAt`), queryable via `prisma.user`.

- [ ] **Step 1: Add the `User` model**

Append to the end of `prisma/schema.prisma`:

```prisma
model User {
  id           String   @id @default(cuid())
  username     String   @unique
  passwordHash String   @map("password_hash")
  role         String
  active       Boolean  @default(true)
  createdAt    DateTime @default(now()) @map("created_at")

  @@map("users")
}
```

- [ ] **Step 2: Generate and apply the migration**

Run: `npm run prisma:migrate -- --name add_users`

This is a purely additive migration (one new table) — no data-preservation concerns, unlike prior slices' migrations. Confirm the migration applies cleanly against the running Postgres container (`docker compose ps` should show `postgres` healthy first).

- [ ] **Step 3: Seed the current `.env` admin as the first Admin user**

Open `prisma/seed.ts`. Find its existing upsert calls (one per reference table) and add, near the end of the seeding function, after the other upserts:

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

Match the exact `prisma.<model>.upsert(...)` call style already used for the other seeded resources in this file (read a neighboring upsert call first to match indentation/logging conventions if the file logs progress per resource).

- [ ] **Step 4: Run the seed script and verify**

Run: `npx ts-node prisma/seed.ts`

Then verify directly against Postgres:

```powershell
docker exec -it jetflow_api_postgres psql -U jetflow -d jetflow -c "SELECT username, role, active FROM users;"
```

Expected: one row, `username` matching `.env`'s `ADMIN_USERNAME`, `role = 'Admin'`, `active = true`.

- [ ] **Step 5: Verify — build**

Run: `npm run build`
Expected: exits 0 (this only touches the schema/seed script, not compiled code, but `prisma generate` runs as part of `build:server` and must succeed against the new model).

---

### Task 2: Backend — `AuthService` rework, `RolesGuard`, `@Roles` decorator

**Files:**
- Modify: `src/server/modules/auth/auth.service.ts`
- Modify: `src/server/modules/auth/auth.module.ts`
- Create: `src/server/modules/auth/roles.decorator.ts`
- Create: `src/server/modules/auth/roles.guard.ts`

**Interfaces:**
- Consumes: `PrismaService` (from `src/server/prisma/prisma.service.ts`, already used by every other service in this codebase — import it the same way `TripsService` etc. do).
- Produces: `Roles(...roles: string[])` decorator; `RolesGuard` (registered globally). JWT payload shape becomes `{ sub: string; username: string; role: string }`. Login response shape becomes `{ accessToken: string; user: { username: string; role: string } }` (unchanged shape from today — only `role`'s value source changes, from hardcoded `'admin'` to the real `User.role`).

- [ ] **Step 1: Rewrite `auth.service.ts`**

Replace the full contents of `src/server/modules/auth/auth.service.ts`:

```typescript
import { Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcryptjs';
import { PrismaService } from '../../prisma/prisma.service';

@Injectable()
export class AuthService {
  constructor(
    private readonly jwtService: JwtService,
    private readonly prisma: PrismaService,
  ) {}

  async login(username: string, password: string) {
    const user = await this.prisma.user.findUnique({ where: { username } });
    if (!user || !user.active) {
      throw new UnauthorizedException('Invalid credentials');
    }

    const matches = await bcrypt.compare(password, user.passwordHash);
    if (!matches) {
      throw new UnauthorizedException('Invalid credentials');
    }

    const accessToken = this.jwtService.sign({ sub: user.id, username: user.username, role: user.role });
    return { accessToken, user: { username: user.username, role: user.role } };
  }
}
```

- [ ] **Step 2: Create the `@Roles` decorator**

Create `src/server/modules/auth/roles.decorator.ts`:

```typescript
import { SetMetadata } from '@nestjs/common';

export const ROLES_KEY = 'roles';
export const Roles = (...roles: string[]) => SetMetadata(ROLES_KEY, roles);
```

- [ ] **Step 3: Create `RolesGuard`**

Create `src/server/modules/auth/roles.guard.ts`:

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
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) return true;

    const request = context.switchToHttp().getRequest();
    const role: string | undefined = request.user?.role;

    if (request.method !== 'GET' && role === 'Viewer') {
      throw new ForbiddenException('Viewer accounts are read-only');
    }

    const requiredRoles = this.reflector.getAllAndOverride<string[]>(ROLES_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (requiredRoles && !requiredRoles.includes(role || '')) {
      throw new ForbiddenException(`Requires role: ${requiredRoles.join(', ')}`);
    }

    return true;
  }
}
```

- [ ] **Step 4: Register `PrismaModule`, `RolesGuard` in `auth.module.ts`**

Replace the full contents of `src/server/modules/auth/auth.module.ts`:

```typescript
import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { JwtModule } from '@nestjs/jwt';
import { PrismaModule } from '../../prisma/prisma.module';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { JwtAuthGuard } from './jwt-auth.guard';
import { RolesGuard } from './roles.guard';

@Module({
  imports: [
    PrismaModule,
    JwtModule.registerAsync({
      useFactory: () => ({
        secret: process.env.JWT_SECRET,
        signOptions: { expiresIn: '12h' },
      }),
    }),
  ],
  controllers: [AuthController],
  providers: [
    AuthService,
    JwtAuthGuard,
    RolesGuard,
    { provide: APP_GUARD, useClass: JwtAuthGuard },
    { provide: APP_GUARD, useClass: RolesGuard },
  ],
})
export class AuthModule {}
```

The order matters: `JwtAuthGuard`'s `APP_GUARD` entry must come before `RolesGuard`'s, so `request.user` is populated by the time `RolesGuard` reads it (Nest runs multiple `APP_GUARD` providers in registration order).

- [ ] **Step 5: Verify — build**

Run: `npm run build`
Expected: exits 0. If `PrismaModule`'s import path is wrong, this is where it surfaces — confirm the relative path matches how `src/server/modules/trips/trips.module.ts` imports it (`../../prisma/prisma.module`).

- [ ] **Step 6: Verify — existing login still works**

Start the stack (`npm run start:prod`) and confirm the seeded admin can still log in:

```powershell
Invoke-RestMethod -Method POST http://localhost:4001/api/auth/login -ContentType 'application/json' -Body (@{ username = $env:ADMIN_USERNAME; password = '<the real admin password>' } | ConvertTo-Json)
```

Expected: `200` with `accessToken` and `user: { username, role: "Admin" }`. This proves the seed correctly carried over the `.env` bcrypt hash byte-for-byte.

---

### Task 3: Backend — `UsersModule`

**Files:**
- Create: `src/server/modules/users/users.module.ts`
- Create: `src/server/modules/users/users.controller.ts`
- Create: `src/server/modules/users/users.service.ts`
- Create: `src/server/modules/users/dto/create-user.dto.ts`
- Create: `src/server/modules/users/dto/update-user.dto.ts`
- Modify: `src/server/app.module.ts`

**Interfaces:**
- Consumes: `PrismaService`, `Roles` decorator (Task 2).
- Produces: `GET/POST /users`, `PATCH /users/:id` — all `@Roles('Admin')`. Response rows never include `passwordHash`.

- [ ] **Step 1: Create `create-user.dto.ts`**

```typescript
import { IsIn, IsString, MinLength } from 'class-validator';

const ROLES = ['Admin', 'Coordinator', 'Viewer'] as const;

export class CreateUserDto {
  @IsString()
  username!: string;

  @IsString()
  @MinLength(8)
  password!: string;

  @IsIn(ROLES)
  role!: (typeof ROLES)[number];
}
```

- [ ] **Step 2: Create `update-user.dto.ts`**

```typescript
import { IsBoolean, IsIn, IsOptional, IsString, MinLength } from 'class-validator';

const ROLES = ['Admin', 'Coordinator', 'Viewer'] as const;

export class UpdateUserDto {
  @IsOptional()
  @IsIn(ROLES)
  role?: (typeof ROLES)[number];

  @IsOptional()
  @IsBoolean()
  active?: boolean;

  @IsOptional()
  @IsString()
  @MinLength(8)
  password?: string;
}
```

- [ ] **Step 3: Create `users.service.ts`**

```typescript
import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import * as bcrypt from 'bcryptjs';
import { PrismaService } from '../../prisma/prisma.service';
import { CreateUserDto } from './dto/create-user.dto';
import { UpdateUserDto } from './dto/update-user.dto';

const SELECT_SAFE = { id: true, username: true, role: true, active: true, createdAt: true };

@Injectable()
export class UsersService {
  constructor(private readonly prisma: PrismaService) {}

  findAll() {
    return this.prisma.user.findMany({ select: SELECT_SAFE, orderBy: { createdAt: 'asc' } });
  }

  async create(dto: CreateUserDto) {
    const existing = await this.prisma.user.findUnique({ where: { username: dto.username } });
    if (existing) throw new ConflictException(`Username ${dto.username} is already taken`);

    const passwordHash = await bcrypt.hash(dto.password, 10);
    return this.prisma.user.create({
      data: { username: dto.username, passwordHash, role: dto.role },
      select: SELECT_SAFE,
    });
  }

  async update(id: string, dto: UpdateUserDto) {
    const existing = await this.prisma.user.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException(`User ${id} not found`);

    const data: { role?: string; active?: boolean; passwordHash?: string } = {};
    if (dto.role !== undefined) data.role = dto.role;
    if (dto.active !== undefined) data.active = dto.active;
    if (dto.password !== undefined) data.passwordHash = await bcrypt.hash(dto.password, 10);

    return this.prisma.user.update({ where: { id }, data, select: SELECT_SAFE });
  }
}
```

- [ ] **Step 4: Create `users.controller.ts`**

```typescript
import { Body, Controller, Get, Param, Patch, Post } from '@nestjs/common';
import { UsersService } from './users.service';
import { CreateUserDto } from './dto/create-user.dto';
import { UpdateUserDto } from './dto/update-user.dto';
import { Roles } from '../auth/roles.decorator';

@Controller('users')
@Roles('Admin')
export class UsersController {
  constructor(private readonly users: UsersService) {}

  @Get()
  findAll() {
    return this.users.findAll();
  }

  @Post()
  create(@Body() dto: CreateUserDto) {
    return this.users.create(dto);
  }

  @Patch(':id')
  update(@Param('id') id: string, @Body() dto: UpdateUserDto) {
    return this.users.update(id, dto);
  }
}
```

Class-level `@Roles('Admin')` is correct here (unlike `ReferenceController`/`ServiceTypesController`/`MessageTemplatesController` in Task 4) because every route on this controller, including the `GET` list, must be Admin-only — no other role ever needs to read the user list.

- [ ] **Step 5: Create `users.module.ts`**

```typescript
import { Module } from '@nestjs/common';
import { PrismaModule } from '../../prisma/prisma.module';
import { UsersController } from './users.controller';
import { UsersService } from './users.service';

@Module({
  imports: [PrismaModule],
  controllers: [UsersController],
  providers: [UsersService],
})
export class UsersModule {}
```

- [ ] **Step 6: Register in `app.module.ts`**

In `src/server/app.module.ts`, add the import and register it in the `imports` array (alongside the other feature modules, e.g. after `PersonRatingsModule`):

```typescript
import { UsersModule } from './modules/users/users.module';
```

```typescript
    PersonRatingsModule,
    UsersModule,
```

- [ ] **Step 7: Verify — build**

Run: `npm run build`
Expected: exits 0.

- [ ] **Step 8: Verify — live API check**

With the stack running and an Admin bearer token from Task 2's login check:

```powershell
$token = '<accessToken from login>'
Invoke-RestMethod http://localhost:4001/api/users -Headers @{ Authorization = "Bearer $token" }
```

Expected: one row (the seeded admin), no `passwordHash` field present.

```powershell
Invoke-RestMethod -Method POST http://localhost:4001/api/users -Headers @{ Authorization = "Bearer $token" } -ContentType 'application/json' -Body (@{ username = 'coordinator1'; password = 'testpass123'; role = 'Coordinator' } | ConvertTo-Json)
```

Expected: `201` with the new user's safe fields. Then confirm `coordinator1` can log in via `POST /api/auth/login` with that password.

---

### Task 4: Backend — apply `@Roles('Admin')` to existing admin-config routes

**Files:**
- Modify: `src/server/modules/reference/reference.controller.ts`
- Modify: `src/server/modules/service-types/service-types.controller.ts`
- Modify: `src/server/modules/message-templates/message-templates.controller.ts`

**Interfaces:**
- Consumes: `Roles` decorator (Task 2).
- Produces: no new routes — existing routes gain a role requirement. All `GET` routes on these three controllers are untouched and stay open to every authenticated role.

- [ ] **Step 1: Add `@Roles('Admin')` to `reference.controller.ts`'s write methods**

Add `import { Roles } from '../auth/roles.decorator';` to the top of `src/server/modules/reference/reference.controller.ts`.

Add `@Roles('Admin')` immediately above each of these 18 method declarations (method-level, not class-level — the `GET` methods on this same controller must stay open to every role):

`createCountry`, `updateCountry`, `deleteCountry`, `createAirport`, `updateAirport`, `deleteAirport`, `createAircraft`, `updateAircraft`, `deleteAircraft`, `createOperator`, `updateOperator`, `deleteOperator`, `createProvider`, `updateProvider`, `deleteProvider`, `createCountryFee`, `updateCountryFee`, `deleteCountryFee`.

Example (repeat the same pattern for all 18 — each is a one-line decorator addition above the existing `@Post(...)`/`@Patch(...)`/`@Delete(...)` decorator):

```typescript
  @Roles('Admin')
  @Post('countries')
  createCountry(@Body() dto: CreateCountryDto) {
    return this.ref.createCountry({ ...dto, iso2: dto.iso2.toUpperCase() });
  }
```

- [ ] **Step 2: Add `@Roles('Admin')` to `service-types.controller.ts`'s write methods**

Add `import { Roles } from '../auth/roles.decorator';`. Add `@Roles('Admin')` above `create` and `update` only — `findAll` (the `GET` route) must stay open, since every Coordinator's leg/service editor reads this list to populate the service-type dropdown.

- [ ] **Step 3: Add `@Roles('Admin')` to `message-templates.controller.ts`'s write methods**

Add `import { Roles } from '../auth/roles.decorator';`. Add `@Roles('Admin')` above `create`, `update`, and `remove` only — `findAll`/`findOne` (the `GET` routes) must stay open, since `preloadReferenceData()` fetches message-template overrides for every logged-in user (needed to render any coordinator's compose-message preview, not just an Admin's).

- [ ] **Step 4: Verify — build**

Run: `npm run build`
Expected: exits 0.

- [ ] **Step 5: Verify — live API check**

Using the Coordinator token created in Task 3's Step 8:

```powershell
$coordToken = '<coordinator1's accessToken>'
Invoke-RestMethod -Method POST http://localhost:4001/api/reference/countries -Headers @{ Authorization = "Bearer $coordToken" } -ContentType 'application/json' -Body (@{ iso2 = 'ZZ'; name = 'Test'; region = 'Test' } | ConvertTo-Json)
```

Expected: `403 Forbidden`. Then confirm the same request succeeds (`200`/`201`) with the Admin token from Task 2, and that `Invoke-RestMethod http://localhost:4001/api/reference/countries -Headers @{ Authorization = "Bearer $coordToken" }` (a `GET`) still succeeds for the Coordinator.

---

### Task 5: Frontend — `dataStore.ts` audit-attribution fix + Users API functions

**Files:**
- Modify: `src/client/lib/dataStore.ts`
- Modify: `src/client/data/types.ts`

**Interfaces:**
- Produces: `getUsers(): Promise<AppUser[]>`, `saveUser(user): Promise<AppUser>`. `AppUser` type.
- Every existing mutation function's `user = 'SYSTEM'` default parameter now defaults to the real logged-in username.

- [ ] **Step 1: Add the `AppUser` interface**

In `src/client/data/types.ts`, add (alongside the other interfaces, matching this file's existing style):

```typescript
export interface AppUser {
  ID: string;
  Username: string;
  Role: 'Admin' | 'Coordinator' | 'Viewer';
  Active: boolean;
  CreatedAt: string;
}
```

- [ ] **Step 2: Add the `currentUser()` helper to `dataStore.ts`**

Near the top of `src/client/lib/dataStore.ts`, right after the `apiJson`/`ApiError` helpers (before the first resource's mapper functions), add:

```typescript
// Reads the currently logged-in user's username, written by authContext.tsx's
// AuthProvider on login (`viq_auth_user`). Falls back to 'SYSTEM' if nothing
// is stored — shouldn't happen in practice since every page that calls a
// mutation function sits behind RequireAuth, but keeps this function total.
function currentUser(): string {
  try {
    const raw = localStorage.getItem('viq_auth_user');
    return raw ? (JSON.parse(raw).username as string) : 'SYSTEM';
  } catch {
    return 'SYSTEM';
  }
}
```

- [ ] **Step 3: Replace every `user = 'SYSTEM'` default parameter**

Search `dataStore.ts` for `user = 'SYSTEM'` (it appears once per mutation function's signature — `saveTrip`, `deleteTrip`, `saveLeg`, `deleteLeg`, `saveStop`, `deleteStop`, `saveService`, `deleteService`, `saveServiceType`, `generateOverflightServices`, `generateArrivalServices`, `savePerson`, `assignPersonToTrip`, `unassignPersonFromTrip`, `deletePerson`, `saveComm`, `uploadDoc`, `deleteDoc`, `verifyDoc`, `saveInvoice`, `saveAircraft`, `deleteAircraft`, `saveProvider`, `deleteProvider`, `saveAirport`, `deleteAirport`, `saveCountry`, `deleteCountry`, `saveOperator`, `deleteOperator`, `saveMessageTemplate`, `deleteMessageTemplate`, `saveCountryFee`, `deleteCountryFee`, `generateInvoiceFromTrip` — confirm the exact list by searching, this enumeration is what was found during the spec's investigation but re-verify against the current file since line numbers will have shifted from earlier slices).

Replace every occurrence of the literal `user = 'SYSTEM'` with `user = currentUser()`. This is a mechanical find-and-replace across the whole file — every one of these is a function parameter default, not a call site, so the replacement is identical each time.

- [ ] **Step 4: Add `getUsers`/`saveUser`**

Add near the end of `dataStore.ts`, after the other resource CRUD blocks (e.g., after the Country Fee CRUD block):

```typescript
// ─── Users (Admin only — backend enforces via RolesGuard) ──────────────────

function mapUserFromApi(u: any): AppUser {
  return {
    ID: u.id,
    Username: u.username,
    Role: u.role,
    Active: u.active,
    CreatedAt: u.createdAt,
  };
}

export async function getUsers(): Promise<AppUser[]> {
  const rows = await apiJson<any[]>('/users');
  return rows.map(mapUserFromApi);
}

export async function saveUser(user: { id?: string; username: string; password?: string; role: string; active?: boolean }): Promise<AppUser> {
  const body = JSON.stringify(user);
  const row = user.id
    ? await apiJson<any>(`/users/${user.id}`, { method: 'PATCH', body })
    : await apiJson<any>('/users', { method: 'POST', body });
  return mapUserFromApi(row);
}
```

Add `AppUser` to the `import type { ... } from '@/data/types';` block at the top of `dataStore.ts`.

- [ ] **Step 5: Verify — build**

Run: `npm run build`
Expected: exits 0.

- [ ] **Step 6: Verify — manual check**

Start the stack, log in as the seeded Admin in the browser, open a trip, edit a leg, save. Confirm via `GET /api/audit?limit=5` (or `AuditPage.tsx`) that the new audit entry's `User` field shows the real admin username, not `SYSTEM`.

---

### Task 6: Frontend — `authContext.tsx`, `RequireRole`, `App.tsx`, `Layout.tsx`

**Files:**
- Modify: `src/client/lib/authContext.tsx`
- Create: `src/client/components/RequireRole.tsx`
- Modify: `src/client/App.tsx`
- Modify: `src/client/components/Layout.tsx`

**Interfaces:**
- Produces: `useAuth()` gains `canEdit: boolean` and `isAdmin: boolean`. `RequireRole` component. `/admin/users` route (element wired in Task 7) and `/admin/message-templates`/`/admin/settings` routes gated to Admin only.

- [ ] **Step 1: Add `canEdit`/`isAdmin` to `authContext.tsx`**

In `src/client/lib/authContext.tsx`, update the `AuthContextValue` interface and the provider's returned value:

```typescript
interface AuthContextValue {
  token: string | null;
  user: AuthUser | null;
  canEdit: boolean;
  isAdmin: boolean;
  login: (username: string, password: string) => Promise<void>;
  logout: () => void;
}
```

In `AuthProvider`, before the `return`:

```typescript
  const canEdit = user?.role !== 'Viewer';
  const isAdmin = user?.role === 'Admin';
```

And in the returned `<AuthContext.Provider value={{ ... }}>`, add `canEdit, isAdmin,` to the value object.

- [ ] **Step 2: Create `RequireRole.tsx`**

Create `src/client/components/RequireRole.tsx`, matching `RequireAuth.tsx`'s existing style:

```tsx
import type { ReactNode } from 'react';
import { Navigate } from 'react-router';
import { useAuth } from '../lib/authContext';

export default function RequireRole({ role, children }: { role: string; children: ReactNode }) {
  const { user } = useAuth();

  if (user?.role !== role) {
    return <Navigate to="/dashboard" replace />;
  }

  return <>{children}</>;
}
```

Redirects to `/dashboard` (the real authenticated home), not `/` (the public landing page) — same distinction as the Task that fixed `Layout.tsx`'s nav bug earlier in this session.

- [ ] **Step 3: Wrap the Admin-only routes in `App.tsx`**

In `src/client/App.tsx`, import `RequireRole`:

```typescript
import RequireRole from './components/RequireRole'
```

Wrap these three route elements (inside the existing `<Route element={<RequireAuth><Layout /></RequireAuth>}>` block — `RequireRole` nests inside, it doesn't replace `RequireAuth`):

```tsx
        <Route path="/admin/message-templates" element={<RequireRole role="Admin"><MessageTemplatesPage /></RequireRole>} />
        <Route path="/admin/settings" element={<RequireRole role="Admin"><AdminSettings /></RequireRole>} />
        <Route path="/admin/users" element={<RequireRole role="Admin"><UsersPage /></RequireRole>} />
```

(The `/admin/users` route's `UsersPage` import is added in Task 7 — add the import line and this route now; if `UsersPage.tsx` doesn't exist yet when you run the build in Step 5 below, that's expected and gets resolved by Task 7. If executing tasks out of order, create a placeholder `export default function UsersPage() { return null; }` in `src/client/pages/admin/UsersPage.tsx` for now so this task's build check passes standalone.)

- [ ] **Step 4: Filter admin nav items by role in `Layout.tsx`**

In `src/client/components/Layout.tsx`, add a `{ path: '/admin/users', label: 'Users', icon: Users }` entry to the `adminItems` array (the `Users` icon is already imported at the top of this file from `lucide-react`).

In the `Layout` component, destructure `isAdmin` from `useAuth()`:

```typescript
  const { user, logout, isAdmin } = useAuth();
```

Where `<NavSection items={adminItems} title="Admin" />` is rendered, replace it with a filtered list:

```tsx
          <NavSection
            items={isAdmin ? adminItems : adminItems.filter((item) => !['/admin/message-templates', '/admin/settings', '/admin/users'].includes(item.path))}
            title="Admin"
          />
```

- [ ] **Step 5: Verify — build**

Run: `npm run build`
Expected: exits 0.

- [ ] **Step 6: Verify — manual check**

Log in as the Coordinator user created in Task 3. Confirm "Message Templates", "Settings", and "Users" are absent from the Admin nav section, but "Admin Dashboard", "Manage Trips", "Assets", "Billing" are present. Manually navigate to `http://localhost:4001/admin/settings` — confirm it redirects to `/dashboard` instead of rendering.

---

### Task 7: Frontend — `/admin/users` page

**Files:**
- Create: `src/client/pages/admin/UsersPage.tsx`
- Modify: `src/client/App.tsx` (if Task 6 used the placeholder — replace it with the real import)

**Interfaces:**
- Consumes: `getUsers`, `saveUser` (Task 5), `AppUser` type (Task 5).

- [ ] **Step 1: Create `UsersPage.tsx`**

Match this codebase's established admin-tab page shape (`AdminAssets.tsx`'s pattern: a list of `Card`s, an "Add" button opening a `Dialog`, per-row edit). Full implementation:

```tsx
import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router';
import { getUsers, saveUser } from '@/lib/dataStore';
import type { AppUser } from '@/data/types';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { ArrowLeft, Plus, Pencil } from 'lucide-react';

const ROLES = ['Admin', 'Coordinator', 'Viewer'] as const;

function UserDialog({ user, open, onClose, onSaved }: {
  user: AppUser | null; open: boolean; onClose: () => void; onSaved: () => void;
}) {
  const isNew = !user;
  const [username, setUsername] = useState(user?.Username || '');
  const [password, setPassword] = useState('');
  const [role, setRole] = useState<(typeof ROLES)[number]>(user?.Role || 'Coordinator');
  const [active, setActive] = useState(user?.Active ?? true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSave = async () => {
    if (!username.trim()) return;
    if (isNew && password.length < 8) {
      setError('Temporary password must be at least 8 characters.');
      return;
    }
    setSaving(true);
    setError(null);
    try {
      await saveUser({
        id: user?.ID,
        username: username.trim(),
        role,
        active,
        ...(password ? { password } : {}),
      });
      onSaved();
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Save failed');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{isNew ? 'Add User' : `Edit ${user.Username}`}</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1">
            <Label>Username</Label>
            <Input value={username} onChange={(e) => setUsername(e.target.value)} disabled={!isNew} />
          </div>
          <div className="space-y-1">
            <Label>{isNew ? 'Temporary Password' : 'Reset Password (optional)'}</Label>
            <Input type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder={isNew ? '' : 'Leave blank to keep current password'} />
          </div>
          <div className="space-y-1">
            <Label>Role</Label>
            <Select value={role} onValueChange={(v) => setRole(v as (typeof ROLES)[number])}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {ROLES.map((r) => <SelectItem key={r} value={r}>{r}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          {!isNew && (
            <div className="flex items-center gap-2">
              <input type="checkbox" id="active" checked={active} onChange={(e) => setActive(e.target.checked)} />
              <Label htmlFor="active">Active (unchecking blocks future logins)</Label>
            </div>
          )}
          {error && <p className="text-sm text-destructive">{error}</p>}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button onClick={handleSave} disabled={!username.trim() || saving}>{saving ? 'Saving…' : 'Save'}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export default function UsersPage() {
  const navigate = useNavigate();
  const [users, setUsers] = useState<AppUser[]>([]);
  const [dialog, setDialog] = useState<{ open: boolean; item: AppUser | null }>({ open: false, item: null });

  const reload = () => { getUsers().then(setUsers); };
  useEffect(() => { reload(); }, []);

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <Button variant="outline" size="sm" onClick={() => navigate('/admin')}>
          <ArrowLeft className="mr-1 h-4 w-4" /> Back
        </Button>
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Users</h1>
          <p className="text-sm text-muted-foreground">Accounts and roles</p>
        </div>
      </div>

      <div className="flex justify-end">
        <Button size="sm" onClick={() => setDialog({ open: true, item: null })}>
          <Plus className="h-4 w-4" /> Add User
        </Button>
      </div>

      {users.map((u) => (
        <Card key={u.ID}>
          <CardContent className="p-4 flex items-center justify-between">
            <div>
              <div className="font-bold">{u.Username}</div>
              <div className="text-xs text-muted-foreground">Created {u.CreatedAt.slice(0, 10)}</div>
            </div>
            <div className="flex items-center gap-2">
              <Badge variant="secondary">{u.Role}</Badge>
              <Badge variant={u.Active ? 'outline' : 'destructive'}>{u.Active ? 'Active' : 'Deactivated'}</Badge>
              <Button size="icon" variant="ghost" onClick={() => setDialog({ open: true, item: u })}>
                <Pencil className="h-4 w-4" />
              </Button>
            </div>
          </CardContent>
        </Card>
      ))}

      <UserDialog
        user={dialog.item}
        open={dialog.open}
        onClose={() => setDialog({ open: false, item: null })}
        onSaved={reload}
      />
    </div>
  );
}
```

- [ ] **Step 2: Wire the real import in `App.tsx`**

Add `import UsersPage from './pages/admin/UsersPage'` to `src/client/App.tsx` (if Task 6 created a placeholder file, this import now points at the real page — no route JSX change needed, it was already added in Task 6 Step 3).

- [ ] **Step 3: Verify — build**

Run: `npm run build`
Expected: exits 0.

- [ ] **Step 4: Verify — manual check**

Log in as Admin, navigate to Users (nav or `/admin/users`). Add a Viewer user with a temporary password. Confirm it appears in the list. Edit that user's role to Coordinator and save — confirm the badge updates. Log in as that user in a second browser session/incognito window to confirm the new credentials work.

---

### Task 8: Frontend Viewer sweep — `TripDetail.tsx`, `PersonDetail.tsx`

**Files:**
- Modify: `src/client/pages/TripDetail.tsx`
- Modify: `src/client/pages/admin/PersonDetail.tsx`

**Interfaces:**
- Consumes: `useAuth().canEdit` (Task 6).

- [ ] **Step 1: Gate `TripDetail.tsx`'s edit-toggle entry points**

Add `import { useAuth } from '@/lib/authContext';` to `src/client/pages/TripDetail.tsx` if not already present, and call `const { canEdit } = useAuth();` inside each component below that needs it (this is a page with several sub-components in one file — `useAuth()` is called per-component, not hoisted, since each has its own local `editing` state).

In `TripInfoEditor` (the trip header's edit toggle) and in `LegEditor` (the leg detail's edit toggle), find the single "EDIT"/"SAVE" toggle button — each currently looks like:

```tsx
<Button size="sm" variant={editing ? 'default' : 'outline'} onClick={() => (editing ? save() : setEditing(true))}>
```

Change the `onClick` to a no-op when `!canEdit`, and visually disable it:

```tsx
<Button size="sm" variant={editing ? 'default' : 'outline'} disabled={!canEdit} onClick={() => canEdit && (editing ? save() : setEditing(true))}>
```

(Read each component's actual current button JSX first — the exact prop layout may differ slightly between `TripInfoEditor` and `LegEditor`; apply the same `disabled={!canEdit}` + guarded `onClick` pattern to whichever exact button toggles that component's `editing` state.) Because every nested field/control in both components already checks `disabled={!editing}` or is conditionally rendered on `editing`, gating just this one entry point is sufficient — a Viewer can never flip `editing` to `true`.

- [ ] **Step 2: Gate `PersonDetail.tsx`'s per-control mutations**

Add `import { useAuth } from '@/lib/authContext';` to `src/client/pages/admin/PersonDetail.tsx`.

`BiodataCard` and `MedicalCard` follow the same single-toggle pattern as Task 8 Step 1 — call `const { canEdit } = useAuth();` inside each and apply the same `disabled={!canEdit}` + guarded `onClick` to their "EDIT"/"SAVE" button.

`RatingsCard`, `AssignedTripsCard`, and `DocsCard` have no single toggle — each mutating button needs its own guard. Call `const { canEdit } = useAuth();` inside each component and:

- `RatingsCard`: wrap the "ADD RATING" button's `onClick` and add `disabled={!canEdit}`; same for each row's "EDIT"/"DELETE" buttons.
- `AssignedTripsCard`: same for "ASSIGN TO TRIP" and each row's "UNASSIGN" button.
- `DocsCard`: same for the "UPLOAD" button, and for each doc row's "EXTRACT TEXT"/"VERIFY"/"RE-VERIFY"/"DELETE" buttons (leave "DOWNLOAD" ungated — reading a file is not a mutation, Viewers should be able to download).

For every one of these, the pattern is: read the button's current JSX, add `disabled={!canEdit}` to the `Button`, and wrap the click handler so it does nothing when `!canEdit` (either `onClick={() => canEdit && doThing()}` or, for handlers already extracted as named functions, an early `if (!canEdit) return;` at the top of the handler).

- [ ] **Step 3: Verify — build**

Run: `npm run build`
Expected: exits 0.

- [ ] **Step 4: Verify — manual check**

Log in as the Viewer user created in Task 7. Open a trip — confirm the "EDIT" button on the trip header and every leg is disabled. Open a person's detail page — confirm "ADD RATING", "ASSIGN TO TRIP", "UPLOAD", and every row-level mutation button is disabled, while "DOWNLOAD" on a doc still works.

---

### Task 9: Frontend Viewer/Admin sweep — `AdminAssets.tsx`, `ReferencePage.tsx`

**Files:**
- Modify: `src/client/pages/admin/AdminAssets.tsx`
- Modify: `src/client/pages/ReferencePage.tsx`

**Interfaces:**
- Consumes: `useAuth().canEdit`, `useAuth().isAdmin` (Task 6).

- [ ] **Step 1: Gate `AdminAssets.tsx`'s tabs**

Add `import { useAuth } from '@/lib/authContext';` and, inside the `AdminAssets` component, `const { canEdit, isAdmin } = useAuth();`.

For the **Aircraft, Vendors, Airports, Countries, Operators, Fees** tabs: every "Add X" button (e.g. "Add Aircraft", "Add Vendor", etc.) and every row's edit-pencil/delete-trash icon buttons get `disabled={!isAdmin}` plus a guarded `onClick` (`isAdmin &&` wrapping the existing handler).

For the **Persons** tab: its "Add Person" button and each row's edit/delete icon buttons get `disabled={!canEdit}` instead (Coordinators manage the roster).

The **Expiry** tab has no mutating controls (it's a read-only attention table) — no change needed there.

- [ ] **Step 2: Gate `ReferencePage.tsx`'s Service Types tab**

Add `import { useAuth } from '@/lib/authContext';` and `const { isAdmin } = useAuth();` inside the component that renders the Service Types tab.

Gate the "Add Type" button, each row's "Edit" and "Deactivate"/"Activate" buttons, and the add/edit dialog's "Save" button — all with `isAdmin` (not `canEdit`; this is Admin-only per Task 4's backend enforcement, and a Coordinator's write attempt here would 403 anyway).

The rest of `ReferencePage.tsx` (Airports/Countries/Country Rules/Aircraft/Providers tabs) is read-only browsing today with no edit controls — no change needed there.

- [ ] **Step 3: Verify — build**

Run: `npm run build`
Expected: exits 0.

- [ ] **Step 4: Verify — manual check**

Log in as the Coordinator user. On `/admin/assets`: confirm the Aircraft tab's "Add Aircraft" and row edit/delete buttons are disabled, but the Persons tab's "Add Person" and row edit/delete buttons work normally. On `/reference`'s Service Types tab: confirm "Add Type"/"Edit"/"Deactivate" are disabled. Then log in as Viewer and confirm the Persons tab's controls are now also disabled.

---

### Task 10: Frontend Viewer sweep — `BillingPage.tsx`, `ComposerPage.tsx`, `ComposeDrawer.tsx`, `AdminTrips.tsx`, `NewTripWizard.tsx`

**Files:**
- Modify: `src/client/pages/admin/BillingPage.tsx`
- Modify: `src/client/pages/ComposerPage.tsx`
- Modify: `src/client/components/ComposeDrawer.tsx`
- Modify: `src/client/pages/admin/AdminTrips.tsx`
- Modify: `src/client/pages/admin/NewTripWizard.tsx`

**Interfaces:**
- Consumes: `useAuth().canEdit` (Task 6).

- [ ] **Step 1: Gate `BillingPage.tsx`**

Add `import { useAuth } from '@/lib/authContext';` and `const { canEdit } = useAuth();` inside the main `BillingPage` component and inside `InvoiceDetailDialog`/`GenerateDialog` (each is its own component in this file — call the hook in each that needs it).

Gate: `BillingPage`'s "Generate Invoice" button; `InvoiceDetailDialog`'s status-change button (the one calling `handleStatusChange`); `GenerateDialog`'s "Generate" button (calling `handleGenerate`).

- [ ] **Step 2: Gate `ComposerPage.tsx`'s send button**

Add `import { useAuth } from '@/lib/authContext';` and `const { canEdit } = useAuth();`. Gate the button that calls `sendAndLog` (around line 257 as of this plan's writing — confirm the current line by searching for `sendAndLog` in the file) with `disabled={!canEdit}` and a guarded `onClick`.

- [ ] **Step 3: Gate `ComposeDrawer.tsx`'s send button**

Add `import { useAuth } from '@/lib/authContext';` and `const { canEdit } = useAuth();`. Gate the button that calls `handleSend` (around line 192 as of this plan's writing) — add `canEdit === false` to its existing `disabled={sending || !providerId || result?.ok === true}` expression (i.e. `disabled={sending || !providerId || result?.ok === true || !canEdit}`) and guard the `onClick`.

- [ ] **Step 4: Gate `AdminTrips.tsx`**

Add `import { useAuth } from '@/lib/authContext';` and `const { canEdit } = useAuth();` inside the top-level `AdminTrips` component and inside any sub-component in this file that has its own save/add dialog (e.g. the leg-add dialog, service-add dialog, attachment dialog — this file has several; call the hook in each one that has a mutating "Save"/"Add" button).

Gate: the "New Trip" button (navigates to `/admin/trips/new`, found around line 797), every dialog's "Save"/"Add" button, and the leg row's edit-pencil icon button (around line 572).

- [ ] **Step 5: Gate `NewTripWizard.tsx`'s submit**

Add `import { useAuth } from '@/lib/authContext';` and `const { canEdit } = useAuth();` inside the `NewTripWizard` component. Gate the final "Create Trip" submit button (calling `handleSave`, around line 444) with `disabled={!canEdit}` and a guarded `onClick`. This is defense in depth — Step 4 already hides the entry point that navigates here — but a Viewer directly typing `/admin/trips/new` should still see the submit disabled rather than able to fire a request that the backend will 403 anyway.

- [ ] **Step 6: Verify — build**

Run: `npm run build`
Expected: exits 0.

- [ ] **Step 7: Verify — manual check**

Log in as Viewer. Confirm: Billing's "Generate Invoice" and status-change buttons are disabled; Composer's send button is disabled; a service card's "Compose" → send button is disabled; `/admin/trips`'s "New Trip" button is disabled and no leg/service dialogs can be saved; navigating directly to `/admin/trips/new` shows the wizard but its final submit is disabled.

---

### Task 11: Full-stack build + end-to-end verification (controller-performed)

- [ ] **Step 1:** `npm run build` — exits 0 (both `build:server` and `build:client`).

- [ ] **Step 2:** Start the stack (`npm run start:prod`) against the real Postgres container. Confirm the seeded Admin can still log in with the original `.env` credentials.

- [ ] **Step 3:** Full three-role walkthrough in the browser:
  - **Admin**: create a Coordinator and a Viewer user via `/admin/users`. Confirm all three admin-only pages (Users, Message Templates, Settings) are reachable and their nav items visible.
  - **Coordinator**: log in as the new Coordinator. Confirm the three admin-only nav items are gone and their routes redirect if visited directly. Confirm normal trip/leg/service/person/comms/billing work is fully functional, and a resulting audit entry shows the Coordinator's real username. Confirm `/admin/assets`'s reference-data tabs (Aircraft etc.) have disabled Add/Edit/Delete, but the Persons tab does not.
  - **Viewer**: log in as the new Viewer. Confirm every Edit/Add/Delete/Save/Send control encountered across Trips, Persons, Billing, Composer, and Assets is disabled. Attempt a direct API mutation (e.g. `PATCH /api/trips/:id`) with the Viewer's token — confirm `403`.

- [ ] **Step 4:** Deactivate the Coordinator user via `/admin/users` (uncheck Active). Confirm their next login attempt fails with invalid-credentials.

- [ ] **Step 5:** Report: build status, which manual checks passed, any deviations from this plan (with rationale) ledgered as rulings, matching this project's established reporting convention from prior slices.
