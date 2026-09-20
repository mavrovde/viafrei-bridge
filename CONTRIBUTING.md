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
node dist/cli.js --url http://127.0.0.1:8787/mcp
```

Four more checks exist, and CI runs all of them:

```bash
npm run check:tarball   # what npm pack would publish, unpacked and read
npm run test:gate       # poisons that tarball 25 ways and checks the gate catches each
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
- The generic patterns (SQL keywords, a source-map marker) are base64 only so
  that the file is not a match for itself. `npm run rules:show` decodes
  everything; findings print a hash prefix and a file and line, never the name,
  because a CI log on a public repository is as public as the file.

Adding a rule: a new pattern needs a `sample` (base64) that it must match — the
gate's self-test poisons a real tarball with it, so a rule added is a case added.
A new private name is added as a hash: `node -e "…"` with the salt from the file,
or ask a maintainer. Never paste the name.

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
