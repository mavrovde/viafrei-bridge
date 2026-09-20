/**
 * The rules, loaded once and applied the same way by both checks.
 *
 * Two things this module exists to get right:
 *
 * 1. **A finding never prints the thing it found.** A private name echoed into
 *    a CI log on a public repository is as published as it would have been in
 *    the file. Findings carry a hash prefix and a location; the developer opens
 *    the file and sees it themselves.
 * 2. **Plaintext is not the only way to write something down.** The scanner
 *    decodes base64, hex, percent-encoding and JavaScript string escapes, and
 *    collapses concatenated string literals, before it looks. What it still
 *    cannot see is listed by `blindSpots()` and printed on every run, because a
 *    check that quietly cannot see something is worse than one that says so.
 */
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

export function loadRules(root) {
    const rules = JSON.parse(readFileSync(join(root, 'scripts/rules.json'), 'utf8'));
    const text = value => (value === undefined ? undefined : Buffer.from(value, 'base64').toString('utf8'));
    const decode = rule => ({ ...rule, source: text(rule.regex), sample: text(rule.sample) });
    return {
        salt: rules.salt,
        tokenHashes: new Set(rules.tokenHashes),
        allowedHosts: new Set(rules.allowedHosts),
        repositoryPatterns: rules.repositoryPatterns.map(decode),
        tarballPatterns: rules.tarballPatterns.map(decode),
        embeddedSourcePatterns: rules.embeddedSourcePatterns.map(decode)
    };
}

export function hashToken(salt, token) {
    return createHash('sha256').update(`${salt}:${token.toLowerCase()}`).digest('hex');
}

export function compile(rule) {
    return new RegExp(rule.source, `${rule.flags ?? ''}u`);
}

/**
 * Every name a line could be hiding.
 *
 * A plain word list would miss a private name buried inside a longer
 * identifier (`my_<name>_backup`) or welded to a word (`port<number>`), so each
 * identifier is also broken at its underscores and at its letter/digit
 * boundaries, and every contiguous run of those pieces is offered as a
 * candidate. A name is found inside a longer one; a longer number is not
 * mistaken for a port it merely contains.
 */
export function tokenCandidates(line) {
    const candidates = new Set();
    for (const run of line.match(/[A-Za-z0-9_]+/gu) ?? []) {
        const lowered = run.toLowerCase();
        candidates.add(lowered);
        const pieces = [];
        for (const part of lowered.split('_')) {
            if (part === '') {
                continue;
            }
            pieces.push(...(part.match(/[a-z]+|[0-9]+/gu) ?? [part]));
        }
        if (pieces.length > 12) {
            continue;
        }
        for (let start = 0; start < pieces.length; start += 1) {
            for (let end = start + 1; end <= pieces.length; end += 1) {
                candidates.add(pieces.slice(start, end).join('_'));
                candidates.add(pieces.slice(start, end).join(''));
            }
        }
    }
    return candidates;
}

const PRINTABLE = /^[\t\n\r\x20-\x7e]*$/u;

function readable(buffer) {
    if (buffer.length < 4) {
        return undefined;
    }
    const text = buffer.toString('utf8');
    return PRINTABLE.test(text) ? text : undefined;
}

/**
 * The same line, written the other ways it could have been written.
 *
 * Returns `[{ encoding, text }]` for every decoding that produced readable
 * text. The original line is not included; the caller already has it.
 */
export function decodings(line) {
    const found = [];
    const add = (encoding, text) => {
        if (text !== undefined && text.trim() !== '' && text !== line) {
            found.push({ encoding, text });
        }
    };

    for (const run of line.match(/[A-Za-z0-9+/=_-]{24,}/gu) ?? []) {
        const standard = run.replace(/-/gu, '+').replace(/_/gu, '/');
        try {
            add('base64', readable(Buffer.from(standard, 'base64')));
        } catch {
            // Not base64 after all.
        }
    }
    for (const run of line.match(/(?:[0-9a-fA-F]{2}){16,}/gu) ?? []) {
        add('hex', readable(Buffer.from(run, 'hex')));
    }
    if (line.includes('%')) {
        try {
            add('percent', decodeURIComponent(line));
        } catch {
            // Not percent-encoded after all.
        }
    }
    if (/\\x[0-9a-fA-F]{2}|\\u[0-9a-fA-F]{4}/u.test(line)) {
        add(
            'js-escape',
            line
                .replace(/\\x([0-9a-fA-F]{2})/gu, (_, hex) => String.fromCharCode(parseInt(hex, 16)))
                .replace(/\\u([0-9a-fA-F]{4})/gu, (_, hex) => String.fromCharCode(parseInt(hex, 16)))
        );
    }
    if (/['"]\s*\+\s*['"]/u.test(line)) {
        add('concatenated literals', line.replace(/['"]\s*\+\s*['"]/gu, ''));
    }
    return found;
}

/** What the scanner still cannot see. Printed on every run, never implied. */
export function blindSpots() {
    return [
        'compressed (gzip/deflate) or encrypted payloads',
        'text assembled at runtime from arithmetic or character codes',
        'anything fetched at install or run time rather than shipped'
    ];
}

/**
 * Scan one file. `text` is the whole file; the callbacks receive findings.
 *
 * `patterns` are applied to the plaintext. Token hashes are applied to the
 * plaintext AND to every decoding, because a name hidden in base64 is still
 * the name.
 */
export function scanFile({ label, text, patterns, rules, extraTokenHashes = new Set(), onFinding }) {
    const lines = text.split('\n');
    for (const [index, line] of lines.entries()) {
        const where = `${label}:${index + 1}`;

        for (const rule of patterns) {
            const match = compile(rule).exec(line);
            if (match !== null) {
                onFinding({ kind: 'pattern', where, detail: `${rule.label} (matched ${JSON.stringify(match[0])})` });
            }
        }

        const views = [{ encoding: 'plaintext', text: line }, ...decodings(line)];
        for (const view of views) {
            for (const candidate of tokenCandidates(view.text)) {
                const digest = hashToken(rules.salt, candidate);
                if (rules.tokenHashes.has(digest) || extraTokenHashes.has(digest)) {
                    onFinding({
                        kind: 'private name',
                        where,
                        // The hash prefix, never the name: this text ends up in a
                        // public CI log.
                        detail: `a private name (hash ${digest.slice(0, 12)}…) appears here as ${view.encoding}`
                    });
                }
            }
        }
    }
}
