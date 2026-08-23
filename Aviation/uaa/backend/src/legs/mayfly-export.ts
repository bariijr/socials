import * as XLSX from 'xlsx';
import type { Leg } from './leg.entity';

export const MAYFLY_HEADERS = [
  'COUNTRY', 'REGION', 'REF No', 'CLIENT NAME', 'OPR NAME', 'CLIENT NO.', 'AGENT NAME',
  'Service Report Sent', 'Returned in Time Frame?', 'AGENT CONTACTS', 'TRIP_NO.', 'TAIL',
  'UAA_ICAO', 'ARR DATE', 'DEP DATE', 'ARR_FROM', 'DEP_TO_ICAO', 'Activity type', 'Progress',
  'CAPT NAME', 'CAPT EMAIL', 'AC Type', 'MTOW (LB)', 'PGH', 'TSS Team', 'Report / Clearance Number',
  'TSS Notified', 'Client Notified', 'Agent Expenses', 'Ready to bill ', 'Invoice Received', 'Remarks',
  'A2G SUPERVISORS', 'DATE DRIVE COMPLETE LINE', 'A2G INVOICE NUMBER NS', 'PROCESS BY', 'DATE PROCESS',
  'BILLING MONTH', 'SEMAPHORE', 'COMENTS TO KELLY/AGENT', 'LEG ID', 'INTEL STATUS',
];

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

function formatExcelDate(date: Date | null): string | null {
  if (!date) return null;
  const day = String(date.getUTCDate()).padStart(2, '0');
  const month = MONTHS[date.getUTCMonth()];
  const year = date.getUTCFullYear();
  const hh = String(date.getUTCHours()).padStart(2, '0');
  const mm = String(date.getUTCMinutes()).padStart(2, '0');
  return `${day}-${month}-${year} ${hh}:${mm}`;
}

function yesNo(value: boolean): string {
  return value ? 'YES' : 'NO';
}

export function legToMayflyRow(leg: Leg): Array<string | number | null> {
  return [
    leg.country,
    leg.region,
    leg.refNo,
    leg.clientName,
    leg.operatorName,
    leg.clientNo,
    leg.agentName,
    yesNo(leg.serviceReportSent),
    yesNo(leg.returnedInTime),
    leg.agentContacts,
    leg.tripNo,
    leg.tail,
    leg.icao,
    formatExcelDate(leg.arrDate),
    formatExcelDate(leg.depDate),
    leg.arrFrom,
    leg.depToIcao,
    leg.activityType,
    leg.progress,
    leg.captName,
    leg.captEmail,
    leg.acType,
    leg.mtowLb,
    leg.pgh,
    leg.tssTeam,
    leg.clearanceNumber,
    yesNo(leg.tssNotified),
    yesNo(leg.clientNotified),
    leg.agentExpenses,
    yesNo(leg.readyToBill),
    yesNo(leg.invoiceReceived),
    leg.remarks,
    leg.a2gSupervisor,
    formatExcelDate(leg.driveCompleteDate),
    leg.a2gInvoiceNumber,
    leg.processBy,
    formatExcelDate(leg.processDate),
    leg.billingMonth,
    leg.semaphore,
    leg.commentsToAgent,
    leg.legId,
    leg.intelStatus,
  ];
}

export function buildMayflyWorkbook(legs: Leg[]): Buffer {
  const rows = [MAYFLY_HEADERS, ...legs.map(legToMayflyRow)];
  const worksheet = XLSX.utils.aoa_to_sheet(rows);
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, 'Completed Missions');
  return XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' }) as Buffer;
}
