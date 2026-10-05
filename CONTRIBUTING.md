# Contributing

Thank you — the bridge is deliberately small, which makes it a reasonable place
to send a first patch.

## Read this first: what lives here and what does not

This repository holds **only the bridge** — a stdio↔Streamable-HTTP relay to
`https://mcp.viafrei.de/mcp`.

The ViaFrei MCP server is a **hosted service and its source is closed**. It is
not here and is not published. That is a deliberate decision, not an oversight,
and it is written down so you do not spend an evening looking for code that was
never pushed.

What *is* public is the part that is meant to be read: tool names, descriptions,
input schemas, result shapes and attribution lines. Any MCP client gets all of
it from `tools/list` against the live server. If you want to know what the
server can do, ask the server.

**So: a change to a tool's behaviour, a new data source, or a fix to an answer
cannot be made in this repository.** Open an issue or a discussion here
describing what is wrong with the answer, and it will be picked up on the other
side. A bug report against the server is welcome and useful — it is just not a
pull request you can write.

Things you *can* change here: the relay itself, its argument and configuration
handling, its error messages, its tests, its packaging, and this documentation.

## Running it

Node 22 or newer.

```bash
npm install
npm run build
npm test
```

`npm test` builds first and then runs the suite against a stub server it starts
itself. To try the bridge by hand against that stub, or against any local
Streamable-HTTP MCP server:

```bash
node dist/cli.js --url http://127.0.0.1:3000/mcp
```

More checks exist, and CI runs every one of them (the list of steps is
`.github/workflows/ci.yml`; none of them needs the network):

```bash
npm run check:versions  # package.json and package-lock.json agree on the version
npm run check:tarball   # what npm pack would publish, unpacked and read
npm run test:gate       # poisons that tarball once per rule, and mutates the ruleset once per refusal
npm run check:leaks     # the repository itself (CI adds -- --history for every commit)
npm run test:leaks      # the sweep's own history scope, on a throwaway repository
npm run test:tools      # every spawned program comes from scripts/tools.mjs, not from $PATH
npm run check:docs      # API.md matches catalogue.json
npm run check:readme    # the README's catalogue section matches catalogue.json
npm run check:sources   # the counts SOURCES.md states agree with catalogue.json
```

Each `check:*` above that renders or reads a document has a `test:*` self-test
beside it (`test:docs`, `test:readme`, `test:sources`, `test:versions`), and the
release tooling has seven more that run against local stubs, injected fetches or
fixture files (`test:probe`, `test:freshness`, `test:propose`, `test:auto-release`
for the automatic release path, the two release verifiers, `test:verify` for npm
and `test:verify-smithery` for the Smithery listing, and `test:release-notes` for
the release page).

### How a release happens

This package carries the version of the hosted server it relays to. The `Version
sync` workflow (`.github/workflows/version-sync.yml`) compares the running server,
the registry and `main` every hour (minute 30; one `initialize` and the four list
calls, never a tool call). When the server is ahead, it prepares the release with
`scripts/propose-release.mjs` and opens a `release/X.Y.Z` pull request. What
happens next depends on one decision, made by `scripts/auto-release.mjs decide`:

- **A pure mirror is released automatically.** The probe found the surface
  unchanged, every offline gate passed and the leak sweep is clean. The workflow
  waits for the pull request's required checks (`build-and-test (22)`,
  `build-and-test (24)`, `SonarCloud Code Analysis`) for at most 30 minutes,
  merges it with a merge commit pinned to the head it checked, pushes the
  annotated tag `vX.Y.Z` on the merge commit, then dispatches the `npm` workflow
  on the tag and waits for it to succeed, then dispatches `Smithery` and `Release
  page`. A red check, a check still pending at the deadline, a pull request a
  person has touched in the meantime, or any later failure ends the run red with
  the reason, and the message says what has already happened at that stage. Nothing
  is merged on red or pending. A pull request left unmerged waits for a person, who
  finishes it the manual way below; a stage that failed after the merge is recovered
  as described under "Recovering a release that stopped halfway".
