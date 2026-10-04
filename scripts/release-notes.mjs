#!/usr/bin/env node
/**
 * The release page for one tag, read out of CHANGELOG.md: its body, its title, and
 * whether it is the Latest release. The `Release page` workflow runs this and hands
 * the result to `gh release create`; nothing here talks to GitHub.
 *
 * BODY. The version's `## [X.Y.Z]` block, without its heading: every line after the
 * heading up to the next level-2 heading (`## `, not `### `) or the end of the file,
 * minus any link-reference definitions (a `[1.7.0]:` line followed by a URL) that trail the last
 * block, and minus surrounding blank lines. The version must match exactly, so 1.7.1
 * never picks up 1.7.10 and the reverse.
 *
 * TITLE. ONE rule: `viafrei vX.Y.Z — <lead>`, where <lead> is the block's first BOLD
 * LEAD — `**...**` opening a paragraph or a list item (not a wrapped line that happens
 * to start with bold),
 * with backticks dropped, whitespace collapsed and a trailing `.`, `:` or `;` removed —
 * that is NOT the Version sync proposer's standard opening (MIRROR_LEAD, compared after
 * the same normalisation). Every block that proposer writes opens with that line, so
 * skipping it lets the first real change name the page. When it is the block's ONLY
 * bold lead (a pure version-sync release) it is used, so a legitimate mirror block is
 * titled `viafrei vX.Y.Z — Mirrors the server` and never fails. No bold lead at all is
 * a failure.

 * LATEST. True only when X.Y.Z is the highest plain `vX.Y.Z` tag the caller lists
 * (the tag itself included), compared as numbers, not as strings.
 *
 * Exit codes: 0 done; 1 the CHANGELOG cannot back a page — the block is missing, empty
 * or has no bold lead — and the message names the tag, because an empty page is never
 * the fallback; 2 usage, or an input that could not be read.
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

/**
 * `viafrei vX.Y.Z — <first bold lead that is not MIRROR_LEAD>`, falling back to
 * MIRROR_LEAD when it is the only one. Throws NotesError when the block has none.
 * @param {string} block
 * @param {string} version
 */
export function titleFor(block, version) {
    const leads = boldLeads(block);
    if (leads.length === 0) {
        throw new NotesError(`v${version}: the "## [${version}]" block has no bold lead to title the page with`);
    }
    const mirror = normaliseLead(MIRROR_LEAD);
    const lead = leads.find((l) => l !== mirror) ?? leads[0];
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

/** Everything the page needs, from the three inputs. */
export function releaseNotes(changelog, version, tags) {
    const body = extractBlock(changelog, version);
    return { body, title: titleFor(body, version), latest: isHighest(version, tags) };
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
