import { readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { main } from '../../src/main.js';
import { captureIo } from './io.js';

/** Runs the CLI in-process. */
export const run = async (argv: string[], cwd: string) => {
  const io = captureIo();
  const code = await main(argv, io, { cwd });
  return { code, out: io.stdout(), err: io.stderr(), json: () => JSON.parse(io.stdout()) };
};
export const read = (root: string, rel: string) => readFile(join(root, ...rel.split('/')), 'utf8');
export const write = (root: string, rel: string, text: string) => writeFile(join(root, ...rel.split('/')), text, 'utf8');
