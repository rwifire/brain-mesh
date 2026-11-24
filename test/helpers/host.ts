import type { Host } from '../../src/host/host.js';
import type { CliError } from '../../src/output.js';

/** A host that answers from memory; `created` lists the repo names it was asked to create. */
export function fakeHost(
  o: { login?: string; repoUrl?: string; loginError?: CliError; createError?: CliError } = {},
): Host & { created: string[] } {
  const created: string[] = [];
  return {
    created,
    async login() {
      if (o.loginError) throw o.loginError;
      return o.login ?? 'octo-user';
    },
    async createPrivateRepo(name) {
      if (o.createError) throw o.createError;
      created.push(name);
      return o.repoUrl ?? `https://github.com/${o.login ?? 'octo-user'}/${name}.git`;
    },
  };
}
