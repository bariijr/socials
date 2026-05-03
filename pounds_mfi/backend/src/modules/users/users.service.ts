import {
  Injectable, NotFoundException, ForbiddenException, ConflictException, BadRequestException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import * as bcrypt from 'bcrypt';
import { User, UserRole, UserStatus } from './entities/user.entity';

@Injectable()
export class UsersService {
  constructor(
    @InjectRepository(User) private userRepo: Repository<User>,
  ) {}

  async findAll(query: any) {
    const qb = this.userRepo.createQueryBuilder('u').orderBy('u.createdAt', 'DESC');

    if (query.role) qb.where('u.role = :role', { role: query.role });
    if (query.status) qb.andWhere('u.status = :status', { status: query.status });
    if (query.search) {
      qb.andWhere(
        '(u.firstName ILIKE :s OR u.lastName ILIKE :s OR u.email ILIKE :s OR u.phone ILIKE :s)',
        { s: `%${query.search}%` },
      );
    }

    const page = parseInt(query.page) || 1;
    const limit = Math.min(parseInt(query.limit) || 20, 100);
    qb.skip((page - 1) * limit).take(limit);

    const [items, total] = await qb.getManyAndCount();
    return { items, total, page, limit, pages: Math.ceil(total / limit) };
  }

  async findOne(id: string) {
    const user = await this.userRepo.findOne({ where: { id } });
    if (!user) throw new NotFoundException('User not found');
    return user;
  }

  async create(dto: any, currentUser: any) {
    if (dto.role === UserRole.SUPER_ADMIN && currentUser.role !== UserRole.SUPER_ADMIN) {
      throw new ForbiddenException('Cannot create super admin');
    }
    const existing = await this.userRepo.findOne({ where: { email: dto.email.toLowerCase() } });
    if (existing) throw new ConflictException('Email already exists');

    const user = this.userRepo.create({
      ...dto,
      email: dto.email.toLowerCase(),
      status: dto.status || UserStatus.ACTIVE,
      notificationPreferences: { email: true, sms: true, whatsapp: false, push: true },
    });
    return this.userRepo.save(user);
  }

  async update(id: string, dto: any, currentUser: any) {
    const user = await this.findOne(id);
    if (dto.role === UserRole.SUPER_ADMIN && currentUser.role !== UserRole.SUPER_ADMIN) {
      throw new ForbiddenException('Cannot assign super admin role');
    }
    if (dto.email && dto.email !== user.email) {
      const exists = await this.userRepo.findOne({ where: { email: dto.email.toLowerCase() } });
      if (exists) throw new ConflictException('Email already exists');
    }
    await this.userRepo.update(id, { ...dto, email: dto.email?.toLowerCase() });
    return this.findOne(id);
  }

  async updateStatus(id: string, status: UserStatus) {
    await this.userRepo.update(id, { status });
    return this.findOne(id);
  }

  async updateProfile(id: string, dto: any) {
    const allowed = ['firstName', 'lastName', 'phone', 'address', 'language', 'notificationPreferences'];
    const update: any = {};
    for (const key of allowed) {
      if (dto[key] !== undefined) update[key] = dto[key];
    }

    if (dto.newPassword) {
      const user = await this.userRepo
        .createQueryBuilder('u')
        .addSelect('u.password')
        .where('u.id = :id', { id })
        .getOne();
      if (!user) throw new NotFoundException('User not found');
      if (!dto.currentPassword) throw new BadRequestException('Current password required');
      const valid = await bcrypt.compare(dto.currentPassword, user.password);
      if (!valid) throw new BadRequestException('Current password is incorrect');
      update.password = await bcrypt.hash(dto.newPassword, 12);
      update.passwordChangedAt = new Date();
    }

    await this.userRepo.update(id, update);
    return this.findOne(id);
  }

  async delete(id: string, currentUser: any) {
    if (id === currentUser.id) throw new ForbiddenException('Cannot delete your own account');
    await this.userRepo.update(id, { status: UserStatus.INACTIVE, deletedAt: new Date() } as any);
    return { message: 'User deactivated' };
  }
}
