# Module Size And Structure Governance Plan

Status: Active
Status detail: Every checkable rule is enforced in both repositories; the migration phases are sequenced but not started.
Created: 2026-09-10
Last updated: 2026-09-10
Owner: Senior supervisor agent
Scope: Preventing unbounded file, class, and directory growth in FluxIQ Core and the downstream web-extension repository, relocating tests to `tests/`, and reorganizing what has already grown past maintainability.
Paired document: `F:\!FluxIQWebExtension\docs\working\module-size-governance-plan.md`
Related: [code structure](../architecture/code-structure.md), [AGENTS.md](../../AGENTS.md)

This document owns the shared policy and the Core migration. The
methodology itself is authored in `docs/architecture/code-structure.md`;
this document tracks applying it.

---

## Current State

**Enforcement is complete for every rule a machine can check.**
`scripts/structure-audit.mjs` runs first in `pnpm check` and loads one
module per rule from `scripts/structure-audit/rules/`; a generic ratchet in
`baseline.mjs` freezes existing violations per rule and per key. Rules:
`file-lines`, `directory-files`, `class-methods` (TypeScript AST, blocking),
`exported-values` (one class, one component, at most 15 values per file),
`test-placement` (tests sit in `tests/` or `e2e/`), `naming` (depth, banned
names, shared-prefix groups), `imports` (forbidden specifiers, declared
boundaries, barrel skipping), and `working-docs` (header block, `Current
State` for Active documents, size, and the generated index). Verified: a
clean tree exits 0; growth in a baselined entry exits 1; a new violation
exits 1; `pnpm -r check` passes alongside.

**The downstream repository runs the same audit.** Entry, context, baseline,
and rules are mirrored there byte for byte; only `config.mjs` differs, and it
additionally forbids `domain/src` importing `apps/extension/src` (zero
violations today). Its `pnpm check` runs the audit first.

**Audit, 1,367 tracked files:** 16 source files over 800 lines (largest
`service.ts`, 12,482); 11 directories over 25 files; 2 classes over 40
methods (`AutomationStudioService` 422, `ClientGatewayService` 43); 61
files with an oversized export surface (11 with several classes, 31 with
several components, 19 over 15 values; `shared-ui.tsx` exports 36
components); 333 co-located test files in 70 directories; 26 shared-prefix
groups of three or more (largest `project-` 23 in `storage/`); 326
barrel-skipping imports across 198 files; 16 working documents over 800
lines. Downstream adds `FluxIQConnection` at 81 methods in `connection.ts`
and 74 co-located tests. All of it is frozen in each repository's baseline.

**Decisions taken**

- Tests move into a `tests/` subfolder of the directory that owns their
  subject — no separate mirrored tree.
- `programs/automation-studio/testing/` and `client-gateway/testing/` stay
  in `src`: both are re-exported from public barrels.
- The prefix rule alone brings `storage/`, `runtime/`, and `model/` under
  the cap. No kind split is needed on the framework side.
- `service.ts` is decomposed last, behind a facade that keeps its public
  surface, because every program imports it.
- Depth is exempt under `apps/web/src/app/`, where the Next.js router
  dictates it.
- Warnings never ratchet; only fail findings enter the baseline.

**Next steps:** Phase 1 (tests relocation), then Phase 2 (`storage/`). Each
lowers baseline entries; run `pnpm structure:baseline` after each.

**Blockers:** none.
---

## Enforcement

Ratcheted budgets: existing violations are frozen, new ones refused.

| Rule | Warn | Fail |
| --- | --- | --- |
| File lines | 400 | 800 |
| Directory source files | 15 | 25 |
| Class methods | 25 | advisory only at 40 |

`pnpm structure:check` audits; `pnpm structure:baseline` rewrites the
baseline downward using `min(previous, current)` so an entry can never rise.

A rule against catch-all files existed in `AGENTS.md` for all 43 commits in
which `service.ts` grew. Guidance was demonstrably not a control, so the
control is a failing check.

---

## Migration Plan

Each phase is independently shippable. After each: `pnpm check && pnpm test`
must pass, `pnpm structure:baseline` records the shrinkage, commit, push.

### Phase 1 — Move tests into `tests/` subfolders

Mechanical. Zero behaviour change. Halves the file count in every dense
directory before any code is touched.

1. In every directory holding `*.test.ts(x)` or `*.spec.ts(x)` files, create
   `tests/` and `git mv` the test files into it. Filenames unchanged.
2. Fix relative imports inside moved tests: one extra `../` to reach the
   subject, or import from the directory barrel.
