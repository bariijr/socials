import { Body, Controller, Delete, Get, Param, Patch, Post, Query } from '@nestjs/common';
import { InvoicesService } from './invoices.service';
import { CreateInvoiceDto } from './dto/create-invoice.dto';
import { UpdateInvoiceDto } from './dto/update-invoice.dto';
import { Roles } from '../auth/roles.decorator';

@Controller('invoices')
@Roles('Admin')
export class InvoicesController {
  constructor(private readonly invoices: InvoicesService) {}

  @Get()
  findAll(@Query('tripId') tripId?: string) {
    return this.invoices.findAll(tripId);
  }

  @Get(':invoiceId')
  findOne(@Param('invoiceId') invoiceId: string) {
    return this.invoices.findOne(invoiceId);
  }

  @Post()
  create(@Body() dto: CreateInvoiceDto) {
    return this.invoices.create(dto);
  }

  @Patch(':invoiceId')
  update(@Param('invoiceId') invoiceId: string, @Body() dto: UpdateInvoiceDto) {
    return this.invoices.update(invoiceId, dto);
  }

  @Delete(':invoiceId')
  remove(@Param('invoiceId') invoiceId: string, @Query('user') user?: string) {
    return this.invoices.remove(invoiceId, user);
  }
}
