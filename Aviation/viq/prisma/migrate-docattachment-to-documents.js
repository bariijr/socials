// ─────────────────────────────────────────────────────────────────────────────
// One-time (but safely re-runnable) migration of every existing DocAttachment
// row into the new Document/DocumentVersion/DocumentSection/DocumentEntityLink
// schema (VIQ Document Intelligence Phase 1). Read-only against DocAttachment
// — never deletes or updates it. Idempotent via Document.sourceDocAttachmentId
// (unique): rows already migrated are skipped on re-run.
//
// Run with: node prisma/migrate-docattachment-to-documents.js
// ─────────────────────────────────────────────────────────────────────────────

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { PrismaClient } = require('@prisma/client');

const LEGACY_UPLOADS_DIR = process.env.UPLOADS_DIR || './uploads';
const prisma = new PrismaClient();

const DOC_TYPE_TO_TYPE_CODE = {
  'Registration Certificate': 'REGISTRATION_CERTIFICATE',
  'Airworthiness Certificate': 'AIRWORTHINESS_CERTIFICATE',
  'Insurance Certificate': 'INSURANCE_CERTIFICATE',
  'AOC': 'AOC_OPS_SPECS',
  'Crew Licence': 'CREW_LICENCE_RATING',
  'Medical Certificate': 'CREW_MEDICAL_CERTIFICATE',
  'Permit Application Form': 'OTHER',
  'Noise Certificate': 'OTHER',
  'PAX List': 'OTHER',
  'Other': 'OTHER',
};

function entityLinksFor(doc) {
  const links = [];
  if (doc.tripId) links.push({ entityType: 'Trip', entityId: doc.tripId });
  if (doc.personId) links.push({ entityType: 'Person', entityId: doc.personId });
  if (doc.aircraftRegistration) links.push({ entityType: 'Aircraft', entityId: doc.aircraftRegistration });
  return links;
}

// Best-effort — a source file missing on disk should not abort the whole
// migration run, just leave that one row's sha256 null (matches the
// Document.sha256 column's nullability, which exists for exactly this case).
function hashFile(relativePath) {
  try {
    const buf = fs.readFileSync(path.join(LEGACY_UPLOADS_DIR, relativePath));
    return crypto.createHash('sha256').update(buf).digest('hex');
  } catch {
    return null;
  }
}

async function main() {
  const typeDefs = await prisma.documentTypeDefinition.findMany();
  const typeDefByCode = new Map(typeDefs.map((t) => [t.code, t]));

  const attachments = await prisma.docAttachment.findMany();
  console.log(`Found ${attachments.length} DocAttachment rows.`);

  let migrated = 0;
  let skipped = 0;

  for (const doc of attachments) {
    const existing = await prisma.document.findUnique({ where: { sourceDocAttachmentId: doc.docId } });
    if (existing) {
      skipped++;
      continue;
    }

    const typeCode = DOC_TYPE_TO_TYPE_CODE[doc.docType] || 'OTHER';
    const typeDef = typeDefByCode.get(typeCode);
    if (!typeDef) {
      throw new Error(
        `No seeded DocumentTypeDefinition for typeCode "${typeCode}" (docType "${doc.docType}"). Run the Task 1 migration first.`,
      );
    }

    const links = entityLinksFor(doc);
    if (links.length === 0) {
      console.warn(`DocAttachment ${doc.docId} has no tripId/personId/aircraftRegistration — migrating with zero entity links.`);
    }

    await prisma.document.create({
      data: {
        documentId: `DOCX-MIG-${doc.docId}`,
        familyCode: typeDef.familyCode,
        typeCode: typeDef.code,
        originalFileName: doc.fileName,
        mimeType: doc.mimeType,
        detectedMimeType: null,
        fileSizeBytes: doc.fileSizeBytes,
        sha256: hashFile(doc.filePath),
        status: doc.verifiedAt ? 'READY_FOR_REVIEW' : 'UPLOADED',
        uploadedBy: doc.uploadedBy,
        uploadedZ: doc.uploadedZ,
        sourceDocAttachmentId: doc.docId,
        versions: {
          create: {
            versionNumber: 1,
            storagePath: path.join(LEGACY_UPLOADS_DIR, doc.filePath).replace(/\\/g, '/'),
            ocrText: doc.ocrText,
            ocrStructuredFields: doc.ocrStructuredFields ?? undefined,
            verifiedFields: doc.verifiedFields ?? undefined,
            verifiedBy: doc.verifiedBy,
            verifiedAtZ: doc.verifiedAt,
            validUntil: doc.validUntil,
            sections: { create: { startPage: 1, endPage: 1 } },
          },
        },
        entityLinks: { create: links },
      },
    });
    migrated++;
  }

  console.log(`Migrated ${migrated} rows, skipped ${skipped} already-migrated rows.`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
