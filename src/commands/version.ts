import type { CommandDef } from '../main.js';
import { packageVersion } from '../meta.js';

export interface VersionData {
  version: string;
  node: string;
  platform: string;
}

export const versionCommand: CommandDef = {
  name: 'version',
  description: 'print the brain-mesh version',
  run: async () => {
    const data: VersionData = { version: packageVersion(), node: process.version, platform: process.platform };
    return { data, text: `brain-mesh ${data.version}` };
  },
};
