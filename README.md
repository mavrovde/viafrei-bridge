# viafrei

A stdio↔Streamable-HTTP bridge for the **ViaFrei MCP server** — German road,
parking, charging, rail and fuel data, answered by your AI assistant.

```
npx viafrei
```

> **Status: the bridge is not published yet.** This repository currently holds
> the licence, the security policy and the contribution rules. The code and the
> npm package land next. `npx viafrei` will not do anything useful until then,
> and this line will be the first thing to change when it does.

## What this is

ViaFrei is a Germany-wide transport intelligence layer whose interface is the
assistant rather than an app: open data → PostgreSQL/PostGIS → **MCP tools over
Streamable HTTP** at `https://mcp.viafrei.de/mcp`.

Most MCP clients speak Streamable HTTP and should connect to that URL directly —
**they do not need this package.** Some clients still speak only stdio. This
bridge is for those: it runs locally, exposes a stdio MCP server, and relays
every request to the public endpoint.

So the bridge is a transport shim. It holds no data, no database and no
credentials, and it makes no decision about an answer.

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

The MCP server is offered as a **hosted service**, and its source is closed. The
schema, the ingest workers, the provider connectors and the query layer are not
in this repository and are not published. What is public is the part that is
meant to be: the tool names, their descriptions, their input schemas, the shape
of the results and the attribution lines — everything a client reads from
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
