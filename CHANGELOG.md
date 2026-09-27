# Changelog

All notable changes to this package are documented here. The format follows Keep
a Changelog and the versions follow Semantic Versioning.

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

[1.3.12]: https://github.com/mavrovde/viafrei-bridge/releases/tag/v1.3.12
[1.3.10]: https://github.com/mavrovde/viafrei-bridge/releases/tag/v1.3.10
[0.0.9]: https://github.com/mavrovde/viafrei-bridge/releases/tag/v0.0.9
