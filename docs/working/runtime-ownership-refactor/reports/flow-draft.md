# Reusable draft mechanisms implementation

Outcome: Done. SOURCE FROZEN. Heavy worker, gpt-6.1-sol Max.

Moved the real closed draft subsystem from Automation Studio to
`packages/fluxiq/src/runtime/flow-authoring/draft/`. This includes its algorithms,
not only contract aliases. The original 54 production modules are now focused
single-authority leaves and feature barrels: 204 production modules, comprising
163 authority leaves and 41 barrels, approximately 3,009 lines. The largest
canonical production module is 209 lines. Historical/browser run comments were
removed from neutral mechanisms; active legacy wording lives in the explicit
compatibility presentation.

## Ownership and actual behavior

Canonical feature groups own draft documents, step records and eligibility,
binding forms/rendering/inputs, amendments, stable numbering and routing,
replay/refusal bookkeeping, conditional/excused handling, carried saved steps,
scheduled candidates, and opaque route places. Stable IDs, configuration/replay
invalidation, complete metadata projections, private performed proof and
scheduled-candidate correspondence are preserved. Shared private WeakMaps moved
as single authorities rather than becoming per-function copies.

The production closure uses Core JSON, existing canonical component binding
functions and the canonical consequence classification. It does not import a
Studio program, service, persistence adapter or downstream/browser module.
No whole-service `Pick`, raw store, copied binding parser or permission table
was introduced.

The old `programs/automation-studio/runtime/flow-draft/**` feature remains a
compatibility surface. Pure leaf exports forward explicitly through canonical
feature barrels; all pure public implementation identities are asserted.
Four text-rendering functions bind the compatibility presentation. The legacy
amendment schema constant likewise binds exact compatibility descriptions.

The narrow destructive predicate/table/list/selection authority moved to
`runtime/action-permissions/destructive/{classification,list,predicate,select,index}.ts`.
The old Studio leaf is an exact facade. The complete five-class classification
is unchanged; the predicate now uses equality against that vocabulary instead
of inherited object-property membership. `toString`, `constructor`,
`__proto__` and other unknown values can no longer read as destructive classes.
Its new tests cover the full classification, stable order, deduplication and
hostile property names. No second classification table exists.

## Explicit presentation contracts and exports

The lead added the parent `runtime/flow-authoring/index.ts` and public
`fluxiq/runtime/flow-authoring` entry. Its feature barrel exposes these actual
canonical mechanisms and the following types. No additional public package
subpath is needed for this unit. The lead also integrated
`runtime/action-permissions/index.ts -> destructive/index.ts`.

```ts
interface DraftPresentation {
  entryInstruction(input: DraftEntryInstructionFacts): string;
  fullRunRequired(input: { nothingRan: boolean }): string;
  dryRunInstruction(): string;
  excused(input: DraftExcusedFacts): string;
  missingPredecessors(input: DraftPredecessorFacts): string;
  withdrawal(input: DraftWithdrawalFacts): string;
}
```

Each fact/port has one exported leaf under `draft/presentation/`:

- Entry facts: authored/transcript mode; whether bindable values, a replaced
  attempt or a checked candidate are present; none/named/open route kind.
- Excused facts: the existing excuse reason, non-replayed status and optional
  withheld predecessor number.
- Predecessor facts: the ordered missing step numbers and target step number.
- Withdrawal facts: absent partner, or the paired/unpaired positions and prior
  chosen state. No private control key, input, graph or evidence reaches text.

Canonical function signatures require their exact presentation subset:

```ts
automationStudioFlowDraftEntry(input, presentation /* entryInstruction, withdrawal */)
automationStudioFlowDraftFullRunRequiredFeedback(steps, presentation /* fullRunRequired */)
automationStudioFlowDraftExcusedWords(outcome, presentation /* excused */)
automationStudioFlowDraftDryRunFeedback(
  verdict,
  presentation /* dryRunInstruction, excused, missingPredecessors */,
  told = new Set(),
  steps?
)
```

These are required typed inputs; no browser instruction is a canonical fallback.
The old function signatures are unchanged and supply the compatibility policy.
Full projection, including every step and arbitrarily large arguments, remains
the canonical mechanism's responsibility rather than the presentation's.

`AUTOMATION_STUDIO_FLOW_DRAFT_AMENDMENT_SCHEMA` canonically owns validation
structure without model-facing descriptions.
`automationStudioFlowDraftAmendmentSchema(descriptions: DraftAmendmentDescriptions): JsonObject`
requires a complete typed map of its twelve property descriptions (`step`,
`change`, `settings`, `to`, `input`, `check`, `through`, `over`, `while`, `most`,
`act`, `place`). Presentation can supply those words without changing validation
rules. The legacy schema constant is constructed with the exact old map.

Compatibility assessment: schema/wire/tool/issue strings and old public
signatures remain intact. Pure old/new exports have identical identity. The
four presentation-bound functions and presentation-bound schema constant are
intentional identity exceptions; their complete output bytes are fixed against
values captured before extraction. New canonical consumers explicitly provide
presentation and obtain the neutral schema shape or its presented construction.

