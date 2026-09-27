#!/usr/bin/env node
/**
 * Render `API.md` from `catalogue.json` — the snapshot captured from the
 * production MCP server.
 *
 * WHY IT IS GENERATED. A hand-written API reference is a claim about a server,
 * and the only thing that keeps such a claim true is somebody remembering. This
 * one is a rendering of the server's own answers to `initialize`, `tools/list`,
 * `resources/list`, `resources/templates/list` and `prompts/list`. Every tool
 * description here is the server's own text, verbatim, because that is what an
 * assistant actually reads when it decides which tool to call — paraphrasing it
 * would document a different server.
 *
 *   node scripts/gen-api-doc.mjs           # write API.md
 *   node scripts/gen-api-doc.mjs --check   # fail if API.md is not this output
 *
 * `--check` runs in CI, so API.md cannot drift from the snapshot. Refreshing the
 * snapshot is a separate, deliberate act: it needs a live read of production.
 */

import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { flatten } from './flatten.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const SNAPSHOT = join(ROOT, 'catalogue.json');
const TARGET = join(ROOT, 'API.md');

const HTTP_URL = 'https://mcp.viafrei.de/mcp';
const SSE_URL = 'https://mcp.viafrei.de/sse';

/**
 * An escaped pipe: a bare one would end the table cell it sits in. Written with
 * `String.raw` rather than `'\\|'` so the text in this source is the text that
 * reaches the document, with no reader having to unescape it in their head.
 *
 * Escaping happens in `cell()` and NOWHERE ELSE. Until the self-test went looking, a
 * union type was escaped twice — `typeOf` joined with an already-escaped pipe and
 * `cell` then escaped that pipe again, producing `string \\| null`: a literal
 * backslash in the document and a bare pipe left to end the row early. In a bullet,
 * which is not a table, it produced a stray backslash instead. No tool in this
 * snapshot declares a union type, so neither was reachable and no output comparison
 * could have found it. One escape, applied by the function that knows it is writing a
 * table cell, is right in both places.
 */
const ESCAPED_PIPE = String.raw`\|`;
const TYPE_UNION = ' | ';

/** A backtick, so nothing below has to escape one inside a template literal. */
const BACKTICK = '`';

/** A table cell: no unescaped pipe, no newline. */
const cell = value => flatten(String(value).replaceAll('|', ESCAPED_PIPE));

/** One value as a code span. A named helper, so no template literal nests another. */
const code = value => BACKTICK + value + BACKTICK;

/** `1`, `"de"`, `["a","b"]` — a default, written as JSON so it is unambiguous. */
const literal = value => code(JSON.stringify(value));

/** A union of types, or the one type, carrying a pipe the table survives. */
const typeNames = type => (Array.isArray(type) ? type.join(TYPE_UNION) : (type ?? ''));

function typeOf(schema) {
    if (!schema || typeof schema !== 'object') return '';
    const base = typeNames(schema.type);
    if (base !== 'array') return base;
    const { items } = schema;
    if (!items || typeof items !== 'object') return 'array';
    const inner = typeNames(items.type);
    return inner ? `array of ${inner}` : 'array';
}

/**
 * The pattern constraint: reproduced when a person can read it, SUMMARISED when
 * they cannot, and `null` when the schema states none.
 *
 * Two of these schemas carry a 288-character leap-year-validating ISO-8601 regex.
 * Reproducing it fills a table cell with something no reader will parse, while the
 * `format` and the description's worked example are what a caller actually needs.
 * The threshold is about legibility, and the length is still reported so nobody
 * thinks the constraint is absent.
 *
 * A long regex is also unscannable, and that decides where it may be STORED. Such a
 * pattern spells its date arithmetic as character classes of selected digits, and a
 * digit-run leak scanner cannot tell a class of five digits from a five-digit VALUE.
 * On the sweep's side both remedies are falsehoods: narrowing the scanner weakens it
 * for every file, and an allow-list entry would claim a character class is a number
 * this project publishes. So the text that cannot be scanned is not kept —
 * `catalogue.json` stores `patternLength` where the pattern is long, which is what
 * this function renders from it anyway, and the `$comment` there records the
 * substitution. Both shapes are accepted, because a future snapshot may carry either
 * and a reader may hold an older one.
 */
