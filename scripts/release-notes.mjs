#!/usr/bin/env node
/**
 * The release page for one tag, read out of CHANGELOG.md: its body, its title, and
 * whether it is the Latest release. The `Release page` workflow runs this and hands
 * the result to `gh release create`; nothing here talks to GitHub.
 *
 * BLOCK. The version's `## [X.Y.Z]` block, without its heading: every line after the
 * heading up to the next level-2 heading (`## `, not `### `) or the end of the file,
 * minus any link-reference definitions (a `[1.7.0]:` line followed by a URL) that trail the last
 * block, and minus surrounding blank lines. The version must match exactly, so 1.7.1
 * never picks up 1.7.10 and the reverse.
 *
 * BODY. The page a person reads, built from the block (owner 2026-10-05: "normal release
 * notes"). The Version sync proposer's opening paragraph is written for the maintainer
 * who merges the pull request — registry numbers, probe verdicts, the raw list of
 * catalogue differences — so on the page it becomes one plain sentence: "This release
 * mirrors server X.Y.Z.", plus "the tools, prompts and resources are unchanged" when the
 * probe said so. The raw difference list (every item in a DIFFERENCE_SHAPES shape:
 * a tool, prompt or resource added, removed or changed, or an `initialize` field moved)
 * is dropped; the person who merged a CHANGED surface described it in prose below it.
 * A block whose proposer paragraph still says the surface CHANGED or is UNCLASSIFIED
 * with no prose of its own, or that still carries the "A person must ..." instruction, is
 * a failure: a page cannot say what nobody wrote down. Every page then ends with the
 * same Install section, unless the block already carries an install line of its own,
 * and a Full changelog link to the previous plain tag. Hard-wrapped prose is joined back
 * into one line per paragraph, because a page renders every newline as a break; a fenced
 * code block is kept exactly as written.
 *
 * TITLE. ONE rule: `viafrei vX.Y.Z — <lead>`, where <lead> is the block's first BOLD
 * LEAD — `**...**` opening a paragraph or a list item (not a wrapped line that happens
 * to start with bold),
 * with backticks dropped, whitespace collapsed and a trailing `.`, `:` or `;` removed —
 * that is NOT the Version sync proposer's standard opening (MIRROR_LEAD, compared after
 * the same normalisation). Every block that proposer writes opens with that line, so
 * skipping it lets the first real change name the page. When it is the block's ONLY
 * bold lead (a pure version-sync release) the page is titled MIRROR_TITLE instead,
 * `viafrei vX.Y.Z — same tools, mirrors the server`, and never fails. No bold lead at
 * all is a failure.

 * LATEST. True only when X.Y.Z is the highest plain `vX.Y.Z` tag the caller lists
 * (the tag itself included), compared as numbers, not as strings.
 *
 * Exit codes: 0 done; 1 the CHANGELOG cannot back a page — the block is missing, empty,
 * has no bold lead, or leaves a changed surface undescribed — and the message names the
 * tag, because an empty page is never the fallback; 2 usage, or an input that could not
 * be read.
 *
 * Usage:
 *   node scripts/release-notes.mjs <X.Y.Z> <changelog> <tags-file> <body-out>
 * prints `title=...` and `latest=true|false` on stdout (GITHUB_OUTPUT lines) and writes
 * the body to <body-out>. <tags-file> holds one tag per line (`git tag -l`).
 */

import { readFileSync, writeFileSync } from 'node:fs';

const VERSION = /^\d+\.\d+\.\d+$/;

/** A failure the CHANGELOG is responsible for (exit 1), as opposed to a usage error. */
export class NotesError extends Error {}

const escapeRe = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/**
 * The block for `version`, heading excluded, trimmed of blank lines and trailing
 * link-reference definitions. Throws NotesError when it is missing or empty.
 * @param {string} changelog
 * @param {string} version
 * @returns {string}
 */
