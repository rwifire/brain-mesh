import { readFileSync } from 'node:fs';

/** This package's version, read from `package.json`. */
export const PKG_VERSION: string = JSON.parse(readFileSync(new URL('../../package.json', import.meta.url), 'utf8')).version;
