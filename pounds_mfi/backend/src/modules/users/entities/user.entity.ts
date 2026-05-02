import {
  Entity, PrimaryGeneratedColumn, Column, CreateDateColumn,
  UpdateDateColumn, Index, OneToMany, BeforeInsert, BeforeUpdate,
} from 'typeorm';
import * as bcrypt from 'bcrypt';

export enum UserRole {
  SUPER_ADMIN = 'super_admin',
  ADMIN = 'admin',
  LOAN_OFFICER = 'loan_officer',
  USER = 'user',
}

export enum UserStatus {
  ACTIVE = 'active',
  INACTIVE = 'inactive',
  SUSPENDED = 'suspended',
  PENDING = 'pending',
}

@Entity('users')
export class User {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Index()
  @Column({ unique: true })
  email: string;

  @Column({ select: false })
  password: string;

  @Column()
  firstName: string;

  @Column()
  lastName: string;

  @Index()
  @Column({ unique: true, nullable: true })
  phone: string;

  @Column({ type: 'enum', enum: UserRole, default: UserRole.USER })
  role: UserRole;

  @Column({ type: 'enum', enum: UserStatus, default: UserStatus.PENDING })
  status: UserStatus;

  @Column({ nullable: true })
  profilePhoto: string;

  @Column({ nullable: true })
  nationalId: string;

  @Column({ nullable: true })
  address: string;

  @Column({ default: 'en' })
  language: string;

  @Column({ default: false })
  twoFactorEnabled: boolean;

  @Column({ nullable: true, select: false })
  twoFactorSecret: string;

  @Column({ nullable: true })
  lastLoginAt: Date;

  @Column({ nullable: true })
  lastLoginIp: string;

  @Column({ nullable: true })
  lastLoginDevice: string;

  @Column({ nullable: true })
  passwordChangedAt: Date;

  @Column({ default: 0 })
  failedLoginAttempts: number;

  @Column({ nullable: true })
  lockedUntil: Date;

  @Column({ type: 'jsonb', nullable: true })
  notificationPreferences: {
    email: boolean;
    sms: boolean;
    whatsapp: boolean;
    push: boolean;
  };

  @Column({ nullable: true })
  emailVerifiedAt: Date;

  @Column({ nullable: true, select: false })
  emailVerificationToken: string;

  @Column({ nullable: true, select: false })
  passwordResetToken: string;

  @Column({ nullable: true })
  passwordResetExpiresAt: Date;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;

  @Column({ nullable: true })
  deletedAt: Date;

  @BeforeInsert()
  @BeforeUpdate()
  async hashPassword() {
    if (this.password && !this.password.startsWith('$2b$')) {
      this.password = await bcrypt.hash(this.password, 12);
    }
  }

  get fullName(): string {
    return `${this.firstName} ${this.lastName}`;
  }

  async validatePassword(password: string): Promise<boolean> {
    return bcrypt.compare(password, this.password);
  }
}
