import { Module } from '@nestjs/common';
import { PersonRatingsService } from './person-ratings.service';
import { PersonRatingsController } from './person-ratings.controller';

@Module({
  controllers: [PersonRatingsController],
  providers: [PersonRatingsService],
  exports: [PersonRatingsService],
})
export class PersonRatingsModule {}
