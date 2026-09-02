import { Body, Controller, Delete, Get, Param, Patch, Post, Query } from '@nestjs/common';
import { TripsService } from './trips.service';
import { CreateTripDto } from './dto/create-trip.dto';
import { UpdateTripDto } from './dto/update-trip.dto';

@Controller('trips')
export class TripsController {
  constructor(private readonly trips: TripsService) {}

  @Get()
  findAll(
    @Query('page') page?: string,
    @Query('limit') limit?: string,
    @Query('search') search?: string,
    @Query('upcoming') upcoming?: string,
    @Query('enquiriesOnly') enquiriesOnly?: string,
  ) {
    if (page === undefined) {
      return this.trips.findAll();
    }
    const pageNum = Math.max(1, Number(page) || 1);
    const limitNum = Math.min(200, Math.max(1, Number(limit) || 50));
    return this.trips.findAllPaginated(pageNum, limitNum, search, {
      upcomingHours: upcoming ? Number(upcoming) : undefined,
      enquiriesOnly: enquiriesOnly === 'true',
    });
  }

  @Get('next-id')
  nextId() {
    return this.trips.nextTripId().then((tripId) => ({ tripId }));
  }

  @Get(':tripId')
  findOne(@Param('tripId') tripId: string) {
    return this.trips.findOne(tripId);
  }

  @Get(':tripId/sheet')
  sheet(@Param('tripId') tripId: string) {
    return this.trips.sheet(tripId);
  }

  @Post()
  create(@Body() dto: CreateTripDto) {
    return this.trips.create(dto);
  }

  @Patch(':tripId')
  update(@Param('tripId') tripId: string, @Body() dto: UpdateTripDto) {
    return this.trips.update(tripId, dto);
  }

  @Delete(':tripId')
  remove(@Param('tripId') tripId: string, @Query('user') user?: string) {
    return this.trips.remove(tripId, user);
  }
}
