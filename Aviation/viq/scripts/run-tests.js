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
// services), route it through its own invocation here too rather than
// letting it share a process with mrz-extraction.spec.ts or
// ocr.service.spec.ts.
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
  if (result.status !== 0) {
    process.exit(result.status ?? 1);
  }
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
  runJest(['--runInBand', ...passthroughArgs], esmEnv);
} else {
  for (const spec of isolatedSpecs) {
    runJest(['--runInBand', spec], esmEnv);
  }

  runJest([
    '--runInBand',
    '--testPathIgnorePatterns',
    '/(mrz-extraction|ocr\\.service)\\.spec\\.ts$',
  ]);
}