3. `packages/fluxiq/tsconfig.build.json` and
   `packages/client-gateway-websocket/tsconfig.build.json`: change `exclude`
   from `["src/**/*.test.ts"]` to `["src/**/tests/**"]`, so the build skips
   the folders rather than a filename pattern and support files in `tests/`
   are never compiled into `dist`.
4. `vitest.quality.config.ts` in `packages/fluxiq` and `apps/web`: update the
   three and two explicit test paths.
5. `apps/web/src/features/automation-studio/testing/` mixes fixtures and
   tests. Its `*.test.ts` files move to `testing/tests/`; the fixtures stay,
   since they are that folder's own support.
6. Regenerate the baseline. Expected: `storage` 72 → 37, `runtime` 66 → 34,
   `hierarchy` 56 → 41, `live` 49 → 43; several directories drop below 25
   outright.

No `tsconfig.json` change: tests remain under `src/**`, which `pnpm check`
already includes. Vitest's default include already matches `**/*.test.ts`
at any depth.

### Phase 2 — `automation-studio/storage/` (37 source files)

Apply the prefix rule. Layer barrel keeps its exports.

```text
storage/                              13 + project/
  project/                            23 + hierarchy/
    hierarchy/{feed,mutations,repository}.ts
```

`project-*` (26 files) → `project/` with the prefix stripped; inside it,
`hierarchy-*` (3) → `project/hierarchy/`. Every other prefix group in
`storage/` has two members and stays flat. Update `storage/index.ts` to
re-export from `./project/index.ts`; `project/index.ts` re-exports its
children. Verify `storage/index.ts`'s export list is identical before and
after with a diff of `export` lines.

### Phase 3 — `automation-studio/runtime/` (34) and `model/` (28)

`runtime/`: `llm-*` (8) → `llm/`; `flow-bootstrap*` (3) → `flow-bootstrap/`.
Result: 23 loose + two directories. Optional naming normalization for two
strays that belong with `llm/` but do not match the prefix:
`reusable-llm-context.ts` → `llm/reusable-context.ts`,
`completed-llm-evidence.ts` → `llm/completed-evidence.ts`.

`model/`: `state-*` plus bare `state.ts` (3) → `state/`. Result: exactly 25
loose. The next file added to `model/` forces another grouping — that is the
ratchet working as designed, not a problem to pre-empt.

### Phase 4 — Web features: kind folders

Apply the kind rule where the web naming already declares kind. Each feature
keeps its `index.ts` exports.

| Feature | Before | After |
| --- | --- | --- |
| `live/` | 43 loose | 6 loose + `hooks/` 20 + `components/` 7 + `commands/` 4 + `view-host/` |
| `hierarchy/` | 41 loose | 24 loose + `components/` 6 + `hooks/` 5 + `commands/` 6 |
| `flow-editor/` | 36 loose + `commands/` + `model/` | 14 loose + `components/` 13 + `hooks/` 9 + existing two |

Two naming fixes fall out: `live/use-gateway-recording-bridge.ts` →
`hooks/useGatewayRecordingBridge.ts` and `hierarchy/tree-rows.tsx` →
`components/TreeRows.tsx`, so the kind rule sees them.

### Phase 5 — Declaration dumps and the component pile

Cheapest code splits; barrel-protected; zero consumer change.

- `api/contracts.ts` (112 types) → `api/contracts/` split by domain noun.
- `storage/project-schema.ts` (21 consts) → after Phase 2 it is
  `project/schema.ts`; split into `project/schema/` by table or document.
- `model/fixtures.ts` (823) → `model/fixtures/` by document type.
- `apps/web/src/features/programs/shared-ui.tsx` (37 components) →
  `programs/components/`, one file each.

### Phase 6 — Giant function bodies

Extract named steps into sibling modules. Private helpers; no consumer sees
a change.

- `api/handlers.ts` — 2,094 lines, 3 exported functions.
- `runtime/executor.ts` — 876 lines, 3 exported functions.
- `model/validation.ts` — 934 lines, 28 functions; group by document.
- `runtime/llm-harness.ts` (→ `llm/harness.ts` after Phase 3) and
  `runtime/flow-bootstrap.ts` — mixed; split types out first, then bodies.

### Phase 7 — `AutomationStudioService` facade

Last, because every program imports it. The class keeps its public surface
exactly and delegates to collaborators under `runtime/service/`:

| Collaborator | Methods | From prefixes |
| --- | --- | --- |
| persistence | 108 | `write` 39, `read` 25, `delete` 25, `save` 14, `append` 9 |
| retrieval | 84 | `list` 51, `get` 33 |
| flow | 32 | `flow` |
| validation | 22 | `ensure` 14, `assert` 7 |
| lifecycle | 15 | `apply` 8, `review` 4, `migrate` 4 |
| recording, binding, project | 20 | `recording` 7, `bind` 7, `project` 6 |

