# Security policy

## Never open a public issue for a secret

If you have found an API key, a token, a password, a certificate or a private
URL — in this repository, in a published tarball, in a server response, or
anywhere else that touches ViaFrei — **do not open an issue, a discussion or a
pull request about it.** A public report is the disclosure.

If the secret is yours: **rotate it first, report it second.** A revoked key
cannot be abused while we talk about it.

## How to report

Use GitHub's private vulnerability reporting on this repository:
**Security → Report a vulnerability**
(<https://github.com/mavrovde/viafrei-bridge/security/advisories/new>).

That form is private to the maintainers. It is the right channel for a
vulnerability in this bridge **and for one in the ViaFrei MCP server itself** —
the server's source is closed, so this repository is the only address you have,
and a server report is welcome here.

Please include what you did, what happened, what you expected, and how we can
reproduce it. A proof of concept helps; a working exploit against a live system
is not required and we would rather you did not run one.

## What we promise

- **A first answer within two working days.** Not a fix in two days — an
  acknowledgement that a human has read it and what happens next.
- We will tell you what we found, whether we agree it is a vulnerability, and
  when it is fixed.
- We will credit you if you want to be credited, and not if you do not.
- We will not take legal action against good-faith research that follows this
  policy.

## Scope

**In scope**

- This bridge: the relay, its argument handling, its dependencies, what it
  writes to disk, and what it prints.
- The published `viafrei` npm package: anything in the tarball that should not
  be there, and anything about how it is built or signed.
- The public MCP endpoint `https://mcp.viafrei.de/mcp`: authentication,
  transport, origin handling, rate limits, injection, data exposure.

**Out of scope**

- Volumetric denial of service. Please do not load-test the public endpoint.
- Findings from automated scanners with no demonstrated impact.
- Anything requiring a compromised client machine or a malicious MCP client the
  user installed themselves.
- Social engineering.

## Please do not

Access, modify or exfiltrate data that is not yours; degrade the service for
other people; or hold a finding for a deadline. Read only what you need to
demonstrate the problem, and stop there.

## A note on the data

ViaFrei relays German open data. Some of it carries purpose limitations — MTS-K
fuel prices are consumer information only — so a report about data being
redistributed where it should not be is a **licence** report, and it is welcome
through the same private channel.