- **Anything else is a person's.** A changed surface, a probe report that could not
  be classified, a failed gate or a leak
  finding opens the pull request as a draft (or a ready pull request for a
  person) and the workflow stops. Review it, write what the change means in the
  CHANGELOG block, merge with a merge commit, then `git tag vX.Y.Z <merge sha>`
  and push the tag on its own. The tag push starts `npm`, and `npm`'s success
  starts `Smithery` and `Release page`.

Why the automatic path dispatches the three workflows instead of letting the tag
start them: a tag pushed with `GITHUB_TOKEN` starts no workflow, because GitHub
creates no new runs for events caused by that token, apart from
`workflow_dispatch` and `repository_dispatch`. `Smithery` and `Release page` act on
a `workflow_run` of `npm` only when that run was a tag **push**, so a dispatched
`npm` run never starts them a second time.

"Unchanged" means the catalogue probe reported the snapshot DATED, read positively:
exit 0, or exit 1 with the DATED report and without the WRONG one. Any other report
(reworded, an undocumented exit code, a crash) is `unclassified` and goes to a
person, like a changed surface. The surface includes the server's instructions,
capabilities and protocol version as well as the tool, resource, template and prompt
lists, because API.md renders all of them and ships in the tarball.

If the required checks of `main` change, change `REQUIRED_CHECKS` in the
workflow's `release` job too. Each entry is `name@app-slug`, matched the way branch
protection matches it: the two CI jobs come from `github-actions` and the analysis
from `sonarqubecloud`, and a check of the same name from another app does not count.
The workflow cannot read branch protection itself, and GitHub's own protection
still refuses a merge with a required check missing.

**What a merge by the workflow does not get.** A merge made with `GITHUB_TOKEN` starts
no `push` run, so `main`'s merge commit gets no CI run. Whether SonarCloud's automatic
analysis of `main` follows such a merge has not been checked here. This is accepted
because the tree was green on the pull request and `publish.yml` runs every gate again
against the tag before it uploads anything.

**Things that have not been checked yet:**

- *npm trusted publishing from a dispatched run.* The trusted publisher is matched on
  the repository, the workflow file name (`publish.yml`) and the `npm` environment.
  It has no field for the ref or the event. npm's documentation
  (docs.npmjs.com/trusted-publishers) warns that with `workflow_call`, "or
  workflow_dispatch", validation may check the calling workflow's name. Here
  `publish.yml` itself is dispatched, not called from another file, so the name should
  match. No release has yet been published from a dispatched run (every one so far
  came from a pushed tag). The first automatic release is the first time this path
  runs. If it fails, the recovery below applies.
- *Who `mergedBy` names when the workflow merges.* The stuck-release check accepts
  `github-actions`, `github-actions[bot]` and `app/github-actions`.
