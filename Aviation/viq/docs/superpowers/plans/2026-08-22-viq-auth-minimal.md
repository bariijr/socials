# VIQ Minimal Auth Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Gate the VIQ NestJS API and React admin shell behind a single hardcoded `admin` / `Admin123!` login, with the public quote tool staying open.

**Architecture:** A NestJS `AuthModule` issues a JWT from `POST /api/auth/login` and registers a global `APP_GUARD` that rejects any `/api/*` request without a valid `Authorization: Bearer <token>` header, except routes marked `@Public()`. The React app stores the token in `localStorage`, gates the admin route tree behind a `RequireAuth` wrapper, and redirects to a new `/login` page when there's no token.

**Tech Stack:** NestJS 10, `@nestjs/jwt`, `bcryptjs`, React 19, `react-router` 7.

**Spec:** `docs/superpowers/specs/2026-08-21-viq-auth-minimal-design.md`

## Global Constraints

- Do not `git commit` anything — working tree only, per explicit user instruction.
- Do not touch `src/client/lib/dataStore.ts`'s localStorage read/write logic — that belongs to a later sub-project (the frontend→API rewire).
- No roles, no user table, no refresh tokens, no password reset — single hardcoded credential only, matching "for now."
- Exactly two `/api/*` routes stay public: `POST /auth/login` and `POST /quotes`. Every other `/api/*` route requires a valid Bearer token.
- In the browser, `/`, `/landing`, and `/login` stay reachable without a token. Everything rendered through `Layout` (the sidebar admin shell — `/dashboard`, `/trips`, `/comms`, `/audit`, `/reference`, `/composer`, `/admin*`) requires a token.
- `.env.example` gets placeholder values only — never a real secret or the real password hash.

---

### Task 1: Backend — auth module, global guard, public quote route

**Files:**
- Modify: `package.json` (add `@nestjs/jwt`, `bcryptjs` — via `npm install`, not hand-edited)
- Create: `src/server/modules/auth/public.decorator.ts`
- Create: `src/server/modules/auth/dto/login.dto.ts`
- Create: `src/server/modules/auth/auth.service.ts`
- Create: `src/server/modules/auth/auth.controller.ts`
- Create: `src/server/modules/auth/jwt-auth.guard.ts`
- Create: `src/server/modules/auth/auth.module.ts`
- Modify: `src/server/app.module.ts` (import `AuthModule`)
- Modify: `src/server/modules/quotes/quotes.controller.ts` (mark `submit` `@Public()`)
- Modify: `.env`, `.env.example` (add `JWT_SECRET`, `ADMIN_USERNAME`, `ADMIN_PASSWORD_HASH`)

**Interfaces:**
- Produces: `POST /api/auth/login` — body `{ username: string, password: string }` → `200 { accessToken: string, user: { username: string, role: 'admin' } }` or `401`.
- Produces: `JwtAuthGuard` (global) — every `/api/*` route requires `Authorization: Bearer <token>` unless the handler or controller carries `@Public()`.
- Produces: `@Public()` decorator, importable from `src/server/modules/auth/public.decorator.ts`, used by later tasks/sub-projects to exempt new routes.
- Consumes: nothing from earlier tasks (this is the first task).

- [ ] **Step 1: Install the auth dependencies**

