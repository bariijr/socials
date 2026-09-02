import { Module } from '@nestjs/common';
import { LegPurposesService } from './leg-purposes.service';
import { LegPurposesController } from './leg-purposes.controller';

@Module({
  controllers: [LegPurposesController],
  providers: [LegPurposesService],
  exports: [LegPurposesService],
})
export class LegPurposesModule {}