- *Approving the held CI run.* For a pull request opened with `GITHUB_TOKEN`, GitHub
  holds the CI run until it is approved. The workflow approves it with the same token,
  and that call is known to work: the Version sync run that opened #53 logged the
  approval. Whether the held run blocks the merge, or whether a dispatched CI run
  simply does not count, was seen once (#40) and not told apart. Approving it covers
  both cases.

**Recovering a release that stopped halfway.** Each failure message says which stage
it stopped at. The hourly run also turns red, with the fix, while the release stays
stuck:

- *Red before the merge* (a check red, or still pending after 30 minutes). Nothing was
  merged. Finish by hand: merge with a merge commit, then tag.
- *Merged but not tagged.* The next hourly run reports it. Tag the merge commit
  (`git tag -a vX.Y.Z <merge sha>`) and push the tag yourself. A tag pushed by a person
  starts `npm`, and `npm`'s success starts `Smithery` and `Release page`.
- *Tagged, but npm did not publish.* The next hourly run reports it. Re-run the
  failed job of that Version sync run, or dispatch `publish.yml` on the tag with
  `dry_run=false`. Once npm serves the version, dispatch `smithery.yml` (input
  `version`) and `release-page.yml` (input `tag`) by hand. Their `workflow_run` trigger
  skips an npm run that was dispatched rather than started by a tag push, so they will
  not start on their own.
- *npm published, Smithery or the release page failed.* Dispatch the one that failed,
  with the same input.

### Release pages are written from the CHANGELOG

Nobody writes a GitHub release page by hand. After the npm workflow has published
a `v*` tag and verified it, the `Release page` workflow
(`.github/workflows/release-page.yml`) creates the page for that tag:

- **Body:** a normal release note built from the tag's `## [X.Y.Z]` block of
  `CHANGELOG.md`, read at the tag. The Version sync proposer's opening paragraph is
  written for whoever merges the pull request (registry numbers, the probe's verdict,
  the raw `- tools: x differs between the server and the snapshot` list), so on the
  page it becomes one sentence: "This release mirrors server X.Y.Z." — plus "the tools,
  prompts and resources are unchanged" when the probe said so — and the raw difference
  lines are dropped. Everything you wrote below it is kept, with hard-wrapped lines
  joined, because a page renders every newline as a line break. A pure mirror gets a
  line saying no bridge code changed. Every page ends with an **Install** section
  (`npx -y viafrei@X.Y.Z`) and a **Full changelog** link to the previous tag, unless the
  block already carries an install line. A missing or empty block fails the run and
  names the tag, and so does a CHANGED or UNCLASSIFIED surface that nobody described,
  or a leftover "A person must ..." instruction: a page cannot say what nobody wrote.
  **So when the surface changed, describe each change in prose for a reader of the
  package** (what a user can now do, what moved), as the v1.7.0 page does.
- **Title:** `viafrei vX.Y.Z — <lead>`, where the lead is the block's **first bold
  lead that is not "Mirrors the server"**. A bold lead is `**...**` opening a
  paragraph or a list item (not a wrapped line that happens to start with bold), with
  backticks and a trailing `.`, `:` or `;` dropped. "Mirrors the server" is the line
  the Version sync proposer opens every block with, so it is skipped and the first
  real change names the page; when it is the block's only bold lead (a pure
  version-sync release) the title is `viafrei vX.Y.Z — same tools, mirrors the server`
  (`MIRROR_TITLE`). A block with no bold lead at all fails the run. The string is one
  constant, `MIRROR_LEAD` in `scripts/release-notes.mjs`, and the self-test fails if
  the proposer's opening line stops matching it. Choose the title by the first real
  bold lead you write.
- **Latest:** only when the tag is the highest `vX.Y.Z` tag, compared as numbers.
- **Never destructive:** a page that already exists for the tag, draft or published,
  is left unchanged and the run says so. To change a page, edit it on GitHub.

`scripts/release-notes.mjs` holds those rules and `npm run test:release-notes` pins
them. To see what a tag's page would say before tagging:

```bash
git tag -l 'v*' > /tmp/tags && echo v1.7.0 >> /tmp/tags
node scripts/release-notes.mjs 1.7.0 CHANGELOG.md /tmp/tags /tmp/body.md && cat /tmp/body.md
```

If a run failed (a block was missing, say), fix nothing on the tag: dispatch the
workflow by hand with the tag once the cause is gone. It verifies npm again first,
and that verifier requires the version to be npm's `latest`, so a dispatch works
for the newest release only.

**API.md and the README's catalogue section are generated.** Do not edit them
by hand: change `catalogue.json` (which a release re-captures from the running
server) and run `npm run docs:api` and `npm run docs:readme`. Everything in the
README outside the two `catalogue:` markers is hand-written and yours to fix.

One more command prints rather than checks, and CI does not run it:

```bash
npm run rules:show      # print the rules both checks read, decoded
```

### The npm the release is published with is pinned

`.github/workflows/publish.yml` sets `NPM_VERSION` and installs exactly that npm,
then asserts it got it. It used to install `npm@latest`, which meant the result
of a release depended on the day it ran: npm 12 changed `npm pack --json` from
an array to an object keyed by package name — a deliberate major-version change
— and the publish job broke with no commit in this repository.

