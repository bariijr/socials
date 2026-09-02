import * as XLSX from 'xlsx';

export function exportToExcel<T extends object>(rows: T[], filename: string, sheetName = 'Sheet1'): void {
  const serializable = rows.map((row) => {
    const out: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(row)) {
      if (Array.isArray(value)) {
        out[key] = value.join(', ');
      } else if (typeof value === 'boolean') {
        out[key] = value ? 'TRUE' : 'FALSE';
      } else {
        out[key] = value ?? '';
      }
    }
    return out;
  });
  const sheet = XLSX.utils.json_to_sheet(serializable);
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, sheet, sheetName);
  XLSX.writeFile(workbook, filename);
}

export async function parseExcelFile(file: File): Promise<Record<string, string>[]> {
  const buffer = await file.arrayBuffer();
  const workbook = XLSX.read(buffer, { type: 'array' });
  const sheet = workbook.Sheets[workbook.SheetNames[0]];
  return XLSX.utils.sheet_to_json<Record<string, string>>(sheet, { raw: false, defval: '' });
}

export function parseBoolCell(value: string): boolean {
  return value.trim().toUpperCase() === 'TRUE';
}

export function parseListCell(value: string): string[] {
  return value.split(',').map((s) => s.trim()).filter(Boolean);
}

export function parseNumberCell(value: string): number {
  return Number(value) || 0;
}
