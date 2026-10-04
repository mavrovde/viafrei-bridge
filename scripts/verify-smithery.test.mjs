#!/usr/bin/env node
/**
 * The Smithery listing verifier's self-test. Hermetic: `fetch` and `sleep` are
 * injected; no request leaves this process.
 *
 * Pinned: a listing that matches only on a later read passes (the public registry is
 * cached); one that never matches fails at the deadline and names what differed; each
 * comparison fails on its own (wrong entry, no deployment URL, a missing or extra tool,
 * a stale description, a missing prompt, a missing resource); a non-200 and a non-JSON
 * answer are retried, never read as a match; and every read defeats both caches.
 */
import assert from 'node:assert/strict';
import { verifySmithery } from './verify-smithery.mjs';

const QN = 'team/server';
const catalogue = {
  tools: [{ name: 'a_tool', description: 'Does A.' }, { name: 'b_tool', description: 'Does B.' }],
  prompts: [{ name: 'p1' }],
  resources: [{ uri: 'x://one' }],
};
const entry = (over = {}) => ({
  qualifiedName: QN,
  deploymentUrl: 'https://example.invalid/gw',
  tools: catalogue.tools.map((t) => ({ ...t, inputSchema: {} })),
  prompts: [{ name: 'p1' }],
  resources: [{ uri: 'x://one' }],
  ...over,
});

function registry(answers) {
  const calls = [];
  let i = 0;
  const fetch = async (url, init = {}) => {
    calls.push({ url, init });
    const a = answers[Math.min(i, answers.length - 1)];
    i += 1;
    if (a === 'garbage') return { status: 200, json: async () => { throw new Error('bad json'); } };
    if (typeof a === 'number') return { status: a, json: async () => ({}) };
    return { status: 200, json: async () => a };
  };
  return { fetch, calls };
}
const run = (reg) => verifySmithery({ qualifiedName: QN, catalogue, deadlineMs: 30_000, intervalMs: 10_000,
  fetch: reg.fetch, sleep: async () => {}, log: () => {} });

let passed = 0;
let failed = 0;
async function t(label, fn) {
  try { await fn(); passed += 1; console.log(`  ✓ ${label}`); }
  catch (e) { failed += 1; console.log(`  ✗ ${label}\n    ${e.message}`); }
}
const failsWith = async (answers, re) => {
  const r = await run(registry(answers));
  assert.equal(r.ok, false);
  assert.ok(r.failures.some((f) => re.test(f)), r.failures.join(' | '));
  assert.ok(r.failures.some((f) => /did not match this release within 30 s/.test(f)), 'no deadline sentence');
};

await t('a matching listing passes on the first read', async () => {
  const r = await run(registry([entry()]));
  assert.equal(r.ok, true, r.failures.join(' | '));
  assert.equal(r.reads, 1);
});
await t('a stale listing that matches on the 3rd read passes', async () => {
  const stale = entry({ tools: [{ name: 'a_tool', description: 'Old A.' }, { name: 'b_tool', description: 'Does B.' }] });
  const r = await run(registry([stale, stale, entry()]));
  assert.equal(r.ok, true, r.failures.join(' | '));
  assert.equal(r.reads, 3);
});
await t('another entry fails', () => failsWith([entry({ qualifiedName: 'other/server' })], /the entry is other\/server/));
await t('no deployment URL fails', () => failsWith([entry({ deploymentUrl: undefined })], /no deploymentUrl/));
await t('a tool missing from the listing fails', () =>
  failsWith([entry({ tools: [{ name: 'a_tool', description: 'Does A.' }] })], /tools missing from the listing: b_tool/));
await t('an extra tool on the listing fails', () =>
  failsWith([entry({ tools: [...entry().tools, { name: 'c_tool', description: 'C.' }] })], /tools on the listing but not in this release: c_tool/));
await t('a stale description fails', () =>
  failsWith([entry({ tools: [{ name: 'a_tool', description: 'Old A.' }, { name: 'b_tool', description: 'Does B.' }] })], /tool a_tool: the listing shows another description/));
await t('a missing prompt fails', () => failsWith([entry({ prompts: [] })], /prompts missing from the listing: p1/));
await t('a missing resource fails', () => failsWith([entry({ resources: [] })], /resources missing from the listing: x:\/\/one/));
await t('a non-200 answer is retried, never a match', () => failsWith([503], /HTTP 503/));
await t('a non-JSON answer is retried, never a match', () => failsWith(['garbage'], /not JSON/));
await t('every read defeats both caches', async () => {
  const reg = registry([503, 503, entry()]);
  await run(reg);
  assert.equal(reg.calls.length, 3);
  for (const c of reg.calls) {
    assert.match(c.url, /\?nocache=/);
    assert.equal(c.init.headers?.['cache-control'], 'no-cache');
  }
  assert.equal(new Set(reg.calls.map((c) => c.url)).size, 3, 'two reads shared a query string');
});

console.log(`\nverify-smithery self-test: ${passed} passed, ${failed} failed`);
process.exit(failed === 0 ? 0 : 1);
