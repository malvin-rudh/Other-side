// Local-only .env loader for the dev server. Reads KEY=VALUE lines from the
// repo-root .env (gitignored) into process.env before config is built. Never
// prints values; variables already set in the real environment always win.
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const DEFAULT_ENV_FILE = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '.env');

export function loadEnvFile(file: string = DEFAULT_ENV_FILE): void {
  if (!existsSync(file)) return;
  for (const line of readFileSync(file, 'utf8').split(/\r?\n/)) {
    const trimmed = line.trim();
    if (trimmed === '' || trimmed.startsWith('#')) continue;
    const eq = trimmed.indexOf('=');
    if (eq <= 0) continue;
    const key = trimmed.slice(0, eq).trim();
    let value = trimmed.slice(eq + 1).trim();
    if (value.length >= 2 && value.startsWith('"') && value.endsWith('"')) {
      value = value.slice(1, -1);
    } else if (value.length >= 2 && value.startsWith("'") && value.endsWith("'")) {
      value = value.slice(1, -1);
    }
    if (key === '' || process.env[key] !== undefined) continue;
    process.env[key] = value;
  }
}
