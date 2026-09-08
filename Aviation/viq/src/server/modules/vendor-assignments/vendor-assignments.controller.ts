import { Body, Controller, Get, Param, Patch, Post, Query } from '@nestjs/common';
import { VendorAssignmentsService } from './vendor-assignments.service';
import { CreateVendorAssignmentDto } from './dto/create-vendor-assignment.dto';
import { UpdateVendorAssignmentDto } from './dto/update-vendor-assignment.dto';

@Controller('vendor-assignments')
export class VendorAssignmentsController {
  constructor(private readonly assignments: VendorAssignmentsService) {}

  @Get()
  findAll(
    @Query('providerId') providerId?: string,
    @Query('countryIso2') countryIso2?: string,
    @Query('serviceType') serviceType?: string,
    @Query('clientId') clientId?: string,
  ) {
    return this.assignments.findAll({ providerId, countryIso2, serviceType, clientId });
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.assignments.findOne(id);
  }

  @Post()
  create(@Body() dto: CreateVendorAssignmentDto) {
    return this.assignments.create(dto);
  }

  @Patch(':id')
  update(@Param('id') id: string, @Body() dto: UpdateVendorAssignmentDto) {
    return this.assignments.update(id, dto);
  }
}
