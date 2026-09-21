# viafrei

**German road, rail, parking, charging and fuel data — live, inside your AI
assistant.**

```
npx viafrei
```

## Ask your assistant things like

> **Wie ist die Lage auf der A3 zwischen Köln und Frankfurt?**
> Auf der A3 sind aktuell drei Störungen gemeldet …

Plain German or plain English, whichever you speak:

- *Ist die A7 gerade gesperrt?*
- *Next trains from Hamburg Hbf, with platform and delay*
- *Find a rest area with lorry parking on the A9*
- *Sind auf der A8 Baustellen geplant, wenn ich nächste Woche fahre?*
- *Wo kann ich in Leipzig mit Typ 2 laden?*
- *Gibt es eine Unwetterwarnung für Freiburg?*
- *Brauche ich in Deutschland eine Umweltplakette?*
- **Tell me when the A8 reopens** — the server can watch a situation and say so
  when it changes, without being asked again

Thirteen tools today. The list is not copied onto this page, deliberately: one
pasted list goes stale the first time the server changes, and then this page
describes a server that no longer exists. Ask the server instead — any MCP
client gets the current catalogue from `tools/list`, and
<https://viafrei.de> renders that same list.

## Quick start

Node 22 or newer. Nothing to install — `npx` fetches the bridge when your
client starts it.

**Claude Desktop** (`claude_desktop_config.json`). The same three lines fit any
client that takes an stdio MCP server, including the `.mcp.json` an IDE reads:

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

Restart the client and ask it one of the questions above. There is no account,
no API key and no sign-up.

## Do you actually need this package?

Probably not — and that is deliberate.

Most MCP clients speak Streamable HTTP and should connect straight to
`https://mcp.viafrei.de/mcp`. **They do not need this package at all.**

Some clients still speak only stdio. This bridge is for those: it runs locally,
exposes a stdio MCP server, and relays every request to the public endpoint. It
is a transport shim — it holds no data and no credentials, and it makes no
decision about any answer.

## Configuration

| option | what it does |
|---|---|
| `--url <url>` | endpoint to relay to. Default `https://mcp.viafrei.de/mcp` — see the note below |
| `--header "Name: value"` | extra HTTP header on every request, repeatable. For an API key, when there is one |
| `--timeout <ms>` | per-request timeout, default 30000. The event stream is never timed out |
| `--version`, `--help` | print and exit |

`VIAFREI_MCP_URL` and `VIAFREI_MCP_TIMEOUT_MS` do the same for clients that
pass environment variables rather than arguments. A flag wins over the
variable; the variable wins over the built-in default.

**There is no self-hosted ViaFrei.** The server is a hosted service, so `--url`
is not a way to run your own — it is there for a proxy or gateway in front of
the service, and for the stub server this repository's test suite starts.
Leave it unset and the bridge goes to the hosted endpoint, which is what you
want.

## When something is wrong

One line to stderr and an exit code that says what happened. No stack traces:

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
warning, not an exit, and the bridge reconnects. It is not allowed to be dead
in silence: several failures in a row with nothing succeeding in between end
the process with the code above, so the client that started it finds out.

## What it does not do

No telemetry, no analytics, no usage counter, no update check. It writes no
file outside the OS temp directory, and it stores no credential — `--header` is
passed through to the endpoint and never persisted or logged.

It also does not follow a redirect off the origin you pointed it at. Your
headers go to that origin and nowhere else: a cross-origin redirect is refused
with one line naming both ends, so a server cannot forward your API key
somewhere you did not choose. Same-origin redirects are followed normally.

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

Yes, please — see [CONTRIBUTING.md](CONTRIBUTING.md). Issues and discussions
are open. The bridge is small and self-contained, which is exactly what makes
it a reasonable thing to send a first patch to.

## Security

Never open a public issue for a key, a token or anything that looks like one.
See [SECURITY.md](SECURITY.md) for the private reporting path.

## Licence

[Apache-2.0](LICENSE) for this code. Data obtained through the server keeps its
provider's licence — see [NOTICE](NOTICE).
