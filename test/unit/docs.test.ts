import { readdir, readFile, stat } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const ROOT = fileURLToPath(new URL('../..', import.meta.url));
const exists = (p: string) => stat(p).then(() => true, () => false);

/** README.md and every docs/*.md, as [path, text]. */
async function docs(): Promise<[string, string][]> {
  const files = ['README.md', ...(await readdir(join(ROOT, 'docs'))).filter((f) => f.endsWith('.md')).map((f) => `docs/${f}`)];
  return Promise.all(files.map(async (f) => [f, await readFile(join(ROOT, f), 'utf8')] as [string, string]));
}

/** The text outside code blocks and inline code (link examples are not links). */
const prose = (text: string) => text.replace(/^```[\s\S]*?^```/gm, '').replace(/`[^`\n]*`/g, '');

describe('docs', () => {
  it('docs links resolve', async () => {
    const broken: string[] = [];
    for (const [file, text] of await docs()) {
      for (const m of prose(text).matchAll(/\]\(([^)\s]+)\)/g)) {
        const target = m[1]!.split('#')[0]!;
        if (target === '' || /^[a-z]+:/i.test(target)) continue;
        if (!(await exists(resolve(ROOT, dirname(file), decodeURIComponent(target))))) broken.push(`${file}: ${m[1]}`);
      }
    }
    expect(broken).toEqual([]);
  });

  it('getting started covers the requirements', async () => {
    const text = await readFile(join(ROOT, 'docs', 'getting-started.md'), 'utf8');
    for (const s of ['22.12', 'gh auth login', 'npx.cmd', '--remote', 'upgrade --dry-run', 'E_PIN_MISMATCH']) expect(text, s).toContain(s);
  });

  it('auto-approve rules are pinned to the package', async () => {
    const text = await readFile(join(ROOT, 'docs', 'getting-started.md'), 'utf8');
    const rules = text.split('\n').filter((l) => /Bash\(|PowerShell\(|"\/\^npx/.test(l) && l.includes('brain-mesh-ai-workspace'));
    expect(rules.length).toBeGreaterThanOrEqual(3);
    for (const l of rules) expect(l).toContain('brain-mesh-ai-workspace@');
    // Claude Code: `:*` needs a space before it, so the wildcard follows the `@` directly.
    for (const l of rules.filter((x) => /Bash\(|PowerShell\(/.test(x))) expect(l).toContain('brain-mesh-ai-workspace@*)');
    for (const r of ['"Bash(npx -y', '"PowerShell(npx -y', '"PowerShell(npx.cmd -y']) expect(rules.some((l) => l.includes(r)), r).toBe(true);
  });

  it('claude code rules need a trusted folder', async () => {
    const text = await readFile(join(ROOT, 'docs', 'getting-started.md'), 'utf8');
    const approve = text.slice(text.indexOf('## 4.'), text.indexOf('## 5.'));
    expect(approve).toMatch(/trust dialog/i);
  });

  it('other machines sync before init after an upgrade', async () => {
    const text = await readFile(join(ROOT, 'docs', 'getting-started.md'), 'utf8');
    const upgrading = text.slice(text.indexOf('## 9. Upgrading'), text.indexOf('## 10.'));
    expect(upgrading).toMatch(/other machines?[^\n]*`sync`[^\n]*then[^\n]*`init`/i);
  });
});
