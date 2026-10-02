# Changelog

All notable changes to this package are documented here. The format follows Keep
a Changelog and the versions follow Semantic Versioning.

## [Unreleased]

## [1.5.4] - 2026-10-02

**Mirrors the server.** The bridge is versioned to match the ViaFrei MCP server it
relays to. The running server reports 1.5.4 while the registry's latest is 1.4.9, so
this release moves the package to the server's number and carries whatever had been
waiting under `[Unreleased]`. Prepared by the `Version sync` workflow: the shipped
reference was re-captured from the running server, and the probe reported the surface
**CHANGED** — the automation knows what moved, not what it means:

- tools: the server has get_departures, the snapshot does not
- tools: get_train_departures differs between the server and the snapshot

What that means, written by a person after reading the diff and asking the server:

- **`get_departures` is new**: scheduled departures from any German public-transport
  stop — bus, tram, U-Bahn, S-Bahn, train, ferry — with line, destination and
  platform, planned times only, a 48 h window and 15 per call, answering from the
  DELFI static timetable (CC BY 4.0). It is the tool for "when does the next bus go",
  for another day, or for a clock time more than two hours away. Asked on 2026-10-02,
  prod answered that the timetable is **not loaded yet** and said so plainly instead
  of inventing a board; `SOURCES.md` records that on the static-GTFS row rather than
  promoting the source to *live*.
- **`get_train_departures` was re-described, not re-shaped**: its description now
  draws the line against the new tool (buses, trams, a non-railway stop, another day
  or a time over two hours away go to `get_departures`), keeps vague later-today
  wording for itself, and sends "is the S1 punctual?" to `check_transit_disruption`
  even though it is rail and about delay. The `station` argument's text adds that a
  bare "Hauptbahnhof" should be sent as-is because the server lists the candidates.
  No argument was added, removed or re-typed.
- The catalogue is **20 tools, 18 read-only**; `SOURCES.md` moves from nineteen /
  seventeen to those numbers, and the live calls a re-measurement would cost from
  fifteen to sixteen, because the tool gained is read-only and not fuel.

### Added

- **A scheduled freshness probe: is the service alive, not merely answering?**
  (`scripts/probe-freshness.mjs`, `npm run probe:freshness`, and the `Freshness`
  workflow every six hours.)

  The gap it closes was real and nothing here could see it. A server can return
  `200` with a correctly shaped body for days while an ingest worker is dead, and
  every existing check survives that: the stub tests prove the bridge's
  **transport**, `check:docs` proves the document matches the **snapshot**, and the
  cut-time probe proves the **surface** still matches. None of them reads the age
  of the data in an answer.

  This asks the running server and judges `_meta.asOf`, which every real-time tool
  carries, against a limit **per tool**. That is not a detail: measured against
  prod on 2026-10-01, autobahn, transit, weather and departures all answered within
  a minute while `check_road_status` was **7.5 h** old, because it blends the BASt
  roadworks feed, which the Mobilithek catalogue declares as **twice daily**. One
  global limit would be either useless for the fast feeds or permanently red for the
  slow one — and a check that is permanently red is a check that gets switched off.

  Each limit sits about an order of magnitude above the source's own **declared
  cadence** rather than above the single reading this was written against, so it
  catches a dead worker and cannot fire on normal variation. 72 h for roadworks is
  roughly six times a twice-daily interval and clears a weekend; 90 min for the
  other four is many times their providers' own floors.

  **The callable set is an allow-list, not a deny-rule**, and the direction is the
  point: with a deny-rule a new entry runs unless it matches, and here the failure
  mode is a licence breach against a provider that can revoke access. Fail-closed is
  the right default on that path, so a tool nobody named is refused.

  **No fuel tool is ever called**, stated separately because it carries the reason
  the allow-list does not: `find_cheapest_fuel` and `find_fuel_station` answer from
  MTS-K / Tankerkönig, which sets a minimum interval per station and limits use to
  answering a consumer's question. A monitoring query is not that. Both guards
  **refuse before any request**, and the fuel arm is not redundant — a self-test
  case adds a fuel tool to **both** lists, which is the realistic way the exclusion
  would be lost, and it is still refused on licence grounds.

  **Scheduled, not on push**, because CI here reaches nothing by design: a
  freshness failure is news about the service, not about the commit, and reddening
  a contributor's push for it would teach people to ignore red.

  **The instrument is proved before it is trusted**, and the workflow runs the two
  steps in that order. The self-test is hermetic — every case against a local stub
  on loopback — and it is the only place the staleness verdict is ever exercised,
  because a healthy endpoint cannot produce a stale payload. So the self-test runs
  **first**: if it fails the instrument is broken, and if the live step fails the
  service is. A monitor whose verdict is never proved reports success about a dead
  service exactly as convincingly as about a live one.

  Three exit codes, because "could not check" and "checked and it is wrong" are
  different answers: `0` every feed inside its limit, `1` a real defect (stale, or
  no `asOf`, or no attribution, or `isError`, or an `asOf` in the future — a clock
  fault must not read as very fresh), and `2` could not check (endpoint, session,
  or a response shape nobody recognises). An unparsable body is deliberately `2`
  rather than `1`.

  Found by its own self-test and fixed: `--json` printed the human summary to
  stdout after the document, so the stream did not parse. Both streams are now
  pinned by a case.

  **Found in review, and it is the case the first draft had no test for.** A
  JSON-RPC *error* — what the server returns for a retired tool or a renamed
  argument, and this watch list hard-codes seven argument names — fell through to
  the no-result branch: **exit 1, every feed printed `STALE`, on a healthy
  service**, and `error.message`, the entire diagnosis, discarded. It is now exit
  **2** with the server's code and message printed, a distinct `?????` label
  because `STALE` is a claim about the *data* rather than about our ability to
  measure it, and a refusal sentence that no longer says the body failed to parse —
  it parsed perfectly. Four assertions cover it, and removing the guard turns all
  four red.

- **The registry is compared with the server every six hours, and a release that
  would close the gap is PREPARED — never performed** (`scripts/propose-release.mjs`,
  `npm run propose:release`, and the `Version sync` workflow).

  The bridge is versioned to match the server it relays to, and until now the only
  thing that noticed the registry falling behind was a person checking by hand: 1.4.9
  sat on prod while npm said 1.4.8 until somebody asked. Every step of catching up
  was mechanical and identical each time — `npm version`, the probe's `--write`,
  `docs:api`, the `## [X.Y.Z]` block, the gates — so the workflow does them and
  pushes the result as `release/X.Y.Z` with a pull request.

  **What it will not do, by design.** It does not merge, tag or publish, for three
  reasons each sufficient alone: the merge needs a reviewer verdict covering HEAD,
  which a bot merging through the API would bypass; an npm version is immutable, so
  a wrong one is forever; and when the server's **surface** changed rather than its
  number, the release note needs a sentence about what the change means, which
  nothing here can write — the 1.4.9 cut carried a licence-relevant fix for exactly
  that case. So the verdict, the merge and the tag stay with a person, and the tag
  publishes as it always has.

  **Four states, each named in the output**, because the workflow branches on them:
  `in-sync`, `awaiting-tag` (main already carries the server's version; the tag is
  the missing step), `drift` (the one that is prepared), and `behind` — the server
  BEHIND the registry, which is exit 1 and proposes nothing, because a downgrade is
  a decision about whether prod rolled back or a publish was premature.

  **Every version string read from the network is checked against `X.Y.Z` before it
  is used anywhere**, since it ends up in a branch name, a commit and an `npm
  version` argument; a prerelease on either side is a refusal. A mutant with the
  guard removed is part of the self-test, so the guard is proved live rather than
  present. Detect **writes nothing**, asserted by hashing the five files it may
  later touch. The server is read through the catalogue probe — one reader of that
  endpoint, `initialize` and the four list calls, no tool invoked — and the probe's
  own WRONG/DATED verdict decides the lead of the CHANGELOG block: DATED says the
  surface is unchanged; WRONG lists what moved and says **a person must describe it
  before this merges**, and the pull request is opened as a **draft**. A failing
  offline gate is also a draft rather than a lost run: the gate's output goes into
  the pull request, where the person who has to act on it will read it.

  A proposal is idempotent across runs — a `release/X.Y.Z` branch already on origin
  is left alone, so a pull request waiting for its review is not joined by a twin
  every six hours — and a CHANGELOG already carrying the block is a refusal. The
  workflow dispatches CI on the branch explicitly, because a push or a pull request
  made with the workflow token starts no workflow by GitHub's rule. **Two
  preconditions are asserted before anything is read**, because each failure would
  otherwise conceal itself: the run must be on the default branch (a dispatch from
  another ref would branch off it and open a pull request carrying its commits), and
  the repository must allow Actions to open pull requests — a setting that is OFF by
  default (and was, here, until 2026-10-02), without which `gh pr create` fails after
  the branch is pushed and the orphan branch then silences every later run. That
  read is administration-class and the workflow token may not be able to make it,
  so it has **three outcomes**: a successful `false` refuses, a failed read is named
  and the run continues, because if the pull request still cannot be opened the
  branch just pushed is deleted again for the same reason.

  The MCP stub the catalogue probe's self-test ran on moved to `scripts/mcp-stub.mjs`,
  and the pass/fail counter both self-tests print through to `scripts/check-harness.mjs`,
  so this self-test shares them rather than carrying copies; the probe's own case
  count is unchanged.

### Fixed

- **The `Version sync` workflow runs the leak sweep on the tree it prepares.** Its
  first real run was this release, and the proposal it pushed carried two bare
  numbers from the new tool's schema text — a minutes-per-day maximum and an example
  stop id — that the public-repo sweep refuses. Nothing in the workflow had asked:
  its three gates compare the shipped files with each other, not whether the
  snapshot may be published. What caught it was the CI run the workflow itself
  dispatched — the pull request's own `pull_request` run never executed, it sat at
  `action_required` — and the step that failed was the publish-hygiene gate on the
  **built tarball**, because `API.md` ships in the package: the numbers were on their
  way into the published artefact, not only into the repository. The sweep now runs
  after the five files are staged, and a finding makes the proposal a **draft** with
  the findings in the pull-request body. That job builds nothing, so it cannot run
  the tarball gate itself: it covers this class of finding, not the exact gate that
  fired. The two numbers are on `numbers.allowed` as the harmless values they are;
  both exist only in text the server controls, so a re-wording upstream makes the
  sweep refuse them as unused — loudly, which is the right direction.
- **`check-sources`' self-test reads its counts off the check's own summary line**
  instead of carrying them: three of its cases said "seventeen" and "fifteen", and
  when the page correctly moved to eighteen and sixteen they went inert — one passed
  without mutating anything — or asserted the previous release's numbers. A mutation
  that changes nothing, or that would change one of two occurrences, is now a
  refusal. The check's own pattern for the re-run sentence accepts "would now mean"
  beside "would still mean", because the count did move this time and the page says
  so.

## [1.4.9] - 2026-10-01

**Mirrors the server.** The bridge is versioned to match the ViaFrei MCP server
it relays to, and prod moved to 1.4.9; this release carries the three changes
that had been waiting under `[Unreleased]` for a number to mirror. The shipped
reference was re-captured from the running server at the cut, and the probe that
did it reported the surface **unchanged** — only the version string and the
capture date moved.

### Added

