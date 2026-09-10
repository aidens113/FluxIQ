# Rule report: `imports`

File: `scripts/structure-audit/rules/imports.mjs` (135 lines)
Rule id: `imports`
Title: "Imports respect forbidden modules, directory boundaries, and barrels"

## What the rule does

One pass over `ctx.scriptFiles`. For each file it collects every module specifier, then
runs three independent checks against them.

### Specifier collection

`collectSpecifiers(ctx, file)` parses the file with `ctx.parse(file)` (cached TypeScript
`SourceFile`) and walks the whole tree with `ts.forEachChild`, recording a specifier from:

- `ts.isImportDeclaration(node)` → `node.moduleSpecifier` — covers both `import x from "s"`
  and the side-effect form `import "s"`.
- `ts.isExportDeclaration(node)` → `node.moduleSpecifier` — covers `export { a } from "s"`
  and `export * from "s"`. A local `export { a }` with no `moduleSpecifier` records nothing
  (the field is `undefined` and `record` returns early).
- `ts.isCallExpression(node) && node.expression.kind === ts.SyntaxKind.ImportKeyword` →
  `node.arguments[0]` — dynamic `import("s")`.

A specifier is recorded only when the node passes `ts.isStringLiteralLike`. The line is
1-based, taken from the *specifier* node: `sourceFile.getLineAndCharacterOfPosition(node.getStart(sourceFile)).line + 1`.
For a multi-line named import this is the line of the `from "…"` clause, not the line of the
`import` keyword (e.g. `direct-view-connector.tsx:15` below).

The walk is full-depth, so an `import()` inside a function body or a declaration nested in a
`declare module` block is caught, not just top-level statements.

### Resolution of relative specifiers

`isRelative` = starts with `./` or `../`. A relative specifier is resolved with
`path.posix.normalize(path.posix.join(importerDir, specifier))` where `importerDir` is
`ctx.dirname(file)`. `path.posix.join` already collapses `..` segments; the explicit
`normalize` is belt-and-braces and also handles a trailing `/`. The result is a repo-relative
POSIX path with no leading `./`, directly comparable to entries in `ctx.trackedFiles`.

### Check 1 — forbidden imports

Every specifier (relative or bare) is tested against each `ctx.CONFIG.forbiddenImports`
entry's `pattern`. First match wins.

- severity `fail`, `ratchet: false`, `key = "<path>:<line>"`, `value: 1`, `limit: 0`,
  `path`, `line`
- message: `<path>:<line>: imports "<specifier>". <reason>`

### Check 2 — import boundaries

For each `ctx.CONFIG.importBoundaries` entry `{ from, to, reason }`: if the importer path
starts with `from + "/"` and a relative specifier's resolved path starts with `to + "/"`, it
fails. Only relative specifiers are checked (a bare specifier does not resolve to a
repo-relative directory). All matching boundaries are reported, not just the first.

- severity `fail`, `ratchet: false`, `key = "<path>:<line>"`, `value: 1`, `limit: 0`,
  `path`, `line`
- message: `<path>:<line>: imports "<specifier>", which resolves under <to>/. <reason>`

### Check 3 — barrel skipping (ratcheted)

For each relative specifier, after resolution:

1. Strip a trailing `.ts` / `.tsx` / `.js` / `.jsx` / `.mjs` / `.cjs` extension.
2. If the result names a directory — i.e. it is in the set of directories derived from
   `ctx.trackedFiles` — the import already goes through that directory's entry point and is
   skipped. (The set is built once per run by walking each tracked file's ancestor
   directories, which is equivalent to "some tracked file starts with `resolved + '/'`" and
   is O(1) per lookup instead of O(tracked files).)
3. Otherwise it names a file. It is a barrel skip when all three hold: its directory differs
   from the importer's directory; its basename is not `index`; and its directory contains a
   tracked barrel (`index.ts`, `index.tsx`, `index.js`, or `index.mjs`). The barrel-directory
   set is likewise built once per run from `ctx.trackedFiles`.

Same-directory sibling imports can never count (condition 2 of step 3). Barrel skips are
counted per importing file, and one finding is emitted per importer with a non-zero count:

