import { Body, Controller, Delete, Get, Param, Patch, Post, Query } from '@nestjs/common';
import { LegsService } from './legs.service';
import { CreateLegDto } from './dto/create-leg.dto';
import { UpdateLegDto } from './dto/update-leg.dto';
import { Public } from '../auth/public.decorator';

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

  @Get(':legId')
  findOne(@Param('legId') legId: string) {
    return this.legs.findOne(legId);
  }

  @Post()
  create(@Body() dto: CreateLegDto) {
    return this.legs.create(dto);
  }

  @Patch(':legId')
  update(@Param('legId') legId: string, @Body() dto: UpdateLegDto) {
    return this.legs.update(legId, dto);
  }

  @Delete(':legId')
  remove(@Param('legId') legId: string, @Query('user') user?: string) {
    return this.legs.remove(legId, user);
  }
}
