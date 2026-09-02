import { Controller, Get, Post, Patch, Delete, Param, Query, Body, UploadedFile, UseInterceptors, Res, NotFoundException } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import type { Response } from 'express';
import { create as contentDisposition } from 'content-disposition';
import { DocsService } from './docs.service';
import { UploadDocDto } from './dto/upload-doc.dto';
import { VerifyDocDto } from './dto/verify-doc.dto';
import { RunOcrDto } from './dto/run-ocr.dto';

@Controller('docs')
export class DocsController {
  constructor(private readonly docs: DocsService) {}

  @Get()
  findAll(@Query('tripId') tripId?: string, @Query('personId') personId?: string) {
    return this.docs.findAll(tripId, personId);
  }

  @Post('upload')
  @UseInterceptors(FileInterceptor('file'))
  upload(@UploadedFile() file: Express.Multer.File, @Body() dto: UploadDocDto) {
    if (!file) throw new NotFoundException('No file provided.');
    return this.docs.upload(file, dto);
  }

  @Get(':docId/file')
  async getFile(@Param('docId') docId: string, @Res() res: Response) {
    const { doc, filePath } = await this.docs.getFile(docId);
    res.setHeader('Content-Type', doc.mimeType);
    res.setHeader('Content-Disposition', contentDisposition(doc.fileName, { type: 'inline' }));
    res.sendFile(filePath, { root: '.' });
  }

  @Post(':docId/ocr')
  runOcr(@Param('docId') docId: string, @Body() dto: RunOcrDto) {
    return this.docs.runOcr(docId, dto?.password);
  }

  @Patch(':docId/verify')
  verify(@Param('docId') docId: string, @Body() dto: VerifyDocDto) {
    return this.docs.verify(docId, dto);
  }

  @Get(':docId')
  findOne(@Param('docId') docId: string) {
    return this.docs.findOne(docId);
  }

  @Delete(':docId')
  remove(@Param('docId') docId: string, @Query('user') user?: string) {
    return this.docs.remove(docId, user);
  }
}
