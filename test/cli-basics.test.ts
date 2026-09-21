import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, realpathSync, rmSync, symlinkSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';
import { CLI_PATH, spawnBridge } from './helpers.js';

const manifest = JSON.parse(readFileSync(fileURLToPath(new URL('../../package.json', import.meta.url)), 'utf8')) as {
    version: string;
    bin: Record<string, string>;
};

describe('the command itself', () => {
    it('prints the package version and exits 0', async t => {
        const bridge = spawnBridge(['--version'], {}, t);
        assert.equal(await bridge.exited, 0);
        assert.equal(bridge.stdout().trim(), manifest.version);
        assert.equal(bridge.stderr(), '');
    });

    it('prints help on stdout, not stderr, and exits 0', async t => {
        const bridge = spawnBridge(['--help'], {}, t);
        assert.equal(await bridge.exited, 0);
        assert.match(bridge.stdout(), /Usage:/u);
        assert.match(bridge.stdout(), /--url/u);
        assert.equal(bridge.stderr(), '');
    });

    it('is the file package.json points `viafrei` at', () => {
        assert.equal(manifest.bin['viafrei'], 'dist/cli.js');
    });

    /**
     * Every other test here starts the CLI by its real path. Nobody does that:
     * npm installs the `bin` as a symlink (`node_modules/.bin/viafrei`), and
     * `npx viafrei` and every MCP client run THAT. The difference is not
     * cosmetic - Node hands a module its resolved URL while `argv[1]` stays the
     * link, so an entry-point check that compares the two unresolved decides it
     * was imported, runs nothing and exits 0 with no output at all. A suite that
     * only ever spawns the real path cannot see it, which is how it shipped this
     * far. This spawns the artefact the way it is installed.
     */
    it('runs when started through the bin symlink, the way npm installs it', async t => {
        const directory = mkdtempSync(join(realpathSync(tmpdir()), 'viafrei-bin-'));
        const link = join(directory, 'viafrei');
        symlinkSync(CLI_PATH, link);
        t.after(() => {
            rmSync(directory, { recursive: true, force: true });
        });

        const bridge = spawnBridge(['--version'], {}, t, link);
        assert.equal(await bridge.exited, 0);
        assert.equal(bridge.stdout().trim(), manifest.version);
        assert.equal(bridge.stderr(), '');
    });
});
