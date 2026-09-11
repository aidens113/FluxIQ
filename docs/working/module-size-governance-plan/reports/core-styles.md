# Worker report — core-styles (Phase 8, stylesheets)

Brief: `### Brief: core-styles`, Phase 4 / 5 / 8 dispatch, 2026-09-10.
Repository: FluxIQ Core (`F:\!FluxIQ`).

## Outcome

**Done**, with one consequence the brief's boundaries did not let me repair:
two `.ts`/`.tsx` tests read the two stylesheets by their old paths with a raw
`readFileSync`, and each now fails with `ENOENT`. Details and the exact fixes
are in *Open questions* below. The brief's own gate,
`apps/web/src/features/automation-studio/tests/architecture-contract.test.ts`,
passes (23/23).

## What changed and why

`global-foundation.css` (3,396 lines) and `global-programs.css` (764) became
numbered section directories, copying the convention already established by
`apps/web/src/features/automation-studio/styles/`: a directory per subject
group holding `NN-topic.css` files, with the app-level CSS entry acting as the
`@import` manifest that fixes cascade order. In the Studio that entry is
`app/programs/automation-studio/automation-studio.css`; the global equivalent
is `app/globals.css`, so the section files are listed there directly. No
intermediate manifest file was left behind, because the Studio convention has
exactly one manifest level.

`apps/web/src/app/styles/global-foundation/` — 18 files, 54-357 lines:

| File | Lines | Covers |
| --- | --- | --- |
| `01-tokens-and-reset.css` | 138 | `:root` design tokens, focus-visible, element reset |
| `02-app-chrome.css` | 167 | directory topbar, brand lockup, auth status, icon buttons |
| `03-auth-and-fields.css` | 220 | auth page and card, form fields, password input |
| `04-feedback-and-status.css` | 357 | alerts, inline notices, loading, skeleton, progress, empty state |
| `05-console-shell.css` | 138 | console shell, program topbar, breadcrumbs, page header |
| `06-controls-and-menus.css` | 277 | toolbar, buttons, menus, combobox, tooltip, spinner |
| `07-program-launcher.css` | 147 | launcher search, groups, rows |
| `08-program-directory.css` | 241 | program grid and cards, categories, tabs, technical drawer |
| `09-panels-and-pagination.css` | 104 | workspace panels, panel headings, pagination |
| `10-lists-tables-and-rows.css` | 254 | lists, trees, data tables, field and check rows |
| `11-totp-enrollment.css` | 116 | TOTP setup, QR card, secret copy, otpauth details |
| `12-background-tasks.css` | 180 | link button, summary strip, background task shell and list |
| `13-operations-and-deployment.css` | 202 | operator cards, status pills, spec grid, deployment, segmented control |
| `14-json-and-callouts.css` | 54 | JSON editor and details, callouts |
| `15-modals-and-drawers.css` | 160 | modal backdrop and panel, dialogs, drawers, pairing panel |
| `16-docs-workspace.css` | 272 | docs explorer, file tree, rendered markdown and HTML |
| `17-database-explorer.css` | 282 | DB explorer shell, tree, toolbar, grid, KV explorer |
| `18-production-and-motion.css` | 87 | production scope selector, virtual file tree, reduced-motion policy |

`apps/web/src/app/styles/global-programs/` — 6 files, 34-208 lines:
`01-identity-and-access.css` (139), `02-secret-keys.css` (34),
`03-docs-workspace.css` (208), `04-background-tasks.css` (129),
`05-compute-control.css` (179), `06-production-and-route-states.css` (75).
The split follows the file's own section comments (`/* Identity and Access */`,
`/* Documentation operational workspace */`), which moved with their sections.

`apps/web/src/app/globals.css` grew from 5 import lines to 27: the 18
foundation sections, then `global-shared-controls.css` and
`global-secret-management.css` unchanged, then the 6 programs sections, then
`global-responsive-certification.css`. That is the original cascade order with
each split file expanded in place; nothing was reordered.

