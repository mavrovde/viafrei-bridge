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
import { DIFFERENCE_SHAPES, MIRROR_LEAD, MIRROR_TITLE, NotesError, boldLeads, compareSemver, extractBlock, isHighest, pageBody, paragraphsOf, releaseNotes, titleFor, unwrap, withoutDifferences } from './release-notes.mjs';
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

// The Version sync proposer's opening line is skipped when a real lead follows it.
const MIRROR = `**${MIRROR_LEAD}** The bridge is versioned to match the server it relays to.`;
const realAfter = `${MIRROR}\n\n### Added\n\n- **The repository is now \`a/b\`** (renamed).`;
check('title: a mirror line followed by a real lead takes the real lead',
    titleFor(realAfter, '1.0.0') === 'viafrei v1.0.0 — The repository is now a/b', titleFor(realAfter, '1.0.0'));
const mirrorOnly = `${MIRROR} The probe reported the surface **unchanged** today.`;
check('title: a mirror-only block is titled MIRROR_TITLE, not the proposer\'s bold lead',
    titleFor(mirrorOnly, '1.0.0') === `viafrei v1.0.0 — ${MIRROR_TITLE}`, titleFor(mirrorOnly, '1.0.0'));
check('title: the mirror line is recognised after normalisation (no period, extra spaces)',
    titleFor('**Mirrors  the server**\n\n**Real one.**', '1.0.0') === 'viafrei v1.0.0 — Real one');
check('title: a real lead BEFORE the mirror line is still the first one',
    titleFor(`**First.**\n\n${MIRROR}`, '1.0.0') === 'viafrei v1.0.0 — First');

const wrapped = `${MIRROR} The probe reported the surface\n**unchanged** — only the version string moved.\n\n### Changed\n\n- **The real change.** Here.`;
check('title: bold at the start of a WRAPPED line is not a lead (the proposer wraps **unchanged** there)',
    titleFor(wrapped, '1.0.0') === 'viafrei v1.0.0 — The real change', titleFor(wrapped, '1.0.0'));
const wrappedOnly = `${MIRROR} The probe reported the surface\n**unchanged** — only the version string moved.`;
check('title: a mirror-only block whose wrapped line starts with bold is still titled MIRROR_TITLE',
    titleFor(wrappedOnly, '1.0.0') === `viafrei v1.0.0 — ${MIRROR_TITLE}`, titleFor(wrappedOnly, '1.0.0'));

// One copy of the boilerplate: the proposer must open its blocks with exactly MIRROR_LEAD.
const proposer = readFileSync(join(HERE, 'propose-release.mjs'), 'utf8');
const proposerLeads = [...proposer.matchAll(/`\*\*([^*`]+)\*\* The bridge is versioned/g)].map((m) => m[1]);
check('the proposer opens its blocks with MIRROR_LEAD, word for word',
    proposerLeads.length === 1 && proposerLeads[0] === MIRROR_LEAD, JSON.stringify(proposerLeads));

// --- Latest ----------------------------------------------------------------------------

check('semver is numeric: 1.7.10 > 1.7.9', compareSemver('1.7.10', '1.7.9') > 0);
check('Latest: the highest tag is latest', isHighest('1.7.10', ['v1.7.9', 'v1.7.10', 'v0.0.9']) === true);
check('Latest: a lower tag is not, even when it sorts higher as a string', isHighest('1.7.9', ['v1.7.9', 'v1.7.10']) === false);
check('Latest: other tag shapes are ignored', isHighest('1.7.0', ['v1.7.0', 'v2.0.0-rc.1', 'smithery-9', 'v9']) === true);
check('releaseNotes: body, title and latest together',
    JSON.stringify(releaseNotes(FIXTURE, '1.7.10', ['v1.7.10', 'v1.7.1'])) ===
    JSON.stringify({ body: pageBody(b1710, '1.7.10', ['v1.7.10', 'v1.7.1']), title: 'viafrei v1.7.10 — Ten, not one', latest: true }));

// --- the page body (owner 2026-10-05: "normal release notes") ---------------------------

const TAGS = ['v1.0.0', 'v0.9.0', 'v0.10.0', 'v2.0.0-rc.1'];
const pure = pageBody(`${MIRROR} The probe reported the surface\n**unchanged** — only the version string moved.`, '1.0.0', TAGS);
check('page: a pure mirror opens with one plain sentence, not the proposer\'s paragraph',
    pure.startsWith('This release mirrors server 1.0.0. The tools, prompts and resources are unchanged')
    && !pure.includes(MIRROR_LEAD) && !pure.includes('probe') && !pure.includes('registry'), pure);
check('page: a pure mirror says the bridge code did not change', pure.includes('No code changed in the bridge itself'), pure);
check('page: an Install section with the exact version', pure.includes('## Install') && pure.includes('npx -y viafrei@1.0.0'), pure);
check('page: Full changelog compares with the previous plain tag, numerically (0.10.0, not 0.9.0)',
    pure.endsWith('compare/v0.10.0...v1.0.0'), pure.split('\n').at(-1));
