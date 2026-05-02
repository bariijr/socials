import 'reflect-metadata';
import { DataSource } from 'typeorm';
import * as bcrypt from 'bcrypt';
import * as dotenv from 'dotenv';
import { join } from 'path';

dotenv.config();

const AppDataSource = new DataSource({
  type: 'postgres',
  host: process.env.DB_HOST || 'localhost',
  port: parseInt(process.env.DB_PORT || '5432'),
  username: process.env.DB_USERNAME || 'pounds_user',
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME || 'pounds_mfi',
  entities: [join(__dirname, '../../**/*.entity{.ts,.js}')],
  synchronize: false,
});

async function seed() {
  await AppDataSource.initialize();
  console.log('Connected to database. Starting seed...');

  const hash = await bcrypt.hash('Admin@123456', 12);

  // Seed users
  const users = [
    {
      id: '00000000-0000-0000-0000-000000000001',
      email: 'superadmin@pounds.mfi',
      password: hash,
      firstName: 'Super',
      lastName: 'Admin',
      phone: '+254700000001',
      role: 'super_admin',
      status: 'active',
      emailVerifiedAt: new Date(),
    },
    {
      id: '00000000-0000-0000-0000-000000000002',
      email: 'admin@pounds.mfi',
      password: hash,
      firstName: 'System',
      lastName: 'Admin',
      phone: '+254700000002',
      role: 'admin',
      status: 'active',
      emailVerifiedAt: new Date(),
    },
    {
      id: '00000000-0000-0000-0000-000000000003',
      email: 'officer@pounds.mfi',
      password: hash,
      firstName: 'Loan',
      lastName: 'Officer',
      phone: '+254700000003',
      role: 'loan_officer',
      status: 'active',
      emailVerifiedAt: new Date(),
    },
    {
      id: '00000000-0000-0000-0000-000000000004',
      email: 'borrower@pounds.mfi',
      password: hash,
      firstName: 'John',
      lastName: 'Doe',
      phone: '+254700000004',
      role: 'user',
      status: 'active',
      emailVerifiedAt: new Date(),
    },
  ];

  for (const user of users) {
    await AppDataSource.query(`
      INSERT INTO users (id, email, password, "firstName", "lastName", phone, role, status, "emailVerifiedAt", "notificationPreferences")
      VALUES ($1, $2, $3, $4, $5, $6, $7::user_role, $8::user_status, $9, $10::jsonb)
      ON CONFLICT (id) DO NOTHING
    `, [
      user.id, user.email, user.password, user.firstName, user.lastName,
      user.phone, user.role, user.status, user.emailVerifiedAt,
      JSON.stringify({ email: true, sms: true, whatsapp: false, push: true }),
    ]);
  }

  // Seed loan packages
  const packages = [
    {
      name: 'Starter Loan',
      description: 'Small loans for individuals starting out',
      interestRate: 10,
      interestFrequency: 'monthly',
      minAmount: 5000,
      maxAmount: 50000,
      minDuration: 30,
      maxDuration: 90,
      processingFeePercent: 5,
      penaltyPercent: 5,
    },
    {
      name: 'Business Loan',
      description: 'Medium loans for small businesses',
      interestRate: 8,
      interestFrequency: 'monthly',
      minAmount: 50000,
      maxAmount: 500000,
      minDuration: 90,
      maxDuration: 365,
      processingFeePercent: 5,
      penaltyPercent: 5,
    },
    {
      name: 'Premium Loan',
      description: 'Large loans for established businesses',
      interestRate: 6,
      interestFrequency: 'monthly',
      minAmount: 500000,
      maxAmount: 5000000,
      minDuration: 180,
      maxDuration: 730,
      processingFeePercent: 3,
      penaltyPercent: 5,
    },
    {
      name: 'Emergency Loan',
      description: 'Quick short-term loans',
      interestRate: 15,
      interestFrequency: 'weekly',
      minAmount: 1000,
      maxAmount: 20000,
      minDuration: 7,
      maxDuration: 30,
      processingFeePercent: 5,
      penaltyPercent: 5,
    },
  ];

  for (const pkg of packages) {
    await AppDataSource.query(`
      INSERT INTO loan_packages (name, description, "interestRate", "interestFrequency",
        "minAmount", "maxAmount", "minDuration", "maxDuration",
        "processingFeePercent", "penaltyPercent")
      VALUES ($1, $2, $3, $4::interest_frequency, $5, $6, $7, $8, $9, $10)
      ON CONFLICT (name) DO NOTHING
    `, [
      pkg.name, pkg.description, pkg.interestRate, pkg.interestFrequency,
      pkg.minAmount, pkg.maxAmount, pkg.minDuration, pkg.maxDuration,
      pkg.processingFeePercent, pkg.penaltyPercent,
    ]);
  }

  // Seed settings
  const settings = [
    { key: 'maintenance_mode', value: 'false', type: 'boolean', isPublic: true },
    { key: 'registration_open', value: 'true', type: 'boolean', isPublic: true },
    { key: 'max_active_loans_per_user', value: '3', type: 'number', isPublic: false },
    { key: 'min_loan_application_age_days', value: '0', type: 'number', isPublic: false },
  ];

  for (const s of settings) {
    await AppDataSource.query(`
      INSERT INTO settings (key, value, type, "isPublic")
      VALUES ($1, $2, $3, $4)
      ON CONFLICT (key) DO NOTHING
    `, [s.key, s.value, s.type, s.isPublic]);
  }

  console.log('✓ Users seeded (4)');
  console.log('✓ Loan packages seeded (4)');
  console.log('✓ Settings seeded');
  console.log('\nSeed complete!');
  console.log('\nDefault credentials (change after first login):');
  console.log('  Super Admin: superadmin@pounds.mfi / Admin@123456');
  console.log('  Admin:       admin@pounds.mfi / Admin@123456');
  console.log('  Officer:     officer@pounds.mfi / Admin@123456');
  console.log('  Borrower:    borrower@pounds.mfi / Admin@123456');

  await AppDataSource.destroy();
}

seed().catch((err) => {
  console.error('Seed failed:', err);
  process.exit(1);
});