Method: every section is a contiguous byte slice of the original, cut only at
top-level rule boundaries. No declaration was retyped, reformatted, renamed or
moved across a boundary, so a cascade reorder is structurally impossible rather
than merely unobserved. `git mv` carried each original file onto its `01-`
section so history follows.

## Commands run and observed results

Rule preservation, the primary evidence — the resolved manifest, produced by a
local copy of the repository's own `readCssManifest`
(`apps/web/src/features/programs/css-manifest-test-helper.ts`, which inlines
`@import` recursively), captured before and after and compared as the ordered
sequence of non-empty trimmed lines:

```text
before lines 4334 after lines 4334
hash before 5ca41302dc43e21a5a2a0aeb5d26ada30b533f50aef2dfbb12b26261e7625a95
hash after  5ca41302dc43e21a5a2a0aeb5d26ada30b533f50aef2dfbb12b26261e7625a95
IDENTICAL ORDERED DECLARATION TEXT: true
```

The raw (untrimmed) diff of the same two resolved texts is 22 hunks, every one
of them a single inserted blank line, one per split boundary (17 in foundation,
5 in programs) — the manifest's own line separator:

```text
$ diff before-globals.txt after-globals.txt | grep -v "^[0-9]" | grep -v "^> *$"
(no output)
$ grep -c "^[0-9]*a[0-9]*$" raw.diff
22
```

Byte identity of the split itself, checked by the splitter as it wrote:

```text
01-tokens-and-reset.css 138 lines 3919 bytes ... 18-production-and-motion.css 87 lines 2004 bytes
byte-identical concatenation: true
01-identity-and-access.css 139 lines 2782 bytes ... 06-production-and-route-states.css 75 lines 1614 bytes
byte-identical concatenation: true
```

Line totals corroborate it: the new directories total 4,160 lines
(3,396 + 764), and `app/styles` still totals 5,033.

The brief's gate:

```text
$ npx vitest run src/features/automation-studio/tests/architecture-contract.test.ts
 ✓ src/features/automation-studio/tests/architecture-contract.test.ts (23 tests) 2315ms
 Test Files  1 passed (1)
      Tests  23 passed (23)
```

The Studio CSS architecture gate, which also asserts on `globals.css`:

```text
$ npx vitest run src/features/automation-studio/styles/tests/styles-architecture.test.ts
 ✓ ... (5 tests) 38ms
 Test Files  1 passed (1)
```

The five CSS contract tests in `features/programs`. The four that read through
`readCssManifest(globals.css)` pass unchanged — independent confirmation that
the cascade survived. The fifth fails on a raw path read:

```text
$ npx vitest run src/features/programs/tests/phase7-responsive-contract.test.ts \
    src/features/programs/tests/geometry-contract.test.ts \
    src/features/programs/tests/motion-layer-contract.test.ts \
    src/features/programs/tests/surface-contract.test.ts \
    src/features/programs/tests/typography-contract.test.ts
 ✓ geometry-contract.test.ts (2 tests)
 ✓ motion-layer-contract.test.ts (2 tests)
 ❯ phase7-responsive-contract.test.ts (4 tests | 1 failed)
   × removes the known fixed tall-shell assumptions
     → ENOENT: no such file or directory, open 'F:\!FluxIQ\apps\web\src\app\styles\global-programs.css'
 ✓ typography-contract.test.ts (2 tests)
 ✓ surface-contract.test.ts (2 tests)
 Test Files  1 failed | 4 passed (5)
      Tests  1 failed | 11 passed (12)
```

```text
$ npx vitest run src/features/programs/tests/shared-ui.test.tsx
 ❯ shared-ui.test.tsx (20 tests | 1 failed)
   × isolates modal focus without mutating the entire application subtree
     → ENOENT: no such file or directory, open 'F:\!FluxIQ\apps\web\src\app\styles\global-foundation.css'
 Tests  1 failed | 19 passed (20)
```

Structure audit, scoped to the rules a CSS move can affect:

