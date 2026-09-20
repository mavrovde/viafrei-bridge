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
    // Reversed as well as base64: see _patterns in rules.json. A file that
    // matched its own rules once the scanner learned to decode base64 would have
    // to be skipped, and "the one file we do not scan" is where the last leak
    // lived.
    const text = value => (value === undefined ? undefined : [...Buffer.from(value, 'base64').toString('utf8')].reverse().join(''));
    const decode = rule => ({ ...rule, source: text(rule.regex), sample: text(rule.sample) });
    return {
        salt: rules.salt,
        minTokenLength: rules.minTokenLength,
        maxTokenLength: rules.maxTokenLength,
        tokenHashes: new Set(rules.tokenHashes),
        numbers: {
            minDigits: rules.numbers?.minDigits,
            maxDigits: rules.numbers?.maxDigits,
            allowed: new Set((rules.numbers?.allowed ?? []).map(entry => String(entry)))
        },
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
/** Beyond this many pieces the combinations stop being worth their cost. */
export const MAX_IDENTIFIER_PIECES = 12;

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
        if (pieces.length > MAX_IDENTIFIER_PIECES) {
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

/**
 * How short a run may be and still be worth decoding.
 *
 * Derived from the rules, never chosen by feel. The first version demanded 24
 * base64 characters and 32 hex characters - 18 and 16 bytes of plaintext -
 * while every name on the list is 4 to 15 characters, so the decoders could not
 * have caught a single one. The run announced that it was "scanning as base64,
 * hex, …" the whole time. A threshold with no relationship to what is being
 * looked for is how a check comes to report success about what it never read.
 */
export function thresholds(rules) {
    const min = rules.minTokenLength;
    const max = rules.maxTokenLength;
    if (typeof min !== 'number' || min < 1) {
        throw new Error('rules.json must declare minTokenLength: the decoders size themselves from it');
    }
    if (typeof max !== 'number' || max < min) {
        throw new Error('rules.json must declare maxTokenLength, and it may not be smaller than minTokenLength');
    }
    if (typeof rules.numbers.minDigits !== 'number' || typeof rules.numbers.maxDigits !== 'number') {
        throw new Error('rules.json must declare numbers.minDigits and numbers.maxDigits');
    }
    return {
        minTokenLength: min,
        maxTokenLength: rules.maxTokenLength,
        // The unpadded length of `min` bytes in base64, and in hex.
        base64MinRun: Math.ceil((4 * min) / 3),
        hexMinRun: 2 * min
    };
}

const PRINTABLE = /^[\t\n\r\x20-\x7e]*$/u;

function readable(buffer, minLength) {
    if (buffer.length < minLength) {
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
export function decodings(line, limits) {
    const found = [];
    const add = (encoding, text) => {
        if (text !== undefined && text.trim() !== '' && text !== line) {
            found.push({ encoding, text });
        }
    };

    const base64Runs = new RegExp(`[A-Za-z0-9+/=_-]{${limits.base64MinRun},}`, 'gu');
    for (const run of line.match(base64Runs) ?? []) {
        const standard = run.replace(/-/gu, '+').replace(/_/gu, '/');
        // Four offsets, because base64 packs three bytes into four characters:
        // where a run STARTS in the text need not be where the encoder started.
        // Dropping one, two or three leading characters re-aligns the decoder
        // to the other three phases; the fourth is the original. (Dropped
        // characters shift by 6 bits each, so only whole-byte phases - 0 and 4
        // characters - decode to the same bytes, which is why four offsets
        // cover it and a fifth would repeat the first.)
        for (let offset = 0; offset < 4 && offset < standard.length; offset += 1) {
            try {
                add('base64', readable(Buffer.from(standard.slice(offset), 'base64'), limits.minTokenLength));
            } catch {
                // Not base64 after all.
            }
        }
    }
    // The run is matched as characters, not as pairs. Matching pairs anchored at
    // the run start silently truncated an odd-length run before the offset was
    // applied, so the odd alignment always lost the run's LAST byte - and the
    // end of a run is exactly where a name hides. Each offset is trimmed to a
    // whole number of bytes at its own end instead.
    const hexRuns = new RegExp(`[0-9a-fA-F]{${limits.hexMinRun},}`, 'gu');
    for (const run of line.match(hexRuns) ?? []) {
        for (let offset = 0; offset < 2; offset += 1) {
            const shifted = run.slice(offset);
            const whole = shifted.length % 2 === 0 ? shifted : shifted.slice(0, -1);
            add('hex', readable(Buffer.from(whole, 'hex'), limits.minTokenLength));
        }
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

/**
 * Numbers this repository is not allowed to contain.
 *
 * The inverse of the hash list, and deliberately so. A hash of a value drawn
 * from a small enumerable space is the value with extra steps - the space falls
 * in milliseconds - so that class is not hashed at all. What is published here
 * instead is an ALLOW-list: the numbers that are already visible in this
 * repository, with no captions saying what any of them is. It gives a reader
 * nothing they could not get by reading the files, and it catches every
 * internal value of this shape rather than the three somebody remembered.
 *
 * A match is reported by its length and its location, never its value.
 */
const YEAR_CONTEXT =
    /(?:copyright|\(c\)|©|january|february|march|april|may|june|july|august|september|october|november|december)[\s,]*$/u;

export function scanNumbers(line, rules, onFinding) {
    const { minDigits, maxDigits, allowed } = rules.numbers;
    const candidates = new RegExp(`(?<![0-9])[0-9]{${minDigits},${maxDigits}}(?![0-9])`, 'gu');
    let match;
    while ((match = candidates.exec(line)) !== null) {
        const before = match.index === 0 ? '' : line[match.index - 1];
        const after = line[match.index + match[0].length] ?? '';
        const glued = /[A-Za-z_]/u;
        const structural = /[.-]/u;
        if (glued.test(before) || glued.test(after)) {
            // Part of an identifier, a hash or a base64 blob, not a number.
            continue;
        }
        if (structural.test(before) || structural.test(after)) {
            // A date, a version or a dotted address: the digits belong to a
            // shape that is not a bare number.
            continue;
        }
        if (allowed.has(match[0])) {
            continue;
        }
        const lead = line.slice(Math.max(0, match.index - 14), match.index).toLowerCase();
        if (YEAR_CONTEXT.test(lead)) {
            // A copyright line or a date in prose. Years are not the shape this
            // check is about, and allow-listing each new one would rot annually.
            continue;
        }
        onFinding({
            kind: 'number',
            detail: `a ${match[0].length}-digit number that is not on the allow-list appears here - if it is a port or another internal value it does not belong in a public repository; if it is harmless, add it to numbers.allowed in scripts/rules.json`
        });
    }
}

/**
 * What the scanner still cannot see. Printed on every run, never implied.
 *
 * Every sentence about an encoding is computed from the same thresholds the
 * decoders use, so this list cannot drift into claiming a coverage the code
 * does not have - which is exactly what happened when the numbers lived in two
 * places and only one of them was true.
 */
export function blindSpots(rules) {
    const limits = thresholds(rules);
    return [
        `a name shorter than ${limits.minTokenLength} characters (the shortest rule is ${limits.minTokenLength}, the longest ${limits.maxTokenLength}; the decoders are sized to the shortest)`,
        `base64 in a run shorter than ${limits.base64MinRun} characters, or hex in a run shorter than ${limits.hexMinRun} - shorter than that there is no room for the shortest name`,
        `a number of fewer than ${rules.numbers.minDigits} or more than ${rules.numbers.maxDigits} digits, and any number that is not written as a bare number`,
        'a decoded run that contains even one byte outside printable ASCII - the run is discarded whole, so a name next to binary in the same run is not seen',
        `an identifier that breaks into more than ${MAX_IDENTIFIER_PIECES} pieces, which is skipped rather than combined`,
        'anything split across two lines, since every check reads one line at a time',
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

/**
 * True when a decoded view is exactly one of our own rule definitions.
 *
 * Deliberately an EXACT comparison against the rule sources and samples: a
 * decoded view that is precisely a rule's own text is this file talking about
 * itself, while the same shape inside a real statement is longer than any rule
 * definition and matches nothing here. It is a self-reference test, not an
 * exemption for a file.
 */
function isOwnRuleText(text, rules) {
    if (ownRuleTexts === undefined) {
        ownRuleTexts = new Set();
        for (const list of [rules.repositoryPatterns, rules.tarballPatterns, rules.embeddedSourcePatterns]) {
            for (const rule of list ?? []) {
                ownRuleTexts.add(rule.source);
                if (rule.sample !== undefined) {
                    ownRuleTexts.add(rule.sample);
                }
                ownRuleTexts.add([...rule.source].reverse().join(''));
                if (rule.sample !== undefined) {
                    ownRuleTexts.add([...rule.sample].reverse().join(''));
                }
            }
        }
    }
    return ownRuleTexts.has(text.trim());
}

let ownRuleTexts;

export function scanFile({ label, text, patterns, rules, extraTokenHashes = new Set(), onFinding }) {
    const limits = thresholds(rules);
    const lines = text.split('\n');
    for (const [index, line] of lines.entries()) {
        const where = `${label}:${index + 1}`;

        const views = [{ encoding: 'plaintext', text: line }, ...decodings(line, limits)];

        for (const view of views) {
            const ownDefinition = view.encoding !== 'plaintext' && isOwnRuleText(view.text, rules);
            for (const rule of patterns) {
                if (ownDefinition) {
                    // A decoded view that IS one of our own rule definitions is
                    // the rules file describing itself - today's, or an older
                    // one in the history. A rule matching its own definition is
                    // a self-reference, not a leak, and the alternative is to
                    // stop scanning a file, which is how the last one hid.
                    continue;
                }
                if (compile(rule).test(view.text)) {
                    // The shape, and where it is - not what matched. On a public
                    // repository the log is as published as the file.
                    onFinding({ kind: 'pattern', where, detail: `${rule.label}, as ${view.encoding}` });
                }
            }
            scanNumbers(view.text, rules, finding => {
                onFinding({ kind: finding.kind, where, detail: `${finding.detail} (as ${view.encoding})` });
            });
        }

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
