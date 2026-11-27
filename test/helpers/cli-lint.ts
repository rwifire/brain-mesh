import { Command } from 'commander';
import { defaultCommands } from '../../src/commands/index.js';

/** Parses a skill's or agent's `{{cli}} …` call with the real command definition; returns commander's error, or null. */
export function cliCallError(call: string): string | null {
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
