# viafrei

A stdio↔Streamable-HTTP bridge for the **ViaFrei MCP server** — German road,
parking, charging, rail and fuel data, answered by your AI assistant.

```
npx viafrei
```

## What this is

ViaFrei is a Germany-wide transport intelligence layer whose interface is the
assistant rather than an app. It is a hosted **MCP server over Streamable HTTP**
at `https://mcp.viafrei.de/mcp`.

Most MCP clients speak Streamable HTTP and should connect to that URL directly —
**they do not need this package.** Some clients still speak only stdio. This
bridge is for those: it runs locally, exposes a stdio MCP server, and relays
every request to the public endpoint.

So the bridge is a transport shim. It holds no data, no database and no
credentials, and it makes no decision about an answer.

## Using it

Node 22 or newer. There is nothing to install: `npx` fetches it when the client
starts it.

**Claude Desktop** (`claude_desktop_config.json`) — and the same three lines fit
any client that takes an stdio MCP server, including the `.mcp.json` an IDE
reads:

```json
{
  "mcpServers": {
    "viafrei": {
      "command": "npx",
      "args": ["-y", "viafrei"]
    }
  }
}
```

**A different endpoint** — for example a server running locally on port 3000:

```json
{
  "mcpServers": {
    "viafrei": {
      "command": "npx",
      "args": ["-y", "viafrei", "--url", "http://127.0.0.1:3000/mcp"]
    }
  }
}
```

`VIAFREI_MCP_URL` does the same thing for clients that pass environment
variables rather than arguments. A flag wins over the variable; the variable
wins over the built-in default.

### Options

| option | what it does |
|---|---|
| `--url <url>` | endpoint to relay to. Default `https://mcp.viafrei.de/mcp` |
| `--header "Name: value"` | extra HTTP header on every request, repeatable. For an API key, when there is one |
| `--timeout <ms>` | per-request timeout, default 30000. The event stream is never timed out |
| `--version`, `--help` | print and exit |

Environment: `VIAFREI_MCP_URL`, `VIAFREI_MCP_TIMEOUT_MS`.

### When something is wrong

The bridge prints one line to stderr and exits with a code that says what
happened. No stack traces:

```
viafrei: cannot reach https://mcp.viafrei.de/mcp: connection refused (ECONNREFUSED) - check the URL, or pass --url for a different endpoint
```

| exit | meaning |
|---|---|
| `0` | clean shutdown (the client closed stdin, or sent SIGINT/SIGTERM) |
| `1` | something else went wrong; the line says what |
| `2` | bad usage — a flag or a value the bridge does not accept |
| `3` | the endpoint could not be reached, stopped answering, or never answered in time |
| `4` | the endpoint answered and this cannot continue: it refused (the line names the HTTP status), it forgot the session, it answered with something that is not MCP, or it redirected to another origin |
| `5` | protocol version mismatch; the line names the version the server speaks |

An established session is allowed to wobble — a dropped event stream is a
warning, not an exit, and the bridge reconnects. It is not allowed to be dead in
silence: several failures in a row with nothing succeeding in between end the
process with the code above, so the client that started it finds out.

### What it does not do

No telemetry, no analytics, no usage counter, no update check. It writes no file
outside the OS temp directory, and it stores no credential — `--header` is
passed through to the endpoint and never persisted or logged.

It also does not follow a redirect off the origin you pointed it at. Your
headers go to that origin and nowhere else: a cross-origin redirect is refused
with one line naming both ends, so a server cannot forward your API key
somewhere you did not choose. Same-origin redirects are followed normally.

## What the server can answer

The tool catalogue is **not duplicated here**, deliberately. A pasted list goes
out of date the first time a description changes on the server, and then this
page describes a server that no longer exists. There is one source of truth and
it is the running server:

- point any MCP client at `https://mcp.viafrei.de/mcp` and call `tools/list`;
- or read <https://viafrei.de> for the catalogue rendered from that same list.

## Using the data you get back

Every result carries an attribution line. **Show it to the person reading the
answer.** The full register lives at the resource `viafrei://attribution`.

Two constraints matter more than the rest, because getting them wrong is a
licence breach rather than a style problem:

- **MTS-K fuel prices are consumer information only.** No redistribution in any
  form — that includes aggregates, comparisons, price tables and anything
  derived. Answer the person who asked; do not build a product out of it.
- **DELFI public-transport data is CC BY-SA 4.0.** Share-alike travels with
  anything derived from it, and it must not be blended into a result under a
  different licence.

See [NOTICE](NOTICE) and [LICENSE](LICENSE).

## The server itself

The MCP server is offered as a **hosted service**, and its source is closed. It
is not in this repository and is not published. What is public is the part that
is meant to be: the tool names, their descriptions, their input schemas, the
shape of the results and the attribution lines — everything a client reads from
`tools/list`, which is the product surface.

This is said plainly so nobody spends an evening looking for the server code.

## Contributing

Yes, please — see [CONTRIBUTING.md](CONTRIBUTING.md). Issues and discussions are
open. The bridge is small and self-contained, which is exactly what makes it a
reasonable thing to send a first patch to.

## Security

Never open a public issue for a key, a token or anything that looks like one.
See [SECURITY.md](SECURITY.md) for the private reporting path.

## Licence

[Apache-2.0](LICENSE) for this code. Data obtained through the server keeps its
provider's licence — see [NOTICE](NOTICE).
