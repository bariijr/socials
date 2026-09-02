import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import * as bcrypt from 'bcryptjs';
import { PrismaService } from '../../prisma/prisma.service';
import { CreateUserDto } from './dto/create-user.dto';
import { UpdateUserDto } from './dto/update-user.dto';

const SELECT_SAFE = {
  id: true, username: true, role: true, active: true, createdAt: true,
  firstName: true, lastName: true, middleName: true, email: true,
  phone: true, team: true, company: true, designation: true,
};

@Injectable()
export class UsersService {
  constructor(private readonly prisma: PrismaService) {}

  findAll() {
    return this.prisma.user.findMany({ select: SELECT_SAFE, orderBy: { createdAt: 'asc' } });
  }

  // Minimal, non-sensitive fields only — used by the Trip Owner typeahead
  // (Item 14), reachable by any authenticated role, unlike findAll() above.
  directory(search?: string) {
    return this.prisma.user.findMany({
      where: {
        active: true,
        ...(search
          ? {
              OR: [
                { firstName: { contains: search, mode: 'insensitive' } },
                { lastName: { contains: search, mode: 'insensitive' } },
                { username: { contains: search, mode: 'insensitive' } },
              ],
            }
          : {}),
      },
      select: { id: true, username: true, firstName: true, lastName: true, team: true },
      orderBy: { username: 'asc' },
      take: search ? 20 : undefined,
    });
  }

  async create(dto: CreateUserDto) {
    const existingUsername = await this.prisma.user.findUnique({ where: { username: dto.username } });
    if (existingUsername) throw new ConflictException(`Username ${dto.username} is already taken`);
    const existingEmail = await this.prisma.user.findUnique({ where: { email: dto.email } });
    if (existingEmail) throw new ConflictException(`Email ${dto.email} is already in use`);

    const passwordHash = await bcrypt.hash(dto.password, 10);
    return this.prisma.user.create({
      data: {
        username: dto.username,
        passwordHash,
        role: dto.role,
        firstName: dto.firstName,
        lastName: dto.lastName,
        middleName: dto.middleName,
        email: dto.email,
        phone: dto.phone,
        team: dto.team,
        company: dto.company,
        designation: dto.designation,
      },
      select: SELECT_SAFE,
    });
  }

  async update(id: string, dto: UpdateUserDto) {
    const existing = await this.prisma.user.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException(`User ${id} not found`);
    if (dto.email !== undefined && dto.email !== existing.email) {
      const existingEmail = await this.prisma.user.findUnique({ where: { email: dto.email } });
      if (existingEmail) throw new ConflictException(`Email ${dto.email} is already in use`);
    }

    const data: Record<string, unknown> = {};
    if (dto.role !== undefined) data.role = dto.role;
    if (dto.active !== undefined) data.active = dto.active;
    if (dto.password !== undefined) data.passwordHash = await bcrypt.hash(dto.password, 10);
    if (dto.firstName !== undefined) data.firstName = dto.firstName;
    if (dto.lastName !== undefined) data.lastName = dto.lastName;
    if (dto.middleName !== undefined) data.middleName = dto.middleName;
    if (dto.email !== undefined) data.email = dto.email;
    if (dto.phone !== undefined) data.phone = dto.phone;
    if (dto.team !== undefined) data.team = dto.team;
    if (dto.company !== undefined) data.company = dto.company;
    if (dto.designation !== undefined) data.designation = dto.designation;

    return this.prisma.user.update({ where: { id }, data, select: SELECT_SAFE });
  }
}
