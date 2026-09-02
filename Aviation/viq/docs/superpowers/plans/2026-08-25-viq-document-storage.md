# VIQ File Storage & Upload Infrastructure Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Real file upload/storage/download/delete for `DocAttachment`, generalized to Trip/Person/Aircraft scope, replacing the metadata-only (never-actually-stored) docs system and the frontend's localStorage-only `dataStore.ts` Docs functions.

**Architecture:** `DocAttachment` gains nullable `personId`/`aircraftRegistration` (alongside now-nullable `tripId`) and real file-storage columns (`filePath`/`mimeType`/`fileSizeBytes`). Backend: a new `POST /docs/upload` (multipart, Multer in-memory storage) writes the file to a local `uploads/` directory and creates the row; `GET /docs/:docId/file` streams it back. Frontend: `dataStore.ts`'s Docs functions get the same async/API-backed rewrite every other resource in this project has already been through; `TripDetail.tsx`'s DOCS tab gets a working upload form and working download/delete actions.

**Tech Stack:** NestJS 10 + Prisma 5 + Multer (via `@nestjs/platform-express`, already a dependency) on the backend; React 18 + Vite, native `FormData`/`Blob` on the frontend. One new dev dependency: `@types/multer`.

**Spec:** `docs/superpowers/specs/2026-08-25-viq-document-storage-design.md`

## Global Constraints

- Do NOT `git commit` any of this work — explicit user instruction, carried over from every prior sub-project in this session.
- Local disk storage only (`uploads/` dir, git-ignored) — no cloud object storage in this slice.
- Accept only `application/pdf`, `image/jpeg`, `image/png`, max 20MB — reject anything else with a 400, not a silent failure.
- Exactly one of `tripId`/`personId`/`aircraftRegistration` must be set per `DocAttachment` — enforced in `DocsService`, not the database.
- Download auth: fetch via the already-authenticated `apiFetch` → blob → temporary in-memory `<a>` click → revoke. Never add a query-param token, never loosen `JwtAuthGuard` on any `/docs/*` route.
- `dataStore.ts` has `// @ts-nocheck` — no compile-time type checking applies there. `TripDetail.tsx` does NOT — real type-checking applies.
- This slice does not touch OCR, the verify-before-save UX, Person schema, or reference-data CRUD — those are separate sub-projects (4b/4c/4d/4e).

---

### Task 1: Backend — `DocAttachment` schema, migration, uploads directory

