import { Body, Controller, Get, NotFoundException, Param, Patch, Post, Query, Res, UseGuards } from '@nestjs/common';
import type { Response } from 'express';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { LegsService } from './legs.service';
import { CreateLegDto } from './dto/create-leg.dto';
import { UpdateLegDto } from './dto/update-leg.dto';
import { ExportLegsQueryDto } from './dto/export-legs-query.dto';
import { PermitsService } from '../permits/permits.service';

@Controller('legs')
@UseGuards(JwtAuthGuard)
export class LegsController {
  constructor(
    private readonly legsService: LegsService,
    private readonly permitsService: PermitsService,
  ) {}

  @Post()
  create(@Body() dto: CreateLegDto) {
    return this.legsService.create(dto);
  }

  @Get()
  findAll() {
    return this.legsService.findAll();
  }

  @Get('export')
  async exportCompleted(@Query() query: ExportLegsQueryDto, @Res() res: Response) {
    const buffer = await this.legsService.exportMayflyBuffer(new Date(query.from), new Date(query.to));
    res.set({
      'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition': `attachment; filename="UAA_Completed_Missions_${query.from}_to_${query.to}.xlsx"`,
    });
    res.send(buffer);
  }

  @Get(':id')
  async findOne(@Param('id') id: string) {
    const leg = await this.legsService.findOne(id);
    if (!leg) throw new NotFoundException(`Leg ${id} not found`);
    return leg;
  }

  @Patch(':id')
  async update(@Param('id') id: string, @Body() dto: UpdateLegDto) {
    const leg = await this.legsService.update(id, dto);
    if (dto.arrDate !== undefined) {
      await this.permitsService.reconcileForLeg(id, leg.arrDate);
    }
    return leg;
  }

  @Post(':id/complete')
  markComplete(@Param('id') id: string) {
    return this.legsService.markComplete(id);
  }
}
