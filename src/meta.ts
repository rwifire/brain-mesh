import { readFileSync } from 'node:fs';

let cached: string | undefined;

/** Version of this package, read from package.json one level above `src/` or `dist/`. */
export function packageVersion(): string {
  cached ??= (JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8')) as { version: string }).version;
  return cached;
}
