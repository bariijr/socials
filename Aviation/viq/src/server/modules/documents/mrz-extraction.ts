// src/server/modules/documents/mrz-extraction.ts
//
// Pulled out of the old docs module's OcrService as a standalone, pure
// function -- it never referenced instance state, and isolating it makes
// it independently testable with a real MRZ string instead of needing a
// rendered/OCR'd image to exercise it.

// Mock-friendly approach: cache the parse function to avoid reimporting each call
// The mrz package is ESM-only, so jest tests must mock it
let parseFn: ((lines: string[], opts: any) => any) | undefined;

async function getParse() {
  if (parseFn === undefined) {
    try {
      const mrz = await import('mrz');
      parseFn = mrz.parse;
    } catch {
      // In tests, this will be mocked before import is attempted
      throw new Error('Failed to load mrz module');
    }
  }
  return parseFn;
}

export async function extractMrzFields(rawText: string): Promise<Record<string, unknown> | null> {
  const parse = await getParse();
  const candidateLines = rawText
    .split('\n')
    .map((line) => line.replace(/\s/g, '').toUpperCase())
    .filter((line) => line.length >= 28 && /^[A-Z0-9<]+$/.test(line));

  for (const windowSize of [2, 3]) {
    for (let i = 0; i <= candidateLines.length - windowSize; i++) {
      const window = candidateLines.slice(i, i + windowSize);
      try {
        const result = parse(window, { autocorrect: true });
        if (result.valid || result.details.some((d: { valid: boolean }) => d.valid)) {
          return { format: result.format, ...result.fields };
        }
      } catch {
        // Not a valid MRZ shape at this window -- keep scanning. Expected
        // for every non-MRZ line grouping, not an error worth logging.
      }
    }
  }
  return null;
}