```text
$ node scripts/structure-audit.mjs --rule file-lines      → total findings: 0, app/styles findings: 0
$ node scripts/structure-audit.mjs --rule naming          → total findings: 0, app/styles findings: 0
$ node scripts/structure-audit.mjs --rule directory-files → total findings: 0, app/styles findings: 0
$ node scripts/structure-audit.mjs --rule imports         → total findings: 0, app/styles findings: 0
$ node scripts/structure-audit.mjs --rule file-lines      → structure-audit: passed (54 warning(s), 15 baselined). exit 0
```

No new stylesheet warns: the largest, `04-feedback-and-status.css` at 357
lines, is under the 400-line advisory threshold. No stylesheet anywhere in
`app/styles` now exceeds 800 lines; the largest is the untouched
`global-shared-controls.css` at 366.

## Not verified

- **No browser or `next build` run.** The proof here is textual: the resolved
  manifest is declaration-identical and in the same order, and every `@import`
  resolved on disk during that resolution. I did not render a page, and I did
  not run `next build` because the TypeScript tree was being edited by other
  workers throughout and a failure there would not have been attributable.
- **Cross-file `@media` and cascade interactions were not reasoned about
  individually.** They do not need to be: the slices are contiguous and
  concatenate byte-identically, so the rule sequence the browser sees is the
  one it saw before.
- **The wider `apps/web` suite was not run.** Other workers were editing
  `.ts`/`.tsx` in the same vitest project concurrently, per the dispatch note.
  I ran only the CSS-touching tests, all named above.
- **`.structure-baseline.json` was not regenerated** (the brief forbids it). It
  still carries the key `apps/web/src/app/styles/global-foundation.css: 3396`,
  now stale; the supervisor's `pnpm structure:baseline` will drop it. The audit
  passes with it present.

## Open questions or contradictions found

**Two tests read the old stylesheet paths raw, and I may not edit them.** The
brief says "Must not touch: any `.ts`/`.tsx` file"; both files also sit in
`apps/web/src/features/programs/**`, which the concurrent `core-shared-ui`
brief owns. So Phase 8 as specified cannot be completed without someone else
making these two one-line edits. Both failures are `ENOENT`, one test case each:

1. `apps/web/src/features/programs/tests/shared-ui.test.tsx:12`

   ```ts
   const css = readFileSync(new URL("../../../app/styles/global-foundation.css", import.meta.url), "utf8");
   ```

   Fix: `const css = readCssManifest(new URL("../../../app/globals.css", import.meta.url));`
   (import `readCssManifest` from `../css-manifest-test-helper`, as five sibling
   tests already do). I verified all three of its assertions hold against the
   resolved manifest: `--layer-popover: 115` → true, `scrollbar-gutter: stable`
   → true, `/\.drawer-backdrop[\s\S]*?contain: layout paint style/u` → true.
   They held against the original file too, so this is a path repair, not a
   weakened contract. The content now lives in `01-tokens-and-reset.css` (both
   tokens) and `15-modals-and-drawers.css` (`.drawer-backdrop`).

2. `apps/web/src/features/programs/tests/phase7-responsive-contract.test.ts:15`

   ```ts
   "../../../app/styles/global-programs.css",
   ```

   Fix: replace that one entry with the six section paths
   `"../../../app/styles/global-programs/01-identity-and-access.css"` through
   `"…/06-production-and-route-states.css"`. I verified both negative
   assertions (`min-height: 520|620|680|700|720px`, `minmax(520|…px`) hold
   across all six sections. Pointing it at a manifest instead would let the
   assertion pass vacuously and silently stop covering the content it was
   written for, so the explicit list is the right repair.

**One judgment call worth recording.** I considered leaving
`global-foundation.css` and `global-programs.css` in place as thin nested
manifests, which would have kept both `readFileSync` calls resolving. I
rejected it: it deviates from the Studio convention the brief told me to copy
(one manifest level, no vestigial files), it would not have saved
`shared-ui.test.tsx` anyway (its assertions are positive, and a manifest
contains no declarations), and for `phase7` it would have turned a real
negative assertion into a vacuous one. The flat manifest is the honest shape;
the cost is two one-line test edits.
