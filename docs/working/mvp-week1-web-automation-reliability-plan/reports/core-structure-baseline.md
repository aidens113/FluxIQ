# Report: core-structure-baseline

Worker: `core-structure-baseline`, FluxIQ Core, 2026-09-11.

## Outcome

Done. `--update` now only lowers or removes existing entries. When a ratcheted
violation has no entry, or has grown past its entry, it writes nothing, names
each such violation, and exits 1. A `--rule` update leaves every other rule's
entries alone. `pnpm structure:test` and `pnpm structure:check` pass. The
scratch-copy demonstrations below show the defect under the HEAD scripts and
the fix under the new ones.

One integration step is outside my ownership: the new tests are not in
`pnpm structure:test`'s glob yet (see Open questions, item 1).

## What changed and why

- `scripts/structure-audit/baseline.mjs`
  - `buildBaseline` is replaced by `planBaselineUpdate(findings, previous,
    limits, scope = null)`, which returns `{ baseline, blocked, lowered,
    removed }`.
    - `blocked`: every ratcheted fail finding that lowering cannot record.
      `recorded` is `undefined` for a new violation. For one that grew,
      `recorded` is the entry's value. The message says why.
    - An entry is set to `min(recorded, current)`, so it is never raised and
      never added.
    - An entry whose violation is gone is removed.
  - `scope` is the list of rule ids that ran. Only those rules' entries are
    re-evaluated; every other rule's entries are carried over unchanged.
    - `null` means a full update, which re-evaluates every rule in the
      previous baseline.
    - A rule id that no rule reports any more therefore loses its entries on a
      full update.
  - A private `canonical()` helper keeps the old ordering: rules by id, entries
    by value descending, then key. The `comment` string is unchanged, so an
    unchanged baseline serialises to identical bytes.
  - `saveBaseline` now returns `true` when it writes. It returns `false`
    without touching the file when the file already holds that content,
    ignoring CRLF/LF differences.
  - `loadBaseline` and `applyRatchet` are unchanged.
- `scripts/structure-audit.mjs`
  - `--update` calls `planBaselineUpdate` with `scope` set to the selected
    rule ids under `--rule`, and `null` otherwise.
  - If anything is blocked, it prints `  FAIL  [rule] message` for each
    blocked finding, then a refusal line naming `.structure-baseline.json` as
    not written, and exits 1. Rule `update()` hooks (the working-docs index
    regeneration) do not run in that case.
  - On success it prints each `lowered` and `removed` entry and a summary line.
  - The usage header is updated. `byRule` moved above the update branch so the
    update branch can use it.
- `scripts/structure-audit/tests/baseline.test.mjs` (new, 10 tests): lower and
  remove; new violation blocks; grown violation blocks without raising;
  rule-scoped update keeps other rules; full update drops a retired rule id;
  warnings and unratcheted failures are ignored; the maximum of several
  findings under one key is used; canonical ordering; round trip through
  `applyRatchet` suppresses everything recorded; `saveBaseline` no-op under
  CRLF.

### Decisions beyond the brief's letter

1. **A grown entry also blocks `--update`.** The brief names only a violation
   with no entry. Lowering cannot record growth either, and `AGENTS.md` says
   entries "may shrink but never grow". For consistency, both cases write
   nothing.
2. **A full update removes entries under rule ids no rule reports any more**
   (a retired or renamed rule). A rule-scoped update never touches a rule
   outside its scope.
3. **Several ratcheted findings under one key:** the entry must cover the
   highest one, because `applyRatchet` compares each finding separately.
4. **Test placement:** `scripts/structure-audit/tests/`, not
   `scripts/structure-audit/rules/tests/`. See Open questions, item 2.

## Commands run and observed results

Real tree, before any edit:

- `pnpm structure:test` printed `# tests 38`, `# pass 38`, `# fail 0` (exit 0).
- `pnpm structure:check` printed
  `structure-audit: passed (117 warning(s), 256 baselined).` (exit 0). No
  lowerable-entries line was printed.
- `sha256sum .structure-baseline.json` printed `fc4cdbcfb062a540423ba8ff6a37d110bb9b319537da3e8519bab2f2f48ba59a`.

