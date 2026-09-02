import { Body, Controller, Delete, Get, Param, Patch, Post, Query } from '@nestjs/common';
import { StopsService } from './stops.service';
import { CreateStopDto } from './dto/create-stop.dto';
import { UpdateStopDto } from './dto/update-stop.dto';

@Controller('stops')
export class StopsController {
  constructor(private readonly stops: StopsService) {}

  @Get()
  findAll(@Query('tripId') tripId?: string) {
    return this.stops.findAll(tripId);
  }

  @Get(':stopId')
  findOne(@Param('stopId') stopId: string) {
    return this.stops.findOne(stopId);
  }

  @Post()
  create(@Body() dto: CreateStopDto) {
    return this.stops.create(dto);
  }

  @Patch(':stopId')
  update(@Param('stopId') stopId: string, @Body() dto: UpdateStopDto) {
    return this.stops.update(stopId, dto);
  }

  @Delete(':stopId')
  remove(@Param('stopId') stopId: string, @Query('user') user?: string) {
    return this.stops.remove(stopId, user);
  }
}
