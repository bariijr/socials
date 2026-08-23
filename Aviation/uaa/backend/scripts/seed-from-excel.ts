import 'reflect-metadata';
import * as bcrypt from 'bcrypt';
import * as XLSX from 'xlsx';
import { AppDataSource } from '../src/database/data-source';
import { User } from '../src/users/user.entity';
import { Leg } from '../src/legs/leg.entity';
import { Team } from '../src/notifications/team.entity';

const TEMP_PASSWORD = 'ChangeMe-' + Math.random().toString(36).slice(2, 10);

function excelDateToJsDate(value: unknown): Date | null {
  if (value instanceof Date) return value;
  if (typeof value === 'number') {
    return new Date(Math.round((value - 25569) * 86400 * 1000));
  }
  if (typeof value === 'string' && value.trim() !== '') {
    const parsed = new Date(value);
    return Number.isNaN(parsed.getTime()) ? null : parsed;
  }
  return null;
}

function isYes(value: unknown): boolean {
  return typeof value === 'string' && value.trim().toUpperCase() === 'YES';
}

function parseMtow(value: unknown): number | null {
  if (value == null || value === '') return null;
  const parsed = parseInt(String(value), 10);
  return Number.isNaN(parsed) ? null : parsed;
}

async function seedUsers(workbook: XLSX.WorkBook, dataSource: typeof AppDataSource) {
  const settingsSheet = workbook.Sheets['SETTINGS'];
  const rows = XLSX.utils.sheet_to_json<any[]>(settingsSheet, { header: 1, range: 4 });
  const userRepo = dataSource.getRepository(User);
  let created = 0;

  for (const row of rows) {
    const [, username, fullName, jobTitle, mobile, fromEmail, ccDefault] = row;
    if (!username || !fullName) break;
    const exists = await userRepo.findOne({ where: { username } });
    if (exists) continue;
    const passwordHash = await bcrypt.hash(TEMP_PASSWORD, 10);
    await userRepo.save(
      userRepo.create({ username, fullName, jobTitle: jobTitle ?? null, mobile: mobile ?? null, fromEmail, ccDefault: ccDefault ?? null, passwordHash }),
    );
    created++;
  }
  return created;
}

async function seedLegs(workbook: XLSX.WorkBook, dataSource: typeof AppDataSource) {
  const mayflySheet = workbook.Sheets['MAYFLY'];
  const rows = XLSX.utils.sheet_to_json<any[]>(mayflySheet, { header: 1, range: 1 });
  const legRepo = dataSource.getRepository(Leg);
  let created = 0;

  for (const row of rows) {
    const tripNo = row[10];
    const icao = row[12];
    if (!tripNo || !icao) continue;

    const leg = legRepo.create({
      country: row[0] ?? null,
      region: row[1] ?? null,
      refNo: row[2] ?? null,
      clientName: row[3] ?? null,
      operatorName: row[4] ?? null,
      clientNo: row[5] != null ? String(row[5]) : null,
      agentName: row[6] ?? null,
      serviceReportSent: isYes(row[7]),
      returnedInTime: isYes(row[8]),
      agentContacts: row[9] ?? null,
      tripNo: String(tripNo),
      tail: row[11] ?? null,
      icao: String(icao),
      arrDate: excelDateToJsDate(row[13]),
      depDate: excelDateToJsDate(row[14]),
      arrFrom: row[15] ?? null,
      depToIcao: row[16] ?? null,
      activityType: row[17] ?? null,
      progress: row[18] ?? null,
      captName: row[19] ?? null,
      captEmail: row[20] ?? null,
      acType: row[21] ?? null,
      mtowLb: parseMtow(row[22]),
      pgh: row[23] ?? null,
      tssTeam: row[24] ?? null,
      clearanceNumber: row[25] ?? null,
      tssNotified: isYes(row[26]),
      clientNotified: isYes(row[27]),
      agentExpenses: row[28] != null ? String(row[28]) : null,
      readyToBill: isYes(row[29]),
      invoiceReceived: isYes(row[30]),
      remarks: row[31] ?? null,
      a2gSupervisor: row[32] ?? null,
      driveCompleteDate: excelDateToJsDate(row[33]),
      a2gInvoiceNumber: row[34] ?? null,
      processBy: row[35] ?? null,
      processDate: excelDateToJsDate(row[36]),
      billingMonth: row[37] ?? null,
      semaphore: row[38] ?? null,
      commentsToAgent: row[39] ?? null,
      legId: row[40] ? Number(row[40]) : created + 1,
      intelStatus: row[41] ?? null,
    });
    await legRepo.save(leg);
    created++;
  }
  return created;
}

async function seedTeams(workbook: XLSX.WorkBook, dataSource: typeof AppDataSource) {
  const teamsSheet = workbook.Sheets['TEAMS'];
  const rows = XLSX.utils.sheet_to_json<any[]>(teamsSheet, { header: 1, range: 1 });
  const teamRepo = dataSource.getRepository(Team);
  let created = 0;

  for (const row of rows) {
    const name = row[0] != null ? String(row[0]).trim() : '';
    const teamEmail = row[2] != null ? String(row[2]).trim() : '';
    if (!name || !teamEmail) continue;

    const exists = await teamRepo.findOne({ where: { name } });
    if (exists) continue;

    await teamRepo.save(teamRepo.create({ name, teamEmail, remarks: row[3] ? String(row[3]) : null }));
    created++;
  }
  return created;
}

async function main() {
  const filePath = process.argv[2];
  if (!filePath) {
    console.error('Usage: npm run seed -- <path-to-UAA_Coordinator_v5.xlsm>');
    process.exit(1);
  }

  const workbook = XLSX.readFile(filePath);
  await AppDataSource.initialize();

  const usersCreated = await seedUsers(workbook, AppDataSource);
  const legsCreated = await seedLegs(workbook, AppDataSource);
  const teamsCreated = await seedTeams(workbook, AppDataSource);

  console.log(`Seeded ${usersCreated} user(s), ${legsCreated} leg(s), ${teamsCreated} team(s).`);
  if (usersCreated > 0) {
    console.log(`Temporary password for newly created users: ${TEMP_PASSWORD}`);
    console.log('Share this out-of-band and require a password change on first login (password-change flow is a follow-up task, not part of this plan).');
  }

  await AppDataSource.destroy();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