Real tree, after the edits:

- `node --test "scripts/structure-audit/tests/*.test.mjs"` passed all 10 tests
  (`# pass 10`, `# fail 0`, exit 0).
- `pnpm structure:test` printed `# tests 38`, `# pass 38`, `# fail 0` (exit 0).
- `pnpm structure:check` printed
  `structure-audit: passed (117 warning(s), 256 baselined).` (exit 0).
- `node --test "scripts/structure-audit/rules/tests/*.test.mjs" "scripts/structure-audit/tests/*.test.mjs"`
  printed `# tests 48`, `# pass 48`, `# fail 0` (exit 0).
- `sha256sum .structure-baseline.json` printed the same hash, `fc4cdbcf…a59a`.
  `--update` was never run in the real tree.
- `git status --short` showed only `M scripts/structure-audit.mjs`,
  `M scripts/structure-audit/baseline.mjs`, `?? scripts/structure-audit/tests/`,
  and the supervisor's untracked working document.

### Scratch-copy demonstrations

**Setup**

- Clone: `git clone --depth 1 -c core.autocrlf=false file:///F:/!FluxIQ core-sb`
  into the session scratchpad, at `e522f17`.
- TypeScript 5.9.3 was copied, with symlinks dereferenced, into the clone's
  `node_modules`.
- Script: `<scratchpad>/core-sb-demo.sh`. Full log: `<scratchpad>/core-sb-demo.log`.
  The scratchpad is
  `C:\Users\mrjoh\AppData\Local\Temp\claude\f---FluxIQWebExtension\2677150e-fabf-4de7-a29b-ed7919f99ef7\scratchpad`.

**How the script works**

- Every change inside the clone is backed up and restored with `cp`. A planted
  file is staged with `git add` in the clone only, so that `git ls-files`
  lists it.
- The real tree is only read.
- Warning lines are filtered out of the quoted output.

**Before: HEAD scripts reproduce both defects**

```text
=== 1. BEFORE (HEAD scripts): a planted new violation is grandfathered by --update
$ node scripts/structure-audit.mjs --update
structure-audit: baseline written with 257 entries across 7 rules.
exit=0
cmp: .structure-baseline.json CHANGED (fc4cdbcfb062a540 -> efd17cfaad3ecb9a)
file-lines entry now recorded for the planted file: 900
$ node scripts/structure-audit.mjs
structure-audit: passed (117 warning(s), 257 baselined).

=== 2. BEFORE (HEAD scripts): a rule-scoped --update drops every other rule's entries
$ node scripts/structure-audit.mjs --update --rule file-lines
structure-audit: baseline written with 4 entries across 1 rules.
  file-lines          4 entries  digest a0a4ffc3cf88
```

**After: the changed scripts, with the new test staged in the clone**

The audit also covers the new test file here.

