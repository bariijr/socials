// src/server/modules/documents/mrz-extraction.ts
//
// Pulled out of the old docs module's OcrService as a standalone, pure
// function -- it never referenced instance state, and isolating it makes
// it independently testable with a real MRZ string instead of needing a
// rendered/OCR'd image to exercise it.
//
// The `mrz` package is ESM-only (package.json declares "type": "module"
// with no CJS export condition). This project compiles to CommonJS, and
// Jest's own CJS module loader rejects a plain `import`/`require` of an
// ESM-only package outright (`createRequireEsmError`) even on a Node
// version whose native `require(esm)` would otherwise handle it -- Jest
// intercepts before Node's loader gets the chance. The same problem (and
// the same fix) already exists in the old docs module's OcrService for
// `pdfjs-dist`: going through `new Function` for the import expression
// bypasses TypeScript's `module: commonjs` transform (which would
// otherwise rewrite `await import(...)` into a `require()` call) and
// reaches Node's native dynamic import directly, which Jest does not
// intercept.
const importEsm = new Function('specifier', 'return import(specifier)') as (specifier: string) => Promise<any>;

export async function extractMrzFields(rawText: string): Promise<Record<string, unknown> | null> {
  const { parse } = await importEsm('mrz');

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
