#!/usr/bin/env node
// scripts/run-tests.js
//
// Orchestrates the Jest run as three separate child processes instead of
// one, to work around a real Jest bug hit while adding real (non-mocked)
// tests for dynamically-imported ESM-only npm packages.
//
// src/server/modules/documents/mrz-extraction.spec.ts and
// src/server/modules/documents/ocr.service.spec.ts both exercise
// mrz-extraction.ts's `extractMrzFields`, which dynamically imports the
// real, unmocked ESM-only `mrz` package at runtime via Jest's
// --experimental-vm-modules support. Running both files in the *same*
// Jest worker process (as a plain `jest --runInBand` does for the whole
// suite) is intermittently flaky -- confirmed to fail on a large fraction
// of local runs, including with only these two files present, so it is
// not something `--retryTimes` or file-ordering can paper over. Root
// cause, traced into jest-runtime@30.5.1: `dynamicImportFromCjs` ->
// `resolveModule` can resolve to `undefined` for the second file's
// dynamic import when a lingering async continuation from the first
// file's ESM module-graph resolution fires *after* that first file's own
// Jest environment has already been torn down (`Runtime.teardown()`),
// crashing with "Cannot read properties of undefined (reading
// 'identifier')" and misattributing the error to the first file while
// the second file's test is actually running. This is a genuine
// process-sharing race in Jest's experimental VM-modules dynamic-import
// support, not a bug in mrz-extraction.ts, ocr.service.ts, or their
// tests.
//
// The fix: never let those two files share a Jest worker/process. Each
// runs as its own `jest --runInBand` invocation (its own OS process, own
// V8 isolate -- the race is structurally impossible across processes),
// then every remaining suite runs together, `--runInBand`, as before
// (they need serialized access to the one shared Postgres test database;
// see scripts/setup-test-db.ts). If a future change makes another file
// dynamically import a real ESM package at runtime (the same
// `importEsm` pattern is already used for `pdfjs-dist` in both OCR
// services), add it to `isolatedSpecs` below rather than letting it
// share a process with mrz-extraction.spec.ts or ocr.service.spec.ts --
// the exclusion pattern for the third (remaining-suites) invocation is
// derived from that same array, so there is exactly one place to update.
//
// Two properties this script preserves relative to a single
// `jest --runInBand`, on purpose:
//  - every sub-invocation always runs, regardless of whether an earlier
//    one failed, so a broken `npm test` still reports the full picture
//    (all three summaries print; nothing is skipped because something
//    upstream failed) -- exactly what one triaging a red run needs.
//  - the overall process exit code is non-zero if *any* sub-invocation
//    failed, so CI/`&&` chains still see the run as failed overall.
const { spawnSync } = require('child_process');
const path = require('path');

const jestBin = path.join(__dirname, '..', 'node_modules', 'jest', 'bin', 'jest.js');

function runJest(args, extraEnv) {
  // Invoke jest's own bin script directly via `node`, rather than the
  // node_modules/.bin/jest(.cmd) shim -- spawning a .cmd shim on Windows
  // needs shell:true, and shell:true's own command-line quoting mangles
  // regex args like --testPathIgnorePatterns (parens, pipes, backslashes
  // are all shell metacharacters on cmd.exe). Running the real .js
  // entrypoint through `process.execPath` sidesteps the shell entirely,
  // so argv reaches jest exactly as constructed here on every platform.
  const result = spawnSync(process.execPath, [jestBin, ...args], {
    stdio: 'inherit',
    env: extraEnv ? { ...process.env, ...extraEnv } : process.env,
  });
  if (result.error) throw result.error;
  return result.status ?? 1;
}

function escapeRegExp(str) {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

const esmEnv = { NODE_OPTIONS: '--experimental-vm-modules' };
const isolatedSpecs = [
  'src/server/modules/documents/mrz-extraction.spec.ts',
  'src/server/modules/documents/ocr.service.spec.ts',
];

const passthroughArgs = process.argv.slice(2);

if (passthroughArgs.length > 0) {
  // Scoped, developer-driven run (e.g. `npm test -- mrz-extraction`): a
  // single quick invocation is what's expected here, and the three-way
  // split above only exists to make the *full, unattended* suite
  // deterministic. Just forward straight to jest with the ESM flag
  // enabled (needed unconditionally in case the pattern matches one of
  // the dynamic-import specs).
  process.exit(runJest(['--runInBand', ...passthroughArgs], esmEnv));
} else {
  // Exclusion pattern for the third invocation, derived directly from
  // isolatedSpecs (the single source of truth) rather than hand-copied,
  // and anchored to each spec's full path (not just its basename) so it
  // can't accidentally swallow a same-named spec file living elsewhere
  // (e.g. a hypothetical src/server/modules/docs/ocr.service.spec.ts).
  // `[\\/]` matches either path-separator style so this works whether
  // Jest's internal path matching sees `/` or `\`.
  const ignorePattern =
    '(' +
    isolatedSpecs
      .map((spec) => spec.split('/').map(escapeRegExp).join('[\\\\/]'))
      .join('|') +
    ')$';

  const exitCodes = [];
  for (const spec of isolatedSpecs) {
    exitCodes.push(runJest(['--runInBand', spec], esmEnv));
  }
  exitCodes.push(runJest(['--runInBand', '--testPathIgnorePatterns', ignorePattern]));

  const failed = exitCodes.some((code) => code !== 0);
  process.exit(failed ? 1 : 0);
}