- severity `fail`, `ratchet: true`, `key = "<importer path>"`, `value = count`, `limit: 0`,
  `path = importer` (no `line` — the message carries the first offending specifier's line)
- message: `<path>: <count> import(s) reach into another directory's files instead of its barrel, e.g. "<first specifier>" at line <n>. Import from the directory (its index) instead.`

## Finding counts in FluxIQ Core

Measured from `node scripts/structure-audit.mjs --rule imports --json`:

| Check | Findings | Ratcheted |
| --- | --- | --- |
| Forbidden imports | **0** | no |
| Import boundaries | **0** (`CONFIG.importBoundaries` is `[]` here) | no |
| Barrel skipping | **198** findings (one per importing file) | yes |
| Total failures | 198 | |
| Warnings | 0 | |

**Total barrel-skip imports across the repository: 326**, spread over 198 importing files.

Per-file distribution (count → number of files):
`1 → 141`, `2 → 37`, `3 → 7`, `4 → 6`, `6 → 3`, `10 → 2`, `11 → 1`, `17 → 1`. Worst file: 17.

Corpus scale, for context (same walk, measured separately): 4,637 string-literal specifiers
across the script files — 1,216 bare/package specifiers, 3,421 relative, of which 441 come
from `export … from` and 12 from dynamic `import()`.

All 198 findings currently FAIL because the ratchet has no `imports` entries yet
(`applyRatchet` fails a `ratchet: true` finding when `recorded === undefined`). That is the
expected pre-baseline state; `--update` was **not** run, as instructed.

## Three concrete examples

1. `apps/web/src/features/automation-studio/views/canonical-view-definitions.tsx` — 17 barrel
   skips; first at **line 5**, `"../adaptations/AdaptationsView"`. Resolves to
   `apps/web/src/features/automation-studio/adaptations/AdaptationsView`, whose directory
   contains a tracked `index.ts`. Verified in the source: line 5 is
   `import { AdaptationsView } from "../adaptations/AdaptationsView";`, and
   `apps/web/src/features/automation-studio/adaptations/index.ts` is tracked.

2. `apps/web/src/features/automation-studio/live/view-host/direct-view-connector.tsx` — 11
   barrel skips; first at **line 15**, `"../../stores/project-data-store"`. Line 15 is the
   `} from "../../stores/project-data-store";` clause of a multi-line named import, which is
   where the specifier literal actually sits. `apps/web/src/features/automation-studio/stores/index.ts`
   is tracked.

3. `packages/fluxiq/src/programs/docs/api/contracts.ts` — 1 barrel skip at **line 1**,
   `"../types.ts"`. This exercises extension stripping: the specifier resolves to
   `packages/fluxiq/src/programs/docs/types.ts`, strips to `.../docs/types`, is not a
   directory, its directory `packages/fluxiq/src/programs/docs` differs from the importer's,
   its basename is not `index`, and `packages/fluxiq/src/programs/docs/index.ts` is tracked.
   The same `"../types.ts"` pattern accounts for most of the 141 single-skip files under
   `packages/fluxiq/src/programs/*/{api,runtime,storage}/`.

## Judgement calls

- **Extension handling.** Only the six script extensions listed in the task are stripped
  (`.ts .tsx .js .jsx .mjs .cjs`). A specifier such as `./styles.css` or `./data.json` keeps
  its extension, so its basename is never `index` and it is judged as a file. In this
  repository that is moot: **zero** barrel-skip findings involve a non-script extension
  (measured). If asset imports ever appear across a barrelled directory they would be
  counted; the fix would be to add an ignore list of non-code extensions, which I did not add
  speculatively.
- **Directory-vs-file resolution uses the extension-stripped path.** `./foo.js` and `./foo`
  are therefore both treated as naming directory `foo` if such a directory exists. The
  alternative (test directory-ness on the raw resolved path) would misclassify
  extensioned specifiers in an ESM-with-extension codebase. The two only differ if a
  directory and a same-named file with a stripped extension coexist, which is already a
  resolution ambiguity in the source.
- **Specifiers that resolve to nothing tracked.** The file branch does not require the target
  file to be tracked — the meaningful signal is that the *target directory* has a barrel, and
  requiring the exact target file to be tracked would silently miss imports of
  generated-but-gitignored siblings. I measured the exposure: **0 of the 326** barrel skips
  point at a target that is not a tracked file under one of the six extensions, so this
  choice changes nothing in Core today. It is documented here because it can matter
  downstream.
- **`ts.isStringLiteralLike` rather than `ts.isStringLiteral`.** This additionally accepts a
  no-substitution template literal, i.e. ``import(`./x`)``, which is a static specifier in
  every meaningful sense. For `import`/`export` declarations the two are identical (a template
  literal there is a syntax error).
- **`import x = require("s")` is NOT collected.** The task enumerated four specifier forms and
  this is a fifth. I checked first — `git grep "import .* = require("` over `*.ts *.tsx *.js
  *.mjs` returns nothing in this repository — so collecting it would add an untested branch
  for no coverage. Same reasoning for plain CommonJS `require("s")` calls. If either form ever
  lands, the forbidden-import check would have a hole; worth revisiting then.
- **All matching boundaries are reported, but only the first matching forbidden pattern.**
  A single import can violate several `from`/`to` edges and each is a distinct reason worth
  printing; repeating the same specifier once per forbidden pattern that matches it would be
  noise. Note both produce `key = "<path>:<line>"`, so multiple boundary findings on one line
  share a key — harmless because they are `ratchet: false` and never reach the baseline.
- **`limit: 0` on every finding.** These checks are pass/fail rather than budgeted; `0` is the
  honest limit (no forbidden imports, no boundary crossings, no barrel skips allowed).
- **Per-run set construction.** `barrelDirectories()` and `trackedDirectories()` are each
  built once at the top of `run()`, as required, rather than per specifier.

## Verification

Both required commands were run. No `--update`.

### `node scripts/structure-audit.mjs --rule imports`

Exit code 1 (expected: 198 unbaselined ratcheted failures). Last 5 lines:

```
  FAIL  [imports] packages/fluxiq/src/programs/production-runner/storage/contracts.ts: 1 import(s) reach into another directory's files instead of its barrel, e.g. "../types.ts" at line 1. Import from the directory (its index) instead.
  FAIL  [imports] packages/fluxiq/src/programs/secret-keys/api/contracts.ts: 1 import(s) reach into another directory's files instead of its barrel, e.g. "../types.ts" at line 2. Import from the directory (its index) instead.
  FAIL  [imports] packages/fluxiq/src/programs/secret-keys/runtime/service.ts: 1 import(s) reach into another directory's files instead of its barrel, e.g. "../types.ts" at line 11. Import from the directory (its index) instead.

structure-audit: 198 violation(s) across 1 rule(s).
```

### `node scripts/structure-audit.mjs --rule imports --json`

Exit code 1, 1,987 lines of valid JSON. Last 5 lines:

```
  ],
  "warnings": [],
  "suppressed": 0,
  "lowerable": []
}
```

### Additional checks I ran

- **Full audit** (`node scripts/structure-audit.mjs`, all rules discovered): completes without
  error, exit 1, `structure-audit: 363 violation(s) across 5 rule(s).` — the new rule loads
  and coexists with the other rule modules present in the tree.
- **Synthetic fixture for checks 1 and 2**, run inline via `node --input-type=module -e` with a
  hand-built `ctx` (no files written to the repo), because Core has no real forbidden import
  and an empty boundary list. Fixture: `src/a/uses-forbidden.ts` importing
  `"fluxiq-web-extension/thing"` plus a same-directory `export * from "./local"`;
  `src/a/crosses.ts` with a dynamic `import("../b/deep/thing")` and a sibling `import "./sib"`;
  barrels at `src/b/index.ts` and `src/b/deep/index.ts`. Output:

  ```
  fail ratchet=false key=src/a/uses-forbidden.ts:1 | src/a/uses-forbidden.ts:1: imports "fluxiq-web-extension/thing". FluxIQ Core must never import a downstream domain repository.
  fail ratchet=false key=src/a/crosses.ts:1 | src/a/crosses.ts:1: imports "../b/deep/thing", which resolves under src/b/. Layer A must not reach into layer B.
  fail ratchet=true key=src/a/crosses.ts | src/a/crosses.ts: 1 import(s) reach into another directory's files instead of its barrel, e.g. "../b/deep/thing" at line 1. Import from the directory (its index) instead.
  ```

  This confirms: forbidden matching on bare specifiers; boundary matching on a *dynamic*
  import (so dynamic-import collection works); the exact message wording of both; and that
  same-directory (`./local`, `./sib`) imports are not counted as barrel skips.
- **Example spot-checks** against the real sources with `sed -n` and `git ls-files`, confirming
  the reported line numbers and the existence of the target directories' `index.ts` files
  (examples 1–3 above).
- **Resolution audit** over the whole repository (inline script, nothing written): 0 barrel-skip
  targets are untracked, 0 involve a non-script extension.

## Definition of done

| Requirement | Status |
| --- | --- |
| Runs without error over all script files | Met (198 findings, no exceptions, full audit also clean) |
| Zero forbidden-import findings | Met (0) |
| Zero boundary findings | Met (0; `importBoundaries` is empty in Core) |
| Barrel-skip findings present with plausible counts | Met (198 importers, 326 imports, max 17) |
| Report states total barrel-skip count + 3 examples with file and line | Met |
| `--update` not run | Met |

## Not completed / caveats

- Nothing in the task was left undone.
- Checks 1 and 2 have **no live coverage in this repository** — Core has no forbidden import
  and an empty boundary list, which is the required outcome but means their real-world
  behaviour is evidenced only by the synthetic fixture above, not by a repository finding.
- The barrel-skip count of 326 is a snapshot of the working tree as of this run; other agents
  were concurrently modifying `scripts/structure-audit.mjs` and adding rule modules
  (`git status` showed `AGENTS.md`, `docs/working/module-size-governance-plan.md`,
  `scripts/structure-audit.mjs` modified and `scripts/structure-audit/` untracked). None of
  those changes are mine; I created only
  `scripts/structure-audit/rules/imports.mjs` and this report.
- `scripts/structure-audit/` is currently untracked, so its own files are absent from
  `git ls-files` and therefore from `ctx.scriptFiles`. The rule does not yet audit the audit's
  own sources. That resolves itself once the directory is committed.
