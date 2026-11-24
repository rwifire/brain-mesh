import { stringify } from 'yaml';
import type { AbstractTool, AgentSource, SkillSource } from './core.js';

/** Replaces every `{{cli}}`; any other `{{…}}` (e.g. Obsidian template syntax) is left alone. */
export function fill(text: string, cli: string): string {
  return text.replaceAll('{{cli}}', cli);
}

/** A skill's files for a client folder: `SKILL.md` filled, every other file byte for byte. */
export function skillFiles(s: SkillSource, cli: string): Map<string, Buffer> {
  const out = new Map<string, Buffer>();
  for (const [path, bytes] of s.files) {
    out.set(path, path === 'SKILL.md' ? Buffer.from(fill(bytes.toString('utf8'), cli), 'utf8') : bytes);
  }
  return out;
}

const CLAUDE_TOOLS: Record<AbstractTool, string[]> = {
  read: ['Read'],
  search: ['Grep', 'Glob'],
  edit: ['Edit', 'Write'],
  execute: ['Bash'],
};

function agentFile(frontmatter: Record<string, unknown>, body: string): string {
  return `---\n${stringify(frontmatter, { lineWidth: 0 })}---\n${body}`;
}

/** `.claude/agents/<n>.md`. */
export function claudeAgent(a: AgentSource, cli: string): string {
  const tools = a.tools.flatMap((t) => CLAUDE_TOOLS[t]).join(', ');
  return agentFile({ name: a.name, description: a.description, tools }, fill(a.body, cli));
}

/** `.github/agents/<n>.agent.md`. */
export function copilotAgent(a: AgentSource, cli: string): string {
  return agentFile({ name: a.name, description: a.description, tools: [...a.tools] }, fill(a.body, cli));
}