export function extractBlock(changelog, version) {
    const lines = changelog.split(/\r?\n/);
    const heading = new RegExp(`^## \\[${escapeRe(version)}\\](?:[\\s(-]|$)`);
    const start = lines.findIndex((l) => heading.test(l));
    if (start === -1) throw new NotesError(`v${version}: CHANGELOG.md has no "## [${version}]" block`);
    let end = lines.length;
    let fenced = false;
    for (let i = start + 1; i < lines.length; i += 1) {
        if (/^\s*(```|~~~)/.test(lines[i])) fenced = !fenced;
        if (!fenced && /^## /.test(lines[i])) {
            end = i;
            break;
        }
    }
    const body = lines.slice(start + 1, end);
    // Trailing blank lines and link-reference definitions belong to the file, not the block.
    while (body.length > 0 && (body.at(-1).trim() === '' || /^\[[^\]]+\]:\s+\S/.test(body.at(-1)))) body.pop();
    while (body.length > 0 && body[0].trim() === '') body.shift();
    const substance = body.filter((l) => l.trim() !== '' && !/^#{3,6}\s/.test(l));
    if (substance.length === 0) throw new NotesError(`v${version}: the "## [${version}]" block in CHANGELOG.md is empty`);
    return body.join('\n');
}

/**
 * The opening bold lead of every block scripts/propose-release.mjs writes. ONE copy:
 * the self-test reads the proposer's source and fails unless its opening line is this
 * string, so the two cannot drift apart.
 */
export const MIRROR_LEAD = 'Mirrors the server.';

/** A bold lead as a title fragment: no backticks, collapsed spaces, no trailing `.:;`. */
export function normaliseLead(text) {
    return text.replace(/`/g, '').replace(/\s+/g, ' ').trim().replace(/[.:;]+$/, '').trim();
}

/**
 * Every bold lead of the block, normalised, in order. A lead OPENS a paragraph (the
 * line before it is blank, a heading, or the start of the block) or a list item. A
 * line that merely starts with bold because the paragraph above it wrapped there —
 * the proposer's `**unchanged**` does exactly that — is not a lead.
 */
export function boldLeads(block) {
    const leads = [];
    let previous = '';
    for (const line of block.split('\n')) {
        const opensParagraph = previous.trim() === '' || /^#{1,6}\s/.test(previous);
        const m = /^\s*([-*]\s+)?\*\*(.+?)\*\*/.exec(line);
        const lead = m && (m[1] || opensParagraph) ? normaliseLead(m[2]) : '';
        if (lead) leads.push(lead);
        previous = line;
    }
    return leads;
}

/** The title of a pure mirror, whose only bold lead is MIRROR_LEAD. */
export const MIRROR_TITLE = 'same tools, mirrors the server';

/**
 * `viafrei vX.Y.Z — <first bold lead that is not MIRROR_LEAD>`, falling back to
 * MIRROR_TITLE when MIRROR_LEAD is the only one. Throws NotesError when the block has none.
 * @param {string} block
 * @param {string} version
 */
export function titleFor(block, version) {
    const leads = boldLeads(block);
    if (leads.length === 0) {
        throw new NotesError(`v${version}: the "## [${version}]" block has no bold lead to title the page with`);
    }
    const mirror = normaliseLead(MIRROR_LEAD);
    const lead = leads.find((l) => l !== mirror) ?? (leads[0] === mirror ? MIRROR_TITLE : leads[0]);
    return `viafrei v${version} — ${lead}`;
}

const parts = (v) => v.split('.').map(Number);

/** Compare two X.Y.Z strings numerically. */
export function compareSemver(a, b) {
    const [x, y] = [parts(a), parts(b)];
    for (let i = 0; i < 3; i += 1) if (x[i] !== y[i]) return x[i] - y[i];
    return 0;
}

/**
 * Is `version` the highest of the plain vX.Y.Z tags? Other tag shapes are ignored.
 * @param {string} version
 * @param {string[]} tags
 */
export function isHighest(version, tags) {
    const versions = tags.map((t) => t.trim()).filter((t) => /^v\d+\.\d+\.\d+$/.test(t)).map((t) => t.slice(1));
    return versions.every((v) => compareSemver(version, v) >= 0);
}

/** The highest plain vX.Y.Z tag below `version`, or null when there is none. */
export function previousTag(version, tags) {
    const lower = tags.map((t) => t.trim()).filter((t) => /^v\d+\.\d+\.\d+$/.test(t)).map((t) => t.slice(1))
        .filter((v) => compareSemver(v, version) < 0).sort(compareSemver);
    return lower.length > 0 ? `v${lower.at(-1)}` : null;
}

const REPO_URL = 'https://github.com/mavrovde/viafrei-mcp';

/**
 * Join the CHANGELOG's hard-wrapped lines back into one line per paragraph or list item.
 * A release page renders every newline as a line break, so a block wrapped at 90
 * columns would show ragged lines. Headings, list items, table rows and code fences
 * keep their own lines; an indented line continues the list item above it. Known limit:
 * a prose line that happens to wrap onto `- `, `* ` or `12. ` is taken for an item and
 * keeps its break — cosmetic, and rare in a hand-written block.
 */
export function unwrap(paragraph) {
    if (/^\s*(```|~~~)/mu.test(paragraph)) return paragraph;
    const lines = [];
    for (const line of paragraph.split('\n')) {
        const starts = /^(#{1,6}\s|\s*[-*]\s|\s*\d+\.\s|\|)/u.test(line);
        if (lines.length === 0 || starts) lines.push(line.trimEnd());
        else lines[lines.length - 1] = `${lines.at(-1)} ${line.trim()}`;
    }
    return lines.join('\n');
}
/**
 * The shapes of one catalogue difference, as `scripts/probe-catalogue.mjs` writes them
 * and the proposer lists them (`- <difference>`, wrapped at its column limit with no
 * indent). ONE copy of the rule: the self-test reads every `differences.push(` in the
 * probe's source and fails unless each template is one of these, so the two cannot drift
 * (the MIRROR_LEAD rule). The key is the probe's list key (`tools`, `resourceTemplates`,
 * ...), an `initialize` field (`protocolVersion`, ...) or `serverInfo.version`, so it may
 * carry capitals and a dot.
 */
export const DIFFERENCE_SHAPES = Object.freeze([
    /^[A-Za-z]+: the server has .+, the snapshot does not$/u,
    /^[A-Za-z]+: the snapshot has .+, the server does not$/u,
    /^[A-Za-z]+: .+ differs between the server and the snapshot$/u,
    /^[A-Za-z]+: the server's initialize answer differs from the snapshot's$/u,
    /^[A-Za-z.]+: the snapshot says .+, the server says .+$/u
]);
const isDifference = (item) => DIFFERENCE_SHAPES.some((shape) => shape.test(item));
const INSTRUCTION = /^\*\*A person must /u;

/**
 * Paragraphs of a block, split at blank lines OUTSIDE a code fence, so a fenced sample
 * with blank lines inside it stays one paragraph and is never unwrapped.
 */
export function paragraphsOf(block) {
    const paragraphs = [];
    let current = [];
    let fenced = false;
    for (const line of block.split('\n')) {
        if (/^\s*(```|~~~)/u.test(line)) fenced = !fenced;
        if (!fenced && line.trim() === '') {
            if (current.length > 0) paragraphs.push(current.join('\n'));
            current = [];
        } else {
            current.push(line);
        }
    }
    if (current.length > 0) paragraphs.push(current.join('\n'));
    return paragraphs;
}

/**
 * A paragraph without its raw catalogue-difference items. A list item is a line opening
 * `- ` plus every following line that does not open another item (the proposer wraps an
 * item with no indent, so a long resource URI splits over two lines); an item whose
 * joined text is a DIFFERENCE_SHAPES line is dropped. A fenced paragraph is left alone.
 */
export function withoutDifferences(paragraph) {
    if (/^\s*(```|~~~)/mu.test(paragraph)) return paragraph;
    const items = [];
    for (const line of paragraph.split('\n')) {
        if (/^- /u.test(line) || items.length === 0) items.push([line]);
        else items.at(-1).push(line);
    }
    return items
        .filter((lines) => !(/^- /u.test(lines[0]) && isDifference(lines.map((l) => l.trim()).join(' ').slice(2))))
        .map((lines) => lines.join('\n'))
        .join('\n')
        .trim();
}

/**
 * The page body for `version` from its block — see BODY in the header. Throws NotesError
 * when the block still holds what only a person can turn into a release note.
 * @param {string} block
 * @param {string} version
 * @param {string[]} tags
 */
export function pageBody(block, version, tags) {
    const paragraphs = paragraphsOf(block);
    const out = [];
    const mirror = normaliseLead(MIRROR_LEAD);
    const first = paragraphs[0] ?? '';
    const m = /^\*\*(.+?)\*\*/u.exec(first);
    const isMirror = Boolean(m && normaliseLead(m[1]) === mirror);
    let rest = paragraphs;
    if (isMirror) {
        const flat = first.replace(/\s+/gu, ' ');
        const unchanged = /surface \*\*unchanged\*\*/u.test(flat);
        out.push(unchanged
            ? `This release mirrors server ${version}. The tools, prompts and resources are unchanged, so every client keeps working as it is.`
            : `This release mirrors server ${version}.`);
        rest = paragraphs.slice(1);
        if (!unchanged) {
            // What is left once the raw difference list is gone must be a person's prose:
            // not a heading, and not the proposer's instruction to write it.
            const prose = rest.map(withoutDifferences)
                .filter((p) => p !== '' && !/^#{3,6}\s/u.test(p) && !INSTRUCTION.test(p));
            if (prose.length === 0) {
                throw new NotesError(`v${version}: the server's surface changed and the "## [${version}]" block does not say how — describe it before the page is written`);
            }
        }
    }
    for (const paragraph of rest) {
        const kept = withoutDifferences(paragraph);
        if (kept === '') continue;
        if (INSTRUCTION.test(kept)) {
            throw new NotesError(`v${version}: the "## [${version}]" block still carries the proposer's instruction to a person ("${kept.split('\n')[0].slice(0, 60)}…") — do what it says and remove it`);
        }
        out.push(unwrap(kept));
    }
    if (out.length === 1 && isMirror) {
        out.push(`No code changed in the bridge itself; only its version moved to ${version}.`);
    }
    if (!out.some((p) => p.includes('npx -y viafrei@'))) {
        out.push('## Install', '```\nnpx -y viafrei@' + version + '\n```',
            `Requires Node.js 22 or newer. Published through npm Trusted Publishing, with provenance. See the [README](${REPO_URL}#readme) for client setup, or connect through [Smithery](https://smithery.ai/servers/viafrei/viafrei) with no local install.`);
    }
    const previous = previousTag(version, tags);
    if (previous) out.push(`**Full changelog:** ${REPO_URL}/compare/${previous}...v${version}`);
    return out.join('\n\n');
}

/** Everything the page needs, from the three inputs. */
export function releaseNotes(changelog, version, tags) {
    const block = extractBlock(changelog, version);
    return { body: pageBody(block, version, tags), title: titleFor(block, version), latest: isHighest(version, tags) };
}

function usage(message) {
    console.error(`release-notes: ${message}`);
    console.error('usage: node scripts/release-notes.mjs <X.Y.Z> <changelog> <tags-file> <body-out>');
    process.exit(2);
}

function readOrRefuse(path, what) {
    try {
        return readFileSync(path, 'utf8');
    } catch (error) {
        return usage(`could not read the ${what} ${path}: ${error.code ?? error.message}`);
    }
}

if (import.meta.url === `file://${process.argv[1]}`) {
    const [version, changelogPath, tagsPath, bodyOut, ...rest] = process.argv.slice(2);
    if (rest.length > 0 || !bodyOut) usage('expected exactly four arguments');
    if (!VERSION.test(version)) usage(`not a version: '${version}' (X.Y.Z, no v)`);
    const changelog = readOrRefuse(changelogPath, 'changelog');
    const tags = readOrRefuse(tagsPath, 'tag list').split('\n').filter((t) => t.trim() !== '');
    if (!tags.includes(`v${version}`)) usage(`the tag list does not contain v${version}, so Latest cannot be judged`);
    let notes;
    try {
        notes = releaseNotes(changelog, version, tags);
    } catch (error) {
        if (!(error instanceof NotesError)) throw error;
        console.error(`release-notes: ${error.message} — refusing to create a page without one.`);
        process.exit(1);
    }
    writeFileSync(bodyOut, `${notes.body}\n`);
    console.log(`title=${notes.title}`);
    console.log(`latest=${notes.latest}`);
}