Extract persistence first (largest, most mechanical), then retrieval, then
the domain groups. Each extraction lands independently with tests green.
`service.test.ts` (4,790 lines) is split to mirror the collaborators as they
appear, never ahead of them. `ClientGatewayService` (42 methods) gets the
same treatment at a fraction of the size.

Risk note: this is the one phase that touches behaviour every program depends
on. It should not run during the last week of the MVP cycle, and each
collaborator extraction is its own commit so any regression bisects to one
step.

### Phase 8 — Stylesheets

`global-foundation.css` (3,396) and `global-programs.css` (764) → numbered
section directories, following the convention `features/automation-studio/styles/`
already uses.

---

## CodeGraph Assessment

`github.com/colbymchenry/codegraph` — verified 2026-09-10: 70,403 stars,
MIT, last push 2026-09-09, `@colbymchenry/codegraph@1.6.0` on npm. It
builds a local tree-sitter/SQLite graph of a codebase and serves symbol,
caller, and call-path queries to agents over MCP.

**Decision: time-boxed trial on Core only, independent of this plan.** It
would help trace paths into the god class and supports the existing
trace-before-modify rule. Four reservations, in order:

1. It makes a large codebase cheaper to navigate; it does nothing to stop
   one forming, and removes the friction that would otherwise force a
   split. Complementary to the ratchet, never a substitute.
2. It indexes per project. Cross-repository tracing across the `link:`
   seam lands in two disconnected graphs.
3. Windows CI is weak upstream — 79 open Windows issues, a cluster on its
   own test suite (temp-directory leaks, POSIX PID assumptions, V8 OOM in
   the Windows pool, one "hard blocker" for promoting Windows builds).
   Verify it indexes a path containing `!` on `F:` before relying on it.
4. Its own docs report ~80% more retrieval context resident at session end,
   in tension with role-scoped reading.

## Downstream Adoption

The downstream repository adopts the same script and the same rules. Its
paired document tracks its own four oversized files. Its `AGENTS.md`
already links this repository's methodology rather than restating it.

---

## Worker Briefs

Dispatched 2026-09-10 to make every mechanically checkable `AGENTS.md` rule
a failing check in `pnpm check`. Workspace tooling only: no product code is
moved or split.

**Shared context.** `scripts/structure-audit.mjs` discovers rule modules in
`scripts/structure-audit/rules/*.mjs` and applies a generic ratchet from
`scripts/structure-audit/baseline.mjs`. The rule contract, finding shape,
shared context (tracked files, cached reads, cached TypeScript parses via
`ctx.parse(file)`), `LIMITS`, and repository `CONFIG` are documented at the
top of `scripts/structure-audit/context.mjs`. `rules/file-lines.mjs` and
`rules/directory-files.mjs` are reference implementations. A rule is read
only; messages must be self-explanatory without opening documentation;
findings that will have many existing violations must be `ratchet: true`
so the baseline can absorb them, with a stable `key`. Use the file-write
tool for your own files only — never a shared scratchpad. Do not commit or
push. Verify with `node scripts/structure-audit.mjs --rule <id>` and
`--rule <id> --json`, and report the finding counts plus three sample
messages.

### Brief: rule-classes-exports
- Repository: this repository
- Task: `rules/class-methods.mjs` — count methods per class with the
  TypeScript AST (methods, accessors, and properties initialised to
  functions), fail above `LIMITS.classMethods` ratcheted per
  `path::ClassName`, warn above `classMethodsWarn`. `rules/exported-values.mjs`
  — per script file, count exported value declarations (functions, classes,
  consts, enums, default exports; types and interfaces excluded); fail when
  exported classes exceed `exportedClasses` or, in `.tsx`, exported
  PascalCase components exceed `exportedComponents`; fail above
  `exportedValues` and warn above `exportedValuesWarn`; all ratcheted per
  path. Barrel files named `index.*` are exempt from the value count.
- Required reads: `scripts/structure-audit/context.mjs`, the two reference rules
- Owns (may edit): `scripts/structure-audit/rules/class-methods.mjs`, `scripts/structure-audit/rules/exported-values.mjs`
- Must not touch: any other file
- Definition of done: both rules run clean under `--rule`, `AutomationStudioService` reports a method count within 5 of 419, `shared-ui.tsx` reports 37 components; report written
- Report to: docs/working/module-size-governance-plan/reports/rule-classes-exports.md

