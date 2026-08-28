import { Body, Controller, Delete, Get, Param, Patch, Post, Query } from '@nestjs/common';
import { ClientsService } from './clients.service';
import { CreateClientDto } from './dto/create-client.dto';
import { UpdateClientDto } from './dto/update-client.dto';

// Deliberately no @Roles('Admin') here — clients are everyday operational
// data a Coordinator creates while booking a trip, same as Persons, not
// Admin-curated master reference data like Operators/Providers/Countries.
@Controller('clients')
export class ClientsController {
  constructor(private readonly clients: ClientsService) {}

  @Get()
  findAll(@Query('search') search?: string) {
    return this.clients.findAll(search);
  }

  @Get(':clientId')
  findOne(@Param('clientId') clientId: string) {
    return this.clients.findOne(clientId);
  }

  @Post()
  create(@Body() dto: CreateClientDto) {
    return this.clients.create(dto);
  }

  @Patch(':clientId')
  update(@Param('clientId') clientId: string, @Body() dto: UpdateClientDto) {
    return this.clients.update(clientId, dto);
  }

  @Delete(':clientId')
  remove(@Param('clientId') clientId: string, @Query('user') user?: string) {
    return this.clients.remove(clientId, user);
  }
}
