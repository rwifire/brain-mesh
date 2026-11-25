import { readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { defaultCommands } from '../../src/commands/index.js';
import { doctorCommand } from '../../src/commands/doctor.js';
import { main, type CommandDef } from '../../src/main.js';
import { fakeHost } from './host.js';
import { captureIo } from './io.js';

/** The real commands, with `doctor` on a fake host (write access, every owner valid) so no test reaches real gh. */
export const testCommands = (): readonly CommandDef[] =>
  defaultCommands.map((c) => (c.name === 'doctor' ? doctorCommand({ host: fakeHost() }) : c));

/** Runs the CLI in-process; `commands` defaults to `testCommands()`. */
export const run = async (argv: string[], cwd: string, commands?: readonly CommandDef[]) => {
  const io = captureIo();
  const code = await main(argv, io, { cwd, commands: commands ?? testCommands() });
  return { code, out: io.stdout(), err: io.stderr(), json: () => JSON.parse(io.stdout()) };
};
export const read = (root: string, rel: string) => readFile(join(root, ...rel.split('/')), 'utf8');
export const write = (root: string, rel: string, text: string) => writeFile(join(root, ...rel.split('/')), text, 'utf8');
