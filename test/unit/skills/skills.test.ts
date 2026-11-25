import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { Command } from 'commander';
import { parse } from 'yaml';
import { describe, expect, it } from 'vitest';
import { splitFrontmatter } from '../../../src/brain/frontmatter.js';
import { defaultCommands } from '../../../src/commands/index.js';
import { packageCore, readSkills } from '../../../src/render/core.js';
import { createWorkspace } from '../../../src/workspace/create.js';
import { read } from '../../helpers/cli.js';
import { tempDir } from '../../helpers/fixtures.js';

const NAMES = ['ask', 'capture', 'ingest'];

/** Parses a skill's `{{cli}} …` call with the real command definition; returns commander's error, or null. */
function cliCallError(call: string): string | null {
  const tokens = [...call.matchAll(/"[^"]*"|\S+/g)].map((m) => (m[0].startsWith('"') ? 'x' : m[0].replace(/<[^>]*>/g, 'x')));
  const def = defaultCommands.find((c) => c.name === tokens[0]);
  if (def === undefined) return `unknown command ${tokens[0]}`;
  const cmd = new Command(def.name)
    .option('--json')
    .exitOverride()
    .configureOutput({ writeOut: () => {}, writeErr: () => {} });
  def.configure?.(cmd);
  cmd.action(() => {});
  try {
    cmd.parse(tokens.slice(1), { from: 'user' });
    return null;
  } catch (e) {
    return (e as Error).message;
  }
}
const skill = (name: string) => readFile(join(packageCore().skillsDir, name, 'SKILL.md'), 'utf8');
const frontmatter = async (name: string) => parse(splitFrontmatter(await skill(name)).yaml ?? '') as Record<string, unknown>;

describe('core skills', () => {
  it('the core ships capture, ingest and ask', async () => {
    const r = await readSkills(packageCore().skillsDir, 'core');
    expect(r.problems).toEqual([]);
    expect(r.skills.map((s) => s.name)).toEqual(NAMES);
  });

  it('descriptions say when to use the skill', async () => {
    for (const n of NAMES) {
      const d = (await frontmatter(n)).description as string;
      expect(d.length, n).toBeLessThanOrEqual(1024);
      expect(d, n).toContain('Use when');
    }
  });

  it('every CLI call in a skill names a real command', async () => {
    const commands = new Set(defaultCommands.map((c) => c.name));
    for (const n of NAMES) {
      const text = await skill(n);
      const calls = [...text.matchAll(/\{\{cli\}\} ([a-z-]+)/g)];
      expect(calls.length, n).toBeGreaterThan(0);
      for (const c of calls) expect(commands, `${n}: ${c[0]}`).toContain(c[1]);
      for (const line of text.split('\n').filter((l) => l.includes('{{cli}} '))) expect(line, n).toContain('--json');
    }
  });

  it('every CLI call in a skill parses with the command\'s real options and arguments', async () => {
    expect(cliCallError('search "x" --brains personal --json')).toMatch(/unknown option/);
    expect(cliCallError('commit "x" --json')).toMatch(/-m/);
    for (const n of NAMES) {
      for (const [, call] of (await skill(n)).matchAll(/`\{\{cli\}\} ([^`]+)`/g)) {
        expect(cliCallError(call!), `${n}: ${call}`).toBeNull();
      }
    }
  });

  it('capture commits, ingest checks and commits, ask searches', async () => {
    expect(await skill('capture')).toContain('{{cli}} commit');
    const ingest = await skill('ingest');
    for (const s of ['{{cli}} search', '{{cli}} doctor personal --fix --json', '{{cli}} commit']) expect(ingest).toContain(s);
    const ask = await skill('ask');
    expect(ask).toContain('{{cli}} search');
    expect(ask).not.toContain('{{cli}} commit');
  });

  it('ingest removes the inbox item as a plain file and leaves staging to commit', async () => {
    const ingest = await skill('ingest');
    expect(ingest).toContain('`rm <path>` in a POSIX shell');
    expect(ingest).toContain('not `git rm`');
    expect(ingest).toContain('`mv <path> <target>`');
  });

  it('ingest moves or deletes the inbox item before doctor checks the brain', async () => {
    const ingest = await skill('ingest');
    expect(ingest.indexOf('Delete the inbox item')).toBeGreaterThan(-1);
    expect(ingest.indexOf('Delete the inbox item')).toBeLessThan(ingest.indexOf('{{cli}} doctor personal'));
    expect(ingest.indexOf('{{cli}} doctor personal')).toBeLessThan(ingest.indexOf('{{cli}} commit'));
  });

  it('search guidance asks for a few words and a retry with fewer', async () => {
    for (const n of ['ask', 'ingest']) expect(await skill(n), n).toContain('2–4 distinctive words');
  });

  it('rendered for Claude with the pin filled', async () => {
    const root = await tempDir('bm skills ');
    await createWorkspace(root, { user: 'octo-user', pin: '0.4.2' });
    const text = await read(root, '.claude/skills/ask/SKILL.md');
    expect(text).toContain('npx -y brain-mesh-ai-workspace@0.4.2 search');
    expect(text).not.toContain('{{');
    for (const n of NAMES) expect(await read(root, `.github/skills/${n}/SKILL.md`)).not.toContain('{{');
  });

  it('no skill pre-approves the shell', async () => {
    for (const n of NAMES) expect(Object.keys(await frontmatter(n)), n).not.toContain('allowed-tools');
  });
});
