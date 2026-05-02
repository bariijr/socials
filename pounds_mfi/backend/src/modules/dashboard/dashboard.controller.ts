import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { DashboardService } from './dashboard.service';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { UserRole } from '../users/entities/user.entity';

@Controller('dashboard')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.LOAN_OFFICER, UserRole.ADMIN, UserRole.SUPER_ADMIN)
export class DashboardController {
  constructor(private svc: DashboardService) {}

  @Get('kpis')
  getKpis() {
    return this.svc.getKpis();
  }

  @Get('trend')
  getTrend(@Query('months') months: string) {
    return this.svc.getLoanTrend(parseInt(months) || 6);
  }

  @Get('loan-breakdown')
  getLoanBreakdown() {
    return this.svc.getLoanStatusBreakdown();
  }

  @Get('activity')
  getActivity() {
    return this.svc.getRecentActivity();
  }
}
