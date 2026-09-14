import { Body, Controller, Delete, Get, Param, Patch, Post, Query } from '@nestjs/common';
import { LegsService } from './legs.service';
import { CreateLegDto } from './dto/create-leg.dto';
import { UpdateLegDto } from './dto/update-leg.dto';
import { CancelLegDto } from './dto/cancel-leg.dto';
import { CancelLegsDto } from './dto/cancel-legs.dto';
import { Public } from '../auth/public.decorator';
import { CurrentUser, CurrentUserPayload } from '../auth/current-user.decorator';

@Controller('legs')
export class LegsController {
  constructor(private readonly legs: LegsService) {}

  @Get()
  findAll(@Query('tripId') tripId?: string) {
    return this.legs.findAll(tripId);
  }

  // Public: the unauthenticated LandingPage quote flow (src/client/pages/LandingPage.tsx)
  // calls this via computeCountriesOverflown() for its live route preview and
  // analyzeRoute(), before any trip exists — read-only great-circle geography
  // computation, no Trip/Leg data exposed.
  @Public()
  @Get('compute-overflight')
  computeOverflown(@Query('dep') dep: string, @Query('arr') arr: string) {
    return this.legs.computeOverflown(dep?.toUpperCase(), arr?.toUpperCase()).then((countriesOverflown) => ({ countriesOverflown }));
  }

  @Get('upcoming')
  upcoming(@Query('limit') limit?: string, @Query('search') search?: string) {
    const limitNum = Math.min(200, Math.max(1, Number(limit) || 20));
    return this.legs.upcoming(limitNum, search);
  }

  @Get(':legId/cancellation-preview')
  cancellationPreview(@Param('legId') legId: string) {
    return this.legs.previewLegCancellation(legId);
  }

  @Get(':legId')
  findOne(@Param('legId') legId: string, @CurrentUser() currentUser?: CurrentUserPayload) {
    return this.legs.findOne(legId, currentUser?.role);
  }

  @Post()
  create(@Body() dto: CreateLegDto) {
    return this.legs.create(dto);
  }

  @Post('cancel-batch')
  cancelBatch(@Body() dto: CancelLegsDto, @CurrentUser() currentUser?: CurrentUserPayload) {
    return this.legs.cancelLegs(dto.legIds, dto, currentUser?.role);
  }

  @Post(':legId/cancel')
  cancel(@Param('legId') legId: string, @Body() dto: CancelLegDto, @CurrentUser() currentUser?: CurrentUserPayload) {
    return this.legs.cancelLeg(legId, dto, currentUser?.role);
  }

  @Patch(':legId')
  update(@Param('legId') legId: string, @Body() dto: UpdateLegDto, @CurrentUser() currentUser?: CurrentUserPayload) {
    return this.legs.update(legId, dto, currentUser?.role);
  }

  @Delete(':legId')
  remove(@Param('legId') legId: string, @Query('user') user?: string) {
    return this.legs.remove(legId, user);
  }
}
