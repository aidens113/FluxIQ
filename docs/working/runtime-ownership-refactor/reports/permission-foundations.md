# Permission foundation extraction handoff

Outcome: Done for the released permission extraction. Owned source is frozen. Actual neutral declaration/gate/effect-floor/assessment/instruction mechanisms now live in canonical runtime owners; executable data has one authority, legacy APIs remain adapters/reexports, and Studio retains model/provider/accounting/person/rerun assembly. Focused acceptance passed 26 files/273 tests; the final requested canonical browser client then passed its affected 2 files/6 tests. Final strict, source/erased closure, structure and whitespace checks pass. The accepted discovery plan below is historical context; implemented details and exact final commands are at the end.

## Actual authority and boundary

The neutral mechanism is still in `programs/automation-studio/runtime/action-permissions/**`: declaration validation, non-lowerable client effect floors, run permission/decline/undo state, bounded evidence naming, declaration records/cross-checks, instruction quote/digest grounding, route quote spans and once-read observation. These can move to `runtime/action-permissions/**` against canonical executable data and action-effect contracts.

Already canonical, and to remain single authorities:

- `runtime/action-permissions/destructive/**` owns the destructive set/classifier. The old `destructive.ts` is compatibility only. Do not move, duplicate or reinterpret this set.
- `runtime/action-permissions/consequences.ts` forwards to `components/automation/action-effect/consequences/**`; old Studio consequences are aliases. Keep that one vocabulary/order/parser.
- `components/automation/action-effect/**` owns resolved client-floor validation/resolution/combination; old `nodes/action-effect/index.ts` already forwards there. New neutral permissions must import the actual canonical owner rather than the Studio alias.
- `runtime/action-permissions/request.ts` already owns the wire request/parser/name bounds and legacy sentence formatter. Its public compatibility symbols and request bytes must remain. New neutral gate code should receive request presentation through a trusted adapter port, rather than copying its UI wording or introducing another request parser.

`service/execution-authority/create.ts` is already a narrow Studio assembly: it creates one Flow-bootstrap permission boundary, wires that exact boundary into person-needed handling with combined signals, then supplies the same permission/generation/runtime/binding objects to C's prior-node rerun authority. It is not a second permission algorithm. Keep this assembly in Studio; do not move its native runtime, FlowScope, draft replay code or C interfaces into a canonical policy module.

`service/instruction-authority.ts` has a real reusable subset: a single shared promise for `derive` and `route.read`, `route.peek` that never sends, original failure retention, and distinct unavailable/non-complete route outcomes. Its actual project/Flow instructions, provider/harness request, act extraction and usage accounting are Studio assembly and stay there. Extract the once-reader behind `read(): Promise<InstructionReading>`; keep the harness adapter and usage object in Studio. A refused-unsent read increments neither calls nor tokens; an attempted call is counted once. Do not move `Parameters<typeof runAutomationStudioLlmHarness>` into the new contract.

## Approved source ownership

| Current owner paths | Concrete cut |
| --- | --- |
| Studio `runtime/action-permissions/{declaration,declaration-required,projection,declared,cross-check,gate}.ts` | Canonical declaration/effect validation and projection, declaration-required metadata rule, records/cross-check and run gate. Split exported DTOs from mechanisms and the denied check from the gate class; preserve every old symbol through an alias or a Studio presentation adapter. |
| Studio `runtime/action-permissions/assessment-observation/**` | Canonical private assessment context, original ticket/event identities, deny-only veto and effect projection. Split the six type authorities into leaves. Preserve the exact existing cross-bundle `Symbol.for("fluxiq.automation-studio.action-assessments.v1")` store and alias it from the old owner; create no parallel registry. |
| Studio `runtime/action-permissions/plan/{source,resolve,projection,index}.ts` | Canonical trusted-definition/effect resolver and plan projection against executable node contracts. Preserve resolution before parameter rewriting and the client's full non-lowerable floor. A legacy adapter translates `{key,definitionId,definitionVersion}` and calls the original registry/resolver with its receiver. |
| Studio `runtime/action-permissions/instructed.ts`, `instruction-quote/**`, `instruction-route/**`, `instruction-reading/**` | Canonical instruction digest/grounding, per-act unanswered semantics, Unicode comparison/span mapping, route/set digest/currentness, reading/schema composition. Keep actual web interpretation and model-call assembly outside these leaves. Grounded route data never proves a waypoint was visited. |
| Studio `runtime/action-permissions/{index,request,consequences,destructive}.ts` and `client/index.ts` | Compatibility surfaces, without duplicate implementations or changed browser-visible vocabulary. Existing canonical destructive/consequence authority remains untouched. |
| Studio `runtime/service/instruction-authority.ts` | Adapt the unchanged actual model/harness call to the canonical once-reader. Preserve original usage object, trigger points, one-call coalescing and thrown error identity. |
| Studio `runtime/service/execution-authority/{create,index}.ts` | Keep as program assembly. Edit only imports/explicit narrow adapter composition if the extraction requires it; do not alter C/B/A2 behavior or ownership. |