The compatibility presentation still contains these browser-flavoured clauses,
ready for the later trusted downstream registration cut: getting to/dismissing
page controls; chooser/drawer/menu preparation; cookie/sign-up popup examples;
consent/sign-in site memory; dialog/banner/panel interruption examples;
page-position predecessor explanations; the page's choice/press wording in
withdrawal and amendment descriptions. Those clauses are no longer implicit
neutral runtime policy. Existing opaque codes such as `core.dry_run.page`
retain their original spelling.

## Preserved tests and permanent enforcement

All 34 original draft test files and the original destructive integration suite
remain, with substantive assertions retained. Twenty pure draft subject suites
moved with their canonical owners. Fourteen suites combining legacy wording,
Studio seeding/loops or schema presentation remain under the old feature;
their actual mechanism calls delegate to the new authority. The complete
mixed amendment/schema suite stays in Studio because its wording assertions
belong to compatibility. Two binding test helpers now use truthful `JsonObject`
inputs instead of `as never`, preserving their refusal oracles.

New coverage adds neutral presentation/projection, complete schema behavior,
old facade identity, exact before-extraction bytes, the destructive guard and
permanent source structure checks. The latter follows import/export,
import-type and dynamic import nodes transitively from every canonical source
and test, proving no program reach. It also asserts exactly one exported
authority in each draft/destructive production leaf. Canonical tests never
import Studio.

Byte checks cover 26 complete draft projections across authored/transcript,
route/bindable/replaced/checked branches; both full-run refusal forms; all
excuse reasons/statuses; replay feedback metadata; all withdrawal branches;
and the entire presented amendment schema. Expected hashes are fixed values
captured before moving the implementation, not rebuilt from the producer at
test time. Existing stable-ID, replay, priorExecution.lasting, candidate identity,
binding ordering, duplicates, reversal/strand, full projection and text assertions
also continue to pass.

## Validation

Commands ran only in current t843 Core, without building or changing frozen
Core dist:

```text
pnpm.cmd --filter fluxiq exec vitest run src/programs/automation-studio/runtime/flow-draft src/programs/automation-studio/runtime/action-permissions/tests/destructive.test.ts
-> Before migration: exit 0; 35 files, 365 tests passed; 23.86s.

pnpm.cmd --filter fluxiq exec vitest run src/runtime/flow-authoring/draft src/programs/automation-studio/runtime/flow-draft src/runtime/action-permissions/destructive src/programs/automation-studio/runtime/action-permissions/tests/destructive.test.ts
-> Final: exit 0; 40 files, 384 tests passed; 31.09s.

node --max-old-space-size=4096 .fluxiq/refactor/flow-draft/typecheck.cjs
-> Exit 0; strict diagnostics for 313 owned source/test files: 0 errors.

node .fluxiq/refactor/flow-draft/structure.mjs
-> Exit 0; 14 scoped structural rules, 0 failures, 4 advisory warnings, 3 unchanged legacy-test baselines.
```

The strict probe uses the actual package compiler options, including strict,
exact optional properties and unchecked index access, and checks owned files
with their real source dependencies. It is not a whole-package typecheck claim.
The scoped structural probe includes imports, cycles, module reach, naming,
budgets, casts, statement packing, test placement and failure handling.

An intermediate single-export split exposed a private `INDEX` pattern colliding
with a generated barrel filename, producing seven focused failures. The
pattern now has its own `bindings/index-pattern.ts` authority, the back-edge was
removed and feature imports were corrected. Strict diagnostics and the final
complete selection pass. No test oracle was loosened to make that split pass.

No baseline was transferred, raised or added. The three suppressed findings
remain in the same legacy compatibility tests: three existing `as never` uses
in entry, and one packed line each in dry-run and verify-only. The four advisory
warnings concern the legacy entry/amendment test lengths and legacy facade
directory counts; new canonical production modules stay below every budget.
The moved production/test packed lines and two binding casts were corrected
instead of relocating their baseline entries.

Ignored evidence: `.fluxiq/refactor/flow-draft/{before,after-initial,after-split,final-tests,typecheck,structure}.log`,
`structure.json`, fixed before-byte snapshots and scoped scripts. The final
structural/strict/test results were independently observed by this worker;
the lead remains responsible for integration verification.

## Handoff and limits

SOURCE FROZEN. Changes are confined to the briefed old/new draft trees, the
briefed destructive feature/facade/test paths, this report and ignored probes.
No package exports, parent barrels, configuration, shared working document,
service, candidate/retest/admission, indexing, IO/native/gateway or git change
was made by this worker. Parent/public wiring was performed by the lead.

No whole build, whole suite, provider, browser, panel or real user data was used.
Normal built-package and downstream acceptance awaits the lead's source-batch
build. The separately authorized carried-start fixture correction is documented
in `reports/current-carried-start-regression.md`; its normal guarded acceptance
also remains queued behind that build. That pending integration is not claimed
as verified by the source-focused checks above.
