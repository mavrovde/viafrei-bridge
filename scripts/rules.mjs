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
 *    check that quietly cannot see something is worse than one that says so -
 *    and a list printed on every run is READ as exhaustive, so anything known
 *    to be missing belongs in it rather than in a commit message.
 * 3. **A separator is not a disguise, and neither is the absence of one.** A
 *    two-word name written with a hyphen, a dot, a slash, a space or a capital
 *    letter is the same name as the underscore spelling, and those are the
 *    spellings that reach a README sentence or a URL path. `tokenCandidates()`
 *    cuts at all of them - and also reads every run of letters and digits as a
 *    sliding window, so a name welded into a longer run with no separator and
 *    no case change is seen too. That last one was the gap: it scored 0 out of
 *    60 placements when the filler was lower case.
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
        historyNumberResidue: (rules.historyNumberResidue ?? []).map(entry => ({
            blob: String(entry.blob ?? ''),
            findings: entry.findings
        })),
        repositoryPatterns: rules.repositoryPatterns.map(decode),
        tarballPatterns: rules.tarballPatterns.map(decode),
        embeddedSourcePatterns: rules.embeddedSourcePatterns.map(decode)
    };
}

/**
 * Hashing is memoised because the same identifier recurs on thousands of lines
 * and the candidate generator is deliberately generous. The cache is keyed by
 * salt and token, so two rulesets in one process cannot see each other's
 * answers.
 */
const digests = new Map();

export function hashToken(salt, token) {
    const key = `${salt.length}:${salt}:${token}`;
    let digest = digests.get(key);
    if (digest === undefined) {
        digest = createHash('sha256').update(`${salt}:${token.toLowerCase()}`).digest('hex');
        if (digests.size < 500_000) {
            digests.set(key, digest);
        }
    }
    return digest;
}

/**
 * A string that came out of scanned content, made safe to print.
 *
 * `opaque` is for a string that IS the thing a rule rejected - a host that is
 * not on the allow-list, a dependency spec that is not a registry range. There
 * is nothing safe to show, so the reader gets the category (from the caller),
 * the length and a hash prefix, and opens the file to see the rest.
 *
 * `safeString` is for a string that is a LOCATION rather than a value - a file
 * path. A path is worth printing, and a path can also carry a private name in
 * it (`dist/<name>.js`), which nothing else in this code would ever have
 * caught, because the scanners read file contents and not file names. So the
 * path is printed unless it contains a private name, and withheld if it does.
 *
 * `extraTokenHashes` is honoured here as well as in the scan. It was not, so
 * the one channel the self-test has for proving this path works - a hash
 * handed in for a name invented at run time - could not reach it, and the
 * withholding branch was therefore never executed by anything.
 */
export function opaque(value, rules) {
    return `${value.length} characters, hash ${hashToken(rules.salt, value).slice(0, 12)}…`;
}

/**
 * An error message, made safe to print, on one line.
 *
 * A thrown message is text this code did not write - it can carry a path, a
 * command line, or whatever a child process put on stderr - so it goes through
 * the same door as every other uncontrolled string instead of being printed
 * raw in one file and refused outright in another. One rule, both legs.
 */
export function safeMessage(error, rules, extraTokenHashes = new Set(), limit = 300) {
    const text = (error instanceof Error ? error.message : String(error)).replace(/\s+/gu, ' ').trim();
    const clipped = text.length > limit ? `${text.slice(0, limit - 1)}…` : text;
    return safeString(clipped, rules, extraTokenHashes);
}

export function safeString(value, rules, extraTokenHashes = new Set()) {
    const limits = thresholds(rules);
    for (const candidate of tokenCandidates(value, limits)) {
        const digest = hashToken(rules.salt, candidate);
        if (rules.tokenHashes.has(digest) || extraTokenHashes.has(digest)) {
            return `[withheld: ${opaque(value, rules)}, it contains a private name]`;
        }
    }
    return value;
}

export function compile(rule) {
    return new RegExp(rule.source, `${rule.flags ?? ''}u`);
}

/**
 * Every name a line could be hiding.
 *
 * A plain word list would miss a private name buried inside a longer
 * identifier (`my_<name>_backup`), welded to a word (`port<number>`), or
 * simply spelled with a separator other than the one somebody thought of. The
 * previous version split at `_` and at letter/digit boundaries only, so the
 * underscore spelling of a two-word name was caught and the hyphen, dot,
 * slash, space and camelCase spellings of the same name were all invisible -
 * which is exactly how such a name reaches a README sentence, a URL path or a
 * schema-qualified string.
 *
 * So the line is cut into pieces at EVERY non-alphanumeric character and at
 * every letter/digit and camel-case boundary, and every contiguous window of
 * pieces is offered, joined with an underscore and joined with nothing. The
 * windows cross the old separators, so one construction covers all of them.
 *
 * Windows are bounded by the rules rather than by a count of pieces: a
 * candidate shorter than the shortest name on the list, or longer than the
 * longest, cannot be one of them, so it is never hashed. That bound is what
 * keeps a line of prose - now one run of pieces from end to end - cheap, and
 * it replaces the old piece-count cliff that skipped a long identifier whole
 * rather than looking inside it.
 *
 * The bound is sound only while every hash on the list is of a token inside
 * `minTokenLength`…`maxTokenLength`; `_tokenLength` in rules.json is that
 * promise, `blindSpots()` states it on every run, and a hash passed in through
 * `VF_EXTRA_TOKEN_HASHES` has to keep it too.
 */
