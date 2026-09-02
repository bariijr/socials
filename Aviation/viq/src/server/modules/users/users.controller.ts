import { Body, Controller, Get, Param, Patch, Post, Query } from '@nestjs/common';
import { UsersService } from './users.service';
import { CreateUserDto } from './dto/create-user.dto';
import { UpdateUserDto } from './dto/update-user.dto';
import { Roles } from '../auth/roles.decorator';

@Controller('users')
@Roles('Admin')
export class UsersController {
  constructor(private readonly users: UsersService) {}

  // Overrides the class-level @Roles('Admin') — any authenticated user
  // needs this for the Trip Owner typeahead (Item 14), so it returns only
  // display-name fields, never email/phone/username/role.
  @Roles('Admin', 'Coordinator', 'Viewer')
  @Get('directory')
  directory(@Query('search') search?: string) {
    return this.users.directory(search);
  }

  @Get()
  findAll() {
    return this.users.findAll();
  }

  @Post()
  create(@Body() dto: CreateUserDto) {
    return this.users.create(dto);
  }

  @Patch(':id')
  update(@Param('id') id: string, @Body() dto: UpdateUserDto) {
    return this.users.update(id, dto);
  }
}
