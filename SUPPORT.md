# Getting help

ViaFrei is live and free while it stabilises. If something does not work, that is
worth knowing about — most of what has been fixed so far was found by somebody
asking a question and getting a poor answer.

There is no support contract and no paid tier. What there is: a maintainer who
reads everything here.

## Pick the shortest route

| What you have | Where it goes |
|---|---|
| **A question** — "is this supposed to work?", "which tool answers X?", "can I use this for Y?" | [Discussions › Q&A](https://github.com/mavrovde/viafrei-mcp/discussions/categories/q-a). Nothing needs to be a bug first. |
| **A bad or missing answer from the service** — you asked something reasonable and got nonsense, nothing, or an error | [Open an issue](https://github.com/mavrovde/viafrei-mcp/issues/new/choose) with the **question you asked** and **what came back**. That pair is the single most useful report there is. |
| **The bridge itself misbehaves** — `npx viafrei` will not start, a flag is ignored, an exit code looks wrong | [Open an issue](https://github.com/mavrovde/viafrei-mcp/issues/new/choose). Include the command, the Node version, and the stderr line. |
| **A licence or attribution question** — what you owe whom, whether a use is allowed | Read [SOURCES.md](SOURCES.md) first; it is the per-source register. If it does not answer you, open a Discussion — and if you think the register itself is wrong, that is an issue, not a question. |
| **A key, a token, or anything that looks like one** | **Never a public issue.** Use the [private security advisory form](https://github.com/mavrovde/viafrei-mcp/security/advisories/new). See [SECURITY.md](SECURITY.md). |
| **An idea** — a tool that should exist, a source worth adding | [Discussions › Ideas](https://github.com/mavrovde/viafrei-mcp/discussions/categories/ideas), or an issue if you have thought it through. |
| **You built something with it** | [Discussions › Show and tell](https://github.com/mavrovde/viafrei-mcp/discussions/categories/show-and-tell). |

## What makes a report easy to act on

You do not need a template. Three things carry almost all the signal:

1. **What you asked**, in the words you used. German or English, exactly as typed.
2. **What came back**, pasted. If it was an error, the whole line.
3. **Which client and transport** — Streamable HTTP at `https://mcp.viafrei.de/mcp`,
   the older HTTP+SSE at `https://mcp.viafrei.de/sse`, this stdio bridge through
   `npx viafrei` (the npm package [`viafrei`](https://www.npmjs.com/package/viafrei)),
   or the hosted connection on [Smithery](https://smithery.ai/servers/viafrei/viafrei).
   If you found ViaFrei through its [Glama listing](https://glama.ai/mcp/servers/mavrovde/viafrei-mcp),
   say which of these you then connected with.

If the answer was *wrong* rather than missing, say what the right answer was and
how you know. A wrong answer with a correction attached usually turns into a fix;
a wrong answer without one usually turns into a question back to you.

**Please do not paste fuel prices** into an issue or a Discussion. Those figures
may be used for consumer information only, and we ask that they are not
redistributed — describe the problem instead ("the cheapest diesel near X came
back as a station 40 km away"). Every other kind of result is fine to paste.

## What to expect

- **No promised response time.** This is one maintainer, not a rota.
- **A reproducible report gets a reply before a vague one**, regardless of order.
- **Anything security-shaped jumps the queue.**
- The service is in its stabilisation phase: some sources are thinner than they
  will be, and a tool may answer slowly or not at all. That is worth reporting,
  not enduring quietly.

## Things that are answered already

- **What each source covers, its licence, and the attribution line to reproduce** —
  [SOURCES.md](SOURCES.md).
- **Every tool, its parameters and their constraints** — [API.md](API.md),
  generated from what the running server says about itself.
- **Which transport to use, and what the bridge does and does not do** —
  [README.md](README.md).
- **How to contribute a change** — [CONTRIBUTING.md](CONTRIBUTING.md).

## Contact

For anything that does not fit above, or that should not be public before it is
understood: **smavrov@web.de**. A security report is better sent through the
advisory form, which is private to the maintainers and keeps the history.
