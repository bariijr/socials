import {
  Controller, Get, Post, Patch, Body, Param, Query, Res,
  UseGuards, UseInterceptors, UploadedFile, ParseFilePipe,
  MaxFileSizeValidator, FileTypeValidator, HttpCode, HttpStatus, Optional,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { diskStorage } from 'multer';
import { extname } from 'path';
import { v4 as uuidv4 } from 'uuid';
import { Response } from 'express';
import { KycService } from './kyc.service';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { Public } from '../../common/decorators/public.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { UserRole } from '../users/entities/user.entity';

const kycStorage = diskStorage({
  destination: process.env.STORAGE_LOCAL_PATH
    ? `${process.env.STORAGE_LOCAL_PATH}/kyc`
    : '/app/uploads/kyc',
  filename: (_, file, cb) => cb(null, `${uuidv4()}${extname(file.originalname)}`),
});

@Controller('kyc')
export class KycController {
  constructor(private kycService: KycService) {}

  // Public KYC entry (for public site)
  @Public()
  @Post('public')
  createPublic(@Body() dto: any) {
    return this.kycService.createOrUpdate(null, { ...dto, isLead: true });
  }

  @Public()
  @Patch('public/:id')
  updatePublic(@Param('id') id: string, @Body() dto: any) {
    return this.kycService.createOrUpdate(null, { ...dto, id });
  }

  @Public()
  @Post('public/:id/submit')
  @HttpCode(HttpStatus.OK)
  submitPublic(@Param('id') id: string) {
    return this.kycService.submit(id);
  }

  @Public()
  @Get('public/:id/pdf')
  async downloadPdfPublic(@Param('id') id: string, @Res() res: Response) {
    const buffer = await this.kycService.generatePdf(id);
    res.set({
      'Content-Type': 'application/pdf',
      'Content-Disposition': `attachment; filename=kyc-${id}.pdf`,
      'Content-Length': buffer.length,
    });
    res.end(buffer);
  }

  // Authenticated endpoints
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Get()
  @Roles(UserRole.LOAN_OFFICER, UserRole.ADMIN, UserRole.SUPER_ADMIN)
  findAll(@Query() query: any) {
    return this.kycService.findAll(query);
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.kycService.findOne(id);
  }

  @UseGuards(JwtAuthGuard)
  @Post()
  create(@Body() dto: any, @CurrentUser() user: any) {
    return this.kycService.createOrUpdate(user.id, dto);
  }

  @UseGuards(JwtAuthGuard)
  @Patch(':id')
  update(@Param('id') id: string, @Body() dto: any, @CurrentUser() user: any) {
    return this.kycService.createOrUpdate(user.id, { ...dto, id });
  }

  @UseGuards(JwtAuthGuard)
  @Post(':id/documents')
  @UseInterceptors(FileInterceptor('file', { storage: kycStorage }))
  uploadDoc(
    @Param('id') id: string,
    @Body('documentType') documentType: string,
    @UploadedFile(
      new ParseFilePipe({
        validators: [
          new MaxFileSizeValidator({ maxSize: 10 * 1024 * 1024 }),
          new FileTypeValidator({ fileType: /(jpg|jpeg|png|pdf)$/ }),
        ],
      }),
    )
    file: Express.Multer.File,
  ) {
    return this.kycService.uploadDocument(id, file, documentType);
  }

  @UseGuards(JwtAuthGuard)
  @Post(':id/submit')
  @HttpCode(HttpStatus.OK)
  submit(@Param('id') id: string, @CurrentUser() user: any) {
    return this.kycService.submit(id, user.id);
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Patch(':id/approve')
  @Roles(UserRole.ADMIN, UserRole.SUPER_ADMIN)
  approve(@Param('id') id: string, @CurrentUser() user: any) {
    return this.kycService.approve(id, user);
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Patch(':id/reject')
  @Roles(UserRole.ADMIN, UserRole.SUPER_ADMIN)
  reject(@Param('id') id: string, @Body('notes') notes: string, @CurrentUser() user: any) {
    return this.kycService.reject(id, notes, user);
  }

  @UseGuards(JwtAuthGuard)
  @Get(':id/pdf')
  async downloadPdf(@Param('id') id: string, @Res() res: Response) {
    const buffer = await this.kycService.generatePdf(id);
    res.set({
      'Content-Type': 'application/pdf',
      'Content-Disposition': `attachment; filename=kyc-${id}.pdf`,
      'Content-Length': buffer.length,
    });
    res.end(buffer);
  }
}