function patternConstraint(schema) {
    const chars = schema.patternLength
        ?? (typeof schema.pattern === 'string' ? schema.pattern.length : undefined);
    if (chars === undefined) return null;
    if (typeof schema.pattern === 'string' && schema.pattern.length <= 60) {
        return `pattern ${code(schema.pattern)}`;
    }
    return `pattern (${chars} characters — see the description; the ${code('format')} above is the short answer)`;
}

/**
 * The keys of a parameter whose constraints live one level down.
 *
 * `properties` is among the keywords `constraintsOf` treats as handled, so without
 * this the cell said "—" for the parameter that has the most to say — and the
 * unknown-keyword safety net could not catch it either, because the key IS known and
 * was simply never rendered. The keys are named here and described under the table,
 * where there is room for each one's own bounds.
 */
function nestedKeysConstraint(schema) {
    if (!schema.properties || typeof schema.properties !== 'object') return null;
    const keys = Object.keys(schema.properties);
    if (keys.length === 0) return null;
    return `keys: ${keys.map(code).join(', ')} (each described below)`;
}

/**
 * Every constraint the schema states, in one cell.
 *
 * Deliberately exhaustive rather than selective: a caller who sends a value
 * outside `pattern` or `maximum` gets an error, so a reference that omits the
 * bound has not documented the parameter. Anything this function does not know
 * how to render is listed as a bare key name instead of being dropped, so a new
 * keyword shows up as an untidy line rather than as silence.
 */
function constraintsOf(schema) {
    if (!schema || typeof schema !== 'object') return '';
    const parts = [];
    // `pattern` and `patternLength` are handled by patternConstraint below, and
    // `properties` by nestedKeysConstraint, so all three are seeded as handled here
    // rather than marked handled at the point of use.
    const seen = new Set([
        'type', 'description', 'default', 'items', 'properties', 'pattern', 'patternLength'
    ]);
    const push = (key, text) => { seen.add(key); if (schema[key] !== undefined) parts.push(text()); };

    push('enum', () => `one of ${schema.enum.map(literal).join(', ')}`);
    push('minimum', () => `min ${schema.minimum}`);
    push('maximum', () => `max ${schema.maximum}`);
    push('minLength', () => `min length ${schema.minLength}`);
    push('maxLength', () => `max length ${schema.maxLength}`);
    push('minItems', () => `min ${schema.minItems} item(s)`);
    push('maxItems', () => `max ${schema.maxItems} item(s)`);
    push('format', () => `format ${code(schema.format)}`);
    for (const extra of [patternConstraint(schema), nestedKeysConstraint(schema)]) {
        if (extra) parts.push(extra);
    }
    if (schema.items && typeof schema.items === 'object') {
        const inner = constraintsOf(schema.items);
        if (inner) parts.push(`each item: ${inner}`);
    }
    for (const key of Object.keys(schema)) {
        if (!seen.has(key) && !key.startsWith('$')) parts.push(code(key));
    }
    return parts.join('; ');
}

/** One row of the parameter table. */
function parameterRow(name, property, isRequired) {
    const fallback = property.default === undefined ? '—' : cell(literal(property.default));
    const constraints = cell(constraintsOf(property)) || '—';
    return `| ${code(name)} | ${cell(typeOf(property))} | ${isRequired ? '**yes**' : 'no'} | ${fallback} | ${constraints} |`;
}

/** One nested key, indented under its parent's bullet. */
function nestedKeyLine(key, inner, isRequired) {
    const facts = [
        typeOf(inner),
        isRequired ? '**required**' : null,
        // Included although no nested key carries one in today's snapshot: that is
        // the same shape as the bug this renderer exists to fix, and a default lost
        // silently is worse than one printed needlessly.
        inner.default === undefined ? null : `default ${literal(inner.default)}`,
        constraintsOf(inner)
    ]
        .filter(Boolean)
        .join(', ');
    const parenthesised = facts ? ` (${facts})` : '';
    const said = inner.description ? ` — ${flatten(inner.description)}` : '';
    return `  - ${code(key)}${parenthesised}${said}`;
}

