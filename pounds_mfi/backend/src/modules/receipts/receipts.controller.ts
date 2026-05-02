import {
  Controller, Get, Post, Patch, Body, Param, Query,
  UseGuards, UseInterceptors, UploadedFile, ParseFilePipe,
  MaxFileSizeValidator, FileTypeValidator,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { diskStorage } from 'multer';
import { extname, join } from 'path';
import { v4 as uuidv4 } from 'uuid';
import { ReceiptsService } from './receipts.service';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { UserRole } from '../users/entities/user.entity';

const storage = diskStorage({
  destination: process.env.STORAGE_LOCAL_PATH || '/app/uploads/receipts',
  filename: (_, file, cb) => {
    cb(null, `${uuidv4()}${extname(file.originalname)}`);
  },
});

@Controller('receipts')
@UseGuards(JwtAuthGuard, RolesGuard)
export class ReceiptsController {
  constructor(private receiptsService: ReceiptsService) {}

  @Get()
  findAll(@Query() query: any) {
    return this.receiptsService.findAll(query);
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.receiptsService.findOne(id);
  }

  @Post('upload')
  @UseInterceptors(FileInterceptor('file', { storage }))
  upload(
    @UploadedFile(
      new ParseFilePipe({
        validators: [
          new MaxFileSizeValidator({ maxSize: 10 * 1024 * 1024 }),
          new FileTypeValidator({ fileType: /(jpg|jpeg|png|pdf)$/ }),
        ],
      }),
    )
    file: Express.Multer.File,
    @Body() dto: any,
    @CurrentUser() user: any,
  ) {
    return this.receiptsService.uploadReceipt(file, dto, user);
  }

  @Post('text')
  submitText(@Body() dto: any, @CurrentUser() user: any) {
    return this.receiptsService.submitTextReceipt(dto, user);
  }

  @Patch(':id/confirm-ocr')
  confirmOcr(@Param('id') id: string, @Body() dto: any, @CurrentUser() user: any) {
    return this.receiptsService.confirmOcrData(id, dto, user);
  }

  @Patch(':id/verify')
  @Roles(UserRole.LOAN_OFFICER, UserRole.ADMIN, UserRole.SUPER_ADMIN)
  verify(@Param('id') id: string, @CurrentUser() user: any) {
    return this.receiptsService.verify(id, user);
  }

  @Patch(':id/reject')
  @Roles(UserRole.LOAN_OFFICER, UserRole.ADMIN, UserRole.SUPER_ADMIN)
  reject(@Param('id') id: string, @Body('reason') reason: string, @CurrentUser() user: any) {
    return this.receiptsService.reject(id, reason, user);
  }
}
