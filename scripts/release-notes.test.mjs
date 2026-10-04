#!/usr/bin/env node
/**
 * The release-notes extractor's self-test. Hermetic: fixture CHANGELOGs in memory and
 * in a throwaway directory, no network, no git.
 *
 * Pinned: a block is found and stops at the next level-2 heading; a missing block and
 * an empty one (blank, or headings only) FAIL naming the tag; the last block in the file
 * stops before the trailing link references; a block's `###` sub-sections stay inside
 * it; a version that is a prefix of another (1.7.1 vs 1.7.10) never picks up the other
 * in either direction; the title is the first bold lead; Latest is decided numerically;
 * and the CLI's exit codes keep "the CHANGELOG cannot back a page" (1) apart from
 * "could not run" (2) — and the real CHANGELOG yields a page for the manifest version.
 *
 *   node scripts/release-notes.test.mjs
 */
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { createChecker } from './check-harness.mjs';
import { NotesError, compareSemver, extractBlock, isHighest, releaseNotes, titleFor } from './release-notes.mjs';
import { nodePath, runTool } from './tools.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, '..');
const SCRIPT = join(HERE, 'release-notes.mjs');
const { check, failures, passed } = createChecker();

const FIXTURE = `# Changelog

## [Unreleased]

### Changed

- **Not yet released.** Nothing here may reach a page.

## [1.7.10] - 2026-11-01

**Ten, not one.** The block whose number starts with 1.7.1.

## [1.7.1] - 2026-10-05

**A small fix.** Only the one.

### Added

- **A thing** that was added.

### Fixed

- **\`a_tool\` answers again:** it had stopped.

## [1.7.0] - 2026-10-04

## [1.6.9] - 2026-10-03

### Changed

## [0.0.9] - 2026-09-21

- **The first one.** The oldest block, last in the file.

[1.7.10]: https://github.com/example/repo/releases/tag/v1.7.10
[0.0.9]: https://github.com/example/repo/releases/tag/v0.0.9
`;

/** The NotesError message `fn` throws, or null when it throws nothing (or something else). */
function refusal(fn) {
    try {
        fn();
        return null;
    } catch (error) {
        return error instanceof NotesError ? error.message : `not a NotesError: ${error}`;
    }
}

// --- the block -------------------------------------------------------------------------

const b171 = extractBlock(FIXTURE, '1.7.1');
check('block found: it starts at the first line after the heading', b171.startsWith('**A small fix.**'), b171.split('\n')[0]);
check('block found: it stops before the next level-2 heading', !b171.includes('1.7.0') && !b171.split('\n').some((l) => l.startsWith('## ')), b171);

check('a block with sub-sections keeps every ### heading and its items',
    b171.includes('### Added') && b171.includes('- **A thing**') && b171.includes('### Fixed') && b171.endsWith('it had stopped.'), b171);

check('prefix: 1.7.1 does not pick up 1.7.10', !b171.includes('Ten, not one'), b171);
const b1710 = extractBlock(FIXTURE, '1.7.10');
check('prefix: 1.7.10 is its own block and does not run into 1.7.1', b1710 === '**Ten, not one.** The block whose number starts with 1.7.1.', b1710);
check('prefix: 1.7 alone (not a version heading) is missing, not 1.7.0 or 1.7.1', refusal(() => extractBlock(FIXTURE, '1.7')) !== null);

const last = extractBlock(FIXTURE, '0.0.9');
check('the last block in the file stops before the trailing link references',
    last === '- **The first one.** The oldest block, last in the file.', JSON.stringify(last));

const missing = refusal(() => extractBlock(FIXTURE, '2.0.0'));
check('a missing block FAILS and names the tag', missing !== null && missing.startsWith('v2.0.0:') && missing.includes('no "## [2.0.0]" block'), missing ?? 'no refusal');

const empty = refusal(() => extractBlock(FIXTURE, '1.7.0'));
check('an empty block FAILS and names the tag', empty !== null && empty.startsWith('v1.7.0:') && empty.includes('empty'), empty ?? 'no refusal');
const headingsOnly = refusal(() => extractBlock(FIXTURE, '1.6.9'));
check('a block holding only a sub-section heading counts as empty', headingsOnly !== null && headingsOnly.includes('empty'), headingsOnly ?? 'no refusal');

const fenced = '## [1.0.0] - 2026-01-01\n\n**Code.** Below:\n\n```\n## not a heading\n```\n\nAfter.\n\n## [0.9.0] - 2025-12-01\n\n**Old.**\n';
const bf = extractBlock(fenced, '1.0.0');
check('a "## " line inside a code fence does not end the block', bf.includes('## not a heading') && bf.endsWith('After.'), bf);

const yanked = '## [1.3.10] - 2026-09-23 [YANKED]\n\n**Withdrawn.** Use the next one.\n';
check('a heading with a suffix after the date is still found', extractBlock(yanked, '1.3.10') === '**Withdrawn.** Use the next one.');

const crlf = '## [1.0.0] - 2026-01-01\r\n\r\n**Windows.** Line endings.\r\n';
check('CRLF line endings are read', extractBlock(crlf, '1.0.0') === '**Windows.** Line endings.');