- **The sources page is now checked against the catalogue snapshot** (`scripts/check-sources.mjs`,
  `npm run check:sources`), in CI and in the publish workflow (#32).

  `SOURCES.md` states counts *about the server* — how many tools it exposes, how many are
  read-only, which are fuel and therefore excluded from its spot check. Nothing compared
  them with `catalogue.json`, which ships in the same tarball and holds the answers, and
  the page spent two releases describing a server it no longer matched.

  **Offline on purpose, and that is what makes it worth having.** Both files already ship
  together, so this needs no network and runs on every push rather than at the cut. It
  would have caught all three defects of the previous entry, including the one that got
  past a first review round: the **derived** call count is computed as read-only minus the
  excluded fuel tools, never read from the prose, because that is the one number on the
  page a reader might act on.

  The licence arm is the one that matters: a fuel tool present in the snapshot and not
  named by the page is a failure, because that exclusion is an MTS-K condition rather
  than a convenience, and a tool counts as fuel-constrained if its NAME says so **or**
  its DESCRIPTION names the provider — measured on this snapshot, both fuel tools name
  theirs in prose and no other tool does, so a rename alone cannot hide one. `npm run
  test:sources` prints the case count; no number is written here, because this entry's
  first draft stated one and it was stale within the round.

  Two limits are pinned rather than assumed. A fuel rule gone inert REFUSES (exit 2)
  instead of reporting an empty excluded set. And a tool renamed away from `fuel` *whose
  description also stops naming the provider* matches neither arm and is not on the floor,
  so that one still fails through the arithmetic, with a message about a call count rather
  than about an unprotected tool. That is the honest reach of two text rules, and the
  weaker behaviour is asserted rather than hoped for.

- **A cut-time probe that compares the shipped reference with the running server**
  (`scripts/probe-catalogue.mjs`, `npm run probe:catalogue`; `--write` re-captures) (#33).

  At the 1.4.6 cut the shipped reference described server 1.3.22 and omitted a tool the
  server exposed. `check:docs` passed throughout — it proves `API.md` matches
  `catalogue.json`, so **a stale pair passes together**. Nothing compared either with the
  server.

  **It is deliberately not a CI step.** This repository's test posture is that CI reaches
  nothing, which is why every other check here is offline; a comparison with the running
  server needs a network call, so this is run by a person at the cut and is the only
  script here that touches the network. It is named `probe:` rather than `check:` so that
  distinction is visible in `package.json`.

  Read-only: `initialize` and the four list calls, **no tool invoked**, session deleted
  afterwards. That is a licence requirement and not courtesy — the fuel source sets a
  per-station floor.

  **Its report distinguishes WRONG from DATED**, because those are the two real histories
  and they need different remedies: 1.4.6's reference omitted a tool, which misleads a
  reader about what they are holding; 1.4.8's had only a stale version string. Reporting
  one as the other would be worse than no probe. Ten self-test cases, none of which touch
  the network — every one runs against a local stub — including both halves of that
  distinction, an empty list refused rather than compared equal, and `--write` proved to
  produce a snapshot the comparator then accepts.

- **`runToolAsync`** in `scripts/tools.mjs`, with the same deadline and refusal as
  `runTool`. The synchronous runner blocks the caller's event loop, so a caller that is
  itself serving the child cannot use it — the probe's self-test serves a stub in-process
  and spawns the probe against it, and every case deadlocked until this existed. Added to
  the one `SPAWNERS` array the bare-name sweep derives from, so it is covered by the same
  rule as its sibling rather than being a quiet exemption.

### Fixed

- **Both CI deprecation warnings, in both workflows.** `build-and-test` was emitting two
  notices: the Node-20 runtime of `actions/checkout@v4` and `actions/setup-node@v4` is
  deprecated and GitHub is already forcing those actions onto Node 24, and the
  `ubuntu-latest` label migrates to Ubuntu 26 from 2026-10-19.

  **The warning named one workflow; the measurement named two.** `publish.yml` pinned both
  actions by commit sha, which looked like the careful half of the repository — but
  `action.yml` at each of those pinned shas declares `using: node20`. So the workflow that
  publishes to npm was on the deprecated runtime too and said nothing about it, because a
  sha pin does not report its own age. A fix confined to `ci.yml` would have cleared the
  log and left the publish path exactly where it was.

  Both files now pin the same runner image, `ubuntu-24.04`, and the same two actions by
  sha: checkout **v7.0.1** and setup-node **v7.0.0**, resolved from the API rather than
  transcribed, and each verified to declare `using: node24` at the sha actually pinned —
  which is what closes the notice rather than deferring it. That also leaves one version
  of each action in the repository instead of two.

  **v7, not v5, and it is a three-major move.** v5 clears today's warning and leaves this
  repository two majors behind the same deadline. The first draft of this entry described
  v7.0.0's release notes and called them the only behaviour change — true of that release,
  false of the upgrade, and the paragraph's whole job is to justify the size of the jump.

  The jump was therefore checked mechanically instead, which is shorter and re-runnable:
  **diff the declared input sets at the two shas.** Across v4.4.0 → v7.0.0 setup-node
  removes exactly one input, `always-auth`, and adds `package-manager-cache`; checkout
  removes and adds none. Between them the two workflows pass four inputs — `node-version`,
  `registry-url`, `cache` and `fetch-depth` — and all four are still declared, so the
  `registry-url` → `.npmrc` path the publish depends on is intact.

  The breaking changes the intervening majors do declare are inert here, by enumeration
  rather than by assumption: setup-node v5's automatic package-manager detection and v6's
  narrowing of it to npm cannot apply, because both jobs pass `cache: npm` explicitly and
  this `package.json` has no `packageManager` field; checkout v5's minimum runner version
  (2.327.1) is far below what GitHub-hosted runners run; checkout v7's refusal to check out
  a fork's head applies to `pull_request_target` and `workflow_run`, neither of which
  appears anywhere under `.github/`; and setup-node v7's removal of the dummy
  `NODE_AUTH_TOKEN` export is an **improvement** on this path — that variable appears
  nowhere in either workflow, and upstream's own pull request says the dummy value could
  corrupt an `.npmrc` during an OIDC publish, which is how publishing here works.

  One is named rather than waved past, because it touches the publish gate. checkout v6
  moved the persisted git credential into a separate file, and `publish.yml` runs one git
  command that touches the remote after checkout: the `git fetch origin main` the
  tag-containment guard needs (the step's other two, a `rev-parse` and a `merge-base`, are
  local). This repository is public, so that fetch succeeds with or without a credential;
  and if it ever did not, the guard exits **2** and refuses to publish rather than
  publishing a commit `main` does not contain. Fail-closed, so the bad outcome is a blocked
  release and never a wrong one. It is also the one step a `workflow_dispatch` dry run
  cannot exercise, since the guard is gated on a tag.

  A floating tag is what hid this, so nothing here floats: all four `- uses:` lines in the
  repository are now `@<sha> # vX.Y.Z`, and neither `runs-on` is a label that can change
  under a workflow nobody re-read.

  Written while prod and the registry were both at 1.4.8, so this said "no version bump:
  there is no number to mirror". Prod moved to 1.4.9 before the cut, so the number now
  exists and this ships under it.

- **`SOURCES.md` claimed a measurement that stopped being true, and the stale half is
  a licence condition.** The page said its status column was measured by calling
  "fifteen of the server's sixteen read-only tools — every one except
  `find_cheapest_fuel`". As of the 2026-09-29 capture shipped alongside it, the server
  exposes nineteen tools, seventeen of them read-only, and — this is the part that
  matters — a **second** fuel tool, `find_fuel_station`.

  The exclusion of `find_cheapest_fuel` is not a convenience: MTS-K sets a minimum
  interval per station and its terms make needless querying a real risk to the access
  itself. That reasoning applies to `find_fuel_station` identically, and the page did
  not name it, so a reader following the page's own method would have called a fuel
  tool the page meant to exclude.

  The measurement is now scoped to the date and the server it was taken against, the
  growth since is stated, and **both** fuel tools are named as excluded. It is
  deliberately **not** re-run: that would still cost **fifteen** live calls against
  real providers to re-confirm statuses already known — the same fifteen as at the
  original measurement, because the one read-only tool the server gained is the
  second fuel tool and is excluded. Sixteen minus one was fifteen; seventeen minus
  two is fifteen again. Dated on purpose, and said out loud — a measurement carried forward under a present-tense sentence is
  the failure that section exists to avoid.

  Not released on its own: when it was written prod was at 1.4.8, already published, and
  putting the package a patch ahead of the endpoint it relays to would have been worse than
  waiting. It rode the next version sync, which is this one.

## [1.4.8] - 2026-09-29

**A version-sync release.** The bridge is published at the version the ViaFrei server
is serving, so that `npx viafrei@X.Y.Z` and the endpoint it relays to are named by one
number. `mcp.viafrei.de` moved to `1.4.8`, so the bridge follows. 1.4.7 is absent from
the registry for the same reason 1.4.0–1.4.5 were: that platform version carried no
bridge change.

**Nothing in the bridge changed at all** — not the runtime, not the tooling, not a
gate. The diff against 1.4.6 is the three version fields plus the re-captured API
reference. If 1.4.6 works for you, this is the same code under a number that matches
the server.

### Changed

- **The API reference is re-captured at 1.4.8** (`API.md`, `catalogue.json`). Unlike
  1.4.6's re-capture, this one is only a date and a version string: the server's
  surface did **not** change between 1.4.6 and 1.4.8. Verified rather than assumed —
  the same 19 tools, 10 resources, 2 resource templates and 9 prompts, with no tool
  added or removed, no description altered and no `required` list moved, compared
  field-by-field against the stored snapshot before the new one was written.

  That distinction is the whole reason this entry says so out loud. At 1.4.6 the
  shipped reference was *wrong* — it omitted a tool the server exposed. Here it was
  merely *old*. The two need different remedies and only one of them is honest in each
  case, so which one applied is recorded rather than left for a reader to guess.

  Captured read-only: `initialize`, `tools/list`, `resources/list`,
  `resources/templates/list`, `prompts/list`. No tool was invoked, so no data provider
  was contacted, and the session was deleted afterwards. The two substitutions the
  snapshot documents are unchanged and asserted on the way in and out: 19 of 19
  `$schema` URIs dropped, exactly 2 long patterns stored as `patternLength`.

## [1.4.6] - 2026-09-29

**The version number is prod's, not this package's own count.** The bridge is released
at the version the ViaFrei server is actually serving — `mcp.viafrei.de` reports
`1.4.6` — so that `npx viafrei@X.Y.Z` and the endpoint it relays to can be named by
one number. That is why this release skips from 1.3.22 to 1.4.6 with no 1.4.0 through
1.4.5 on the registry: those platform versions carried no bridge change.

The shipped API reference is re-captured from that same server, so the package, the
endpoint and the documentation all name 1.4.6. It had been left at a 1.3.22 capture,
which review caught.

Nothing in the bridge's own runtime behaviour changed. Every flag, every environment
variable, every exit code and every message is what 1.3.22 shipped. What changed is the
machinery around it — two gates the 1.3.22 release wanted and could not have, one because
the failure it prevents happened *during* that release, and one that had been kept in step
by hand since 1.3.15 — plus seven refactors and one documentation fix.

### Added

- **Every external program these scripts run now has a deadline** (`runTool` in
  `scripts/tools.mjs`, `npm run test:tools`), because on 2026-09-28 one of them stopped
  returning and nothing noticed.

  A `git` call inside the tarball gate's self-test hung on a GitHub runner. The job had
  no timeout either, so it ran for **1 hour 49 minutes** before being cancelled by hand;
  the publish job hit the same stall and sat for 15 minutes with a tag already pushed.
  Both stopped after the same case and the Node 22 job of the same commit passed, so it
  reproduces rather than being a one-off (#25).

  **A hang is the one failure mode everything else here is built to prevent.** These
  scripts refuse by name, prove their controls can say no, and treat a check that read
  nothing as a failure — and a hung subprocess defeats all of it at once, because it
  cannot be told apart from work in progress: no exit code, no message, and a log that
  simply stops. There is now no unbounded external program in `scripts/`: every one goes
  through a single wrapper with a 120-second default, roughly 120 times the slowest
  legitimate call here. No count is written down — the bare-name sweep is the instrument,
  and it fails if a call appears that does not go through the wrapper. (This branch
  CONVERTED 22 sites across six files; that is a figure about the change, not an
  inventory of the tree, and an earlier draft of this sentence used it as both.)

  Only a **timeout** is translated, into a refusal naming the program, its arguments and
  the limit. Every other failure is re-thrown untouched, because each gate decides
  "refused" from `status`, `stdout` and `stderr` on the thrown error, and wrapping those
  would break the thing the gates measure. Both halves are asserted.

  **Renaming the call sites nearly disabled the gate that watches them.** The bare-name
  sweep looked for `execFileSync(`; routing 22 calls through `runTool(` would have left
  it green over the whole set while covering none of it — the exact silent-hole failure
  that file exists to refuse. It is caught structurally now: the function names live in
  one `SPAWNERS` array that both the sweep and its own precondition are derived from, so
  the two cannot drift again. The only reason this was noticed is that the precondition
  went red on its own when it found zero spawning files.

- **A gate on the manifest and lockfile versions** (`scripts/check-versions.mjs`,
  `npm run check:versions`), in **both** workflows (#18).

  Cutting 1.3.15 left `package.json` at `1.3.15` while `package-lock.json` still said
  `1.3.12`, on a tree seven review rounds had confirmed, and every gate passed. The
  measured reason: **`npm ci` does not compare the root `version` field at all** —
  checked on npm 11.19.1 and on the 12.0.2 the publish workflow pins — so nothing in
  build, test, pack or the tarball gate reads that pair. It has been kept in step by hand
  ever since, and 1.3.16 and 1.3.22 each said so in their commit messages. "Done
  deliberately" is the failure mode, not the remedy.

  It lives in `ci.yml` as well as `publish.yml` so the drift surfaces on the push that
  introduces it rather than at the tag, when the only remedy is a new version. Its exit
  codes are distinct on purpose — **2** could not run, **1** ran and disagreed — so "I
  could not read the lockfile" can never look like "I read it and was satisfied". Its
  self-test covers the mutant #18 asks for and the one that would otherwise agree about
  nothing — three ABSENT fields are all equal to each other. No case count is written
  here; `npm run test:versions` prints the one to trust.

### Changed

- **All seven `javascript:S3776` cognitive-complexity findings are gone** (#19), measured
  on the push rather than claimed: seven CRITICAL findings on `main` before, **zero**
  after, and zero new issues of any rule. `parseOptions` 22, `remote.onmessage` 18,
  `checkManifest` 20, the tarball gate's `main` 31, `tokenCandidates` 18, `decodings` 18
  and `scanFile` 27 are each split by concern, and every extraction MOVED lines rather
  than rewriting them. No behaviour change — that is the point of the entry being here
  and not under Fixed.

  The refactor exposed five things nothing was testing, each proved by deleting it and
  watching the suite stay green: `-h` had no case at all; `setProtocolVersion` had none,
  so the negotiate-down test asserted that the bridge *complains* about a version and
  never that it *applies* it; half of one error sentence was unreachable because every
  fixture carried a `supported` list; a dependency check's early exit could be deleted
  because every private-scope fixture also happened to be a valid range; and
  `"is this a listed private name?"` was written out by hand **three** times in
  `rules.mjs`, in the file that decides whether a commit may be published. All five are
  closed. The gate self-test went from 107 cases to 110.

- **Both workflow jobs carry `timeout-minutes: 15`** (#25). There was no timeout on any
  job, so GitHub's default six hours applied — which is how a hung step ran for nearly
  two. Fifteen minutes is nine times the observed duration of a successful run (~100 s
  for CI, ~95 s for publish), so it cannot fire on a slow-but-working build, and it ends
  a hung one in minutes.

- **`publish.yml` refuses a tag whose commit `main` does not contain** (#18). A tag alone
  decides what is published, so a tag pushed from any branch would have published from
  it. The ancestry is answerable because the checkout is already full-depth, and the ref
  is fetched explicitly so an unresolvable `origin/main` is an error rather than a skip.

- **The `npm` deployment environment now says what it gates and why it has no protection
  rule** (#18): it is the OIDC subject npm's trusted publisher is configured against, so
  it is part of the credential, and it has no required reviewer deliberately — the
  release is already gated by a verdict covering HEAD and by every gate running against
  the exact tarball uploaded. Recorded so "no rule needed" is distinguishable from
  "nobody looked".

### Fixed

- **The shipped API reference described the wrong server.** `API.md` and
  `catalogue.json` both ship, and both still said `viafrei 1.3.22` from a 2026-09-28
  capture — in a package published as 1.4.6, whose whole point is that the package and
  the endpoint are named by one number. Found in review, and it was not merely dated:
  re-capturing from `mcp.viafrei.de` shows the surface genuinely moved. The server
  exposes a nineteenth tool, `find_fuel_station`, that the reference did not mention at
  all, and `find_cheapest_fuel` and `check_transit_disruption` have new descriptions.

  Re-captured read-only — `initialize`, `tools/list`, `resources/list`,
  `resources/templates/list`, `prompts/list`, no tool invoked, so no data provider was
  contacted — and the session was closed afterwards. The two substitutions the snapshot
  documents are unchanged and were asserted rather than assumed: every tool's `$schema`
  URI is dropped (19 of 19), and the two 288-character date patterns are stored as
  `patternLength`.

  **No gate could have caught this**, which is the part worth keeping. `check:docs`
  passed throughout: it proves `API.md` matches `catalogue.json`, so a stale pair passes
  together. Nothing in this repository compares the snapshot against the running server,
  and `npm ci`-style version agreement cannot see it either. The reference's currency is
  checked by a person at the cut, and that is now a step rather than a habit.

- **`SOURCES.md` printed an attribution string the server had stopped sending** (#332).
  The shipped document is what a reader consults to know whose data they are looking at,
  so a stale attribution line there is wrong in the one place it matters.

- **Every push ran CI twice** (#23). `push: branches: ['**']` and `pull_request` both
  fired for a branch with an open pull request, so one push ran the whole matrix twice —
  four `build-and-test` jobs for two Node versions, doubling the wait and the minutes for
  no added signal. `push` is now `main` only; everything else arrives through its pull
  request. The cost is named in the workflow rather than discovered later: a branch pushed
  with **no** pull request now gets no CI. That is the right trade here — the flow is
  push-then-open-immediately, the reviewer reads local commits before the push, and the
  publish workflow re-runs every gate against the tag regardless.

- **Four README links resolved on the package page but not inside the tarball** (#23).
  `README.md` ships and linked to `CODE_OF_CONDUCT.md`, `CONTRIBUTING.md`, `SECURITY.md`
  and `SUPPORT.md`, none of which do. Three were pre-existing — verified in the published
  1.3.15 tarball — and `SUPPORT.md` was added by 1.3.16, so that release made an existing
  condition one worse. npm rewrites relative links in the rendered README to the
  repository, so it only bit someone reading an unpacked tarball. All four are now
  absolute, which is the honest form: a link that means "the repository" says so, and it
  survives any packaging change. The two that remain relative, `API.md` and `SOURCES.md`,
  are files the tarball carries — and that is now **asserted by the tarball gate**, which
  reads the README *inside* the built tarball, extracts every relative Markdown link and
  fails if one is not among the shipped paths. So the fifth such link is caught rather
  than noticed three releases later. An earlier draft of this sentence said "asserted"
  when nothing asserted it, which is the third time an entry in this file has claimed a
  mechanism the tree did not contain; this time the mechanism was written instead of the
  sentence being softened.

  The rule then arrived with **no case in the gate's own self-test**, and the suite's case
  count stayed where it was, which is how the review found it: a count that does not move
  when a rule is added is the suite saying so. It now has two cases, because the rule's
  first draft could not see an ANCHORED link — `](CONTRIBUTING.md#merging)` to a file the
  tarball does not carry passed silently, and that is the likeliest fifth link there is.
  Each was proved red on its own: neutering the rule fails both, and restoring the
  anchor-blind capture fails only the anchored one.

- **Two comments carried counts that read as inventories** (#23). `scripts/tools.mjs` said
  "TWENTY sites were changed in all" where twenty was what one commit changed, not what
  the tree holds; it now says so. `scripts/tools.test.mjs` said a third caller of the
  shared precondition arrived "within the week" when it arrived the **same day**, which is
  the harder version of its own point.

### Deliberately not done

- **`javascript:S2187` on every self-test** (#23, item 1) — *cannot be done from the
  repository.* SonarCloud reads `scripts/*.test.mjs` as test files, finds no framework
  assertions, and reports "add some tests to this file or delete it" at BLOCKER on each.
  There are **five** as of this branch, because the version gate above brings its own — so
  this work adds a file to the class it is declaring unfixable, which is the part worth
  knowing before the next self-test is written.
  Measured: analysis here is **Automatic** (no scanner step in any workflow) and
  `api/settings/values` returns no `sonar.tests` or `sonar.test.inclusions`, so the test
  patterns live in SonarCloud's own UI and changing them needs a token this repository
  does not hold. A `sonar-project.properties` was **not** added, because Automatic
  Analysis may ignore it and a config file that silently does nothing is worse than the
  finding. The two real options are a UI change to the test patterns, or renaming the
  convention to `*.selftest.mjs` — which touches `package.json` scripts, CI steps and the
  sweep that counts them. The quality gate passes on all five conditions either way.

- **The four remaining bare `.sort()` calls** — left, and named so the next person is not
  ambushed. SonarCloud raised `javascript:S2871` (CRITICAL, type BUG) on the `.sort()` in
  `relativeMarkdownLinks` and took the new-code reliability rating to D against an A
  threshold, which is a required check. The line's behaviour was never wrong — every
  element is a string and code-unit order is what is wanted — but the round-3 refactor
  moved the expression into a new exported function, so a pattern older than this branch
  became *new code* and failed a gate it had never been measured by. That is the trap, and
  it is still loaded four times over:

      git grep -n '\.sort()' -- '*.mjs' '*.ts' | grep -v '^\S*:[0-9]*: \*'

  finds them in `scripts/check-tarball.mjs`, twice in `scripts/tools.test.mjs`, and in
  `test/relay.test.ts`. All four are string arrays and all four are correct today; none is
  in this PR's new-code period, so none fails the gate now. **Converting them here would
  add three files to a diff that is already fifteen**, so they are recorded instead: the
  next PR that so much as moves one of those lines should expect a CRITICAL BUG on code it
  only touched, and should fix it in that PR rather than discovering it from a red required
  check after the push, which is how this one was found.

  Not `localeCompare`, whichever PR does it. It is what the rule suggests and it is wrong
  here twice: it reorders (`B a` becomes `a B`) and it is locale-dependent (`ä` sorts before
  `z` under `en`/`de` and after it under `sv`), so a gate's output would depend on the
  runner. The comparator added here says only what the default already did, and the order
  is pinned by a case in the self-test.

- **A shared assertion harness for the self-tests** (#23, item 5) — declined, on the
  issue's own condition. Each self-test defines its own `check()`/`refuse()` pair, and the
  issue says to unify them only if it can be done without weakening the per-file refusal
  wording. It cannot, cheaply: the refusals deliberately name different builders and exit
  by different routes, and that difference is load-bearing — it is what tells a reader
  which fixture failed. The duplication is seven small functions across five files — four
  define `check()`, three define `refuse()` — not the eleven-line block that caused the
  3.1% duplication failure `fixture-root.mjs` was extracted to fix.

### Note on a count in the 1.3.16 entry below

That entry says the tool sweep reads "thirty-two source files". It now reads **34**,
because this work adds two. The published entry is **left alone**: it was measured at
that release and editing a shipped block to keep a number current is how a changelog
stops being a record. The figure to trust is the one `npm run test:tools` prints, which
is why nothing here states a total either.

## [1.3.22] - 2026-09-28

**A fresh snapshot of the production server, and the version number that goes with it.
Nothing else, and the diff is the evidence: outside this entry the release is nine
insertions and nine deletions, every one of them a version string or a date** — four in
`API.md`, two in the snapshot, one in the manifest and two in the lockfile.

The service moved from 1.3.16 to 1.3.22 in six patch releases while this package sat at
1.3.16 — one of which carried no runtime code and was never deployed, so five
deployments. **None of them changed the LISTED surface**: the tools, resources, templates
and prompts a client is offered, which is what this package documents and all a list
method can show. It is not a claim about what a read returns, and one of the five did
change that — 1.3.19 corrected an attribution resource's contents. That is why nothing in
`API.md` moves except its header. Measured rather than assumed: the live server was asked to
describe itself again and the answer was compared, field by field, against the snapshot
shipped in 1.3.16 — every tool name, title, description and annotation, every input
schema including each parameter's type, bounds and pattern, all ten resources, both
resource templates, all nine prompts, the server's own instructions, and the advertised
capabilities. **Zero differences.** The five deployed releases were server-side data and
rendering fixes: a Bundesland decided by the order map extracts had been loaded in, an
attribution resource that claimed we hold nothing from a source we serve, a batch of
defects closing the 1.3 milestone, and a place answer for "Munich" restored. The sixth,
1.3.17, says in its own block that it carries no runtime code and is not deployed.

So this release is worth exactly one thing to a reader, and it is worth being plain about
which: the document in the package now says it was captured on 2026-09-28 from server
1.3.22, rather than on 2026-09-27 from 1.3.16 — one day and six version numbers. A dated
snapshot whose version is behind invites the reader to wonder what has changed since, and
here the answer is nothing, which they can only know if the snapshot says so.

**No behaviour changes.** `dist/` is built rather than committed and no file under `src/`
has changed since the 1.3.16 tag, which is the evidence for the claim. No flag, default
or exit code moves. Two of the seven `files` entries change — `API.md` and
`CHANGELOG.md` — and the tarball still holds 21 paths.

### Changed

- **`catalogue.json` re-captured** from the production server on 2026-09-28 over protocol
  `2025-06-18`: `initialize` plus `tools/list`, `resources/list`,
  `resources/templates/list` and `prompts/list`. **No tool was invoked**, so no upstream
  provider was contacted — listing is metadata, calling is traffic, and one provider
  behind this service puts the access itself at risk if queried needlessly. The same two
  substitutions its own `$comment` documents were applied again and asserted rather than
  trusted: 18 per-tool `$schema` declarations dropped, and the two 288-character
  ISO-8601 date patterns stored as their length, at `get_train_departures.when` and
  `watch_situation.until`. Both counts were asserted by the one-off script that made the
  capture, which refused to write the file unless they came out exactly so — **not** by
  anything this repository carries. An earlier draft of this sentence said "the capture is
  refused", present tense, which reads as a standing property of the tooling and would
  send a reader looking for a gate that is not there. There is no capture script here, and
  re-capturing is a deliberate act performed by hand.

- **`API.md` regenerated**, which under `npm run check:docs` it has to be. The only lines
  that differ are the capture date in the header paragraph, the server version in the
  table, the captured-from line, and the footer — because the server said the same thing
  it said the day before.

### A note on version matching, because 1.3.16 made a promise this release cannot keep

1.3.16 argued its number should match the running service so that "somebody comparing the
two now reads one number instead of wondering which is behind". That argument does not
survive contact with how fast the service ships: production went 1.3.16 → 1.3.18 → 1.3.22
in under two hours, twice while this release was being measured. A package cannot track
that, and pretending otherwise means every publish is stale on arrival.

What this package can honestly say is what it now says: the snapshot carries the version
and date of the server it was taken from, and the document names the running server as the
source of truth for anything newer. The numbers agree today because this release chose
once more to make them agree — it stepped over 1.3.17 to 1.3.21 to land on production's
number, which a reader comparing this version with the previous one in the registry can
see for themselves. Calling that a coincidence would be the same overclaim in a smaller
font. It is the last time alignment is a reason to cut a release: from here the snapshot's
own version and date carry that information, and no release should be cut for the sole
purpose of making the numbers agree.

## [1.3.16] - 2026-09-27

**This is the release that delivers the licence corrections to the people the
licences point at.** `NOTICE` is the file Apache-2.0 § 4(d) makes every downstream
redistributor carry, and until this publish the corrected text existed only in the
repository: the 1.3.15 tarball on the registry still carries the previous wording. So
publishing is not a side effect of the correction, it **is** the correction — which
is the whole reason this release exists, because nothing in `dist/` changes.

The number matches the running service rather than counting the changes here.
Production answered `initialize` with `1.3.16` when it was asked on 2026-09-27, and
this package is the bridge to that server, so somebody comparing the two now reads
one number instead of wondering which is behind.

**No behaviour changes.** `dist/` is built rather than committed, and no file under
`src/` has changed since the 1.3.15 tag — which is the evidence for the claim, since
a diff of an untracked directory would be no evidence at all. So no flag, default or
exit code moves. **Six** of the seven `files` entries do change —
`README.md`, `LICENSE`, `NOTICE`, `SOURCES.md`, `CHANGELOG.md` and the new
`API.md` — and the tarball goes from twenty paths to twenty-one. (Six *entries*,
not six files: `dist` is a directory.)

This paragraph has now been wrong twice, which is worth leaving on the record
rather than tidying away. The first draft called these "the repository's own
development scripts" and said the next tarball would differ in two files — true of
the first change here, false once the licence work landed beside it. The second
draft said **four** files and omitted `LICENSE` — and the commit that wrote that
sentence is the same commit that changed `LICENSE`, so it was false at the moment
it was written, in the paragraph written to correct a false count. The count moved
once more at the cut, because `API.md` joined `files` in this release. Every
version of it has been computed from `package.json`'s `files` intersected with
`git diff --name-only v1.3.15..HEAD`, with the path count from `npm pack --json`,
rather than counted by eye — which is the only way this sentence has ever been
right.

### Added

- **A sweep that keeps the twenty-first call site from being written by accident**
  (`scripts/tools.test.mjs`, `npm run test:tools`, and a step in CI). Eighteen
  cases: what `resolveTool` accepts and refuses, that its directory list is
  root-owned and not group- or other-writable (the property the module relies on,
  rather than the list that is supposed to have it), that its contents cannot be
  extended at runtime, that an `npm_execpath` which is absolute, real and readable
  but not npm is refused, and then a sweep of all thirty-two source files,
  walked recursively, for a spawn whose program is a bare quoted name.

  It carries three preconditions, because a gate whose input is absent reports
  success about what it never read: **every** source root must have contributed a
  file and an unreadable root is a failure rather than an absence; the expression
  must locate a program argument in a real file of this repository, proved by
  putting a real call's program back to a literal in memory and requiring it to be
  found; and it must go red on a planted bad call, with the fixtures assembled at
  runtime so no literal in this file can satisfy its own sweep.

  Both of the last two exist because the first drafts did not do what their own
  comments claimed. The floor was a floor on the *sum*, and `scripts` and `test`
  clear it between them — so `src/` could be deleted entirely and the run still
  printed ok at 21 files. And the "it can see a call" precondition evaluated the
  real expression only on the negative case; the positive half used a different,
  simpler pattern and never asked the real one to read a file.

  Proved the way a gate has to be: one real call site reverted to a bare name
  turns the sweep red, one source root removed turns precondition 1 red, and the
  files were restored byte-identical afterwards.

- **[API.md](API.md): a reference for all 18 tools, generated rather than written.**
  `catalogue.json` is what the production server answered when it was asked to
  describe itself — `initialize` plus `tools/list`, `resources/list`,
  `resources/templates/list` and `prompts/list`, captured on 2026-09-27 from
  server `1.3.16`. `scripts/gen-api-doc.mjs` renders the document from it
  (`npm run docs:api`), and `npm run check:docs` in CI fails if the two have
  drifted. Every tool description in it is the server's own text, verbatim,
  because that text is what an assistant reads when it decides which tool to
  call — paraphrasing it would document a different server.

  **No tool was invoked to produce the snapshot.** Listing is metadata; calling is
  traffic, and one of the providers behind this service sets a floor on how often a
  station may be queried, with the access itself at risk if it is exceeded. The
  capture is therefore five list methods and nothing else.

  **What generating it does and does not fix**, because README.md already argued
  the opposite case and that argument was right. Drift between the document and the
  snapshot is now impossible to keep — CI regenerates and compares. Drift between
  the snapshot and the live server is not fixed by anything, because a capture is a
  point in time. So API.md's own header says it is a dated snapshot, carries the
  date, and names the running server as the source of truth — in that file and not
  only in README.md. Both of them ship in the tarball, so that is not the reason;
  the reason is that a qualification has to travel with the document it qualifies,
  because somebody who opens the catalogue to look up a parameter has no occasion
  to read the page beside it.

  Two substitutions in the snapshot, both recorded in its own `$comment` rather
  than left as silent differences from what the server sent: the 18 per-tool
  `$schema` declarations are dropped as one constant repeated 18 times, and two
  288-character date patterns are stored as their LENGTH. The second was forced by
  the leak sweep and the interesting part is which side gave way — such a regex
  spells its arithmetic as character classes of selected digits, which a digit-run
  scanner cannot tell from a five-digit internal value. Both remedies on the
  sweep's side would have been falsehoods: narrowing the scanner weakens it for
  every file, and an allow-list entry would record that a character class is a
  number this project publishes. So the text that cannot be scanned is not stored.
  Nothing is hidden by it — the document already summarised a pattern over 60
  characters by its length, and the server hands anyone the full expression.

  One parameter is an object whose seven keys each carry their own bounds, and the
  first draft rendered it as a dash in both the default and the constraints
  column — the table's strongest claim broken on the row with the most to say. The
  cause defeated the safety net as well: `properties` sat in the set of keywords
  the renderer treats as handled, so the fallback that lists an unrecognised
  keyword as a bare name never fired. The keyword was known; it was simply never
  rendered.

- **A self-test for the API-reference generator** (`scripts/gen-api-doc.test.mjs`,
  `npm run test:docs`, and a step in CI). Its cases include the drift check refusing a
  hand-edited file, never writing during `--check`, and naming `docs:api` when the
  document is absent; eight snapshot mutations each refused with a named reason; a
  malformed `required` rendering rather than throwing; a planted nested `default`
  reaching the document; a union type in a table cell and in a bullet; an
  array-of-scalar; and the reported line count agreeing with `wc -l`. The run prints
  the total, which is the number to trust — this file has been wrong about counts
  more than once, so it states none here.

  It exists because the generator was the only script here making claims with nothing
  checking them, and the same six mutants were being re-run by hand across three
  review rounds — a check performed by remembering is not a check. It also earned
  itself immediately, by catching two defects nothing else could:

  The whitespace-flattening expression, rewritten to remove a super-linear
  backtracking pattern, **was not equivalent to what it replaced.** It handled only
  spaces and tabs beside the newline, so a `\r\n` line ending would have left a stray
  carriage return in the document. API.md regenerated byte-identical, `--check`
  passed, every gate was green — because this snapshot contains no CRLF. An output
  comparison can only speak about the input it was given, so the test compares the two
  **expressions** over every string up to length four drawn from a whitespace-heavy
  alphabet, plus random longer ones, and asserts first that the alphabet can expose
  the bug that shipped.

  And a **union type was escaped twice**: `typeOf` joined with an already-escaped pipe
  and the cell renderer escaped that pipe again, giving `string \\| null` — a literal
  backslash, and a bare pipe left to end the table row early. In a bullet, which is not
  a table, it produced a stray backslash instead. No tool in this snapshot declares a
  union type, so neither was reachable and no comparison of documents could have found
  it. Escaping now happens in one place, the one that knows it is writing a table cell.

- **[SUPPORT.md](SUPPORT.md)**, so GitHub's issue chooser has somewhere to point:
  where a question, a wrong answer and a security report each go, and what makes a
  report actionable.

- **README gains a Documentation table and five worked use cases** — a motorway
  briefing, a broken commute including a station lift that is out, an EV weekend, a
  dispatcher's morning brief, and a local-guide agent — each named by the question
  it answers rather than by the tools it calls.

### Changed

- **One entry of 13 characters left the leak sweep's private-name list, under that
  list's own rule 1.** The rule is stated in `scripts/rules.json`: an entry must not
  be a substring of text this repository legitimately prints, because such an entry
  can never be satisfied, and the only ways out are deleting it or narrowing the
  scanner — which is strictly worse. There is no mechanical test for it; the sweep
  going red *is* the test, and it went red. Declared narrowing: one spelling of 13
  characters is no longer matched anywhere. The list's second rule is not engaged,
  which decides that nothing else follows: the audit recorded in that file says
  nothing on the list is from the class whose harm is confirming a guess —
  credentials, tokens, session or contract identifiers, access-granting hostnames,
  personal data — so there is no rotation and no rename here.

  Recorded that way on purpose, and it is a change of practice rather than of
  style. The two removals recorded under 0.0.9 described what the entries were
  ABOUT, and taken together those descriptions narrowed the candidate space for a
  live entry further than a hash does — the same caption failure the number
  allow-list refuses on the facing page. The file now ends with the ruling: record
  the rule, the lengths and the narrowing, never the subject. This is the first
  entry written under it. The older wordings stay where they are, because editing
  a published file does not unpublish it.

  Coverage was asked of the change rather than asserted, since going from six
  entries to five must not leave the sweep reporting PASS about what it no longer
  looks for. The matcher was exercised per slot without needing any real name:
  the list replaced by five planted names, each planted in text, five reds
  required, and a negative control that stays clean. The sweep also prints the
  list's size on every run, so the change is visible rather than silent, and the
  gate self-test still refuses an emptied list. The window `minTokenLength` and
  `maxTokenLength` is unchanged at 7 and 15: both are stored literals, neither is
  derived from the list, and the removed entry sat at neither bound, so no
  published number narrowed.

- **`numbers.allowed` admits four values the SERVER publishes about itself** — two
  inside tool descriptions and two as bounds in its own input schemas — under one
  general rule written into that file rather than a caption each, because a caption
  per value is the construction the list exists to avoid. It is safe to state in
  general terms because the sweep already refuses an allowed number that occurs
  nowhere in the tree, so an exemption cannot outlive its reason.

- **Four statements about other people's licences were wrong, and they are the kind
  a reader acts on.** Every one was verified against its own source before it was
  changed, and each correction says that an earlier version had it wrong rather than
  quietly reading better.
  - **Share-alike reaches adaptations, not aggregations.** `SOURCES.md`, `NOTICE`
    and `README.md` all said DELFI data must not be blended into a result under a
    different licence. CC BY-SA 4.0 art. 3(b) is expressed only over Adapted
    Material (art. 1(a)); showing licensed data beside another source's data is an
    aggregation, and Creative Commons states in terms that the condition "applies
    only for works considered adaptations under copyright law, not simply in
    collections with other works". Worse than generous in two ways: art. 3(b)(3)
    forbids imposing terms that restrict rights the licence grants, which is what
    telling you an aggregation is forbidden does — and the rule as written condemned
    this service, since a weather answer can name `["dwd","osm"]`.
  - **The DELFI licence version was sourced to nothing.** Measured at both levels
    on 2026-09-27: the GovData record for the realtime feed carries the unversioned
    licence URI and an empty dataset-level licence, and the national access point's
    own metadata reports the same unversioned term. The publisher's sibling feeds in
    the same catalogue *are* versioned, so it states a version when it means one.
    The page now names the family, shows the evidence, and says to treat the
    share-alike as applying regardless — because the version decides what a
    recipient may put on a derivative (art. 3(b)(1)), and 3.0 unported has no
    express database-rights clause where 4.0 art. 4 does.
  - **§ 7 DWD-Gesetz prescribes a duty, not a wording.** Fetched verbatim: the
    section is headed *Quellenschutz*, requires distribution to be "nur unter
    Angabe der Quelle zulässig" and sets no text — and its second sentence adds
    that fuller protection under the Urheberrechtsgesetz "bleibt davon unberührt",
    so attribution is the statute's minimum rather than the whole of what may be
    owed. The three words come from the DWD's own guidance, which also permits the
    logo form — so a reader told the statute fixes the characters might refuse a
    form the publisher expressly allows.
  - **`NOTICE` understated the ODbL duty, and it is the file that republishes
    itself** (Apache-2.0 § 4(d) makes every downstream redistributor carry it). It
    said "address results" where the predicate is which *table* answered — place
    resolution falls through the gazetteer to the OSM tables, so any answer about a
    place may be OSM-derived — and offered one extract where the § 4.6 offer covers
    both addresses and points of interest.

### Fixed

- **Every external program these scripts run is now resolved to an absolute path
  instead of being looked up on `$PATH`** (`scripts/tools.mjs`). `git`, `tar`,
  `npm` and a `mkdir` were spawned by bare name, which means the environment — not
  this repository — decided which program actually ran. That matters more here
  than it would elsewhere: one of these scripts is the leak sweep that decides
  whether a commit may be published, and another is the hygiene gate that reads
  the tarball about to be uploaded to the registry. A gate whose implementation
  the caller can substitute is not a gate. SonarCloud reported seven of the call
  sites as `javascript:S4036` and the project's Security Rating on new code stood
  at B because of them.
  - `git` and `tar` now come from `/usr/bin` or `/bin` only. `/usr/local/bin` and
    `/opt/homebrew/bin` are deliberately not searched: they are writable by the
    logged-in user on a normal developer machine, so admitting them would
    reinstate the substitution this change removes. A tool that is genuinely
    elsewhere makes the scripts refuse and say where they looked, which is a
    better failure than quietly running something else.
  - `npm` is no longer treated as a program at all. It is a JavaScript file, so it
    is run as `<absolute node> <absolute npm-cli.js>`; node's own path is
    `process.execPath`, which nothing can substitute. `mkdir` was replaced by
    `fs.mkdirSync` — no subprocess at all.
  - **Twenty call sites changed, not the seven that were reported.** The other
    thirteen are in the two self-tests, which SonarCloud does not analyse. Leaving
    them would have left the rule true of the code and false of the repository,
    and a rule with a quiet exemption is the one nobody remembers when adding the
    next call. (Counted per file in the finished tree: `check-leaks.mjs` 2,
    `check-tarball.mjs` 4, `npm-pack-json.mjs` 1 — Sonar's seven — then
    `check-leaks.test.mjs` 3 and `check-tarball.test.mjs` 10. The first version of
    this entry said nineteen, because it was counted with a single-line grep that
    cannot see the one call whose program argument sits on its own line. A count
    taken with the wrong instrument, in a release whose own subject is exactly
    that.)

- **And the repair for that duplicated it, which the quality gate caught before
  the merge.** The precondition was *copied* from one self-test into the other —
  eleven lines — and SonarCloud failed the pull request on **3.1% duplication on
  new code** against a 3% limit, over exactly that block. Copying was the wrong
  half of the right idea: the answer was always one implementation used twice.
  It now lives in `scripts/fixture-root.mjs` as `missingFixtureImports()`, and each
  self-test keeps its own refusal wording, because the two name different builders
  and exit by different routes — a difference that is real rather than incidental.
  Re-proved in each: dropping `tools.mjs` from a caller's file list makes that file
  refuse by name, and each names its own builder.

  **Concentrating the guarantee doubled its blast radius, so it got the assertion
  it never had.** One function now stands behind every self-test that uses it, so a
  silent `return []` disarms all of them at once and restores the wrong-reason pass
  that started this thread — a sweep that cannot start, reporting no findings. The
  number of those callers is deliberately not written here or in the module: it grew
  again inside this release, and the sentence that said "both" went stale unnoticed
  in five places while the corrected wording lived in one. On an ordinary run they
  only ever exercise the complete-fixture path, so
  until now the "missing" branch was proved solely by hand-mutating a file list:
  four times by two people, and never again by anything. Two cases cover both
  directions on a temporary directory, and they are mutation-proved — a planted
  `return []` reddens one, and ignoring the directory argument reddens both.

  Worth recording as the shape rather than the incident. A missing precondition was
  fixed by adding one; adding it introduced a duplicate of it; the gate caught the
  duplicate. Three links, and every one of them was found by something other than
  the test suite, which was green at each step. The file count in this entry moved
  from twenty-eight to twenty-nine because of it, then to thirty when this release
  added a source file of its own, and then to **thirty-two** as it added the generator's
  self-test and the module they share. The first two were re-derived from `npm run test:tools` rather than
  incremented by hand. The third was not, and the review round found it stale. The
  fourth was not typed either: it was read out of `npm run test:tools`'s own output
  and the edit refused to write a number the command did not report. That was a
  one-off script in a scratchpad, not something this repository carries — said plainly
  because an earlier draft of this very sentence claimed a committed artefact that
  does not exist. This paragraph has been wrong before, and that was the first time
  it invented an artefact rather than a number.

- **The leak sweep's own self-test had no precondition on the fixture it builds,
  and reported a scope regression instead.** Both self-tests copy a named list of
  files into a throwaway repository, and `tools.mjs` was missing from both lists.
  `check-tarball.test.mjs` refused by name, which is what a precondition is for.
  `check-leaks.test.mjs` had no such check: **measured**, three of its four cases
  failed with messages about scope — "expected a clean exit, got 1", "the run does
  not say which scope it used" — because every invocation died of
  `ERR_MODULE_NOT_FOUND`, and the fourth case *passed*, since a sweep that cannot
  start also cannot report a finding. That is worse than a red suite: it sends the
  next reader after the ruleset instead of after a missing file. It now refuses by
  name, proved by dropping the file again.

- **`npm_execpath` was trusted if it was merely absolute and ended in `.js`** —
  which reversed this change's own thesis for npm. The decider had moved from
  `$PATH` to an environment variable, and the local review demonstrated it by
  pointing the variable at a hand-written file, which the tarball gate would then
  have run as npm. The value must now also be *shaped* like npm's CLI, ending in
  `node_modules/npm/bin/npm-cli.js`. What that does not claim, because a security
  note that overstates its reach is worse than none: anyone who can both set your
  environment and create a file at that path is still obeyed — and anyone able to
  do both can usually substitute node itself. The narrowing is from "any writable
  path" to "a path that looks like a real npm installation": **it stops accidents,
  not an attacker**, and it is not a privilege barrier. An earlier draft said
  "stray, mistaken or opportunistic", which the sentence after it contradicted — an
  opportunistic value costs one `mkdir -p`.

- **`npmCliPath()` refused to find npm on a Homebrew Mac.** Its first draft knew
  only the `../lib/node_modules/…` layout, which is what the GitHub-hosted runner
  and nvm use — so it passed in CI and failed on a developer's machine, where
  Homebrew puts npm under `../libexec/lib/node_modules/…`. Both layouts are tried
  now, each from the given path and again through `realpathSync`, since a node
  reached by a symlink resolves its siblings from the real location. Caught by the
  new self-test on the first run, which is the argument for having written it.

- **The false-positive fix opened a worse false negative, and the second review
  round caught it.** Excluding `RE.exec('git')` by putting a `(?<!\.)` lookbehind
  in front of the whole alternation also excluded every *member-expression* spawn —
  `child_process.execFileSync('git', …)`, `cp.execSync('git status')` — which is a
  shape SonarJS does report and a contributor can write without doing anything
  unusual. So a fix aimed at a shape nothing writes blinded the sweep to a shape
  people do. The lookbehind now applies to the bare name `exec` alone, measured
  over twelve shapes: the all-names form was wrong on four of them, this one on
  none. The one trade it still makes — `obj.exec('git')`, a method named `exec` on
  something that is not a regular expression — is in the limits list, because no
  expression can tell it from `RE.exec('git')` without a parser. Both directions
  are pinned in the preconditions now rather than left incidental, since a review
  round changed this behaviour by accident once already.

  Two smaller things fell out of it. The comment describing the lookbehind said
  `(?!\.)` where the code says `(?<!\.)` — a look*ahead* there would match nothing
  useful, so it was the one comment in the file that would mislead somebody
  "fixing" the code to match it. And the worked examples added to document the
  twelve shapes turned the file red, because an example of a bare call, spelled as
  one, *is* a bare call as far as the sweep is concerned; they carry no quote
  characters now. The sweep catching its own documentation is the least ambiguous
  evidence available that the member-expression form works.

- **Two documents that enumerate the gates had gone stale in the same commit that
  added one.** `CONTRIBUTING.md` said "four more checks exist, and CI runs all
  four" — five now, and the new one was missing from the block a contributor is
  sent to, which also made the next paragraph's "a fifth command" read as a
  contradiction. The pull-request checklist named two gates as "the
  public-repository gates", so a contributor following it would not have run the
  sweep that exists to catch exactly the call they might be adding.

## [1.3.15] - 2026-09-27

The first release with features in it since the bridge got code. Three
capabilities, and the documentation caught up with a service that had quietly
grown past it.

**If you only use `npx -y viafrei`, nothing changes and nothing breaks.** No flag
was removed, no default moved, no exit code changed meaning. The three additions
are opt-in or invisible.

### Added

- **A contributor surface: `CODE_OF_CONDUCT.md`, three issue templates with a
  chooser, and a pull request template.** The Code of Conduct is Contributor
  Covenant 2.1, and a report with no GitHub account goes to the Impressum e-mail
  rather than to the **postal** address printed there — that address is still a
  visible placeholder, and a reporting route has to be one that works. The three
  forms are a bug, an idea, and the one report this service cannot make about
  itself: a tool answered and the answer was useless. Beside them the chooser
  carries the three routes that are not forms — the private security advisory,
  Discussions, and `SOURCES.md` for a data or licence question. None of these
  existed in 1.3.12.
- **`VIAFREI_MCP_HEADER` sets HTTP headers from the environment.** Many MCP
  clients can only give a command an `env` block, never arguments, which left
  those users no way to send a header at all. It takes the same `Name: value`
  syntax as `--header`, refuses the same transport-owned names, and separates
  several headers with a **newline**, which can never appear in a header name or
  value, so nothing you might need to send is unrepresentable - a comma, a
  semicolon and a space all occur inside real header values. A `--header` of the
  same name wins; one of a different name is added alongside. An error names
  `VIAFREI_MCP_HEADER`, not the flag you did not type.
- **`Retry-After` is honoured on the single retry, with a cap.** Both legal forms
  are read - a number of seconds and an HTTP-date - and a value that cannot be
  parsed, or names a moment already past, falls back to the fixed delay instead
  of throwing. **The cap is the per-request timeout**: a server answering
  `Retry-After: 3600` does not make `npx viafrei` sit silently for an hour; the
  retry is abandoned and the ordinary one-line failure, which already names the
  URL and the status, stands. `429` is retried now that the delay it asks for is
  respected - and **only when the header gives a usable delay**. A 429 carrying
  nothing readable is not retried at all, because the only thing left would be the
  fixed delay, and a fixed delay is what makes a rate limit worse. For the same
  reason a *thrown* 429 is still not retryable: there the header is gone. A 503 in
  the same state IS retried, and a test pins the difference so it cannot be
  flattened by accident.
- **A pathless `--url` that gets a 404 is told where the endpoint usually is.**
  `--url http://127.0.0.1:3000` now fails with `... HTTP 404 Not Found - the URL
  has no path; the MCP endpoint is usually /mcp`. **It is a hint and not a
  rewrite**: quietly appending the path would send the request somewhere nobody
  asked for and hide a different mistake later. The hint appears only when the
  path is empty or `/`, never on another status, and a URL that will not parse
  skips the hint rather than making the failure message itself throw.

### Changed

- **The README leads with how to connect, and says why to build on it.** The page
  opened by explaining that you probably do not need this package, which is true
  and was the first thing a developer read. The three transports now come first,
  with the address to use, and a section sets out what the service is actually
  offering: one protocol in place of twenty-one sources from sixteen publishers,
  the licence obligations travelling with each answer, machine-readable failures,
  and answers in the language of the question.
- **The tool count was wrong and is now a capability table.** The page said
  thirteen tools; the server registers **eighteen**. The five geocoding tools had
  shipped on the platform before the previous bridge release was even cut. The
  table groups tools by the question they answer, which is stable, and the page
  still refuses to paste the catalogue itself - a published tarball cannot be
  corrected, so `tools/list` on the running server remains the only source of
  truth.
- **The one completeness claim the new table introduced was measured before it
  shipped.** The Places row says "nationwide, all sixteen Länder", which no tool
  reports and which would rot at a partial import - the same objection that removed
  the two address figures under **Fixed** ("Two address figures nobody could check
  are gone"). It was kept because it was measured
  rather than inferred, and it now carries the date: on 2026-09-27 the service's own
  per-Land verdict - which reads both OSM tables, names any missing Land and exits
  non-zero on one - reported all sixteen imported with every row scoped to its Land,
  and two address lookups in the two Länder least likely to have been staged —
  Mecklenburg-Vorpommern and Saarland, asked in Rostock and Saarbrücken — both
  answered through the public endpoint with `osm` in `_meta.sources`. `SOURCES.md` carries the measurement, and one caveat that nearly
  misled it: a single address that does not resolve says nothing about its Land.
- **The README now says that a slow call may be a retried call.** A `429`, `502`,
  `503` or `504` is tried again **once** after the delay the server asked for, as
  is a connection that failed outright; a `429` with no usable `Retry-After`, and
  any delay longer than the per-request timeout, are not retried at all. The page
  also now says what that timeout does and does not bound, because the first draft
  of the paragraph got it wrong in the direction a user would act on: it is attached
  per HTTP request, so the second attempt gets a fresh one and so does each hop of a
  same-origin redirect, and **no setting here caps the whole call**. Two drafts of
  that one clause were wrong, in the same direction and in the sentence a reader
  would act on: the first said a retried call "can never exceed the timeout you gave
  it", and the correction that replaced it said to halve the timeout for a hard
  ceiling — but two attempts plus a delay that may itself be as long as the timeout
  is three times it, not two, and more again if the endpoint redirects. Both were
  caught in review rather than published, which is the argument for rounds that cost
  nothing, and the second is the sharper lesson: a corrected number is still a
  number, and nothing was reading it. That behaviour shipped earlier and the
  page did not mention it, so a user watching a call take longer than expected had
  nothing to read. Nothing about the behaviour changed in this release.
- **Both examples on the page are now captured output rather than plausible
  output.** The departures block is a real answer from `mcp.viafrei.de` on
  2026-09-27, and the failure line is copied from a run.
- **The badge hosts are admitted to the leak ruleset as their own group, with
  their one cost written down.** A shields.io badge is the only entry on that
  allow-list that causes a request from somebody else's browser, so the ruleset
  now says that, says the admission test, and says it is the reason to refuse the
  next image host rather than to admit it by precedent. The list itself stays
  sorted alphabetically rather than grouped, and the ruleset now says why: one flat
  sorted list is what makes a duplicate, or a near-miss spelling of a host already
  on it, visible at a glance.
- **`numbers.allowed` is back to six entries, and the two rules governing it are
  separated.** A seventh was added during this release to accommodate two bare
  millisecond literals, then removed once both were written `1_000`: an entry that
  covers nothing in the tree is a caption pointing at a value, which is the one
  thing the inverse construction exists to avoid. (The entry is not named here,
  because naming it would put the bare form back in the tree and the sweep would
  be right to say so — it said so about the first draft of this very bullet.) The ruleset now distinguishes **the rule** (an
  entry occurs in the tree and is not an internal value — which `3600` and `9110`,
  both prose in a comment, satisfy) from **the preference** (write a numeric
  separator where one is available, so the literal never reaches the list at all).
  Citing the second as if it were the first is what made the list look arbitrary
  for one review round.
- **Two `allowedHosts` entries covering nothing are gone.** Bare `shields.io` and
  bare `contributor-covenant.org` sat beside `img.shields.io` and
  `www.contributor-covenant.org`, and no URL in the tree uses either; the bare
  spellings occur only in prose about them, and the host extractor reads a
  scheme-prefixed URL and nothing else. That is the same shape as the
  allow-list number this release removed: an entry that permits nothing is a
  permission nobody can audit. The history-residue block is also back to one line
  per entry; reformatting it to five four-line objects changed no meaning and cost
  twenty-five lines of diff in the file a reviewer reads hardest.
- **A re-wrap put a private name into a public file, and the sweep caught it —
  which is also a demonstration of the one limit it declares loudest.** The gate
  reads **one line at a time**, and says so in its own limits list. A paragraph
  of this release's prose was re-flowed, and prose that had passed every earlier
  run matched a live entry the moment the wrapping changed. Nothing was ever
  published: it reached a working tree and no further. What the offending text
  was is deliberately not recorded — `scripts/rules.json` says to record the
  rule, the lengths and the narrowing and never the subject, because a
  description narrows the candidate space for a live entry further than the hash
  alone does, and this file cannot be unpublished. The lesson is the gate's, not
  the prose's — a line-oriented scanner's verdict depends on where the wrapping
  falls, so its PASS is about this wrapping and not about this text, and a
  re-wrap is a change the sweep has to see again.

### Fixed

- **`package-lock.json` still said 1.3.12 while `package.json` said 1.3.15, and
  nothing in this repository would have noticed.** Found in the last pre-push check
  of the release, by reading the two files rather than the diff: seven review rounds
  had confirmed the lockfile was *unchanged*, which is true and is not the same as
  correct. The publish workflow asserts that the TAG and `package.json` agree and
  says so in its own step name; no gate compares the lockfile to either, and the
  lockfile is not in the published tarball, so the only thing that reads it is the
  `npm ci` the release build runs. It is now 1.3.15, regenerated with
  `--package-lock-only` so the change is exactly the two version fields and no
  dependency moved. **The missing gate is deliberately not added here**: it belongs
  in `publish.yml`, and an untested edit to the workflow that publishes, inside the
  commit it publishes from, is the wrong trade a day before the tag — it is filed
  for the next release and rehearsed through the `workflow_dispatch` dry run, beside
  the two other workflow items this release also deferred.
- **SOURCES.md described a service three capabilities smaller than the one that
  is running.** Address lookup, lift and escalator status, and public-transport
  realtime were all documented as not answering on the public service. All three
  answer, and each was re-confirmed by a call whose result named the source. The
  BKG administrative gazetteer was listed as merely licence-read and is in fact
  named by answers from five different tools. Every status in the catalogue was
  re-measured on 2026-09-27 by calling **fifteen of the server's sixteen
  read-only tools** - every one except `find_cheapest_fuel` - once each and
  reading `_meta.sources`. That one exception is **fuel**, which is deliberately not
  re-measured because MTS-K sets a per-station floor and its terms make needless
  querying a risk to the access itself. That row is labelled `not re-measured`
  rather than dressed up as today's measurement.
- **SOURCES.md contradicted itself, and one of the contradictions was a licence
  statement.** The table was re-measured; three paragraphs beneath it were not,
  and they still told a reader that address lookup, facility status and
  public-transport realtime do not answer. The worst of them sat in the ODbL
  obligations section and said a share-alike obligation *"binds nobody using that
  service right now"* - measurably false, on the one page whose job is to state
  obligations, inside a tarball that cannot be corrected after publication. Every
  such paragraph now states today's measurement and says which of the two
  versions a reader saw. The status legend lost the value no row carries any more,
  rather than leaving a status somebody could still be relying on.
- **The README promised rail disruptions "on a line or at a stop".** The server
  declares the opposite in its own tool description and in `viafrei://coverage`:
  it never answers whether a named line, trip or stop is on time. The row now says
  region-wide and says never one line or stop.
- **Two address figures nobody could check are gone.** The Places row quoted a
  count of addresses and POIs that no tool reports and that would rot at the next
  import - the exact argument the paragraph below it makes against pasting a
  catalogue.
- **The departures example names both of its edits.** It said the only edit was
  shortening two URIs; five of the ten departures were dropped as well.
- **The OSM attribution line printed in `SOURCES.md` was not the line the server
  emits.** The code fence said `Geokodierung: …`; no answer has carried that prefix
  since `find_poi` and `find_address` began returning an OSM row **as** the answer
  — a name, a brand, a door — rather than only a coordinate resolved from one. The
  correct line is `OSM-Standortdaten: © OpenStreetMap-Mitwirkende, ODbL 1.0`, and
  1.3.12 carried it nowhere: the page was wrong about the one string it exists to
  publish, inside a tarball that cannot be corrected. A draft of this release then
  printed both spellings at once, which is how it was caught. Every other fenced
  attribution line was swept against the server's register; this was the only
  mismatch.
- **"An answer about a place does not carry the ODbL line" — three words missing,
  and the sentence reverses.** That wording is this release's own: 1.3.12 carried a
  different wrong version of the same sentence (see the bullet below), and this one
  was written while fixing that one and caught in review. The platform's own
  wording is "a result about a
  place **from our own gazetteer**, a station or a motorway is not built from
  OpenStreetMap". Place resolution falls through the gazetteer to `osm_pois` and
  then `osm_addresses`, so **every** tool that takes a `place` can return an
  OSM-derived answer: measured on 2026-09-27, a weather warning for
  `Zeiss-Großplanetarium` named `["dwd","osm"]` and carried the line, and one for
  `Allianz Arena` named `["osm"]` alone. Both places on this page now carry the
  qualifier and state the predicate — **which table answered**, not which tool
  was called. Two wrong versions of this sentence have now been caught, and both
  erred towards telling a reader an obligation did not apply to them. The last
  round found the same error in the two places nobody re-reads after fixing a
  paragraph: the **section heading** and its opening sentence still framed the
  obligation as something that applies "if you get an address or a point of
  interest back", so a reader who scans headings could conclude the section was
  not theirs. Heading, lead and both bodies now state the predicate, and the
  back-reference to the section was moved in the same edit as the heading.
- **Twenty-one sources, not nineteen — and the table was missing a row it needs
  to be the register it claims to be.** This release added the station car parks
  row and recorded it in its own bullet below, without correcting the number it
  invalidated; the review
  then found the DELFI disruption feed has a licence row in the server's register
  and no row here. It is in the table now, `read`, at **CC BY-SA 4.0**. Re-counted
  by hand: 21 rows, 16 distinct publisher cells. The README's dare — "count them
  in that table" — is a good one and now survives being taken up.
- **The cleared-but-unused DELFI sentence was wrong in both halves, and it is a
  licence statement.** It said "two more DELFI datasets … both CC BY 4.0 — the
  share-alike is on the realtime feed". There are **three**, and two of them are
  share-alike: the trip updates we serve and the disruption reports we do not.
  Anybody planning for the day the disruption feed appears was being told to plan
  for CC BY.
- **The station car parks row had no attribution line, on a page that promises one
  per source** — a defect this release created and closed. 1.3.12 has no car-parks
  row anywhere, and its "three products" sentence was correct for what it listed;
  adding the row, in the bullet that raised the source count, made that sentence wrong, so the Deutsche Bahn
  section said "three products · CC BY 4.0" over four products and two licences. Both fixed, with the BahnPark attribution
  line written out — `read`, so no answer carries it today, and it is here so
  nobody has to go looking on the day one does.
- **"No tool exposes the police traffic events yet" was a claim about the code,
  and the code says otherwise.** That sentence is also this release's own — 1.3.12
  carries the row at `read` and says nothing about reach. The road analysis already reads that feed, and
  whether a source is NAMED is gated on a live catalogue row, so the row could
  start carrying its attribution line with no release at all. The page now says
  what it measured — `check_road_status` on the A40, A3, A1, A57 and A46 named
  only the motorway interface and the BASt roadworks feed — and says out loud
  that this is a statement about answers and not about reach. The row therefore
  reads `in the service` and not `read`, and the page says not to design around
  it.
- **Two dead intra-document anchors, both created by this release's own
  corrections.** The `no API key` badge — on the npm package page and the
  repository front page — pointed at `#quick-start`, a heading this release
  renamed to "Connect in one line"; and `SOURCES.md`'s back-reference to the
  § 4.6 offer kept the old slug of a heading the previous review round renamed.
  Every intra-document link in the tree was checked; these were the only two, and
  both were ours. A later round found the shape that sweep could not see: an
  issue **form** renders at `/issues/new?template=idea.yml`, so the relative
  `../../blob/main/SOURCES.md` in it resolved one level short of the repository
  and 404ed. It is an absolute URL now, like the one `config.yml` already used
  for the same document.
- **The one place where `SOURCES.md` is now NEWER than the server's register is
  named on the page.** BKG is `live` there on five measured answers, while
  `viafrei://attribution` still flags it as planned — "licence read, data not
  ingested yet". The page's own rule is that the resource wins and the page is
  stale; that rule is right in general and wrong for this row today, so both the
  rule and the row now say so. No bridge release can close it: it is tracked where
  the server is developed, and what a reader of the published page can act on is
  the answer itself - `_meta.sources` and the attribution lines it carries.
- **The charging answer does not count the sites without a status.** The page said
  "a result says how many nearby sites had no status". It marks each one
  `keine Statusdaten` and closes by saying that means unknown and not free —
  measured, asking for Leipzig. What it refuses to do is leave them out or call
  them free, which is the part that matters when you act on the answer.
- **The test for "which answers carry the ODbL line" was the question, and it
  should have been the answer.** `SOURCES.md` said the line is carried "on every
  answer whose input was an address, and on no other answer". `find_poi` asked for
  a name and a city returns `_meta.sources: ["osm"]` and the line — so a reader
  using that sentence to decide whether a share-alike obligation had arisen would
  have concluded it had not. The rule is now stated as the platform states it, and
  the page says to read `_meta.sources` on the answer rather than infer anything
  from the shape of the question.
- **Our own § 4.6 offer was described more narrowly than it is.** It covers **both**
  ODbL databases — addresses and points of interest, one file each under a single
  licence notice — and the page named only the addresses. A recipient who derived
  from POI results is entitled to the POI database.
- **The README promised car parking the public service does not answer.** Asked for
  a `car_park` in Köln, Hamburg and Leipzig on 2026-09-27, every facility returned
  was a lorry park or unclassified, and none carried occupancy. The row now says
  lorry parking and a note says what is missing and why — the same over-claim as
  the rail row, one row up, in the table this release rewrote to stop over-claiming.
- **The count of unconfirmed rows said two and there are three** — in a draft of
  this release. 1.3.12 said **four**, counting a different set under a legend this
  release replaced: under its own legend five rows said a source does not answer
  today, and four was the number of `read` rows, which that legend defined as
  "nothing uses it yet". The police-events row moved into the unconfirmed state
  here, the changelog recorded the move and the count did not follow it. The station car-park source, in the server's register with no row
  on the page at all, now has its `read` row.
- **The Code of Conduct sent a reporter without a GitHub account to a postal
  address that does not exist** — in its first draft, in this release. The document
  is new here (see `### Added`), so no published version ever sent anybody
  anywhere. The Impressum's street and city are still visible placeholders; only
  the e-mail address is real, and that is what the document names. Nothing linked
  to it either; the README's Contributing section does.

## [1.3.12] - 2026-09-23

The bridge's code is unchanged since 0.0.9. This release replaces 1.3.10,
which was published and then withdrawn from npm.

**Why 1.3.12.** npm never lets a version number be used twice, even after an
unpublish, so 1.3.10 cannot come back. This release is numbered 1.3.12, and
1.3.11 is not used by this package. Everything 1.3.10 described below still
applies to this release: the same code, the same README.

**If you pinned 1.3.10,** move the pin to 1.3.12. Anyone who used `npx -y viafrei`
without a version got 0.0.9 while 1.3.10 was withdrawn, and gets 1.3.12 from now
on. Nothing about the connection changes: all three versions relay to the same
endpoint in the same way.

### Changed

- **The version is 1.3.12.** No other change to the published files.

## [1.3.10] - 2026-09-23 [YANKED]

The bridge's code is unchanged since 0.0.9; this release exists so that its
number matches the endpoint it connects to again.

**Why 1.3.10, straight from 0.0.9.** The bridge tracks the platform, and the
hosted endpoint now reports `serverInfo.version` 1.3.10. The platform moved
through 0.1.x and 1.x without the bridge needing to change, so no bridge was
published for those numbers, and none will be: a version is only cut when
there is something to install. The versions in between are not skipped
releases of this package; they never existed here.

### Changed

- **The README says which clients need this package, and which do not.** The
  server now also answers the older HTTP+SSE transport at
  `https://mcp.viafrei.de/sse`, so a client that speaks only HTTP+SSE can connect
  directly. The bridge is for stdio-only clients and nobody else, and the page
  now says so instead of "most clients".

## [0.0.9] - 2026-09-21

The first release with code in it.

`viafrei@0.0.2` on the registry is a three-file placeholder published to reserve
the name; no code was ever shipped under it. npm versions are immutable, so the
first release that ships anything is this one.

**Why 0.0.9 and not 0.1.0.** This package is the client end of a hosted service,
and a version that does not say which service it was built against is a version
you have to look up. So the bridge tracks the platform: 0.0.9 is what the hosted
endpoint runs today. Nothing was ever published as 0.1.0 and no tag was ever cut
for it, so the number is free; the bridge will use it when the platform does.

### Fixed

- **The publish pipeline no longer depends on the calendar.** It installed
  `npm@latest` before publishing, so the version of npm that built and uploaded
  a release was whichever one npm had shipped most recently. npm 12 became
  `latest`, changed `npm pack --json` from an array to an object keyed by
  package name — a deliberate change, announced in npm's own source before it
  landed — and the job broke with no commit here. The npm is pinned now
  (`NPM_VERSION` in the publish workflow), the install is asserted rather than
  assumed, and both shapes are read by one file, `scripts/npm-pack-json.mjs`,
  which every caller goes through: the gate, its self-test, and the workflow
  step that packs the tarball all used to parse that output by hand, three
  copies of an assumption about a format none of them owns. A shape the reader
  does not know is one sentence naming the npm version and pointing at the pin
  — not a `TypeError` with a stack trace of absolute paths in a public log,
  which is what the self-test did, and not the wrong exit code, which the gate
  contract already forbids. The reader's cases are fixtures, so they hold under
  an npm nobody has installed yet.

- **`npx viafrei` started nothing.** The check for "was this file the program,
  or was it imported" compared `process.argv[1]` with `import.meta.url` without
  resolving symlinks. npm installs a `bin` as a symlink and every client starts
  the package through it, so `argv[1]` was the link while Node had already
  resolved the module's own URL to the target: the two never matched, the
  process loaded the file, ran nothing and exited **0 with no output**, which
  reads as a bridge that started and closed rather than as a failure. The entry
  point is now compared both as given and resolved, so it holds under
  `--preserve-symlinks-main` too. Found by installing the packed tarball into an
  empty directory and running the installed command - the whole test suite
  spawned the built file by its real path, which is the one way nobody starts
  it, so 50 passing tests said nothing about the only invocation that exists.
  The regression test spawns through a symlink and fails against the old check.

- **The unreachable-endpoint line advised something that does not exist.** It
  ended "check the URL, or pass `--url` for a different endpoint", which reads
  as though another ViaFrei could be reached at another address. There is one,
  it is hosted, and `--url` is for a proxy in front of it. The line now says to
  check the network connection, and names `--url` only for the proxy case.

### Added

- **The bridge.** `npx viafrei` opens an MCP server on stdio and relays every
  JSON-RPC message to a Streamable-HTTP MCP endpoint - requests, responses,
  notifications and progress, in both directions, unchanged. It is a message
  relay rather than a client/server pair, so a tool added on the server works
  through it the same day without a release here.
- **Configuration.** `--url` / `VIAFREI_MCP_URL` for the endpoint (a proxy in
  front of the service, or the test suite's stub - the server itself is hosted
  and cannot be run yourself), `--header` for a future API key, `--timeout` /
  `VIAFREI_MCP_TIMEOUT_MS`, `--version`, `--help`. No telemetry, no analytics,
  and no file written outside the OS temp directory.
- **Honest failure.** An unreachable or refusing endpoint prints one line naming
  the URL and the status and exits with a code that says which
  (`3` unreachable, `4` the endpoint answered and this cannot continue,
  `5` protocol mismatch, `2` bad usage, `1` anything else) - never a stack
  trace. A protocol mismatch says which version the server speaks; an endpoint
  that answers with something that is not MCP is told apart from one that
  refuses; a session the server has forgotten ends the process instead of being
  warned about for ever; and several failures in a row with nothing succeeding
  in between end it too, so a client never keeps a bridge that cannot relay.
- **Headers stay on the origin you chose.** Redirects are resolved by the bridge
  rather than by `fetch`: same-origin hops are followed with the headers,
  cross-origin redirects are refused with one line naming both ends. `fetch`
  drops `Authorization` across origins and nothing else, so an API key sent as
  `X-Api-Key` would otherwise have travelled wherever the server pointed.
- **Offline test suite.** Every test runs against a stub MCP server the test
  starts itself; nothing contacts the public endpoint or any provider.
- **A publish-hygiene gate that runs in CI**, against the built tarball rather
  than the source tree - five checks: the tarball is the package and only the
  package; no embedded sources; no platform content; **no lifecycle script in
  the published manifest** (npm runs those by itself on every machine that
  installs the package - ours included, so there is no `prepack` here); and
  **every dependency judged by what it resolves to**, not by its name, because a
  git URL under an innocent name is still a git URL. The scan decodes base64,
  hex, percent-encoding, JavaScript escapes and concatenated string literals,
  and prints what it still cannot see on every run - computed from the
  thresholds the decoders actually use, so it cannot claim a coverage the code
  does not have. Its self-test builds one poisoned tarball per rule the gate
  reads - every lifecycle script, every forbidden file name, every required
  file, every pattern, every number, every encoding at every alignment - plus
  one mutated ruleset per refusal the rules can produce, run against BOTH legs
  with a clean control each. It asserts that every case it planned actually ran,
  and refuses when a rule list it derives cases from is empty.
- **A repository leak sweep** over the working tree and the history, with **no
  file skipped**, which refuses (exit 2) rather than passing when there is
  nothing to read: no tracked files, no commits, no blobs, an empty ruleset, or
  a rule whose window can no longer match what it is for. The names it looks for
  are salted hashes rather than text, so the rules file carries no secret and
  needs no exemption - the previous arrangement published the list it was
  protecting and then skipped the file it was in. A name is looked for across
  every separator, at camel-case boundaries, inside an unbroken run of letters
  and digits, and in the file path as well as in the contents. Findings print a
  hash prefix, a length and a location, never the value - a host, a dependency
  spec and a path included, and in the findings themselves rather than only in
  the listing above them: every location a finding carries is built in one
  place, so there is no second printing site to remember. The self-test asserts
  the absence as well as the presence - a case that catches what it was given
  and prints it while doing so fails.
- **Two rules now govern what may go on the private-name list, and they are in
  `scripts/rules.json` next to the list rather than in a review thread.** They
  fail in opposite directions. An entry must not be a substring of text this
  repository legitimately prints, because such an entry can never be satisfied
  and the only ways out are deleting it or weakening the scanner. And nothing
  whose harm *is* the confirmation of a guess may ever be added - a credential,
  a key or token, a password, a session, subscription or contract identifier, a
  certificate serial, a hostname that grants access, personal data - because
  the list is public and it answers questions. A table name confirmed is a fact
  about a schema a stranger cannot reach; an identifier confirmed *is* the
  identifier. Nothing on the list is from that class, checked rather than
  assumed.
- **What the hashes do is now a measured number rather than an impression.**
  A wordlist built from the platform's own files recovers **all** of them; a
  wordlist of ordinary English and technical vocabulary recovers **none** over
  236,132 candidates. The file used to say "most of them", which understated
  the property the arrangement depends on. The hashing is a lint aid, not a
  store, and that sentence is now at the two places where somebody is told how
  to add an entry, rather than four paragraphs away in the rationale.
- **Two entries changed under the first of those rules**: one removed (8
  characters) and one replaced (7 characters out, 10 in), with the rule, the
  lengths and the declared narrowing recorded and nothing else. A name of
  several segments is stored **glued** from now on: the scanner offers every
  window both glued and underscore-joined, so the glued form is found in all
  ten placements measured - including inside a run of letters with no boundary
  in it, the shape a name takes in a minified bundle - while the
  underscore-joined form is found in nine. `blindSpots()` said "with none at
  all" while the entry was stored the other way, and a check that overstates
  its own coverage is worse than one that understates it; it now states the
  condition it actually depends on.
- **The worked example for that spelling rule can now be reproduced.** The pair
  it used was shorter than `minTokenLength`, so a reader who tried it literally
  matched nothing and concluded the rule was broken - and it is printed on every
  run, in four places. Both spellings of the replacement are inside the declared
  window. `_tokenLength` now says what those two numbers are: **the scanner's
  bounds, not a description of the entries, and not to be adjusted to fit them.**
  The decoders size themselves from the lower bound, so trimming the range to
  match whatever is on the list would stop shorter encoded forms from being
  looked at *and* sharpen a published range, in one edit that would feel like
  housekeeping. An entry outside the window means widening the window.
- **Earlier wordings of those notes, in this file and in `scripts/rules.json`,
  said what the changed entries were *about*.** Together those descriptions
  narrowed the guess for a live entry further than the hashes do, which is the
  caption failure the numbers list refuses on the facing page. The wording is
  corrected going forward and no more than that is claimed: the earlier text is
  in this repository's history and in the pull request that carried it, and
  editing a published file does not unpublish it - the same reasoning
  `CONTRIBUTING.md` gives for not squash-merging. The rule from here on is to
  record the rule, the lengths and the narrowing, and never the subject.
- **Two more module-scope ruleset loads are guarded.** The gate's self-test and
  the rule printer both died with an uncaught exception on a malformed or
  missing `rules.json` - the self-test with exit 1 where its own header defines
  2. Each leg loads the file for itself, so one guard cannot cover another.
- **The publish gate cannot die of its own ruleset any more.** Loading
  `rules.json` ran outside every guard, so an unreadable or malformed file
  killed the gate with an uncaught exception - exit 1, the code that means
  *findings*, and a stack trace carrying absolute paths - for a condition its
  own contract defines as exit 2. It now refuses like the sweep does, and a
  ruleset file that is not JSON is a case in the self-test on all three legs.
- **The tarball that is checked is the tarball that is published.** The publish
  workflow packed once for the gate and again for `npm publish`; it now packs
  once and hands that exact file to both.
- **The endpoint check in CI fails when it reads nothing.** It grepped `test/`
  and passed on no hits, so an empty or renamed directory reported success; it
  now asserts that the one legitimate occurrence is there before judging it.
- **[SOURCES.md](SOURCES.md) - where every answer comes from**, and it ships in
  the tarball beside NOTICE rather than living only on the web page. One entry
  per source: who publishes it, what it covers, the publisher's own rhythm, the
  licence with the operative sentence quoted and the date it was read, and the
  **exact attribution line** a recipient has to reproduce. Two obligations that
  bind the *reader* are stated before the catalogue rather than linked from it:
  MTS-K fuel prices are consumer information only and may not be redistributed
  in any form, aggregates included, and DELFI public-transport realtime is
  CC BY-SA 4.0, so anything derived from it stays share-alike. The page says
  which sources do **not** answer today - fuel coverage is a watch list and not
  the country, station lift and escalator status is not available on the public
  service yet - and it names the three cases where a publisher's terms are
  unknown or unreadable instead of rounding them up to "open data".
- **The leak sweep now distinguishes a data provider from the platform, in
  writing.** It did not before, and the distinction was carried by the
  private-name list rather than by a rule: the sweep refused the page above,
  in eleven places in it and one in the rules file itself. **Two entries were
  removed under the first list rule** (10 and 12 characters), and **the two had
  different reasons**, which is worth separating because the stronger one does
  not cover both. The 12-character spelling is **compelled**: a licence
  requires that source to be named by a link, and the link's host contains it.
  The 10-character one is not compelled by any licence - the attribution
  conditions require the creator, the notices and a supplied URI, and none of
  them requires naming an intermediary - it is simply a spelling **our own
  server already broadcasts** in the attribution line it hands to every user
  who receives such an answer, so a page that quotes that line cannot avoid it
  and the rule could be satisfied only by never writing the page. The
  alternative was real and was not taken: the server's own line could have been
  narrowed so it never named the intermediary. It was not, because that line is
  the server's to decide rather than a lint rule's, and because naming the route
  data reached us by is provenance a reader checking a claim uses. That is a
  product decision, and it is recorded as one rather than as law. Rule 2 was
  applied to both before they went - neither is a credential, an identifier or a
  host that grants access. What replaces them is a boundary between a **name**
  and a **route**: a publisher or an intermediary may be named wherever the
  server's own public attribution names it, while a fetch endpoint, an API path,
  a per-offer deep link or a subscription identifier may not appear at all -
  which is why the access point is named in words and its host is on no
  allow-list. The host allow-list gains a second group on the same test: the
  page that publishes a source's terms, the licence text it invokes, or a URL a
  licence compels us to print, and nothing that merely looks relevant.
- **Merged with a merge commit, never a squash**, and
  [CONTRIBUTING.md](CONTRIBUTING.md) says why at length: the history sweep's
  accepted residue is keyed by blob, those blobs live only in intermediate
  commits, and a squash makes them unreachable from `main` - which would turn
  the check red on `main` for everybody, for something no contributor did.

[1.5.4]: https://github.com/mavrovde/viafrei-bridge/releases/tag/v1.5.4
[1.4.9]: https://github.com/mavrovde/viafrei-bridge/releases/tag/v1.4.9
[1.3.22]: https://github.com/mavrovde/viafrei-bridge/releases/tag/v1.3.22
[1.3.16]: https://github.com/mavrovde/viafrei-bridge/releases/tag/v1.3.16
[1.3.15]: https://github.com/mavrovde/viafrei-bridge/releases/tag/v1.3.15
[1.3.12]: https://github.com/mavrovde/viafrei-bridge/releases/tag/v1.3.12
[1.3.10]: https://github.com/mavrovde/viafrei-bridge/releases/tag/v1.3.10
[0.0.9]: https://github.com/mavrovde/viafrei-bridge/releases/tag/v0.0.9
