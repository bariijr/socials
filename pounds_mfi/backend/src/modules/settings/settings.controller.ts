import { Controller, Get, Post, Body, UseGuards } from '@nestjs/common';
import { SettingsService } from './settings.service';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { Public } from '../../common/decorators/public.decorator';
import { UserRole } from '../users/entities/user.entity';

@Controller('settings')
export class SettingsController {
  constructor(private svc: SettingsService) {}

  @Public()
  @Get('branding')
  getBranding() {
    return this.svc.getBranding();
  }

  @Public()
  @Get('public')
  getPublic() {
    return this.svc.getAll(false);
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Get()
  @Roles(UserRole.ADMIN, UserRole.SUPER_ADMIN)
  getAll() {
    return this.svc.getAll(true);
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Post()
  @Roles(UserRole.SUPER_ADMIN)
  setBulk(@Body() settings: Record<string, string>) {
    return this.svc.setBulk(settings);
  }
}
