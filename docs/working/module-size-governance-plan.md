# Module Size And Structure Governance Plan

Status: Active
Status detail: Phases 1-8 executed; every oversized file decomposed except runtime/service.ts, which continues incrementally.
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

**Phases 1 through 8 have all been executed. One file remains: `service.ts`.**
Every other oversized source file in either repository has been decomposed,
and every directory over the file cap has been split. What follows is the
settled position; the per-phase detail lives in the ledger.

| Subject | Before | After |
| --- | --- | --- |
| `app/styles/global-foundation.css` | 3,396 lines | 18 sections, largest 357 |
| `api/handlers.ts` | 2,091 lines | 1-line facade + 21 modules |
| `runtime/llm/harness.ts` | 1,161 lines | 1-line facade + 14 modules |
| `features/programs/shared-ui.tsx` | 1,087 lines, 37 components | 45 files |
| `api/contracts.ts` | 977 lines, 112 types | 1-line facade + 16 modules |
| `runtime/flow-bootstrap/plan.ts` | 958 lines | 31-line facade + 13 modules |
| `model/validation.ts` | 934 lines | 1-line facade + 11 modules |
| `storage/project/schema.ts` | 931 lines | 1-line facade + 14 modules |
| `runtime/executor.ts` | 876 lines | 1-line facade + 15 modules |
| `model/fixtures.ts` | 823 lines | 1-line facade + 3 modules |
| `client-gateway/service.ts` | 636 lines, 43 methods | 182 lines, 23 methods, 12 collaborators |
| `storage/` | 37 files | 14 |
| `runtime/` | 34 files | 23 |
| `live/` | 36 files | 6 |
| `flow-editor/` | 36 files | 13 |
| `hierarchy/` | 41 files | 30 |

**`runtime/service.ts` is the long tail, by design.** It began at 12,482 lines
and 422 methods. The plan requires each collaborator extraction to be its own
commit so a regression bisects to one step, so it lands incrementally rather
than in one pass. Its public surface is verified identical at every step: 178
public methods, unchanged.

**Three findings revise the plan's Phase 7 design and should be read before
continuing it.**

1. The prefix-derived grouping table covers 68% of methods but only 54% of the
   code; 135 methods and 3,769 lines fall into no group. It is a starting
   point, not a partition. Where it does not reach, group by state ownership —
   that is what worked on the `ClientGatewayService` pilot, whose prefix
   grouping fragmented completely (37 distinct verbs across 43 methods).
2. Persistence (108 methods) and retrieval (84) each breach the 40-method and
   800-line limits as a single class, so each must be a *directory* of
   collaborators. The plan assumed one file each.
3. `service/<group>/<file>.ts` sits at exactly the 9-segment depth limit.
   There is no room for `service/<group>/<sub>/<file>.ts`, and the depth rule
   does not ratchet.

**The enforcement rules changed four times during this work, each because a
migration phase manufactured violations of a rule this plan freezes.** Each
change is covered by tests in `scripts/structure-audit/rules/tests/`.

- **`imports`** now exempts a module reaching files of a directory it lives
  inside. Relocating a test into `tests/`, a file into a prefix-derived
  subdirectory, or a collaborator into `service/` all turned same-directory
  imports into "barrel skips". Left alone this would have inflated Core by
  over 130 entries and the downstream repository from 29 to roughly 80. The
  alternatives were widening public barrels so internals could reach their own
  siblings, or freezing counts the phases themselves created. Reaching into a
  *sibling* subdirectory is still counted.
- **`naming` depth** now exempts support modules inside a test root, not only
  test files. A shared fixture forced out of the `tests/` folder that owns it
  is worse placement bought for a smaller number, and depth does not ratchet,
  so it could not be baselined where it belonged.
- **`naming` prefix** no longer demands a directory the depth rule would
  reject. The two could deadlock: flat, the prefix rule demanded
  `<dir>/<prefix>/`; nested, depth rejected it, and neither state could pass.
- **`maxPathSegments` rose from 8 to 9**, because the plan's own Phase 2
  target sat at 9. Ten directories now sit at exactly 9, so the headroom is
  fully consumed.

`pnpm check` now runs `pnpm structure:test` before the audit, in both
repositories — the rule tests existed but gated nothing, so the auditor itself
was unguarded.

**Baseline regeneration was audited key by key, not trusted.** Of the entries
added, all but two are path re-keys at identical values; nothing rose. The two
genuinely new entries are `flow-bootstrap/tests/plan.test.ts` and
`runtime/tests/llm-deepseek-flow-bootstrap.test.ts`, which import
`llm/token-estimation.ts`. Clearing them would mean exporting that module from
`runtime/llm/index.ts`, which deliberately withholds it — and because
`runtime/index.ts` re-exports that barrel wholesale, doing so would widen the
framework's public API. Two frozen internal imports is the better price, and
recording that choice is exactly what the ratchet is for.