/** Pieces: a camel-case hump, an all-caps run, a lower-case word, a digit run. */
const PIECE = /[A-Z]+(?![a-z])|[A-Z][a-z]*|[a-z]+|[0-9]+/gu;

export function linePieces(line) {
    const pieces = [];
    for (const chunk of line.match(/[A-Za-z0-9]+/gu) ?? []) {
        for (const piece of chunk.match(PIECE) ?? []) {
            pieces.push(piece.toLowerCase());
        }
    }
    return pieces;
}

export function tokenCandidates(line, limits) {
    const min = limits.minTokenLength;
    const max = limits.maxTokenLength;
    const candidates = new Set();
    const offer = value => {
        if (value.length >= min && value.length <= max) {
            candidates.add(value);
        }
    };
    // The identifier exactly as written, underscores included: a name spelled
    // with a doubled or a trailing underscore survives here and nowhere else,
    // because the piece windows normalise every separator to one underscore.
    for (const run of line.match(/[A-Za-z0-9_]+/gu) ?? []) {
        offer(run.toLowerCase());
    }
    // A run with no boundary in it at all.
    //
    // The window construction needs something to cut at - a separator or a
    // change of case. Inside one long unbroken alphanumeric run there is
    // neither, so a name glued between filler letters was invisible at every
    // length and in every encoding: 0/30 on a probe with lower-case filler,
    // 0/30 with upper-case, 30/30 as soon as any separator appeared. That is
    // the shape a name takes inside decoded hex or a minified bundle, which is
    // exactly where one would be hiding.
    //
    // So a run longer than the SHORTEST name is also read as a sliding window,
    // which is the only construction that can find a boundary-free name. The
    // threshold is the shortest and not the longest: a run of exactly
    // `maxTokenLength` can still hold a shorter name glued inside it, and
    // testing `> max` left precisely that case missing - 7-character names in
    // a 15-character run, the three placements that still failed the probe.
    // Runs no longer than the shortest name are skipped because the piece
    // windows already offer them whole.
    for (const chunk of line.match(/[A-Za-z0-9]+/gu) ?? []) {
        if (chunk.length <= min) {
            continue;
        }
        const lowered = chunk.toLowerCase();
        for (let start = 0; start + min <= lowered.length; start += 1) {
            const limit = Math.min(max, lowered.length - start);
            for (let width = min; width <= limit; width += 1) {
                candidates.add(lowered.slice(start, start + width));
            }
        }
    }
    const pieces = linePieces(line);
    for (let start = 0; start < pieces.length; start += 1) {
        let glued = '';
        let joined = '';
        for (let end = start; end < pieces.length; end += 1) {
            glued += pieces[end];
            joined += end === start ? pieces[end] : `_${pieces[end]}`;
            // `glued` is the shorter of the two spellings and only grows, so
            // once it is too long every longer window is too.
            if (glued.length > max) {
                break;
            }
            offer(glued);
            offer(joined);
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
 *
 * The same argument applies to the numbers window, and until round 5 it was
 * not applied there. `numbers.minDigits`/`maxDigits` were only type-checked,
 * so a window of 20-25 digits made the number rule match nothing at all and
 * BOTH legs still exited 0 and printed PASS - a gate with no input reporting
 * success, in the one rule that now carries every numeric check. Every other
 * rule list here refuses when it empties; this one does too now, and the
 * refusal is derived rather than felt: the allow-list is the statement of what
 * numbers this repository contains, so a window that does not contain the
 * allow-list is a window that has stopped describing the same class.
 */
export function thresholds(rules) {
    const min = rules.minTokenLength;
    const max = rules.maxTokenLength;
    if (!Number.isInteger(min) || min < 1) {
        throw new Error('rules.json must declare minTokenLength as a whole number of at least 1: the decoders size themselves from it');
    }
    if (!Number.isInteger(max) || max < min) {
        throw new Error('rules.json must declare maxTokenLength, and it may not be smaller than minTokenLength');
    }
    const { minDigits, maxDigits, allowed } = rules.numbers ?? {};
    if (!Number.isInteger(minDigits) || minDigits < 1) {
        throw new Error('rules.json must declare numbers.minDigits as a whole number of at least 1');
    }
    if (!Number.isInteger(maxDigits) || maxDigits < minDigits) {
        throw new Error('rules.json must declare numbers.maxDigits, and it may not be smaller than numbers.minDigits');
    }
    if (!(allowed instanceof Set) || allowed.size === 0) {
        throw new Error(
            'numbers.allowed is empty: it is the whole of the numeric coverage, and an empty rule list is a refusal here like every other one'
        );
    }
    // Reported by count, never by value - this message reaches a public CI log.
    const shaped = [...allowed].filter(entry => /^[0-9]+$/u.test(entry));
    if (shaped.length !== allowed.size) {
        throw new Error(`${allowed.size - shaped.length} of the ${allowed.size} numbers.allowed entries are not bare digits, so they can never match`);
    }
    const inside = shaped.filter(entry => entry.length >= minDigits && entry.length <= maxDigits);
    if (inside.length !== shaped.length) {
        throw new Error(
            `${shaped.length - inside.length} of the ${shaped.length} numbers.allowed entries fall outside the ${minDigits}-${maxDigits} digit window, ` +
                'so the window and the allow-list no longer describe the same class of number and the rule checks less than it claims'
        );
    }
    return {
        minTokenLength: min,
        maxTokenLength: max,
        minDigits,
        maxDigits,
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

export function scanNumbers(line, rules, onFinding, limits = thresholds(rules)) {
    const { minDigits, maxDigits } = limits;
    const allowed = rules.numbers.allowed;
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
        `a name shorter than ${limits.minTokenLength} characters or longer than ${limits.maxTokenLength} - the rules cover that range, the decoders are sized to the shortest, and no candidate outside it is hashed`,
        `base64 in a run shorter than ${limits.base64MinRun} characters, or hex in a run shorter than ${limits.hexMinRun} - shorter than that there is no room for the shortest name`,
        `a number of fewer than ${limits.minDigits} or more than ${limits.maxDigits} digits, and any number that is not written as a bare number`,
        'a decoded run that contains even one byte outside printable ASCII - the run is discarded whole, so a name next to binary in the same run is not seen',
        'an encoding inside an encoding: each line is decoded exactly ONE level, so base64 of base64, or base64 of hex, is not seen',
        'a name written backwards, which is worth naming because this repository uses reversal as an encoding itself in scripts/rules.json',
        'a listed name that is not spelled in letters, digits and underscores: every candidate is drawn from [a-z0-9_], so a hash of a name containing anything else matches nothing, and this file cannot detect that for you because it holds hashes rather than names',
        'a near-miss rather than a spelling: a character inserted into, removed from or changed inside a name is a different string and is not matched - what IS matched is the same name written with any separator, with none at all, or buried inside a longer run',
        'UTF-16 or any other wide encoding - every decoder reads its bytes as UTF-8',
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
 *
 * Both sides are trimmed. The comparison used to trim the decoded view and not
 * the rule sources, and one rule source carries leading whitespace, so that
 * rule could never reach its own exclusion - harmless in practice, but the
 * exactness is claimed here and a claim that is not true of every rule is not
 * exactness.
 */
function isOwnRuleText(text, rules) {
    if (ownRuleTexts === undefined) {
        ownRuleTexts = new Set();
        const remember = value => {
            ownRuleTexts.add(value.trim());
            ownRuleTexts.add([...value].reverse().join('').trim());
        };
        for (const list of [rules.repositoryPatterns, rules.tarballPatterns, rules.embeddedSourcePatterns]) {
            for (const rule of list ?? []) {
                remember(rule.source);
                if (rule.sample !== undefined) {
                    remember(rule.sample);
                }
            }
        }
    }
    return ownRuleTexts.has(text.trim());
}

let ownRuleTexts;

export function scanFile({ label, text, patterns, rules, extraTokenHashes = new Set(), onFinding }) {
    const limits = thresholds(rules);

    /**
     * Every `where` this function emits is built from here, once.
     *
     * The previous round taught the listing to withhold a path that carries a
     * private name and left the FINDINGS printing `label` raw - so the one
     * line that says "a private name is in this path" printed the path, and so
     * did every content finding in such a file. The leak lived in the branch
     * that only executes when a name is actually present, which is the branch
     * that matters. Two printing sites to remember is one too many: there is
     * one construction site now, and callers may print `finding.where`
     * verbatim because it left here safe.
     */
    const safeLabel = safeString(label, rules, extraTokenHashes);

    // The NAME of the file, not only its contents. Nothing scanned the labels
    // before, so a private name in a path - `dist/<name>.js` - was invisible to
    // every rule here and was then printed verbatim by the caller's listing.
    for (const candidate of tokenCandidates(label, limits)) {
        const digest = hashToken(rules.salt, candidate);
        if (rules.tokenHashes.has(digest) || extraTokenHashes.has(digest)) {
            onFinding({
                kind: 'private name',
                where: safeLabel,
                detail: `a private name (hash ${digest.slice(0, 12)}…) is in this path, not only in what it contains`
            });
        }
    }

    const lines = text.split('\n');
    for (const [index, line] of lines.entries()) {
        const where = `${safeLabel}:${index + 1}`;

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
            scanNumbers(
                view.text,
                rules,
                finding => {
                    onFinding({ kind: finding.kind, where, detail: `${finding.detail} (as ${view.encoding})` });
                },
                limits
            );
        }

        for (const view of views) {
            for (const candidate of tokenCandidates(view.text, limits)) {
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
