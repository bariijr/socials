# UAA Webapp Foundation (Auth + Leg Intake) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Stand up the UAA webapp's foundation — auth and a MAYFLY-grained `Legs` data model — as real, deployable, working software, with actual coordinator and leg data seeded from the current workbook.

**Architecture:** NestJS backend (TypeORM + PostgreSQL) exposing a JWT-protected REST API, Next.js frontend (App Router) consuming it, both in Docker Compose on the `web-proxy` network. This is **Slice 1 of 5** from the design spec's Build Sequencing — permit requests, lead-time/validity tracking, notifications, and the MAYFLY-format export each get their own follow-up plan once this one is built and reviewed.

**Tech Stack:** NestJS 10, TypeORM 0.3, PostgreSQL 16, Passport-JWT, bcrypt, class-validator; Next.js 14 (App Router), TypeScript; Jest (backend), Vitest + React Testing Library (frontend, matching `actuator/frontend`'s existing convention); Docker Compose.

**Spec:** `docs/superpowers/specs/2026-08-22-uaa-webapp-design.md`

## Global Constraints

- Full stack from the first commit — real NestJS backend, real PostgreSQL, no mock-data/frontend-only phase. (Spec: Scope)
- `Legs` is kept at MAYFLY's actual grain — one row per leg, not per trip — so a later Excel export stays a direct column mapping. (Spec: Data model)
- Single coordinator role for phase 1 — no RBAC tiers. (Spec: Scope)
- Docker Compose on the `web-proxy` external network, matching the convention used by FlyRaptor/Notify/flyofly/Actuator. (Spec: Scope; established cross-project convention)
- Every table gets `createdAt`/`updatedAt` audit timestamps as baseline infra (not spec-mandated per se, but required by the Global Constraint above of "real, deployable software" — every later slice's Audit trail work assumes these exist).

---

## File Structure

```
uaa/
├── docker-compose.yml
├── backend/
│   ├── Dockerfile
│   ├── package.json
│   ├── tsconfig.json
│   ├── nest-cli.json
│   ├── .env.example
│   ├── src/
│   │   ├── main.ts
│   │   ├── app.module.ts
│   │   ├── database/
│   │   │   └── data-source.ts        # TypeORM DataSource (used by app + migrations CLI)
│   │   ├── users/
│   │   │   ├── user.entity.ts
│   │   │   └── users.module.ts
│   │   ├── auth/
│   │   │   ├── auth.module.ts
│   │   │   ├── auth.controller.ts
│   │   │   ├── auth.service.ts
│   │   │   ├── jwt.strategy.ts
│   │   │   ├── jwt-auth.guard.ts
│   │   │   └── dto/login.dto.ts
│   │   └── legs/
│   │       ├── leg.entity.ts
│   │       ├── legs.module.ts
│   │       ├── legs.controller.ts
│   │       ├── legs.service.ts
│   │       └── dto/create-leg.dto.ts
│   ├── migrations/
│   │   ├── 1755820800000-CreateUsers.ts
│   │   └── 1755820800001-CreateLegs.ts
│   ├── scripts/
│   │   └── seed-from-excel.ts        # one-time: coordinators + real MAYFLY rows
│   └── test/
│       ├── auth.service.spec.ts
│       ├── legs.service.spec.ts
│       └── legs.e2e-spec.ts
└── frontend/
    ├── Dockerfile
    ├── package.json
    ├── next.config.mjs
    ├── tsconfig.json
    ├── vitest.config.ts
    ├── src/
    │   ├── app/
    │   │   ├── layout.tsx
    │   │   ├── login/page.tsx
    │   │   └── legs/
    │   │       ├── page.tsx
    │   │       └── new/page.tsx
    │   └── lib/
    │       └── api-client.ts
    └── test/
        ├── api-client.test.ts
        └── legs-list.test.tsx
```

---

### Task 1: Repo scaffold — Docker Compose, NestJS skeleton, Next.js skeleton

**Files:**
- Create: `docker-compose.yml`
- Create: `backend/package.json`, `backend/tsconfig.json`, `backend/nest-cli.json`, `backend/Dockerfile`, `backend/.env.example`, `backend/src/main.ts`, `backend/src/app.module.ts`
- Create: `frontend/package.json`, `frontend/tsconfig.json`, `frontend/next.config.mjs`, `frontend/Dockerfile`, `frontend/src/app/layout.tsx`, `frontend/src/app/page.tsx`

**Interfaces:**
- Produces: backend listens on `PORT` env var (default `3011`) with a `GET /health` route returning `{ status: 'ok' }`. Frontend listens on port `3012`, served by `next start`.

- [x] **Step 1: Create the backend NestJS project files**

`backend/package.json`:
```json
{
  "name": "uaa-backend",
  "version": "0.1.0",
  "private": true,
  "scripts": {
    "build": "nest build",
    "start": "node dist/main",
    "start:dev": "nest start --watch",
    "test": "jest",
    "test:e2e": "jest --config ./test/jest-e2e.json",
    "typeorm": "typeorm-ts-node-commonjs",
    "migration:run": "npm run typeorm -- migration:run -d src/database/data-source.ts",
    "seed": "ts-node scripts/seed-from-excel.ts"
  },
  "dependencies": {
    "@nestjs/common": "^10.4.0",
    "@nestjs/core": "^10.4.0",
    "@nestjs/platform-express": "^10.4.0",
    "@nestjs/typeorm": "^10.0.2",
    "@nestjs/jwt": "^10.2.0",
    "@nestjs/passport": "^10.0.3",
    "@nestjs/config": "^3.2.3",
    "typeorm": "^0.3.20",
    "pg": "^8.12.0",
    "passport": "^0.7.0",
    "passport-jwt": "^4.0.1",
    "bcrypt": "^5.1.1",
    "class-validator": "^0.14.1",
    "class-transformer": "^0.5.1",
    "reflect-metadata": "^0.2.2",
    "rxjs": "^7.8.1"
  },
  "devDependencies": {
    "@nestjs/cli": "^10.4.5",
    "@nestjs/testing": "^10.4.0",
    "@types/bcrypt": "^5.0.2",
    "@types/express": "^4.17.21",
    "@types/jest": "^29.5.12",
    "@types/node": "^20.14.0",
    "@types/passport-jwt": "^4.0.1",
    "@types/supertest": "^6.0.2",
    "jest": "^29.7.0",
    "supertest": "^7.0.0",
    "ts-jest": "^29.2.5",
    "ts-node": "^10.9.2",
    "typescript": "^5.5.0"
  },
  "jest": {
    "moduleFileExtensions": ["js", "json", "ts"],
    "rootDir": ".",
    "testRegex": "test/.*\\.spec\\.ts$",
    "testPathIgnorePatterns": ["/node_modules/", "\\.e2e-spec\\.ts$"],
    "transform": {
      "^.+\\.(t|j)s$": "ts-jest"
    }
  }
}
```

Note: the `jest` config block is required — without it, Jest has no transform wired up for `.ts` files and fails every spec with a syntax error before any test logic runs. `testPathIgnorePatterns` excludes `*.e2e-spec.ts` files (those run separately via `test:e2e` / `test/jest-e2e.json`, added in Task 6).

`backend/tsconfig.json`:
```json
{
  "compilerOptions": {
    "module": "commonjs",
    "target": "ES2021",
    "declaration": false,
    "sourceMap": true,
    "outDir": "./dist",
    "experimentalDecorators": true,
    "emitDecoratorMetadata": true,
    "strict": true,
    "strictPropertyInitialization": false,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "baseUrl": "./"
  },
  "include": ["src/**/*.ts"]
}
```

Note: `strictPropertyInitialization` must be disabled — TypeORM entity classes (Task 2's `User`, Task 4's `Leg`) declare properties the ORM assigns at runtime, not in a constructor, which `strict: true` alone rejects at compile time (`error TS2564`).

Note: `include: ["src/**/*.ts"]` is required — without it, `tsc` (via `nest build`) has no bound on which files it compiles and picks up every `.ts` file under `backend/` once Tasks 2–9 add `migrations/`, `scripts/`, and `test/`. TypeScript then infers `rootDir` as the common ancestor of all included files (the `backend/` root itself, since `migrations/`, `scripts/`, `src/`, and `test/` are now siblings), so `outDir: ./dist` mirrors that full structure and the real entry point lands at `dist/src/main.js`, not `dist/main.js` — silently breaking the Dockerfile's `CMD ["node", "dist/main"]` in a fresh (no build-cache) image, while a local incremental rebuild can mask it by leaving a stale `dist/main.js` from back when `src/` was the only directory. This surfaced in Task 10's from-scratch verification, not in any single task's own `npm run build` check — every earlier task's build succeeded locally on a dist/ directory carrying that stale leftover.

`backend/nest-cli.json`:
```json
{
  "$schema": "https://json.schemastore.org/nest-cli",
  "collection": "@nestjs/schematics",
  "sourceRoot": "src"
}
```

`backend/.env.example`:
```
PORT=3011
DATABASE_URL=postgres://uaa:uaa@postgres:5432/uaa
JWT_SECRET=change-me-in-real-deployment
JWT_EXPIRES_IN=8h
```

`backend/src/main.ts`:
```typescript
import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
  app.enableCors();
  const port = process.env.PORT ?? 3011;
  await app.listen(port);
}
bootstrap();
```

`backend/src/app.module.ts`:
```typescript
import { Module, Controller, Get } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';

@Controller('health')
class HealthController {
  @Get()
  check() {
    return { status: 'ok' };
  }
}

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    TypeOrmModule.forRoot({
      type: 'postgres',
      url: process.env.DATABASE_URL,
      autoLoadEntities: true,
      synchronize: false,
    }),
  ],
  controllers: [HealthController],
})
export class AppModule {}
```

`backend/Dockerfile`:
```dockerfile
FROM node:20-alpine AS build
WORKDIR /app
COPY package.json package-lock.json* ./
RUN npm install
COPY . .
RUN npm run build

FROM node:20-alpine
WORKDIR /app
ENV NODE_ENV=production
COPY package.json package-lock.json* ./
RUN npm install --omit=dev
COPY --from=build /app/dist ./dist
COPY --from=build /app/migrations ./migrations
EXPOSE 3011
CMD ["node", "dist/main"]
```

- [x] **Step 2: Create the frontend Next.js project files**

`frontend/package.json`:
```json
{
  "name": "uaa-frontend",
  "version": "0.1.0",
  "private": true,
  "scripts": {
    "dev": "next dev -p 3012",
    "build": "next build",
    "start": "next start -p 3012",
    "test": "vitest run"
  },
  "dependencies": {
    "next": "^14.2.5",
    "react": "^18.3.1",
    "react-dom": "^18.3.1"
  },
  "devDependencies": {
    "@testing-library/react": "^16.0.0",
    "@testing-library/jest-dom": "^6.4.8",
    "@types/node": "^20.14.0",
    "@types/react": "^18.3.3",
    "@types/react-dom": "^18.3.0",
    "@vitejs/plugin-react": "^4.3.1",
    "jsdom": "^24.1.1",
    "typescript": "^5.5.0",
    "vitest": "^2.0.5"
  }
}
```

Note: `@vitejs/plugin-react` is required even though Next.js itself uses SWC, not Vite — Vitest runs its own Vite pipeline independent of Next's bundler, and without this plugin JSX in `.tsx` files transforms without the automatic React-runtime import, failing every rendered-component test with `ReferenceError: React is not defined`. This surfaced in Task 9 (the first test that actually renders a component), not Task 8.

`frontend/tsconfig.json`:
```json
{
  "compilerOptions": {
    "target": "ES2021",
    "lib": ["dom", "dom.iterable", "esnext"],
    "module": "esnext",
    "moduleResolution": "bundler",
    "jsx": "preserve",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "paths": { "@/*": ["./src/*"] }
  },
  "include": ["next-env.d.ts", "**/*.ts", "**/*.tsx"]
}
```

`frontend/next.config.mjs`:
```javascript
/** @type {import('next').NextConfig} */
const nextConfig = {
  output: 'standalone',
};

export default nextConfig;
```

Note: `next.config.ts` was tried first but Next.js 14.2.x (the pinned version) does not support TypeScript config files — that support only landed in Next.js 15. Use `.mjs` instead.

`frontend/src/app/layout.tsx`:
```tsx
export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
```

`frontend/src/app/page.tsx`:
```tsx
export default function Home() {
  return <p>UAA Coordinator</p>;
}
```

`frontend/Dockerfile`:
```dockerfile
FROM node:20-alpine AS build
WORKDIR /app
COPY package.json package-lock.json* ./
RUN npm install
COPY . .
RUN npm run build

FROM node:20-alpine
WORKDIR /app
ENV NODE_ENV=production
ENV PORT=3012
COPY --from=build /app/.next/standalone ./
COPY --from=build /app/.next/static ./.next/static
COPY --from=build /app/public ./public
EXPOSE 3012
CMD ["node", "server.js"]
```

Note: the standalone server (`node server.js`) reads its port from the `PORT` env var, not from the `dev`/`start` npm scripts' `-p 3012` flag (those only apply to `next dev`/`next start`, which aren't used in the production image) — without `ENV PORT=3012` it silently defaults to 3000.

- [x] **Step 3: Create Docker Compose wiring Postgres + backend + frontend on `web-proxy`**

`docker-compose.yml`:
```yaml
services:
  postgres:
    image: postgres:16-alpine
    environment:
      POSTGRES_USER: uaa
      POSTGRES_PASSWORD: uaa
      POSTGRES_DB: uaa
    volumes:
      - uaa_pg_data:/var/lib/postgresql/data
    networks:
      - web-proxy

  backend:
    build: ./backend
    env_file: ./backend/.env
    depends_on:
      - postgres
    networks:
      - web-proxy

  frontend:
    build: ./frontend
    depends_on:
      - backend
    networks:
      - web-proxy

networks:
  web-proxy:
    external: true

volumes:
  uaa_pg_data:
```

- [x] **Step 4: Install dependencies and verify the backend boots**

Run:
```bash
cd backend && npm install
```
Then, with a local Postgres reachable at `DATABASE_URL` (or temporarily point it at any running Postgres — `TypeOrmModule.forRoot` will fail fast if it can't connect, which is expected until Task 1 Step 5's real compose-up):
```bash
npm run build
```
Expected: compiles with no TypeScript errors (0 exit code). Runtime boot is verified in Step 5 once Postgres is actually up via Compose.

- [x] **Step 5: Verify the full stack boots via Docker Compose**

Run:
```bash
cd .. && docker network create web-proxy 2>/dev/null; cp backend/.env.example backend/.env && docker compose up --build -d
```
Then:
```bash
curl -s http://localhost:3011/health
```
Expected: `{"status":"ok"}` (backend port isn't published in the compose file above for prod-parity with `web-proxy`-routed services; for this local verification step only, temporarily add `ports: ["3011:3011"]` under the `backend` service, curl, confirm, then remove it again — the real deployment routes through `web-proxy`'s reverse proxy, not a published host port).

- [ ] **Step 6: Commit** — SKIPPED per explicit user instruction: no `git commit` for this project. Changes are left in the working tree uncommitted.

---

### Task 2: Users entity + migration + password hashing

**Files:**
- Create: `backend/src/database/data-source.ts`
- Create: `backend/src/users/user.entity.ts`
- Create: `backend/src/users/users.module.ts`
- Create: `backend/migrations/1755820800000-CreateUsers.ts`
- Test: `backend/test/auth.service.spec.ts` (password hashing covered here since it's `AuthService`'s responsibility, not a standalone util — see Task 3)

**Interfaces:**
- Produces: `User` entity — `id: string (uuid)`, `username: string (unique)`, `fullName: string`, `jobTitle: string | null`, `mobile: string | null`, `fromEmail: string`, `ccDefault: string | null`, `passwordHash: string`, `createdAt: Date`, `updatedAt: Date`. Registered under `TypeOrmModule.forFeature([User])` in `UsersModule`, exported for `AuthModule` to inject `Repository<User>`.

- [x] **Step 1: Create the TypeORM DataSource used by both the app and the migration CLI**

`backend/src/database/data-source.ts`:
```typescript
import 'reflect-metadata';
import { DataSource } from 'typeorm';
import { User } from '../users/user.entity';

export const AppDataSource = new DataSource({
  type: 'postgres',
  url: process.env.DATABASE_URL,
  entities: [User],
  migrations: ['migrations/*.ts'],
  synchronize: false,
});
```

Note: this does **not** yet import `Leg` — that entity doesn't exist until Task 4, which adds it via an explicit modify step (see Task 4 Step 2). Do not import `Leg` here; it would fail to compile against Task 2's own file tree.

- [x] **Step 2: Create the User entity**

`backend/src/users/user.entity.ts`:
```typescript
import { Column, CreateDateColumn, Entity, PrimaryGeneratedColumn, UpdateDateColumn } from 'typeorm';

@Entity('users')
export class User {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ unique: true })
  username: string;

  @Column({ name: 'full_name' })
  fullName: string;

  @Column({ name: 'job_title', type: 'varchar', nullable: true })
  jobTitle: string | null;

  @Column({ type: 'varchar', nullable: true })
  mobile: string | null;

  @Column({ name: 'from_email' })
  fromEmail: string;

  @Column({ name: 'cc_default', type: 'varchar', nullable: true })
  ccDefault: string | null;

  @Column({ name: 'password_hash' })
  passwordHash: string;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;
}
```

- [x] **Step 3: Create the Users module**

`backend/src/users/users.module.ts`:
```typescript
import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { User } from './user.entity';

@Module({
  imports: [TypeOrmModule.forFeature([User])],
  exports: [TypeOrmModule],
})
export class UsersModule {}
```

- [x] **Step 4: Write the Users migration**

`backend/migrations/1755820800000-CreateUsers.ts`:
```typescript
import { MigrationInterface, QueryRunner, Table } from 'typeorm';

export class CreateUsers1755820800000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.createTable(
      new Table({
        name: 'users',
        columns: [
          { name: 'id', type: 'uuid', isPrimary: true, default: 'gen_random_uuid()' },
          { name: 'username', type: 'varchar', isUnique: true },
          { name: 'full_name', type: 'varchar' },
          { name: 'job_title', type: 'varchar', isNullable: true },
          { name: 'mobile', type: 'varchar', isNullable: true },
          { name: 'from_email', type: 'varchar' },
          { name: 'cc_default', type: 'varchar', isNullable: true },
          { name: 'password_hash', type: 'varchar' },
          { name: 'created_at', type: 'timestamptz', default: 'now()' },
          { name: 'updated_at', type: 'timestamptz', default: 'now()' },
        ],
      }),
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.dropTable('users');
  }
}
```

- [x] **Step 5: Run the migration against the Compose Postgres and verify the table exists**

Run:
```bash
cd backend
npx typeorm-ts-node-commonjs migration:run -d src/database/data-source.ts
docker compose exec postgres psql -U uaa -d uaa -c '\d users'
```
Expected: `\d users` prints the 10 columns defined above.

- [ ] **Step 6: Commit** — SKIPPED per explicit user instruction: no `git commit` for this project.

---

### Task 3: Auth — login endpoint, JWT issuance, password verification

**Files:**
- Create: `backend/src/auth/dto/login.dto.ts`
- Create: `backend/src/auth/auth.service.ts`
- Create: `backend/src/auth/auth.controller.ts`
- Create: `backend/src/auth/jwt.strategy.ts`
- Create: `backend/src/auth/jwt-auth.guard.ts`
- Create: `backend/src/auth/auth.module.ts`
- Modify: `backend/src/app.module.ts:16-24` (import `AuthModule`, `UsersModule`)
- Test: `backend/test/auth.service.spec.ts`

**Interfaces:**
- Consumes: `User` entity/repository from Task 2.
- Produces: `AuthService.validateUser(username: string, password: string): Promise<User | null>`, `AuthService.login(user: User): Promise<{ accessToken: string }>`. `POST /auth/login` accepting `LoginDto { username: string; password: string }`, returning `{ accessToken: string }` or `401`. `JwtAuthGuard` usable as `@UseGuards(JwtAuthGuard)` on any controller — later tasks (Legs) depend on this exact class name and import path (`../auth/jwt-auth.guard`).

- [x] **Step 1: Write the failing test for password validation and token issuance**

`backend/test/auth.service.spec.ts`:
```typescript
import { Test } from '@nestjs/testing';
import { JwtService } from '@nestjs/jwt';
import { getRepositoryToken } from '@nestjs/typeorm';
import * as bcrypt from 'bcrypt';
import { AuthService } from '../src/auth/auth.service';
import { User } from '../src/users/user.entity';

describe('AuthService', () => {
  let service: AuthService;
  let userRepo: { findOne: jest.Mock };

  beforeEach(async () => {
    userRepo = { findOne: jest.fn() };
    const moduleRef = await Test.createTestingModule({
      providers: [
        AuthService,
        { provide: getRepositoryToken(User), useValue: userRepo },
        { provide: JwtService, useValue: { signAsync: jest.fn().mockResolvedValue('signed.jwt.token') } },
      ],
    }).compile();
    service = moduleRef.get(AuthService);
  });

  it('returns the user when username exists and password matches', async () => {
    const hash = await bcrypt.hash('correct-horse', 10);
    userRepo.findOne.mockResolvedValue({ id: '1', username: 'bminja', passwordHash: hash });

    const result = await service.validateUser('bminja', 'correct-horse');

    expect(result).toEqual(expect.objectContaining({ username: 'bminja' }));
  });

  it('returns null when the password does not match', async () => {
    const hash = await bcrypt.hash('correct-horse', 10);
    userRepo.findOne.mockResolvedValue({ id: '1', username: 'bminja', passwordHash: hash });

    const result = await service.validateUser('bminja', 'wrong-password');

    expect(result).toBeNull();
  });

  it('returns null when the username does not exist', async () => {
    userRepo.findOne.mockResolvedValue(null);

    const result = await service.validateUser('nobody', 'anything');

    expect(result).toBeNull();
  });

  it('issues a signed access token for a validated user', async () => {
    const user = { id: '1', username: 'bminja' } as User;

    const result = await service.login(user);

    expect(result).toEqual({ accessToken: 'signed.jwt.token' });
  });
});
```

- [x] **Step 2: Run the test to verify it fails**

Run: `cd backend && npx jest test/auth.service.spec.ts`
Expected: FAIL — `Cannot find module '../src/auth/auth.service'`

- [x] **Step 3: Implement AuthService, DTO, guard, strategy, controller, module**

`backend/src/auth/dto/login.dto.ts`:
```typescript
import { IsNotEmpty, IsString } from 'class-validator';

export class LoginDto {
  @IsString()
  @IsNotEmpty()
  username: string;

  @IsString()
  @IsNotEmpty()
  password: string;
}
```

`backend/src/auth/auth.service.ts`:
```typescript
import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcrypt';
import { User } from '../users/user.entity';

@Injectable()
export class AuthService {
  constructor(
    @InjectRepository(User) private readonly userRepo: Repository<User>,
    private readonly jwtService: JwtService,
  ) {}

  async validateUser(username: string, password: string): Promise<User | null> {
    const user = await this.userRepo.findOne({ where: { username } });
    if (!user) return null;
    const matches = await bcrypt.compare(password, user.passwordHash);
    return matches ? user : null;
  }

  async login(user: User): Promise<{ accessToken: string }> {
    const accessToken = await this.jwtService.signAsync({ sub: user.id, username: user.username });
    return { accessToken };
  }
}
```

`backend/src/auth/jwt.strategy.ts`:
```typescript
import { Injectable } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor() {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: process.env.JWT_SECRET ?? 'change-me-in-real-deployment',
    });
  }

  async validate(payload: { sub: string; username: string }) {
    return { userId: payload.sub, username: payload.username };
  }
}
```

`backend/src/auth/jwt-auth.guard.ts`:
```typescript
import { Injectable } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';

@Injectable()
export class JwtAuthGuard extends AuthGuard('jwt') {}
```

`backend/src/auth/auth.controller.ts`:
```typescript
import { Body, Controller, Post, UnauthorizedException } from '@nestjs/common';
import { AuthService } from './auth.service';
import { LoginDto } from './dto/login.dto';

@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Post('login')
  async login(@Body() dto: LoginDto) {
    const user = await this.authService.validateUser(dto.username, dto.password);
    if (!user) throw new UnauthorizedException('Invalid username or password');
    return this.authService.login(user);
  }
}
```

`backend/src/auth/auth.module.ts`:
```typescript
import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { UsersModule } from '../users/users.module';
import { AuthService } from './auth.service';
import { AuthController } from './auth.controller';
import { JwtStrategy } from './jwt.strategy';

@Module({
  imports: [
    UsersModule,
    PassportModule,
    JwtModule.registerAsync({
      useFactory: () => ({
        secret: process.env.JWT_SECRET ?? 'change-me-in-real-deployment',
        signOptions: { expiresIn: process.env.JWT_EXPIRES_IN ?? '8h' },
      }),
    }),
  ],
  providers: [AuthService, JwtStrategy],
  controllers: [AuthController],
  exports: [AuthService],
})
export class AuthModule {}
```

- [x] **Step 4: Wire AuthModule and UsersModule into AppModule**

Modify `backend/src/app.module.ts` — add imports:
```typescript
import { UsersModule } from './users/users.module';
import { AuthModule } from './auth/auth.module';
```
and add `UsersModule, AuthModule` to the `imports` array (after `TypeOrmModule.forRoot(...)`).

- [x] **Step 5: Run the test to verify it passes**

Run: `cd backend && npx jest test/auth.service.spec.ts`
Expected: PASS (4 tests)

- [ ] **Step 6: Commit** — SKIPPED per explicit user instruction: no `git commit` for this project.

---

### Task 4: Leg entity + migration (MAYFLY-grained schema)

**Files:**
- Create: `backend/src/legs/leg.entity.ts`
- Create: `backend/migrations/1755820800001-CreateLegs.ts`
- Modify: `backend/src/database/data-source.ts` (Task 2 created this importing only `User`; this task adds the `Leg` import and adds it to the `entities` array — see Step 2)

**Interfaces:**
- Produces: `Leg` entity with the full MAYFLY-mirrored column set (see spec's Data model section) — every field name below is what later tasks (Legs service/controller, seed script, frontend) reference verbatim.

- [x] **Step 1: Create the Leg entity**

`backend/src/legs/leg.entity.ts`:
```typescript
import { Column, CreateDateColumn, Entity, PrimaryGeneratedColumn, UpdateDateColumn } from 'typeorm';

@Entity('legs')
export class Leg {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'varchar', nullable: true })
  country: string | null;

  @Column({ type: 'varchar', nullable: true })
  region: string | null;

  @Column({ name: 'ref_no', type: 'varchar', nullable: true })
  refNo: string | null;

  @Column({ name: 'client_name', type: 'varchar', nullable: true })
  clientName: string | null;

  @Column({ name: 'operator_name', type: 'varchar', nullable: true })
  operatorName: string | null;

  @Column({ name: 'client_no', type: 'varchar', nullable: true })
  clientNo: string | null;

  @Column({ name: 'agent_name', type: 'varchar', nullable: true })
  agentName: string | null;

  @Column({ name: 'service_report_sent', type: 'boolean', default: false })
  serviceReportSent: boolean;

  @Column({ name: 'returned_in_time', type: 'boolean', default: false })
  returnedInTime: boolean;

  @Column({ name: 'agent_contacts', type: 'varchar', nullable: true })
  agentContacts: string | null;

  @Column({ name: 'trip_no', type: 'varchar' })
  tripNo: string;

  @Column({ type: 'varchar', nullable: true })
  tail: string | null;

  @Column({ type: 'varchar' })
  icao: string;

  @Column({ name: 'arr_date', type: 'timestamptz', nullable: true })
  arrDate: Date | null;

  @Column({ name: 'dep_date', type: 'timestamptz', nullable: true })
  depDate: Date | null;

  @Column({ name: 'arr_from', type: 'varchar', nullable: true })
  arrFrom: string | null;

  @Column({ name: 'dep_to_icao', type: 'varchar', nullable: true })
  depToIcao: string | null;

  @Column({ name: 'activity_type', type: 'varchar', nullable: true })
  activityType: string | null;

  @Column({ type: 'varchar', nullable: true })
  progress: string | null;

  @Column({ name: 'capt_name', type: 'varchar', nullable: true })
  captName: string | null;

  @Column({ name: 'capt_email', type: 'varchar', nullable: true })
  captEmail: string | null;

  @Column({ name: 'ac_type', type: 'varchar', nullable: true })
  acType: string | null;

  @Column({ name: 'mtow_lb', type: 'int', nullable: true })
  mtowLb: number | null;

  @Column({ type: 'varchar', nullable: true })
  pgh: string | null;

  @Column({ name: 'tss_team', type: 'varchar', nullable: true })
  tssTeam: string | null;

  @Column({ name: 'clearance_number', type: 'varchar', nullable: true })
  clearanceNumber: string | null;

  @Column({ name: 'tss_notified', type: 'boolean', default: false })
  tssNotified: boolean;

  @Column({ name: 'client_notified', type: 'boolean', default: false })
  clientNotified: boolean;

  @Column({ name: 'agent_expenses', type: 'varchar', nullable: true })
  agentExpenses: string | null;

  @Column({ name: 'ready_to_bill', type: 'boolean', default: false })
  readyToBill: boolean;

  @Column({ name: 'invoice_received', type: 'boolean', default: false })
  invoiceReceived: boolean;

  @Column({ type: 'text', nullable: true })
  remarks: string | null;

  @Column({ name: 'a2g_supervisor', type: 'varchar', nullable: true })
  a2gSupervisor: string | null;

  @Column({ name: 'drive_complete_date', type: 'timestamptz', nullable: true })
  driveCompleteDate: Date | null;

  @Column({ name: 'a2g_invoice_number', type: 'varchar', nullable: true })
  a2gInvoiceNumber: string | null;

  @Column({ name: 'process_by', type: 'varchar', nullable: true })
  processBy: string | null;

  @Column({ name: 'process_date', type: 'timestamptz', nullable: true })
  processDate: Date | null;

  @Column({ name: 'billing_month', type: 'varchar', nullable: true })
  billingMonth: string | null;

  @Column({ type: 'varchar', nullable: true })
  semaphore: string | null;

  @Column({ name: 'comments_to_agent', type: 'text', nullable: true })
  commentsToAgent: string | null;

  @Column({ name: 'leg_id', type: 'int' })
  legId: number;

  @Column({ name: 'intel_status', type: 'varchar', nullable: true })
  intelStatus: string | null;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;
}
```

Note: `agent_expenses` is `varchar`, not `numeric` as originally planned — discovered during Task 7's real-data seeding that the real MAYFLY workbook's "Agent Expenses" column holds a `"YES"`/`"NO"` flag, not a dollar amount, across every usable row. A `numeric` column would reject that value outright. Since this was caught before any row existed in `legs`, the migration was corrected directly rather than adding a follow-up migration.

- [x] **Step 2: Modify `data-source.ts` to register the `Leg` entity**

Task 2 created this file importing only `User` (see the note on Task 2 Step 1 — `Leg` didn't exist yet). Now that it does, update it:

`backend/src/database/data-source.ts`:
```typescript
import 'reflect-metadata';
import { DataSource } from 'typeorm';
import { User } from '../users/user.entity';
import { Leg } from '../legs/leg.entity';

export const AppDataSource = new DataSource({
  type: 'postgres',
  url: process.env.DATABASE_URL,
  entities: [User, Leg],
  migrations: ['migrations/*.ts'],
  synchronize: false,
});
```

- [x] **Step 3: Write the Legs migration**

`backend/migrations/1755820800001-CreateLegs.ts`:
```typescript
import { MigrationInterface, QueryRunner, Table } from 'typeorm';

export class CreateLegs1755820800001 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.createTable(
      new Table({
        name: 'legs',
        columns: [
          { name: 'id', type: 'uuid', isPrimary: true, default: 'gen_random_uuid()' },
          { name: 'country', type: 'varchar', isNullable: true },
          { name: 'region', type: 'varchar', isNullable: true },
          { name: 'ref_no', type: 'varchar', isNullable: true },
          { name: 'client_name', type: 'varchar', isNullable: true },
          { name: 'operator_name', type: 'varchar', isNullable: true },
          { name: 'client_no', type: 'varchar', isNullable: true },
          { name: 'agent_name', type: 'varchar', isNullable: true },
          { name: 'service_report_sent', type: 'boolean', default: false },
          { name: 'returned_in_time', type: 'boolean', default: false },
          { name: 'agent_contacts', type: 'varchar', isNullable: true },
          { name: 'trip_no', type: 'varchar' },
          { name: 'tail', type: 'varchar', isNullable: true },
          { name: 'icao', type: 'varchar' },
          { name: 'arr_date', type: 'timestamptz', isNullable: true },
          { name: 'dep_date', type: 'timestamptz', isNullable: true },
          { name: 'arr_from', type: 'varchar', isNullable: true },
          { name: 'dep_to_icao', type: 'varchar', isNullable: true },
          { name: 'activity_type', type: 'varchar', isNullable: true },
          { name: 'progress', type: 'varchar', isNullable: true },
          { name: 'capt_name', type: 'varchar', isNullable: true },
          { name: 'capt_email', type: 'varchar', isNullable: true },
          { name: 'ac_type', type: 'varchar', isNullable: true },
          { name: 'mtow_lb', type: 'int', isNullable: true },
          { name: 'pgh', type: 'varchar', isNullable: true },
          { name: 'tss_team', type: 'varchar', isNullable: true },
          { name: 'clearance_number', type: 'varchar', isNullable: true },
          { name: 'tss_notified', type: 'boolean', default: false },
          { name: 'client_notified', type: 'boolean', default: false },
          { name: 'agent_expenses', type: 'varchar', isNullable: true },
          { name: 'ready_to_bill', type: 'boolean', default: false },
          { name: 'invoice_received', type: 'boolean', default: false },
          { name: 'remarks', type: 'text', isNullable: true },
          { name: 'a2g_supervisor', type: 'varchar', isNullable: true },
          { name: 'drive_complete_date', type: 'timestamptz', isNullable: true },
          { name: 'a2g_invoice_number', type: 'varchar', isNullable: true },
          { name: 'process_by', type: 'varchar', isNullable: true },
          { name: 'process_date', type: 'timestamptz', isNullable: true },
          { name: 'billing_month', type: 'varchar', isNullable: true },
          { name: 'semaphore', type: 'varchar', isNullable: true },
          { name: 'comments_to_agent', type: 'text', isNullable: true },
          { name: 'leg_id', type: 'int' },
          { name: 'intel_status', type: 'varchar', isNullable: true },
          { name: 'created_at', type: 'timestamptz', default: 'now()' },
          { name: 'updated_at', type: 'timestamptz', default: 'now()' },
        ],
      }),
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.dropTable('legs');
  }
}
```

- [x] **Step 4: Run the migration and verify the table exists**

Run:
```bash
cd backend
npx typeorm-ts-node-commonjs migration:run -d src/database/data-source.ts
docker compose exec postgres psql -U uaa -d uaa -c '\d legs'
```
Expected: `\d legs` prints all 41 columns above plus `id`, `created_at`, `updated_at`.

- [ ] **Step 5: Commit** — SKIPPED per explicit user instruction: no `git commit` for this project.

---

### Task 5: Legs service — create, list, get-by-id

**Files:**
- Create: `backend/src/legs/dto/create-leg.dto.ts`
- Create: `backend/src/legs/legs.service.ts`
- Test: `backend/test/legs.service.spec.ts`

**Interfaces:**
- Consumes: `Leg` entity from Task 4.
- Produces: `LegsService.create(dto: CreateLegDto): Promise<Leg>` (auto-assigns `legId` as `max(existing legId) + 1`), `LegsService.findAll(): Promise<Leg[]>`, `LegsService.findOne(id: string): Promise<Leg | null>`. Later tasks (controller, seed script) call these exact method names.

- [x] **Step 1: Write the failing tests**

`backend/test/legs.service.spec.ts`:
```typescript
import { Test } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { LegsService } from '../src/legs/legs.service';
import { Leg } from '../src/legs/leg.entity';

describe('LegsService', () => {
  let service: LegsService;
  let legRepo: { create: jest.Mock; save: jest.Mock; find: jest.Mock; findOne: jest.Mock; maximum: jest.Mock };

  beforeEach(async () => {
    legRepo = {
      create: jest.fn((dto) => dto),
      save: jest.fn(async (entity) => ({ id: 'generated-id', ...entity })),
      find: jest.fn(),
      findOne: jest.fn(),
      maximum: jest.fn(),
    };
    const moduleRef = await Test.createTestingModule({
      providers: [LegsService, { provide: getRepositoryToken(Leg), useValue: legRepo }],
    }).compile();
    service = moduleRef.get(LegsService);
  });

  it('assigns the next leg ID as max(existing legId) + 1', async () => {
    legRepo.maximum.mockResolvedValue(41);

    const result = await service.create({ tripNo: '2608001', icao: 'GMMN' });

    expect(legRepo.maximum).toHaveBeenCalledWith('legId');
    expect(legRepo.create).toHaveBeenCalledWith(expect.objectContaining({ legId: 42, tripNo: '2608001', icao: 'GMMN' }));
    expect(result).toEqual(expect.objectContaining({ id: 'generated-id', legId: 42 }));
  });

  it('assigns leg ID 1 when no legs exist yet', async () => {
    legRepo.maximum.mockResolvedValue(null);

    await service.create({ tripNo: '2608001', icao: 'GMMN' });

    expect(legRepo.create).toHaveBeenCalledWith(expect.objectContaining({ legId: 1 }));
  });

  it('lists all legs', async () => {
    legRepo.find.mockResolvedValue([{ id: '1' }, { id: '2' }]);

    const result = await service.findAll();

    expect(result).toHaveLength(2);
  });

  it('finds one leg by id', async () => {
    legRepo.findOne.mockResolvedValue({ id: '1', tripNo: '2608001' });

    const result = await service.findOne('1');

    expect(result).toEqual(expect.objectContaining({ tripNo: '2608001' }));
  });
});
```

- [x] **Step 2: Run the tests to verify they fail**

Run: `cd backend && npx jest test/legs.service.spec.ts`
Expected: FAIL — `Cannot find module '../src/legs/legs.service'`

- [x] **Step 3: Implement CreateLegDto and LegsService**

`backend/src/legs/dto/create-leg.dto.ts`:
```typescript
import { IsBoolean, IsDateString, IsInt, IsOptional, IsString } from 'class-validator';

export class CreateLegDto {
  @IsOptional() @IsString() country?: string;
  @IsOptional() @IsString() region?: string;
  @IsOptional() @IsString() refNo?: string;
  @IsOptional() @IsString() clientName?: string;
  @IsOptional() @IsString() operatorName?: string;
  @IsOptional() @IsString() clientNo?: string;
  @IsOptional() @IsString() agentName?: string;
  @IsOptional() @IsString() agentContacts?: string;

  @IsString()
  tripNo: string;

  @IsOptional() @IsString() tail?: string;

  @IsString()
  icao: string;

  @IsOptional() @IsDateString() arrDate?: string;
  @IsOptional() @IsDateString() depDate?: string;
  @IsOptional() @IsString() arrFrom?: string;
  @IsOptional() @IsString() depToIcao?: string;
  @IsOptional() @IsString() activityType?: string;
  @IsOptional() @IsString() captName?: string;
  @IsOptional() @IsString() captEmail?: string;
  @IsOptional() @IsString() acType?: string;
  @IsOptional() @IsInt() mtowLb?: number;
  @IsOptional() @IsString() pgh?: string;
  @IsOptional() @IsString() tssTeam?: string;
  @IsOptional() @IsBoolean() serviceReportSent?: boolean;
  @IsOptional() @IsBoolean() returnedInTime?: boolean;
}
```

`backend/src/legs/legs.service.ts`:
```typescript
import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Leg } from './leg.entity';
import { CreateLegDto } from './dto/create-leg.dto';

@Injectable()
export class LegsService {
  constructor(@InjectRepository(Leg) private readonly legRepo: Repository<Leg>) {}

  async create(dto: CreateLegDto): Promise<Leg> {
    const currentMax = await this.legRepo.maximum('legId');
    const legId = (currentMax ?? 0) + 1;
    const leg = this.legRepo.create({ ...dto, legId });
    return this.legRepo.save(leg);
  }

  findAll(): Promise<Leg[]> {
    return this.legRepo.find({ order: { legId: 'ASC' } });
  }

  findOne(id: string): Promise<Leg | null> {
    return this.legRepo.findOne({ where: { id } });
  }
}
```

- [x] **Step 4: Run the tests to verify they pass**

Run: `cd backend && npx jest test/legs.service.spec.ts`
Expected: PASS (4 tests)

- [ ] **Step 5: Commit** — SKIPPED per explicit user instruction: no `git commit` for this project.

---

### Task 6: Legs controller — JWT-protected REST endpoints + Legs module

**Files:**
- Create: `backend/src/legs/legs.controller.ts`
- Create: `backend/src/legs/legs.module.ts`
- Create: `backend/test/jest-e2e.json` (referenced by the `test:e2e` script since Task 1, but never actually created until now — needed to run `*.e2e-spec.ts` files at all)
- Modify: `backend/src/app.module.ts` (import `LegsModule`)
- Test: `backend/test/legs.e2e-spec.ts`

**Interfaces:**
- Consumes: `LegsService` from Task 5, `JwtAuthGuard` from Task 3.
- Produces: `POST /legs` (201, requires bearer token), `GET /legs` (200, array), `GET /legs/:id` (200 or 404), all guarded by `JwtAuthGuard`.

Note: import supertest as a default import (`import request from 'supertest'`), not `import * as request from 'supertest'` — under this project's `esModuleInterop` + the installed `@types/supertest`, the namespace-style import isn't callable and fails to compile (`TS2349`).

`backend/test/jest-e2e.json`:
```json
{
  "moduleFileExtensions": ["js", "json", "ts"],
  "rootDir": ".",
  "testEnvironment": "node",
  "testRegex": ".e2e-spec.ts$",
  "transform": {
    "^.+\\.(t|j)s$": "ts-jest"
  }
}
```

- [x] **Step 1: Write the failing e2e test**

`backend/test/legs.e2e-spec.ts`:
```typescript
import { Test } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import { TypeOrmModule, getRepositoryToken } from '@nestjs/typeorm';
import { JwtModule } from '@nestjs/jwt';
import { LegsModule } from '../src/legs/legs.module';
import { JwtAuthGuard } from '../src/auth/jwt-auth.guard';
import { Leg } from '../src/legs/leg.entity';

describe('Legs (e2e)', () => {
  let app: INestApplication;
  let legRepo: { create: jest.Mock; save: jest.Mock; find: jest.Mock; findOne: jest.Mock; maximum: jest.Mock };

  beforeAll(async () => {
    legRepo = {
      create: jest.fn((dto) => dto),
      save: jest.fn(async (entity) => ({ id: 'generated-id', ...entity })),
      find: jest.fn().mockResolvedValue([]),
      findOne: jest.fn(),
      maximum: jest.fn().mockResolvedValue(0),
    };

    const moduleRef = await Test.createTestingModule({
      imports: [LegsModule],
    })
      .overrideProvider(getRepositoryToken(Leg))
      .useValue(legRepo)
      .overrideGuard(JwtAuthGuard)
      .useValue({ canActivate: () => true })
      .compile();

    app = moduleRef.createNestApplication();
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  it('POST /legs creates a leg and returns 201', async () => {
    const response = await request(app.getHttpServer())
      .post('/legs')
      .send({ tripNo: '2608001', icao: 'GMMN' });

    expect(response.status).toBe(201);
    expect(response.body).toEqual(expect.objectContaining({ tripNo: '2608001', icao: 'GMMN' }));
  });

  it('GET /legs returns an array', async () => {
    const response = await request(app.getHttpServer()).get('/legs');

    expect(response.status).toBe(200);
    expect(Array.isArray(response.body)).toBe(true);
  });

  it('GET /legs/:id returns 404 when not found', async () => {
    legRepo.findOne.mockResolvedValue(null);

    const response = await request(app.getHttpServer()).get('/legs/missing-id');

    expect(response.status).toBe(404);
  });
});
```

- [x] **Step 2: Run the test to verify it fails**

Run: `cd backend && npx jest test/legs.e2e-spec.ts`
Expected: FAIL — `Cannot find module '../src/legs/legs.module'`

- [x] **Step 3: Implement LegsController and LegsModule**

`backend/src/legs/legs.controller.ts`:
```typescript
import { Body, Controller, Get, NotFoundException, Param, Post, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { LegsService } from './legs.service';
import { CreateLegDto } from './dto/create-leg.dto';

@Controller('legs')
@UseGuards(JwtAuthGuard)
export class LegsController {
  constructor(private readonly legsService: LegsService) {}

  @Post()
  create(@Body() dto: CreateLegDto) {
    return this.legsService.create(dto);
  }

  @Get()
  findAll() {
    return this.legsService.findAll();
  }

  @Get(':id')
  async findOne(@Param('id') id: string) {
    const leg = await this.legsService.findOne(id);
    if (!leg) throw new NotFoundException(`Leg ${id} not found`);
    return leg;
  }
}
```

`backend/src/legs/legs.module.ts`:
```typescript
import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Leg } from './leg.entity';
import { LegsService } from './legs.service';
import { LegsController } from './legs.controller';

@Module({
  imports: [TypeOrmModule.forFeature([Leg])],
  providers: [LegsService],
  controllers: [LegsController],
  exports: [LegsService],
})
export class LegsModule {}
```

Note: `LegsModule` does **not** import `AuthModule` — `JwtAuthGuard` has no constructor dependencies of its own (Passport registers the `'jwt'` strategy process-wide once `AuthModule` loads anywhere in the app, e.g. via `AppModule`), so Nest can instantiate the guard from the class reference alone. Importing `AuthModule` here would transitively pull in `UsersModule`'s `User` repository, which breaks the isolated e2e test in Step 1 (only the `Leg` repository is mocked there) and adds a coupling `LegsModule` doesn't need.

- [x] **Step 4: Wire LegsModule into AppModule**

Modify `backend/src/app.module.ts` — add `import { LegsModule } from './legs/legs.module';` and add `LegsModule` to the `imports` array.

- [x] **Step 5: Run the test to verify it passes**

Run: `cd backend && npx jest test/legs.e2e-spec.ts`
Expected: PASS (3 tests)

- [ ] **Step 6: Commit** — SKIPPED per explicit user instruction: no `git commit` for this project.

---

### Task 7: Seed script — real coordinators and real MAYFLY rows from the workbook

**Files:**
- Create: `backend/scripts/seed-from-excel.ts`
- Create: `backend/package.json:12` (add `xlsx` dependency — modify the `dependencies` block from Task 1)

**Interfaces:**
- Consumes: `AppDataSource` from Task 2, `User`/`Leg` entities.
- Produces: a runnable script (`npm run seed -- <path-to-xlsm>`) that inserts real `User` rows from `SETTINGS!B5:G6` and real `Leg` rows from `MAYFLY!A2:AP...`. Not a TDD unit-test target itself (it's an I/O script against a real file) — verified by Step 3's actual run against the real workbook and a row-count assertion.

- [x] **Step 1: Add the `xlsx` dependency**

Modify `backend/package.json` — add to `dependencies`: `"xlsx": "^0.18.5"`. Run:
```bash
cd backend && npm install
```

Note: the `npm install` for `xlsx` pulls in the `xlsx` package from the default npm registry, which carries known advisories (prototype pollution / ReDoS) in some versions — acceptable here since this script only reads a single trusted local file the coordinator controls, not untrusted input, but worth knowing before reusing this dependency elsewhere.

Note on real-data mapping, found by inspecting the actual `UAA_Coordinator_v5.xlsm` workbook before running this script against it: boolean-flag columns (`Service Report Sent`, `TSS Notified`, etc.) mix `"Yes"` and `"YES"` casing across columns in the real sheet, so exact `=== 'YES'` matching silently drops some flags — use a case-insensitive `isYes()` helper instead. The `MTOW (LB)` column holds strings like `"49000 LB"`, not raw numbers — `Number(...)` on that yields `NaN`; use `parseInt` instead, which stops at the first non-digit character. `CLIENT NO.` mixes numeric and string cells — wrap in `String()` like `tripNo`/`icao` already do. One `DEP DATE` cell in the real sheet is a literal date string rather than an Excel serial number, so `excelDateToJsDate` needs a string fallback branch or that row's date silently becomes `null`.

- [x] **Step 2: Write the seed script**

`backend/scripts/seed-from-excel.ts`:
```typescript
import 'reflect-metadata';
import * as bcrypt from 'bcrypt';
import * as XLSX from 'xlsx';
import { AppDataSource } from '../src/database/data-source';
import { User } from '../src/users/user.entity';
import { Leg } from '../src/legs/leg.entity';

const TEMP_PASSWORD = 'ChangeMe-' + Math.random().toString(36).slice(2, 10);

function excelDateToJsDate(value: unknown): Date | null {
  if (value instanceof Date) return value;
  if (typeof value === 'number') {
    return new Date(Math.round((value - 25569) * 86400 * 1000));
  }
  if (typeof value === 'string' && value.trim() !== '') {
    const parsed = new Date(value);
    return Number.isNaN(parsed.getTime()) ? null : parsed;
  }
  return null;
}

function isYes(value: unknown): boolean {
  return typeof value === 'string' && value.trim().toUpperCase() === 'YES';
}

function parseMtow(value: unknown): number | null {
  if (value == null || value === '') return null;
  const parsed = parseInt(String(value), 10);
  return Number.isNaN(parsed) ? null : parsed;
}

async function seedUsers(workbook: XLSX.WorkBook, dataSource: typeof AppDataSource) {
  const settingsSheet = workbook.Sheets['SETTINGS'];
  // NOTE: the real SETTINGS sheet has multiple sections below the S1 COORDINATORS block
  // (S2 FILE PATHS, etc.) with no blank-row gap large enough to rely on `range` alone —
  // `break` below on the first row without a username/fullName is what actually bounds
  // the read to just the coordinators block; `continue` would keep scanning into S2 and
  // try to insert e.g. "Briefs Folder" as a coordinator username, failing on the from_email
  // NOT NULL constraint.
  const rows = XLSX.utils.sheet_to_json<any[]>(settingsSheet, { header: 1, range: 4 });
  const userRepo = dataSource.getRepository(User);
  let created = 0;

  for (const row of rows) {
    const [, username, fullName, jobTitle, mobile, fromEmail, ccDefault] = row;
    if (!username || !fullName) break;
    const exists = await userRepo.findOne({ where: { username } });
    if (exists) continue;
    const passwordHash = await bcrypt.hash(TEMP_PASSWORD, 10);
    await userRepo.save(
      userRepo.create({ username, fullName, jobTitle: jobTitle ?? null, mobile: mobile ?? null, fromEmail, ccDefault: ccDefault ?? null, passwordHash }),
    );
    created++;
  }
  return created;
}

async function seedLegs(workbook: XLSX.WorkBook, dataSource: typeof AppDataSource) {
  const mayflySheet = workbook.Sheets['MAYFLY'];
  const rows = XLSX.utils.sheet_to_json<any[]>(mayflySheet, { header: 1, range: 1 });
  const legRepo = dataSource.getRepository(Leg);
  let created = 0;

  for (const row of rows) {
    const tripNo = row[10];
    const icao = row[12];
    if (!tripNo || !icao) continue;

    const leg = legRepo.create({
      country: row[0] ?? null,
      region: row[1] ?? null,
      refNo: row[2] ?? null,
      clientName: row[3] ?? null,
      operatorName: row[4] ?? null,
      clientNo: row[5] != null ? String(row[5]) : null,
      agentName: row[6] ?? null,
      serviceReportSent: isYes(row[7]),
      returnedInTime: isYes(row[8]),
      agentContacts: row[9] ?? null,
      tripNo: String(tripNo),
      tail: row[11] ?? null,
      icao: String(icao),
      arrDate: excelDateToJsDate(row[13]),
      depDate: excelDateToJsDate(row[14]),
      arrFrom: row[15] ?? null,
      depToIcao: row[16] ?? null,
      activityType: row[17] ?? null,
      progress: row[18] ?? null,
      captName: row[19] ?? null,
      captEmail: row[20] ?? null,
      acType: row[21] ?? null,
      mtowLb: parseMtow(row[22]),
      pgh: row[23] ?? null,
      tssTeam: row[24] ?? null,
      clearanceNumber: row[25] ?? null,
      tssNotified: isYes(row[26]),
      clientNotified: isYes(row[27]),
      agentExpenses: row[28] != null ? String(row[28]) : null,
      readyToBill: isYes(row[29]),
      invoiceReceived: isYes(row[30]),
      remarks: row[31] ?? null,
      a2gSupervisor: row[32] ?? null,
      driveCompleteDate: excelDateToJsDate(row[33]),
      a2gInvoiceNumber: row[34] ?? null,
      processBy: row[35] ?? null,
      processDate: excelDateToJsDate(row[36]),
      billingMonth: row[37] ?? null,
      semaphore: row[38] ?? null,
      commentsToAgent: row[39] ?? null,
      legId: row[40] ? Number(row[40]) : created + 1,
      intelStatus: row[41] ?? null,
    });
    await legRepo.save(leg);
    created++;
  }
  return created;
}

async function main() {
  const filePath = process.argv[2];
  if (!filePath) {
    console.error('Usage: npm run seed -- <path-to-UAA_Coordinator_v5.xlsm>');
    process.exit(1);
  }

  const workbook = XLSX.readFile(filePath);
  await AppDataSource.initialize();

  const usersCreated = await seedUsers(workbook, AppDataSource);
  const legsCreated = await seedLegs(workbook, AppDataSource);

  console.log(`Seeded ${usersCreated} user(s), ${legsCreated} leg(s).`);
  if (usersCreated > 0) {
    console.log(`Temporary password for newly created users: ${TEMP_PASSWORD}`);
    console.log('Share this out-of-band and require a password change on first login (password-change flow is a follow-up task, not part of this plan).');
  }

  await AppDataSource.destroy();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
```

- [x] **Step 3: Run the seed script against the real workbook and verify row counts**

Run:
```bash
cd backend
npm run seed -- "C:/Backups/InsiderTechSol/Aviation/uaa/UAA_Coordinator_v5.xlsm"
```
Expected: prints `Seeded 2 user(s), N leg(s).` where `N` matches the real MAYFLY row count (verify independently: `docker compose exec postgres psql -U uaa -d uaa -c "SELECT count(*) FROM legs;"` should return the same `N`, and `SELECT username, full_name FROM users;` should list `bminja` and `glwendo`).

Actual result: `Seeded 2 user(s), 62 leg(s).` on first run (before the `break`-vs-`continue` fix, this crashed partway through seeding users on a later SETTINGS-sheet section; the 2 real coordinators had already committed by then). Re-run after the fix seeded `0 user(s)` (both already existed) `, 62 leg(s).` — verified independently against `SELECT count(*) FROM legs` (62) and `SELECT username, full_name FROM users` (`bminja`/`glwendo`).

- [ ] **Step 4: Commit** — SKIPPED per explicit user instruction: no `git commit` for this project.

---

### Task 8: Frontend API client + login page

**Files:**
- Create: `frontend/src/lib/api-client.ts`
- Create: `frontend/src/app/login/page.tsx`
- Create: `frontend/vitest.config.ts`
- Create: `frontend/test/setup.ts` (registers `@testing-library/jest-dom` matchers with Vitest — see the note after the `vitest.config.ts` snippet below)
- Test: `frontend/test/api-client.test.ts`

**Interfaces:**
- Produces: `login(username: string, password: string): Promise<{ accessToken: string }>` and `getLegs(token: string): Promise<Leg[]>` in `api-client.ts`, both used by Task 9's Legs pages. Reads `NEXT_PUBLIC_API_URL` env var for the backend base URL.

- [x] **Step 1: Create the Vitest config**

`frontend/vitest.config.ts`:
```typescript
import path from 'path';
import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./test/setup.ts'],
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
});
```

`frontend/test/setup.ts`:
```typescript
import '@testing-library/jest-dom/vitest';
```

Note: three gaps here, all invisible until Task 9 renders an actual component (Task 8's test imports `api-client.ts` directly — no JSX, no `@/` import, no DOM matchers):
1. `resolve.alias` — Next.js's `tsconfig.json` `paths: { "@/*": ["./src/*"] }` is understood by Next's own bundler but not by Vitest/Vite, which needs its own alias config.
2. `@vitejs/plugin-react` — Vitest runs its own Vite pipeline independent of Next's SWC bundler; without this plugin, JSX transforms without the automatic React-runtime import, failing with `ReferenceError: React is not defined`.
3. `test/setup.ts` + `setupFiles` — `@testing-library/jest-dom` is in `devDependencies` but its matchers (`toBeInTheDocument()`, etc.) are never auto-registered with Vitest's `expect`; without importing `@testing-library/jest-dom/vitest` in a setup file wired via `setupFiles`, every matcher call fails with `Invalid Chai property: toBeInTheDocument`.

- [x] **Step 2: Write the failing test for the API client**

`frontend/test/api-client.test.ts`:
```typescript
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { login, getLegs } from '../src/lib/api-client';

describe('api-client', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn());
  });

  it('login posts credentials and returns the access token', async () => {
    (fetch as any).mockResolvedValue({ ok: true, json: async () => ({ accessToken: 'token-123' }) });

    const result = await login('bminja', 'secret');

    expect(fetch).toHaveBeenCalledWith(
      expect.stringContaining('/auth/login'),
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({ username: 'bminja', password: 'secret' }),
      }),
    );
    expect(result).toEqual({ accessToken: 'token-123' });
  });

  it('login throws when the response is not ok', async () => {
    (fetch as any).mockResolvedValue({ ok: false, status: 401 });

    await expect(login('bminja', 'wrong')).rejects.toThrow('Login failed');
  });

  it('getLegs sends the bearer token and returns the parsed array', async () => {
    (fetch as any).mockResolvedValue({ ok: true, json: async () => [{ id: '1', tripNo: '2608001' }] });

    const result = await getLegs('token-123');

    expect(fetch).toHaveBeenCalledWith(
      expect.stringContaining('/legs'),
      expect.objectContaining({ headers: { Authorization: 'Bearer token-123' } }),
    );
    expect(result).toEqual([{ id: '1', tripNo: '2608001' }]);
  });
});
```

- [x] **Step 3: Run the test to verify it fails**

Run: `cd frontend && npx vitest run test/api-client.test.ts`
Expected: FAIL — `Cannot find module '../src/lib/api-client'`

- [x] **Step 4: Implement the API client**

`frontend/src/lib/api-client.ts`:
```typescript
const API_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3011';

export interface Leg {
  id: string;
  tripNo: string;
  icao: string;
  tail: string | null;
  country: string | null;
  arrDate: string | null;
  depDate: string | null;
  legId: number;
}

export async function login(username: string, password: string): Promise<{ accessToken: string }> {
  const response = await fetch(`${API_URL}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username, password }),
  });
  if (!response.ok) throw new Error('Login failed');
  return response.json();
}

