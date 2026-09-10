# Module Size And Structure Governance Plan

Status: Active
Status detail: Enforcement live; methodology published; the migration
phases below are sequenced but not started.
Created: 2026-09-10
Last updated: 2026-09-10
Owner: Senior supervisor agent
Scope: Preventing unbounded file, class, and directory growth in FluxIQ Core
and the downstream web-extension repository, relocating tests to `tests/`,
and reorganizing what has already grown past maintainability.
Paired document: `F:\!FluxIQWebExtension\docs\working\module-size-governance-plan.md`
Related: [code structure](../architecture/code-structure.md),
[AGENTS.md](../../AGENTS.md)

This document owns the shared policy and the Core migration. The
methodology itself is authored in `docs/architecture/code-structure.md`;
this document tracks applying it.

---

## Current State

**Enforcement is live.** `scripts/structure-audit.mjs` runs first in
`pnpm check`. `.structure-baseline.json` freezes 16 files and 11 directories.
Verified: clean tree exits 0; two lines added to a baselined file exits 1; a
new 801-line file exits 1.

**Methodology is published** at `docs/architecture/code-structure.md`:
placement as ownership / layer / feature / kind, the prefix-becomes-directory
rule, per-directory `tests/` subfolders, and the six division pathologies.
`AGENTS.md` carries the binding summary and links it.

**Audit, 1,367 tracked files:** 16 source files over 800 lines (largest
`service.ts`, 12,482); 11 directories over 25 files (largest `storage/`, 72);
2 classes over 40 methods (`AutomationStudioService` ~365–419,
`ClientGatewayService` 42). 347 test files, 333 of them co-located.

**Decisions taken**

- Tests move into a `tests/` subfolder of the directory that owns their
  subject — no separate mirrored tree. Loose co-location roughly doubled the
  file count in every dense directory (`storage/` was 37 source + 35 tests).
- `programs/automation-studio/testing/` and `client-gateway/testing/` stay
  in `src`: both are re-exported from public barrels.
- The prefix rule alone brings `storage/`, `runtime/`, and `model/` under
  the cap. No kind split is needed on the framework side.
- `service.ts` is decomposed last, behind a facade that keeps its public
  surface, because every program imports it.

**Next steps:** Phase 1 (tests relocation), then Phase 2 (`storage/`).

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
