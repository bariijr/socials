// src/server/modules/documents/mrz-extraction.spec.ts
import { extractMrzFields } from './mrz-extraction';

// Mock the mrz module since it's ESM-only and ts-jest can't load it directly
const mockParse = jest.fn();

jest.mock('mrz', () => ({
  parse: mockParse,
}), { virtual: true });

// Canonical ICAO 9303 TD3 (passport) example MRZ -- two 44-character lines.
const SAMPLE_MRZ_TEXT = [
  'Some OCR preamble text that is not part of the MRZ at all.',
  'P<UTOERIKSSON<<ANNA<MARIA<<<<<<<<<<<<<<<<<<<',
  'L898902C36UTO7408122F1204159ZE184226B<<<<<10',
].join('\n');

describe('extractMrzFields', () => {
  beforeEach(() => {
    mockParse.mockReset();
  });

  it('parses a valid passport MRZ embedded in surrounding text', async () => {
    mockParse.mockReturnValue({
      valid: true,
      format: 'TD3',
      details: [],
      fields: {
        firstName: 'ANNA',
        lastName: 'ERIKSSON',
      },
    });
    const result = await extractMrzFields(SAMPLE_MRZ_TEXT);
    expect(result).not.toBeNull();
    expect(result?.format).toBe('TD3');
    expect((result as any).firstName).toContain('ANNA');
    expect((result as any).lastName).toBe('ERIKSSON');
  });

  it('returns null when no MRZ-shaped lines are present', async () => {
    mockParse.mockImplementation(() => {
      throw new Error('No MRZ found');
    });
    const result = await extractMrzFields('Just a regular paragraph of text.\nNothing MRZ-like here.');
    expect(result).toBeNull();
  });
});
