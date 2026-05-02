import {
  Controller, Get, Post, Patch, Body, Param,
  UseGuards, UseInterceptors, UploadedFile, ParseFilePipe,
  MaxFileSizeValidator, FileTypeValidator,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { diskStorage } from 'multer';
import { extname } from 'path';
import { v4 as uuidv4 } from 'uuid';
import { DisbursementsService } from './disbursements.service';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { UserRole } from '../users/entities/user.entity';

const storage = diskStorage({
  destination: process.env.STORAGE_LOCAL_PATH
    ? `${process.env.STORAGE_LOCAL_PATH}/disbursements`
    : '/app/uploads/disbursements',
  filename: (_, file, cb) => cb(null, `${uuidv4()}${extname(file.originalname)}`),
});

@Controller('disbursements')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.ADMIN, UserRole.SUPER_ADMIN)
export class DisbursementsController {
  constructor(private svc: DisbursementsService) {}

  @Post('loans/:loanId')
  @UseInterceptors(FileInterceptor('proof', { storage }))
  disburse(
    @Param('loanId') loanId: string,
    @Body() dto: any,
    @UploadedFile(
      new ParseFilePipe({
        validators: [
          new MaxFileSizeValidator({ maxSize: 10 * 1024 * 1024 }),
          new FileTypeValidator({ fileType: /(jpg|jpeg|png|pdf)$/ }),
        ],
      }),
    )
    file: Express.Multer.File,
    @CurrentUser() user: any,
  ) {
    return this.svc.disburse(loanId, dto, file, user);
  }

  @Get('loans/:loanId')
  findByLoan(@Param('loanId') loanId: string) {
    return this.svc.findByLoan(loanId);
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.svc.findOne(id);
  }

  @Patch(':id/verify')
  @Roles(UserRole.SUPER_ADMIN)
  verify(@Param('id') id: string, @CurrentUser() user: any) {
    return this.svc.verify(id, user);
  }
}