check('page: no previous tag, no Full changelog line', !pageBody('**First.** Ever.', '0.0.1', ['v0.0.1']).includes('Full changelog'));
check('page: a block with its own install line gets no second Install section',
    !pageBody('**Hand-written.**\n\n```\nnpx -y viafrei@1.0.0\n```', '1.0.0', TAGS).includes('## Install'));

const described = `${MIRROR} The probe reported the surface **CHANGED** — the automation knows what moved:\n\n`
    + '- tools: find_x differs between the server and the snapshot\n- resources: viafrei://y differs between the server and the snapshot\n\n'
    + '**`find_x` takes a longer window.** Its limit moves\nfrom 90 to 92 days.';
const db = pageBody(described, '1.0.0', TAGS);
check('page: a described change keeps the prose and drops the raw difference lines',
    db.startsWith('This release mirrors server 1.0.0.\n\n**`find_x` takes a longer window.**') && !db.includes('differs between') && !db.includes('unchanged'), db);
check('page: hard-wrapped prose is joined into one line', db.includes('Its limit moves from 90 to 92 days.'), db);
const listWrap = unwrap('- **One.** Starts\n  and continues.\n- **Two.**');
check('page: a wrapped list item continues its item; the next item keeps its own line',
    listWrap === '- **One.** Starts and continues.\n- **Two.**', JSON.stringify(listWrap));

const undescribed = refusal(() => pageBody(`${MIRROR} The probe reported the surface **CHANGED**:\n\n- tools: find_x differs between the server and the snapshot`, '1.0.0', TAGS));
check('page: a CHANGED surface nobody described FAILS and names the tag',
    undescribed !== null && undescribed.startsWith('v1.0.0:') && undescribed.includes('does not say how'), undescribed ?? 'no refusal');
const unclassified = refusal(() => pageBody(`${MIRROR} The probe reported the surface **UNCLASSIFIED** — nobody knows.`, '1.0.0', TAGS));
check('page: an UNCLASSIFIED surface with no prose FAILS', unclassified !== null && unclassified.includes('does not say how'), unclassified ?? 'no refusal');
const leftover = refusal(() => pageBody(`${described}\n\n**A person must describe the change above before this merges.** Text.`, '1.0.0', TAGS));
check('page: the proposer\'s "A person must" instruction left in the block FAILS',
    leftover !== null && leftover.includes('instruction to a person'), leftover ?? 'no refusal');

// Every shape the probe writes, a key with capitals, and an item the proposer wrapped.
const CHANGED = `${MIRROR} The probe reported the surface **CHANGED** — the automation knows what moved:`;
const shapes = [
    '- tools: the server has find_new, the snapshot does not',
    '- prompts: the snapshot has old_prompt, the server does not',
    '- resourceTemplates: viafrei://x/{id} differs between the server and the snapshot',
    "- protocolVersion: the server's initialize answer differs from the snapshot's",
    // 91 characters: the proposer wraps it at 88 with no indent, over two lines.
    '- resources: viafrei://rules/driving-in-germany differs between the server and the',
    'snapshot'
].join('\n');
const allShapes = pageBody(`${CHANGED}\n\n${shapes}\n\n**A new tool, \`find_new\`.** It finds new things.`, '1.0.0', TAGS);
check('page: every probe shape, a capitalised key and a wrapped item are all dropped',
    !/the server has|the snapshot has|differs|initialize answer|^snapshot$/mu.test(allShapes) && allShapes.includes('**A new tool, `find_new`.**'), allShapes);
const addedOnly = refusal(() => pageBody(`${CHANGED}\n\n- tools: the server has find_new, the snapshot does not`, '1.0.0', TAGS));
check('page: a CHANGED block whose only content is an added-tool line FAILS', addedOnly !== null && addedOnly.includes('does not say how'), addedOnly ?? 'no refusal');
const instructionOnly = refusal(() => pageBody(`${CHANGED}\n\n${shapes}\n\n**A person must describe the change above before this merges.** Text.`, '1.0.0', TAGS));
check('page: a CHANGED block left with only the instruction FAILS as undescribed', instructionOnly !== null && instructionOnly.includes('does not say how'), instructionOnly ?? 'no refusal');
check('page: a human list item that is not a difference is kept',
    withoutDifferences('- tools: now there are more of them\n- **Two.**') === '- tools: now there are more of them\n- **Two.**');