// --- the title -------------------------------------------------------------------------

check('title: the first bold lead, trailing period dropped', titleFor(b171, '1.7.1') === 'viafrei v1.7.1 — A small fix', titleFor(b171, '1.7.1'));
check('title: a bold lead in a list item, backticks and colon dropped',
    titleFor('Some prose first.\n\n- **`a_tool` answers again:** it had stopped.', '1.0.0') === 'viafrei v1.0.0 — a_tool answers again',
    titleFor('Some prose first.\n\n- **`a_tool` answers again:** it had stopped.', '1.0.0'));
check('title: bold in the middle of a line is not a lead',
    titleFor('Prose with **inline bold** in it.\n\n**The lead.**', '1.0.0') === 'viafrei v1.0.0 — The lead');
const noLead = refusal(() => titleFor('Plain prose only.\n\n### Added\n\n- a thing', '1.0.0'));
check('title: a block with no bold lead FAILS and names the tag', noLead !== null && noLead.startsWith('v1.0.0:') && noLead.includes('no bold lead'), noLead ?? 'no refusal');

// --- Latest ----------------------------------------------------------------------------

check('semver is numeric: 1.7.10 > 1.7.9', compareSemver('1.7.10', '1.7.9') > 0);
check('Latest: the highest tag is latest', isHighest('1.7.10', ['v1.7.9', 'v1.7.10', 'v0.0.9']) === true);
check('Latest: a lower tag is not, even when it sorts higher as a string', isHighest('1.7.9', ['v1.7.9', 'v1.7.10']) === false);
check('Latest: other tag shapes are ignored', isHighest('1.7.0', ['v1.7.0', 'v2.0.0-rc.1', 'smithery-9', 'v9']) === true);
check('releaseNotes: body, title and latest together',
    JSON.stringify(releaseNotes(FIXTURE, '1.7.10', ['v1.7.10', 'v1.7.1'])) ===
    JSON.stringify({ body: b1710, title: 'viafrei v1.7.10 — Ten, not one', latest: true }));

// --- the CLI ---------------------------------------------------------------------------

const dir = mkdtempSync(join(tmpdir(), 'release-notes-'));
function cli(args) {
    try {
        const out = runTool(nodePath(), [SCRIPT, ...args], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
        return { status: 0, out };
    } catch (error) {
        return { status: error.status ?? -1, out: `${error.stdout ?? ''}${error.stderr ?? ''}` };
    }
}
try {
    const changelog = join(dir, 'CHANGELOG.md');
    const tags = join(dir, 'tags');
    const body = join(dir, 'body.md');
    writeFileSync(changelog, FIXTURE);
    writeFileSync(tags, 'v1.7.10\nv1.7.1\nv0.0.9\n');

    const ok = cli(['1.7.1', changelog, tags, body]);
    check('CLI: exit 0, title and latest on stdout', ok.status === 0 && ok.out.includes('title=viafrei v1.7.1 — A small fix\n') && ok.out.includes('latest=false\n'), ok.out);
    check('CLI: the body file is the block', readFileSync(body, 'utf8') === `${b171}\n`);

    const miss = cli(['2.0.0', changelog, join(dir, 'tags2'), body]);
    check('CLI: an unreadable tag list is exit 2', miss.status === 2, `${miss.status} ${miss.out}`);
    writeFileSync(join(dir, 'tags2'), 'v2.0.0\n');
    const noBlock = cli(['2.0.0', changelog, join(dir, 'tags2'), join(dir, 'never.md')]);
    check('CLI: a missing block is exit 1, names the tag, and writes no body',
        noBlock.status === 1 && noBlock.out.includes('v2.0.0') && !existsSync(join(dir, 'never.md')), `${noBlock.status} ${noBlock.out}`);
    writeFileSync(join(dir, 'tags3'), 'v1.7.0\n');
    const emptyCli = cli(['1.7.0', changelog, join(dir, 'tags3'), body]);
    check('CLI: an empty block is exit 1 naming the tag', emptyCli.status === 1 && emptyCli.out.includes('v1.7.0'), `${emptyCli.status} ${emptyCli.out}`);
    check('CLI: a v-prefixed version is a usage error (2)', cli(['v1.7.1', changelog, tags, body]).status === 2);
    check('CLI: a tag list without the tag is a usage error (2)', cli(['1.7.1', changelog, join(dir, 'tags2'), body]).status === 2);
    check('CLI: a missing argument is a usage error (2)', cli(['1.7.1', changelog, tags]).status === 2);

    // The real CHANGELOG must be able to back a page for the version this tree carries.
    const version = JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf8')).version;
    writeFileSync(tags, `v${version}\n`);
    const real = cli([version, join(ROOT, 'CHANGELOG.md'), tags, body]);
    check(`CLI: the repository CHANGELOG backs a page for ${version}`, real.status === 0 && real.out.startsWith(`title=viafrei v${version} — `), real.out);
} finally {
    rmSync(dir, { recursive: true, force: true });
}

console.log(`\nrelease-notes self-test: ${passed()} passed, ${failures.length} failed`);
process.exit(failures.length === 0 ? 0 : 1);
