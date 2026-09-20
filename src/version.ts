import { readFileSync } from 'node:fs';

/**
 * The version printed by `--version`, read from the package manifest that ships
 * beside `dist/`. One number, one source: no constant to forget to bump.
 */
export function packageVersion(): string {
    for (const relative of ['../package.json', '../../package.json']) {
        try {
            const raw = readFileSync(new URL(relative, import.meta.url), 'utf8');
            const parsed: unknown = JSON.parse(raw);
            if (parsed !== null && typeof parsed === 'object') {
                const { name, version } = parsed as { name?: unknown; version?: unknown };
                if (name === 'viafrei' && typeof version === 'string') {
                    return version;
                }
            }
        } catch {
            // Try the next candidate.
        }
    }
    return '0.0.0-unknown';
}
