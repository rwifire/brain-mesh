import type { CommandDef } from '../main.js';
import { githubHost } from '../host/github.js';
import type { Host } from '../host/host.js';
import { brainNewCommand, brainPublishCommand } from './brain.js';
import { commitCommandFor } from './commit.js';
import { doctorCommand } from './doctor.js';
import { initCommand } from './init.js';
import { mountCommand, mountsCommand, unmountCommand } from './mount.js';
import { searchCommand } from './search.js';
import { syncCommand } from './sync.js';
import { upgradeCommandFor } from './upgrade.js';
import { versionCommand } from './version.js';
import type { Warm } from '../workspace/warm.js';

/** Every command, with the ones that talk to the git host on `host`. */
export function commandsFor(host: Host, warm?: Warm): readonly CommandDef[] {
  return [
    versionCommand,
    doctorCommand({ host }),
    initCommand({ host, ...(warm === undefined ? {} : { warm }) }),
    commitCommandFor({ host }),
    searchCommand,
    mountCommand({ host }),
    mountsCommand,
    unmountCommand,
    syncCommand,
    brainNewCommand({ host }),
    brainPublishCommand({ host }),
    upgradeCommandFor(),
  ];
}

export const defaultCommands: readonly CommandDef[] = commandsFor(githubHost());