### Brief: rule-tests-naming
- Repository: this repository
- Task: `rules/test-placement.mjs` — every test file (`ctx.isTestFile`) must
  sit directly inside a directory whose basename is in
  `CONFIG.testRootDirNames`; fail ratcheted per containing directory with
  the count of misplaced tests as the value. `rules/naming.mjs` — fail when a
  source path exceeds `LIMITS.maxPathSegments` (not ratcheted); fail when a
  basename without extension is in `CONFIG.bannedBasenames` or a directory
  segment is in `CONFIG.bannedDirectoryNames` (ratcheted per path); fail when
  three or more non-test, non-`index`, non-`types` kebab-case files in one
  directory share a leading `noun-` prefix (ratcheted per `dir::prefix`,
  value = group size, message naming the directory to create).
- Required reads: `scripts/structure-audit/context.mjs`, the two reference rules
- Owns (may edit): `scripts/structure-audit/rules/test-placement.mjs`, `scripts/structure-audit/rules/naming.mjs`
- Must not touch: any other file
- Definition of done: both rules run clean under `--rule`; `storage/` reports a `project-` group of about 26; report written
- Report to: docs/working/module-size-governance-plan/reports/rule-tests-naming.md

### Brief: rule-imports
- Repository: this repository
- Task: `rules/imports.mjs` — parse import and re-export declarations with
  the TypeScript AST. (1) Forbidden imports: any specifier matching a
  `CONFIG.forbiddenImports` pattern fails, not ratcheted. (2) Import
  boundaries: for each `CONFIG.importBoundaries` entry, a file under `from`
  importing a relative path that resolves under `to` fails, not ratcheted.
  (3) Barrel skipping: a relative specifier that resolves into a *different*
  directory than the importer, names a file other than `index`, and that
  directory contains an `index.ts`/`index.tsx`/`index.mjs`, fails ratcheted
  per importing path with the count of such imports as the value. Same-
  directory sibling imports are fine. Resolve `.ts`/`.js` extension rewrites
  sensibly.
- Required reads: `scripts/structure-audit/context.mjs`, the two reference rules
- Owns (may edit): `scripts/structure-audit/rules/imports.mjs`
- Must not touch: any other file
- Definition of done: rule runs clean under `--rule`; zero forbidden-import findings in this repository; report includes the total barrel-skip count and three examples; report written
- Report to: docs/working/module-size-governance-plan/reports/rule-imports.md

### Brief: rule-working-docs
- Repository: this repository
- Task: `rules/working-docs.mjs` for `CONFIG.workingDocsDir/*.md` except
  `README.md`. (1) Header conformance: an H1, a blank line, then exactly the
  eight fields `Status`, `Status detail`, `Created`, `Last updated`, `Owner`,
  `Scope`, `Paired document`, `Related` in that order with no blank lines
  between them; `Status` in the controlled vocabulary; fails, not ratcheted.
  (2) A document whose `Status` is `Active` must contain a `## Current State`
  heading within 20 lines of the header; fails, not ratcheted. (3) Document
  line count above `LIMITS.workingDocLines` fails ratcheted per path. (4)
  `README.md` freshness: generate the index from the header blocks — grouped
  by status in the order Active, Blocked, Paused, Complete, Superseded,
  Archived, Unclassified, one table per group with Document, Owner, Lines,
  Scope, and Paired columns, the paired cell showing the basename of the
  `Paired document` path or `none`, an ⚠ after any line count over 800, and
  a closing note with the count — and fail (not ratcheted) if the tracked
  `README.md` differs from the generated text; the existing `README.md`
  shows the exact intro paragraphs and wording to reproduce for
  `CONFIG.workingDocsIndexKind`. Export `update(ctx)` that writes the
  generated `README.md`.
- Required reads: `scripts/structure-audit/context.mjs`, the two reference rules, `docs/working/README.md`, `docs/working/agent-working-doc-protocol.md` sections "Header block" and "Section order"
- Owns (may edit): `scripts/structure-audit/rules/working-docs.mjs`
- Must not touch: any other file, including `README.md` itself
- Definition of done: rule runs under `--rule` with zero header or Current State failures against the current documents, the README freshness check passes against the current `README.md` byte for byte, and `--rule working-docs --update` would rewrite an identical file; report written
- Report to: docs/working/module-size-governance-plan/reports/rule-working-docs.md

---

## Work Ledger

### 2026-09-10 — Plan authored

- Agent: supervisor
- Changed: this document and its downstream pair.
- Why: A 12,482-line, 419-method class reached production while an
  instruction forbidding it was in force.
- Validation: measurements taken directly across both repositories. Plan
  only.
- Outcome: Accepted
- Follow-up: Implement the ratchet.