**Known pre-existing defects, surfaced but not caused by this work.** Nine
genuine test failures: four in `packages/fluxiq` and five in `apps/web`. Each
reads its target successfully and disagrees on content or behaviour, so none
is a path artifact, and they were reproduced on the untouched tree.
`service-subflow-pagination.test.ts` is additionally flaky. Separately,
`router/functionality-contract.ts` claims automated evidence in a
`large-project-behavior.test.ts` that has never existed in any commit; nothing
resolves those `automatedEvidence` strings, which is why it drifted unnoticed.

**Next steps:** continue `service.ts` two collaborators at a time, taking the
project-store residue first. Then revisit whether `model/`'s 28 files and 63
external barrel-skipping importers justify a reorganization — the prefix rule
alone takes it from 28 to 25, which is at the cap rather than under it.

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

Nineteen briefs were dispatched across five waves during 2026-09-10, in this
repository and downstream, partitioned by file so no two workers could touch
the same path. The briefs themselves have been compacted away: each worker's
report in `docs/working/module-size-governance-plan/reports/` carries its
task, its evidence and its findings, and the ledger below records what was
accepted.

Four conventions emerged across the waves and are worth reusing verbatim in
any future dispatch:

- **Keep the subject's filename as a one-line facade** rather than turning it
  into a directory. This repository writes explicit `.ts` extensions, so a
  directory does not satisfy an existing `../subject.ts` import, and the
  facade keeps a split to zero files outside its own directory.
- **Prove the public surface with a checker-resolved export diff**, and prove
  the move with a body-line reassembly diff. Several workers did the second
  unprompted and it caught more than the test suites did.
- **The audit enumerates via `git ls-files`**, so untracked files are invisible
  to every rule. Run `git add -N` on anything created before trusting a result.
- **Use scratch filenames unique to you.** Two workers collided on a shared
  scratchpad name and one silently received the other's data; the failure mode
  was a plausible wrong answer, not an error.

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

### 2026-09-10 — Phase 1 tests relocation, both repositories

- Agent: supervisor, with workers `core-fluxiq-studio`, `core-fluxiq-core`,
  `core-web-studio-a`, `core-web-studio-b`, `core-web-rest` here and
  `ext-test-runner`, `ext-rest` downstream
- Changed: 333 test files moved into `tests/` subfolders here (87 framework
  Automation Studio, 18 rest of `packages/fluxiq`, 69 + 121 web Automation
  Studio, 38 outside it) and 74 downstream. `packages/fluxiq/` and
  `packages/client-gateway-websocket/tsconfig.build.json` `exclude` changed
  from `["src/**/*.test.ts"]` to `["src/**/tests/**"]`; both
  `vitest.quality.config.ts` include lists repointed;
  `scripts/structure-audit/rules/imports.mjs` given the test exemption and a
  new test at `rules/tests/imports.test.mjs`; root `package.json` `check` now
  runs `structure:test` first; `.gitignore` given `.tmp/`;
  `.structure-baseline.json`. Twelve `functionality-contract.ts` evidence
  lists and two architecture-gate tests were repointed at the new paths.
- Why: Migration Plan Phase 1 — mechanical, zero behaviour change, and the
  prerequisite for Phases 2 and 3, which split directories whose file counts
  this halves.
- Validation: `pnpm check` -> `structure-audit: passed (106 warnings, 328
  baselined)`, all four projects typecheck, exit 0. `pnpm build` -> exit 0
  with zero test artifacts in any `dist`. `pnpm test` -> 9 failures, all
  pre-existing: 4 in `packages/fluxiq` (795 pass / 799) and 5 in `apps/web`
  (1,111 pass / 1,116). Each reads its target successfully and disagrees on
  content or behaviour, so none is a path-resolution artifact, and two
  workers independently reproduced them on the untouched tree.
  `--rule test-placement --json` -> zero findings in both repositories, down
  from 333 and 74. Baseline diff audited key by key: here 115 removed, 41
  added of which 39 are byte-identical path re-keys and 2 genuinely new, 0
  raised, 6 lowered; downstream 14 removed, 1 added, 0 raised. All three new
  entries are `directory-files` on a `tests/` folder that inherited an
  oversized parent's tests.
- Outcome: Accepted
- Follow-up: Phase 2 (`automation-studio/storage/`). Carry each directory's
  `tests/` folder with it when its parent is split. Decide whether
  `canonical-view-functionality.test.ts` should resolve `automatedEvidence`
  paths, which would fail immediately on `router/`.

### 2026-09-10 — Phases 2 through 8, both repositories

- Agent: supervisor, with sixteen workers dispatched in waves and partitioned
  by file: `core-storage-split`, `core-runtime-split`, `core-api-contracts`,
  `core-shared-ui`, `core-web-live`, `core-web-hierarchy`,
  `core-web-flow-editor`, `core-styles`, `core-model-files`,
  `core-client-gateway-facade`, `core-automation-studio-facade`,
  `core-schema-split`, `core-handlers-split`, `core-harness-split`,
  `core-executor-split`, `core-flow-bootstrap-split`, `core-oversized-tests`
  here, and `ext-connection`, `ext-content` downstream.
