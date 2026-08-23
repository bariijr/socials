import { Body, Controller, Get, Param, Patch, Post, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { PermitsService } from './permits.service';
import { CreatePermitRequestDto } from './dto/create-permit-request.dto';
import { UpdatePermitRequestDto } from './dto/update-permit-request.dto';
import { CreateCommDto } from './dto/create-comm.dto';

@Controller()
@UseGuards(JwtAuthGuard)
export class PermitsController {
  constructor(private readonly permitsService: PermitsService) {}

  @Post('legs/:legId/permit-requests')
  create(@Param('legId') legId: string, @Body() dto: CreatePermitRequestDto) {
    return this.permitsService.create(legId, dto.country);
  }

  @Get('legs/:legId/permit-requests')
  findByLeg(@Param('legId') legId: string) {
    return this.permitsService.findByLeg(legId);
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