So there is one reader for that output, `scripts/npm-pack-json.mjs`. It knows
both shapes, every caller goes through it, and a shape it does not know is one
sentence naming the npm version, not a stack trace. Its cases are fixtures
rather than whatever npm is installed, because a suite that only packs proves
the pipeline against the npm it happens to be standing next to.

To bump the pin, install the candidate into a temporary prefix instead of
changing your machine's npm, and run the gate against it:

```bash
npm install --prefix /tmp/npm-candidate npm@<version> --ignore-scripts
PATH=/tmp/npm-candidate/node_modules/.bin:$PATH npm run test:gate
```

`scripts/rules.json` is the single list both checks read, and it is worth
knowing why it looks the way it does:

- The private names are stored as **salted sha256 hashes**, never as text. The
  first version of this file listed them in the clear, with a caption explaining
  what each one was, in a public repository — a denylist of secrets is a list of
  secrets. Hashing does not make a short name unguessable; it removes the
  *publication*.
- It was also the one file the sweep skipped, which is precisely where the leak
  ended up. Nothing is skipped now: the rules file holds no secret, so it is
  scanned like any other file.
- The generic patterns (SQL keywords, a source-map marker) are stored base64
  **and reversed**, so the file is not a hit for its own rules when read as text
  *or* when read as base64 — the scanner does both now. `npm run rules:show`
  decodes everything; findings print a hash prefix, a shape or a length, plus a
  file and line, and never the value, because a CI log on a public repository is
  as public as the file.
- **Numbers are not hashed at all.** A hash of a value from a small enumerable
  space is the value with extra steps: that whole space falls in under a tenth
  of a second, and publishing a minimum length made it collapse further. That
  class is covered by the opposite construction — `numbers.allowed`, an
  allow-list of the numbers this repository may contain, with no captions. An
  allow-list tells a reader nothing they could not get by reading the files, and
  it catches every internal value of that shape, not only the ones someone
  remembered to add.
- **Every entry on that allow-list has to occur in the working tree**, and the
  rule is checkable rather than promised: `git grep` each one. An entry that
  occurs nowhere is there to silence a finding about a value somebody took out,
  a diff against the tree isolates it in one step, and an entry a reader can
  isolate is a caption pointing at the value — which is the whole thing the
  allow-list exists to avoid. One entry was like that and has been removed; the
  occurrences it covered are in the history, cannot be recalled, and are
  recorded as residue in `historyNumberResidue`, keyed by blob rather than by
  value.
- **A rule that cannot match anything is a refusal, not a quieter pass.** The
  digit window and the allow-list have to describe the same class of number, so
  moving the window off the allow-list makes both legs exit 2. It used to make
  the number rule inert while both of them printed PASS.
- Counts are not written down in this file on purpose; they drift. `npm run
  rules:show` prints how many of each there are, from the file itself.

Adding a rule: a new pattern needs a `sample` (base64, reversed) that it must
match, and a new forbidden file name needs a `sample` file name that it rejects —
the gate's self-test builds one poisoned tarball per rule from those samples, so
a rule added is a case added, and a rule without a usable sample stops the test
rather than shrinking it. A number does not go on the hash list at all; decide
whether it belongs in a public repository, and if it does, add it to
`numbers.allowed`.

### Adding a private name

**Read this before you add one: the hash does not hide the name.** It keeps the
list out of the clear so that the rules file is not itself the publication, and
it confirms a guess for anyone who already has one. The audit in `rules.json`
recovered *every* entry from a wordlist built out of the platform's own tracked
files — 8 of 8, measured on the eight-entry list of that round. Entries have
been removed since, so read `_read_me` in that file for which list each figure
was measured on rather than carrying one over. So the question to ask is never
"is the hash strong enough" — it is "may this string be confirmed to a
stranger", and two rules answer it:

1. **It must not be a substring of text this repository legitimately prints.**
   Such an entry can never be satisfied; the only ways out are deleting it or
   weakening the scanner, and weakening the scanner is strictly worse. This has
   already happened more than once; `rules.json` records each one, and no count
   of them is kept here, because a count goes stale every time the rule fires.
