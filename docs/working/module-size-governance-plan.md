# Module Size Governance Plan

Status: Active
Status detail: Enforcement implemented and wired into `pnpm check`; the
decomposition and directory reorganization backlog is recorded but not
started.
Created: 2026-09-10
Last updated: 2026-09-10
Owner: Senior supervisor agent
Scope: Preventing unbounded file, class, and directory growth across FluxIQ
Core and the downstream web-extension repository, and reorganizing what has
already grown past maintainability.
Paired document: `F:\!FluxIQWebExtension\docs\working\module-size-governance-plan.md`
Related: [AGENTS.md](../../AGENTS.md),
[agent working document protocol](./agent-working-doc-protocol.md)

This document owns the shared policy. The downstream paired document
references it rather than restating it.

---

## Current State

**Enforcement is live.** `scripts/structure-audit.mjs` runs as the first step
of `pnpm check`, so it blocks rather than advising. `.structure-baseline.json`
records every existing violation. Verified behaviour: a clean tree passes with
exit 0; adding two lines to a baselined file fails with exit 1; a new 801-line
file fails with exit 1.

**Audit complete.** Across 1,367 tracked files:

- **16 source files exceed 800 lines**, the largest being `service.ts` at
  12,482.
- **11 directories exceed 25 source files**, the worst being
  `automation-studio/storage` at 72 and `automation-studio/runtime` at 66.
