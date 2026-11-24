import { Command, CommanderError } from 'commander';
import { defaultCommands } from './commands/index.js';
import { packageVersion } from './meta.js';
import { CliError, ErrorCode, ExitCode, emitError, emitSuccess, type CommandOutput, type Io } from './output.js';

export interface CommandContext {
  cwd: string;
  json: boolean;
  io: Io;
}

export interface CommandDef {
  /** Single word; nested commands (`brain new`) arrive in chunk 9. */
  name: string;
  description: string;
  /** Add arguments and options. */
  configure?(cmd: Command): void;
  run(ctx: CommandContext, args: string[], opts: Record<string, unknown>): Promise<CommandOutput>;
}

/** `--json` counts only before a `--` terminator. */
function wantsJson(argv: readonly string[]): boolean {
  const end = argv.indexOf('--');
  return (end === -1 ? argv : argv.slice(0, end)).includes('--json');
}

const exitZeroCodes = new Set(['commander.helpDisplayed', 'commander.help', 'commander.version']);

/** Runs one CLI invocation. `argv` is `process.argv.slice(2)`. Returns the exit code. */
export async function main(
  argv: readonly string[],
  io: Io,
  options: { cwd?: string; commands?: readonly CommandDef[] } = {},
): Promise<number> {
  const json = wantsJson(argv);
  const ctx: CommandContext = { cwd: options.cwd ?? process.cwd(), json, io };
  let command: string | null = null;
  let exitCode: number = ExitCode.Ok;

  const fail = (error: CliError): number => {
    emitError(io, json, command, error);
    return error.exitCode;
  };

  if (argv.filter((a) => a !== '--json' && a !== '--').length === 0) {
    return fail(new CliError(ErrorCode.Usage, 'missing command', ExitCode.Usage));
  }

  const program = new Command('brain-mesh')
    .description('Personal and shared AI brains as markdown in git.')
    .version(packageVersion())
    .option('--json', 'print one JSON envelope on stdout')
    .exitOverride()
    .configureOutput({ writeOut: (s) => io.out(s), writeErr: () => {}, outputError: () => {} })
    .hook('preSubcommand', (_root, sub) => {
      command = sub.name();
    });

  for (const def of options.commands ?? defaultCommands) {
    const cmd = program.command(def.name).description(def.description);
    def.configure?.(cmd);
    cmd.action(async (...actionArgs: unknown[]) => {
      const self = actionArgs[actionArgs.length - 1] as Command;
      const output = await def.run(ctx, self.args, self.opts());
      emitSuccess(io, json, def.name, output);
      exitCode = output.exitCode ?? ExitCode.Ok;
    });
  }

  try {
    await program.parseAsync([...argv], { from: 'user' });
    return exitCode;
  } catch (err) {
    if (err instanceof CommanderError) {
      if (exitZeroCodes.has(err.code)) {
        if (err.exitCode === 0) return ExitCode.Ok;
        // commander shows help as an error when no valid command was reached (e.g. `help bogus`)
        return fail(new CliError(ErrorCode.Usage, 'missing or unknown command', ExitCode.Usage));
      }
      return fail(new CliError(ErrorCode.Usage, err.message.replace(/^error: /, ''), ExitCode.Usage));
    }
    if (err instanceof CliError) return fail(err);
    if (process.env.BRAIN_MESH_DEBUG === '1' && err instanceof Error && err.stack) io.err(err.stack + '\n');
    const message = err instanceof Error ? err.message : String(err);
    return fail(new CliError(ErrorCode.Internal, message, ExitCode.Failure));
  }
}
