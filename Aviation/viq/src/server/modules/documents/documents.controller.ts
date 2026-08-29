import { Controller, Get, Post, Param, Body, UploadedFile, UseInterceptors, NotFoundException } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { DocumentsService } from './documents.service';
import { UploadDocumentDto } from './dto/upload-document.dto';

@Controller('documents')
export class DocumentsController {
  constructor(private readonly documents: DocumentsService) {}

  @Get()
  findAll() {
    return this.documents.findAll();
  }

  @Post('upload')
  @UseInterceptors(FileInterceptor('file'))
  upload(@UploadedFile() file: Express.Multer.File, @Body() dto: UploadDocumentDto) {
    if (!file) throw new NotFoundException('No file provided.');
    return this.documents.upload(file, dto);
  }

  @Get(':documentId/jobs')
  findJobs(@Param('documentId') documentId: string) {
    return this.documents.findJobs(documentId);
  }

  @Get(':documentId')
  findOne(@Param('documentId') documentId: string) {
    return this.documents.findOne(documentId);
  }
}
