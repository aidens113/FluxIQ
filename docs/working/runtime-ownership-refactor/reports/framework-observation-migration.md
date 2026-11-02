# Canonical authoring execution observation

Outcome: Done for the bounded shared-context source cut. SOURCE AND TESTS FROZEN.
Lead acceptance is provisional pending normal built-package integration.

## Actual ownership

`packages/fluxiq/src/runtime/flow-authoring/execution/observation/` now owns
the actual invocation algorithms and their state:

- `context.ts`: complete seven-field `AuthoringExecutionContext`.
- `tool-port.ts`: the three exact consumed methods on the original observer.
- `scope.ts`: actual scope lookup/binding/restoration and private owner links.
- `internal/{registry,index}.ts`: the sole original invocation WeakMap and
  its private compatibility seam.
- `invoke.ts`, `sync.ts`, `producer.ts`: actual pinned original callback,
  receiver, tuple, observation and tool forwarding mechanisms.
- `index.ts`: explicit public types/Scope/operations; no raw registry export.
- `tests/{scope,invoke}.test.ts`: independent neutral authority tests.

The approved internal barrel is the only layout amendment to the initial
brief. It keeps the existing private registry alias without publishing the
map through the new public feature or parent/package export.

The original bodies moved once. The following old Studio leaves contain only
exact named aliases:

```text
candidate-trials/partial/context.ts
flow-bootstrap/reset-observation/registry.ts
flow-bootstrap/reset-observation/scope.ts
flow-bootstrap/reset-observation/invoke.ts
flow-bootstrap/reset-observation/sync.ts
flow-bootstrap/reset-observation/producer.ts
```

`reset-observation/tests/framework-aliases.test.ts` proves the class, functions
and private registry have exact framework identity, and that the raw registry
is absent from the framework public barrel. There is no second map, delegated
Studio implementation or copied receipt authority.

The lead integrated the execution/flow-authoring parent barrels and
`fluxiq/runtime/flow-authoring/execution` package subpath. This worker did not
edit public parent/package configuration.

## Contracts and compatibility

Public canonical symbols are:

```text
AuthoringExecutionContext
AuthoringExecutionToolPort
AuthoringExecutionScope
invokeAuthoringExecutionCallback
invokeAuthoringExecutionSync
invokeAuthoringExecutionProducer
```

The context retains all original fields and optional/explicit-undefined
semantics: `parent`, `callbacks`, `automation`, `originalRoot`, `toolObserver`,
`toolRequest`, and `prepareToolParent`. Context, original Root/proof, callback
source, observer and function references remain intact. No shorter Flow,
project, run or evidence DTO was introduced.

The old concrete Studio observer type dependency is now the neutral
`prepareParent`/`bindParent`/typed `invoke` port. The original concrete observer
instance and method receiver are forwarded unchanged. Class-specific methods
remain on the actual tool observer owner; they are not required by this
context. Existing real tool, start-state and queued-writer consumers compile
against the new shape.

The existing canonical engine admission-source **type** is preserved in the
high-level authoring context. The low-level observation kernel gained no
engine or Studio import. Canonical execution uses the already-neutral
`ExecutionCallbackPolicies` authority.

Original errors, nested restoration/refusal, original receiver and tuple
semantics, managed/pure contracts, terminal unknown and real flush behavior
are unchanged. No observer property enters model/host/native arguments. The
old synchronous unbound behavior and wire/schema bytes remain unchanged.

`trial-context.ts`, deferred sessions, finish and result-policy remain
temporary candidate bridge adapters. They were not moved into canonical code
with reverse Studio imports. Their following actual authority migrations are
required by the user's UI-only Studio criterion.

## Observed validation

All checks ran in current t843 Core on one jointly frozen source tree.

```text
pnpm.cmd --filter fluxiq exec vitest run src/runtime/flow-authoring/execution/observation/tests/scope.test.ts src/runtime/flow-authoring/execution/observation/tests/invoke.test.ts src/programs/automation-studio/runtime/flow-bootstrap/reset-observation/tests/framework-aliases.test.ts src/programs/automation-studio/runtime/flow-bootstrap/reset-observation/tests/invoke.test.ts src/programs/automation-studio/runtime/flow-bootstrap/reset-observation/tests/start-state.test.ts src/programs/automation-studio/runtime/flow-bootstrap/reset-observation/tests/finish.test.ts src/programs/automation-studio/runtime/flow-bootstrap/reset-observation/tests/result-policy.test.ts src/programs/automation-studio/runtime/flow-bootstrap/site-reset/tests/project-ledger-completion.test.ts
-> exit0; 8 files, 18/18 tests passed; 62.20 seconds.
node --expose-gc .fluxiq/refactor/framework-observation/check.cjs
-> exit0; strict23 roots/5,130 modules/0 diagnostics;
   declaration9 roots/1,767 modules/0 diagnostics/emitted=true.
node .fluxiq/refactor/framework-observation/closure.cjs
-> exit0; full source/type closure1,588 modules/0 forbidden edges;
   erased JavaScript closure11 modules/0 forbidden edges.
node .fluxiq/refactor/framework-observation/structure.mjs
-> exit0;18 rules/0 failures/0 advisory warnings/0 baselines.
```

The real SQL ledger consumer verifies its original sink and lexical persist
owner through actual document commit, plus unsupported persist/reopened-owner
refusal. Neutral tests verify entry before actual private receiver execution,
original error propagation, nested original-context restoration, changed-owner/
cycle refusal, and durable unknown with zero second invocation. Existing
start-state, sink, session and post-result consumer assertions remain intact.

The closure probe follows import/export/import-type dependencies and separately
examines transpiled JavaScript imports. Public workspace declarations are
mapped to their existing source counterparts for source-closure inspection;
direct built-output imports fail. External node_modules are not audited by
this probe. Both canonical closures have zero Studio/downstream/built-output
edges. Scoped structure also includes imports/cycles/reach, facade rules,
budgets, statement packing, failure handling, typed option copies and browser
vocabulary.

Every worker process ended and was explicitly reported closed to the lead and
peers. No whole package check/build/suite, provider, browser/panel, git,
baseline or user-data operation was run. No shared working root/index changed.

## Not verified and next authority

Normal library/declaration/public-package integration and downstream guarded
acceptance remain lead-owned. The lead's actual full Service reset case still
has an independently diagnosed tool binding failure; leaf/SQL acceptance here
does not claim that composed case passing.

The next released source unit must be the actual tool observer/forwarding
closure from `framework-trial-migration-plan.md`, after the composed fix. Full
candidate/session/restoration/Ledger/project-persistence migrations remain
required; this source cut does not establish a permanent Studio exception.
