import {
  Injectable, NotFoundException, BadRequestException, ConflictException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { InjectQueue } from '@nestjs/bull';
import { Queue } from 'bull';
import * as path from 'path';
import { Receipt, ReceiptStatus } from './entities/receipt.entity';
import { ReceiptFile } from './entities/receipt-file.entity';
import { OcrService } from '../ocr/ocr.service';

@Injectable()
export class ReceiptsService {
  constructor(
    @InjectRepository(Receipt) private receiptRepo: Repository<Receipt>,
    @InjectRepository(ReceiptFile) private fileRepo: Repository<ReceiptFile>,
    @InjectQueue('ocr') private ocrQueue: Queue,
    private ocrService: OcrService,
  ) {}

  async uploadReceipt(file: Express.Multer.File, dto: any, currentUser: any) {
    const fileHash = await this.ocrService.computeFileHash(file.path);
    const fingerprint = await this.ocrService.computeFingerprint(file.path);

    // Hard block: exact duplicate
    const exactDup = await this.receiptRepo.findOne({
      where: [{ fileHash }, { fingerprint }],
    });
    if (exactDup) {
      throw new ConflictException({
        message: 'Duplicate receipt detected',
        duplicateId: exactDup.id,
        receiptNumber: exactDup.receiptNumber,
      });
    }

    // Check by receipt number if provided
    if (dto.receiptNumber) {
      const numDup = await this.receiptRepo.findOne({
        where: { receiptNumber: dto.receiptNumber },
      });
      if (numDup) {
        throw new ConflictException({
          message: 'Receipt number already exists',
          duplicateId: numDup.id,
        });
      }
    }

    const receipt = this.receiptRepo.create({
      receiptNumber: dto.receiptNumber || `R${Date.now()}`,
      loanId: dto.loanId,
      submittedById: currentUser.id,
      amount: dto.amount || 0,
      paymentDate: dto.paymentDate,
      paymentMethod: dto.paymentMethod,
      fileHash,
      fingerprint,
      status: ReceiptStatus.PENDING,
    });

    const saved = await this.receiptRepo.save(receipt);

    const receiptFile = this.fileRepo.create({
      receiptId: saved.id,
      fileName: file.originalname,
      filePath: file.path,
      mimeType: file.mimetype,
      fileSize: file.size,
      fileHash,
      isPrimary: true,
    });
    await this.fileRepo.save(receiptFile);

    // Queue OCR processing
    await this.ocrQueue.add('process-receipt', {
      receiptId: saved.id,
      filePath: file.path,
      mimeType: file.mimetype,
    });

    return saved;
  }

  async submitTextReceipt(dto: any, currentUser: any) {
    const existing = await this.receiptRepo.findOne({
      where: { receiptNumber: dto.receiptNumber },
    });
    if (existing) throw new ConflictException('Receipt number already exists');

    const receipt = this.receiptRepo.create({
      ...dto,
      submittedById: currentUser.id,
      status: ReceiptStatus.PENDING,
      fingerprint: `text:${dto.receiptNumber}:${dto.amount}`,
    });

    return this.receiptRepo.save(receipt);
  }

  async confirmOcrData(id: string, confirmedData: any, currentUser: any) {
    const receipt = await this.findOrFail(id);

    // Update with confirmed OCR data
    if (confirmedData.receiptNumber && confirmedData.receiptNumber !== receipt.receiptNumber) {
      const dup = await this.receiptRepo.findOne({
        where: { receiptNumber: confirmedData.receiptNumber },
      });
      if (dup && dup.id !== id) {
        throw new ConflictException('Receipt number already used');
      }
    }

    await this.receiptRepo.update(id, {
      receiptNumber: confirmedData.receiptNumber || receipt.receiptNumber,
      amount: confirmedData.amount || receipt.amount,
      paymentDate: confirmedData.date ? new Date(confirmedData.date) : receipt.paymentDate,
      payerName: confirmedData.payerName,
      bankName: confirmedData.bankName,
      ocrConfirmedData: confirmedData,
      status: ReceiptStatus.VERIFIED,
      verifiedById: currentUser.id,
      verifiedAt: new Date(),
    });

    return this.findOrFail(id);
  }

  async findAll(query: any) {
    const qb = this.receiptRepo
      .createQueryBuilder('r')
      .leftJoinAndSelect('r.submittedBy', 'submittedBy')
      .leftJoinAndSelect('r.loan', 'loan')
      .leftJoinAndSelect('r.files', 'files')
      .orderBy('r.createdAt', 'DESC');

    if (query.status) qb.where('r.status = :status', { status: query.status });
    if (query.loanId) qb.andWhere('r.loanId = :loanId', { loanId: query.loanId });
    if (query.search) {
      qb.andWhere('r.receiptNumber ILIKE :s', { s: `%${query.search}%` });
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

  async verify(id: string, currentUser: any) {
    const receipt = await this.findOrFail(id);
    if (receipt.status !== ReceiptStatus.PENDING) {
      throw new BadRequestException('Receipt is not pending');
    }
    return this.receiptRepo.save({
      ...receipt,
      status: ReceiptStatus.VERIFIED,
      verifiedById: currentUser.id,
      verifiedAt: new Date(),
    });
  }

  async reject(id: string, reason: string, currentUser: any) {
    const receipt = await this.findOrFail(id);
    return this.receiptRepo.save({
      ...receipt,
      status: ReceiptStatus.REJECTED,
      rejectionReason: reason,
      verifiedById: currentUser.id,
      verifiedAt: new Date(),
    });
  }

  private async findOrFail(id: string): Promise<Receipt> {
    const r = await this.receiptRepo.findOne({
      where: { id },
      relations: ['submittedBy', 'loan', 'files'],
    });
    if (!r) throw new NotFoundException('Receipt not found');
    return r;
  }
}
