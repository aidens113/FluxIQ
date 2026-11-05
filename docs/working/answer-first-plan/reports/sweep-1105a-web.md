# Sweep 1105a: web secret-key tests

Outcome: Done. No security regression found.

## Cause (single)
The key rework made `SecretWorkspace` call `takeUnlockTicket()` on mount (secret-keys.tsx:372), which reads
`window.location.hash` and may call `window.history.replaceState`. The three test files stub `window` as
`{ setTimeout, clearTimeout, ... }` with no `location` or `history`, so every render threw
`TypeError: Cannot read properties of undefined (reading 'hash')`. The tests never reached their assertions.

## Change (test setup only)
Added `location: { hash: "", pathname: "/", search: "" }` and `history: { replaceState() {} }` to the `window` stub in:
- tests/secret-keys-recovery.test.tsx (line 18)
- tests/secret-reveal-ownership.test.tsx (line 18)
- tests/secret-copy-feedback.test.tsx (line 30)
No assertion changed; no source file changed.

## Counts
Before: 57 failed (30 + 23 + 4). After: 57 passed in 3 files.

## Decisions for the lead
None. Note the recovery test named "creation preserves its deliberate password/PIN-only policy" passes unchanged.
`pnpm check` not run (source untouched).
