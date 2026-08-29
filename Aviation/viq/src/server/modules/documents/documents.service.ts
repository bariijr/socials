import * as fs from 'fs';
import * as path from 'path';
import * as crypto from 'crypto';
import { fromBuffer } from 'file-type';
import { Injectable, BadRequestException, NotFoundException } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { UploadDocumentDto } from './dto/upload-document.dto';

const UPLOADS_DIR = process.env.DOCUMENTS_UPLOADS_DIR || './uploads/documents';
const ALLOWED_MIME_TYPES = [
  'application/pdf',
  'image/jpeg',
  'image/png',
  'image/tiff',
  'image/webp',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
];
// Formats with an unambiguous magic-byte signature — webp and docx are
// excluded for the same reason docs.service.ts excludes docx: file-type's
// detection has occasional false negatives on otherwise-valid files.
const SIGNATURE_VERIFIABLE_MIME_TYPES = new Set([
  'application/pdf', 'image/jpeg', 'image/png', 'image/tiff',
]);
const MAX_FILE_SIZE_BYTES = 20 * 1024 * 1024;
const ENTITY_TYPES = ['Trip', 'Person', 'Aircraft', 'Operator', 'Client', 'Vendor', 'Service'];

interface EntityLinkInput {
  entityType: string;
  entityId: string;
}

@Injectable()
export class DocumentsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    @InjectQueue('document-processing') private readonly queue: Queue,
  ) {}

  findAll() {
    return this.prisma.document.findMany({ orderBy: { uploadedZ: 'desc' } });
  }

  async findOne(documentId: string) {
    const doc = await this.prisma.document.findUnique({
      where: { documentId },
      include: { versions: true, entityLinks: true, family: true, type: true },
    });
    if (!doc) throw new NotFoundException(`Document ${documentId} not found`);
    return doc;
  }

  findJobs(documentId: string) {
    return this.prisma.documentProcessingJob.findMany({
      where: { documentId },
      orderBy: { createdAtZ: 'desc' },
    });
  }

  private parseEntityLinks(raw: string): EntityLinkInput[] {
    let links: unknown;
    try {
      links = JSON.parse(raw);
    } catch {
      throw new BadRequestException('entityLinks must be a JSON-encoded array.');
    }
    if (!Array.isArray(links) || links.length === 0) {
      throw new BadRequestException('At least one entity link is required.');
    }
    for (const link of links) {
      const l = link as Partial<EntityLinkInput>;
      if (!l || typeof l.entityId !== 'string' || !l.entityId || !ENTITY_TYPES.includes(l.entityType as string)) {
        throw new BadRequestException(`Invalid entity link: ${JSON.stringify(link)}`);
      }
    }
    return links as EntityLinkInput[];
  }

  async upload(file: Express.Multer.File, dto: UploadDocumentDto) {
    const links = this.parseEntityLinks(dto.entityLinks);

    if (!ALLOWED_MIME_TYPES.includes(file.mimetype)) {
      throw new BadRequestException(`Unsupported file type: ${file.mimetype}.`);
    }
    if (file.size > MAX_FILE_SIZE_BYTES) {
      throw new BadRequestException('File exceeds the 20MB limit.');
    }
    if (SIGNATURE_VERIFIABLE_MIME_TYPES.has(file.mimetype)) {
      const detected = await fromBuffer(file.buffer);
      if (!detected || detected.mime !== file.mimetype) {
        throw new BadRequestException(`File content does not match its declared type (${file.mimetype}).`);
      }
    }

    let familyCode: string | null = null;
    if (dto.typeCode) {
      const typeDef = await this.prisma.documentTypeDefinition.findUnique({ where: { code: dto.typeCode } });
      if (!typeDef) throw new BadRequestException(`Unknown typeCode: ${dto.typeCode}`);
      familyCode = typeDef.familyCode;
    }

    const sha256 = crypto.createHash('sha256').update(file.buffer).digest('hex');
    const documentId = `DOCX-${Date.now().toString(36).toUpperCase()}`;
    const ext = path.extname(file.originalname);
    const storedName = `${documentId}${ext}`;
    await fs.promises.mkdir(UPLOADS_DIR, { recursive: true });
    await fs.promises.writeFile(path.join(UPLOADS_DIR, storedName), file.buffer);
    const storagePath = path.join(UPLOADS_DIR, storedName).replace(/\\/g, '/');

    const document = await this.prisma.document.create({
      data: {
        documentId,
        familyCode,
        typeCode: dto.typeCode ?? null,
        originalFileName: file.originalname,
        mimeType: file.mimetype,
        detectedMimeType: SIGNATURE_VERIFIABLE_MIME_TYPES.has(file.mimetype) ? file.mimetype : null,
        fileSizeBytes: file.size,
        sha256,
        status: 'UPLOADED',
        uploadedBy: dto.uploadedBy,
        versions: {
          create: {
            versionNumber: 1,
            storagePath,
            sections: { create: { startPage: 1, endPage: 1 } },
          },
        },
        entityLinks: { create: links.map((l) => ({ entityType: l.entityType, entityId: l.entityId })) },
        processingJobs: { create: { status: 'QUEUED' } },
      },
      include: { processingJobs: true },
    });

    const job = document.processingJobs[0];
    const queueJob = await this.queue.add(
      'process',
      { documentId, jobId: job.id },
      { attempts: 3, backoff: { type: 'exponential', delay: 2000 } },
    );
    await this.prisma.documentProcessingJob.update({
      where: { id: job.id },
      data: { queueJobId: String(queueJob.id) },
    });

    await this.audit.log(dto.uploadedBy, 'Document', documentId, 'Uploaded', '', file.originalname);
    return document;
  }
}
