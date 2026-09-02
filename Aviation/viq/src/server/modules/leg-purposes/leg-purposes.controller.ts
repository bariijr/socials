import { Body, Controller, Get, Param, Patch, Post, Query } from '@nestjs/common';
import { Roles } from '../auth/roles.decorator';
import { LegPurposesService } from './leg-purposes.service';
import { CreateLegPurposeDto } from './dto/create-leg-purpose.dto';
import { UpdateLegPurposeDto } from './dto/update-leg-purpose.dto';

@Controller('leg-purposes')
export class LegPurposesController {
  constructor(private readonly legPurposes: LegPurposesService) {}

  @Get()
  findAll() {
    return this.legPurposes.findAll();
  }

  @Roles('Admin')
  @Post()
  create(@Body() dto: CreateLegPurposeDto, @Query('user') user?: string) {
    return this.legPurposes.create(dto, user);
  }

  @Roles('Admin')
  @Patch(':code')
  update(@Param('code') code: string, @Body() dto: UpdateLegPurposeDto, @Query('user') user?: string) {
    return this.legPurposes.update(code, dto, user);
  }
}