New mechanism owners: `runtime/action-permissions/{declaration,gate,assessment,plan,instruction}/**`, with cohesive nested quote/route/reading/once leaves and barrels. No new source leaf should mix unrelated ports or exceed the existing budgets.

New pure data owners: `flows/executable/permissions/**` for declaration/read/verdict/record/instructed-text/route reading data. Reuse the existing action-effect and consequence contracts. To avoid a data-to-runtime edge or duplicate action/request types, split required data declarations from the existing canonical `runtime/action-permissions/request.ts` into executable leaves, and keep that file as the same parser/public reexport surface. Its presentation compatibility function remains one existing authority; Studio's trusted presenter calls it. Do not copy the request schema/version constant or make executable data import Studio/runtime implementation.

Lead-owned or excluded: service.ts, `_shared/runtime.ts`, root/package barrels, SQL and command observer/handling owners, execution/admission, C's trials/LLM/cache, B's actual producer files, all downstream sources and shared working documents. Existing authored schema/prompt wording is not rewritten during a neutral ownership move.

## Stable narrow interfaces

1. **Gate input/facts**: recognized permitted consequence strings, stage, instruction IDs, grounded instructed entries or one `deriveInstructed` callback, `endsOnRequest`, clock/request-ID callbacks, and trusted request presentation. The gate still alone decides permission and grants only the matching outstanding request's missing classes. Presentation receives already bounded request facts, not private/raw evidence or permission mutation access.
2. **Observed evidence**: opaque/JSON evidence or the tiny existing `{kind:"llm_evidence_tool_execution",evidence}` envelope shape; remove the erased import of the full Studio LLM execution result. Evidence only grounds carried names; it never grants permission. Preserve the 4,000,000-character newest-first window, latest over-budget string behavior, normalization, name bounds and unsafe-name withholding.
3. **Plan effect source**: an optional narrow definition lookup and/or original effect resolver over the canonical executable node/parameters. Never accept plan metadata as a floor, instantiate a new registry, or import `AutomationStudioNodeRegistry`/`AutomationStudioFlowNode` into the neutral owner. Keep callable/receiver identity through the legacy adapter.
4. **Assessment scope/ticket**: original started/settled identity, source kind/id/ref, canonical resolved effect and permitted flag; `veto` remains deny-only, exceptions deny, and start occurs before declaration parsing. Preserve ancestor scopes across bundle boundaries. This observation does not grant execution admission or replace the sole command observer.
5. **Instruction read-once**: original `read` callback returning the grounded reading. Both derive and route share its one promise, including failure; derive rethrows the original failure, route returns transport-unavailable, peek remains synchronous/no-call. The Studio adapter retains provider invocation accounting and actual active instruction/act assembly.

Do not widen grants from model fields: instructed claims/route interpretations remain grounded data; destructive permission still comes from the run's permitted set or a person's actual settled grant. Model wording, client results or an empty telemetry set create no authority. Preserve exact unknown/unanswered/stale distinctions, declaration record order/cap of 500, outstanding request reuse, per-control declines, standing-decline behavior and action-local undo allowance.