Run:
```bash
cd "C:\Backups\InsiderTechSol\Aviation\kimiactuate\viq"
npm install @nestjs/jwt@^10.2.0 bcryptjs@^2.4.3
```
Expected: `package.json` and `package-lock.json` gain the two entries; no `bcrypt` native module (we're using the pure-JS `bcryptjs` specifically to avoid the Windows native-build/EPERM issues this project already hit with the Prisma engine DLL).

- [ ] **Step 2: Generate the JWT secret and the admin password hash**

Run:
```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
node -e "console.log(require('bcryptjs').hashSync('Admin123!', 10))"
```
Copy both outputs — you'll paste them into `.env` in Step 3. The bcrypt hash starts with `$2a$10$...` or `$2b$10$...` and is roughly 60 characters.

- [ ] **Step 3: Add auth config to `.env` and `.env.example`**

Append to `.env` (using your real generated values from Step 2):
```
JWT_SECRET="<paste the 64-char hex string from Step 2>"
ADMIN_USERNAME=admin
ADMIN_PASSWORD_HASH="<paste the bcrypt hash from Step 2>"
```

Append to `.env.example` (placeholders only — never real secrets):
```
JWT_SECRET="replace-with-a-long-random-secret"
ADMIN_USERNAME=admin
ADMIN_PASSWORD_HASH="replace-with-a-bcrypt-hash-of-your-admin-password"
```

- [ ] **Step 4: Create the `@Public()` decorator**

Create `src/server/modules/auth/public.decorator.ts`:
```typescript
import { SetMetadata } from '@nestjs/common';

export const IS_PUBLIC_KEY = 'isPublic';
export const Public = () => SetMetadata(IS_PUBLIC_KEY, true);
```

- [ ] **Step 5: Create the login DTO**

Create `src/server/modules/auth/dto/login.dto.ts`:
```typescript
import { IsString, MinLength } from 'class-validator';

export class LoginDto {
  @IsString()
  username!: string;

  @IsString()
  @MinLength(1)
  password!: string;
}
```

- [ ] **Step 6: Create the auth service**

Create `src/server/modules/auth/auth.service.ts`:
```typescript
import { Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcryptjs';

@Injectable()
export class AuthService {
  constructor(private readonly jwtService: JwtService) {}

  async login(username: string, password: string) {
    const expectedUsername = process.env.ADMIN_USERNAME;
    const passwordHash = process.env.ADMIN_PASSWORD_HASH;

    if (!expectedUsername || !passwordHash) {
      throw new UnauthorizedException('Auth is not configured');
    }
    if (username !== expectedUsername) {
      throw new UnauthorizedException('Invalid credentials');
    }

    const matches = await bcrypt.compare(password, passwordHash);
    if (!matches) {
      throw new UnauthorizedException('Invalid credentials');
    }

    const accessToken = this.jwtService.sign({ sub: expectedUsername, role: 'admin' });
    return { accessToken, user: { username: expectedUsername, role: 'admin' } };
  }
}
```

- [ ] **Step 7: Create the auth controller**

Create `src/server/modules/auth/auth.controller.ts`:
```typescript
import { Body, Controller, Post } from '@nestjs/common';
import { AuthService } from './auth.service';
import { LoginDto } from './dto/login.dto';
import { Public } from './public.decorator';

@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Public()
  @Post('login')
  login(@Body() dto: LoginDto) {
    return this.authService.login(dto.username, dto.password);
  }
}
```

- [ ] **Step 8: Create the JWT guard**

Create `src/server/modules/auth/jwt-auth.guard.ts`:
```typescript
import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { JwtService } from '@nestjs/jwt';
import { IS_PUBLIC_KEY } from './public.decorator';

@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly jwtService: JwtService,
  ) {}

  canActivate(context: ExecutionContext): boolean {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) {
      return true;
    }

    const request = context.switchToHttp().getRequest();
    const authHeader: string | undefined = request.headers['authorization'];
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      throw new UnauthorizedException('Missing bearer token');
    }

    const token = authHeader.slice('Bearer '.length);
    try {
      request.user = this.jwtService.verify(token);
      return true;
    } catch {
      throw new UnauthorizedException('Invalid or expired token');
    }
  }
}
```

- [ ] **Step 9: Create the auth module**

Create `src/server/modules/auth/auth.module.ts`:
```typescript
import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { JwtModule } from '@nestjs/jwt';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { JwtAuthGuard } from './jwt-auth.guard';

@Module({
  imports: [
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
    { provide: APP_GUARD, useClass: JwtAuthGuard },
  ],
})
export class AuthModule {}
```

- [ ] **Step 10: Register `AuthModule` in `app.module.ts`**

In `src/server/app.module.ts`, add the import and add `AuthModule` to the `imports` array (order doesn't matter, but keep it near the top with the other cross-cutting modules like `AuditModule`):

```typescript
import { AuthModule } from './modules/auth/auth.module';
```
and in the `imports: [...]` array, add `AuthModule,`.

- [ ] **Step 11: Mark the public quote endpoint `@Public()`**

In `src/server/modules/quotes/quotes.controller.ts`, add the import and decorator:
```typescript
import { Body, Controller, Post } from '@nestjs/common';
import { QuotesService } from './quotes.service';
import { CreateQuoteDto } from './dto/create-quote.dto';
import { Public } from '../auth/public.decorator';

@Controller('quotes')
export class QuotesController {
  constructor(private readonly quotes: QuotesService) {}

  @Public()
  @Post()
  submit(@Body() dto: CreateQuoteDto) {
    return this.quotes.submit(dto);
  }
}
```

- [ ] **Step 12: Build and start the server**

Run:
```bash
cd "C:\Backups\InsiderTechSol\Aviation\kimiactuate\viq"
npm run build
npm run start:prod
```
Expected: no compile errors; log line `jetflow listening on http://localhost:4001`. Leave this running for the next step (run it in the background if your tooling supports that, or open a second terminal).

- [ ] **Step 13: Verify all four auth scenarios**

Run (in a separate terminal from the running server):
```bash
# 1. Correct login -> 200 + accessToken
curl -s -o - -w "\nHTTP %{http_code}\n" -X POST http://localhost:4001/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"username":"admin","password":"Admin123!"}'

# 2. Wrong password -> 401
curl -s -o - -w "\nHTTP %{http_code}\n" -X POST http://localhost:4001/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"username":"admin","password":"wrong"}'

# 3. Protected route with no token -> 401
curl -s -o /dev/null -w "HTTP %{http_code}\n" http://localhost:4001/api/reference/aircraft

# 4. Protected route with the token from scenario 1 -> 200
# (replace TOKEN with the accessToken value from scenario 1's response)
curl -s -o /dev/null -w "HTTP %{http_code}\n" http://localhost:4001/api/reference/aircraft \
  -H "Authorization: Bearer TOKEN"

# 5. Public quote route still open with no token -> not 401 (400 for an empty/invalid
# body is fine here — the point is it must not be 401)
curl -s -o /dev/null -w "HTTP %{http_code}\n" -X POST http://localhost:4001/api/quotes \
  -H "Content-Type: application/json" -d '{}'
```
Expected: scenario 1 → `HTTP 200` with a JSON body containing `accessToken`; scenario 2 → `HTTP 401`; scenario 3 → `HTTP 401`; scenario 4 → `HTTP 200`; scenario 5 → anything except `401` (400 is fine — it means the guard let the request through and `CreateQuoteDto` validation rejected the empty body, which is correct and unrelated to auth).

- [ ] **Step 14: Stop the server**

Stop the `start:prod` process before moving to Task 2 (it'll be restarted with the client build in Task 3).

---

### Task 2: Frontend — login page, auth context, route guard

**Files:**
- Create: `src/client/lib/apiClient.ts`
- Create: `src/client/lib/authContext.tsx`
- Create: `src/client/pages/LoginPage.tsx`
- Create: `src/client/components/RequireAuth.tsx`
- Modify: `src/client/App.tsx` (add `/login` route, wrap the `Layout` route tree in `RequireAuth`)
- Modify: `src/client/main.tsx` (wrap `<App />` in `<AuthProvider>`)
- Modify: `src/client/components/Layout.tsx` (add a logout control + signed-in username)

**Interfaces:**
- Consumes: `POST /api/auth/login` from Task 1, returning `{ accessToken: string, user: { username: string, role: string } }` on success, non-2xx on failure.
- Produces: `useAuth()` hook (from `src/client/lib/authContext.tsx`) exposing `{ token: string | null, user: { username: string; role: string } | null, login(username, password): Promise<void>, logout(): void }` — this is what sub-project 2 (the `dataStore.ts` API rewire) will read `token` from.
- Produces: `apiFetch(path: string, options?: RequestInit): Promise<Response>` (from `src/client/lib/apiClient.ts`) — a `fetch` wrapper that prefixes `/api` and attaches the stored bearer token. Not consumed by any other code yet; it exists so sub-project 2 doesn't have to invent it.

- [ ] **Step 1: Create the API client helper**

Create `src/client/lib/apiClient.ts`:
```typescript
const API_BASE = '/api';
const TOKEN_KEY = 'viq_auth_token';

export function getAuthToken(): string | null {
  return localStorage.getItem(TOKEN_KEY);
}

export async function apiFetch(path: string, options: RequestInit = {}): Promise<Response> {
  const token = getAuthToken();
  const headers = new Headers(options.headers);
  if (token) {
    headers.set('Authorization', `Bearer ${token}`);
  }
  if (options.body && !headers.has('Content-Type')) {
    headers.set('Content-Type', 'application/json');
  }
  return fetch(`${API_BASE}${path}`, { ...options, headers });
}
```

- [ ] **Step 2: Create the auth context**

Create `src/client/lib/authContext.tsx`:
```tsx
import { createContext, useCallback, useContext, useState, type ReactNode } from 'react';

const TOKEN_KEY = 'viq_auth_token';
const USER_KEY = 'viq_auth_user';

interface AuthUser {
  username: string;
  role: string;
}

interface AuthContextValue {
  token: string | null;
  user: AuthUser | null;
  login: (username: string, password: string) => Promise<void>;
  logout: () => void;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [token, setToken] = useState<string | null>(() => localStorage.getItem(TOKEN_KEY));
  const [user, setUser] = useState<AuthUser | null>(() => {
    const raw = localStorage.getItem(USER_KEY);
    return raw ? (JSON.parse(raw) as AuthUser) : null;
  });

  const login = useCallback(async (username: string, password: string) => {
    const response = await fetch('/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, password }),
    });
    if (!response.ok) {
      throw new Error('Invalid username or password');
    }
    const data = (await response.json()) as { accessToken: string; user: AuthUser };
    localStorage.setItem(TOKEN_KEY, data.accessToken);
    localStorage.setItem(USER_KEY, JSON.stringify(data.user));
    setToken(data.accessToken);
    setUser(data.user);
  }, []);

  const logout = useCallback(() => {
    localStorage.removeItem(TOKEN_KEY);
    localStorage.removeItem(USER_KEY);
    setToken(null);
    setUser(null);
  }, []);

  return (
    <AuthContext.Provider value={{ token, user, login, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return ctx;
}
```

- [ ] **Step 3: Create the route guard**

Create `src/client/components/RequireAuth.tsx`:
```tsx
import type { ReactNode } from 'react';
import { Navigate, useLocation } from 'react-router';
import { useAuth } from '../lib/authContext';

export default function RequireAuth({ children }: { children: ReactNode }) {
  const { token } = useAuth();
  const location = useLocation();

  if (!token) {
    return <Navigate to="/login" state={{ from: location.pathname }} replace />;
  }

  return <>{children}</>;
}
```

- [ ] **Step 4: Create the login page**

Create `src/client/pages/LoginPage.tsx`:
```tsx
import { useState, type FormEvent } from 'react';
import { useNavigate, useLocation } from 'react-router';
import { Plane } from 'lucide-react';
import { useAuth } from '../lib/authContext';

export default function LoginPage() {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const { login } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      await login(username, password);
      const redirectTo = (location.state as { from?: string } | null)?.from ?? '/dashboard';
      navigate(redirectTo, { replace: true });
    } catch {
      setError('Invalid username or password');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="flex h-screen w-screen items-center justify-center bg-background">
      <form onSubmit={handleSubmit} className="w-full max-w-sm space-y-4 rounded-lg border bg-card p-8 shadow-sm">
        <div className="flex items-center gap-2">
          <Plane className="h-6 w-6 text-primary" />
          <span className="text-lg font-bold tracking-tight">VIQ</span>
        </div>
        <div className="space-y-1">
          <label htmlFor="username" className="text-sm font-medium">Username</label>
          <input
            id="username"
            className="w-full rounded-md border px-3 py-2 text-sm"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            autoComplete="username"
            required
          />
        </div>
        <div className="space-y-1">
          <label htmlFor="password" className="text-sm font-medium">Password</label>
          <input
            id="password"
            type="password"
            className="w-full rounded-md border px-3 py-2 text-sm"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoComplete="current-password"
            required
          />
        </div>
        {error && <p className="text-sm text-red-600">{error}</p>}
        <button
          type="submit"
          disabled={submitting}
          className="w-full rounded-md bg-primary px-3 py-2 text-sm font-medium text-primary-foreground disabled:opacity-50"
        >
          {submitting ? 'Signing in...' : 'Sign in'}
        </button>
      </form>
    </div>
  );
}
```

- [ ] **Step 5: Wire the route guard into `App.tsx`**

In `src/client/App.tsx`, add the imports:
```typescript
import LoginPage from './pages/LoginPage'
import RequireAuth from './components/RequireAuth'
```
Add the public login route next to the landing routes:
```tsx
<Route path="/login" element={<LoginPage />} />
```
Wrap the `Layout` element in `RequireAuth` (this is the one existing line that changes):
```tsx
<Route element={<RequireAuth><Layout /></RequireAuth>}>
```
The full file should read:
```tsx
import { Routes, Route } from 'react-router'
import Layout from './components/Layout'
import Dashboard from './pages/Dashboard'
import TripsPage from './pages/TripsPage'
import TripDetail from './pages/TripDetail'
import CommsPage from './pages/CommsPage'
import AuditPage from './pages/AuditPage'
import ReferencePage from './pages/ReferencePage'
import ComposerPage from './pages/ComposerPage'
import LandingPage from './pages/LandingPage'
import LoginPage from './pages/LoginPage'
import RequireAuth from './components/RequireAuth'
import AdminDashboard from './pages/admin/AdminDashboard'
import AdminTrips from './pages/admin/AdminTrips'
import AdminAssets from './pages/admin/AdminAssets'
import AdminSettings from './pages/admin/AdminSettings'
import NewTripWizard from './pages/admin/NewTripWizard'

export default function App() {
  return (
    <Routes>
      {/* Public landing page — no sidebar */}
      <Route path="/" element={<LandingPage />} />
      <Route path="/landing" element={<LandingPage />} />
      <Route path="/login" element={<LoginPage />} />

      {/* Internal app — with sidebar layout, requires auth */}
      <Route element={<RequireAuth><Layout /></RequireAuth>}>
        <Route path="/dashboard" element={<Dashboard />} />
        <Route path="/trips" element={<TripsPage />} />
        <Route path="/trips/:tripId" element={<TripDetail />} />
        <Route path="/comms" element={<CommsPage />} />
        <Route path="/audit" element={<AuditPage />} />
        <Route path="/reference" element={<ReferencePage />} />
        <Route path="/composer" element={<ComposerPage />} />
        <Route path="/admin" element={<AdminDashboard />} />
        <Route path="/admin/trips" element={<AdminTrips />} />
        <Route path="/admin/trips/new" element={<NewTripWizard />} />
        <Route path="/admin/assets" element={<AdminAssets />} />
        <Route path="/admin/settings" element={<AdminSettings />} />
      </Route>
    </Routes>
  )
}
```

- [ ] **Step 6: Wrap the app in `AuthProvider`**

In `src/client/main.tsx`, add the import and wrap `<App />`:
```tsx
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router'
import './index.css'
import App from './App.tsx'
import { AuthProvider } from './lib/authContext'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <BrowserRouter>
      <AuthProvider>
        <App />
      </AuthProvider>
    </BrowserRouter>
  </StrictMode>,
)
```

- [ ] **Step 7: Add a logout control to the admin shell**

In `src/client/components/Layout.tsx`, add the imports:
```typescript
import { useNavigate } from 'react-router';
import { useAuth } from '../lib/authContext';
```
and `LogOut` to the `lucide-react` icon import list (alongside `Shield, Briefcase, ...`).

Inside `export default function Layout()`, add near the top of the function body:
```typescript
const { user, logout } = useAuth();
const navigate = useNavigate();

function handleLogout() {
  logout();
  navigate('/login', { replace: true });
}
```

Replace the "Preview Mode" block at the bottom of the sidebar:
```tsx
<div className="absolute bottom-0 w-full border-t p-4">
  <div className="text-xs text-muted-foreground">
    <p className="font-medium text-foreground">Preview Mode</p>
    <p>Seed data loaded. All times UTC.</p>
  </div>
</div>
```
with:
```tsx
<div className="absolute bottom-0 w-full border-t p-4">
  <div className="mb-2 text-xs text-muted-foreground">
    <p className="font-medium text-foreground">{user?.username ?? 'Signed in'}</p>
    <p>Seed data loaded. All times UTC.</p>
  </div>
  <button
    onClick={handleLogout}
    className="flex w-full items-center rounded-lg px-3 py-2 text-sm font-medium text-muted-foreground hover:bg-accent hover:text-accent-foreground"
  >
    <LogOut className="mr-2 h-4 w-4" />
    Log out
  </button>
</div>
```

---

### Task 3: Full build and end-to-end verification

**Files:** none created or modified — this task only builds and exercises Tasks 1 and 2 together.

**Interfaces:**
- Consumes: everything produced by Task 1 and Task 2.

- [ ] **Step 1: Rebuild everything**

```bash
cd "C:\Backups\InsiderTechSol\Aviation\kimiactuate\viq"
npm run build
```
Expected: `build:server` and `build:client` both complete with no errors (this repeats the `prisma generate` + `nest build` + `tsc` + `vite build` pipeline). If `prisma generate` fails with an `EPERM ... query_engine-windows.dll.node` error, a stale `node.exe` process is holding the file lock — find it with:
```bash
powershell -NoProfile -Command "Get-CimInstance Win32_Process -Filter \"Name='node.exe'\" | Select-Object ProcessId, CommandLine | Format-List"
```
kill any process whose `CommandLine` references this `viq` path, then rerun `npm run build`.

- [ ] **Step 2: Start the app**

Ensure Postgres is up (`docker compose up -d postgres` from the project root if it isn't already running), then:
```bash
npm run start:prod
```
Expected: `jetflow listening on http://localhost:4001` with no errors.

- [ ] **Step 3: Re-run the Task 1 API checks**

Repeat all five `curl` scenarios from Task 1 Step 13 against this build. Expected results are unchanged: login succeeds (200), wrong password fails (401), an unauthenticated protected route fails (401), the same route with a valid token succeeds (200), and the public quotes route is not 401.

- [ ] **Step 4: Browser walkthrough**

Open `http://localhost:4001/`:
1. The public landing/quote page loads with no login prompt.
2. Navigate to `http://localhost:4001/dashboard` directly — you should be redirected to `/login` (not shown the dashboard).
3. On `/login`, submit `admin` / `wrong-password` — an inline "Invalid username or password" error appears and you stay on the page.
4. Submit `admin` / `Admin123!` — you land on `/dashboard` (or wherever you were originally headed) with the sidebar visible.
5. Refresh the page — you stay logged in (the token persists in `localStorage`).
6. Click "Log out" in the sidebar — you're returned to `/login`, and navigating back to `/dashboard` redirects to `/login` again.

- [ ] **Step 5: Leave the app running or stop it, per your preference**

No commit — this task's changes stay in the working tree, per the Global Constraints.
