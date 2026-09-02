import { Body, Controller, Delete, Get, Param, Patch, Post, Query } from '@nestjs/common';
import { Roles } from '../auth/roles.decorator';
import { MessageTemplatesService } from './message-templates.service';
import { CreateMessageTemplateDto } from './dto/create-message-template.dto';
import { UpdateMessageTemplateDto } from './dto/update-message-template.dto';

@Controller('message-templates')
export class MessageTemplatesController {
  constructor(private readonly templates: MessageTemplatesService) {}

  @Get()
  findAll() {
    return this.templates.findAll();
  }

  @Get(':countryIso2/:templateType')
  findOne(@Param('countryIso2') countryIso2: string, @Param('templateType') templateType: string) {
    return this.templates.findOne(countryIso2.toUpperCase(), templateType);
  }

  @Roles('Admin')
  @Post()
  create(@Body() dto: CreateMessageTemplateDto) {
    return this.templates.create({ ...dto, countryIso2: dto.countryIso2.toUpperCase() });
  }

  @Roles('Admin')
  @Patch(':id')
  update(@Param('id') id: string, @Body() dto: UpdateMessageTemplateDto) {
    return this.templates.update(Number(id), dto);
  }

  @Roles('Admin')
  @Delete(':id')
  remove(@Param('id') id: string, @Query('user') user?: string) {
    return this.templates.remove(Number(id), user);
  }
}
