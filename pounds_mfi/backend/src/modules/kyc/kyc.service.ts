import {
  Injectable, NotFoundException, BadRequestException, ForbiddenException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import * as PDFDocument from 'pdfkit';
import * as fs from 'fs';
import { KycForm, KycStatus } from './entities/kyc-form.entity';
import { KycDocument } from './entities/kyc-document.entity';
import { OcrService } from '../ocr/ocr.service';
import { UserRole } from '../users/entities/user.entity';

@Injectable()
export class KycService {
  constructor(
    @InjectRepository(KycForm) private kycRepo: Repository<KycForm>,
    @InjectRepository(KycDocument) private docRepo: Repository<KycDocument>,
    private ocrService: OcrService,
  ) {}

  async createOrUpdate(userId: string | null, dto: any): Promise<KycForm> {
    let kyc: KycForm;

    if (dto.id) {
      kyc = await this.kycRepo.findOne({ where: { id: dto.id } });
      if (!kyc) throw new NotFoundException('KYC form not found');
      if (kyc.status === KycStatus.APPROVED) {
        throw new BadRequestException('Approved KYC cannot be modified');
      }
    } else {
      kyc = this.kycRepo.create({ userId, isLead: !userId });
    }

    Object.assign(kyc, dto, { currentStep: Math.max(kyc.currentStep, dto.currentStep || 1) });
    return this.kycRepo.save(kyc);
  }

  async uploadDocument(kycId: string, file: Express.Multer.File, documentType: string) {
    const kyc = await this.findOrFail(kycId);
    const fileHash = await this.ocrService.computeFileHash(file.path);

    const doc = this.docRepo.create({
      kycFormId: kycId,
      documentType: documentType as any,
      fileName: file.originalname,
      filePath: file.path,
      mimeType: file.mimetype,
      fileSize: file.size,
      fileHash,
    });

    const saved = await this.docRepo.save(doc);

    // Async OCR
    this.ocrService.extractText(file.path, file.mimetype).then(async (result) => {
      await this.docRepo.update(saved.id, {
        ocrResult: result,
        ocrProcessed: true,
        ocrProcessedAt: new Date(),
      });
      // Auto-fill KYC from OCR
      if (result.extracted) {
        const update: Partial<KycForm> = {};
        if (result.text.includes('NATIONAL ID') || result.text.includes('ID CARD')) {
          const idMatch = result.text.match(/\d{8}/);
          if (idMatch) update.idNumber = idMatch[0];
        }
        if (Object.keys(update).length) await this.kycRepo.update(kycId, update);
      }
    });

    return saved;
  }

  async submit(id: string, userId?: string) {
    const kyc = await this.findOrFail(id);
    if (userId && kyc.userId && kyc.userId !== userId) {
      throw new ForbiddenException('Access denied');
    }
    if (kyc.status !== KycStatus.DRAFT) {
      throw new BadRequestException('KYC is already submitted');
    }
    return this.kycRepo.save({ ...kyc, status: KycStatus.SUBMITTED });
  }

  async approve(id: string, currentUser: any) {
    if (![UserRole.ADMIN, UserRole.SUPER_ADMIN].includes(currentUser.role)) {
      throw new ForbiddenException('Insufficient permissions');
    }
    const kyc = await this.findOrFail(id);
    return this.kycRepo.save({
      ...kyc,
      status: KycStatus.APPROVED,
      reviewedById: currentUser.id,
      reviewedAt: new Date(),
    });
  }

  async reject(id: string, notes: string, currentUser: any) {
    const kyc = await this.findOrFail(id);
    return this.kycRepo.save({
      ...kyc,
      status: KycStatus.REJECTED,
      reviewNotes: notes,
      reviewedById: currentUser.id,
      reviewedAt: new Date(),
    });
  }

  async findAll(query: any) {
    const qb = this.kycRepo
      .createQueryBuilder('k')
      .leftJoinAndSelect('k.user', 'user')
      .leftJoinAndSelect('k.documents', 'documents')
      .orderBy('k.createdAt', 'DESC');

    if (query.status) qb.where('k.status = :status', { status: query.status });
    if (query.isLead) qb.andWhere('k.isLead = :isLead', { isLead: query.isLead === 'true' });
    if (query.search) {
      qb.andWhere('(k.fullName ILIKE :s OR k.idNumber ILIKE :s OR k.phone ILIKE :s)', {
        s: `%${query.search}%`,
      });
    }

    const page = parseInt(query.page) || 1;
    const limit = Math.min(parseInt(query.limit) || 20, 100);
    qb.skip((page - 1) * limit).take(limit);

    const [items, total] = await qb.getManyAndCount();
    return { items, total, page, limit, pages: Math.ceil(total / limit) };
  }

  async findOne(id: string) {
    return this.findOrFail(id);
  }

  async generatePdf(id: string): Promise<Buffer> {
    const kyc = await this.findOrFail(id);

    return new Promise((resolve, reject) => {
      const doc = new PDFDocument({ margin: 50 });
      const chunks: Buffer[] = [];

      doc.on('data', (chunk) => chunks.push(chunk));
      doc.on('end', () => resolve(Buffer.concat(chunks)));
      doc.on('error', reject);

      doc.fontSize(20).text('KYC APPLICATION FORM', { align: 'center' });
      doc.fontSize(12).text('POUNDS MICROFINANCE LTD', { align: 'center' });
      doc.moveDown();
      doc.fontSize(10).text(`Form ID: ${kyc.id}`);
      doc.text(`Status: ${kyc.status.toUpperCase()}`);
      doc.text(`Date: ${new Date().toLocaleDateString()}`);
      doc.moveDown();

      doc.fontSize(14).text('Personal Information');
      doc.fontSize(10);
      doc.text(`Full Name: ${kyc.fullName || 'N/A'}`);
      doc.text(`Phone: ${kyc.phone || 'N/A'}`);
      doc.text(`Email: ${kyc.email || 'N/A'}`);
      doc.text(`Date of Birth: ${kyc.dateOfBirth ? new Date(kyc.dateOfBirth).toLocaleDateString() : 'N/A'}`);
      doc.moveDown();

      doc.fontSize(14).text('Identification');
      doc.fontSize(10);
      doc.text(`ID Type: ${kyc.idType || 'N/A'}`);
      doc.text(`ID Number: ${kyc.idNumber || 'N/A'}`);
      doc.moveDown();

      doc.fontSize(14).text('Address');
      doc.fontSize(10);
      doc.text(`Address: ${kyc.address || 'N/A'}`);
      doc.text(`City: ${kyc.city || 'N/A'}`);
      doc.text(`County: ${kyc.county || 'N/A'}`);
      doc.moveDown();

      doc.fontSize(14).text('Employment');
      doc.fontSize(10);
      doc.text(`Occupation: ${kyc.occupation || 'N/A'}`);
      doc.text(`Employer: ${kyc.employer || 'N/A'}`);
      doc.text(`Monthly Income: KES ${kyc.monthlyIncome || 'N/A'}`);

      doc.end();
    });
  }

  private async findOrFail(id: string): Promise<KycForm> {
    const kyc = await this.kycRepo.findOne({ where: { id }, relations: ['documents', 'user'] });
    if (!kyc) throw new NotFoundException('KYC form not found');
    return kyc;
  }
}
