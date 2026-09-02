import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import * as fs from 'fs';
import * as path from 'path';
import { fromBuffer } from 'file-type';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { UpdateSettingsDto } from './dto/update-settings.dto';

const UPLOADS_DIR = process.env.UPLOADS_DIR || './uploads';
const BRANDING_SUBDIR = 'branding';
// Logos/favicons only — same magic-byte verification approach as
// docs.service.ts's upload(), scoped to the image types that make sense
// for a logo/favicon rather than the full document allowlist.
const ALLOWED_IMAGE_MIME_TYPES = new Set(['image/png', 'image/jpeg', 'image/x-icon', 'image/vnd.microsoft.icon', 'image/svg+xml']);
const MAX_IMAGE_SIZE_BYTES = 5 * 1024 * 1024;

const SETTINGS_ID = 'default';

@Injectable()
export class SettingsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  async get() {
    const existing = await this.prisma.appSettings.findUnique({ where: { id: SETTINGS_ID } });
    if (existing) return existing;
    return this.prisma.appSettings.create({ data: { id: SETTINGS_ID } });
  }

  async update(dto: UpdateSettingsDto) {
    const before = await this.get();
    const user = dto.user || 'SYSTEM';
    const { user: _user, ...rest } = dto;
    const updated = await this.prisma.appSettings.upsert({
      where: { id: SETTINGS_ID },
      create: { id: SETTINGS_ID, ...rest },
      update: rest,
    });
    await this.audit.logDiff(user, 'AppSettings', SETTINGS_ID, before as unknown as Record<string, unknown>, updated as unknown as Record<string, unknown>);
    return updated;
  }

  private async storeImage(file: Express.Multer.File, kind: 'logo' | 'favicon', user: string) {
    if (file.size > MAX_IMAGE_SIZE_BYTES) {
      throw new BadRequestException('Image exceeds the 5MB limit.');
    }
    // SVG has no magic-byte signature to check (it's just XML/text) — only
    // verify the raster/icon formats, same reasoning docs.service.ts uses
    // for excluding plain text from its own signature check.
    if (file.mimetype !== 'image/svg+xml') {
      const detected = await fromBuffer(file.buffer);
      if (!detected || !detected.mime.startsWith('image/')) {
        throw new BadRequestException(`File content does not match its declared type (${file.mimetype}).`);
      }
    }
    if (!ALLOWED_IMAGE_MIME_TYPES.has(file.mimetype)) {
      throw new BadRequestException(`Unsupported image type: ${file.mimetype}. Allowed: PNG, JPEG, SVG, ICO.`);
    }

    const dir = path.join(UPLOADS_DIR, BRANDING_SUBDIR);
    await fs.promises.mkdir(dir, { recursive: true });
    const ext = path.extname(file.originalname) || '.png';
    const storedName = `${kind}-${Date.now()}${ext}`;
    await fs.promises.writeFile(path.join(dir, storedName), file.buffer);

    const before = await this.get();
    // Best-effort cleanup of the previous file — a failure here shouldn't
    // block the new upload from taking effect.
    const oldPath = kind === 'logo' ? before.logoPath : before.faviconPath;
    if (oldPath) {
      await fs.promises.unlink(path.join(UPLOADS_DIR, BRANDING_SUBDIR, oldPath)).catch(() => undefined);
    }

    const data = kind === 'logo'
      ? { logoPath: storedName, logoMimeType: file.mimetype }
      : { faviconPath: storedName, faviconMimeType: file.mimetype };
    const updated = await this.prisma.appSettings.upsert({
      where: { id: SETTINGS_ID },
      create: { id: SETTINGS_ID, ...data },
      update: data,
    });
    await this.audit.log(user, 'AppSettings', SETTINGS_ID, kind === 'logo' ? 'LogoUploaded' : 'FaviconUploaded', '', storedName);
    return updated;
  }

  uploadLogo(file: Express.Multer.File, user = 'SYSTEM') {
    return this.storeImage(file, 'logo', user);
  }

  uploadFavicon(file: Express.Multer.File, user = 'SYSTEM') {
    return this.storeImage(file, 'favicon', user);
  }

  async getImageFile(kind: 'logo' | 'favicon') {
    const settings = await this.get();
    const fileName = kind === 'logo' ? settings.logoPath : settings.faviconPath;
    const mimeType = kind === 'logo' ? settings.logoMimeType : settings.faviconMimeType;
    if (!fileName || !mimeType) throw new NotFoundException(`No ${kind} configured.`);
    const filePath = path.join(UPLOADS_DIR, BRANDING_SUBDIR, fileName);
    if (!fs.existsSync(filePath)) throw new NotFoundException(`Stored ${kind} file is missing on disk.`);
    return { filePath, mimeType };
  }
}
