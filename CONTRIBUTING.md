# Contributing

Thank you — the bridge is deliberately small, which makes it a reasonable place
to send a first patch.

## Read this first: what lives here and what does not

This repository holds **only the bridge** — a stdio↔Streamable-HTTP relay to
`https://mcp.viafrei.de/mcp`.

The ViaFrei MCP server is a **hosted service and its source is closed**. The
database schema, the ingest workers, the provider connectors and the query layer
are not here and are not published. That is a deliberate decision, not an
oversight, and it is written down so you do not spend an evening looking for
code that was never pushed.

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

Four more checks exist, and CI runs all of them:

```bash
npm run check:tarball   # what npm pack would publish, unpacked and read
npm run test:gate       # poisons that tarball once per rule and checks the gate catches each
npm run check:leaks     # the repository itself, working tree and history
npm run rules:show      # print the rules both checks read, decoded
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
  space is the value with extra steps: the whole 4–5 digit space falls in under
  a tenth of a second, and publishing a minimum length made it collapse further.
  That class is covered by the opposite construction — `numbers.allowed`, an
  allow-list of the numbers this repository may contain, with no captions. An
  allow-list tells a reader nothing they could not get by reading the files, and
  it catches every internal value of that shape, not only the ones someone
  remembered to add.
- Counts are not written down in this file on purpose; they drift. `npm run
  rules:show` prints how many of each there are, from the file itself.

Adding a rule: a new pattern needs a `sample` (base64, reversed) that it must
match, and a new forbidden file name needs a `sample` file name that it rejects —
the gate's self-test builds one poisoned tarball per rule from those samples, so
a rule added is a case added, and a rule without a usable sample stops the test
rather than shrinking it. A new private name is added as a hash: `node -e "…"`
with the salt from the file, or ask a maintainer. Never paste the name. If it
falls outside `minTokenLength`/`maxTokenLength`, update those too — the decoders
size themselves from that range and `blindSpots()` reports what it leaves
uncovered. A number does not go on the hash list at all; decide whether it
belongs in a public repository, and if it does, add it to `numbers.allowed`.

**Both checks refuse rather than pass when they cannot see anything.** An empty
repository, a ruleset with no entries, a history with no blobs, or a self-test
whose plan shrank all exit 2 — a check that read nothing has not checked
anything, and reporting that as success is the failure this project keeps
finding.

**What hashing does not do.** The hashes are a confirmation oracle: with a
wordlist anyone could assemble from this README, a reviewer recovered 10 of the
12 in seconds. That is accepted rather than overlooked. The list is internal
naming — tables, roles, two ports, one environment-variable name — with no
access value and nothing to rotate, and the real gain was never the strings; it
was losing the captions that explained what each one *was*, and losing the
exemption that stopped the sweep reading its own rules. Moving `rules.json` out
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
- Keep the commit history readable. Squash your own noise; do not rewrite anyone
  else's.

## Security

Do not open a public issue, discussion or pull request for a key, a token or a
vulnerability. Use the private path in [SECURITY.md](SECURITY.md). If a secret
of yours is exposed, rotate it first and report it second.

## Licence

By contributing you agree that your contribution is licensed under
[Apache-2.0](LICENSE), like the rest of this code.