2. **It must not be anything whose harm *is* the confirmation of a guess** — a
   credential, an API key or token, a password, a session, subscription or
   contract identifier, a certificate serial, a hostname that grants access,
   personal data. A table name confirmed is a fact about a schema a stranger
   cannot reach; an identifier confirmed *is* the identifier. Anything from that
   class does not belong in this repository at all: remove it and rotate it,
   and do not add a hash of it here.

Then: add it as a hash — `node -e "…"` with the salt from the file, or ask a
maintainer — and **never paste the name** into the file, a commit message, an
issue or a pull request. Spell a name of several segments **glued**
(`alphabeta`, not `alpha_beta`): the scanner offers every window of a line both
glued and underscore-joined, so the glued form is found in every separated
spelling *and* inside a run with no boundaries in it, which the separated form
cannot be. Both spellings in that example are inside the declared length range,
so you can try it.

If the name falls outside `minTokenLength`/`maxTokenLength`, **widen** them —
and never narrow them to fit the list. They are the scanner's bounds, not a
description of the entries: the decoders size themselves from the lower one, so
tidying them inwards would cost coverage and sharpen a published range in a
single edit that felt like housekeeping. `blindSpots()` reports what the range
leaves uncovered, on every run.

When an entry has to change, record **the rule that was applied, the lengths,
and any narrowing** in `rules.json` — never what the entry was *about*. Several
such notes together narrow the guess more than the hashes do, which is the
caption failure this whole arrangement exists to have stopped.

**Both checks refuse rather than pass when they cannot see anything.** An empty
repository, a ruleset with no entries, a rule list whose window can no longer
match what it is for, or a history with no blobs: all exit 2, in *each* leg
rather than only in the pair — a leg that refuses because its neighbour does is
not a leg that refuses. A check that read nothing has not checked anything, and
reporting that as success is the failure this project keeps finding.

The self-test asserts that every case it planned actually ran, and refuses when
a rule list it derives cases from is empty. It holds no baseline against an
earlier run, so it does not — and does not claim to — notice a rule list that
merely got shorter.

**What hashing does not do.** The hashes are a confirmation oracle: with a
wordlist anyone could assemble from this repository's own prose, a reviewer
recovered most of them in seconds. That is accepted rather than overlooked. The
list is internal naming with no access value and nothing to rotate, and the real
gain was never the strings; it was losing the captions that explained what each
one *was*, and losing the exemption that stopped the sweep reading its own
rules. `npm run rules:show` prints how many there are; no count and no
breakdown by category is written down here, because a breakdown is a wordlist
hint and a count goes stale the moment the list changes. Moving `rules.json` out
of this repository was considered and rejected: a rules file behind a secret
means the sweep and the gate cannot run for an outside contributor or in a fork,
so the check would report success in exactly the case it exists for.

There is deliberately **no `prepack`, `prepare` or any other lifecycle script**
in `package.json`. npm runs those by itself on every machine that installs the
package, and the gate refuses a published manifest that declares one — including
ours. Build explicitly (`npm run build`) instead.

## Tests are offline. Always.

**No test and no CI job may contact the public endpoint or any provider.** Not
once, not "just to check". Provider keys get revoked for it, and a test that
depends on a live third party fails for reasons that have nothing to do with the
change under review.

The suite runs against a **local stub MCP server that the test starts itself**.
If you are adding a case that needs a server behaviour the stub does not have,
extend the stub.

A test that needs the network is not a test we can merge, however useful it
looks.

## What a good change looks like

- **Fix the cause, not the symptom.** A `catch` that swallows an error so the
  symptom goes away will be sent back.
- **Fail honestly.** A refused or unreachable endpoint should print one line
  naming the URL and the status — never a stack trace, and never a cheerful
  message about something that did not happen. If the bridge does not know, it
  says it does not know.
- **No new dependency without a reason** stated in the pull request. This
  package is installed by `npx` on other people's machines; every dependency is
  someone else's supply chain in your users' terminal.
- **No telemetry, no analytics, no phoning home**, ever. The bridge writes
  nothing outside the OS temp directory.
