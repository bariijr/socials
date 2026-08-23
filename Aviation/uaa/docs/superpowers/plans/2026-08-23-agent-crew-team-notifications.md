# Agent/Crew/Team Notifications Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Port the Excel macro's three coordinator-triggered notification emails (`mod_Email.bas`'s `BuildAndSend` — Crew, TSS/Team, Agent Service Report) plus its WhatsApp-to-agent link generator into the webapp, on-demand from the leg detail page, logged through the same `Comms` ledger used by permit requests (tagged `NOTIFICATION`, no correlation token).

**Architecture:** A new `Team` reference table (seeded from the real `TEAMS` sheet) backs team-email lookup. A new `notifications/` backend module holds pure content-builder functions (subject/body per email + the WhatsApp message + a `parseContact` splitter for the workbook's `"email / phone"` convention) plus a `NotificationsService` that composes them with real `Leg`/`User`/`Team` data, sends via the existing `MailService` (extended with `cc`/`bcc`), and logs a `Comm` row per send. Frontend gets one new leg-detail section with four action buttons and a sent-notifications table.

**Tech Stack:** NestJS 10 + TypeORM 0.3 (existing), Next.js 14 App Router (existing), Jest (backend), Vitest + React Testing Library (frontend) — same stack as Slices 1-3, no new dependencies.

**Spec:** `docs/superpowers/specs/2026-08-22-uaa-webapp-design.md`

## Global Constraints

- Every table gets `createdAt`/`updatedAt` audit timestamps (existing convention).
- Notifications use the same `Comms` machinery as permit requests, `kind: 'NOTIFICATION'`, `correlationToken: null` (Spec: Comms — "no correlation token needed (no reply expected)").
- Single coordinator role — no RBAC (Spec: Scope). The new endpoints sit behind the existing `JwtAuthGuard`.
- Real content grounding: the three email bodies below are transcribed from the actual macro source (`xl/vbaProject.bin`'s `mod_Email.bas`, extracted from `UAA_Coordinator_v5.xlsm` via `oletools.olevba` for this plan), not invented from the design spec's one-line summary. Departures from the macro are called out explicitly in each task, not silently dropped.
- Team reference data is seeded from the real `TEAMS` sheet (21 real rows, real `@univ-wea.com` addresses) via `seed-from-excel.ts`, matching how `Legs`/`Users` are already seeded from the same workbook — not hardcoded placeholder data (unlike `seed-country-requirements.ts`, which used placeholders only because the workbook has no equivalent structured source for that data).

## Explicitly Deferred (not this plan)

- **`AgentReq`** (the macro's "ask the ground handler who the UA agent is" flow) — not named in the spec's Build Sequencing item 4 ("Agent/crew/team notifications"); the webapp's `Leg.agentName`/`Leg.agentContacts` are already populated at seed time from the real MAYFLY row, so there's no unresolved-agent state to request against yet.
- **`PMTNotify`** (Mission Permits Team broadcast) — permit-domain, not a crew/agent/team notification; the correlation-tracked permit flow (Slices 2-3) is the actual replacement for how permits get communicated.
- **Word-document mail-merge and attachment for Email 3** (Agent Service Report) — the macro fills a `.docx` template via Word COM automation, which is Windows-only and has no server-side equivalent in a Linux NestJS backend. Email 3 is sent as a plain-content request in this plan; document generation is a separate, later feature if a coordinator asks for it.
- **Deferred/scheduled delivery** (the macro schedules Email 1 for ETA−1 day 05:00 and Email 3 for 24h before ETA via Outlook's `DeferredDeliveryTime`) — all sends in this plan are on-demand, coordinator-triggered, matching how permit requests already work (Slice 2). No scheduling infrastructure added.
- **Multi-leg composite notifications** (the macro's Section K, up to 5 ICAO stops in one email) — this webapp's data model is leg-grained (one row per leg, per the spec's Data model section), and every other flow (permit requests, Action Board) already operates per-leg. Notifications follow the same grain.
- **"Include Country Intel" prompt** — references a long-form intel brief field this webapp doesn't model yet (`Leg.intelStatus` is a short status flag, not the brief text). Not required by the spec's Build Sequencing item 4.
- **`WhatsAppCaptain`** — the design spec's Data model "Reference tables" list names `Agents`, `Vendors`, `Teams`, `Tails` but not `Crew`; captain phone numbers live only in the workbook's `CREW` sheet, which this plan does not seed. WhatsApp-to-agent (phone already available via `Leg.agentContacts`) is implemented; WhatsApp-to-captain would need a new `Crew` reference table and is left for a future plan if it's actually wanted.
- **`Agents`/`Vendors`/`Tails` reference tables** — nothing in this slice's scope (Email 1/2/3 + WhatsApp-to-agent) needs them: agent identity already lives on `Leg` directly (seeded from MAYFLY), and the macro's `VENDORS`/`AGENTS` lookups exist only to *fill in* an agent when one isn't already known (the deferred `AgentReq` flow).

---

## File Structure

```
backend/
├── src/
│   ├── notifications/
│   │   ├── team.entity.ts              # new
│   │   ├── parse-contact.ts            # new: pure parseContact()
│   │   ├── notification-templates.ts   # new: pure template builders
│   │   ├── notifications.service.ts    # new
│   │   ├── notifications.controller.ts # new
│   │   └── notifications.module.ts     # new
│   ├── mail/
│   │   └── mail.service.ts             # modify: add cc/bcc to SendMailInput
│   ├── database/data-source.ts         # modify: register Team entity
│   └── app.module.ts                   # modify: import NotificationsModule
├── migrations/
│   └── <ts>-CreateTeams.ts             # new
└── scripts/
    └── seed-from-excel.ts              # modify: add seedTeams()

test/
├── parse-contact.spec.ts               # new
├── notification-templates.spec.ts      # new
├── mail.service.spec.ts                # modify: cc/bcc test
├── notifications.service.spec.ts       # new
└── notifications.e2e-spec.ts           # new

frontend/
├── src/
│   ├── app/legs/[id]/
│   │   ├── notifications.tsx           # new
│   │   └── page.tsx                    # modify: render <Notifications />
│   ├── app/globals.css                 # modify: notification section styles
│   └── lib/api-client.ts               # modify: notification client functions
└── test/
    ├── notifications.test.tsx          # new
    └── api-client.test.ts              # modify
```

---

### Task 1: `Team` reference table

**Files:**
- Create: `backend/src/notifications/team.entity.ts`, `backend/migrations/1756080000000-CreateTeams.ts`
- Modify: `backend/src/database/data-source.ts`

**Interfaces:**
- Produces: `Team` entity (`id`, `name` unique, `teamEmail`, `remarks` nullable, `createdAt`, `updatedAt`). Task 5 (`NotificationsService`) and Task 6 (seed) consume it.

- [ ] **Step 1: Create the entity**

`backend/src/notifications/team.entity.ts`:
```typescript
import { Column, CreateDateColumn, Entity, PrimaryGeneratedColumn, UpdateDateColumn } from 'typeorm';

@Entity('teams')
export class Team {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ unique: true })
  name: string;

  @Column({ name: 'team_email' })
  teamEmail: string;

  @Column({ type: 'varchar', nullable: true })
  remarks: string | null;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;
}
```

- [ ] **Step 2: Create the migration**

`backend/migrations/1756080000000-CreateTeams.ts`:
```typescript
import { MigrationInterface, QueryRunner, Table } from 'typeorm';

export class CreateTeams1756080000000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.createTable(
      new Table({
        name: 'teams',
        columns: [
          { name: 'id', type: 'uuid', isPrimary: true, default: 'gen_random_uuid()' },
          { name: 'name', type: 'varchar', isUnique: true },
          { name: 'team_email', type: 'varchar' },
          { name: 'remarks', type: 'varchar', isNullable: true },
          { name: 'created_at', type: 'timestamptz', default: 'now()' },
          { name: 'updated_at', type: 'timestamptz', default: 'now()' },
        ],
      }),
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.dropTable('teams');
  }
}
```

- [ ] **Step 3: Register the entity in the CLI data source**

Modify `backend/src/database/data-source.ts`:
```typescript
import 'reflect-metadata';
import { DataSource } from 'typeorm';
import { User } from '../users/user.entity';
import { Leg } from '../legs/leg.entity';
import { CountryRequirement } from '../country-requirements/country-requirement.entity';
import { FormTemplate } from '../form-templates/form-template.entity';
import { PermitRequest } from '../permits/permit-request.entity';
import { Comm } from '../permits/comm.entity';
import { Team } from '../notifications/team.entity';

export const AppDataSource = new DataSource({
  type: 'postgres',
  url: process.env.DATABASE_URL,
  entities: [User, Leg, CountryRequirement, FormTemplate, PermitRequest, Comm, Team],
  migrations: ['migrations/*.ts'],
  synchronize: false,
});
```

- [ ] **Step 4: Verify the backend still builds**

Run: `cd backend && npm run build`
Expected: compiles with no errors. (The migration itself runs for real in Task 8.)

- [ ] **Step 5: Commit**

```bash
git add backend/src/notifications/team.entity.ts backend/migrations/1756080000000-CreateTeams.ts backend/src/database/data-source.ts
git commit -m "Add Team reference table — backs the team-notification email's recipient lookup"
```

---

### Task 2: `parseContact` — pure function

**Files:**
- Create: `backend/src/notifications/parse-contact.ts`
- Test: `backend/test/parse-contact.spec.ts`

**Interfaces:**
- Produces: `parseContact(contacts: string | null | undefined): { email: string; phone: string }`. Task 5 calls this exact function against `Leg.agentContacts`.

This mirrors the macro's `mod_Utils.ParseContact`, which the real `AGENT CONTACTS` data actually uses — confirmed against the live seeded database: `"starscmn@starsaviationservices.com; starsops@starsaviationservices.com / +212 661 888 747"`.

- [ ] **Step 1: Write the failing tests**

`backend/test/parse-contact.spec.ts`:
```typescript
import { parseContact } from '../src/notifications/parse-contact';

describe('parseContact', () => {
  it('splits a combined "email / phone" string on the last " / "', () => {
    expect(
      parseContact('starscmn@starsaviationservices.com; starsops@starsaviationservices.com / +212 661 888 747'),
    ).toEqual({
      email: 'starscmn@starsaviationservices.com; starsops@starsaviationservices.com',
      phone: '+212 661 888 747',
    });
  });

  it('returns the whole string as email when there is no phone segment', () => {
    expect(parseContact('uaaafrica@wfscorp.com')).toEqual({ email: 'uaaafrica@wfscorp.com', phone: '' });
  });

  it('returns empty strings for null, undefined, or blank input', () => {
    expect(parseContact(null)).toEqual({ email: '', phone: '' });
    expect(parseContact(undefined)).toEqual({ email: '', phone: '' });
    expect(parseContact('   ')).toEqual({ email: '', phone: '' });
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `cd backend && npx jest test/parse-contact.spec.ts`
Expected: FAIL — `Cannot find module '../src/notifications/parse-contact'`

- [ ] **Step 3: Implement parseContact**

`backend/src/notifications/parse-contact.ts`:
```typescript
export function parseContact(contacts: string | null | undefined): { email: string; phone: string } {
  const trimmed = (contacts ?? '').trim();
  if (!trimmed) return { email: '', phone: '' };

  const slashIndex = trimmed.lastIndexOf(' / ');
  if (slashIndex === -1) return { email: trimmed, phone: '' };

  return {
    email: trimmed.slice(0, slashIndex).trim(),
    phone: trimmed.slice(slashIndex + 3).trim(),
  };
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `cd backend && npx jest test/parse-contact.spec.ts`
Expected: PASS (3 tests)

- [ ] **Step 5: Commit**

```bash
git add backend/src/notifications/parse-contact.ts backend/test/parse-contact.spec.ts
git commit -m "Add parseContact — splits the workbook's 'email / phone' contact convention"
```

---

### Task 3: Notification content builders — pure functions

**Files:**
- Create: `backend/src/notifications/notification-templates.ts`
- Test: `backend/test/notification-templates.spec.ts`

**Interfaces:**
- Produces: `formatZ`, `firstName`, `buildSignature`, `buildCrewNotificationEmail`, `buildTeamNotificationEmail`, `buildAgentServiceReportEmail`, `buildAgentWhatsAppMessage`, `buildWhatsAppLink`. Task 5 (`NotificationsService`) calls all of these.

Content below is transcribed from `mod_Email.bas`'s `BuildAndSend` (Email 1: Crew, Email 2: TSS/Team) and the `PMTNotify`-adjacent Email 3 block, and `WhatsApp()`, with three deliberate departures (each already listed in Explicitly Deferred): no multi-leg Section K composition, no Word-doc attachment reference in Email 3's copy, and the WhatsApp message references the Email 3 request instead of a physical attachment. Subject lines for Email 1/2 were manually-typed cell values in the macro (`SENDOR!C42`/`C43`), not generated — the subjects below are newly composed for this plan, in the same dash-and-ref style the macro uses elsewhere (e.g. `PMTNotify`'s `tail & " - " & tripNo & " / " & countryName`).

- [ ] **Step 1: Write the failing tests**

`backend/test/notification-templates.spec.ts`:
```typescript
import {
  formatZ,
  firstName,
  buildSignature,
  buildCrewNotificationEmail,
  buildTeamNotificationEmail,
  buildAgentServiceReportEmail,
  buildAgentWhatsAppMessage,
  buildWhatsAppLink,
} from '../src/notifications/notification-templates';

describe('formatZ', () => {
  it('formats a UTC date as DD-MMM-YYYY HH:MMZ', () => {
    expect(formatZ(new Date('2026-09-16T16:20:00.000Z'))).toBe('16-Sep-2026 16:20Z');
  });

  it('returns TBD for null', () => {
    expect(formatZ(null)).toBe('TBD');
  });
});

describe('firstName', () => {
  it('extracts and title-cases the first word', () => {
    expect(firstName('ADAM HEBERT')).toBe('Adam');
  });

  it('returns empty string for null or blank', () => {
    expect(firstName(null)).toBe('');
    expect(firstName('  ')).toBe('');
  });
});

describe('buildSignature', () => {
  it('includes the coordinator name, title, and mobile', () => {
    const sig = buildSignature({ fullName: 'Barnaba Minja', jobTitle: 'A2G Coordinator', mobile: '+255 713 000 000' });
    expect(sig).toContain('Barnaba Minja');
    expect(sig).toContain('A2G Coordinator');
    expect(sig).toContain('+255 713 000 000');
    expect(sig).toContain('Universal Weather & Aviation, Inc.');
  });
});

const leg = {
  tail: 'N148B',
  tripNo: '482421',
  icao: 'HECA',
  country: 'Egypt',
  arrDate: new Date('2026-09-16T16:20:00.000Z'),
  depDate: new Date('2026-09-17T15:00:00.000Z'),
  captName: 'ADAM HEBERT',
  agentName: 'Hicham Bentouzer',
};

const user = {
  fullName: 'Barnaba Minja',
  jobTitle: 'A2G Coordinator',
  mobile: '+255 713 000 000',
  fromEmail: 'bminja@univ-wea.com',
};

describe('buildCrewNotificationEmail', () => {
  it('greets the captain by first name and includes agent contact details', () => {
    const { subject, body } = buildCrewNotificationEmail(leg, user, 'starscmn@starsaviationservices.com', '+212 661 888 747');

    expect(subject).toContain('HECA');
    expect(subject).toContain('N148B');
    expect(body).toContain('Greetings Captain Adam');
    expect(body).toContain('Hicham Bentouzer');
    expect(body).toContain('starscmn@starsaviationservices.com');
    expect(body).toContain('+212 661 888 747');
    expect(body).toContain('16-Sep-2026 16:20Z');
  });
});

describe('buildTeamNotificationEmail', () => {
  it('greets the named team and includes agent contact details', () => {
    const { subject, body } = buildTeamNotificationEmail(
      leg,
      { name: 'X-RAY' },
      user,
      'starscmn@starsaviationservices.com',
      '+212 661 888 747',
    );

    expect(subject).toContain('HECA');
    expect(body).toContain('Greetings X-RAY Team');
    expect(body).toContain('Hicham Bentouzer');
    expect(body).toContain('starscmn@starsaviationservices.com');
  });
});

describe('buildAgentServiceReportEmail', () => {
  it("greets the agent by first name and asks for the report at the coordinator's email", () => {
    const { subject, body } = buildAgentServiceReportEmail(leg, user);

    expect(subject).toBe('UAA Service Report for HECA - Ref: N148B-482421');
    expect(body).toContain('Greetings Hicham');
    expect(body).toContain('bminja@univ-wea.com');
  });
});

describe('buildAgentWhatsAppMessage', () => {
  it('mentions the tail, trip, and ICAO', () => {
    const msg = buildAgentWhatsAppMessage(leg, user);
    expect(msg).toContain('N148B');
    expect(msg).toContain('482421');
    expect(msg).toContain('HECA');
    expect(msg).toContain('Barnaba Minja');
  });
});

describe('buildWhatsAppLink', () => {
  it('strips non-digits and URL-encodes the message', () => {
    const url = buildWhatsAppLink('+212 661 888 747', 'Hi there');
    expect(url).toBe('https://wa.me/212661888747?text=Hi%20there');
  });

  it('returns null for an empty phone number', () => {
    expect(buildWhatsAppLink('', 'Hi there')).toBeNull();
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `cd backend && npx jest test/notification-templates.spec.ts`
Expected: FAIL — `Cannot find module '../src/notifications/notification-templates'`

- [ ] **Step 3: Implement the builders**

`backend/src/notifications/notification-templates.ts`:
```typescript
import type { Leg } from '../legs/leg.entity';
import type { User } from '../users/user.entity';
import type { Team } from './team.entity';

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

export function formatZ(date: Date | null): string {
  if (!date) return 'TBD';
  const day = String(date.getUTCDate()).padStart(2, '0');
  const month = MONTHS[date.getUTCMonth()];
  const year = date.getUTCFullYear();
  const hh = String(date.getUTCHours()).padStart(2, '0');
  const mm = String(date.getUTCMinutes()).padStart(2, '0');
  return `${day}-${month}-${year} ${hh}:${mm}Z`;
}

export function firstName(fullName: string | null): string {
  const trimmed = (fullName ?? '').trim();
  if (!trimmed) return '';
  const first = trimmed.split(' ')[0];
  return first.charAt(0).toUpperCase() + first.slice(1).toLowerCase();
}

type SignatureUser = Pick<User, 'fullName' | 'jobTitle' | 'mobile'>;

export function buildSignature(user: SignatureUser): string {
  return (
    `<br>${user.fullName}<br>${user.jobTitle ?? ''}<br>` +
    `Universal Weather & Aviation, Inc.<br>Mobile: ${user.mobile ?? ''}<br>` +
    `<a href='http://www.universalweather.com'>www.universalweather.com</a>`
  );
}

type NotificationLeg = Pick<Leg, 'tail' | 'tripNo' | 'icao' | 'country' | 'arrDate' | 'depDate' | 'captName' | 'agentName'>;

export function buildCrewNotificationEmail(
  leg: NotificationLeg,
  user: SignatureUser,
  agentEmail: string,
  agentPhone: string,
): { subject: string; body: string } {
  const captFirst = firstName(leg.captName);
  const etaTxt = formatZ(leg.arrDate);
  const etdTxt = formatZ(leg.depDate);
  const subject = `UA Crew Notification — ${leg.icao} — Ref: ${leg.tail ?? ''} – ${leg.tripNo}`;
  const body =
    `<p style='font-family:Calibri;font-size:10.5pt;'>` +
    `Greetings Captain ${captFirst},<br><br>` +
    `As you prepare for your trip to <b>${leg.country ?? ''}</b>, please find below the contact details ` +
    `of our UA supervisory agent for the <b>${leg.icao}</b> stop.<br><br>` +
    `<b>ICAO:</b> ${leg.icao}<br>` +
    `<b>ETA:</b> ${etaTxt}<br>` +
    `<b>ETD:</b> ${etdTxt}<br><br>` +
    `<b>UA Agent:</b> ${leg.agentName ?? ''}<br>` +
    `<b>Mobile / WhatsApp:</b> ${agentPhone}<br>` +
    `<b>Email:</b> <a href='mailto:${agentEmail}'>${agentEmail}</a><br><br>` +
    `The agent will manage all ground logistics before, during, and after your flight. ` +
    `Please contact them directly for any assistance or special requests.<br><br>` +
    `Could you share the following to help us prepare:<br><br>` +
    `1. <b>Passenger Transport:</b> Share driver details so we can coordinate drop-off and pick-up.<br><br>` +
    `2. <b>Third-Party Services:</b> Any other services we can confirm or arrange?<br><br>` +
    `3. <b>Catering:</b> Do you require departure catering? The agent can source local options.<br><br>` +
    `We wish you a safe and pleasant flight.<br><br>Best regards,<br>${buildSignature(user)}</p>`;
  return { subject, body };
}

export function buildTeamNotificationEmail(
  leg: NotificationLeg,
  team: Pick<Team, 'name'>,
  user: SignatureUser,
  agentEmail: string,
  agentPhone: string,
): { subject: string; body: string } {
  const etaTxt = formatZ(leg.arrDate);
  const etdTxt = formatZ(leg.depDate);
  const subject = `UA Special Service — ${leg.icao} — Ref: ${leg.tail ?? ''} – ${leg.tripNo}`;
  const body =
    `<p style='font-family:Calibri;font-size:10.5pt;'>` +
    `Greetings ${team.name} Team,<br><br>` +
    `Please load a special service <b>UA Agent</b> with the details below.<br><br>` +
    `<b>ICAO:</b> ${leg.icao}<br>` +
    `<b>ETA:</b> ${etaTxt}<br>` +
    `<b>ETD:</b> ${etdTxt}<br><br>` +
    `<b>UA Agent:</b> ${leg.agentName ?? ''}<br>` +
    `<b>Mobile:</b> ${agentPhone}<br>` +
    `<b>Email:</b> <a href='mailto:${agentEmail}'>${agentEmail}</a><br><br>` +
    `The agent will manage all ground logistics for crew and passengers. Thank you.<br><br>` +
    `Best regards,<br>${buildSignature(user)}</p>`;
  return { subject, body };
}

type ServiceReportUser = Pick<User, 'fullName' | 'jobTitle' | 'mobile' | 'fromEmail'>;

export function buildAgentServiceReportEmail(
  leg: Pick<Leg, 'tail' | 'tripNo' | 'icao' | 'agentName'>,
  user: ServiceReportUser,
): { subject: string; body: string } {
  const agentFirst = firstName(leg.agentName);
  const subject = `UAA Service Report for ${leg.icao} - Ref: ${leg.tail ?? ''}-${leg.tripNo}`;
  const body =
    `<p style='font-family:Calibri;font-size:10.5pt;'>` +
    `Greetings ${agentFirst},<br><br>` +
    `Please complete the UAA service report for the upcoming operation and send it to:<br>` +
    `<b>${user.fromEmail}</b>.<br><br>` +
    `Please share the completed report <u>immediately</u> after the crew leaves the airport for arrivals, ` +
    `and right after takeoff for departures. Include any delays, incidents, or other notable events.<br><br>` +
    `Thank you for your support.<br><br>Best regards,<br>${buildSignature(user)}</p>`;
  return { subject, body };
}

export function buildAgentWhatsAppMessage(
  leg: Pick<Leg, 'tail' | 'tripNo' | 'icao' | 'agentName'>,
  user: Pick<User, 'fullName'>,
): string {
  const agentFirst = firstName(leg.agentName);
  return (
    `Hi ${agentFirst},\n\n` +
    `You've been assigned registry *${leg.tail ?? ''}*, trip *${leg.tripNo}* at ICAO *${leg.icao}*.\n\n` +
    `I've sent the UAA Service Report request to your email. Please fill it out as required.\n\n` +
    `Feel free to WhatsApp me, ${user.fullName}, at this number for any issues. Thank you!`
  );
}

export function buildWhatsAppLink(phone: string, message: string): string | null {
  const digits = phone.replace(/[^0-9]/g, '');
  if (!digits) return null;
  return `https://wa.me/${digits}?text=${encodeURIComponent(message)}`;
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `cd backend && npx jest test/notification-templates.spec.ts`
Expected: PASS (11 tests)

- [ ] **Step 5: Commit**

```bash
git add backend/src/notifications/notification-templates.ts backend/test/notification-templates.spec.ts
git commit -m "Add notification content builders — ported from mod_Email.bas's Email 1/2/3 and WhatsApp"
```

---

### Task 4: `MailService` — cc/bcc support

**Files:**
- Modify: `backend/src/mail/mail.service.ts`
- Test: `backend/test/mail.service.spec.ts`

**Interfaces:**
- Produces: `SendMailInput` gains optional `cc?: string` and `bcc?: string`. Task 5 relies on both (Email 1 cc's the agent, Email 2/3 cc/bcc the coordinator).

- [ ] **Step 1: Write the failing test**

Add to `backend/test/mail.service.spec.ts` (inside the existing `describe('MailService', ...)` block, after the first test):
```typescript
  it('passes cc and bcc through to the SMTP transport when provided', async () => {
    process.env.SMTP_HOST = 'smtp.example.com';
    process.env.SMTP_FROM = 'from@example.com';

    const sendMail = jest.fn().mockResolvedValue({ messageId: '1' });
    const moduleRef = await Test.createTestingModule({ providers: [MailService] }).compile();
    const service = moduleRef.get(MailService);
    (service as any).transporter = { sendMail };

    await service.send({ to: 'to@example.com', cc: 'cc@example.com', bcc: 'bcc@example.com', subject: 'Subj', body: 'Body' });

    expect(sendMail).toHaveBeenCalledWith({
      from: 'from@example.com',
      to: 'to@example.com',
      cc: 'cc@example.com',
      bcc: 'bcc@example.com',
      subject: 'Subj',
      text: 'Body',
    });
  });
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `cd backend && npx jest test/mail.service.spec.ts`
Expected: FAIL — `Object.is equality` mismatch (TS also errors: `Object literal may only specify known properties, and 'cc' does not exist in type 'SendMailInput'`)

- [ ] **Step 3: Extend SendMailInput and send()**

Modify `backend/src/mail/mail.service.ts`:
```typescript
import { Injectable, Logger } from '@nestjs/common';
import * as nodemailer from 'nodemailer';

export interface SendMailInput {
  to: string;
  cc?: string;
  bcc?: string;
  subject: string;
  body: string;
}

@Injectable()
export class MailService {
  private readonly logger = new Logger(MailService.name);
  private readonly transporter: nodemailer.Transporter | null;

  constructor() {
    this.transporter = process.env.SMTP_HOST
      ? nodemailer.createTransport({
          host: process.env.SMTP_HOST,
          port: Number(process.env.SMTP_PORT ?? 587),
          auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS },
        })
      : null;
  }

  async send(input: SendMailInput): Promise<{ sent: boolean }> {
    if (!this.transporter) {
      this.logger.warn(`SMTP not configured — dry-run only. Would send "${input.subject}" to ${input.to}`);
      return { sent: false };
    }
    await this.transporter.sendMail({
      from: process.env.SMTP_FROM,
      to: input.to,
      cc: input.cc,
      bcc: input.bcc,
      subject: input.subject,
      text: input.body,
    });
    return { sent: true };
  }
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `cd backend && npx jest test/mail.service.spec.ts`
Expected: PASS (3 tests) — the pre-existing "sends via configured SMTP" test still passes unmodified: Jest's `toHaveBeenCalledWith`/`toEqual` treat an object's `undefined`-valued keys (`cc`/`bcc` when the caller doesn't pass them) as equivalent to the key being absent, so the earlier assertion (an object with no `cc`/`bcc` keys at all) still matches.

- [ ] **Step 5: Commit**

```bash
git add backend/src/mail/mail.service.ts backend/test/mail.service.spec.ts
git commit -m "Add cc/bcc support to MailService — needed by the crew/team notification emails"
```

---

### Task 5: `NotificationsService` + controller + module

**Files:**
- Create: `backend/src/notifications/notifications.service.ts`, `backend/src/notifications/notifications.controller.ts`, `backend/src/notifications/notifications.module.ts`
- Modify: `backend/src/app.module.ts`
- Test: `backend/test/notifications.service.spec.ts`, `backend/test/notifications.e2e-spec.ts`

**Interfaces:**
- Consumes: `parseContact` (Task 2), the template builders (Task 3), extended `MailService.send` (Task 4), `Team` (Task 1).
- Produces: `NotificationsService.sendCrewNotification/sendTeamNotification/sendAgentServiceReport/buildAgentWhatsApp/listForLeg`; routes `GET /legs/:legId/notifications`, `POST /legs/:legId/notifications/{crew,team,agent-service-report,agent-whatsapp}`.

- [ ] **Step 1: Write the failing service tests**

`backend/test/notifications.service.spec.ts`:
```typescript
import { Test } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { NotFoundException } from '@nestjs/common';
import { NotificationsService } from '../src/notifications/notifications.service';
import { Leg } from '../src/legs/leg.entity';
import { Team } from '../src/notifications/team.entity';
import { Comm } from '../src/permits/comm.entity';
import { User } from '../src/users/user.entity';
import { MailService } from '../src/mail/mail.service';

describe('NotificationsService', () => {
  let service: NotificationsService;
  let legRepo: { findOne: jest.Mock };
  let teamRepo: { findOne: jest.Mock };
  let commRepo: { create: jest.Mock; save: jest.Mock; find: jest.Mock };
  let userRepo: { findOne: jest.Mock };
  let mailService: { send: jest.Mock };

  const leg = {
    id: 'leg-1',
    tail: 'N148B',
    tripNo: '482421',
    icao: 'HECA',
    country: 'Egypt',
    arrDate: new Date('2026-09-16T16:20:00.000Z'),
    depDate: new Date('2026-09-17T15:00:00.000Z'),
    captName: 'ADAM HEBERT',
    captEmail: 'adam@example.com',
    agentName: 'Hicham Bentouzer',
    agentContacts: 'starscmn@starsaviationservices.com / +212 661 888 747',
    tssTeam: 'X-Ray',
  };

  const user = {
    id: 'user-1',
    fullName: 'Barnaba Minja',
    jobTitle: 'A2G Coordinator',
    mobile: '+255 713 000 000',
    fromEmail: 'bminja@univ-wea.com',
  };

  const team = { id: 'team-1', name: 'X-RAY', teamEmail: 'xrayteam@univ-wea.com' };

  beforeEach(async () => {
    legRepo = { findOne: jest.fn().mockResolvedValue(leg) };
    teamRepo = { findOne: jest.fn().mockResolvedValue(team) };
    commRepo = {
      create: jest.fn((dto) => dto),
      save: jest.fn(async (entity) => ({ id: 'comm-1', ...entity })),
      find: jest.fn(),
    };
    userRepo = { findOne: jest.fn().mockResolvedValue(user) };
    mailService = { send: jest.fn().mockResolvedValue({ sent: true }) };

    const moduleRef = await Test.createTestingModule({
      providers: [
        NotificationsService,
        { provide: getRepositoryToken(Leg), useValue: legRepo },
        { provide: getRepositoryToken(Team), useValue: teamRepo },
        { provide: getRepositoryToken(Comm), useValue: commRepo },
        { provide: getRepositoryToken(User), useValue: userRepo },
        { provide: MailService, useValue: mailService },
      ],
    }).compile();
    service = moduleRef.get(NotificationsService);
  });

  it("sendCrewNotification emails the captain, cc's the agent, and logs a NOTIFICATION comm", async () => {
    await service.sendCrewNotification('leg-1', 'user-1');

    expect(mailService.send).toHaveBeenCalledWith(
      expect.objectContaining({
        to: 'adam@example.com',
        cc: 'starscmn@starsaviationservices.com',
        subject: expect.stringContaining('HECA'),
      }),
    );
    expect(commRepo.create).toHaveBeenCalledWith(
      expect.objectContaining({ direction: 'OUTBOUND', kind: 'NOTIFICATION', legId: 'leg-1', toAddress: 'adam@example.com' }),
    );
  });

  it("sendTeamNotification looks up the team and bcc's the coordinator", async () => {
    await service.sendTeamNotification('leg-1', 'user-1');

    expect(teamRepo.findOne).toHaveBeenCalled();
    expect(mailService.send).toHaveBeenCalledWith(
      expect.objectContaining({ to: 'xrayteam@univ-wea.com', bcc: 'bminja@univ-wea.com' }),
    );
  });

  it('sendTeamNotification throws NotFoundException when the leg has no matching Team', async () => {
    teamRepo.findOne.mockResolvedValue(null);

    await expect(service.sendTeamNotification('leg-1', 'user-1')).rejects.toThrow(NotFoundException);
  });

  it("sendAgentServiceReport emails the agent and cc's the coordinator", async () => {
    await service.sendAgentServiceReport('leg-1', 'user-1');

    expect(mailService.send).toHaveBeenCalledWith(
      expect.objectContaining({ to: 'starscmn@starsaviationservices.com', cc: 'bminja@univ-wea.com' }),
    );
  });

  it('buildAgentWhatsApp returns a wa.me link built from the parsed agent phone and logs a comm', async () => {
    const result = await service.buildAgentWhatsApp('leg-1', 'user-1');

    expect(result.url).toContain('https://wa.me/212661888747');
    expect(result.phone).toBe('+212 661 888 747');
    expect(commRepo.create).toHaveBeenCalledWith(
      expect.objectContaining({ kind: 'NOTIFICATION', toAddress: '+212 661 888 747' }),
    );
  });

  it('buildAgentWhatsApp throws NotFoundException when the leg has no agent phone', async () => {
    legRepo.findOne.mockResolvedValue({ ...leg, agentContacts: 'noPhone@example.com' });

    await expect(service.buildAgentWhatsApp('leg-1', 'user-1')).rejects.toThrow(NotFoundException);
  });

  it('listForLeg returns NOTIFICATION comms for the leg', async () => {
    commRepo.find.mockResolvedValue([{ id: 'comm-1', kind: 'NOTIFICATION' }]);

    const result = await service.listForLeg('leg-1');

    expect(commRepo.find).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ legId: 'leg-1', kind: 'NOTIFICATION' }) }),
    );
    expect(result).toHaveLength(1);
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `cd backend && npx jest test/notifications.service.spec.ts`
Expected: FAIL — `Cannot find module '../src/notifications/notifications.service'`

- [ ] **Step 3: Implement NotificationsService**

`backend/src/notifications/notifications.service.ts`:
```typescript
import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { ILike, Repository } from 'typeorm';
import { Leg } from '../legs/leg.entity';
import { Team } from './team.entity';
import { Comm } from '../permits/comm.entity';
import { User } from '../users/user.entity';
import { MailService } from '../mail/mail.service';
import { parseContact } from './parse-contact';
import {
  buildCrewNotificationEmail,
  buildTeamNotificationEmail,
  buildAgentServiceReportEmail,
  buildAgentWhatsAppMessage,
  buildWhatsAppLink,
} from './notification-templates';

@Injectable()
export class NotificationsService {
  constructor(
    @InjectRepository(Leg) private readonly legRepo: Repository<Leg>,
    @InjectRepository(Team) private readonly teamRepo: Repository<Team>,
    @InjectRepository(Comm) private readonly commRepo: Repository<Comm>,
    @InjectRepository(User) private readonly userRepo: Repository<User>,
    private readonly mailService: MailService,
  ) {}

  private async loadContext(legId: string, userId: string): Promise<{ leg: Leg; user: User }> {
    const leg = await this.legRepo.findOne({ where: { id: legId } });
    if (!leg) throw new NotFoundException(`Leg ${legId} not found`);
    const user = await this.userRepo.findOne({ where: { id: userId } });
    if (!user) throw new NotFoundException(`User ${userId} not found`);
    return { leg, user };
  }

  private logComm(legId: string, fromAddress: string, toAddress: string, subject: string, body: string): Promise<Comm> {
    return this.commRepo.save(
      this.commRepo.create({
        direction: 'OUTBOUND',
        legId,
        permitRequestId: null,
        correlationToken: null,
        fromAddress,
        toAddress,
        subject,
        body,
        kind: 'NOTIFICATION',
        sentAt: new Date(),
      }),
    );
  }

  async sendCrewNotification(legId: string, userId: string): Promise<Comm> {
    const { leg, user } = await this.loadContext(legId, userId);
    const { email: agentEmail, phone: agentPhone } = parseContact(leg.agentContacts);
    const { subject, body } = buildCrewNotificationEmail(leg, user, agentEmail, agentPhone);

    await this.mailService.send({ to: leg.captEmail ?? '', cc: agentEmail, subject, body });
    return this.logComm(legId, user.fromEmail, leg.captEmail ?? '', subject, body);
  }

  async sendTeamNotification(legId: string, userId: string): Promise<Comm> {
    const { leg, user } = await this.loadContext(legId, userId);
    if (!leg.tssTeam) throw new NotFoundException(`Leg ${legId} has no TSS team set`);
    const team = await this.teamRepo.findOne({ where: { name: ILike(leg.tssTeam.trim()) } });
    if (!team) throw new NotFoundException(`No Team found named "${leg.tssTeam}"`);
    const { email: agentEmail, phone: agentPhone } = parseContact(leg.agentContacts);
    const { subject, body } = buildTeamNotificationEmail(leg, team, user, agentEmail, agentPhone);

    await this.mailService.send({ to: team.teamEmail, bcc: user.fromEmail, subject, body });
    return this.logComm(legId, user.fromEmail, team.teamEmail, subject, body);
  }

  async sendAgentServiceReport(legId: string, userId: string): Promise<Comm> {
    const { leg, user } = await this.loadContext(legId, userId);
    const { email: agentEmail } = parseContact(leg.agentContacts);
    if (!agentEmail) throw new NotFoundException(`Leg ${legId} has no agent email on file`);
    const { subject, body } = buildAgentServiceReportEmail(leg, user);

    await this.mailService.send({ to: agentEmail, cc: user.fromEmail, subject, body });
    return this.logComm(legId, user.fromEmail, agentEmail, subject, body);
  }

  async buildAgentWhatsApp(legId: string, userId: string): Promise<{ url: string; phone: string }> {
    const { leg, user } = await this.loadContext(legId, userId);
    const { phone: agentPhone } = parseContact(leg.agentContacts);
    const message = buildAgentWhatsAppMessage(leg, user);
    const url = buildWhatsAppLink(agentPhone, message);
    if (!url) throw new NotFoundException(`Leg ${legId} has no agent phone number on file`);

    await this.logComm(legId, user.fromEmail, agentPhone, 'WhatsApp — Agent', message);
    return { url, phone: agentPhone };
  }

  listForLeg(legId: string): Promise<Comm[]> {
    return this.commRepo.find({ where: { legId, kind: 'NOTIFICATION' }, order: { sentAt: 'DESC' } });
  }
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `cd backend && npx jest test/notifications.service.spec.ts`
Expected: PASS (7 tests)

- [ ] **Step 5: Add the controller**

`backend/src/notifications/notifications.controller.ts`:
```typescript
import { Controller, Get, Param, Post, Req, UseGuards } from '@nestjs/common';
import type { Request } from 'express';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { NotificationsService } from './notifications.service';

interface AuthedRequest extends Request {
  user: { userId: string; username: string };
}

@Controller('legs/:legId/notifications')
@UseGuards(JwtAuthGuard)
export class NotificationsController {
  constructor(private readonly notificationsService: NotificationsService) {}

  @Get()
  list(@Param('legId') legId: string) {
    return this.notificationsService.listForLeg(legId);
  }

  @Post('crew')
  sendCrew(@Param('legId') legId: string, @Req() req: AuthedRequest) {
    return this.notificationsService.sendCrewNotification(legId, req.user.userId);
  }

  @Post('team')
  sendTeam(@Param('legId') legId: string, @Req() req: AuthedRequest) {
    return this.notificationsService.sendTeamNotification(legId, req.user.userId);
  }

  @Post('agent-service-report')
  sendAgentServiceReport(@Param('legId') legId: string, @Req() req: AuthedRequest) {
    return this.notificationsService.sendAgentServiceReport(legId, req.user.userId);
  }

  @Post('agent-whatsapp')
  agentWhatsApp(@Param('legId') legId: string, @Req() req: AuthedRequest) {
    return this.notificationsService.buildAgentWhatsApp(legId, req.user.userId);
  }
}
```

- [ ] **Step 6: Add the module and wire it into the app**

`backend/src/notifications/notifications.module.ts`:
```typescript
import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Leg } from '../legs/leg.entity';
import { Team } from './team.entity';
import { Comm } from '../permits/comm.entity';
import { User } from '../users/user.entity';
import { NotificationsService } from './notifications.service';
import { NotificationsController } from './notifications.controller';
import { MailModule } from '../mail/mail.module';

@Module({
  imports: [TypeOrmModule.forFeature([Leg, Team, Comm, User]), MailModule],
  providers: [NotificationsService],
  controllers: [NotificationsController],
})
export class NotificationsModule {}
```

Modify `backend/src/app.module.ts` — add the import and add `NotificationsModule` to the `imports` array (alongside `LegsModule`/`PermitsModule`).

- [ ] **Step 7: Write the failing e2e test**

`backend/test/notifications.e2e-spec.ts`:
```typescript
import { Test } from '@nestjs/testing';
import { ExecutionContext, INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import { getRepositoryToken } from '@nestjs/typeorm';
import { NotificationsModule } from '../src/notifications/notifications.module';
import { JwtAuthGuard } from '../src/auth/jwt-auth.guard';
import { Leg } from '../src/legs/leg.entity';
import { Team } from '../src/notifications/team.entity';
import { Comm } from '../src/permits/comm.entity';
import { User } from '../src/users/user.entity';
import { PermitRequest } from '../src/permits/permit-request.entity';
import { CountryRequirement } from '../src/country-requirements/country-requirement.entity';
import { FormTemplate } from '../src/form-templates/form-template.entity';
import { MailService } from '../src/mail/mail.service';

describe('Notifications (e2e)', () => {
  let app: INestApplication;

  beforeAll(async () => {
    const leg = {
      id: 'leg-1',
      tail: 'N148B',
      tripNo: '482421',
      icao: 'HECA',
      country: 'Egypt',
      arrDate: new Date('2026-09-16T16:20:00.000Z'),
      depDate: new Date('2026-09-17T15:00:00.000Z'),
      captName: 'ADAM HEBERT',
      captEmail: 'adam@example.com',
      agentName: 'Hicham Bentouzer',
      agentContacts: 'starscmn@starsaviationservices.com / +212 661 888 747',
      tssTeam: 'X-Ray',
    };
    const legRepo = { findOne: jest.fn().mockResolvedValue(leg) };
    const teamRepo = { findOne: jest.fn().mockResolvedValue({ id: 'team-1', name: 'X-RAY', teamEmail: 'xrayteam@univ-wea.com' }) };
    const commRepo = {
      create: jest.fn((dto) => dto),
      save: jest.fn(async (entity) => ({ id: 'comm-1', ...entity })),
      find: jest.fn().mockResolvedValue([]),
    };
    const userRepo = {
      findOne: jest.fn().mockResolvedValue({
        id: 'user-1',
        fullName: 'Barnaba Minja',
        jobTitle: 'A2G Coordinator',
        mobile: '+255 713 000 000',
        fromEmail: 'bminja@univ-wea.com',
      }),
    };

    const moduleRef = await Test.createTestingModule({
      imports: [NotificationsModule],
    })
      .overrideProvider(getRepositoryToken(Leg))
      .useValue(legRepo)
      .overrideProvider(getRepositoryToken(Team))
      .useValue(teamRepo)
      .overrideProvider(getRepositoryToken(Comm))
      .useValue(commRepo)
      .overrideProvider(getRepositoryToken(User))
      .useValue(userRepo)
      .overrideProvider(getRepositoryToken(PermitRequest))
      .useValue({})
      .overrideProvider(getRepositoryToken(CountryRequirement))
      .useValue({})
      .overrideProvider(getRepositoryToken(FormTemplate))
      .useValue({})
      .overrideProvider(MailService)
      .useValue({ send: jest.fn().mockResolvedValue({ sent: true }) })
      .overrideGuard(JwtAuthGuard)
      .useValue({
        canActivate: (context: ExecutionContext) => {
          const req = context.switchToHttp().getRequest();
          req.user = { userId: 'user-1', username: 'testuser' };
          return true;
        },
      })
      .compile();

    app = moduleRef.createNestApplication();
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  it('POST /legs/:legId/notifications/crew sends and logs a NOTIFICATION comm', async () => {
    const response = await request(app.getHttpServer()).post('/legs/leg-1/notifications/crew').send();

    expect(response.status).toBe(201);
    expect(response.body).toEqual(expect.objectContaining({ direction: 'OUTBOUND', kind: 'NOTIFICATION' }));
  });

  it('GET /legs/:legId/notifications returns an array', async () => {
    const response = await request(app.getHttpServer()).get('/legs/leg-1/notifications');

    expect(response.status).toBe(200);
    expect(Array.isArray(response.body)).toBe(true);
  });
});
```

Note: `NotificationsModule` imports `MailModule`, which `forwardRef`s `PermitsModule` (Slice 3, Task 8) — so `PermitsModule`'s own `TypeOrmModule.forFeature([PermitRequest, Comm, Leg, CountryRequirement, FormTemplate])` registrations get eagerly instantiated too, needing a live `DataSource`, exactly the DI-construction lesson learned in Slice 3 Task 3. `getRepositoryToken(Leg)`/`getRepositoryToken(Comm)` are already overridden above (tokens are keyed by entity class, so one override satisfies both `NotificationsModule`'s and `PermitsModule`'s separate registrations); `PermitRequest`/`CountryRequirement`/`FormTemplate` need their own dummy overrides since nothing else provides them here.

- [ ] **Step 8: Run the e2e test to verify it passes**

Run: `cd backend && npx jest test/notifications.e2e-spec.ts --config test/jest-e2e.json`
Expected: PASS (2 tests)

- [ ] **Step 9: Run the full backend suite and build**

Run:
```bash
cd backend
npx jest
npx jest --config test/jest-e2e.json
npm run build
```
Expected: all PASS, build succeeds.

- [ ] **Step 10: Commit**

```bash
git add backend/src/notifications/notifications.service.ts backend/src/notifications/notifications.controller.ts backend/src/notifications/notifications.module.ts backend/src/app.module.ts backend/test/notifications.service.spec.ts backend/test/notifications.e2e-spec.ts
git commit -m "Add NotificationsService/Controller — Email 1/2/3 and WhatsApp-agent, logged to Comms"
```

---

### Task 6: Seed `Teams` from the real `TEAMS` sheet

**Files:**
- Modify: `backend/scripts/seed-from-excel.ts`

**Interfaces:**
- Consumes: `Team` entity (Task 1). Extends the existing `main()` seeding flow (`seedUsers`, `seedLegs`) with `seedTeams`.

- [ ] **Step 1: Add seedTeams and wire it into main()**

Modify `backend/scripts/seed-from-excel.ts` — add the import:
```typescript
import { Team } from '../src/notifications/team.entity';
```

Add the function (after `seedLegs`):
```typescript
async function seedTeams(workbook: XLSX.WorkBook, dataSource: typeof AppDataSource) {
  const teamsSheet = workbook.Sheets['TEAMS'];
  const rows = XLSX.utils.sheet_to_json<any[]>(teamsSheet, { header: 1, range: 1 });
  const teamRepo = dataSource.getRepository(Team);
  let created = 0;

  for (const row of rows) {
    const name = row[0] != null ? String(row[0]).trim() : '';
    const teamEmail = row[2] != null ? String(row[2]).trim() : '';
    if (!name || !teamEmail) continue;

    const exists = await teamRepo.findOne({ where: { name } });
    if (exists) continue;

    await teamRepo.save(teamRepo.create({ name, teamEmail, remarks: row[3] ? String(row[3]) : null }));
    created++;
  }
  return created;
}
```

Modify `main()` to call it and include the count in the summary log:
```typescript
  const usersCreated = await seedUsers(workbook, AppDataSource);
  const legsCreated = await seedLegs(workbook, AppDataSource);
  const teamsCreated = await seedTeams(workbook, AppDataSource);

  console.log(`Seeded ${usersCreated} user(s), ${legsCreated} leg(s), ${teamsCreated} team(s).`);
```

- [ ] **Step 2: Verify the backend still builds**

Run: `cd backend && npm run build`
Expected: compiles with no errors. (The script itself is verified for real against the live workbook in Task 8.)

- [ ] **Step 3: Commit**

```bash
git add backend/scripts/seed-from-excel.ts
git commit -m "Seed Teams from the real TEAMS sheet (21 rows, real @univ-wea.com addresses)"
```

---

### Task 7: Frontend — Notifications section on the leg detail page

**Files:**
- Create: `frontend/src/app/legs/[id]/notifications.tsx`
- Modify: `frontend/src/app/legs/[id]/page.tsx`, `frontend/src/lib/api-client.ts`, `frontend/src/app/globals.css`
- Test: `frontend/test/notifications.test.tsx`, `frontend/test/api-client.test.ts`

**Interfaces:**
- Consumes: `GET/POST /legs/:legId/notifications*` (Task 5).
- Produces: `listNotifications`, `sendCrewNotification`, `sendTeamNotification`, `sendAgentServiceReport`, `getAgentWhatsAppLink` in `api-client.ts`. `<Notifications legId={...} />` component.

- [ ] **Step 1: Write the failing api-client tests**

Add to `frontend/test/api-client.test.ts` (adjust the top-of-file import to include the new functions):
```typescript
  it('listNotifications fetches NOTIFICATION comms for a leg', async () => {
    const comms = [{ id: 'comm-1', legId: 'leg-1', direction: 'OUTBOUND', toAddress: 'adam@example.com', subject: 'UA Crew Notification', sentAt: '2026-08-23T00:00:00.000Z' }];
    (fetch as any).mockResolvedValue({ ok: true, json: async () => comms });

    const result = await listNotifications('token-123', 'leg-1');

    expect(fetch).toHaveBeenCalledWith(
      expect.stringContaining('/legs/leg-1/notifications'),
      expect.objectContaining({ headers: { Authorization: 'Bearer token-123' } }),
    );
    expect(result).toEqual(comms);
  });

  it('sendCrewNotification posts to the crew notification endpoint', async () => {
    (fetch as any).mockResolvedValue({ ok: true, json: async () => ({ id: 'comm-1' }) });

    await sendCrewNotification('token-123', 'leg-1');

    expect(fetch).toHaveBeenCalledWith(
      expect.stringContaining('/legs/leg-1/notifications/crew'),
      expect.objectContaining({ method: 'POST', headers: { Authorization: 'Bearer token-123' } }),
    );
  });

  it('sendTeamNotification posts to the team notification endpoint', async () => {
    (fetch as any).mockResolvedValue({ ok: true, json: async () => ({ id: 'comm-1' }) });

    await sendTeamNotification('token-123', 'leg-1');

    expect(fetch).toHaveBeenCalledWith(
      expect.stringContaining('/legs/leg-1/notifications/team'),
      expect.objectContaining({ method: 'POST' }),
    );
  });

  it('sendAgentServiceReport posts to the agent-service-report endpoint', async () => {
    (fetch as any).mockResolvedValue({ ok: true, json: async () => ({ id: 'comm-1' }) });

    await sendAgentServiceReport('token-123', 'leg-1');

    expect(fetch).toHaveBeenCalledWith(
      expect.stringContaining('/legs/leg-1/notifications/agent-service-report'),
      expect.objectContaining({ method: 'POST' }),
    );
  });

  it('getAgentWhatsAppLink posts to the agent-whatsapp endpoint and returns the url/phone', async () => {
    (fetch as any).mockResolvedValue({ ok: true, json: async () => ({ url: 'https://wa.me/212661888747?text=Hi', phone: '+212 661 888 747' }) });

    const result = await getAgentWhatsAppLink('token-123', 'leg-1');

    expect(fetch).toHaveBeenCalledWith(
      expect.stringContaining('/legs/leg-1/notifications/agent-whatsapp'),
      expect.objectContaining({ method: 'POST' }),
    );
    expect(result).toEqual({ url: 'https://wa.me/212661888747?text=Hi', phone: '+212 661 888 747' });
  });
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `cd frontend && npx vitest run test/api-client.test.ts`
Expected: FAIL — `listNotifications is not a function` (and similar for the other four)

- [ ] **Step 3: Implement the api-client functions**

Modify `frontend/src/lib/api-client.ts` — add after `listAllPermitRequests`:
```typescript
export interface NotificationComm {
  id: string;
  legId: string;
  direction: 'OUTBOUND' | 'INBOUND';
  toAddress: string;
  subject: string;
  sentAt: string;
}

export async function listNotifications(token: string, legId: string): Promise<NotificationComm[]> {
  const response = await fetch(`${API_URL}/legs/${legId}/notifications`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!response.ok) throw new Error('Failed to load notifications');
  return response.json();
}

export async function sendCrewNotification(token: string, legId: string): Promise<NotificationComm> {
  const response = await fetch(`${API_URL}/legs/${legId}/notifications/crew`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!response.ok) throw new Error('Failed to send crew notification');
  return response.json();
}

export async function sendTeamNotification(token: string, legId: string): Promise<NotificationComm> {
  const response = await fetch(`${API_URL}/legs/${legId}/notifications/team`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!response.ok) throw new Error('Failed to send team notification');
  return response.json();
}

export async function sendAgentServiceReport(token: string, legId: string): Promise<NotificationComm> {
  const response = await fetch(`${API_URL}/legs/${legId}/notifications/agent-service-report`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!response.ok) throw new Error('Failed to send agent service report request');
  return response.json();
}

export async function getAgentWhatsAppLink(token: string, legId: string): Promise<{ url: string; phone: string }> {
  const response = await fetch(`${API_URL}/legs/${legId}/notifications/agent-whatsapp`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!response.ok) throw new Error('Failed to build WhatsApp link');
  return response.json();
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `cd frontend && npx vitest run test/api-client.test.ts`
Expected: PASS (15 tests)

- [ ] **Step 5: Write the failing component test**

`frontend/test/notifications.test.tsx`:
```tsx
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import * as apiClient from '../src/lib/api-client';
import Notifications from '../src/app/legs/[id]/notifications';

vi.mock('../src/lib/api-client', async () => {
  const actual = await vi.importActual<typeof apiClient>('../src/lib/api-client');
  return {
    ...actual,
    listNotifications: vi.fn(),
    sendCrewNotification: vi.fn(),
    sendTeamNotification: vi.fn(),
    sendAgentServiceReport: vi.fn(),
    getAgentWhatsAppLink: vi.fn(),
  };
});

describe('Notifications', () => {
  beforeEach(() => {
    localStorage.setItem('uaa_token', 'test-token');
    vi.mocked(apiClient.listNotifications).mockResolvedValue([]);
  });

  it('sends a crew notification on click and refreshes the list', async () => {
    vi.mocked(apiClient.sendCrewNotification).mockResolvedValue({
      id: 'comm-1',
      legId: 'leg-1',
      direction: 'OUTBOUND',
      toAddress: 'adam@example.com',
      subject: 'UA Crew Notification',
      sentAt: '2026-08-23T00:00:00.000Z',
    });

    render(<Notifications legId="leg-1" />);
    await waitFor(() => expect(apiClient.listNotifications).toHaveBeenCalledWith('test-token', 'leg-1'));

    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: 'Notify Crew' }));

    await waitFor(() => expect(apiClient.sendCrewNotification).toHaveBeenCalledWith('test-token', 'leg-1'));
  });

  it('shows an error message when a send fails', async () => {
    vi.mocked(apiClient.sendTeamNotification).mockRejectedValue(new Error('fail'));

    render(<Notifications legId="leg-1" />);
    await waitFor(() => expect(apiClient.listNotifications).toHaveBeenCalled());

    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: 'Notify Team' }));

    await waitFor(() => expect(screen.getByRole('alert')).toBeInTheDocument());
  });
});
```

- [ ] **Step 6: Run the test to verify it fails**

Run: `cd frontend && npx vitest run test/notifications.test.tsx`
Expected: FAIL — `Cannot find module '../src/app/legs/[id]/notifications'`

- [ ] **Step 7: Implement the Notifications component**

`frontend/src/app/legs/[id]/notifications.tsx`:
```tsx
'use client';

import { useEffect, useState } from 'react';
import {
  listNotifications,
  sendCrewNotification,
  sendTeamNotification,
  sendAgentServiceReport,
  getAgentWhatsAppLink,
  type NotificationComm,
} from '@/lib/api-client';

export default function Notifications({ legId }: { legId: string }) {
  const [notifications, setNotifications] = useState<NotificationComm[]>([]);
  const [sending, setSending] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  function refresh() {
    const token = localStorage.getItem('uaa_token');
    if (!token) return Promise.resolve();
    return listNotifications(token, legId)
      .then(setNotifications)
      .catch(() => setNotifications([]));
  }

  useEffect(() => {
    refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [legId]);

  async function handleSend(label: string, action: (token: string) => Promise<unknown>) {
    const token = localStorage.getItem('uaa_token');
    if (!token) return;
    setSending(label);
    setError(null);
    try {
      await action(token);
      await refresh();
    } catch {
      setError(`Could not send the ${label} notification. Check the leg has the required contact details.`);
    } finally {
      setSending(null);
    }
  }

  async function handleWhatsApp() {
    const token = localStorage.getItem('uaa_token');
    if (!token) return;
    setSending('WhatsApp');
    setError(null);
    try {
      const { url } = await getAgentWhatsAppLink(token, legId);
      window.open(url, '_blank', 'noopener,noreferrer');
      await refresh();
    } catch {
      setError('Could not build a WhatsApp link. Check the leg has an agent phone number on file.');
    } finally {
      setSending(null);
    }
  }

  return (
    <fieldset className="notifications-section">
      <legend>Notifications</legend>

      {error && (
        <p className="login-error" role="alert">
          {error}
        </p>
      )}

      <div className="notification-actions">
        <button
          type="button"
          className="btn-primary"
          disabled={sending !== null}
          onClick={() => handleSend('Crew', (t) => sendCrewNotification(t, legId))}
        >
          {sending === 'Crew' ? 'Sending…' : 'Notify Crew'}
        </button>
        <button
          type="button"
          className="btn-primary"
          disabled={sending !== null}
          onClick={() => handleSend('Team', (t) => sendTeamNotification(t, legId))}
        >
          {sending === 'Team' ? 'Sending…' : 'Notify Team'}
        </button>
        <button
          type="button"
          className="btn-primary"
          disabled={sending !== null}
          onClick={() => handleSend('Agent Service Report', (t) => sendAgentServiceReport(t, legId))}
        >
          {sending === 'Agent Service Report' ? 'Sending…' : 'Request Agent Service Report'}
        </button>
        <button type="button" className="btn-primary" disabled={sending !== null} onClick={handleWhatsApp}>
          {sending === 'WhatsApp' ? 'Opening…' : 'WhatsApp Agent'}
        </button>
      </div>

      <table className="legs-table notifications-table">
        <thead>
          <tr>
            <th>Sent</th>
            <th>To</th>
            <th>Subject</th>
          </tr>
        </thead>
        <tbody>
          {notifications.map((n) => (
            <tr key={n.id}>
              <td className="col-mono">{new Date(n.sentAt).toLocaleString()}</td>
              <td>{n.toAddress}</td>
              <td>{n.subject}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </fieldset>
  );
}
```

- [ ] **Step 8: Add notification section CSS**

Modify `frontend/src/app/globals.css` — append:
```css
.notifications-section {
  border: 1px solid var(--line);
  border-radius: 2px;
  padding: 16px 20px 20px;
  margin: 20px 0 0;
}

.notifications-section legend {
  padding: 0 8px;
  font-size: 11px;
  letter-spacing: 0.12em;
  text-transform: uppercase;
  color: var(--accent);
}

.notification-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  margin-bottom: 16px;
}

.notification-actions .btn-primary {
  width: auto;
  padding: 9px 16px;
}

.notifications-table {
  margin-top: 4px;
}
```

- [ ] **Step 9: Wire the section into the leg detail page**

Modify `frontend/src/app/legs/[id]/page.tsx`:
```tsx
'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { getLeg, type Leg } from '@/lib/api-client';
import PermitRequests from './permit-requests';
import Notifications from './notifications';

export default function LegDetailPage() {
  const { id } = useParams<{ id: string }>();
  const [leg, setLeg] = useState<Leg | null>(null);
  const router = useRouter();

  useEffect(() => {
    const token = localStorage.getItem('uaa_token');
    if (!token) {
      router.replace('/login');
      return;
    }
    getLeg(token, id)
      .then(setLeg)
      .catch(() => router.replace('/legs'));
  }, [id, router]);

  if (!leg) return null;

  return (
    <div className="board-shell">
      <div className="board-header">
        <h1 className="board-title">
          UAA Coordinator — Trip {leg.tripNo}
        </h1>
        <a className="btn-link" href="/legs">
          Back to legs
        </a>
      </div>
      <div className="runway-rule" />

      <div className="leg-detail-summary">
        <div>
          <span className="col-muted">ICAO</span>
          <span className="col-mono">{leg.icao}</span>
        </div>
        <div>
          <span className="col-muted">Tail</span>
          <span className="col-mono">{leg.tail}</span>
        </div>
        <div>
          <span className="col-muted">Country</span>
          <span>{leg.country}</span>
        </div>
      </div>

      <PermitRequests legId={leg.id} country={leg.country} />
      <Notifications legId={leg.id} />
    </div>
  );
}
```

- [ ] **Step 10: Run the tests to verify they pass**

Run: `cd frontend && npx vitest run test/notifications.test.tsx`
Expected: PASS (2 tests)

- [ ] **Step 11: Run the full frontend suite and the build**

Run:
```bash
cd frontend
npx vitest run
npm run build
```
Expected: all tests PASS (including `leg-detail.test.tsx`, which now also mounts `<Notifications>` — its `refresh()` already has a `.catch()`, same defensive pattern as `PermitRequests`, from the start, so it should not reproduce the Slice 3 Task 6 unhandled-rejection bug). Build succeeds.

- [ ] **Step 12: Commit**

```bash
git add frontend/src/app/legs/[id]/notifications.tsx frontend/src/app/legs/[id]/page.tsx frontend/src/lib/api-client.ts frontend/src/app/globals.css frontend/test/notifications.test.tsx frontend/test/api-client.test.ts
git commit -m "Add Notifications section to the leg detail page — crew/team/agent-report/WhatsApp"
```

---

### Task 8: End-to-end smoke check against the real seeded stack

**Files:** none (verification-only task)

- [ ] **Step 1: Bring up the full stack fresh and run every migration + seed script**

Run:
```bash
docker compose down -v
docker compose up --build -d
docker build --target build -t uaa-backend-seed ./backend
```
Then, from a container joined to the `web-proxy` network (Postgres has no published host port — see Slice 3 Task 9's note in `docs/superpowers/plans/2026-08-23-permit-tracking-and-inbound.md`):
```bash
docker run --rm --network web-proxy -v "<repo>/Aviation/uaa/backend:/app" -w /app \
  -e DATABASE_URL="postgres://uaa:uaa@postgres:5432/uaa" node:20-alpine \
  sh -c "npm install --silent && npx typeorm-ts-node-commonjs migration:run -d src/database/data-source.ts"
docker run --rm --network web-proxy -v "<repo>/Aviation/uaa/UAA_Coordinator_v5.xlsm:/app/UAA_Coordinator_v5.xlsm:ro" \
  -e DATABASE_URL="postgres://uaa:uaa@postgres:5432/uaa" uaa-backend-seed npm run seed -- "UAA_Coordinator_v5.xlsm"
docker run --rm --network web-proxy -e DATABASE_URL="postgres://uaa:uaa@postgres:5432/uaa" \
  uaa-backend-seed npm run seed:country-requirements
```
Expected: 7 migrations now (the prior 6 plus `CreateTeams`), `Seeded 2 user(s), 62 leg(s), 20 team(s).` from the leg seed script (real `TEAMS` sheet row count), `Seeded 15 CountryRequirement(s), 15 FormTemplate(s).` from the other. Reset coordinator `bminja`'s password to `Admin123!` the same way as Slice 3 Task 9 (bcrypt hash generated via `uaa-backend-seed`, applied with `UPDATE users SET password_hash = ...`).

- [ ] **Step 2: Confirm the backend booted cleanly with the new module**

```bash
docker compose logs backend --tail 30
```
Expected: `Nest application successfully started`, with `Mapped {/legs/:legId/notifications, GET}` and the four `POST` notification routes listed, no crash.

- [ ] **Step 3: Send a real crew notification for a leg with real agent contacts (dry-run — no SMTP configured)**

Find a leg whose `agentContacts` is populated (e.g. trip `475087` at `HECA`, agent "Hicham Bentouzer" — confirmed present in the live seeded data during this plan's research) and its `id`, then:
```bash
curl -s -X POST http://localhost:3011/legs/<leg-id>/notifications/crew -H "Authorization: Bearer <token>"
curl -s http://localhost:3011/legs/<leg-id>/notifications -H "Authorization: Bearer <token>"
```
Expected: first call returns `201` with `"direction":"OUTBOUND","kind":"NOTIFICATION"`; second call's array includes that row. Check `docker compose logs backend --tail 10` for the `MailService` dry-run warning line confirming the subject/recipient were built correctly even without live SMTP.

- [ ] **Step 4: Send a real team notification for a leg whose TSS team matches a real seeded Team**

Using a leg with `tssTeam` `"X-Ray"` (real seeded value — confirmed matching the real `TEAMS` sheet row `X-RAY` / `xrayteam@univ-wea.com`):
```bash
curl -s -X POST http://localhost:3011/legs/<leg-id>/notifications/team -H "Authorization: Bearer <token>"
```
Expected: `201`, `toAddress` in the response is `xrayteam@univ-wea.com` — confirms the case-insensitive `ILike` lookup actually resolved against the real seeded `Team` row, not just a unit-test mock.

- [ ] **Step 5: Build a real WhatsApp link**

```bash
curl -s -X POST http://localhost:3011/legs/<leg-id>/notifications/agent-whatsapp -H "Authorization: Bearer <token>"
```
Expected: `{"url":"https://wa.me/<digits>?text=...","phone":"..."}` — a well-formed `wa.me` link built from the real parsed agent phone.

- [ ] **Step 6: Confirm the Notifications section renders in a real browser**

Log in at `http://localhost:3012/login`, open the leg used in Steps 3-4, confirm the "Notifications" section shows both sent rows (crew + team) with correct "To" addresses and subjects, and that all four buttons render.

- [ ] **Step 7: No commit for this task** — it's verification only. If anything fails, fix it in the task that owns the broken piece and re-run this check.

---

## Self-Review

**1. Spec coverage** — this plan implements exactly Build Sequencing item 4 ("Agent/crew/team notifications (Email 1/2/3 + WhatsApp equivalents)"). All three emails are ported from the real macro source (`mod_Email.bas`'s `BuildAndSend`), not guessed from the one-line spec summary; WhatsApp-to-agent is ported from `WhatsApp()`. Every scope cut from the full macro (multi-leg composition, Word-doc attachment, deferred delivery, `AgentReq`, `PMTNotify`, `WhatsAppCaptain`, Country Intel) is named explicitly in Explicitly Deferred with its reasoning, not silently dropped. Notifications use the `Comms` table tagged `NOTIFICATION` with no correlation token, exactly as the spec's Comms section requires.

**2. Placeholder scan** — no TBD/TODO/"add error handling"/"similar to Task N" found. Every task's code is complete and concrete.

**3. Type consistency** — `parseContact`'s `{ email, phone }` shape (Task 2) matches how `NotificationsService` destructures it (Task 5) in all four call sites. The template builders' `Pick<Leg, ...>`/`Pick<User, ...>`/`Pick<Team, ...>` parameter types (Task 3) list exactly the fields `NotificationsService` has available from `Leg`/`User`/`Team` entities (Tasks 1, 5) — checked field-for-field against the real entity files (`leg.entity.ts`, `user.entity.ts`) read during this plan's research, not assumed. `SendMailInput`'s new `cc`/`bcc` fields (Task 4) match exactly what `NotificationsService`'s four send methods pass (Task 5): Email 1 → `cc`, Email 2 → `bcc`, Email 3 → `cc`, matching the real macro's `.CC`/`.BCC` assignments line-for-line. `NotificationComm` (frontend, Task 7) matches the `Comm` entity's actual field names (`toAddress`, `subject`, `sentAt`, `direction`) that the backend's `listForLeg`/send endpoints actually return — no invented fields.

---

Plan complete and saved to `docs/superpowers/plans/2026-08-23-agent-crew-team-notifications.md`. Two execution options:

**1. Subagent-Driven (recommended)** - I dispatch a fresh subagent per task, review between tasks, fast iteration

**2. Inline Execution** - Execute tasks in this session using executing-plans, batch execution with checkpoints

**Which approach?**
