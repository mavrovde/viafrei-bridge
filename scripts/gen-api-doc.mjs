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

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const SNAPSHOT = join(ROOT, 'catalogue.json');
const TARGET = join(ROOT, 'API.md');

const HTTP_URL = 'https://mcp.viafrei.de/mcp';
const SSE_URL = 'https://mcp.viafrei.de/sse';

/** A table cell: no unescaped pipe, no newline. */
const cell = value => String(value).replace(/\|/gu, '\\|').replace(/\s*\n\s*/gu, ' ').trim();

/** `1`, `"de"`, `["a","b"]` — a default, written as JSON so it is unambiguous. */
const literal = value => `\`${JSON.stringify(value)}\``;

function typeOf(schema) {
    if (!schema || typeof schema !== 'object') return '';
    const { type, items } = schema;
    const base = Array.isArray(type) ? type.join(' \\| ') : (type ?? '');
    if (base === 'array' && items && typeof items === 'object') {
        const inner = Array.isArray(items.type) ? items.type.join(' \\| ') : (items.type ?? '');
        return inner ? `array of ${inner}` : 'array';
    }
    return base;
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
    const seen = new Set(['type', 'description', 'default', 'items', 'properties']);
    const push = (key, text) => { seen.add(key); if (schema[key] !== undefined) parts.push(text()); };

    push('enum', () => `one of ${schema.enum.map(literal).join(', ')}`);
    push('minimum', () => `min ${schema.minimum}`);
    push('maximum', () => `max ${schema.maximum}`);
    push('minLength', () => `min length ${schema.minLength}`);
    push('maxLength', () => `max length ${schema.maxLength}`);
    push('minItems', () => `min ${schema.minItems} item(s)`);
    push('maxItems', () => `max ${schema.maxItems} item(s)`);
    push('format', () => `format \`${schema.format}\``);
    // A pattern is reproduced when a person can read it, and SUMMARISED when they
    // cannot. Two of these schemas carry a 288-character leap-year-validating
    // ISO-8601 regex: reproducing it fills a table cell with something no reader
    // will parse, while the `format` and the description's worked example are what
    // a caller actually needs. The threshold is about legibility, and the length is
    // still reported so nobody thinks the constraint is absent.
    //
    // A long regex is also unscannable, and that decides where it may be STORED.
    // Such a pattern spells its date arithmetic as character classes of selected
    // digits, and a digit-run leak scanner cannot tell a class of five digits from a
    // five-digit VALUE. On the sweep's side both remedies are falsehoods: narrowing
    // the scanner weakens it for every file, and an allow-list entry would claim a
    // character class is a number this project publishes. So the text that cannot be
    // scanned is not kept — `catalogue.json` stores `patternLength` where the
    // pattern is long, which is what this function renders from it anyway, and the
    // `$comment` there records the substitution. Both shapes are accepted, because a
    // future snapshot may carry either and a reader may hold an older one.
    const patternChars = schema.patternLength ?? (typeof schema.pattern === 'string' ? schema.pattern.length : undefined);
    seen.add('pattern');
    seen.add('patternLength');
    if (patternChars !== undefined) {
        parts.push(typeof schema.pattern === 'string' && schema.pattern.length <= 60
            ? `pattern \`${schema.pattern}\``
            : `pattern (${patternChars} characters — see the description; the \`format\` above is the short answer)`);
    }

    // A parameter whose constraints live one level down. `properties` is in `seen`,
    // so without this the cell said "—" for the parameter that has the most to say,
    // and the unknown-keyword safety net could not catch it either: the key IS
    // known, it was simply never rendered. The keys are named here and described
    // under the table, where there is room for each one's own bounds.
    if (schema.properties && typeof schema.properties === 'object') {
        const nested = Object.keys(schema.properties);
        if (nested.length > 0) {
            parts.push(`keys: ${nested.map(key => `\`${key}\``).join(', ')} (each described below)`);
        }
    }

    if (schema.items && typeof schema.items === 'object') {
        const inner = constraintsOf(schema.items);
        if (inner) parts.push(`each item: ${inner}`);
    }
    for (const key of Object.keys(schema)) {
        if (!seen.has(key) && !key.startsWith('$')) parts.push(`\`${key}\``);
    }
    return parts.join('; ');
}

