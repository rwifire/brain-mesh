import { CHECKS, type CheckCode, type Severity } from './codes.js';

export interface Finding {
  code: CheckCode;
  severity: Severity;
  /** Brain id, or null for workspace-level findings. */
  brain: string | null;
  /** Workspace-relative POSIX path. */
  path: string | null;
  line?: number;
  message: string;
}

export function finding(
  code: CheckCode,
  f: { brain: string | null; path: string | null; line?: number; message: string },
): Finding {
  const out: Finding = { code, severity: CHECKS[code].severity, brain: f.brain, path: f.path, message: f.message };
  if (f.line !== undefined) out.line = f.line;
  return out;
}

const cmp = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0);

/** By path (null last), then line (missing = 0), then code. */
export function sortFindings(findings: Finding[]): Finding[] {
  return [...findings].sort((a, b) => {
    if (a.path !== b.path) {
      if (a.path === null) return 1;
      if (b.path === null) return -1;
      return cmp(a.path, b.path);
    }
    const line = (a.line ?? 0) - (b.line ?? 0);
    return line !== 0 ? line : cmp(a.code, b.code);
  });
}
