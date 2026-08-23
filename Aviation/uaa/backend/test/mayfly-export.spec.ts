import * as XLSX from 'xlsx';
import { legToMayflyRow, buildMayflyWorkbook, MAYFLY_HEADERS } from '../src/legs/mayfly-export';

const leg = {
  country: 'Morocco',
  region: 'Africa',
  refNo: 'REF-1',
  clientName: 'ACME',
  operatorName: 'ACME OPS',
  clientNo: '123',
  agentName: 'Hicham Bentouzer',
  serviceReportSent: true,
  returnedInTime: false,
  agentContacts: 'starscmn@starsaviationservices.com / +212 661 888 747',
  tripNo: '475087',
  tail: 'N832PJ',
  icao: 'GMMN',
  arrDate: new Date('2026-08-21T01:05:00.000Z'),
  depDate: new Date('2026-08-21T02:10:00.000Z'),
  arrFrom: 'OMDB',
  depToIcao: 'LFPG',
  activityType: 'Tech Stop',
  progress: 'Complete',
  captName: 'JOHN SPANNHAKE',
  captEmail: 'john.spannhake@jetaviation.com',
  acType: 'GLF6',
  mtowLb: 94600,
  pgh: 'Success',
  tssTeam: 'Victor',
  clearanceNumber: 'MA-1234',
  tssNotified: true,
  clientNotified: true,
  agentExpenses: 'NO',
  readyToBill: true,
  invoiceReceived: false,
  remarks: 'None',
  a2gSupervisor: 'Baraka',
  driveCompleteDate: new Date('2026-08-21T03:00:00.000Z'),
  a2gInvoiceNumber: 'INV-1',
  processBy: 'Baraka',
  processDate: new Date('2026-08-22T00:00:00.000Z'),
  billingMonth: 'AUG-26',
  semaphore: 'GREEN',
  commentsToAgent: 'Thanks',
  legId: 63,
  intelStatus: 'OK',
} as any;

describe('legToMayflyRow', () => {
  it('maps a Leg to MAYFLY column order, formatting booleans as YES/NO and dates as readable text', () => {
    const row = legToMayflyRow(leg);

    expect(row).toHaveLength(MAYFLY_HEADERS.length);
    expect(row[0]).toBe('Morocco');
    expect(row[7]).toBe('YES');
    expect(row[8]).toBe('NO');
    expect(row[10]).toBe('475087');
    expect(row[13]).toBe('21-Aug-2026 01:05');
    expect(row[40]).toBe(63);
  });

  it('leaves null date fields blank', () => {
    const row = legToMayflyRow({ ...leg, arrDate: null });
    expect(row[13]).toBeNull();
  });
});

describe('buildMayflyWorkbook', () => {
  it('writes a real .xlsx buffer with the MAYFLY header row and one row per leg', () => {
    const buffer = buildMayflyWorkbook([leg]);
    const workbook = XLSX.read(buffer, { type: 'buffer' });
    const sheet = workbook.Sheets[workbook.SheetNames[0]];
    const rows = XLSX.utils.sheet_to_json<any[]>(sheet, { header: 1 });

    expect(rows[0]).toEqual(MAYFLY_HEADERS);
    expect(rows[1][10]).toBe('475087');
  });
});
