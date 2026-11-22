import type { CommandDef } from '../main.js';
import { versionCommand } from './version.js';

export const defaultCommands: readonly CommandDef[] = [versionCommand];
