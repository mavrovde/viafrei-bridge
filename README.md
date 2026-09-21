# viafrei

**German road, rail, parking, charging and fuel data — live, inside your AI
assistant.**

```
npx viafrei
```

## Ask your assistant things like

**Welche Züge fahren als Nächstes ab Hamburg Hbf?**

```
Abfahrten ab Hamburg Hbf (nächste 60 Minuten):
09:45 ICE 519 → München Hbf, Gleis 14, +3 min (ca. 09:48)
09:51 IC 306 → Stockholm Central, Gleis 12, pünktlich
09:51 ICE 707 → Berlin Hbf, Gleis 8A-F, +1 min (ca. 09:52)
… seven more

Stand 09:43 · Quelle: Fahrplandaten: Deutsche Bahn AG, DB API Marketplace,
CC BY 4.0, bearbeitet (…) · Bahnhofsdaten: Deutsche Bahn AG,
DB API Marketplace, CC BY 4.0, bearbeitet (…)
```

Every answer ends with a line like that last one. It is the licence talking,
and it is meant to be shown to whoever reads the answer — see
[Using the data you get back](#using-the-data-you-get-back). **Reproduce the
line the server sends you, not this one:** it has been shortened here, and the
real one names each source's URL, which the licence requires you to keep.

No account, no API key, no sign-up — ask and the answer comes back.

**ViaFrei is in its stabilisation and testing phase.** It is live, it is free,
and it is being hardened in the open. Some sources are thinner than they will
be, and a tool may occasionally answer slowly or not at all. When that happens
we would rather hear it than not: [open an issue](../../issues) and say what
you asked and what came back.

Plain German or plain English, whichever you speak — the answers come back in
the language you asked in, not translated from one house language:

- *Gibt es gerade Stau auf der A8?*
- *Find a rest area with lorry parking on the A9*
- *Sind auf der A8 Baustellen geplant, wenn ich nächste Woche fahre?*
- *Wo kann ich in Leipzig mit Typ 2 laden?*
- *Gibt es eine Unwetterwarnung für Freiburg?*
- *Brauche ich in Deutschland eine Umweltplakette?*
- *Tell me when the A8 reopens* — the server can watch a situation and tell
  your assistant when it changes, so you need not keep asking. The watch lives
  in the conversation that opened it: it reaches no inbox and no phone, and
  it ends with the session. Three hours by default; 24 is the longest one can
  be asked to run

Thirteen tools at the time of writing, and no list of them on this page. A
pasted catalogue goes stale the first time a description changes on the server,
and this page is frozen inside a published tarball — it cannot be corrected
without a release. So there is one source of truth and it is the running
server: connect any MCP client and call `tools/list` for the catalogue as it
is today. (<https://viafrei.de> is the live national traffic digest, not a
catalogue.)

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
viafrei: cannot reach https://mcp.viafrei.de/mcp: DNS lookup failed (EAI_AGAIN) - check your network connection; --url only if you relay through a proxy
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
answer.** The full register lives at the resource `viafrei://attribution`, and
**[SOURCES.md](SOURCES.md)** is the readable version of it: every publisher,
what they cover, the licence, and the exact attribution line to reproduce.

Two constraints matter more than the rest, because getting them wrong is a
licence breach rather than a style problem:

- **MTS-K fuel prices are consumer information only.** No redistribution in any
  form — that includes aggregates, comparisons, price tables and anything
  derived. Answer the person who asked; do not build a product out of it.
- **DELFI public-transport data is CC BY-SA 4.0.** Share-alike travels with
  anything derived from it, and it must not be blended into a result under a
  different licence.

Everything else — where each answer comes from, and what each licence asks of
you — is in [SOURCES.md](SOURCES.md). See also [NOTICE](NOTICE) and
[LICENSE](LICENSE).

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