**Files:**
- Modify: `prisma/schema.prisma` (`DocAttachment` model, `Person` model's reverse relation)
- Create: a new Prisma migration (via `npm run prisma:migrate`)
- Modify: `src/server/main.ts` (ensure uploads dir exists on boot)
- Modify: `.gitignore`

**Interfaces:**
- Produces: `DocAttachment.tripId: String?`, `.personId: String?`, `.aircraftRegistration: String?`, `.filePath: String`, `.mimeType: String`, `.fileSizeBytes: Int`.

- [x] **Step 1: Update the `DocAttachment` model**

In `prisma/schema.prisma`, replace the existing `DocAttachment` model:

```prisma
model DocAttachment {
  docId      String    @id @map("doc_id")
  tripId     String    @map("trip_id")
  svcId      String?   @map("svc_id")
  docType    String    @map("doc_type")
  fileName   String    @map("file_name")
  uploadedZ  DateTime  @default(now()) @map("uploaded_z")
  uploadedBy String    @map("uploaded_by")
  validUntil DateTime? @map("valid_until")

  trip Trip @relation(fields: [tripId], references: [tripId], onDelete: Cascade)

  @@index([tripId])
  @@map("docs")
}
```

with:

```prisma
model DocAttachment {
  docId                String    @id @map("doc_id")
  tripId               String?   @map("trip_id")
  svcId                String?   @map("svc_id")
  personId             String?   @map("person_id")
  aircraftRegistration String?   @map("aircraft_registration")
  docType              String    @map("doc_type")
  fileName             String    @map("file_name")
  filePath             String    @map("file_path")
  mimeType              String    @map("mime_type")
  fileSizeBytes         Int       @map("file_size_bytes")
  uploadedZ            DateTime  @default(now()) @map("uploaded_z")
  uploadedBy           String    @map("uploaded_by")
  validUntil            DateTime? @map("valid_until")

  trip   Trip?   @relation(fields: [tripId], references: [tripId], onDelete: Cascade)
  person Person? @relation(fields: [personId], references: [personId], onDelete: Cascade)

  @@index([tripId])
  @@index([personId])
  @@index([aircraftRegistration])
  @@map("docs")
}
```

- [x] **Step 2: Add the reverse relation on `Person`**

In `prisma/schema.prisma`'s `Person` model, add one line after the existing `trip Trip @relation(...)` line:

```prisma
  docs DocAttachment[]
```

- [x] **Step 3: Generate and apply the migration**

Run: `npm run prisma:migrate -- --name generalize_doc_attachment_scope_and_storage`
Expected: a new migration directory under `prisma/migrations/` altering `docs` — `tripId` becomes nullable, `personId`/`aircraftRegistration`/`filePath`/`mimeType`/`fileSizeBytes` get added (the latter three as `NOT NULL` with no default — this is fine since the `docs` table's only rows today are demo-seed rows; if the migration fails on existing rows, ledger it as a plan defect and either backfill placeholder values for the demo rows or drop-and-recreate the seeded demo docs, whichever `prisma migrate dev`'s interactive prompt suggests — this is a dev database, not production data). Exits 0.

- [x] **Step 4: Ensure the uploads directory exists on boot**

In `src/server/main.ts`, add near the top of `bootstrap()` (before `app.listen`):

```typescript
import * as fs from 'fs';
```

```typescript
  const uploadsDir = process.env.UPLOADS_DIR || './uploads';
  fs.mkdirSync(uploadsDir, { recursive: true });
```

- [x] **Step 5: Git-ignore the uploads directory**

Add to `.gitignore`:

```
uploads/
```

- [x] **Step 6: Verify — build and boot**

Run: `npm run prisma:generate`, then `npx nest build`. Both exit 0. Start the server, confirm an `uploads/` directory now exists at the repo root.

- [x] **Step 7: Snapshot (no git commit)**

---

### Task 2: Backend — upload/download/delete endpoints

**Files:**
- Create: `src/server/modules/docs/dto/upload-doc.dto.ts`
- Delete: `src/server/modules/docs/dto/create-doc.dto.ts` (superseded — confirm nothing else imports it before deleting)
- Modify: `src/server/modules/docs/docs.service.ts`
- Modify: `src/server/modules/docs/docs.controller.ts`
- Modify: `package.json` (add `@types/multer` dev dependency)

**Interfaces:**
- Produces: `POST /docs/upload` (multipart), `GET /docs/:docId/file` (streams the file), `DocsService.upload(file, dto)`, `.getFile(docId)`. `GET /docs`, `GET /docs/:docId`, `DELETE /docs/:docId` keep their existing signatures.

- [x] **Step 1: Install `@types/multer`**

Run: `npm install --save-dev @types/multer`

- [x] **Step 2: Create the upload DTO**

`src/server/modules/docs/dto/upload-doc.dto.ts`:

```typescript
import { IsIn, IsOptional, IsString } from 'class-validator';

const DOC_TYPES = [
  'Registration Certificate', 'Airworthiness Certificate', 'Insurance Certificate',
  'Permit Application Form', 'AOC', 'Noise Certificate', 'PAX List',
  'Crew Licence', 'Medical Certificate', 'Other',
] as const;

export class UploadDocDto {
  @IsIn(DOC_TYPES)
  docType!: (typeof DOC_TYPES)[number];

  @IsOptional()
  @IsString()
  tripId?: string;

  @IsOptional()
  @IsString()
  svcId?: string;

  @IsOptional()
  @IsString()
  personId?: string;

  @IsOptional()
  @IsString()
  aircraftRegistration?: string;

  @IsString()
  uploadedBy!: string;

  @IsOptional()
  @IsString()
  validUntil?: string;
}
```

- [x] **Step 3: Delete the old metadata-only DTO**

Delete `src/server/modules/docs/dto/create-doc.dto.ts`. Confirm via search that nothing besides `docs.service.ts`/`docs.controller.ts` (both modified in this task) imports it.

- [x] **Step 4: Rewrite `docs.service.ts`**

Replace the full file:

```typescript
import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import * as fs from 'fs';
import * as path from 'path';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { UploadDocDto } from './dto/upload-doc.dto';

const UPLOADS_DIR = process.env.UPLOADS_DIR || './uploads';
const ALLOWED_MIME_TYPES = ['application/pdf', 'image/jpeg', 'image/png'];
const MAX_FILE_SIZE_BYTES = 20 * 1024 * 1024;

@Injectable()
export class DocsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  findAll(tripId?: string) {
    return this.prisma.docAttachment.findMany({ where: tripId ? { tripId } : undefined });
  }

  async findOne(docId: string) {
    const doc = await this.prisma.docAttachment.findUnique({ where: { docId } });
    if (!doc) throw new NotFoundException(`Doc ${docId} not found`);
    return doc;
  }

  async upload(file: Express.Multer.File, dto: UploadDocDto) {
    const scopesSet = [dto.tripId, dto.personId, dto.aircraftRegistration].filter(Boolean).length;
    if (scopesSet !== 1) {
      throw new BadRequestException('Exactly one of tripId, personId, or aircraftRegistration must be set.');
    }
    if (!ALLOWED_MIME_TYPES.includes(file.mimetype)) {
      throw new BadRequestException(`Unsupported file type: ${file.mimetype}. Allowed: PDF, JPEG, PNG.`);
    }
    if (file.size > MAX_FILE_SIZE_BYTES) {
      throw new BadRequestException('File exceeds the 20MB limit.');
    }

    const docId = `DOC-${Date.now().toString(36).toUpperCase()}`;
    const ext = path.extname(file.originalname);
    const storedName = `${docId}${ext}`;
    await fs.promises.mkdir(UPLOADS_DIR, { recursive: true });
    await fs.promises.writeFile(path.join(UPLOADS_DIR, storedName), file.buffer);

    const doc = await this.prisma.docAttachment.create({
      data: {
        docId,
        tripId: dto.tripId ?? null,
        svcId: dto.svcId ?? null,
        personId: dto.personId ?? null,
        aircraftRegistration: dto.aircraftRegistration ?? null,
        docType: dto.docType,
        fileName: file.originalname,
        filePath: storedName,
        mimeType: file.mimetype,
        fileSizeBytes: file.size,
        uploadedBy: dto.uploadedBy,
        validUntil: dto.validUntil ? new Date(dto.validUntil) : null,
      },
    });
    await this.audit.log(dto.uploadedBy, 'Doc', doc.docId, 'Uploaded', '', doc.fileName);
    return doc;
  }

  async getFile(docId: string) {
    const doc = await this.findOne(docId);
    const filePath = path.join(UPLOADS_DIR, doc.filePath);
    if (!fs.existsSync(filePath)) {
      throw new NotFoundException(`Stored file for ${docId} is missing on disk.`);
    }
    return { doc, filePath };
  }

  async remove(docId: string, user = 'SYSTEM') {
    const doc = await this.findOne(docId);
    const filePath = path.join(UPLOADS_DIR, doc.filePath);
    try {
      await fs.promises.unlink(filePath);
    } catch {
      // Already gone — fine, don't fail the delete over it.
    }
    await this.prisma.docAttachment.delete({ where: { docId } });
    await this.audit.log(user, 'Doc', docId, 'Deleted', docId, '');
    return { docId, deleted: true };
  }
}
```

- [x] **Step 5: Rewrite `docs.controller.ts`**

Replace the full file:

```typescript
import { Controller, Get, Post, Delete, Param, Query, Body, UploadedFile, UseInterceptors, Res, NotFoundException } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import type { Response } from 'express';
import { DocsService } from './docs.service';
import { UploadDocDto } from './dto/upload-doc.dto';

@Controller('docs')
export class DocsController {
  constructor(private readonly docs: DocsService) {}

  @Get()
  findAll(@Query('tripId') tripId?: string) {
    return this.docs.findAll(tripId);
  }

  @Get(':docId')
  findOne(@Param('docId') docId: string) {
    return this.docs.findOne(docId);
  }

  @Post('upload')
  @UseInterceptors(FileInterceptor('file'))
  upload(@UploadedFile() file: Express.Multer.File, @Body() dto: UploadDocDto) {
    if (!file) throw new NotFoundException('No file provided.');
    return this.docs.upload(file, dto);
  }

  @Get(':docId/file')
  async getFile(@Param('docId') docId: string, @Res() res: Response) {
    const { doc, filePath } = await this.docs.getFile(docId);
    res.setHeader('Content-Type', doc.mimeType);
    res.setHeader('Content-Disposition', `inline; filename="${doc.fileName}"`);
    res.sendFile(filePath, { root: '.' });
  }

  @Delete(':docId')
  remove(@Param('docId') docId: string, @Query('user') user?: string) {
    return this.docs.remove(docId, user);
  }
}
```

(Route order matters: `@Get(':docId/file')` must be registered — Nest
matches `GET /docs/DOC-XYZ/file` against this route correctly regardless of
declaration order relative to `@Get(':docId')` since the path shapes differ,
but keep `upload` declared before `findOne`/`:docId` routes as shown, matching
Nest's usual convention of literal-segment routes before param routes.)

- [x] **Step 6: Verify — build**

Run: `npx nest build`. Expect 0 exit.

- [x] **Step 7: Snapshot (no git commit)**

---

### Task 3: Frontend — `types.ts` and `dataStore.ts`

**Files:**
- Modify: `src/client/data/types.ts`
- Modify: `src/client/lib/dataStore.ts`

**Interfaces:**
- Produces: `getDocs(): Promise<DocAttachment[]>`, `getDocsForTrip(tripId): Promise<DocAttachment[]>`, `uploadDoc(file, meta): Promise<DocAttachment>`, `downloadDocFile(docId, fileName): Promise<void>`, `deleteDoc(docId, user?): Promise<void>`.

- [x] **Step 1: Update the `DocAttachment` interface**

In `src/client/data/types.ts`, replace:

```typescript
export interface DocAttachment {
  DocID: string;
  TripID: string;
  SVCID: string | null;
  DocType: DocType;
  FileName: string;
  UploadedZ: string;
  UploadedBy: string;
  ValidUntil?: string;
}
```

with:

```typescript
export interface DocAttachment {
  DocID: string;
  TripID?: string;
  SVCID: string | null;
  PersonID?: string;
  AircraftRegistration?: string;
  DocType: DocType;
  FileName: string;
  MimeType: string;
  FileSizeBytes: number;
  UploadedZ: string;
  UploadedBy: string;
  ValidUntil?: string;
}
```

- [x] **Step 2: Read the current Docs CRUD block first**

Find the existing `getDocs`/`getDocsForTrip`/`saveDoc` functions in
`src/client/lib/dataStore.ts` (search for `function getDocs`) — confirm the
exact current text before replacing, since line numbers have shifted from
this plan's earlier investigation.

- [x] **Step 3: Replace the Docs CRUD block**

Replace the existing block with:

```typescript
// ─── Doc CRUD ─────────────────────────────────────────────────────────────────

function mapDocFromApi(d: any): DocAttachment {
  return {
    DocID: d.docId,
    TripID: d.tripId ?? undefined,
    SVCID: d.svcId ?? null,
    PersonID: d.personId ?? undefined,
    AircraftRegistration: d.aircraftRegistration ?? undefined,
    DocType: d.docType,
    FileName: d.fileName,
    MimeType: d.mimeType,
    FileSizeBytes: d.fileSizeBytes,
    UploadedZ: d.uploadedZ,
    UploadedBy: d.uploadedBy,
    ValidUntil: d.validUntil ?? undefined,
  };
}

export async function getDocs(): Promise<DocAttachment[]> {
  const rows = await apiJson<any[]>('/docs');
  return rows.map(mapDocFromApi);
}

export async function getDocsForTrip(tripId: string): Promise<DocAttachment[]> {
  const rows = await apiJson<any[]>(`/docs?tripId=${encodeURIComponent(tripId)}`);
  return rows.map(mapDocFromApi);
}

export async function uploadDoc(
  file: File,
  meta: { docType: string; tripId?: string; personId?: string; aircraftRegistration?: string; svcId?: string; uploadedBy?: string; validUntil?: string }
): Promise<DocAttachment> {
  const form = new FormData();
  form.append('file', file);
  form.append('docType', meta.docType);
  form.append('uploadedBy', meta.uploadedBy || 'SYSTEM');
  if (meta.tripId) form.append('tripId', meta.tripId);
  if (meta.personId) form.append('personId', meta.personId);
  if (meta.aircraftRegistration) form.append('aircraftRegistration', meta.aircraftRegistration);
  if (meta.svcId) form.append('svcId', meta.svcId);
  if (meta.validUntil) form.append('validUntil', meta.validUntil);

  const res = await apiFetch('/docs/upload', { method: 'POST', body: form });
  if (!res.ok) throw new Error(`Upload failed: ${res.status} ${await res.text().catch(() => '')}`);
  return mapDocFromApi(await res.json());
}

export async function downloadDocFile(docId: string, fileName: string): Promise<void> {
  const res = await apiFetch(`/docs/${docId}/file`, { method: 'GET' });
  if (!res.ok) throw new Error(`Download failed: ${res.status}`);
  const blob = await res.blob();
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = fileName;
  link.click();
  URL.revokeObjectURL(url);
}

export async function deleteDoc(docId: string, user = 'SYSTEM'): Promise<void> {
  await apiJson(`/docs/${docId}?user=${encodeURIComponent(user)}`, { method: 'DELETE' });
}
```

(Do NOT add a `Content-Type` header on the `uploadDoc` request — `apiFetch`
only sets one when the caller hasn't, and `fetch` sets the correct
`multipart/form-data; boundary=...` automatically for a `FormData` body.)

- [x] **Step 4: Fix `getTripSheet`'s docs fetch**

Find `getTripSheet` (search for `export async function getTripSheet`). It
currently calls `docs: getDocsForTrip(tripId)` *without* `await` inside the
returned object literal — harmless while `getDocsForTrip` was synchronous,
now a real bug (an unresolved `Promise` where a `DocAttachment[]` is
expected) since Step 3 makes it async. `dataStore.ts` has `// @ts-nocheck`
so this won't surface as a compile error — fix it directly. Change:

```typescript
  const [legs, stops, services, comms] = await Promise.all([
    getLegsForTrip(tripId),
    getStopsForTrip(tripId),
    getServicesForTrip(tripId),
    getCommsForTrip(tripId),
  ]);
  return {
    trip,
    legs,
    stops,
    services,
    comms,
    persons: getPersonsForTrip(tripId),
    docs: getDocsForTrip(tripId),
  };
```

to:

```typescript
  const [legs, stops, services, comms, docs] = await Promise.all([
    getLegsForTrip(tripId),
    getStopsForTrip(tripId),
    getServicesForTrip(tripId),
    getCommsForTrip(tripId),
    getDocsForTrip(tripId),
  ]);
  return {
    trip,
    legs,
    stops,
    services,
    comms,
    persons: getPersonsForTrip(tripId),
    docs,
  };
```

(Leave `persons: getPersonsForTrip(tripId)` exactly as-is — confirm whether
`getPersonsForTrip` is already synchronous or already-awaited correctly by
reading its definition; it is untouched by this plan either way, so do not
change it unless you find it's already broken the same way, in which case
ledger that as a separate pre-existing defect, not part of this task's
scope.)

- [x] **Step 5: Verify**

Run: `npx tsc -p tsconfig.client.json`. `dataStore.ts` itself never errors
(`// @ts-nocheck`); expect new errors in `TripDetail.tsx` (Task 4 fixes
them) and possibly other consumers of `getDocs`/`getDocsForTrip`/`saveDoc` —
search for any other caller (`grep -rn "getDocs\|saveDoc" src/client/pages
src/client/components`) and note any found for Task 4 to also fix (same
"missed consumer" pattern documented in this project's prior async-migration
plans).

- [x] **Step 6: Snapshot (no git commit)**

---

### Task 4: Frontend — `TripDetail.tsx` DOCS tab

**Files:**
- Modify: `src/client/pages/TripDetail.tsx`

**Interfaces:**
- Consumes: `uploadDoc`, `downloadDocFile`, `deleteDoc` from `@/lib/dataStore`.

- [x] **Step 1: Read the current DOCS tab section first**

Find `{/* ─── DOCS TAB ─────` (search for that comment) — confirm the exact
current markup before editing; it was last a pure read-only table with no
actions.

- [x] **Step 2: Add upload state and handler to the main `TripDetail` component**

Near the other `useState` calls in `export default function TripDetail()`,
add:

```typescript
  const [uploadDocType, setUploadDocType] = useState('Other');
  const [uploadFile, setUploadFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
```

Add a handler (near `addLeg`, before the `return`):

```typescript
  const handleUploadDoc = async () => {
    if (!uploadFile) return;
    setUploading(true);
    try {
      await uploadDoc(uploadFile, { docType: uploadDocType, tripId: trip.TripID, uploadedBy: 'SYSTEM' });
      setUploadFile(null);
      await reload();
    } finally {
      setUploading(false);
    }
  };
```

Import `uploadDoc`, `downloadDocFile`, `deleteDoc` — add to the existing
`@/lib/dataStore` import list. Import the `DOC_TYPES` array's values inline
(no shared constant exists yet) as a local array near the top of the file,
alongside `SERVICE_STATUSES`:

```typescript
const DOC_TYPES = [
  'Registration Certificate', 'Airworthiness Certificate', 'Insurance Certificate',
  'Permit Application Form', 'AOC', 'Noise Certificate', 'PAX List',
  'Crew Licence', 'Medical Certificate', 'Other',
];
```

- [x] **Step 3: Rewrite the DOCS tab markup**

Replace:

```tsx
        {/* ─── DOCS TAB ─────────────────────────────────────────────── */}
        <TabsContent value="docs">
          {docs.length > 0 ? (
            <Card>
              <CardHeader>
                <CardTitle className="text-base font-semibold flex items-center gap-2">
                  <FileText className="h-4 w-4" />
                  DOCUMENT ATTACHMENTS
                </CardTitle>
              </CardHeader>
              <CardContent className="p-0">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>DOC TYPE</TableHead>
                      <TableHead>FILE</TableHead>
                      <TableHead>LINKED SVC</TableHead>
                      <TableHead>UPLOADED Z/UTC</TableHead>
                      <TableHead>BY</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {docs.map(doc => (
                      <TableRow key={doc.DocID}>
                        <TableCell>
                          <Badge variant="outline">{doc.DocType?.toUpperCase()}</Badge>
                        </TableCell>
                        <TableCell className="font-mono text-xs">{doc.FileName?.toUpperCase()}</TableCell>
                        <TableCell className="text-xs text-muted-foreground">{doc.SVCID || '—'}</TableCell>
                        <TableCell className="text-sm">{formatZ(doc.UploadedZ)}</TableCell>
                        <TableCell className="text-sm">{doc.UploadedBy?.toUpperCase()}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          ) : (
            <div className="text-center text-muted-foreground py-8">NO DOCUMENTS ATTACHED</div>
          )}
        </TabsContent>
```

with:

```tsx
        {/* ─── DOCS TAB ─────────────────────────────────────────────── */}
        <TabsContent value="docs" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-base font-semibold flex items-center gap-2">
                <FileText className="h-4 w-4" /> UPLOAD DOCUMENT
              </CardTitle>
            </CardHeader>
            <CardContent className="flex flex-wrap items-center gap-2">
              <select className="h-9 rounded-md border bg-background px-2 text-sm" value={uploadDocType} onChange={(event) => setUploadDocType(event.target.value)}>
                {DOC_TYPES.map((type) => <option key={type} value={type}>{type}</option>)}
              </select>
              <input
                type="file"
                accept="application/pdf,image/jpeg,image/png"
                className="text-sm"
                onChange={(event) => setUploadFile(event.target.files?.[0] || null)}
              />
              <Button size="sm" onClick={handleUploadDoc} disabled={!uploadFile || uploading}>
                {uploading ? 'UPLOADING…' : 'UPLOAD'}
              </Button>
            </CardContent>
          </Card>

          {docs.length > 0 ? (
            <Card>
              <CardHeader>
                <CardTitle className="text-base font-semibold flex items-center gap-2">
                  <FileText className="h-4 w-4" />
                  DOCUMENT ATTACHMENTS
                </CardTitle>
              </CardHeader>
              <CardContent className="p-0">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>DOC TYPE</TableHead>
                      <TableHead>FILE</TableHead>
                      <TableHead>SIZE</TableHead>
                      <TableHead>LINKED SVC</TableHead>
                      <TableHead>UPLOADED Z/UTC</TableHead>
                      <TableHead>BY</TableHead>
                      <TableHead></TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {docs.map(doc => (
                      <TableRow key={doc.DocID}>
                        <TableCell>
                          <Badge variant="outline">{doc.DocType?.toUpperCase()}</Badge>
                        </TableCell>
                        <TableCell className="font-mono text-xs">{doc.FileName?.toUpperCase()}</TableCell>
                        <TableCell className="text-xs text-muted-foreground">{(doc.FileSizeBytes / 1024).toFixed(0)} KB</TableCell>
                        <TableCell className="text-xs text-muted-foreground">{doc.SVCID || '—'}</TableCell>
                        <TableCell className="text-sm">{formatZ(doc.UploadedZ)}</TableCell>
                        <TableCell className="text-sm">{doc.UploadedBy?.toUpperCase()}</TableCell>
                        <TableCell className="flex gap-2">
                          <Button size="sm" variant="outline" onClick={() => downloadDocFile(doc.DocID, doc.FileName)}>DOWNLOAD</Button>
                          <Button size="sm" variant="outline" onClick={async () => { await deleteDoc(doc.DocID); await reload(); }}>DELETE</Button>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          ) : (
            <div className="text-center text-muted-foreground py-8">NO DOCUMENTS ATTACHED</div>
          )}
        </TabsContent>
```

- [x] **Step 4: Fix any other consumer found in Task 3 Step 5**

If Task 3's search found other callers of `getDocs`/`saveDoc` outside
`dataStore.ts` and `TripDetail.tsx`, fix each the same way `CommsPage.tsx`/
`TripsPage.tsx` were fixed in the earlier Comms-migration plan (fetch into
`useState`+`useEffect` if not already async-aware). If none were found,
this step is a no-op — say so explicitly rather than skipping silently.

- [x] **Step 5: Verify — build**

Run: `npm run build:client`. Expect 0 exit, 0 errors.

- [x] **Step 6: Verify — manual browser check**

Log in, open a trip's DOCS tab, upload a small PDF or JPEG — confirm it
appears in the table with the correct type/size. Click DOWNLOAD — confirm
the file downloads and matches the original. Click DELETE — confirm the row
disappears. Attempt to select and upload a disallowed file type — confirm
the backend's 400 surfaces as a thrown error (an unhandled-rejection toast
isn't required by this slice, but the upload must not silently appear to
succeed).

- [x] **Step 7: Snapshot (no git commit)**

---

### Task 5: Full-stack build + end-to-end verification (controller-performed)

Per the pattern established in every prior plan in this repo: this task
produces no diff of its own, so it's performed directly by the controller
rather than dispatched to an implementer, and has no task review of its own.

- [x] **Step 1:** `npm run build` — exits 0 (or `npx nest build` + `npm run
  build:client` separately if the combined script hits the Windows Prisma
  EPERM file-lock issue documented in this repo's README — stop the running
  dev server first if so, then retry the combined command, or just verify
  both halves separately since a schema change happened in Task 1 and
  `prisma generate` genuinely needs to succeed this time, unlike 3b).
- [x] **Step 2:** Start the stack, confirm Postgres has the new `docs`
  columns via `\d docs` or an equivalent live query.
- [x] **Step 3:** Full walkthrough: upload → list → download → delete, for
  a Trip-scoped document, via the live API (curl/Invoke-RestMethod with a
  bearer token if browser login credentials aren't available to this
  session — same fallback used to verify sub-project 3a) and, if possible,
  the browser.
- [x] **Step 4:** Report: build status, which checks passed, any deviations
  ledgered as rulings.

---

## Completion notes (2026-08-25)

**Execution approach**: executed directly by the controller (this session),
same as sub-project 3a, task by task, verified via build after each — not
via `superpowers:subagent-driven-development` (same no-commit conflict as
3a).

**Deviation from the plan (ledgered)**: the migration hit exactly the
NOT-NULL-on-existing-rows issue the plan anticipated (4 existing demo-seed
`docs` rows, no default for the three new required columns). Used
`--create-only`, then edited the generated SQL to `DELETE FROM "docs";`
before adding the columns, rather than backfilling fake `file_path` values
for rows that never had a real file behind them — those 4 rows were
synthetic seed metadata from before this migration introduced real file
storage, so deleting them is more correct than inventing file paths that
point at nothing. This is exactly the fallback the plan's Task 1 Step 3
already named as acceptable.

**Unplanned fallout fixed during Task 3** (found via `npx tsc`, not called
out explicitly in the plan's task list): `src/client/data/seed.ts` (a
"backward-compatible wrapper" module, confirmed via grep that nothing in
the app actually imports it — vestigial) re-exported the now-deleted
`saveDoc`; updated its re-export list to `uploadDoc`/`downloadDocFile`/
`deleteDoc`. `src/client/lib/seed-data.ts`'s `docs` array (4 literal
`DocAttachment` objects, still referenced by `dataStore.ts`'s
`initDataStore()` for its one-time localStorage pre-seed, same as
`seedComms` after the Comms migration — this project's established
pattern of not cleaning up now-inert seed arrays) needed `MimeType`/
`FileSizeBytes` added to satisfy the widened interface; added a comment
there noting the array is dead weight, not actually read by `getDocs()`
anymore, matching the existing `seedComms` precedent rather than deleting
it.

