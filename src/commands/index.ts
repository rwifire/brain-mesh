import type { CommandDef } from '../main.js';
import { githubHost } from '../host/github.js';
import type { Host } from '../host/host.js';
import { commitCommand } from './commit.js';
import { doctorCommand } from './doctor.js';
import { initCommand } from './init.js';
import { mountCommand, mountsCommand, unmountCommand } from './mount.js';
import { searchCommand } from './search.js';
import { versionCommand } from './version.js';

/** Every command, with the ones that talk to the git host on `host`. */
export function commandsFor(host: Host): readonly CommandDef[] {
  return [
    versionCommand,
    doctorCommand({ host }),
    initCommand({ host }),
    commitCommand,
    searchCommand,
    mountCommand({ host }),
    mountsCommand,
    unmountCommand,
  ];
}

export const defaultCommands: readonly CommandDef[] = commandsFor(githubHost());