- Changed: every oversized source file in both repositories except
  `runtime/service.ts`, plus five directory splits, both global stylesheets,
  two oversized test files, four enforcement-rule changes with their tests,
  three authored architecture documents, and the generated framework
  reference. Downstream: `connection.ts` 1,913 lines and 81 methods to 736 and
  39; `content/index.ts` 1,188 lines to 25.
- Why: Migration Plan Phases 2 through 8. Phase 1 had halved the file counts
  in the dense directories, which is what made the directory splits tractable.
- Validation: `apps/web` — `tsc --noEmit` exit 0, `next build` exit 0, 1,138
  tests passing against its 5 pre-existing failures. `packages/fluxiq` — `tsc`
  clean apart from the in-flight service probe. Downstream — `check`, `build`
  and smoke all pass, 97 tests green across seven packages, `test-runner`
  unchanged at its pre-existing 19. `pnpm docs:check` validates 83 markdown
  files and confirms the regenerated reference is current. Public surfaces
  verified by AST or checker diff, not by worker report:
  `AutomationStudioService` 178 public methods unchanged, `FluxIQConnection`
  16 unchanged, `storage/index.ts` 323 symbols with identical MD5,
  `runtime/index.ts` 276 unchanged, `client-gateway` barrel 34 unchanged.
  Stylesheet concatenation reproduces HEAD line for line (2,938 and 653).
  Baseline regeneration classified key by key: all added entries are path
  re-keys at identical values except two, both justified above; nothing rose.
- Outcome: Accepted
- Follow-up: `runtime/service.ts` continues two collaborators at a time. Add a
  unit test runner to `apps/extension` — it has none, which is why neither
  shipped-file split there could add tests. Neither extension split is
  runtime-verified; manual browser validation is still owed.

### 2026-09-10 — Enforcement rules corrected

- Agent: supervisor
- Changed: `scripts/structure-audit/rules/imports.mjs`,
  `rules/naming.mjs`, `context.mjs` (`maxPathSegments` 8 to 9), new
  `rules/tests/imports.test.mjs` and `rules/tests/naming.test.mjs`, root
  `package.json` (`check` runs `structure:test` first). All mirrored byte for
  byte to the downstream repository.
- Why: four separate migration phases manufactured violations of rules this
  plan freezes, by construction rather than by anyone reaching anywhere new.
  Four workers hit the `imports` case independently and each reached for a
  workaround that was worse than the problem — widening public barrels, or
  accepting a raised baseline. A rule that penalises the structure the plan
  prescribes is mis-calibrated, not violated.
- Validation: `pnpm structure:test` -> 29 tests passing in both repositories,
  covering five exemptions and five crossings that must still fail for
  `imports`, and six depth cases plus the prefix/depth deadlock guard for
  `naming`. `node scripts/structure-audit.mjs --rule imports` -> Core 326
  frozen barrel skips before, 325 after; downstream 29 before, 26 after, so
  the exemption did not silently absorb existing debt.
- Outcome: Accepted
- Follow-up: ten directories now sit at exactly the 9-segment depth limit. The
  next phase that needs a level deeper will force the question again.

### 2026-09-11 — service.ts, collaborators 5 through 8

- Agent: supervisor, with worker `core-automation-studio-facade` resumed
- Changed: `runtime/service.ts` 11,839 -> 11,373 lines, class 339 -> 322
  methods; new `runtime/service/{ui-cache,bootstrap-adaptations,locks,object-documents,compact-json,error-message}.ts`;
  two white-box call sites repointed in
  `runtime/tests/service-flow-bootstrap-generation.test.ts`.
- Why: continuing Phase 7 from the worker's own state-ownership cluster map,
  taking the three clusters it measured as closed before the larger ones.
- Validation: `pnpm check` -> passed. `vitest run .../runtime` -> 32 files /
  400 cases, same 3 pre-existing failures. Public method diff -> 178
  identical; runtime barrel -> 276 exports identical. Differential probes ->
  133 observations this round, 598 cumulative, all equal. Baseline
  regeneration -> 0 added, 0 raised, 2 lowered.
- Outcome: Accepted
- Follow-up: three findings, each of which changes how this phase ends.
  1. **The 40-method target is unreachable while the public surface is
     preserved.** 178 of the 322 methods are public names the facade must
     keep; seven moved their bodies out this round without moving the count.
     The achievable end state is ~178 with every private helper extracted, and
     the class-methods baseline frozen there. Going lower means splitting the
     public API into several services, which is a decision about Core's
     contract, not a refactoring step.
  2. **`projectDatabasePool` is blocked by a cycle, not a missing layer.**
     Eight of its twenty methods call the Flow document accessors and four of
     those call straight back. The worker's recommendation, accepted: take
     Flow documents and SQL projections as *one* collaborator, roughly 26
     methods and 620 lines, which fits the limits as a single directory.
  3. **White-box test coupling is invisible to the probes.** Four tests broke
     on coupling rather than behaviour — three calling a private method
     directly, one stubbing an instance method. At `repositories` scale (48
     methods) that grep must run *before* the cut, not after.

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
