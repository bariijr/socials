import { Body, Controller, Get, Param, Patch, Post, Query } from '@nestjs/common';
import { TasksService } from './tasks.service';
import { CreateTaskDto } from './dto/create-task.dto';
import { UpdateTaskDto } from './dto/update-task.dto';
import { CurrentUser, CurrentUserPayload } from '../auth/current-user.decorator';

@Controller('tasks')
export class TasksController {
  constructor(private readonly tasks: TasksService) {}

  @Get()
  async findAll(
    @Query('scope') scope: 'mine' | 'team' | 'unassigned' | 'escalated' | undefined,
    @Query('tripId') tripId: string | undefined,
    @CurrentUser() currentUser?: CurrentUserPayload,
  ) {
    let currentUserTeam: string | undefined;
    if (scope === 'team' && currentUser?.sub) {
      currentUserTeam = await this.tasks.resolveUserTeam(currentUser.sub);
    }
    return this.tasks.findAll({
      scope,
      tripId,
      currentUserId: currentUser?.sub,
      currentUserTeam,
    });
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.tasks.findOne(id);
  }

  @Post()
  create(@Body() dto: CreateTaskDto, @CurrentUser() currentUser?: CurrentUserPayload) {
    return this.tasks.create(dto, currentUser?.username);
  }

  @Patch(':id')
  update(@Param('id') id: string, @Body() dto: UpdateTaskDto, @CurrentUser() currentUser?: CurrentUserPayload) {
    return this.tasks.update(id, dto, currentUser?.username);
  }
}
