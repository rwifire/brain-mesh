import type { CommandDef } from '../main.js';
import { doctorCommand } from './doctor.js';
import { versionCommand } from './version.js';

export const defaultCommands: readonly CommandDef[] = [versionCommand, doctorCommand];
