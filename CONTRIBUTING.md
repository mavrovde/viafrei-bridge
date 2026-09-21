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

Three more checks exist, and CI runs all three:

```bash
npm run check:tarball   # what npm pack would publish, unpacked and read
npm run test:gate       # poisons that tarball once per rule, and mutates the ruleset once per refusal
npm run check:leaks     # the repository itself, working tree and history
```

A fourth command prints rather than checks, and CI does not run it:

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
recovered *every* entry on the current list from a wordlist. So the question to
ask is never "is the hash strong enough" — it is "may this string be confirmed
to a stranger", and two rules answer it:

1. **It must not be a substring of text this repository legitimately prints.**
   Such an entry can never be satisfied; the only ways out are deleting it or
   weakening the scanner, and weakening the scanner is strictly worse. Two
   entries have already had to go for this.
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
- **DELFI public-transport data is CC BY-SA 4.0** — share-alike travels with
  anything derived from it.
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
them and leaves no parent that does, so neither `git rev-list HEAD` on `main`
— which is what the sweep reads — nor `git rev-list --all`, which it reads
under `--all-refs` in the publishing build, can reach any of them. `npm run check:leaks -- --history` then reports every entry
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
