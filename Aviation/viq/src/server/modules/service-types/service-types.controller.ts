import { Body, Controller, Get, Param, Patch, Post, Query } from '@nestjs/common';
import { Roles } from '../auth/roles.decorator';
import { ServiceTypesService } from './service-types.service';
import { CreateServiceTypeDto } from './dto/create-service-type.dto';
import { UpdateServiceTypeDto } from './dto/update-service-type.dto';

@Controller('service-types')
export class ServiceTypesController {
  constructor(private readonly serviceTypes: ServiceTypesService) {}

  @Get()
  findAll() {
    return this.serviceTypes.findAll();
  }

  @Roles('Admin')
  @Post()
  create(@Body() dto: CreateServiceTypeDto, @Query('user') user?: string) {
    return this.serviceTypes.create(dto, user);
  }

  @Roles('Admin')
  @Patch(':code')
  update(@Param('code') code: string, @Body() dto: UpdateServiceTypeDto, @Query('user') user?: string) {
    return this.serviceTypes.update(code, dto, user);
  }
}