```text
$ node scripts/structure-audit.mjs
structure-audit: passed (117 warning(s), 256 baselined).
exit=0

=== 3. AFTER: a planted new violation makes --update fail and leaves the baseline byte-identical
$ node scripts/structure-audit.mjs --update
  FAIL  [file-lines] scripts/planted-violation.mjs: 900 lines exceeds the 800-line limit. Split it by diagnosing why it grew. It has no baseline entry, and --update never adds one.

structure-audit: --update refused: 1 violation(s) cannot be recorded by lowering the baseline. Fix them, then run it again. .structure-baseline.json was not written.
exit=1
cmp: .structure-baseline.json byte-identical to the original (fc4cdbcfb062a540)
README sha before cfa11c1feb7434f7 after cfa11c1feb7434f7 (rule update hooks did not run)

=== 4. AFTER: an entry that grew makes --update fail and leaves the baseline byte-identical
  FAIL  [file-lines] apps/web/e2e/automation-studio-render-loop.spec.ts: 972 lines exceeds the 800-line limit. Split it by diagnosing why it grew. Baseline for this entry is 962; --update never raises an entry.
exit=1
cmp: .structure-baseline.json byte-identical to the original (fc4cdbcfb062a540)

=== 5. AFTER: both at once under --rule file-lines: each is named, nothing written
structure-audit: --update refused: 2 violation(s) cannot be recorded by lowering the baseline. [...]
exit=1
cmp: .structure-baseline.json byte-identical to the original (fc4cdbcfb062a540)

=== 6. AFTER: a rule-scoped --update lowers its own entry and keeps every other rule
$ node scripts/structure-audit.mjs --update --rule file-lines
  lowered [file-lines] packages/fluxiq/src/programs/automation-studio/runtime/tests/service-flow-bootstrap-generation.test.ts: 1004 -> 954
structure-audit: baseline written: 256 entries across 7 rules (1 lowered, 0 removed). Re-evaluated file-lines only; other rules' entries kept.
exit=0
$ diff before after        (per-rule entry count and digest)
4c4
<   file-lines          4 entries  digest c371ba198efd
---
>   file-lines          4 entries  digest a0a4ffc3cf88
rules other than file-lines deep-equal and identically ordered: true
$ node scripts/structure-audit.mjs
structure-audit: passed (117 warning(s), 256 baselined).

=== 7. AFTER: a new violation outside the selected rule does not block a scoped update of another rule
$ node scripts/structure-audit.mjs --update --rule naming
structure-audit: baseline already current, not rewritten: 256 entries across 7 rules (0 lowered, 0 removed). Re-evaluated naming only; other rules' entries kept.
exit=0
cmp: .structure-baseline.json byte-identical to the original (fc4cdbcfb062a540)

=== 8. AFTER: a full --update on a clean tree writes nothing
structure-audit: baseline already current, not rewritten: 256 entries across 7 rules (0 lowered, 0 removed).
exit=0
cmp: .structure-baseline.json byte-identical to the original (fc4cdbcfb062a540)
```

The other six rules (class-methods 1, directory-files 2, exported-values 57,
imports 153, naming 23, working-docs 16) kept their digests across step 6. The
clone was restored at the end, and its baseline is byte-identical to the
original.

## Not verified

- I did not run the full `pnpm check`, `pnpm test`, or `pnpm build`. The brief's
  definition of done names `structure:test` and `structure:check`, and two
  other workers are editing `packages/` and `apps/`.
- `pnpm structure:check` in the real tree does not audit the new test file,
  because it is untracked and the audit reads `git ls-files`. It was audited
  in the scratch clone with the file staged, and that run passed.
- The new tests are not run by `pnpm structure:test` or `pnpm check` until the
  glob changes (Open questions, item 1).
- I did not check `docs/architecture/code-structure.md` for a description of
  `--update`. The `AGENTS.md` wording ("may shrink but never grow … a new
  violation fails outright. Run `pnpm structure:baseline` after removing
  one") is now accurate as written.
- `--update --json` was not exercised. `--update` still ignores `--json`, as
  before.
- I made no downstream change and did not check the mirror.

## Open questions or contradictions found

1. **`package.json` glob (supervisor-owned).** `structure:test` runs only
   `scripts/structure-audit/rules/tests/*.test.mjs`. This command ran all 48
   tests, 48 passed:
   `node --test "scripts/structure-audit/rules/tests/*.test.mjs" "scripts/structure-audit/tests/*.test.mjs"`.
   Suggested script value:
   `"structure:test": "node --test \"scripts/structure-audit/rules/tests/*.test.mjs\" \"scripts/structure-audit/tests/*.test.mjs\""`.
2. **Test placement contradiction.** The brief says "Tests beside the audit's
   existing tests", which are in `rules/tests/` and cover the rules. Core's
   binding rule puts a test of `scripts/structure-audit/baseline.mjs` in
   `scripts/structure-audit/tests/`. I followed the rule.
3. **Growth now blocks `--update`** (decision 1). Confirm that this is wanted.
4. **Downstream mirror.** The downstream `scripts/structure-audit.mjs` and
   `scripts/structure-audit/baseline.mjs` are mirrored from Core. The
   follow-through should copy both, add `scripts/structure-audit/tests/baseline.test.mjs`,
   and widen the downstream `structure:test` glob the same way.
   - The `--update` success output changed: the `lowered`/`removed` lines and
     the summary wording are new. Any tooling that parses
     `baseline written with N entries` needs updating; I know of none.
