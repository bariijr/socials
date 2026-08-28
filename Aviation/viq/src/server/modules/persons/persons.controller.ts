import { Body, Controller, Delete, Get, Param, Patch, Post, Query } from '@nestjs/common';
import { PersonsService } from './persons.service';
import { CreatePersonDto } from './dto/create-person.dto';
import { UpdatePersonDto } from './dto/update-person.dto';
import { AssignPersonDto } from './dto/assign-person.dto';
import { AssignAllLegsDto } from './dto/assign-all-legs.dto';

@Controller('persons')
export class PersonsController {
  constructor(private readonly persons: PersonsService) {}

  @Get()
  findAll(
    @Query('legId') legId?: string,
    @Query('tripId') tripId?: string,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ) {
    if (page !== undefined && !legId && !tripId) {
      const pageNum = Math.max(1, Number(page) || 1);
      const limitNum = Math.min(200, Math.max(1, Number(limit) || 50));
      return this.persons.findAllPaginated(pageNum, limitNum);
    }
    return this.persons.findAll({ legId, tripId });
  }

  @Post(':personId/assign')
  assign(@Param('personId') personId: string, @Body() dto: AssignPersonDto) {
    return this.persons.assign(personId, dto);
  }

  @Delete(':personId/assign/:legId')
  unassign(@Param('personId') personId: string, @Param('legId') legId: string, @Query('user') user?: string) {
    return this.persons.unassign(personId, legId, user);
  }

  @Post(':personId/assign-all-legs')
  assignAllLegs(@Param('personId') personId: string, @Body() dto: AssignAllLegsDto) {
    return this.persons.assignAllLegs(personId, dto);
  }

  @Get(':personId/assignments')
  findAssignments(@Param('personId') personId: string) {
    return this.persons.findAssignments(personId);
  }

  @Get(':personId')
  findOne(@Param('personId') personId: string) {
    return this.persons.findOne(personId);
  }

  @Post()
  create(@Body() dto: CreatePersonDto) {
    return this.persons.create(dto);
  }

  @Patch(':personId')
  update(@Param('personId') personId: string, @Body() dto: UpdatePersonDto) {
    return this.persons.update(personId, dto);
  }

  @Delete(':personId')
  remove(@Param('personId') personId: string, @Query('user') user?: string) {
    return this.persons.remove(personId, user);
  }
}