## Exact active web seams

All paths here are downstream sibling `!FluxIQWebExtension`; discovery only, no downstream edits proposed for this Core unit.

- `domain/src/actions/consequence-declaration.ts`: authoritative per-web-action required/not-required/requiredWhen(submit) table. Core's metadata reader remains generic; do not import web action IDs or recreate their table in policy.
- `domain/src/actions/effect.ts` and `actions/action-effect/{table,resolve,submit-parameter,new-tab-parameter}.ts`: actual observe/mutate/commit and parameter-sensitive web floors. These supply canonical resolved effects; Core cannot infer them from labels or model classes.
- `domain/src/runtime/llm-evidence/plan-resolution/step-permission.ts`: web node-to-action/effect lookup, `visibleText`/`accessibleName` choice, element tag/role interpretation (`a`/button), verb table, declaration requirement, and mapping to Core's check. Keep all of it downstream.
- `domain/src/runtime/llm-evidence/permission.ts`: bounds the web-provided name/verb, builds the declaration with original opaque spot tokens and resolved floor, calls the supplied Core check, and reports Core's missing/request/declined result. It has no permission set to widen. Preserve no-check fail-closed behavior.
- `domain/src/runtime/llm-evidence/control-spot/**`: actual item/dialog/subject/page/scope/resource/place/state tokens and DOM/page meaning. Core may compare these opaque values and bind them to original evidence; it must not inspect selectors, DOM tags, page text or browser resources to classify risk.
- `domain/src/output-nodes/definitions.ts` publishes the declaration/floor metadata; `domain/src/io/gateway-output-dispatcher.ts` carries the actual action boundary. Extension content modules produce the real control/page facts. No generic permission extraction should add browser vocabulary or reach into these modules.

The existing narrow client subpath is `fluxiq/automation-studio/action-permissions`, backed by the old client barrel, while full domain declarations/checks currently import `fluxiq/automation-studio`. Root may add a canonical `fluxiq/runtime/action-permissions` seam and executable data export, but must keep both existing import paths and wire shapes working; workers do not edit package/root exports.

## Acceptance required after source release

Retain current old immediate subjects unchanged: `runtime/action-permissions/tests/{undo,instructed,gate,destructive,declared,declaration,consequences,client-floor,assessment-observation,action-effect-declaration}.test.ts`; `plan/tests/projection.test.ts`; `instruction-route/tests/read.test.ts`; `instruction-reading/tests/reading.test.ts`; `instruction-quote/tests/mapped.test.ts`; `client/tests/index.test.ts`. Also run existing canonical `runtime/action-permissions/tests/request.test.ts` and `destructive/tests/destructive.test.ts` without modifying their authority.

Exact integration subjects to coordinate with the lead after the batch stabilizes: `runtime/service/tests/instruction-authority.test.ts`, `runtime/flow-bootstrap/tests/action-permissions.test.ts`, `runtime/flow-bootstrap/tests/action-permissions-witness-notes.test.ts`. These cover actual derivation trigger/usage, one shared instruction/route call, unanswered acts, person settlement and witness behavior. Keep the large Flow-bootstrap permission composition file outside the extraction ownership.

Add independent canonical tests without Studio fixtures for effect-floor monotonicity, original assessment context/receiver identity, gate grant/decline/undo/outstanding behavior and exact request bytes, digest/Unicode/span/staleness/unknown reading semantics, and once-reader concurrency/error identity. Require strict isolated NodeNext for owned leaves plus real old callers; source and erased-import closure must contain no Studio node/model/LLM/service types. Scope structure/AST and whitespace checks to owned paths, with no baseline/config moves or increases. Browser-sensitive compatibility is checked later through the unchanged downstream `domain/src/runtime/llm-evidence/plan-resolution/tests/plan-step-permission.test.ts` and action-effect subjects; no browser or provider run is needed to prove this ownership move.

## Discovery validation (historical)

