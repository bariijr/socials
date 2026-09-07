import { Body, Controller, Get, Param, Patch, Post, Query } from '@nestjs/common';
import { PermitAuthorizationsService } from './permit-authorizations.service';
import { CreatePermitAuthorizationDto } from './dto/create-permit-authorization.dto';
import { UpdatePermitAuthorizationDto } from './dto/update-permit-authorization.dto';
import { CurrentUser, CurrentUserPayload } from '../auth/current-user.decorator';

@Controller('permit-authorizations')
export class PermitAuthorizationsController {
  constructor(private readonly authorizations: PermitAuthorizationsService) {}

  @Get()
  findAll(
    @Query('operatorId') operatorId?: string,
    @Query('countryIso2') countryIso2?: string,
    @Query('serviceType') serviceType?: string,
    @Query('status') status?: string,
  ) {
    return this.authorizations.findAll({ operatorId, countryIso2, serviceType, status });
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.authorizations.findOne(id);
  }

  @Post()
  create(@Body() dto: CreatePermitAuthorizationDto) {
    return this.authorizations.create(dto);
  }

  @Patch(':id')
  update(@Param('id') id: string, @Body() dto: UpdatePermitAuthorizationDto) {
    return this.authorizations.update(id, dto);
  }

  @Post(':id/verify')
  verify(@Param('id') id: string, @CurrentUser() currentUser?: CurrentUserPayload) {
    return this.authorizations.verify(id, currentUser?.role, currentUser?.username);
  }

  @Post(':id/revoke')
  revoke(@Param('id') id: string, @CurrentUser() currentUser?: CurrentUserPayload) {
    return this.authorizations.revoke(id, currentUser?.role, currentUser?.username);
  }
}
