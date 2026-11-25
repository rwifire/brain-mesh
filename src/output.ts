/**
 * The CLI output contract. In JSON mode stdout carries exactly one envelope line
 * and stderr stays empty; in human mode text goes to stdout, warnings and errors to stderr.
 */

export const ErrorCode = {
  Usage: 'E_USAGE',
  Internal: 'E_INTERNAL',
  NoWorkspace: 'E_NO_WORKSPACE',
  UnknownBrain: 'E_UNKNOWN_BRAIN',
  GhMissing: 'E_GH_MISSING',
  GhAuth: 'E_GH_AUTH',
  RepoCreate: 'E_REPO_CREATE',
  Git: 'E_GIT',
  NotEmpty: 'E_NOT_EMPTY',
  NotSupported: 'E_NOT_SUPPORTED',
  RemoteNotEmpty: 'E_REMOTE_NOT_EMPTY',
  SyncConflict: 'E_SYNC_CONFLICT',
  Offline: 'E_OFFLINE',
  Host: 'E_HOST',
  PrCreate: 'E_PR_CREATE',
} as const;
export type ErrorCode = (typeof ErrorCode)[keyof typeof ErrorCode];

export const ExitCode = { Ok: 0, Failure: 1, Usage: 2 } as const;

export interface Warning {
  code: string;
  message: string;
}

export interface CommandOutput<T = unknown> {
  data: T;
  text: string;
  warnings?: Warning[];
  /** Exit code for a command that ran but found problems (e.g. doctor errors); defaults to 0. */
  exitCode?: number;
}

export interface SuccessEnvelope<T = unknown> {
  ok: true;
  command: string;
  data: T;
  warnings: Warning[];
}

export interface ErrorEnvelope {
  ok: false;
  command: string | null;
  error: { code: string; message: string };
}

export class CliError extends Error {
  constructor(
    readonly code: string,
    message: string,
    readonly exitCode: number = ExitCode.Failure,
  ) {
    super(message);
    this.name = 'CliError';
  }
}

export interface Io {
  out(text: string): void;
  err(text: string): void;
}

export function emitSuccess(io: Io, json: boolean, command: string, output: CommandOutput): void {
  const warnings = output.warnings ?? [];
  if (json) {
    const envelope: SuccessEnvelope = { ok: true, command, data: output.data, warnings };
    io.out(JSON.stringify(envelope) + '\n');
    return;
  }
  io.out(output.text + '\n');
  for (const w of warnings) io.err(`brain-mesh: warning: ${w.message}\n`);
}

export function emitError(io: Io, json: boolean, command: string | null, error: CliError): void {
  if (json) {
    const envelope: ErrorEnvelope = { ok: false, command, error: { code: error.code, message: error.message } };
    io.out(JSON.stringify(envelope) + '\n');
    return;
  }
  io.err(`brain-mesh: error: ${error.message}\n`);
}