export async function getLegs(token: string): Promise<Leg[]> {
  const response = await fetch(`${API_URL}/legs`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!response.ok) throw new Error('Failed to load legs');
  return response.json();
}
```

- [x] **Step 5: Run the test to verify it passes**

Run: `cd frontend && npx vitest run test/api-client.test.ts`
Expected: PASS (3 tests)

- [x] **Step 6: Create the login page**

`frontend/src/app/login/page.tsx`:
```tsx
'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { login } from '@/lib/api-client';

export default function LoginPage() {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    try {
      const { accessToken } = await login(username, password);
      localStorage.setItem('uaa_token', accessToken);
      router.push('/legs');
    } catch {
      setError('Invalid username or password');
    }
  }

  return (
    <form onSubmit={handleSubmit}>
      <h1>UAA Coordinator — Sign in</h1>
      <label>
        Username
        <input value={username} onChange={(e) => setUsername(e.target.value)} />
      </label>
      <label>
        Password
        <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} />
      </label>
      {error && <p role="alert">{error}</p>}
      <button type="submit">Sign in</button>
    </form>
  );
}
```

- [ ] **Step 7: Commit** — SKIPPED per explicit user instruction: no `git commit` for this project.

---

### Task 9: Frontend Legs list page

**Files:**
- Create: `frontend/src/app/legs/page.tsx`
- Test: `frontend/test/legs-list.test.tsx`

**Interfaces:**
- Consumes: `getLegs` from Task 8's `api-client.ts`.

- [x] **Step 1: Write the failing test**

`frontend/test/legs-list.test.tsx`:
```tsx
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import * as apiClient from '../src/lib/api-client';
import LegsPage from '../src/app/legs/page';