- **Tests with the change**, in the same pull request.

## The data rules apply to examples too

If you write an example, a fixture or a README snippet that shows a result:

- **MTS-K fuel prices are consumer information only** — no redistribution in any
  form, aggregates and comparisons included. Do not build an example that shows
  a price table.
- **DELFI public-transport data is Creative Commons Attribution-ShareAlike** —
  share-alike travels with anything you *derive* from it, a rearrangement
  included. The realtime feed's catalogue entry states no licence version, so do
  not write one into an example; `SOURCES.md` has the evidence.
- Every result carries an attribution line, and an example that drops it teaches
  the wrong thing.

See [NOTICE](NOTICE).

## Pull requests

- One topic per pull request. A refactor bundled with a fix hides the fix.
- Branch from `main`, name it `feat/…`, `fix/…` or `docs/…`.
- Say in the body what you changed, why, and how you know it works — the command
  you ran and the real output, not "tests pass".
- **Every pull request gets an independent review before it is merged.** Expect
  questions; they are about the code.
- Keep the commit history readable. Squash your own noise *before you push*; do
  not rewrite anyone else's. That is about your local commits, and it is not the
  same thing as the button you press at the end — see below.

## Merging: a merge commit, never a squash

**This repository is merged with "Create a merge commit". Rebase and merge is
acceptable. "Squash and merge" is forbidden, and here is why, because a rule
without its reason gets reverted by the next person in a hurry.**

`scripts/rules.json` carries `historyNumberResidue`: a short list of *blobs*,
named by content address, whose number findings the history sweep accepts as
already-published residue. It is keyed by blob because a blob cannot change, so
an exemption cannot quietly widen, and because one entry then covers the same
file at several revisions.

Every one of those blobs lives only in an intermediate commit of a feature
branch. A squash merge writes a single new commit whose tree does not contain
them and leaves no parent that does. Neither reaches them then: not
`git rev-list HEAD` on `main`, which is what the sweep reads by default, and
not `git rev-list --all`, which it reads under `--all-refs` in the
publishing build. `npm run check:leaks -- --history` then reports every entry
as matching no blob in this history — on `main`, for everyone who clones it,
for a condition no contributor introduced. This is not hypothetical: it was
measured in a fresh clone of a squash-merged branch before the rule was written
down.

Three things that look like alternatives and are not:

- *Empty the residue list as part of the squash.* There is no ordering that
  works. Empty it before the merge and the branch's own history leg goes red,
  because on the branch those blobs are still reachable and their findings come
  back. Empty it after and there is a red window on `main` in between. A
  "tolerate a missing blob" setting would close the window, and it would also
  be a bypass switch with better manners.
- *Squash to unpublish the history.* It does not unpublish anything. GitHub
  keeps every pushed tip under `refs/pull/<n>/head`, and those objects stay
  fetchable from the public repository whatever `main` looks like. A squash
  destroys an accurate record of how the code got here and buys nothing in
  exchange.
- *Widen the rule so the failure stops happening.* That is the move this whole
  ruleset exists to refuse. A check that is relaxed until it stops complaining
  is a check that reports success about what it no longer reads.

The cost of the rule, stated plainly rather than glossed: the intermediate
commits stay reachable from `main` for good, including the ones whose content
the residue list exists to excuse. That content is already published — a merge
commit changes *reachability*, not publication, and reachability is the only
thing a sweep can check.

"Allow squash merging" is **off** in Settings → General → Pull Requests, so the
button is not there to click; merge commit and rebase are the only two offered.
A rule that depends on which of three buttons somebody presses would eventually
lose to the default, and a repository setting is not part of any diff, so it
could not be done in the pull request that needed it. If you ever find the
option back on, this section is why it should not be.

## Security

Do not open a public issue, discussion or pull request for a key, a token or a
vulnerability. Use the private path in [SECURITY.md](SECURITY.md). If a secret
of yours is exposed, rotate it first and report it second.

## Licence

By contributing you agree that your contribution is licensed under
[Apache-2.0](LICENSE), like the rest of this code.
