import { Body, Controller, Delete, Get, Param, Patch, Post } from '@nestjs/common';
import { PersonRatingsService } from './person-ratings.service';
import { CreateRatingDto } from './dto/create-rating.dto';
import { UpdateRatingDto } from './dto/update-rating.dto';

@Controller()
export class PersonRatingsController {
  constructor(private readonly ratings: PersonRatingsService) {}

  @Get('persons/:personId/ratings')
  findForPerson(@Param('personId') personId: string) {
    return this.ratings.findForPerson(personId);
  }

  @Post('ratings')
  create(@Body() dto: CreateRatingDto) {
    return this.ratings.create(dto);
  }

  @Patch('ratings/:id')
  update(@Param('id') id: string, @Body() dto: UpdateRatingDto) {
    return this.ratings.update(Number(id), dto);
  }

  @Delete('ratings/:id')
  remove(@Param('id') id: string) {
    return this.ratings.remove(Number(id));
  }
}
