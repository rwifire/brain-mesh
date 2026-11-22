import type { Io } from '../../src/output.js';

/** An Io that collects everything written to stdout and stderr. */
export function captureIo(): Io & { stdout(): string; stderr(): string } {
  let out = '';
  let err = '';
  return {
    out: (text) => { out += text; },
    err: (text) => { err += text; },
    stdout: () => out,
    stderr: () => err,
  };
}
