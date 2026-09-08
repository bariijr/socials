import { Body, Controller, Delete, Get, Param, Patch, Post, Query } from '@nestjs/common';
import { CommsService } from './comms.service';
import { CreateCommDto } from './dto/create-comm.dto';
import { UpdateCommDto } from './dto/update-comm.dto';

@Controller('comms')
export class CommsController {
  constructor(private readonly comms: CommsService) {}

  @Get()
  findAll(@Query('tripId') tripId?: string) {
    return this.comms.findAll(tripId);
  }

  @Get('failed')
  failed(@Query('limit') limit?: string, @Query('search') search?: string) {
    const limitNum = Math.min(200, Math.max(1, Number(limit) || 20));
    return this.comms.failed(limitNum, search);
  }

  @Get(':commId')
  findOne(@Param('commId') commId: string) {
    return this.comms.findOne(commId);
  }

  @Post()
  create(@Body() dto: CreateCommDto) {
    return this.comms.create(dto);
  }

  @Patch(':commId')
  update(@Param('commId') commId: string, @Body() dto: UpdateCommDto) {
    return this.comms.update(commId, dto);
  }

  @Post(':commId/send')
  send(@Param('commId') commId: string) {
    return this.comms.send(commId);
  }

  @Delete(':commId')
  remove(@Param('commId') commId: string, @Query('user') user?: string) {
    return this.comms.remove(commId, user);
  }
}
