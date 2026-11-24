import { describe, expect, it } from 'vitest';
import { main, type CommandDef } from '../../src/main.js';
import { CliError } from '../../src/output.js';
import { captureIo } from '../helpers/io.js';

const run = async (argv: string[], commands?: CommandDef[]) => {
  const io = captureIo();
  const code = await main(argv, io, { cwd: process.cwd(), commands });
  return { code, out: io.stdout(), err: io.stderr() };
};
const envelope = (out: string) => {
  expect(out.endsWith('\n')).toBe(true);
  expect(out.trimEnd().includes('\n')).toBe(false);
  return JSON.parse(out);
};
const versionData = { version: '0.0.0', node: process.version, platform: process.platform };

describe('main', () => {
  it("a command's exitCode is returned with an ok envelope", async () => {
    const stub: CommandDef = { name: 'stub', description: 'stub', run: async () => ({ data: 1, text: '', exitCode: 1 }) };
    const r = await run(['stub', '--json'], [stub]);
    expect(r.code).toBe(1);
    expect(envelope(r.out)).toMatchObject({ ok: true, command: 'stub', data: 1 });
  });

  it('version --json prints one success envelope', async () => {
    const r = await run(['version', '--json']);
    expect(r.code).toBe(0);
    expect(envelope(r.out)).toEqual({ ok: true, command: 'version', data: versionData, warnings: [] });
    expect(r.err).toBe('');
  });

  it('--json before the command works the same', async () => {
    const r = await run(['--json', 'version']);
    expect(envelope(r.out)).toEqual({ ok: true, command: 'version', data: versionData, warnings: [] });
  });

  it('version without --json prints text', async () => {
    const r = await run(['version']);
    expect(r).toEqual({ code: 0, out: 'brain-mesh 0.0.0\n', err: '' });
  });

  it('unknown command in json mode is a usage envelope', async () => {
    const r = await run(['nope', '--json']);
    expect(r.code).toBe(2);
    const e = envelope(r.out);
    expect(e).toMatchObject({ ok: false, command: null, error: { code: 'E_USAGE' } });
    expect(e.error.message).toContain('nope');
    expect(e.error.message.startsWith('error:')).toBe(false);
    expect(r.err).toBe('');
  });

  it('unknown option names the command it belongs to', async () => {
    const r = await run(['version', '--bogus', '--json']);
    expect(r.code).toBe(2);
    expect(envelope(r.out)).toMatchObject({ ok: false, command: 'version', error: { code: 'E_USAGE' } });
  });

  it('missing command is a usage error', async () => {
    const r = await run(['--json']);
    expect(r.code).toBe(2);
    expect(envelope(r.out)).toMatchObject({
      ok: false, command: null, error: { code: 'E_USAGE', message: 'missing command' },
    });
  });

  it('usage error without --json goes to stderr as one line', async () => {
    const r = await run(['nope']);
    expect(r.code).toBe(2);
    expect(r.out).toBe('');
    expect(r.err).toMatch(/^brain-mesh: error: .*nope.*\n$/);
  });

  it('json after -- is not the flag', async () => {
    const echo: CommandDef = {
      name: 'echo', description: 'test', configure: (c) => c.argument('[rest...]'),
      run: async (_ctx, args) => ({ data: args, text: String(args) }),
    };
    const r = await run(['echo', '--', '--json'], [echo]);
    expect(r.code).toBe(0);
    expect(r.out).not.toContain('"ok"');
  });

  it('a thrown error becomes E_INTERNAL', async () => {
    const boom: CommandDef = { name: 'boom', description: 'test', run: async () => { throw new Error('kaputt'); } };
    const r = await run(['boom', '--json'], [boom]);
    expect(r.code).toBe(1);
    expect(envelope(r.out)).toEqual({ ok: false, command: 'boom', error: { code: 'E_INTERNAL', message: 'kaputt' } });
  });

  it('a CliError keeps its code and exit code', async () => {
    const fail: CommandDef = { name: 'fail', description: 'test', run: async () => { throw new CliError('E_TEST', 'nein', 3); } };
    const r = await run(['fail', '--json'], [fail]);
    expect(r.code).toBe(3);
    expect(envelope(r.out).error).toEqual({ code: 'E_TEST', message: 'nein' });
  });

  it('warnings go into the envelope in json mode and to stderr otherwise', async () => {
    const warn: CommandDef = {
      name: 'warn', description: 'test',
      run: async () => ({ data: null, text: 'done', warnings: [{ code: 'W_TEST', message: 'careful' }] }),
    };
    expect(envelope((await run(['warn', '--json'], [warn])).out).warnings).toEqual([{ code: 'W_TEST', message: 'careful' }]);
    const human = await run(['warn'], [warn]);
    expect(human).toEqual({ code: 0, out: 'done\n', err: 'brain-mesh: warning: careful\n' });
  });

  it('a bare -- is a missing command', async () => {
    const r = await run(['--json', '--']);
    expect(r.code).toBe(2);
    expect(envelope(r.out)).toMatchObject({ ok: false, error: { code: 'E_USAGE', message: 'missing command' } });
  });

  it('help for an unknown command is a usage error', async () => {
    const r = await run(['--json', 'help', 'bogus']);
    expect(r.code).toBe(2);
    expect(envelope(r.out)).toMatchObject({ ok: false, error: { code: 'E_USAGE' } });
    expect(r.err).toBe('');
  });

  it('help for a known command exits 0 and writes to stdout', async () => {
    const r = await run(['help', 'version']);
    expect(r.code).toBe(0);
    expect(r.out).toContain('print the brain-mesh version');
  });

  it('--help exits 0 and writes to stdout', async () => {
    const r = await run(['--help']);
    expect(r.code).toBe(0);
    expect(r.out).toContain('version');
    expect(r.err).toBe('');
  });
});
