# VIQ File Storage & Upload Infrastructure (Sub-project 4a of the document-intelligence initiative)

## Context

The user asked for a document-intelligence system: OCR-driven document upload
with a verify-before-save step, richer Person records (passport biodata,
medical certs, instrument ratings) with docs attached, and expiry
monitoring — plus, separately, bulk CRUD for reference data. Given the size,
this was broken into five sub-projects during brainstorming:

- **4a (this spec)** — file storage + upload infrastructure.
- 4b — OCR extraction (Tesseract, local/self-hosted — confirmed with user;
  no external API, no per-document cost, nothing leaves this machine).
- 4c — verify-before-save UX (upload → OCR → editable preview → save/assign).
- 4d — Person schema expansion (passport/medical/ratings) + expiry
  monitoring.
- 4e — bulk reference-data CRUD (operators, aircraft, countries, country
  rules, providers, service types, airports).

4a is first because every other piece needs real file storage to exist
before it can do anything — OCR needs a file to read, the verify UX needs
somewhere to save what it verifies, and Person docs need a place to live.

**Investigation finding that shapes this spec**: `DocsModule`
(`src/server/modules/docs/`) and the `DocAttachment` Prisma model are
already fully built and wired into `app.module.ts` — `GET/POST /docs`,
`GET /docs/:docId`, `DELETE /docs/:docId` all exist and work. But exactly
like Trips/Legs/Stops/Services (before the trip-core-rewire) and Comms
(before the per-service-compose slice), the *frontend* `dataStore.ts`
functions (`getDocs`, `getDocsForTrip`, `saveDoc`) were never migrated off
localStorage — they're synchronous, `void`-returning functions, confirmed
via direct inspection. `TripDetail.tsx`'s DOCS tab is a read-only table with
no upload button, no download link, and no delete action. And critically,
`CreateDocDto.fileName` is just a string today — there has never been an
actual file upload endpoint; nothing is stored on disk, ever.

Per explicit user instruction (carried over from every prior sub-project in
this session): **do not `git commit` any of this work.**

## Goal

