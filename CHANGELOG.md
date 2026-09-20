# Changelog

All notable changes to this package are documented here. The format follows Keep
a Changelog and the versions follow Semantic Versioning.

## [0.1.0] - 2026-09-20

The first release with code in it.

`viafrei@0.0.2` on the registry is a three-file placeholder published to reserve
the name; no code was ever shipped under it. npm versions are immutable, so the
first real release is this one.

### Added

- **The bridge.** `npx viafrei` opens an MCP server on stdio and relays every
  JSON-RPC message to a Streamable-HTTP MCP endpoint - requests, responses,
  notifications and progress, in both directions, unchanged. It is a message
  relay rather than a client/server pair, so a tool added on the server works
  through it the same day without a release here.
- **Configuration.** `--url` / `VIAFREI_MCP_URL` for the endpoint (self-hosters,
  a local server), `--header` for a future API key, `--timeout` /
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
  file, every pattern, every encoding at every alignment - and refuses to run at
  all if that plan ever shrinks.
- **A repository leak sweep** over the working tree and the history, with **no
  file skipped**, which refuses (exit 2) rather than passing when there is
  nothing to read: no tracked files, no commits, no blobs, or an empty ruleset. The names it looks for are salted hashes rather than text, so
  the rules file carries no secret and needs no exemption - the previous
  arrangement published the list it was protecting and then skipped the file it
  was in. Findings print a hash prefix and a location, never the name.

[0.1.0]: https://github.com/mavrovde/viafrei-bridge/releases/tag/v0.1.0
