# structure-audit rules: `test-placement` and `naming`

Worker report. Files written: `scripts/structure-audit/rules/test-placement.mjs`,
`scripts/structure-audit/rules/naming.mjs`. Nothing else was touched. `--update`
was not run, so no baseline entries exist for either rule yet and every finding
currently reports as a failure — that is the expected state.

## What each check does, and how

### `test-placement` (one rule, one check)

Walks `ctx.sourceFiles`, keeps the files `ctx.isTestFile(file)` accepts, and
takes each one's containing directory with `ctx.dirname`. A test is correctly
placed when `ctx.basename(dir)` is in `ctx.CONFIG.testRootDirNames`
(`["tests", "e2e"]`) — that is, the test sits *directly* inside a test root; a
test two levels below a `tests/` directory is still misplaced, which is the
intended reading of "directly inside". Everything else is counted into a
`Map` keyed by directory, and each map entry becomes one finding: `severity:
"fail"`, `ratchet: true`, `key`/`path` = the directory, `value` = the number of
misplaced tests in it, `limit: 0` (the only acceptable count).

### `naming` (one rule, three checks, findings concatenated)

Shared helper `stemOf(ctx, file)` strips the extension via `ctx.extname` and
then a trailing `.test`/`.spec`, so `project-schema.test.ts` → `project-schema`
and `utils.ts` → `utils`.

**(a) Path depth.** Non-test files only (tests are exempt because the placement
rule pushes them one level deeper by design). `file.split("/").length` compared
against `LIMITS.maxPathSegments` (8). `ratchet: false`, so these fail
immediately and permanently; `key` = the path, `value` = the segment count.

**(b) Banned names.** For every source file (tests included — a `utils.test.ts`
implies a `utils.ts`), the finding fires when the stem is in
`CONFIG.bannedBasenames` (`utils`, `helpers`, `misc`, `common`, `shared-ui`) or
when any directory segment of the path is in `CONFIG.bannedDirectoryNames`
(`utils`, `helpers`, `misc`, `common`). One finding per file, `key` = the path,
`value` = 1, `limit` = 0, `ratchet: true`.

**(c) Prefix groups.** Non-test files are bucketed by directory into a set of
stems. Within a directory, a stem is a candidate when it matches
`^[a-z0-9]+(-[a-z0-9]+)+$` (kebab-case, at least one hyphen) and is not `index`
or `types`; its prefix is the text before the first hyphen. The prefix `use` is
skipped (React hook naming). After the candidate groups are built, a sibling
whose whole stem equals the prefix is added to that group — this is what makes
`model/state.ts` join `state-diff.ts` and `state-store.ts` for a group of 3.
A group of `LIMITS.prefixGroup` (3) or more emits `key = "<dir>::<prefix>"`,
`value` = group size, `path` = the directory, `ratchet: true`.

## Finding counts

Measured with no baseline present, so failures == all findings.

| rule | fail | warn | suppressed |
| --- | --- | --- | --- |
| `test-placement` | 70 (one per directory) | 0 | 0 |
| `naming` | 32 | 0 | 0 |

- **`test-placement` total misplaced test files: 333**, spread over 70
  directories. Largest offenders: `packages/fluxiq/src/programs/automation-studio/storage` (35),
  `.../automation-studio/runtime` (32), `apps/web/src/features/automation-studio/testing` (16),
  `.../automation-studio/hierarchy` (15), `.../automation-studio/model` (14),
  `apps/web/src/features/programs` (14).
- **`naming` breakdown:** 4 path-depth (ratchet false), 2 banned-name, 26
  prefix-group.

### Five largest prefix groups

| size | directory | prefix |
| --- | --- | --- |
| 23 | `packages/fluxiq/src/programs/automation-studio/storage` | `project-` |
| 11 | `apps/web/src/features/automation-studio/views` | `view-` |
| 10 | `apps/web/src/features/automation-studio/recordings` | `recording-` |
| 8 | `packages/fluxiq/src/programs/automation-studio/runtime` | `llm-` |
| 7 | `apps/web/src/features/automation-studio/state` | `state-` |

## Sample messages

`test-placement`:

```
packages/fluxiq/src/programs/automation-studio/storage/: 35 test files sit beside their source. Move them into packages/fluxiq/src/programs/automation-studio/storage/tests/.
packages/fluxiq/src/programs/automation-studio/runtime/: 32 test files sit beside their source. Move them into packages/fluxiq/src/programs/automation-studio/runtime/tests/.
packages/fluxiq/src/ui/: 1 test file sits beside its source. Move it into packages/fluxiq/src/ui/tests/.
```

`naming` — one from each check:

```
apps/web/src/app/api/programs/automation-studio/state-assets/[projectId]/[sha256]/route.ts: 11 path segments exceeds the 8-segment depth limit. Move it nearer its feature root or collapse a single-child directory on the way down.
apps/web/src/features/programs/shared-ui.tsx: "shared-ui" names nothing. Name the file for the one thing it exports, or split it.
packages/fluxiq/src/programs/automation-studio/storage/: 23 files share the prefix "project-". Create storage/project/ and strip the prefix from their names.
```

Two more prefix-group messages, to show the directory suggestion is built from
the directory's own basename:

```
apps/web/src/features/automation-studio/views/: 11 files share the prefix "view-". Create views/view/ and strip the prefix from their names.
packages/fluxiq/src/programs/automation-studio/runtime/: 8 files share the prefix "llm-". Create runtime/llm/ and strip the prefix from their names.
```

## Judgement calls

