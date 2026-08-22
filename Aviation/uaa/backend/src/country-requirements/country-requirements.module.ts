import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { CountryRequirement } from './country-requirement.entity';

@Module({
  imports: [TypeOrmModule.forFeature([CountryRequirement])],
  exports: [TypeOrmModule],
})
export class CountryRequirementsModule {}