A coordinator can upload a real file (PDF or image) from `TripDetail.tsx`'s
DOCS tab, see it stored durably on the server's local disk, download it back,
and delete it — with the metadata (`DocType`, who uploaded it, when, and
what it's attached to) persisted in Postgres via the real API, not
localStorage. The `DocAttachment` scope model is generalized so a document
can belong to a Trip, a Person, or an Aircraft (only Trip-scoped documents
get a UI in this slice — Person/Aircraft-scoped storage is built now so 4d
doesn't need a second migration, but their UI arrives with 4d/4e).

## Design decisions (confirmed with user during brainstorming)

- **Local disk storage**, not cloud object storage — confirmed with user;
  matches this project's current localhost-only reality. A new `uploads/`
  directory at the repo root (git-ignored, created if missing on server
  start), path configurable via `UPLOADS_DIR` env var (default `./uploads`).
- **Generalized scope, not three separate tables.** `DocAttachment` gets
  `tripId` (now nullable), `personId` (new, nullable), and
  `aircraftRegistration` (new, nullable) — exactly one must be set, enforced
  in the DTO/service layer (app-level rule, not a DB constraint — matches
  this project's established "loose DB, app-level rules" pattern, e.g.
  `ServiceTypeDef.category`). This mirrors `Service.ScopeType`/`ScopeID`'s
  existing shape closely enough in spirit, but uses named nullable columns
  instead of a generic `scopeType`/`scopeId` pair — `Person`/`Aircraft`
  don't share a single ID space the way `Leg`/`Stop` do (`Person.PersonID` is
  a string ID, but `Aircraft` is keyed by `Registration`, not an opaque ID —
  a generic `scopeId` would have to silently mean different things per
  scope type, which named nullable columns avoid).
- **Real file storage fields**: `filePath` (relative path under
  `UPLOADS_DIR`, server-generated, never user input), `mimeType`,
  `fileSizeBytes`. `fileName` stays as the original/display name (unchanged
  meaning, now genuinely backed by a stored file instead of being a bare
  label).
- **One upload endpoint, multipart.** `POST /docs/upload` replaces the old
  metadata-only `POST /docs` (confirmed via grep: nothing in the frontend
  calls `saveDoc`'s underlying `POST /docs` today outside `dataStore.ts`
  itself, and `dataStore.ts` is being rewritten in this slice anyway — safe
  to drop the metadata-only route rather than keep two ways to create a
  `DocAttachment`, one of which can never have a real file behind it).
- **Download via a streamed GET**, not a signed URL scheme — `GET
  /docs/:docId/file` streams the file with the stored `mimeType` and a
  `Content-Disposition` header carrying the original `fileName`. Simpler
  than pre-signed URLs and appropriate for local-disk storage; revisit if a
  future slice moves to cloud storage.
- **No OCR, no verify-UX, no Person/Aircraft upload UI in this slice.** This
  is infrastructure only. The one UI touched is `TripDetail.tsx`'s existing
  DOCS tab, extended with a working upload control and working
  download/delete actions for Trip-scoped documents — proves the plumbing
  end-to-end without scope creep into 4b/4c/4d/4e's territory.
- **File type/size limits**: accept PDF and common image types
  (`image/jpeg`, `image/png`) — the types 4b's OCR step will actually be
  able to read — reject anything else with a clear 400. Cap at 20MB per
  file (generous for a scanned document, small enough to not need chunked
  upload infrastructure).

## Backend

### `DocAttachment` schema changes

In `prisma/schema.prisma`'s `DocAttachment` model:

```prisma
model DocAttachment {
  docId               String    @id @map("doc_id")
  tripId              String?   @map("trip_id")
  svcId               String?   @map("svc_id")
  personId            String?   @map("person_id")
  aircraftRegistration String?  @map("aircraft_registration")
  docType             String    @map("doc_type")
  fileName            String    @map("file_name")
  filePath            String    @map("file_path")
  mimeType            String    @map("mime_type")
  fileSizeBytes        Int      @map("file_size_bytes")
  uploadedZ           DateTime  @default(now()) @map("uploaded_z")
  uploadedBy          String    @map("uploaded_by")
  validUntil           DateTime? @map("valid_until")

  trip   Trip?   @relation(fields: [tripId], references: [tripId], onDelete: Cascade)
  person Person? @relation(fields: [personId], references: [personId], onDelete: Cascade)

  @@index([tripId])
  @@index([personId])
  @@index([aircraftRegistration])
  @@map("docs")
}
```

(`trip` relation becomes optional since `tripId` is now nullable. `Person`
is confirmed already a Prisma model with `personId String @id` — add the
`person` relation the same way as `trip`, and add the reverse `docs
DocAttachment[]` field to the `Person` model. `aircraftRegistration` stays
a bare string column with no Prisma relation — `Aircraft` reference data
stays bundled-JSON per this project's established reference-data pattern
(see `README.md`'s "Data model" section), so there's no `Aircraft` table to
relate to.)

Run: `npm run prisma:migrate -- --name generalize_doc_attachment_scope_and_storage`

### Upload directory

`src/server/main.ts` (or a small new `UploadsModule`/provider run at
bootstrap): ensure `process.env.UPLOADS_DIR || './uploads'` exists
(`fs.mkdirSync(dir, { recursive: true })`), same lifecycle spot as other
bootstrap concerns in `main.ts`. Add `uploads/` to `.gitignore`.

### DTOs

`src/server/modules/docs/dto/upload-doc.dto.ts` — the non-file fields sent
alongside the multipart file (NestJS binds these from `@Body()` even on a
multipart request when using `FileInterceptor`):

```typescript
import { IsIn, IsOptional, IsString, ValidateIf } from 'class-validator';

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

Exactly-one-scope validation (`tripId` XOR `personId` XOR
`aircraftRegistration`) is enforced in `DocsService.upload()`, not via a
class-validator decorator — cross-field validation like this reads more
clearly as an explicit check with a real error message than a custom
validator class for a one-off rule.

### Service

`src/server/modules/docs/docs.service.ts` gains:

```typescript
import * as fs from 'fs';
import * as path from 'path';
import { BadRequestException } from '@nestjs/common';

const UPLOADS_DIR = process.env.UPLOADS_DIR || './uploads';
const ALLOWED_MIME_TYPES = ['application/pdf', 'image/jpeg', 'image/png'];
const MAX_FILE_SIZE_BYTES = 20 * 1024 * 1024;

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
  const filePath = path.join(UPLOADS_DIR, storedName);
  await fs.promises.writeFile(filePath, file.buffer);

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
```

`remove()` gains a call to delete the on-disk file (best-effort — log and
continue if the file is already gone, don't fail the delete over it):

```typescript
async remove(docId: string, user = 'SYSTEM') {
  const doc = await this.findOne(docId);
  const filePath = path.join(UPLOADS_DIR, doc.filePath);
  try { await fs.promises.unlink(filePath); } catch { /* already gone — fine */ }
  await this.prisma.docAttachment.delete({ where: { docId } });
  await this.audit.log(user, 'Doc', docId, 'Deleted', docId, '');
  return { docId, deleted: true };
}
```

Remove the old metadata-only `create(dto: CreateDocDto)` method and
`create-doc.dto.ts` — superseded by `upload()`.

### Controller

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

(`FileInterceptor` needs Multer's in-memory storage for the buffer-based
`upload()` above — `@UseInterceptors(FileInterceptor('file'))` defaults to
memory storage, which is what `file.buffer` in the service assumes; no
extra Multer config needed for this file-size range.)

### `app.module.ts`

No change needed — `DocsModule` is already registered.

### Dev dependency

`npm install --save-dev @types/multer` — for `Express.Multer.File`'s type
(NestJS's `@nestjs/platform-express` already brings Multer itself
transitively; only the type declarations need adding explicitly).

## Frontend

### `src/client/data/types.ts`

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

(`TripID` changes from required to optional, matching the schema change.)

### `dataStore.ts` — migrate off localStorage

Same async/API-backed rewrite every other resource in this project has
already been through. Replace the existing synchronous `getDocs`/
`getDocsForTrip`/`saveDoc` block:

```typescript
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

(`uploadDoc` calls `apiFetch` directly rather than the `apiJson` wrapper —
`apiJson` always sets `Content-Type: application/json` when a body is
present, which is wrong for `FormData`; `apiFetch`'s existing
`if (options.body && !headers.has('Content-Type'))` guard already skips
setting it when the caller hasn't set one, and `fetch` sets the correct
`multipart/form-data; boundary=...` automatically for a `FormData` body —
confirm this holds when implementing; no changes needed to `apiClient.ts`
itself.

**Download-auth decision**: a plain `<a href="/api/docs/:id/file">` can't
carry the `Authorization` header `JwtAuthGuard` requires, and weakening the
guard for this one route is explicitly out — so `downloadDocFile()` fetches
the file through the already-authenticated `apiFetch` (header attached
automatically, same as every other call), turns the response into a blob
URL, and triggers the download via a temporary, immediately-clicked, in-
memory `<a>` element — never inserted into the DOM, revoked right after.
This is the only download mechanism this slice implements; do not also add
a query-param token or loosen `JwtAuthGuard` for this route.)

Add `DocType` and the type itself already imported; no other type changes.

### `TripDetail.tsx` DOCS tab

Fetch `docs` already flows through `sheet.docs` (from `getTripSheet`, which
already calls `getDocs()`/maps them into the trip sheet — confirm
`getTripSheet`'s implementation awaits the now-async `getDocs()`/
`getDocsForTrip()` correctly; it already awaits the equivalent for every
other resource, so this should already be consistent — read the function
before assuming). Extend the DOCS tab:

- Add an "UPLOAD DOCUMENT" button that opens a small inline form (doc-type
  `<select>` + a file `<input type="file" accept="application/pdf,image/jpeg,image/png">`
  + an "UPLOAD" button calling `uploadDoc(file, { docType, tripId: trip.TripID, uploadedBy: <logged-in user> })`, then `reload()`).
- Each row gets a "DOWNLOAD" action calling `downloadDocFile(doc.DocID, doc.FileName)`
  and a delete button calling `deleteDoc(doc.DocID)` then `reload()`.

## Testing

No test framework in this project — manual verification, same pattern as
every prior slice:

```powershell
npm run build
npm run start:prod
# 1. Open a trip's DOCS tab, upload a PDF — confirm it appears in the list
#    with correct type/size, and a file actually exists under uploads/.
# 2. Download it — confirm the downloaded file matches the original byte-for-byte.
# 3. Delete it — confirm the row disappears AND the file under uploads/ is gone.
# 4. Attempt to upload a disallowed type (e.g. .docx) — confirm a clear 400,
#    not a silent failure or a 500.
# 5. Attempt to upload a file over 20MB — confirm a clear 400.
# 6. Confirm GET /api/docs (no tripId) still returns every doc across every
#    trip, matching the pre-existing findAll(tripId?) behavior.
```

## Out of scope

- OCR of any kind (4b).
- The verify-before-save editable-preview UX (4c).
- Person/Aircraft-scoped upload UI — the backend supports these scopes now,
  but no page offers them yet (arrives with 4d/4e).
- Expiry monitoring/alerting on `ValidUntil` (4d) — the field exists and is
  settable, but nothing watches it yet.
- Migrating the bundled-JSON reference data (Aircraft, Countries, etc.) to
  real API-backed CRUD — unrelated to this slice, covered by 4e.
- Thumbnails, image compression, virus scanning, or any other upload
  pipeline enrichment beyond the type/size checks above.

## Do not

- Do not `git commit`.
- Do not accept file types beyond PDF/JPEG/PNG in this slice — 4b's OCR
  step can only usefully read these; widening the allowed set is that
  slice's call, not this one's.
- Do not build a signed-URL/pre-authenticated-link download scheme —
  streamed `GET` + existing auth (object-URL blob fetch) is sufficient for
  local-disk storage at this scale.
- Do not remove or weaken `JwtAuthGuard` on any `/docs/*` route to make
  downloads simpler — solve the "how does a browser download authenticate"
  problem client-side (object URL), not by loosening the guard.
