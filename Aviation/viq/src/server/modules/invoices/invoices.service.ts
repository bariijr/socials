import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { CreateInvoiceDto } from './dto/create-invoice.dto';
import { UpdateInvoiceDto } from './dto/update-invoice.dto';

@Injectable()
export class InvoicesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  findAll(tripId?: string) {
    return this.prisma.invoice.findMany({ where: tripId ? { tripId } : undefined });
  }

  async findOne(invoiceId: string) {
    const invoice = await this.prisma.invoice.findUnique({ where: { invoiceId } });
    if (!invoice) throw new NotFoundException(`Invoice ${invoiceId} not found`);
    return invoice;
  }

  async create(dto: CreateInvoiceDto) {
    const user = dto.user || 'SYSTEM';
    const { user: _user, ...data } = dto;
    const invoice = await this.prisma.invoice.create({
      data: {
        ...data,
        lineItems: data.lineItems as object,
        changeLog: (data.changeLog ?? []) as object,
      },
    });
    await this.audit.log(user, 'Invoice', invoice.invoiceId, 'Created', '', invoice.invoiceId);
    return invoice;
  }

  async update(invoiceId: string, dto: UpdateInvoiceDto) {
    const before = await this.findOne(invoiceId);
    const user = dto.user || 'SYSTEM';
    const { user: _user, lineItems, changeLog, ...rest } = dto;
    const invoice = await this.prisma.invoice.update({
      where: { invoiceId },
      data: {
        ...rest,
        ...(lineItems ? { lineItems: lineItems as object } : {}),
        ...(changeLog ? { changeLog: changeLog as object } : {}),
      },
    });
    await this.audit.log(user, 'Invoice', invoiceId, 'Status', before.status, invoice.status);
    return invoice;
  }

  async remove(invoiceId: string, user = 'SYSTEM') {
    await this.findOne(invoiceId);
    await this.prisma.invoice.delete({ where: { invoiceId } });
    await this.audit.log(user, 'Invoice', invoiceId, 'Deleted', invoiceId, '');
    return { invoiceId, deleted: true };
  }
}
