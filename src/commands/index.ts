import type { CommandDef } from '../main.js';
import { githubHost } from '../host/github.js';
import { commitCommand } from './commit.js';
import { doctorCommand } from './doctor.js';
import { initCommand } from './init.js';
import { searchCommand } from './search.js';
import { versionCommand } from './version.js';

export const defaultCommands: readonly CommandDef[] = [versionCommand, doctorCommand, initCommand({ host: githubHost() }), commitCommand, searchCommand];