/**
 * The prose under the table: one bullet per described parameter, and a nested
 * object's own keys indented beneath it.
 *
 * Those nested lines are emitted whether or not the parent carried a description,
 * because the reason to print them is that they are constraints a caller can
 * violate — not that the parent had something to say.
 */
function parameterProse(properties, names) {
    const lines = [];
    for (const name of names) {
        const property = properties[name];
        const { description } = property;
        if (description) lines.push(`- **${code(name)}** — ${flatten(description)}`);
        const nested = property.properties;
        if (!nested || typeof nested !== 'object') continue;
        if (!description) lines.push(`- **${code(name)}**`);
        const required = new Set(Array.isArray(property.required) ? property.required : []);
        for (const key of Object.keys(nested)) {
            lines.push(nestedKeyLine(key, nested[key], required.has(key)));
        }
    }
    return lines;
}

function parameterTable(schema) {
    const properties = schema?.properties ?? {};
    const names = Object.keys(properties);
    if (names.length === 0) return ['_No parameters._', ''];
    // `Array.isArray` rather than `?? []`: a malformed `required` (a boolean, say)
    // is not nullish, so `??` passes it to `new Set` and a TypeError comes out of a
    // renderer that promises named refusals. Unreachable from a real capture, and
    // exactly the shape of the precondition bug this branch already fixed once.
    const required = new Set(Array.isArray(schema?.required) ? schema.required : []);
    // Required first, then alphabetical: the reader's question is almost always
    // "what is the least I have to send".
    names.sort((a, b) => (required.has(b) ? 1 : 0) - (required.has(a) ? 1 : 0) || a.localeCompare(b));

    return [
        '| parameter | type | required | default | constraints |',
        '| --- | --- | --- | --- | --- |',
        ...names.map(name => parameterRow(name, properties[name], required.has(name))),
        '',
        ...parameterProse(properties, names),
        ''
    ];
}

/** The server's own instructions to a connecting client, quoted line by line. */
function instructionLines(catalogue) {
    return String(catalogue.instructions ?? '')
        .trim()
        .split('\n')
        .map(line => `> ${line}`.trimEnd());
}

/** The behaviour flags a tool's annotations state, in the order a caller cares about. */
function annotationFlags(annotations) {
    const flags = [];
    if (annotations.readOnlyHint === true) flags.push('**Read-only** — it changes nothing.');
    if (annotations.readOnlyHint === false) flags.push('**Not read-only** — it creates or removes state.');
    if (annotations.openWorldHint === true) flags.push('Reaches a third-party source (open world).');
    if (annotations.openWorldHint === false) flags.push('Answers from data this service already holds (closed world).');
    if (annotations.idempotentHint !== undefined) flags.push(`Idempotent: ${annotations.idempotentHint}.`);
    if (annotations.destructiveHint !== undefined) flags.push(`Destructive: ${annotations.destructiveHint}.`);
    return flags;
}

/** One tool: heading, behaviour flags, the server's own description, the parameters. */
function toolLines(tool) {
    const annotations = tool.annotations ?? {};
    const title = annotations.title ?? tool.title;
    const heading = title ? `### ${code(tool.name)} — ${title}` : `### ${code(tool.name)}`;
    const flags = annotationFlags(annotations);
    return [
        heading,
        '',
        ...(flags.length > 0 ? [flags.join(' '), ''] : []),
        '> ' + flatten(tool.description),
        '',
        ...parameterTable(tool.inputSchema)
    ];
}

/**
 * A URI table, then one bullet per described entry.
 *
 * Resources and resource templates differ only in which field carries the URI and
 * what that column is called, so they share this rather than carrying two copies of
 * the same six lines — which is how the two drifted apart in the first draft.
 */
function uriSection(heading, columnLabel, entries, uriOf) {
    return [
        heading,
        '',
        `| ${columnLabel} | name | type |`,
        '| --- | --- | --- |',
        ...entries.map(entry => `| ${code(uriOf(entry))} | ${cell(entry.name ?? '')} | ${code(entry.mimeType ?? '')} |`),
        '',
        ...entries
            .filter(entry => entry.description)
            .map(entry => `- **${code(uriOf(entry))}** — ${cell(entry.description)}`),
        ''
    ];
}

