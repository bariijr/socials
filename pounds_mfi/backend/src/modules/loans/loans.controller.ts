import {
  Controller, Get, Post, Patch, Body, Param, Query,
  UseGuards, HttpCode, HttpStatus,
} from '@nestjs/common';
import { LoansService } from './loans.service';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { UserRole } from '../users/entities/user.entity';

@Controller('loans')
@UseGuards(JwtAuthGuard, RolesGuard)
export class LoansController {
  constructor(private readonly loansService: LoansService) {}

  @Get()
  findAll(@Query() query: any, @CurrentUser() user: any) {
    return this.loansService.findAll(query, user);
  }

  @Get('packages')
  getPackages() {
    return this.loansService.getPackages();
  }

  @Post('packages')
  @Roles(UserRole.ADMIN, UserRole.SUPER_ADMIN)
  createPackage(@Body() dto: any) {
    return this.loansService.createPackage(dto);
  }

  @Patch('packages/:id')
  @Roles(UserRole.ADMIN, UserRole.SUPER_ADMIN)
  updatePackage(@Param('id') id: string, @Body() dto: any) {
    return this.loansService.updatePackage(id, dto);
  }

  @Get(':id')
  findOne(@Param('id') id: string, @CurrentUser() user: any) {
    return this.loansService.findOne(id, user);
  }

  @Post()
  @Roles(UserRole.LOAN_OFFICER, UserRole.ADMIN, UserRole.SUPER_ADMIN)
  create(@Body() dto: any, @CurrentUser() user: any) {
    return this.loansService.createLoan(dto, user);
  }

  @Patch(':id/submit')
  @Roles(UserRole.LOAN_OFFICER, UserRole.ADMIN, UserRole.SUPER_ADMIN)
  submit(@Param('id') id: string, @CurrentUser() user: any) {
    return this.loansService.submitLoan(id, user);
  }

  @Patch(':id/approve')
  @Roles(UserRole.ADMIN, UserRole.SUPER_ADMIN)
  approve(@Param('id') id: string, @CurrentUser() user: any) {
    return this.loansService.approveLoan(id, user);
  }

  @Patch(':id/reject')
  @Roles(UserRole.ADMIN, UserRole.SUPER_ADMIN)
  reject(
    @Param('id') id: string,
    @Body('reason') reason: string,
    @CurrentUser() user: any,
  ) {
    return this.loansService.rejectLoan(id, reason, user);
  }

  @Post(':id/repayments')
  @Roles(UserRole.LOAN_OFFICER, UserRole.ADMIN, UserRole.SUPER_ADMIN)
  recordRepayment(
    @Param('id') id: string,
    @Body() dto: any,
    @CurrentUser() user: any,
  ) {
    return this.loansService.recordRepayment(id, dto, user);
  }

  @Post(':id/lock')
  @HttpCode(HttpStatus.OK)
  acquireLock(@Param('id') id: string, @CurrentUser() user: any) {
    return this.loansService.acquireLock(id, user.id);
  }

  @Post(':id/unlock')
  @HttpCode(HttpStatus.OK)
  releaseLock(@Param('id') id: string, @CurrentUser() user: any) {
    return this.loansService.releaseLock(id, user.id);
  }
}
