import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Trip } from './trip.entity';
import { Leg } from '../legs/leg.entity';
import { TripsService } from './trips.service';
import { TripsController } from './trips.controller';

@Module({
  imports: [TypeOrmModule.forFeature([Trip, Leg])],
  providers: [TripsService],
  controllers: [TripsController],
  exports: [TripsService],
})
export class TripsModule {}
