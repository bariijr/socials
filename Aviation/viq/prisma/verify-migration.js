const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  // Check Document row count
  const documentCount = await prisma.document.count();
  console.log(`\nDocument count: ${documentCount}`);

  // Check DocumentVersion row count
  const versionCount = await prisma.documentVersion.count();
  console.log(`DocumentVersion count: ${versionCount}`);

  // Check DocumentSection row count
  const sectionCount = await prisma.documentSection.count();
  console.log(`DocumentSection count: ${sectionCount}`);

  // Check DocumentEntityLink row count
  const linkCount = await prisma.documentEntityLink.count();
  console.log(`DocumentEntityLink count: ${linkCount}`);

  // Spot-check: get the first migrated document with its version
  const doc = await prisma.document.findFirst({
    include: {
      versions: true,
      entityLinks: true,
    },
  });

  if (doc) {
    console.log(`\n✓ Sample migrated Document:`);
    console.log(`  - documentId: ${doc.documentId}`);
    console.log(`  - sourceDocAttachmentId: ${doc.sourceDocAttachmentId}`);
    console.log(`  - originalFileName: ${doc.originalFileName}`);
    console.log(`  - status: ${doc.status}`);
    console.log(`  - mimeType: ${doc.mimeType}`);
    console.log(`  - fileSizeBytes: ${doc.fileSizeBytes}`);
    console.log(`  - sha256: ${doc.sha256 ? doc.sha256.substring(0, 16) + '...' : null}`);

    if (doc.versions && doc.versions.length > 0) {
      const v = doc.versions[0];
      console.log(`\n✓ First version:`);
      console.log(`  - versionNumber: ${v.versionNumber}`);
      console.log(`  - ocrText: ${v.ocrText ? v.ocrText.substring(0, 100) + '...' : null}`);
      console.log(`  - verifiedFields: ${v.verifiedFields ? JSON.stringify(v.verifiedFields).substring(0, 100) : null}`);
      console.log(`  - verifiedBy: ${v.verifiedBy}`);
      console.log(`  - verifiedAtZ: ${v.verifiedAtZ}`);
      console.log(`  - validUntil: ${v.validUntil}`);
    }

    if (doc.entityLinks && doc.entityLinks.length > 0) {
      console.log(`\n✓ Entity links: ${doc.entityLinks.length}`);
      doc.entityLinks.forEach((link, i) => {
        console.log(`  - [${i}] ${link.entityType}: ${link.entityId}`);
      });
    } else {
      console.log(`\n✓ Entity links: 0 (document has no linked entities)`);
    }
  } else {
    console.log(`\nNo documents found!`);
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
