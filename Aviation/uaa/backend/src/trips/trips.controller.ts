import { Controller, Get, Param, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { TripsService } from './trips.service';

@Controller('trips')
@UseGuards(JwtAuthGuard)
export class TripsController {
  constructor(private readonly tripsService: TripsService) {}

  @Get(':tripNo')
  getWorkspace(@Param('tripNo') tripNo: string) {
    return this.tripsService.getWorkspace(tripNo);
  }
}
