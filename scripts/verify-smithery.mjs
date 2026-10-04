#!/usr/bin/env node
// Did the Smithery listing take this release? Read the PUBLIC registry entry —
// what a person browsing Smithery is shown, no key involved — and compare it with
// catalogue.json, the snapshot this release ships, re-captured from the same live
// server whose version the workflow has already asserted.
//
// A release that reached SUCCESS on Smithery's side can still leave the public
// entry describing an older scan for a while (the registry is cached), so the read
// polls with a DEADLINE, and only the deadline turns a mismatch into a failure.
//
// Asserted:
//   - the entry is the expected qualified name and carries a deployment URL;
//   - the tool names are exactly the catalogue's, and each tool's description is
//     the catalogue's (a stale scan shows up as an old description first);
//   - the prompt names and the resource URIs are exactly the catalogue's.
//
// Usage: node scripts/verify-smithery.mjs <namespace/name> [catalogue.json] [deadlineSeconds]

import { readFileSync } from 'node:fs';

const REGISTRY = 'https://registry.smithery.ai/servers';

/** The differences between a registry entry and the catalogue, as sentences. */
export function compareListing(entry, catalogue, qualifiedName) {
  const out = [];
  if (entry?.qualifiedName !== qualifiedName) out.push(`the entry is ${entry?.qualifiedName ?? '(none)'}, not ${qualifiedName}`);
  if (!entry?.deploymentUrl) out.push('the entry carries no deploymentUrl');
  const setDiff = (label, got, want) => {
    const g = new Set(got);
    const w = new Set(want);
    const missing = [...w].filter((x) => !g.has(x));
    const extra = [...g].filter((x) => !w.has(x));
    if (missing.length) out.push(`${label} missing from the listing: ${missing.join(', ')}`);
    if (extra.length) out.push(`${label} on the listing but not in this release: ${extra.join(', ')}`);
  };
  const tools = entry?.tools ?? [];
  setDiff('tools', tools.map((t) => t.name), catalogue.tools.map((t) => t.name));
  const byName = new Map(tools.map((t) => [t.name, t]));
  for (const t of catalogue.tools) {
    const l = byName.get(t.name);
    if (l && l.description !== t.description) out.push(`tool ${t.name}: the listing shows another description (a stale scan?)`);
  }
  setDiff('prompts', (entry?.prompts ?? []).map((p) => p.name), (catalogue.prompts ?? []).map((p) => p.name));
  setDiff('resources', (entry?.resources ?? []).map((r) => r.uri), (catalogue.resources ?? []).map((r) => r.uri));
  return out;
}

/**
 * @param {{qualifiedName: string, catalogue: any, deadlineMs?: number, intervalMs?: number,
 *          fetch?: typeof fetch, sleep?: (ms: number) => Promise<void>, log?: (s: string) => void}} o
 */
export async function verifySmithery(o) {
  const fetchFn = o.fetch ?? fetch;
  const sleep = o.sleep ?? ((ms) => new Promise((r) => setTimeout(r, ms)));
  const log = o.log ?? ((s) => console.log(s));
  const deadline = o.deadlineMs ?? 300_000;
  const interval = o.intervalMs ?? 10_000;
  let reads = 0;
  let last = ['no read yet'];
  for (let waited = 0; ; waited += interval) {
    reads += 1;
    const url = `${REGISTRY}/${o.qualifiedName}?nocache=${Date.now()}-${Math.random().toString(36).slice(2)}`;
    const r = await fetchFn(url, { headers: { 'cache-control': 'no-cache', accept: 'application/json' } });
    if (r.status === 200) {
      let entry = null;
      try { entry = await r.json(); } catch { last = ['the registry answered something that is not JSON']; }
      if (entry) {
        last = compareListing(entry, o.catalogue, o.qualifiedName);
        if (last.length === 0) return { ok: true, failures: [], reads };
      }
    } else {
      last = [`the registry answered HTTP ${r.status}`];
    }
    log(`read ${reads}: ${last[0]}${last.length > 1 ? ` (+${last.length - 1} more)` : ''}`);
    if (waited + interval > deadline) {
      return { ok: false, reads, failures: [...last, `the public listing did not match this release within ${Math.round(deadline / 1000)} s (${reads} reads)`] };
    }
    await sleep(interval);
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const [name, cataloguePath = 'catalogue.json', secs] = process.argv.slice(2);
  if (!/^[\w.-]+\/[\w.-]+$/.test(name ?? '')) {
    console.error('usage: node scripts/verify-smithery.mjs <namespace/name> [catalogue.json] [deadlineSeconds]');
    process.exit(2);
  }
  let catalogue;
  try { catalogue = JSON.parse(readFileSync(cataloguePath, 'utf8')); } catch (e) {
    console.error(`cannot read ${cataloguePath}: ${e.message}`);
    process.exit(2);
  }
  if (!Array.isArray(catalogue.tools) || catalogue.tools.length === 0) {
    console.error(`${cataloguePath} lists no tools — refusing to call an empty comparison a match`);
    process.exit(2);
  }
  const res = await verifySmithery({ qualifiedName: name, catalogue, deadlineMs: (Number(secs) || 300) * 1000 });
  for (const f of res.failures) console.error(`✗ ${f}`);
  if (res.ok) console.log(`verify: PASSED — ${name} lists this release's ${catalogue.tools.length} tools, ${catalogue.prompts?.length ?? 0} prompts and ${catalogue.resources?.length ?? 0} resources`);
  process.exit(res.ok ? 0 : 1);
}
