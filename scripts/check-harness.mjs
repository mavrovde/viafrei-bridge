/**
 * The pass/fail counter every self-test here prints its cases through.
 *
 * WHY THIS IS A MODULE. Two self-tests carried the same sixteen lines — the counters
 * and the `check()` helper — byte for byte, and this repository has already failed a
 * pull request on SonarCloud's duplication limit for eleven. The remedy was
 * `fixture-root.mjs` then and `mcp-stub.mjs` later; this is the third instance of the
 * same move. No count of callers is written here: the first such sentence went stale
 * unnoticed.
 *
 * `passed` is a function because the number moves after this object is created.
 */
export function createChecker() {
    let passed = 0;
    const failures = [];
    function check(label, ok, detail = '') {
        if (ok) {
            passed += 1;
            console.log(`  PASS  ${label}`);
            return;
        }
        failures.push(`${label}${detail ? ` — ${detail}` : ''}`);
        console.log(`  FAIL  ${label}${detail ? ` — ${detail}` : ''}`);
    }
    return { check, failures, passed: () => passed };
}