**Verified (Tasks 1–5)**:
- `npx nest build` and `npm run build:client` both clean (0 errors) —
  ran separately since the combined `npm run build` hit the same Windows
  Prisma-EPERM file-lock issue as 3a/3b (dev server holding the query
  engine file); this is an environment quirk documented in this repo's
  README, not a code defect.
- `\d docs` confirms all new columns/indexes/FKs landed correctly.
- Live API walkthrough with a locally-minted JWT (same no-real-password
  fallback as 3a): uploaded a real PDF, confirmed the file exists on disk
  under `uploads/` with byte-for-byte matching content; downloaded it back
  via `GET /docs/:docId/file` and confirmed the response headers
  (`Content-Type`, `Content-Disposition`) and byte-for-byte content match;
  confirmed `GET /docs?tripId=...` lists it; deleted it and confirmed both
  the DB row (404 on re-fetch) and the on-disk file are gone.
- Confirmed the two validation rules work live: uploading a `.docx`
  returns a clean 400 ("Unsupported file type..."), and uploading with no
  `tripId`/`personId`/`aircraftRegistration` returns a clean 400 ("Exactly
  one of..."), neither as a silent failure or a 500.
- All test artifacts (the uploaded file, its DB row, local scratch files)
  were cleaned up after verification — nothing left behind.
- Browser-based manual verification (Task 4 Step 6) was **not** performed —
  no login credentials available to this session, same limitation noted in
  3a's completion notes. Recommend a quick manual check of the DOCS tab's
  upload/download/delete buttons before relying on this feature day-to-day.

**No rulings beyond the one ledgered above were needed.**
