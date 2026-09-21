import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';
import { spawnBridge } from './helpers.js';

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
});