### 2026-09-10 — Full audit and enforcement implemented

- Agent: supervisor
- Changed: `scripts/structure-audit.mjs`, `.structure-baseline.json`,
  `package.json`, this document.
- Why: A hard 800-line limit and full Core audit were required.
- Validation: clean tree → exit 0, 71 warnings; +2 lines on
  `model/fixtures.ts` → `FAIL … 825 exceeds baseline 823`, exit 1; new
  801-line file → `FAIL`, exit 1; probes reverted; `pnpm structure:check`
  → exit 0.
- Outcome: Accepted
- Follow-up: Publish the methodology; plan the migration.

### 2026-09-10 — Methodology published, tests decision, migration sequenced

- Agent: supervisor
- Changed: `docs/architecture/code-structure.md` (new),
  `docs/architecture/program-layout.md`, `AGENTS.md` (rewritten for
  clarity and deduplicated), this document, working index and protocol
  (stale role terms), and the downstream `AGENTS.md` tests rule.
- Why: The user required a deterministic structure methodology covering
  global cases, tests in a dedicated folder, and an unambiguous `AGENTS.md`.
- Validation: public-surface invariant confirmed by reading
  `automation-studio/index.ts` (wholesale layer barrels; layers are not
  public subpaths); `testing/` confirmed public via the same barrel;
  `tsconfig.build.json` confirmed to need an explicit `include`. Documentation
  only, so no code check applies.
- Outcome: Accepted
- Follow-up: Phase 1.

### 2026-09-10 — Tests layout changed to per-directory subfolders

- Agent: supervisor
- Changed: `docs/architecture/code-structure.md`, `AGENTS.md`,
  `program-layout.md`, this document, and the downstream `AGENTS.md` and
  paired plan.
- Why: The user replaced the package-root mirrored `tests/` tree with a
  `tests/` subfolder inside each directory that owns the source files.
- Validation: consequence checked against the existing configs —
  `tsconfig.json` includes `src/**` so no include change is needed;
  `tsconfig.build.json` needs its exclude changed to the folder pattern;
  Vitest's default include matches at any depth. Documentation only.
- Outcome: Accepted
- Follow-up: Phase 1 under the new layout.

### 2026-09-10 — Every checkable AGENTS.md rule enforced

- Agent: supervisor, with workers rule-classes-exports, rule-tests-naming,
  rule-imports, and rule-working-docs on Opus 5
- Changed: `scripts/structure-audit.mjs` rewritten as an entry over
  `scripts/structure-audit/{context,baseline,config}.mjs` and eight rule
  modules; `.structure-baseline.json` regenerated in the per-rule shape;
  `docs/working/README.md` now generated by the audit; `AGENTS.md`
  Enforcement paragraph; `code-structure.md` depth exemption; four worker
  reports under `module-size-governance-plan/reports/`; the protocol's
  scratch-file rule. The tree is mirrored downstream with its own config,
  baseline, and `pnpm check` wiring.
- Why: The user required AGENTS.md to be strictly enforced without moving
  or splitting product code.
- Validation: each rule reviewed by reading its source and run under
  `--rule <id> --json` with counts checked against independent measurements
  (422 methods against a grep of 419; 36 components against 37 — the AST
  count is the correct one); the boundary check proven on a synthetic
  domain→extension import; the depth exemption leaves zero non-ratcheted
  failures; `pnpm -r check` exit 0 in Core; `pnpm structure:check` exit 0 in
  both repositories after `--update`. The docs rule caught wrapped header
  fields in this document and the protocol, fixed before baselining.
- Outcome: Accepted
- Follow-up: Phase 1 tests relocation.

---

## Open Questions

- **Should the method-count rule become blocking?** It is a regex heuristic
  (365 counted against 419 actual). Blocking needs a TypeScript parse.
  Owner: senior supervisor agent.
- **Should the audit verify the `tests/` mirror?** A test whose path has no
  `src/` counterpart is either misplaced or an integration test in the wrong
  folder. Cheap to add once Phase 1 lands. Owner: senior supervisor agent.
- **Should the audit enforce the working-document 800-line compaction
  threshold too?** Same mechanism, different file set. Owner: senior
  supervisor agent.
- **Should directories have a subdirectory cap?** The 25-file cap does not
  count directories. `apps/web/src/features/automation-studio/` has roughly
  thirty immediate subdirectories, which is navigable today but unbounded.
  Options: a cap of about 15 subdirectories, or a grouping pass into
  `editor/`, `runtime/`, `project/`. A product-sized feature may legitimately
  have many areas, so this is a decision, not a defect. Owner: user.
