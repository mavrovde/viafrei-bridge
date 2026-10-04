#!/usr/bin/env node
/**
 * The publish verifier's self-test. Hermetic: `fetch` and `sleep` are injected, the
 * registry is a table of answers, and no request leaves this process.
 *
 * Pinned: a version visible only on a later read passes (publication is asynchronous);
 * one that never appears fails with a TIMEOUT message rather than "not published"; each
 * asserted property fails on its own when it does not hold (another version's document,
 * latest elsewhere, no provenance, another repository, a tarball not served); and every
 * registry read carries both cache defeats, because a verifier reading a cached 404 or a
 * cached old packument is the failure this script exists to avoid.
 */
import assert from 'node:assert/strict';
import { verifyPublished } from './verify-published.mjs';

const NAME = 'viafrei';
const V = '9.9.9';
const REPO = 'mavrovde/viafrei-mcp';
const TARBALL = `https://registry.npmjs.org/${NAME}/-/${NAME}-${V}.tgz`;

const goodDoc = () => ({
  version: V,
  repository: { url: `git+https://github.com/${REPO}.git` },
  dist: { tarball: TARBALL, attestations: { url: 'x', provenance: {} } },
});

/** A registry stub: `visibleFrom` is the read on which the version document appears. */
function registry({ doc = goodDoc(), latest = V, visibleFrom = 1, tarballStatus = 200 } = {}) {
  const calls = [];
  let versionReads = 0;
  const fetch = async (url, init = {}) => {
    calls.push({ url, init });
    const bare = url.split('?')[0];
    const res = (status, body) => ({ status, json: async () => body });
    if (bare === `https://registry.npmjs.org/${NAME}/${V}`) {
      versionReads += 1;
      return versionReads >= visibleFrom ? res(200, doc) : res(404, {});
    }
    if (bare === `https://registry.npmjs.org/${NAME}`) return res(200, { 'dist-tags': { latest } });
    if (bare === TARBALL) return res(tarballStatus, null);
    return res(500, {});
  };
  return { fetch, calls };
}

const run = (reg, extra = {}) =>
  verifyPublished({ name: NAME, version: V, repo: REPO, deadlineMs: 20_000, intervalMs: 5_000,
    fetch: reg.fetch, sleep: async () => {}, log: () => {}, ...extra });

let passed = 0;
let failed = 0;
async function t(label, fn) {
  try { await fn(); passed += 1; console.log(`  ✓ ${label}`); }
  catch (e) { failed += 1; console.log(`  ✗ ${label}\n    ${e.message}`); }
}

await t('a publish visible on the 3rd read passes', async () => {
  const r = await run(registry({ visibleFrom: 3 }));
  assert.equal(r.ok, true, r.failures.join('; '));
  assert.equal(r.reads, 3);
});

await t('a publish that never appears fails as a TIMEOUT, not as "not published"', async () => {
  const r = await run(registry({ visibleFrom: 99 }));
  assert.equal(r.ok, false);
  assert.match(r.failures[0], /not visible within 20 s/);
  assert.match(r.failures[0], /timeout, not proof it was never published/);
});

await t('a document about another version fails', async () => {
  const r = await run(registry({ doc: { ...goodDoc(), version: '9.9.8' } }));
  assert.equal(r.ok, false);
  assert.ok(r.failures.some((f) => /about 9\.9\.8, not 9\.9\.9/.test(f)), r.failures.join('; '));
});

await t('latest pointing elsewhere fails', async () => {
  const r = await run(registry({ latest: '9.9.8' }));
  assert.ok(r.failures.some((f) => /dist-tags\.latest is 9\.9\.8/.test(f)), r.failures.join('; '));
});

await t('absent provenance fails', async () => {
  const d = goodDoc(); delete d.dist.attestations;
  const r = await run(registry({ doc: d }));
  assert.ok(r.failures.some((f) => /not published with provenance/.test(f)), r.failures.join('; '));
});

await t('a repository.url naming another repository fails', async () => {
  const r = await run(registry({ doc: { ...goodDoc(), repository: { url: 'git+https://github.com/someone/else.git' } } }));
  assert.ok(r.failures.some((f) => /repository\.url is git\+https:\/\/github\.com\/someone\/else\.git/.test(f)), r.failures.join('; '));
});

await t('a tarball that is not served fails', async () => {
  const r = await run(registry({ tarballStatus: 404 }));
  assert.ok(r.failures.some((f) => /answered HTTP 404/.test(f)), r.failures.join('; '));
});

await t('every registry read defeats both caches', async () => {
  const reg = registry({ visibleFrom: 2 });
  await run(reg);
  const reads = reg.calls.filter((c) => !c.url.startsWith(TARBALL));
  assert.ok(reads.length >= 3);
  for (const c of reads) {
    assert.match(c.url, /\?nocache=/, `no unique query on ${c.url}`);
    assert.equal(c.init.headers?.['cache-control'], 'no-cache', `no no-cache header on ${c.url}`);
  }
  const queries = new Set(reads.map((c) => c.url));
  assert.equal(queries.size, reads.length, 'two reads shared a query string');
});

console.log(`\nverify-published self-test: ${passed} passed, ${failed} failed`);
process.exit(failed === 0 ? 0 : 1);
