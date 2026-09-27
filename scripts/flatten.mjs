/**
 * Collapse a newline, and the whitespace around it, into ONE space.
 *
 * ITS OWN MODULE so the generator and its self-test can both import it. The first
 * attempt at sharing it exported the function from the generator and guarded
 * `main()` behind `import.meta.url === pathToFileURL(process.argv[1]).href`. That
 * guard is wrong on macOS: the temp directory is reached through a symlink, so the
 * two URLs differ, the guard is false and the generator silently does nothing and
 * exits 0. Every refusal case in the self-test went green for that reason. A module
 * needs no guard.
 *
 * NO REGULAR EXPRESSION, after three attempts at one. Splitting on the newline,
 * trimming each piece and dropping the empty ones is linear and cannot backtrack,
 * because there is nothing to backtrack. The attempts are recorded because each was
 * wrong in a way the one before it was meant to fix:
 *
 *  1. `\s*\n\s*` — `\s` matches a newline, so it is ambiguous about which newline the
 *     middle atom took. SonarCloud reported it (`javascript:S8786`).
 *  2. `[ \t]*\n[ \t\n]*` — unambiguous, and NOT EQUIVALENT: it leaves any other
 *     whitespace beside the newline in place, so `\r\n` flattens to `"a\r b"` where
 *     form 1 gives `"a b"`. Invisible to every check in this repository, because the
 *     snapshot contains no CRLF and API.md stayed byte-identical.
 *  3. `[^\S\n]*\n\s*` — equivalent and unambiguous, and STILL reported, for the reason
 *     the earlier reasoning missed: a leading `*` before a mandatory atom is quadratic
 *     on input that never satisfies the atom. Correct output, wrong complexity.
 *
 * Equivalence with form 1 is measured over a whitespace-heavy corpus in
 * `scripts/gen-api-doc.test.mjs`, which imports THIS function.
 */
export function flatten(value) {
    return String(value)
        .split('\n')
        .map(segment => segment.trim())
        .filter(segment => segment !== '')
        .join(' ');
}
