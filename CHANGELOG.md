# Changelog

All notable changes to this package are documented here. The format follows Keep
a Changelog and the versions follow Semantic Versioning.

## [1.3.10] - 2026-09-23

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

[1.3.10]: https://github.com/mavrovde/viafrei-bridge/releases/tag/v1.3.10
[0.0.9]: https://github.com/mavrovde/viafrei-bridge/releases/tag/v0.0.9
