<!-- CONTRIBUTING.md is short and worth the two minutes, especially the two
     sections below. Delete anything here that does not apply. -->

## What this changes, and why

## Checklist

- [ ] `npm run build` and `npm test` pass.
- [ ] `npm run test:gate` and `npm run test:leaks` pass — the public-repository
      gates. If either needed a new entry in `scripts/rules.json`, the PR says
      which and why.
- [ ] **No test contacts the public endpoint or any provider.** Tests start their
      own stub server. This is not a style rule: a live call from CI risks the
      access itself.
- [ ] **No key, token, internal hostname, port or path** in the diff, in an
      example, or in a test fixture.
- [ ] `CHANGELOG.md` has an entry under the version being cut, in the existing
      voice: what changed and what it means for somebody who installed the last
      version.
- [ ] If this changes a flag, an environment variable, an exit code or a message,
      `README.md` and `helpText` say the same thing as the code.
- [ ] If this touches what a licence requires — an attribution line, a purpose
      note, a share-alike flag — `SOURCES.md` still matches.

## Evidence

<!-- Paste what you ran and what it said. A claim that tests pass is not the same
     as their output, and a reviewer should not have to re-run them to believe
     you. If you mutated the code to prove a new test actually fails without the
     fix, say so — it is the most convincing line you can write here. -->
