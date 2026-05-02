import {
  Controller, Get, Post, Patch, Delete, Body, Param, Query, UseGuards,
} from '@nestjs/common';
import { UsersService } from './users.service';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { UserRole, UserStatus } from './entities/user.entity';

@Controller('users')
@UseGuards(JwtAuthGuard, RolesGuard)
export class UsersController {
  constructor(private svc: UsersService) {}

  @Get()
  @Roles(UserRole.LOAN_OFFICER, UserRole.ADMIN, UserRole.SUPER_ADMIN)
  findAll(@Query() query: any) {
    return this.svc.findAll(query);
  }

  @Get('me')
  getMe(@CurrentUser() user: any) {
    return this.svc.findOne(user.id);
  }

  @Patch('me')
  updateMe(@CurrentUser() user: any, @Body() dto: any) {
    return this.svc.updateProfile(user.id, dto);
  }

  @Get(':id')
  @Roles(UserRole.LOAN_OFFICER, UserRole.ADMIN, UserRole.SUPER_ADMIN)
  findOne(@Param('id') id: string) {
    return this.svc.findOne(id);
  }

  @Post()
  @Roles(UserRole.ADMIN, UserRole.SUPER_ADMIN)
  create(@Body() dto: any, @CurrentUser() user: any) {
    return this.svc.create(dto, user);
  }

  @Patch(':id')
  @Roles(UserRole.ADMIN, UserRole.SUPER_ADMIN)
  update(@Param('id') id: string, @Body() dto: any, @CurrentUser() user: any) {
    return this.svc.update(id, dto, user);
  }

  @Patch(':id/status')
  @Roles(UserRole.ADMIN, UserRole.SUPER_ADMIN)
  updateStatus(@Param('id') id: string, @Body('status') status: UserStatus) {
    return this.svc.updateStatus(id, status);
  }

  @Delete(':id')
  @Roles(UserRole.SUPER_ADMIN)
  delete(@Param('id') id: string, @CurrentUser() user: any) {
    return this.svc.delete(id, user);
  }
}
