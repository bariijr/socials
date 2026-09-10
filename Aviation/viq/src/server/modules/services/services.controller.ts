import { Body, Controller, Delete, Get, Param, Patch, Post, Query } from '@nestjs/common';
import { ServicesService } from './services.service';
import { CreateServiceDto } from './dto/create-service.dto';
import { UpdateServiceDto } from './dto/update-service.dto';
import { LinkAuthorizationDto } from './dto/link-authorization.dto';
import { ChangeVendorDto } from './dto/change-vendor.dto';
import { UpdateVendorChangeLogDto } from './dto/update-vendor-change-log.dto';
import { CurrentUser, CurrentUserPayload } from '../auth/current-user.decorator';

@Controller('services')
export class ServicesController {
  constructor(private readonly services: ServicesService) {}

  @Get()
  findAll(@Query('tripId') tripId?: string, @Query('page') page?: string, @Query('limit') limit?: string) {
    if (page === undefined) {
      return this.services.findAll(tripId);
    }
    const pageNum = Math.max(1, Number(page) || 1);
    const limitNum = Math.min(200, Math.max(1, Number(limit) || 50));
    return this.services.findAllPaginated(pageNum, limitNum, tripId);
  }

  @Get('scope/:scopeType/:scopeId')
  forScope(@Param('scopeType') scopeType: string, @Param('scopeId') scopeId: string) {
    return this.services.forScope(scopeType, scopeId);
  }

  @Get('open')
  open(@Query('limit') limit?: string, @Query('search') search?: string) {
    const limitNum = Math.min(200, Math.max(1, Number(limit) || 20));
    return this.services.open(limitNum, search);
  }

  @Get(':svcId')
  findOne(@Param('svcId') svcId: string) {
    return this.services.findOne(svcId);
  }

  @Post()
  create(@Body() dto: CreateServiceDto) {
    return this.services.create(dto);
  }

  @Post('refresh-urgency')
  refreshUrgency() {
    return this.services.refreshUrgency();
  }

  @Post('legs/:legId/generate-overflight')
  generateOverflight(@Param('legId') legId: string, @Query('user') user?: string) {
    return this.services.generateOverflightServices(legId, user);
  }

  @Post('legs/:legId/generate-arrival')
  generateArrival(
    @Param('legId') legId: string,
    @Query('user') user?: string,
    @Query('departureGroundHandling') departureGroundHandling?: string,
  ) {
    return this.services.generateArrivalServices(
      legId,
      { departureGroundHandling: departureGroundHandling === 'true' },
      user,
    );
  }

  @Patch(':svcId')
  update(@Param('svcId') svcId: string, @Body() dto: UpdateServiceDto, @CurrentUser() currentUser?: CurrentUserPayload) {
    return this.services.update(svcId, dto, currentUser?.username);
  }

  @Delete(':svcId')
  remove(@Param('svcId') svcId: string, @Query('user') user?: string) {
    return this.services.remove(svcId, user);
  }

  @Patch(':svcId/link-authorization')
  linkAuthorization(@Param('svcId') svcId: string, @Body() body: LinkAuthorizationDto) {
    return this.services.linkAuthorization(svcId, body.authorizationId, body.version, body.user);
  }

  @Get(':svcId/authorization-candidates')
  authorizationCandidates(@Param('svcId') svcId: string) {
    return this.services.authorizationCandidates(svcId);
  }

  @Get(':svcId/vendor-candidates')
  vendorCandidates(@Param('svcId') svcId: string) {
    return this.services.vendorCandidates(svcId);
  }

  @Get(':svcId/change-vendor-candidates')
  changeVendorCandidates(@Param('svcId') svcId: string) {
    return this.services.changeVendorCandidates(svcId);
  }

  @Post(':svcId/change-vendor')
  changeVendor(@Param('svcId') svcId: string, @Body() dto: ChangeVendorDto, @CurrentUser() user: CurrentUserPayload) {
    return this.services.changeVendor(svcId, dto, user.username, user.role);
  }

  @Patch('vendor-change-logs/:id')
  patchVendorChangeLog(@Param('id') id: string, @Body() dto: UpdateVendorChangeLogDto) {
    return this.services.patchVendorChangeLogNewRequestComm(id, dto.newRequestCommId);
  }

  @Get(':svcId/vendor-change-logs')
  vendorChangeLogs(@Param('svcId') svcId: string) {
    return this.services.vendorChangeLogsForService(svcId);
  }
}