// One copy of the shapes: every difference the probe can write is one of them.
const probe = readFileSync(join(HERE, 'probe-catalogue.mjs'), 'utf8');
const templates = [...probe.matchAll(/differences\.push\(`([^`]+)`\)/gu)].map((m) => m[1]
    .replace('${list.key}', 'resourceTemplates').replace('${field}', 'protocolVersion').replace(/\$\{[^}]+\}/gu, 'viafrei://x'));
check('the probe writes at least the four known difference shapes', templates.length >= 4, JSON.stringify(templates));
for (const template of templates) {
    check(`DIFFERENCE_SHAPES recognises the probe's "${template.slice(0, 50)}…"`, DIFFERENCE_SHAPES.some((shape) => shape.test(template)), template);
}

// A fenced sample with blank lines inside stays whole and is not unwrapped.
const fence = '**Example.** Run:\n\n```\nfirst line\n\n\nsecond line\n```\n\nAfter.';
check('page: a fence with blank lines inside is one paragraph', paragraphsOf(fence).length === 3, JSON.stringify(paragraphsOf(fence)));
check('page: the fence is published exactly as written', pageBody(fence, '1.0.0', TAGS).includes('```\nfirst line\n\n\nsecond line\n```'), pageBody(fence, '1.0.0', TAGS));
const ownInstall = pageBody('**Hand-written.** Run `npx -y viafrei@1.0.0` today.', '1.0.0', TAGS);
check('page: a block naming its own install line still gets the Full changelog link',
    !ownInstall.includes('## Install') && ownInstall.endsWith('compare/v0.10.0...v1.0.0'), ownInstall);

const human = pageBody('This release does things.\n\n### Added\n\n- **A thing.**', '1.0.0', TAGS);
check('page: a block not written by the proposer is kept as written, with the footer added',
    human.startsWith('This release does things.') && human.includes('### Added') && !human.includes('mirrors server'), human);

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
    check('CLI: the body file is the page built from the block', readFileSync(body, 'utf8') === `${pageBody(b171, '1.7.1', ['v1.7.10', 'v1.7.1', 'v0.0.9'])}\n`);

    const miss = cli(['2.0.0', changelog, join(dir, 'tags2'), body]);
    check('CLI: an unreadable tag list is exit 2', miss.status === 2, `${miss.status} ${miss.out}`);
    writeFileSync(join(dir, 'tags2'), 'v2.0.0\n');
    const noBlock = cli(['2.0.0', changelog, join(dir, 'tags2'), join(dir, 'never.md')]);
    check('CLI: a missing block is exit 1, names the tag, and writes no body',
        noBlock.status === 1 && noBlock.out.includes('v2.0.0') && !existsSync(join(dir, 'never.md')), `${noBlock.status} ${noBlock.out}`);
    writeFileSync(join(dir, 'tags3'), 'v1.7.0\n');
    const emptyCli = cli(['1.7.0', changelog, join(dir, 'tags3'), body]);
    check('CLI: an empty block is exit 1 naming the tag', emptyCli.status === 1 && emptyCli.out.includes('v1.7.0'), `${emptyCli.status} ${emptyCli.out}`);
    const noLeadLog = join(dir, 'nolead.md');
    writeFileSync(noLeadLog, '## [3.0.0] - 2026-12-01\n\nPlain prose, no bold lead anywhere.\n');
    writeFileSync(join(dir, 'tags4'), 'v3.0.0\n');
    const noLeadCli = cli(['3.0.0', noLeadLog, join(dir, 'tags4'), body]);
    check('CLI: a block with no bold lead is exit 1 naming the tag',
        noLeadCli.status === 1 && noLeadCli.out.includes('v3.0.0') && noLeadCli.out.includes('no bold lead'), `${noLeadCli.status} ${noLeadCli.out}`);
    check('CLI: a v-prefixed version is a usage error (2)', cli(['v1.7.1', changelog, tags, body]).status === 2);
    check('CLI: a tag list without the tag is a usage error (2)', cli(['1.7.1', changelog, join(dir, 'tags2'), body]).status === 2);
    check('CLI: a missing argument is a usage error (2)', cli(['1.7.1', changelog, tags]).status === 2);

    // The real CHANGELOG must be able to back a page for the version this tree carries.
    const version = JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf8')).version;
    writeFileSync(tags, `v${version}\n`);
    const real = cli([version, join(ROOT, 'CHANGELOG.md'), tags, body]);
    const realBlock = extractBlock(readFileSync(join(ROOT, 'CHANGELOG.md'), 'utf8'), version);
    const others = boldLeads(realBlock).filter((l) => l !== 'Mirrors the server');
    if (others.length > 0) {
        check(`CLI: ${version} has a real lead, so its title is not the mirror line`, !real.out.includes('Mirrors the server'), real.out);
    }
    check(`CLI: the repository CHANGELOG backs a page for ${version}`, real.status === 0 && real.out.startsWith(`title=viafrei v${version} — `), real.out);
} finally {
    rmSync(dir, { recursive: true, force: true });
}

console.log(`\nrelease-notes self-test: ${passed()} passed, ${failures.length} failed`);
process.exit(failures.length === 0 ? 0 : 1);