- **2 classes exceed 40 methods**: `AutomationStudioService` (~365 by the
  audit's heuristic, 419 by direct count) and `ClientGatewayService` (42).
  Four more sit between 27 and 30.

`ClientGatewayService` is the useful catch: at 746 lines it passes every
line-based rule while carrying 42 methods. Line count alone would never have
found it, which is why the method rule exists.

**Not done**

- No file has been split. No directory has been reorganized.
- The downstream repository has not adopted the audit script yet.
- The method-count rule is advisory. It uses a regex heuristic, not a
  TypeScript parse, so it warns rather than failing.

**Next steps**

1. Adopt the audit in the downstream repository, reusing this script rather
   than writing a second one.
2. Reorganize `automation-studio/storage` — the highest-value, lowest-risk
   target, since the filenames already encode the intended folders and
   barrels keep imports stable.
3. Decompose `service.ts` per [Pathology 1](#pathology-1--god-class), timed
   per [Timing](#timing).

**Blockers:** none.

---

## Enforcement

### The ratchet

Budgets are ratcheted, not absolute. Existing violations are permitted but
frozen; new ones are refused. This stops degradation immediately without
requiring a large refactor first, and makes the problem strictly monotonic —
it can only improve.

| Rule | Warn | Fail |
| --- | --- | --- |
| File lines | 400 | 800 |
| Directory source files | 15 | 25 |
| Class methods | 25 | advisory only at 40 |

- A file or directory absent from the baseline must satisfy the limit.
- A baselined entry may never exceed its recorded value, but may shrink.
- When something shrinks, `pnpm structure:baseline` rewrites the entry
  downward. The writer takes `min(previous, current)`, so an entry can never
  be raised, even by accident.
- Scope: tracked `.ts`, `.tsx`, `.js`, `.jsx`, `.mjs`, `.cjs`, `.css`,
  excluding `node_modules`, build outputs, generated docs, snapshots, and
  `.d.ts`.

### Why enforcement rather than guidance

A rule against this already existed. `AGENTS.md` states: "Split modules when
a file owns unrelated behavior, crosses multiple architectural
responsibilities, or becomes difficult to understand, test, replace, or debug
independently. Do not accumulate unrelated functionality in broad catch-all
files."

That instruction was in force for all 43 commits during which `service.ts`
grew to 419 methods. Written guidance has been empirically falsified as a
control here, so the response is a check that fails a build, not a
better-worded rule.

### Commands

```bash
pnpm structure:check      # audit only
pnpm structure:baseline   # ratchet the baseline downward after improvements
pnpm check                # audit, then per-package checks
```

---

## Audit Results

### Files over 800 lines

| Lines | File | Pathology |
| --- | --- | --- |
| 12,482 | `automation-studio/runtime/service.ts` | 1 — god class |
| 4,790 | `automation-studio/runtime/service.test.ts` | 6 — test mirror |
| 3,396 | `apps/web/src/app/styles/global-foundation.css` | 5 — stylesheet |
| 2,094 | `automation-studio/api/handlers.ts` | 2 — giant functions |
| 1,161 | `automation-studio/runtime/llm-harness.ts` | 2 / 3 — mixed |
| 1,135 | `automation-studio/api/handlers.test.ts` | 6 |
| 1,087 | `apps/web/src/features/programs/shared-ui.tsx` | 4 — 37 components |
| 1,004 | `runtime/service-flow-bootstrap-generation.test.ts` | 6 |
| 977 | `automation-studio/api/contracts.ts` | 3 — 112 types |
| 962 | `apps/web/e2e/automation-studio-render-loop.spec.ts` | 6 |
| 958 | `automation-studio/runtime/flow-bootstrap.ts` | 2 / 3 — mixed |
| 945 | `programs/global-services.test.ts` | 6 |
| 934 | `automation-studio/model/validation.ts` | 2 — 28 functions |
| 931 | `automation-studio/storage/project-schema.ts` | 3 — 21 consts |
| 876 | `automation-studio/runtime/executor.ts` | 2 — 3 functions |
| 823 | `automation-studio/model/fixtures.ts` | 3 |

### Directories over 25 source files

| Files | Directory |
| --- | --- |
| 72 | `packages/fluxiq/src/programs/automation-studio/storage` |
| 66 | `packages/fluxiq/src/programs/automation-studio/runtime` |
| 56 | `apps/web/src/features/automation-studio/hierarchy` |
| 49 | `apps/web/src/features/automation-studio/live` |
| 43 | `apps/web/src/features/automation-studio/flow-editor` |
| 37 | `packages/fluxiq/src/programs/automation-studio/model` |
| 30 | `apps/web/src/features/automation-studio/views` |
| 29 | `apps/web/src/features/automation-studio/model` |
| 28 | `apps/web/src/features/automation-studio/recordings` |
| 27 | `apps/web/src/features/programs` |
| 26 | `apps/web/src/features/automation-studio/testing` |

Note that `runtime/` holds both the 12,482-line file and 66 flat siblings.
That combination is diagnostic: things were extracted from the god file
over time and dropped next to it, because no folder existed to put them in.
Fixing file size without fixing directory structure would reproduce exactly
this outcome at a larger scale.

---

## How To Divide: Six Pathologies

Large files are not all large for the same reason, and the right split
differs. Diagnose before cutting.

### Pathology 1 — God class

*Symptom:* one class, very many methods. `AutomationStudioService`
(419 methods), `ClientGatewayService` (42).

*Fix:* a thin facade over focused collaborators. The class keeps its public
surface exactly; each concern group becomes a collaborator the facade
delegates to. Method-name prefixes reveal the groups:

| Concern | Methods | Prefixes |
| --- | --- | --- |
| Persistence | 108 | `write` 39, `read` 25, `delete` 25, `save` 14, `append` 9 |
| Retrieval | 84 | `list` 51, `get` 33 |
| Flow domain | 32 | `flow` |
| Validation | 22 | `ensure` 14, `assert` 7 |
| Lifecycle | 15 | `apply` 8, `review` 4, `migrate` 4 |
| Recording | 7 | `recording` |
| Binding | 7 | `bind` |
| Project | 6 | `project` |

Preserving the public surface matters: `service.ts` is imported by at least
`automation-studio/api`, `client-gateway`, `background-tasks`,
`compute-control`, `database-manager`, and `deployment-sync`. A facade split
touches none of them. Changing the surface would turn a background task into
a migration.

Extract persistence first — largest, most mechanical, least entangled with
flow semantics. Then retrieval. Domain groups last.

### Pathology 2 — Giant function bodies

*Symptom:* few exports, many lines. `handlers.ts` is 2,094 lines with 3
exported functions; `executor.ts` is 876 with 3; `validation.ts` is 934
with 28.

*Fix:* extract named steps into sibling modules. The exported function
becomes a readable sequence of named calls. This is the lowest-risk split of
all, since the extracted helpers are private and no consumer sees a change.

### Pathology 3 — Declaration dumps

*Symptom:* very many type or const exports. `contracts.ts` has 112 exported
types; `project-schema.ts` has 21 exported consts; `fixtures.ts` similar.

*Fix:* split by domain noun into a directory, with `index.ts` re-exporting
everything. Import paths stay identical because consumers already import
from the module path. This is the cheapest split in the list and should be
done first wherever it applies.

A caveat: a large type module is genuinely less harmful than a large
behaviour module. Prioritize accordingly.

### Pathology 4 — Multi-component modules

*Symptom:* many React components in one file. `shared-ui.tsx` has 37
components in 1,087 lines.

*Fix:* one component per file in a directory named for the group, plus a
barrel. This is the clearest instance of the one-thing-per-file rule and
needs no judgement.

### Pathology 5 — Monolithic stylesheets

*Symptom:* `global-foundation.css` at 3,396 lines, `global-programs.css` at
764.

*Fix:* split by section into a directory and compose with `@import`, or
concatenate at build time. Note the codebase already does this well
elsewhere — `features/automation-studio/styles/flow-editor/02-palette-actions.css`
shows an established numbered-section convention. Apply the existing pattern
rather than inventing one.

### Pathology 6 — Test files mirroring an oversized subject

*Symptom:* `service.test.ts` at 4,790 lines, and four more test files over
900.

*Fix:* these shrink as a consequence of splitting their subject. Do not
split them independently — a test file reorganized apart from the code it
covers loses the correspondence that makes it navigable. They are baselined
and frozen; they will fall out of the ratchet as their subjects are divided.

---

## Deterministic File Structure

The size limit stops files growing. It does not say where new files go, and
without that, splitting a god file just produces the flat 66-file directory
next to it. These five rules make placement deterministic.

### Rule 1 — One exported thing per file

A file exports one class, one component, or one cohesive function group.
Types used only by that thing live beside it; types shared across the
directory live in a sibling `types.ts`. The filename is the thing's name in
kebab-case.

### Rule 2 — A shared filename prefix becomes a directory

When three or more files in a directory share a `noun-` prefix, that prefix
becomes a subdirectory and is stripped from the filenames.

```text
storage/project-hierarchy-feed.ts          storage/project/hierarchy/feed.ts
storage/project-hierarchy-mutations.ts  →  storage/project/hierarchy/mutations.ts
storage/project-hierarchy-repository.ts    storage/project/hierarchy/repository.ts
```

This is the important rule, and it is not an imposed taxonomy. The prefixes
are groupings the team already chose and encoded in filenames because no
folder existed to hold them. `storage/` alone contains `project-hierarchy-*`
(7), `project-*` (7), `project-content-*` (4), `project-flow-resource-*` (3),
and a dozen two-file pairs. Applying the rule mechanically derives the
directory structure from intent already expressed, which is why it is safe
to apply without redesigning anything.

### Rule 3 — Directories cap at 25 source files

Enforced. Warn at 15. A directory approaching the cap is a signal to apply
Rule 2, not to raise the cap.

### Rule 4 — Every directory has a barrel

`index.ts` re-exports the directory's public surface, and imports target the
directory rather than individual files. 71 barrels already exist, 23 within
`automation-studio`, so this is established practice rather than a new
convention.

Barrels are what make Rule 2 cheap: moving `project-hierarchy-feed.ts` to
`project/hierarchy/feed.ts` changes no consumer, because consumers import
from `storage`. Reorganization becomes a local operation.

### Rule 5 — Layer, then feature, then file

The existing layer taxonomy — `programs/<program>/{api,model,runtime,storage,
client-gateway}` — is sound and stays. The failure is that within a layer
everything is flat. The feature level from Rule 2 goes between them:

```text
programs/automation-studio/
  storage/
    project/
      hierarchy/{feed,mutations,repository}.ts
      content/{store,protection}.ts
      event/{chunk-store,stream-writer}.ts
      object/{index-migration,repository}.ts
      flow-resource/{mutations,repository}.ts
      index.ts
    catalog/
    index.ts
  runtime/
    llm/{provider,run,evidence,execution,deepseek,harness}/
    flow/{bootstrap,...}/
    service/            <- the decomposed facade and collaborators
    {router,policy,pipeline,region,state,io,training}/
    index.ts
```

Current nesting reaches 7 levels. This adds one where it applies. Cap depth
at 8; past that, the layer split is probably wrong.

---

## Timing

The ratchet is already in place and carries no product risk — install-and-
forget. The reorganization is a different question during an MVP cycle.

Core's own refactor rule permits refactoring when architecture prevents a
requirement, causes serious reliability problems, produces active bugs, or
makes required functionality unreasonably hard to add. Directory
reorganization under Rules 2 and 4 is close to zero-risk because barrels
absorb the moves, and can proceed whenever convenient. Decomposing
`service.ts` is a different matter: it is the class every program imports,
and doing it mid-MVP trades delivery risk for maintainability that is not
currently blocking anything.

Recommended order:

1. **Now:** the ratchet. Done.
2. **Now, safe:** Pathology 3 splits (declaration dumps) and Rule 2
   reorganization of `storage/`. Both are mechanical and barrel-protected.
3. **Opportunistic:** Pathology 2 and 4 splits when a task already requires
   substantial edits in the file.
4. **Post-MVP, or when a task forces it:** Pathology 1, starting with
   persistence.

---

## Work Ledger

### 2026-09-10 — Plan authored

- Agent: supervisor
- Changed: this document and its downstream pair.
- Why: A 12,482-line, 419-method class reached production while an
  instruction forbidding exactly that was in force.
- Validation: measurements taken directly across both repositories. Plan
  only, so no code check applied.
- Outcome: Accepted
- Follow-up: Implement the ratchet.

### 2026-09-10 — Full audit and enforcement implemented

- Agent: supervisor
- Changed: `scripts/structure-audit.mjs` (new),
  `.structure-baseline.json` (new), `package.json`, this document.
- Why: The user required a full Core audit and a hard 800-line limit rather
  than deferring the problem.
- Validation: `node scripts/structure-audit.mjs` on a clean tree -> exit 0,
  71 warnings. Appending two lines to `model/fixtures.ts` -> `FAIL ... 825
  lines exceeds its baseline of 823`, exit 1. A new 801-line file ->
  `FAIL ... exceeds the 800-line limit for new files`, exit 1. Both probes
  reverted; tree clean afterwards. `pnpm structure:check` -> exit 0.
- Outcome: Accepted
- Follow-up: Adopt the script downstream; reorganize `storage/` under
  Rule 2.

---

## Open Questions

- **Should the method-count rule become blocking?** It is a regex heuristic
  — it counted 365 methods where a direct count found 419 — so it currently
  warns. Making it blocking needs a real TypeScript parse. Owner: senior
  supervisor agent.
- **Should test files have a higher ceiling?** They are baselined and will
  shrink with their subjects, so no separate ceiling is proposed yet.
  Owner: senior supervisor agent.
- **Should the audit also enforce the working-document 800-line compaction
  threshold?** Both are size ratchets over tracked files, currently
  unrelated mechanisms. Owner: senior supervisor agent.
