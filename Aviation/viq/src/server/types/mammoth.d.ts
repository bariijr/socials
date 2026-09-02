// mammoth ships no TypeScript types and no @types/mammoth package exists.
// Minimal surface for the one function this project calls.
declare module 'mammoth' {
  export function extractRawText(input: { buffer: Buffer } | { path: string }): Promise<{ value: string; messages: unknown[] }>;
}
