#!/usr/bin/env node
// Did that publish land? Read the registry until the version is served, then
// assert what a user of `npx viafrei@X.Y.Z` depends on.
//
// `npm publish` exiting 0 is not the answer: publication is asynchronous, the
// registry answers 404 for a while after it, and both npm's CDN and the npm
// client cache stale documents. So every read here defeats both caches (a
// `no-cache` header AND a unique query string), never uses the npm client, and
// polls with a DEADLINE. One negative read is "not visible yet", never "not
// published"; only the deadline turns it into a failure, and the message says so.
//
// Asserted, each a failure when it does not hold:
//   - the version document exists and is about THIS version;
//   - dist-tags.latest is this version (a release here is always the latest);
//   - dist.attestations is present (published with provenance);
//   - repository.url names the repository this workflow runs in;
//   - the tarball itself is served (an HTTP 200 on dist.tarball).
//
// Usage: node scripts/verify-published.mjs <name> <version> <owner/repo> [deadlineSeconds]

const REGISTRY = 'https://registry.npmjs.org';

/**
 * @param {{name: string, version: string, repo: string, deadlineMs?: number, intervalMs?: number,
 *          fetch?: typeof fetch, sleep?: (ms: number) => Promise<void>, log?: (s: string) => void}} o
 * @returns {Promise<{ok: boolean, failures: string[], reads: number}>}
 */
export async function verifyPublished(o) {
  const fetchFn = o.fetch ?? fetch;
  const sleep = o.sleep ?? ((ms) => new Promise((r) => setTimeout(r, ms)));
  const log = o.log ?? ((s) => console.log(s));
  const deadline = o.deadlineMs ?? 300_000;
  const interval = o.intervalMs ?? 5_000;
  const bust = () => `?nocache=${Date.now()}-${Math.random().toString(36).slice(2)}`;
  const get = (url) => fetchFn(url + bust(), { headers: { 'cache-control': 'no-cache', accept: 'application/json' } });

  let doc = null;
  let reads = 0;
  for (let waited = 0; ; waited += interval) {
    reads += 1;
    const r = await get(`${REGISTRY}/${o.name}/${o.version}`);
    if (r.status === 200) { doc = await r.json(); break; }
    if (r.status !== 404) log(`read ${reads}: HTTP ${r.status} (retrying)`);
    if (waited + interval > deadline) {
      return { ok: false, reads, failures: [`${o.name}@${o.version} was not visible within ${Math.round(deadline / 1000)} s (${reads} reads). That is a timeout, not proof it was never published: check the registry again before re-tagging.`] };
    }
    await sleep(interval);
  }
  log(`${o.name}@${o.version} is on the registry (after ${reads} read(s))`);

  const failures = [];
  if (doc.version !== o.version) failures.push(`the registry answered a document about ${doc.version}, not ${o.version}`);

  const packument = await get(`${REGISTRY}/${o.name}`);
  const latest = packument.status === 200 ? (await packument.json())['dist-tags']?.latest : undefined;
  if (latest !== o.version) failures.push(`dist-tags.latest is ${latest ?? '(unreadable)'}, not ${o.version}`);

  if (!doc.dist?.attestations) failures.push('dist.attestations is absent: the version was not published with provenance');

  const want = `git+https://github.com/${o.repo}.git`;
  if (doc.repository?.url !== want) failures.push(`repository.url is ${doc.repository?.url ?? '(absent)'}, not ${want}`);

  const tarball = doc.dist?.tarball;
  if (!tarball) failures.push('dist.tarball is absent');
  else {
    const t = await fetchFn(tarball, { method: 'HEAD', headers: { 'cache-control': 'no-cache' } });
    if (t.status !== 200) failures.push(`the tarball ${tarball} answered HTTP ${t.status}`);
  }
  return { ok: failures.length === 0, failures, reads };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const [name, version, repo, secs] = process.argv.slice(2);
  if (!name || !/^\d+\.\d+\.\d+$/.test(version ?? '') || !/^[\w.-]+\/[\w.-]+$/.test(repo ?? '')) {
    console.error('usage: node scripts/verify-published.mjs <name> <X.Y.Z> <owner/repo> [deadlineSeconds]');
    process.exit(2);
  }
  const res = await verifyPublished({ name, version, repo, deadlineMs: (Number(secs) || 300) * 1000 });
  for (const f of res.failures) console.error(`✗ ${f}`);
  if (res.ok) console.log(`verify: PASSED — ${name}@${version}: latest, provenance, repository, tarball served`);
  process.exit(res.ok ? 0 : 1);
}