Only `Get-Content`, `rg --files` and scoped `rg -n` reads ran over the named old owners, direct canonical contract dependencies, their test names and decisive downstream seams. No source/test/build/audit/typecheck/full-suite/provider/browser/panel or git actions ran for this discovery. No runtime behavior was verified. Source release must confirm ownership of the necessary existing canonical request data split and Studio presentation adapter; no new contract or permission behavior is frozen by this report alone.

## Implemented canonical ownership

- `runtime/action-permissions/{declaration,record,gate,assessment,plan,instruction}/**` now owns actual declaration validation and projection, client-floor combination, declaration records/cross-check, permission/decline/undo state, bounded shown-evidence names, assessment observation, trusted definition/effect lookup, instruction grounding/currentness and route spans. Each new production leaf has one exported authority and a directory barrel. Internal helpers do not enter the public capability barrel.
- `flows/executable/permissions/**` is the single data authority for declarations/checks/verdicts, request/action/stage data and schema version, records/cross-checks, grounded instruction/act/route data and assessment ports. Existing node/action-effect/consequence types remain canonical imports. No Studio type survives in the canonical source or erased-import closure.
- Existing request code is split once into browser-safe `runtime/action-permissions/request/{limit,name,parse,sentence,index}.ts`. The old `request.ts` forwards it. Request data/version is declared only in executable contracts. The existing public sentence formatter remains one compatibility helper; the neutral gate has no default UI wording and Studio explicitly supplies that helper as its trusted presentation port. Original sentence/parser bytes and names are unchanged.
- `ActionPermissionGate(originalInput, trustedPresenter)` retains the actual input object, so derive/clock/request-ID callbacks keep their original receiver. Old `AutomationStudioActionPermissionGate` is a thin Studio presentation subclass; all permission/effect/decline/evidence state is held by the one canonical implementation. Old method/call shapes and settlement behavior are retained.
- Assessment keeps exactly `Symbol.for("fluxiq.automation-studio.action-assessments.v1")` and the original shared global AsyncLocalStorage authority. Legacy run/scopes/begin/effect paths forward the actual canonical functions. Tests prove original active scope identity, ancestor veto behavior, normalized frozen floors, started-before-parse failure and deny-only failure handling. No command observer, admission source or second registry was introduced.
- `instruction/once/createActionInstructionAuthority({read})` owns shared derive/route/peek memoization, original reader receiver, retained original failure, and no-call peek. It reserves its promise before invoking the read and handles rejection, synchronous throw and reentrant access without another call. The Studio instruction authority retains its actual harness request, trigger/act/schema assembly and original mutable usage object; refused-unsent accounting and provider behavior remain unchanged.
- Instruction prompt/schema wording remains in the Studio instructed/route/reading adapters. Canonical composition accepts supplied schema parts and performs the same clone/merge. Browser/DOM/role/selector/verb interpretation stays downstream at the seams recorded above; no web interpretation or model guidance was copied into neutral policy.
- `runtime/action-permissions/client/index.ts` is the generic browser-safe entry requested by the lead. It exports exactly the original three values (consequence phrases, destructive set, strict request parser) plus the existing request type. Legacy `.../client/index.ts` forwards those same objects/functions. A committed source-and-erased-import regression test rejects any Node or instruction-runtime edge from the actual legacy entry.
- Existing destructive classification/list/predicate/select authority is untouched. Source formatting fixes only split statements in owned files; original test oracles remain. The existing canonical request test's BOM was removed for the owned EOF check. No SQL, command observer, engine/admission, C/B producer, Flow-bootstrap composition, downstream, package/root export or shared working-document source was edited.

## Final focused acceptance

Exact combined command:

```powershell
pnpm.cmd --filter fluxiq exec vitest run src/programs/automation-studio/runtime/action-permissions src/runtime/action-permissions src/programs/automation-studio/runtime/service/tests/instruction-authority.test.ts src/programs/automation-studio/runtime/flow-bootstrap/tests/action-permissions.test.ts src/programs/automation-studio/runtime/flow-bootstrap/tests/action-permissions-witness-notes.test.ts --maxWorkers 2 --minWorkers 1 *> .fluxiq/refactor/permission-final.log
```