/** One prompt: name, title, description, and its arguments. */
function promptLines(prompt) {
    const lines = [`### ${code(prompt.name)}`, ''];
    if (prompt.title) lines.push(`*${prompt.title}*`, '');
    if (prompt.description) lines.push('> ' + cell(prompt.description), '');
    const args = prompt.arguments ?? [];
    if (args.length === 0) return [...lines, '_No arguments._', ''];
    return [
        ...lines,
        '| argument | required | description |',
        '| --- | --- | --- |',
        ...args.map(argument =>
            `| ${code(argument.name)} | ${argument.required ? '**yes**' : 'no'} | ${cell(argument.description ?? '')} |`),
        ''
    ];
}

function render(catalogue) {
    const { tools, resources, resourceTemplates, prompts, serverInfo, protocolVersion, capabilities } = catalogue;
    const out = [];
    const w = (...lines) => out.push(...lines);
    const capabilityNames = Object.keys(capabilities ?? {}).map(code).join(', ') || '—';

    w(
        '# API reference',
        '',
        '**This file is generated. Do not edit it by hand.**',
        '',
        'It is a rendering of what the production ViaFrei MCP server answered when it',
        'was asked to describe itself — `initialize`, `tools/list`, `resources/list`,',
        '`resources/templates/list` and `prompts/list`. Every tool description below is',
        "the server's own text, reproduced verbatim, because that text is what an",
        'assistant reads when it decides which tool to call; paraphrasing it here would',
        'document a different server.',
        '',
        `**It is a dated snapshot, taken on ${catalogue.capturedAt}.** Generating this file makes`,
        'it impossible for the document and the snapshot to disagree — CI regenerates and',
        'compares — but it cannot keep the snapshot from ageing against the live server,',
        'because a capture is a point in time. **The source of truth is the running',
        'server:** connect any MCP client and call `tools/list`.',
        '',
        '| | |',
        '| --- | --- |',
        `| Server | \`${serverInfo?.name ?? 'unknown'}\` ${serverInfo?.version ?? ''} |`,
        `| MCP protocol | \`${protocolVersion}\` |`,
        `| Streamable HTTP | ${HTTP_URL} |`,
        `| Legacy HTTP+SSE | ${SSE_URL} |`,
        `| Captured from | \`${catalogue.source}\` on ${catalogue.capturedAt} |`,
        `| Surface | ${tools.length} tools, ${resources.length} resources, ${resourceTemplates.length} resource templates, ${prompts.length} prompts |`,
        '| Parameter schemas | JSON Schema draft-07 |',
        `| Capabilities | ${capabilityNames} |`,
        '',
        'No API key. No account. No sign-up.',
        '',
        '## Contents',
        '',
        `- [How to read a result](#how-to-read-a-result)`,
        `- [Tools](#tools) — ${tools.length}`,
        `- [Resources](#resources) — ${resources.length}`,
        `- [Resource templates](#resource-templates) — ${resourceTemplates.length}`,
        `- [Prompts](#prompts) — ${prompts.length}`,
        '',
        '## How to read a result',
        '',
        'Every tool returns MCP content blocks. The text block is written to be read',
        'aloud to a person; structured detail travels in `_meta`.',
        '',
        'Three things are conditions of use rather than presentation, and they are the',
        'same for every tool here:',
        '',
        '1. **Show the attribution line a result carries.** It is a licence condition of',
        '   the data, not a credit you may drop for brevity.',
        '2. **If a result carries `_meta.purposeNote`, reproduce that sentence verbatim.**',
        '   It states a limit the publisher places on what the data may be used for.',
        '3. **Do not redistribute what the licence does not allow you to.** Fuel prices in',
        '   particular are consumer information only. The per-source terms, and the two',
        '   conditions that are licence breaches rather than style problems, are in',
        '   [SOURCES.md](SOURCES.md).',
        '',
        'Times are Europe/Berlin. Every tool takes a `language` parameter; set it to the',
        'language the person is writing in rather than relying on the default.',
        '',
        "The server's own instructions to a connecting client, verbatim:",
        ''
    );
    w(...instructionLines(catalogue));

    w('', '## Tools', '');
    for (const tool of tools) w(...toolLines(tool));

    w(...uriSection('## Resources', 'URI', resources, resource => resource.uri));
    w(...uriSection('## Resource templates', 'URI template', resourceTemplates, template => template.uriTemplate));

    w(
        '## Prompts',
        '',
        'Prompts are ready-made requests a client can offer as a menu entry. Each one',
        'orchestrates several tools, so it is usually a better starting point than a',
        'single call.',
        ''
    );
    for (const prompt of prompts) w(...promptLines(prompt));

    w(
        '---',
        '',
        `Generated from \`catalogue.json\` by \`scripts/gen-api-doc.mjs\`. The snapshot was`,
        `read from \`${catalogue.source}\` on ${catalogue.capturedAt}; no tool was invoked to`,
        'produce it, so no data provider was contacted.',
        ''
    );
    return out.join('\n');
}