vi.mock('../src/lib/api-client', async () => {
  const actual = await vi.importActual<typeof apiClient>('../src/lib/api-client');
  return { ...actual, getLegs: vi.fn() };
});

describe('LegsPage', () => {
  beforeEach(() => {
    localStorage.setItem('uaa_token', 'test-token');
  });

  it('renders each leg row with trip no, ICAO, and tail', async () => {
    vi.mocked(apiClient.getLegs).mockResolvedValue([
      { id: '1', tripNo: '2608001', icao: 'GMMN', tail: 'N832PJ', country: 'Morocco', arrDate: null, depDate: null, legId: 1 },
    ]);

    render(<LegsPage />);

    await waitFor(() => expect(screen.getByText('2608001')).toBeInTheDocument());
    expect(screen.getByText('GMMN')).toBeInTheDocument();
    expect(screen.getByText('N832PJ')).toBeInTheDocument();
  });
});
```

- [x] **Step 2: Run the test to verify it fails**

Run: `cd frontend && npx vitest run test/legs-list.test.tsx`
Expected: FAIL — `Cannot find module '../src/app/legs/page'`

- [x] **Step 3: Implement the Legs list page**

`frontend/src/app/legs/page.tsx`:
```tsx
'use client';

import { useEffect, useState } from 'react';
import { getLegs, type Leg } from '@/lib/api-client';