Observed exit 0, 26/26 files and 273/273 tests, 40.72s. This includes unchanged actual instruction-authority 24 cases, Flow-bootstrap permission 37, witness-notes 5, every report-named immediate legacy/canonical subject, 13 independent canonical cases, original assessment-function identity and the browser closure regression. The initial immediate run passed 18 files/216 tests in 38.52s.

After adding the lead-requested generic client entry and one further identity case, exact affected command:

```powershell
pnpm.cmd --filter fluxiq exec vitest run src/programs/automation-studio/runtime/action-permissions/client/tests/index.test.ts src/programs/automation-studio/runtime/action-permissions/client/tests/browser-closure.test.ts --maxWorkers 2 --minWorkers 1 *> .fluxiq/refactor/permission-client-final.log
```

Observed exit 0, 2/2 files and 6/6 tests, 2.08s, against final client source. These cover its exact three runtime exports, original values/function identity, unchanged legacy manifest shape, strict request/vocabulary behavior and actual transitive browser closure. The remaining owners were unchanged after the combined run. The combined selector now contains one additional client identity case; a complete 274-case rerun is left to lead independent acceptance, not claimed here.

Final static commands, all observed exit 0:

- `node --max-old-space-size=4096 .fluxiq/refactor/permission-types.cjs` -> strict isolated NodeNext, 186 scoped files including 4 real consumer files, 0 errors. Checks all owned production/tests plus existing instruction/permission assembly consumers; emits no build output. This is not a whole-package check.
- `node .fluxiq/refactor/permission-closure.cjs` -> canonical source/erased closure 597 local modules, 0 Studio or unresolved edges; actual legacy browser client closure 26 modules, 0 Node, instruction-runtime or unresolved edges. Both value and type imports/exports are traversed against the real source/module resolution.
- `node .fluxiq/refactor/permission-structure.mjs` -> 177 owned files, 15 official rule passes plus leaf-authority/barrel AST review, 0 failures and 0 warnings. Existing destructive authority is excluded from ownership. No audit configuration/baseline/budget changes or moved violations.
- `node .fluxiq/refactor/permission-whitespace.cjs` -> 177 owned files, 0 whitespace/EOF failures.

Matching logs: `.fluxiq/refactor/permission-final.log`, `permission-client-final.log`, `permission-types.log`, `permission-closure.log`, `permission-structure.log`, `permission-whitespace.log`. All processes completed before handoff; no further owned tests/guards/source edits are planned.

## Intermediate findings resolved

- Initial generated typing found an aliased quote comparator import and an assumed neutral node type name; corrected the import and consumed the actual canonical `AutomationStudioFlowNode` authority. The first old immediate suite then passed all 216 cases.
- New canonical tests initially called `settle(requestId, answer)` rather than the real existing `settle(answer)` API. Corrected only those new test calls; the original settlement API/old oracles were never changed. All 13 canonical cases pass.
- The first request-leaf split retained two old reexport headers with an obsolete relative path, causing two new suites to stop at collection while eight cases in the other suites passed. Removed those redundant headers, keeping data reexports solely in the intended request barrel; strict/source closure and all suites now pass.
- Initial structure findings were barrel bypasses and packed statements. They were fixed through narrow public barrels and formatting. A real closure probe exposed legacy client forwards through the newly expanded server barrel; all forwards now use the narrow generic client/request/consequence/destructive owners. The final browser regression mechanically holds that boundary.

## Handoff and verification limits

Lead owns `flows/executable/index.ts`, root/runtime package exports and publishing the requested `fluxiq/runtime/action-permissions` and `/client` seams. Both old public client paths and symbols remain valid; no package manifest was edited by this worker.

Not verified: complete package check/build/full suites, downstream package/browser/provider integration, package export publication, or broader B/C execution wiring. No package/full-suite/build/provider/browser/panel/git actions ran, and no user data was used. Changes remain uncommitted under lead-only git policy. Source is frozen for lead independent acceptance.
