import { Body, Controller, Get, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { PermitsService } from './permits.service';
import { CreatePermitRequestDto } from './dto/create-permit-request.dto';
import { UpdatePermitRequestDto } from './dto/update-permit-request.dto';
import { MergePermitRequestDto } from './dto/merge-permit-request.dto';
import { CreateCommDto } from './dto/create-comm.dto';
import type { ServiceType } from '../service-cases/requirement.entity';

@Controller()
@UseGuards(JwtAuthGuard)
export class PermitsController {
  constructor(private readonly permitsService: PermitsService) {}

  @Post('legs/:legId/permit-requests')
  create(@Param('legId') legId: string, @Body() dto: CreatePermitRequestDto) {
    return this.permitsService.create(legId, dto.country, dto.serviceType);
  }

  @Get('legs/:legId/permit-requests')
  findByLeg(@Param('legId') legId: string) {
    return this.permitsService.findByLeg(legId);
  }

  @Get('legs/:legId/permit-requests/compatible')
  async findCompatible(
    @Param('legId') legId: string,
    @Query('country') country: string,
    @Query('serviceType') serviceType: ServiceType,
  ) {
    // Wrapped in an object because NestJS sends a bare `null` return value as an
    // empty response body (not the JSON literal `null`), which would break the
    // frontend's `response.json()` call when there's no compatible candidate.
    return { candidate: await this.permitsService.findCompatible(legId, country, serviceType) };
  }

  @Post('legs/:legId/permit-requests/merge')
  merge(@Param('legId') legId: string, @Body() dto: MergePermitRequestDto) {
    return this.permitsService.merge(legId, dto.requirementId);
  }

  @Get('permit-requests')
  findAllWithUrgency() {
    return this.permitsService.findAllWithUrgency();
  }

  @Patch('permit-requests/:id')
  update(@Param('id') id: string, @Body() dto: UpdatePermitRequestDto) {
    return this.permitsService.update(id, dto);
  }

  @Post('permit-requests/:id/comms')
  addManualComm(@Param('id') id: string, @Body() dto: CreateCommDto) {
    return this.permitsService.addManualComm(id, dto);
  }
}