1. **Group members are counted as distinct *stems*, not distinct files.** A
   `foo-bar.ts` / `foo-bar.css` pair counts once. Counting raw files would
   inflate every group that has a co-located stylesheet and would make the
   number reported to a human ("N files share the prefix") disagree with the
   number of things they would actually move. This is also what makes the
   `llm-` group come out at 8, matching the expected value.
2. **`project-` in `.../automation-studio/storage` reports 23, not the ~26 in
   the task brief.** 23 is the count of *non-test* `project-*` files actually on
   disk (verified by hand with `ls | grep -v '\.test\.' | grep -c '^project-'`).
   27 is the count if test-only stems (e.g. `project-durability.test.ts`, which
   has no `project-durability.ts`) are folded in, and 49 is the raw file count
   including tests. The brief says "take the non-test files", and the `llm-`
   expectation of 8 only holds under the non-test reading, so 23 is the value
   consistent with both instructions. Flagging it because it differs from the
   stated "about 26".
3. **Banned-name findings get two message shapes.** A banned *basename* gets the
   prescribed `"utils" names nothing. Name the file for the one thing it
   exports, or split it.` A banned *directory* segment gets a parallel sentence
   (`the directory "utils" names nothing. Name it for what it holds, or move
   each file next to the code it serves.`) because "name the file for the one
   thing it exports" is the wrong instruction when the file's own name is fine.
   Basename takes precedence when a path trips both, so the key stays the path
   and there is exactly one finding per file.
4. **Test files are included in the banned-name check** but excluded from the
   depth and prefix-group checks. The brief exempts tests explicitly for (a) and
   scopes (c) to non-test files; (b) is written in terms of "basename without a
   trailing `.test`/`.spec`", which only makes sense if test files are in scope.
5. **Pluralisation in `test-placement` messages.** `1 test file sits beside its
   source. Move it into …` vs `35 test files sit beside their source. Move them
   into …`. Counts of 1 are common for this rule (many of the 70 directories
   have one or two), unlike the reference rules whose thresholds never produce
   a count of 1.
6. **`limit: 0` for the zero-tolerance checks** (`test-placement`, banned
   names), since the finding shape requires a `limit` and the comparison really
   is "any at all".
7. **`test-placement` requires the test root to be the *immediate* parent.** A
   file at `x/tests/unit/a.test.ts` is reported against `x/tests/unit`. I chose
   the strict reading of "directly inside"; it currently makes no difference
   (no such files exist), but it will bite if someone nests inside `tests/`.

## Commands run (last 5 lines of each)

```
$ node scripts/structure-audit.mjs --rule test-placement
  FAIL  [test-placement] packages/fluxiq/src/programs/secret-keys/runtime/: 1 test file sits beside its source. Move it into packages/fluxiq/src/programs/secret-keys/runtime/tests/.
  FAIL  [test-placement] packages/fluxiq/src/runtime/: 2 test files sit beside their source. Move them into packages/fluxiq/src/runtime/tests/.
  FAIL  [test-placement] packages/fluxiq/src/ui/: 1 test file sits beside its source. Move it into packages/fluxiq/src/ui/tests/.

structure-audit: 70 violation(s) across 1 rule(s).
[exit 1]
```

```
$ node scripts/structure-audit.mjs --rule test-placement --json
  ],
  "warnings": [],
  "suppressed": 0,
  "lowerable": []
}
[exit 1]
```

```
$ node scripts/structure-audit.mjs --rule naming
  FAIL  [naming] packages/fluxiq/src/programs/automation-studio/runtime/: 8 files share the prefix "llm-". Create runtime/llm/ and strip the prefix from their names.
  FAIL  [naming] packages/fluxiq/src/programs/automation-studio/storage/: 23 files share the prefix "project-". Create storage/project/ and strip the prefix from their names.
  FAIL  [naming] packages/fluxiq/src/programs/automation-studio/testing/: 4 files share the prefix "scale-". Create testing/scale/ and strip the prefix from their names.

structure-audit: 32 violation(s) across 1 rule(s).
[exit 1]
```

```
$ node scripts/structure-audit.mjs --rule naming --json
  ],
  "warnings": [],
  "suppressed": 0,
  "lowerable": []
}
[exit 1]
```

Two extra sanity runs, not required by the brief:

```
$ node scripts/structure-audit.mjs --list
file-lines             Source files stay under the line limit
imports                Imports respect forbidden modules, directory boundaries, and barrels
naming                 Names are specific, paths are shallow, prefixes become directories
test-placement         Test files live in a test root, not beside their source
[exit 0]
```

```
$ node scripts/structure-audit.mjs        # all rules, confirms no crash when loaded together
  FAIL  [test-placement] packages/fluxiq/src/ui/: 1 test file sits beside its source. Move it into packages/fluxiq/src/ui/tests/.

structure-audit: 363 violation(s) across 5 rule(s).
[exit 1]
```

Exit code 1 on the four required runs is the correct outcome: there is no
baseline, so every ratcheted finding fails. Neither rule threw.

## Not completed / open items

- No baseline was written (`--update` was explicitly out of scope). Until
  someone runs it, `test-placement` contributes 70 failures and `naming`
  contributes 26 ratcheted failures to the audit. The 4 path-depth findings are
  `ratchet: false` per the brief, so a baseline run will **not** silence them —
  they will keep failing the build until the four Next.js route paths are
  shortened. Those paths are dynamic-segment API routes
  (`apps/web/src/app/api/...`, `apps/web/src/app/domains/[domainId]/...`) whose
  depth is largely dictated by the framework's file-system router, so whoever
  owns the config may want to raise `maxPathSegments`, exempt `apps/web/src/app`,
  or flip depth to ratcheted. Flagging, not changing — config is not mine.
- The `project-` count differs from the brief's estimate (23 vs ~26); see
  judgement call 2 for the reconciliation.
