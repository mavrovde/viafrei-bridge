# viafrei

[![npm](https://img.shields.io/npm/v/viafrei?color=cb3837&label=npm&logo=npm)](https://www.npmjs.com/package/viafrei)
[![node](https://img.shields.io/node/v/viafrei?logo=node.js&logoColor=white)](https://nodejs.org)
[![licence](https://img.shields.io/npm/l/viafrei?color=blue)](LICENSE)
[![no API key](https://img.shields.io/badge/API%20key-none-brightgreen)](#connect-in-one-line)
[![MCP](https://img.shields.io/badge/MCP-Streamable%20HTTP-6f42c1)](https://modelcontextprotocol.io)

**Live German traffic, rail, parking, charging, fuel, addresses and weather —
inside your AI assistant.** Ask in plain German or plain English and the answer
comes back from official open data, with the attribution the licence requires.

```
npx viafrei
```

**No account, no API key, no sign-up.**

## Ask your assistant things like

**Welche Züge fahren als Nächstes ab Hamburg Hbf?**

```
Abfahrten ab Hamburg Hbf (nächste 60 Minuten):
12:28 RJ 384 → Koebenhavn H, Gleis 5, pünktlich
12:29 ICE 7 → Karlsruhe Hbf, Gleis 14, pünktlich
12:33 ICE 774 → Kiel Hbf, Gleis 11, pünktlich
12:33 ME RB31 → Lüneburg, Gleis 13A-C, pünktlich
12:34 ICE 601 → München Hbf, Gleis 8A-F, pünktlich

Stand 12:23 · Quelle: Fahrplandaten: Deutsche Bahn AG, DB API Marketplace,
CC BY 4.0, bearbeitet (…) · Bahnhofsdaten: Deutsche Bahn AG,
DB API Marketplace, CC BY 4.0, bearbeitet (…)
```

That is a real answer, not a mock-up: it came back from
`https://mcp.viafrei.de/mcp` on 2026-09-27 at 12:23 Berlin time. **Two edits, both
named:** the two source URIs are shortened to `…` for the reason in the next
paragraph, and only the first five of the ten departures it returned are shown.
The server sends no "… and five more" line — the truncation is this page's, not
its.

Every answer ends with a line like that last one. It is the licence talking,
and it is meant to be shown to whoever reads the answer — see
[Using the data you get back](#using-the-data-you-get-back). **Reproduce the
line the server sends you, not this one:** it has been shortened here, and the
real one names each source's URL, which the licence requires you to keep.

ViaFrei is in its stabilisation and testing phase at the time of writing: live
and free, with some sources thinner than they will be, and the occasional tool
that answers slowly or not at all. **Tell us when that happens** —
[open an issue](https://github.com/mavrovde/viafrei-bridge/issues) with what you
asked and what came back. The server necessarily sees the question, and sees
it fail; what it cannot see is that an answer was useless to you
(see [What it does not do](#what-it-does-not-do)).

Plain German or plain English, whichever you speak — the answers come back in
the language you asked in, not translated from one house language:

- *Gibt es gerade Stau auf der A8?*
- *Find a rest area with lorry parking on the A9*
- *Sind auf der A8 Baustellen geplant, wenn ich nächste Woche fahre?*
- *Wo kann ich in Leipzig mit Typ 2 laden?*
- *Gibt es eine Unwetterwarnung für Freiburg?*
- *Brauche ich in Deutschland eine Umweltplakette?*
- *Funktioniert der Aufzug am Bahnhof Köln Messe/Deutz?* — lift and escalator
  status, which is the difference between a station being usable and not
- *Wo ist die nächste Apotheke zum Leipziger Hauptbahnhof?*
- *What is at 52.5163, 13.3777?* — and the other direction: a street address to
  coordinates
- *Tell me when the A8 reopens* — the server can watch a situation and tell
  your assistant when it changes, so you need not keep asking. The watch lives
  in the conversation that opened it: it reaches no inbox and no phone, and
  it ends with the session. Three hours by default; 24 is the longest one can
  be asked to run

## What it covers

**Eighteen tools** as of this release. Grouped by the question they answer,
because the grouping is stable and a pasted catalogue is not:

| | |
|---|---|
| **Roads** | live incidents, jams and closures; roadworks ahead on a route; the state of one Autobahn end to end; **lorry** parking on the motorways, with occupancy wherever the operator publishes it — see the note below on car parks |
| **Rail** | next departures from any station with real-time delays and platforms; how punctual public transport is across a region right now (region-wide — never one line, trip or stop); whether a station's lifts and escalators are working right now |
| **Energy** | charging points by connector type and power; the cheapest fuel near a place |
| **Places** | a street address to coordinates and back; points of interest; what is at a coordinate, and what is near it — nationwide, all sixteen Länder (measured on 2026-09-27 — [how](SOURCES.md)) |
| **Weather** | official DWD severe-weather warnings for a place |
| **Watches** | ask once and be told when a situation changes, instead of asking again |

**One thing the parking row does not yet cover: car parks.** The licence for
station car parks is read and the loader exists, but nothing on the public service
answers with one today — asked for a `car_park` in Köln, Hamburg and Leipzig on
2026-09-27, every facility that came back was a lorry park or an unclassified site,
and none carried occupancy. So what you get from `find_parking` today is motorway
lorry parking. The table said "car and lorry parking" until this release; it was
the same over-claim the Rail row carried about disruptions, and it is corrected here rather
than left for a user to discover.

**No tool names, descriptions or schemas are pasted on this page, on purpose.**
This file is frozen inside a published tarball and cannot be corrected without a
release, so a copied catalogue would start rotting the first time a description
changes on the server. There is one source of truth and it is the running
server: connect any MCP client and call `tools/list`.
(<https://viafrei.de> is the live national traffic digest, not a catalogue.)

## Connect in one line

The product is a **hosted MCP server**. There is nothing to deploy, no key to
request and no quota to negotiate — point a client at it and the tools appear.

**Streamable HTTP — the address to use.** Most clients speak this, and they need
none of the rest of this page:

```
https://mcp.viafrei.de/mcp
```

```bash
claude mcp add --transport http viafrei https://mcp.viafrei.de/mcp
```

**HTTP+SSE — if your client only speaks the older transport**, it is answered too,
so nobody meets a locked door. It is deprecated in the specification; prefer the
address above:

```bash
claude mcp add --transport sse viafrei https://mcp.viafrei.de/sse
```

**stdio — this package.** Some clients still speak only stdio, and **this bridge
is for those, and only those.** Node 22 or newer; nothing to install, because
`npx` fetches it when your client starts it. The same three lines fit any client
that takes an stdio MCP server, including the `.mcp.json` an IDE reads and
Claude Desktop's `claude_desktop_config.json`:

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

Restart the client and ask it one of the questions above.

## Why build on it

- **One endpoint instead of a stack of integrations.**
  [SOURCES.md](SOURCES.md) lists **twenty-one sources from sixteen publishers** —
  Autobahn GmbH, the national access point, Deutsche Bahn, DWD, BKG, GeoNames,
  OpenStreetMap, MTS-K and the rest — each with its own format, its own release
  rhythm and its own licence. They arrive here as one protocol and one set of
  tools. (Count them in that table; one of the sixteen is us.)
- **The licence work is done and it travels with the answer.** Every result
  carries the attribution line its sources require, and the ones with conditions
  attached say so in the result itself — share-alike is flagged, and the MTS-K
  purpose limit arrives as a sentence you are meant to show. You are not left to
  work out what you owe whom.
- **It answers in the language of the question**, German or English, rather than
  translating out of one house language.
- **It is a transport shim and nothing more.** The bridge holds no data and no
  credentials, writes no file outside the OS temp directory, and makes no
  decision about any answer. No telemetry, no analytics, no usage counter, no
  update check — see [What it does not do](#what-it-does-not-do).
- **Failures are machine-readable.** One line on stderr and a distinct exit code
  per cause, so a supervisor can tell "your network is down" from "you typed the
  flag wrong" without parsing English.
- **Ask once, be told when it changes.** A watch turns polling into a
  notification for as long as the conversation lives.

Free while ViaFrei stabilises, and the limits that exist are written down on this
page rather than discovered in production.

## Configuration

| option | what it does |
|---|---|
| `--url <url>` | endpoint to relay to. Default `https://mcp.viafrei.de/mcp` — see the note below |
| `--header "Name: value"` | extra HTTP header on every request, repeatable. For an API key, when there is one |
| `--timeout <ms>` | per-request timeout, default 30000. The event stream is never timed out |
| `--version`, `--help` | print and exit |

Many MCP clients can only pass an `env` block, not arguments, so every option
has an environment variable too:

| variable | same as |
|---|---|
| `VIAFREI_MCP_URL` | `--url` |
| `VIAFREI_MCP_HEADER` | `--header`. Several headers are separated by a **newline**, which can never appear in a header name or value, so nothing you might need to send is unrepresentable — a comma, a semicolon and a space all occur inside real header values |
| `VIAFREI_MCP_TIMEOUT_MS` | `--timeout` |

A flag wins over the variable; the variable wins over the built-in default. A
`--header` of the same name replaces one from the variable, and a `--header` of
a different name is added alongside it.

```json
{
  "mcpServers": {
    "viafrei": {
      "command": "npx",
      "args": ["-y", "viafrei"],
      "env": { "VIAFREI_MCP_HEADER": "Authorization: Bearer …" }
    }
  }
}
```

**There is no self-hosted ViaFrei.** The server is a hosted service, so `--url`
is not a way to run your own — it is there for a proxy or gateway in front of
the service, and for the stub server this repository's test suite starts.
Leave it unset and the bridge goes to the hosted endpoint, which is what you
want.

## When something is wrong

One line to stderr and an exit code that says what happened. No stack traces:

```
viafrei: cannot reach https://example.invalid/mcp: host not found (DNS) (ENOTFOUND) - check your network connection; --url only if you relay through a proxy
```

That line is copied from a run, exit code 3. The same text also goes back to the
client as a JSON-RPC error, so an assistant can say what went wrong instead of
going quiet.

| exit | meaning |
|---|---|
| `0` | clean shutdown (the client closed stdin, or sent SIGINT/SIGTERM) |
| `1` | something else went wrong; the line says what |
| `2` | bad usage — a flag or a value the bridge does not accept |
| `3` | the endpoint could not be reached, stopped answering, or never answered in time |
| `4` | the endpoint answered and this cannot continue: it refused (the line names the HTTP status), it forgot the session, it answered with something that is not MCP, or it redirected to another origin |
| `5` | protocol version mismatch; the line names the version the server speaks |

**A slow call may be a retried call.** A `429`, `502`, `503` or `504` is tried
again **once** — after the delay the server asked for in `Retry-After`, or 250 ms
when it asked for none. A connection that fails outright rather than answering
(reset, broken pipe, socket or connect timeout) is likewise tried once more, after
the fixed 250 ms; there is no header to read on that path. Two cases are
deliberately not retried, because waiting would be worse than answering: a `429`
carrying no usable `Retry-After`, and any delay the server asks for that is longer
than your timeout. Both come straight back as the ordinary failure line with the
status in it. An event stream is never retried.

**Your timeout bounds each request, not the call.** It is attached per HTTP
request, so the second attempt gets a fresh one, and so does each hop of a
same-origin redirect. What you can rely on is per request: no single request
outlives the timeout, and a delay longer than the timeout is never waited out at
all. What follows from that is the arithmetic: two attempts plus a delay that may
itself be as long as the timeout is a worst case of about **three times** what you
set, and more than that if the endpoint redirects, since every hop is bounded
separately. **So no setting here caps the whole call** — if you need a hard
ceiling, enforce it on your side and treat the timeout as the per-request bound it
is.

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

Yes, please — see [CONTRIBUTING.md](CONTRIBUTING.md) and
[CODE_OF_CONDUCT.md](CODE_OF_CONDUCT.md). Issues and discussions are open. The
bridge is small and self-contained, which is exactly what makes it a reasonable
thing to send a first patch to.

**One issue template is worth knowing about before you need it:** *the answer was
wrong or useless*. A tool that fails is something the server sees; a tool that
answers confidently with the wrong thing is not. That report is the one thing we
cannot get any other way.

## Security

Never open a public issue for a key, a token or anything that looks like one.
See [SECURITY.md](SECURITY.md) for the private reporting path.

## Licence

[Apache-2.0](LICENSE) for this code. Data obtained through the server keeps its
provider's licence — see [NOTICE](NOTICE).