function main(argv) {
    let catalogue;
    try {
        catalogue = JSON.parse(readFileSync(SNAPSHOT, 'utf8'));
    } catch (error) {
        console.error(`gen-api-doc: cannot read ${SNAPSHOT} — ${error.message}`);
        return 2;
    }
    // Preconditions. A generator handed an empty catalogue would write a
    // plausible, complete-looking document describing nothing, and `--check`
    // would then hold the repository to it.
    // `resourceTemplates` has a floor of 0 because a server may legitimately
    // register none - but it must still BE an array. Leaving it out of this loop
    // entirely meant a snapshot missing the key died with a TypeError deep in the
    // renderer, and one set to [] rendered a document describing no templates and
    // then passed `--check` against it, reporting "0 template(s)" as a success.
    for (const [key, floor] of [['tools', 1], ['resources', 1], ['prompts', 1], ['resourceTemplates', 0]]) {
        if (!Array.isArray(catalogue[key])) {
            console.error(`gen-api-doc: catalogue.json has no ${key} array — refusing to render a reference to nothing`);
            return 2;
        }
        if (catalogue[key].length < floor) {
            console.error(`gen-api-doc: catalogue.json lists no ${key} — refusing to render a reference to nothing`);
            return 2;
        }
    }
    if (!catalogue.protocolVersion || !catalogue.source || !catalogue.capturedAt) {
        console.error('gen-api-doc: catalogue.json is missing protocolVersion, source or capturedAt');
        return 2;
    }

    // ONE string, used for the comparison AND for the write. These were two until
    // review round 2: `--check` compared `render()`'s output while the write path
    // wrote a newline-normalised copy of it. `render()` ends in a newline today, so
    // nothing showed - and the failure it was storing up is the worst shape a gate
    // has, `--check` going red on the file `docs:api` had just written, blaming a
    // hand edit, and not fixable by running the generator again.
    const rendered = render(catalogue);
    const document = rendered.endsWith('\n') ? rendered : `${rendered}\n`;
    if (argv.includes('--check')) {
        let current;
        try {
            current = readFileSync(TARGET, 'utf8');
        } catch {
            console.error('gen-api-doc: API.md does not exist — run `npm run docs:api`');
            return 1;
        }
        if (current !== document) {
            console.error(
                'gen-api-doc: API.md is not what catalogue.json renders to. Either it was ' +
                'edited by hand, or the snapshot changed and the file was not regenerated. ' +
                'Run `npm run docs:api`.'
            );
            return 1;
        }
        console.log(
            `gen-api-doc: API.md matches catalogue.json — ${catalogue.tools.length} tool(s), ` +
            `${catalogue.resources.length} resource(s), ${catalogue.resourceTemplates.length} template(s), ` +
            `${catalogue.prompts.length} prompt(s), captured ${catalogue.capturedAt}`
        );
        return 0;
    }
    // Counted the way `wc -l` counts, deliberately. `split('\n').length` is one
    // higher, because the trailing newline yields a final empty string, and that
    // number was copied out of this line into a commit message where it was wrong.
    writeFileSync(TARGET, document);
    console.log(`gen-api-doc: wrote API.md — ${document.split('\n').length - 1} lines from ${catalogue.tools.length} tool(s)`);
    return 0;
}

process.exit(main(process.argv.slice(2)));
