#!/usr/bin/env node
/**
 * The README catalogue generator's self-test.
 *
 *   node scripts/gen-readme-catalogue.test.mjs
 *
 * It proves the generator can say NO: each refusal is planted and must throw,
 * and the happy path is run on the REAL snapshot so "it renders" is a claim
 * about the catalogue we ship, not about a toy.
 *
 * PRECONDITION: the snapshot must be readable and carry tools, prompts and
 * resources — a fixture that is not there is a failure, never an absence.
 */
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { BEGIN, END, GROUPS, anchor, firstSentence, renderSection, spliceReadme } from './gen-readme-catalogue.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
let pass = 0;
let fail = 0;
const ok = (label, cond) => {
  if (cond) pass++;
  else {
    fail++;
    console.log(`  ✗ ${label}`);
  }
};
const throws = (label, fn, pattern) => {
  try {
    fn();
    ok(`${label} (did not throw)`, false);
  } catch (err) {
    ok(`${label} (threw: ${err.message})`, pattern.test(err.message));
  }
};

const real = JSON.parse(readFileSync(join(ROOT, 'catalogue.json'), 'utf8'));
if (!Array.isArray(real.tools) || real.tools.length === 0 || !Array.isArray(real.prompts) || !Array.isArray(real.resources)) {
  console.log('✗ gen-readme-catalogue self-test: could not run — catalogue.json carries no tools/prompts/resources');
  process.exit(2);
}

// 1. the real snapshot renders, and every tool appears exactly once
const section = renderSection(real);
for (const t of real.tools) ok(`tool ${t.name} appears exactly once`, section.split(`[\`${t.name}\`]`).length === 2);
for (const p of real.prompts) ok(`prompt ${p.name} appears`, section.includes(`\`${p.name}\``));
for (const r of real.resources) ok(`resource ${r.uri} appears`, section.includes(`\`${r.uri}\``));
ok('the section opens and closes with the markers', section.startsWith(BEGIN) && section.endsWith(END));
ok('the counts in the lead line are the snapshot\'s', section.includes(`**${real.tools.length} tools, ${real.prompts.length} prompts`));

// 2. every anchor points at a heading API.md really has
const api = readFileSync(join(ROOT, 'API.md'), 'utf8');
const headings = new Set([...api.matchAll(/^### (.+)$/gm)].map((m) => anchor(m[1])));
for (const m of section.matchAll(/\(API\.md#([^)]+)\)/g)) ok(`anchor #${m[1]} exists in API.md`, headings.has(m[1]));

// 3. the refusals
const minus = (name) => ({ ...real, tools: real.tools.filter((t) => t.name !== name) });
const plus = { ...real, tools: [...real.tools, { name: 'brand_new_tool', description: 'Does a new thing.', annotations: { title: 'New' } }] };
throws('a tool in no group is refused', () => renderSection(plus), /in no README group: brand_new_tool/);
throws('a group naming a retired tool is refused', () => renderSection(minus(GROUPS[0][1][0])), /does not have/);
throws('a tool listed in two groups is refused', () => {
  GROUPS[1][1].push(GROUPS[0][1][0]);
  try {
    renderSection(real);
  } finally {
    GROUPS[1][1].pop();
  }
}, /more than one README group/);
throws('an empty catalogue is refused', () => renderSection({ tools: [], prompts: [], resources: [] }), /incomplete/);
throws('a README without markers is refused', () => spliceReadme('# no markers', 'x'), /markers exactly once/);
throws('a README with the markers twice is refused', () => spliceReadme(`${BEGIN}\n${END}\n${BEGIN}\n${END}`, 'x'), /markers exactly once/);
throws('markers in the wrong order are refused', () => spliceReadme(`${END}\n${BEGIN}`, 'x'), /markers exactly once/);

// 4. the pieces
ok('first sentence stops at the first full stop', firstSentence('Returns X. Use when Y.') === 'Returns X.');
ok('first sentence keeps a text without one', firstSentence('Returns X') === 'Returns X');
ok('a pipe in a description cannot break the table', !renderSection({ ...real, tools: real.tools.map((t, i) => (i === 0 ? { ...t, description: 'A | B. C.' } : t)) }).includes('| A | B.'));
ok('splice replaces only the section', spliceReadme(`top\n${BEGIN}\nold\n${END}\nbottom`, `${BEGIN}\nnew\n${END}`) === `top\n${BEGIN}\nnew\n${END}\nbottom`);

// 5. the README in the tree is what the generator renders (the CI drift check, from the test side)
const readme = readFileSync(join(ROOT, 'README.md'), 'utf8');
ok('README.md carries this exact section', readme.includes(section));

console.log(`gen-readme-catalogue self-test: ${pass} passed, ${fail} failed`);
process.exit(fail === 0 ? 0 : 1);