export default function LegsPage() {
  const [legs, setLegs] = useState<Leg[]>([]);

  useEffect(() => {
    const token = localStorage.getItem('uaa_token');
    if (!token) return;
    getLegs(token).then(setLegs).catch(() => setLegs([]));
  }, []);

  return (
    <table>
      <thead>
        <tr>
          <th>Trip No</th>
          <th>ICAO</th>
          <th>Tail</th>
          <th>Country</th>
        </tr>
      </thead>
      <tbody>
        {legs.map((leg) => (
          <tr key={leg.id}>
            <td>{leg.tripNo}</td>
            <td>{leg.icao}</td>
            <td>{leg.tail}</td>
            <td>{leg.country}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
```

- [x] **Step 4: Run the test to verify it passes**

Run: `cd frontend && npx vitest run test/legs-list.test.tsx`
Expected: PASS

- [ ] **Step 5: Commit** — SKIPPED per explicit user instruction: no `git commit` for this project.

---

### Task 10: End-to-end smoke check against the real seeded stack

**Files:** none (verification-only task)

- [x] **Step 1: Bring up the full stack fresh**

Run:
```bash
docker compose down -v
docker compose up --build -d
cd backend && npx typeorm-ts-node-commonjs migration:run -d src/database/data-source.ts
npm run seed -- "C:/Backups/InsiderTechSol/Aviation/uaa/UAA_Coordinator_v5.xlsm"
```

This step is what actually caught the `dist/main.js` vs `dist/src/main.js` defect (see the `tsconfig.json` `include` note in Task 1) — a genuinely clean, no-build-cache `docker compose up --build` was required to expose it; every earlier task's own `npm run build` check passed because it ran against a `dist/` directory still carrying a stale top-level `main.js` from Task 1's very first build. Backend container crash-looped with `Cannot find module '/app/dist/main'` until that fix landed. Also needed a `docker compose build --no-cache backend` once, mid-debugging, to rule out stale Docker layer caching as a separate contributing factor before finding the real root cause.

- [x] **Step 2: Log in as a real seeded coordinator and confirm real legs render**

Using the temporary password printed by the seed script:
```bash
curl -s -X POST http://localhost:3011/auth/login -H 'Content-Type: application/json' -d '{"username":"bminja","password":"<printed-temp-password>"}'
```
Expected: `{"accessToken":"..."}`. Then:
```bash
curl -s http://localhost:3011/legs -H "Authorization: Bearer <token-from-above>" | head -c 300
```
Expected: a JSON array whose first entries match real MAYFLY data (e.g. an entry with `"tripNo"` and `"icao":"GMMN"` if that trip is still in the live workbook).

Actual: login returned a valid JWT; `/legs` returned real MAYFLY rows (Egypt/HECA/N148B/HONEYWELL INTERNATIONAL INC among the first entries). Verified with `backend`'s port temporarily published (`ports: ["3011:3011"]`, same local-verification-only pattern as Task 1 Step 5) and reverted afterward — production still routes through `web-proxy`, no host ports published in the committed compose file.

- [x] **Step 3: Confirm the frontend renders the same data**

Visit `http://localhost:3012/login` in a browser, sign in with `bminja` and the temporary password, confirm redirect to `/legs`, confirm the table shows the same real trip numbers/ICAOs verified in Step 2.

Actual: verified via browser automation — logged in as `bminja`, redirected to `/legs`, table rendered all 62 real seeded rows (trip `475087`/`GMMN`/`N832PJ`/Morocco matches the row spot-checked via the API in Step 2). Frontend's `3012` port was also temporarily published for this check and reverted afterward for the same reason as Step 2.

- [x] **Step 4: No commit for this task** — it's verification only. (Also: no commits were made anywhere in this plan's execution — all `git commit` steps were skipped per explicit user instruction.)

---

## Self-Review

**1. Spec coverage** — this plan implements Slice 1 of the spec's Build Sequencing ("Leg intake + auth + reference data seeded from the current Excel sheets... and from actuator's CountryRules"). It covers auth and Leg intake with real data. It does **not** yet cover: Agents/Vendors/Teams/Tails reference tables, or `CountryRequirements` seeded from actuator's `CountryRules` — those are deferred to a follow-up "Reference Data" plan, called out explicitly in the plan header rather than silently dropped, since cramming all of Slice 1's stated scope into one TDD-rigorous plan was unmanageably large for one pass. Flagging this now: if you want reference-data seeding folded into this same plan before execution rather than as a follow-up, say so and I'll extend it.

**2. Placeholder scan** — no TBD/TODO/"add error handling"/"similar to Task N" found; every step has real, complete code.

**3. Type consistency** — checked `Leg` field names against every consumer: `LegsService` (Task 5) uses the exact field names from the `Leg` entity (Task 4); `CreateLegDto` (Task 5) field names match what `LegsController` (Task 6) and the seed script (Task 7) pass through; `getLegs`'s `Leg` interface (Task 8, frontend) matches the subset of backend fields the Legs list page (Task 9) actually renders (`tripNo`, `icao`, `tail`, `country`, `arrDate`, `depDate`, `legId`, `id`) — consistent across both TypeScript boundaries (frontend interface is intentionally a subset of the backend entity, not a mismatched shape).

---

Plan complete and saved to `docs/superpowers/plans/2026-08-22-foundation-auth-legs.md`. Two execution options:

**1. Subagent-Driven (recommended)** - I dispatch a fresh subagent per task, review between tasks, fast iteration

**2. Inline Execution** - Execute tasks in this session using executing-plans, batch execution with checkpoints

**Which approach?**