function parameterTable(schema) {
    const properties = (schema && schema.properties) || {};
    const names = Object.keys(properties);
    if (names.length === 0) return ['_No parameters._', ''];
    const required = new Set((schema && schema.required) || []);
    // Required first, then alphabetical: the reader's question is almost always
    // "what is the least I have to send".
    names.sort((a, b) => (required.has(b) ? 1 : 0) - (required.has(a) ? 1 : 0) || a.localeCompare(b));

    const lines = [
        '| parameter | type | required | default | constraints |',
        '| --- | --- | --- | --- | --- |'
    ];
    for (const name of names) {
        const property = properties[name];
        lines.push(`| \`${name}\` | ${cell(typeOf(property))} | ${required.has(name) ? '**yes**' : 'no'} | ${
            property.default === undefined ? '—' : cell(literal(property.default))
        } | ${cell(constraintsOf(property)) || '—'} |`);
    }
    lines.push('');
    const prose = text => text.replace(/\s*\n\s*/gu, ' ').trim();
    for (const name of names) {
        const property = properties[name];
        const description = property.description;
        if (description) lines.push(`- **\`${name}\`** — ${prose(description)}`);
        // A nested object's own keys, each with its type, its bounds and its text.
        // Emitted whether or not the parent carried a description, because the
        // reason to print them is that they are constraints a caller can violate.
        const nested = property.properties;
        if (!nested || typeof nested !== 'object') continue;
        if (!description) lines.push(`- **\`${name}\`**`);
        const innerRequired = new Set(property.required ?? []);
        for (const key of Object.keys(nested)) {
            const inner = nested[key];
            const facts = [
                typeOf(inner),
                innerRequired.has(key) ? '**required**' : null,
                // Included although no nested key carries one in today's snapshot:
                // that is the same shape as the bug this renderer exists to fix, and
                // a default lost silently is worse than one printed needlessly.
                inner.default === undefined ? null : `default ${literal(inner.default)}`,
                constraintsOf(inner)
            ]
                .filter(Boolean)
                .join(', ');
            const said = inner.description ? ` — ${prose(inner.description)}` : '';
            lines.push(`  - \`${key}\`${facts ? ` (${facts})` : ''}${said}`);
        }
    }
    lines.push('');
    return lines;
}

function render(catalogue) {
    const { tools, resources, resourceTemplates, prompts, serverInfo, protocolVersion, capabilities } = catalogue;
    const out = [];
    const w = (...lines) => out.push(...lines);

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
        `| Capabilities | ${Object.keys(capabilities ?? {}).map(name => `\`${name}\``).join(', ') || '—'} |`,
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
    for (const line of String(catalogue.instructions ?? '').trim().split('\n')) {
        w(`> ${line}`.trimEnd());
    }

    w('', '## Tools', '');
    for (const tool of tools) {
        const annotations = tool.annotations ?? {};
        const title = annotations.title ?? tool.title;
        w(`### \`${tool.name}\`${title ? ` — ${title}` : ''}`, '');
        const flags = [];
        if (annotations.readOnlyHint === true) flags.push('**Read-only** — it changes nothing.');
        if (annotations.readOnlyHint === false) flags.push('**Not read-only** — it creates or removes state.');
        if (annotations.openWorldHint === true) flags.push('Reaches a third-party source (open world).');
        if (annotations.openWorldHint === false) flags.push('Answers from data this service already holds (closed world).');
        if (annotations.idempotentHint !== undefined) flags.push(`Idempotent: ${annotations.idempotentHint}.`);
        if (annotations.destructiveHint !== undefined) flags.push(`Destructive: ${annotations.destructiveHint}.`);
        if (flags.length > 0) w(flags.join(' '), '');
        w('> ' + String(tool.description).replace(/\s*\n\s*/gu, ' ').trim(), '');
        w(...parameterTable(tool.inputSchema));
    }

    w('## Resources', '');
    w('| URI | name | type |', '| --- | --- | --- |');
    for (const resource of resources) {
        w(`| \`${resource.uri}\` | ${cell(resource.name ?? '')} | \`${resource.mimeType ?? ''}\` |`);
    }
    w('');
    for (const resource of resources) {
        if (resource.description) w(`- **\`${resource.uri}\`** — ${cell(resource.description)}`);
    }
    w('');

    w('## Resource templates', '');
    w('| URI template | name | type |', '| --- | --- | --- |');
    for (const template of resourceTemplates) {
        w(`| \`${template.uriTemplate}\` | ${cell(template.name ?? '')} | \`${template.mimeType ?? ''}\` |`);
    }
    w('');
    for (const template of resourceTemplates) {
        if (template.description) w(`- **\`${template.uriTemplate}\`** — ${cell(template.description)}`);
    }
    w('');

    w(
        '## Prompts',
        '',
        'Prompts are ready-made requests a client can offer as a menu entry. Each one',
        'orchestrates several tools, so it is usually a better starting point than a',
        'single call.',
        ''
    );
    for (const prompt of prompts) {
        w(`### \`${prompt.name}\``, '');
        if (prompt.title) w(`*${prompt.title}*`, '');
        if (prompt.description) w('> ' + cell(prompt.description), '');
        const args = prompt.arguments ?? [];
        if (args.length === 0) {
            w('_No arguments._', '');
            continue;
        }
        w('| argument | required | description |', '| --- | --- | --- |');
        for (const argument of args) {
            w(`| \`${argument.name}\` | ${argument.required ? '**yes**' : 'no'} | ${cell(argument.description ?? '')} |`);
        }
        w('');
    }

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
