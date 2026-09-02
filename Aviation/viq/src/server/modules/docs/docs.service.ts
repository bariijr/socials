import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import * as fs from 'fs';
import * as path from 'path';
import { fromBuffer } from 'file-type';
import type { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { UploadDocDto } from './dto/upload-doc.dto';
import { VerifyDocDto } from './dto/verify-doc.dto';
import { OcrService } from './ocr.service';

const UPLOADS_DIR = process.env.UPLOADS_DIR || './uploads';
const ALLOWED_MIME_TYPES = [
  'application/pdf',
  'image/jpeg',
  'image/png',
  'image/gif',
  'image/tiff',
  'image/bmp',
  'text/plain',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document', // .docx
];
// Formats with an unambiguous magic-byte signature — checked against the
// actual uploaded bytes, not just the client-declared mimetype. Plain text
// has no signature to check, and DOCX (a zip container) has occasional
// false-negative detections, so both are intentionally excluded here.
const SIGNATURE_VERIFIABLE_MIME_TYPES = new Set([
  'application/pdf', 'image/jpeg', 'image/png', 'image/gif', 'image/tiff', 'image/bmp',
]);
const MAX_FILE_SIZE_BYTES = 20 * 1024 * 1024;

@Injectable()
export class DocsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly ocr: OcrService,
  ) {}

  findAll(tripId?: string, personId?: string) {
    const where = tripId ? { tripId } : personId ? { personId } : undefined;
    return this.prisma.docAttachment.findMany({ where });
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
    if (SIGNATURE_VERIFIABLE_MIME_TYPES.has(file.mimetype)) {
      const detected = await fromBuffer(file.buffer);
      if (!detected || detected.mime !== file.mimetype) {
        throw new BadRequestException(
          `File content does not match its declared type (${file.mimetype}).`,
        );
      }
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

  async runOcr(docId: string, password?: string) {
    const { doc, filePath } = await this.getFile(docId);
    try {
      const { text, structuredFields } = await this.ocr.extract(filePath, doc.mimeType, password);
      return this.prisma.docAttachment.update({
        where: { docId },
        data: {
          ocrStatus: 'Complete',
          ocrText: text,
          ocrStructuredFields: (structuredFields as Prisma.InputJsonValue) ?? undefined,
          ocrError: null,
          ocrProcessedAt: new Date(),
        },
      });
    } catch (e) {
      const message = e instanceof Error ? e.message : 'Unknown OCR error';
      return this.prisma.docAttachment.update({
        where: { docId },
        data: { ocrStatus: 'Failed', ocrError: message, ocrProcessedAt: new Date() },
      });
    }
  }

  async verify(docId: string, dto: VerifyDocDto) {
    await this.findOne(docId);
    const doc = await this.prisma.docAttachment.update({
      where: { docId },
      data: {
        verifiedFields: dto.verifiedFields as unknown as Prisma.InputJsonValue,
        verifiedBy: dto.verifiedBy,
        verifiedAt: new Date(),
        ...(dto.validUntil ? { validUntil: new Date(dto.validUntil) } : {}),
      },
    });
    await this.audit.log(dto.verifiedBy, 'Doc', docId, 'Verified', '', 'Verified');
    return doc;
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
