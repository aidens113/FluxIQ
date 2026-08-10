# Flow Unification and Scriptability Plan

Status: working document  
Created: 2026-08-07  
Scope: FluxIQ Automation Studio, public domain-neutral contracts, and the web editor. This plan is not authorization for an unreviewed destructive data migration.

Implementation progress: Parts 1--11 implemented and validated 2026-08-07.

Part 1 validation: `pnpm --filter fluxiq check`, `pnpm --filter fluxiq test`
(129 tests), `pnpm --filter fluxiq build`, `pnpm docs:reference`, and
`pnpm docs:check` passed on 2026-08-07.

Part 2 validation: `pnpm --filter fluxiq check`, `pnpm --filter fluxiq test`
(132 tests), `pnpm --filter fluxiq build`, `pnpm docs:reference`, and
`pnpm docs:check` passed on 2026-08-07.

Part 3 validation: `pnpm --filter fluxiq check`, `pnpm --filter fluxiq test`
(134 tests), `pnpm --filter fluxiq build`, `pnpm docs:reference`, and
`pnpm docs:check` passed on 2026-08-07.

Part 4 validation: `pnpm --filter fluxiq check`, `pnpm --filter fluxiq test`
(136 tests), `pnpm --filter fluxiq build`, `pnpm docs:reference`, and
`pnpm docs:check` passed on 2026-08-07.

Completion audit: Parts 5 and 6 were re-audited and completed on 2026-08-07.
The editor now includes all specified Flow details, scoped palette groups,
publication/dependency surfaces, and dirty-state guards. Composite publication
now uses a standalone durable version index with deprecation and dependency
inspection; runtime Call Flow execution enforces exact bindings, nested
bounds/traces, capabilities, and explicit per-run cross-scope grants. The full
repository gates listed under Cross-cutting validation were rerun after the
audit: `pnpm check`, `pnpm test` (193 tests across the tested workspace
packages), `pnpm build`, `pnpm docs:reference`, and `pnpm docs:check` all passed.
The argument-driven `flows:check` CLI has no repository-local authored Flow
module to target; its compiler/source behavior is covered by the passing
FluxIQ DSL compiler tests.

Final code-first audit (2026-08-07): every acceptance criterion was traced into
model, registry, storage, API, runtime, editor, and test code rather than
accepted from this document's status labels. The audit closed additional gaps:
canonical node instances and published snapshots now retain exact definition
versions; ordinary saves cannot forge or truncate publication history;
publication rejects missing/out-of-scope/mismatched definitions; dependency
inspection cannot expose cross-scope callers; region/composite deadlines abort
cooperative work; policy attempts explain selected/rejected/waiting outcomes;
code-owned Flows require node and schema dependency pins; importer extension
implementations and versions are complete before activation; confirmation
input removal invalidates recording-derived proposals; rollback is idempotent
and recorded on its ledger; duplicate Flow creation cannot overwrite an
existing Flow; and the Flow editor authors errors, variables, timeout, and
concurrency under the same dirty-state boundary.

## Purpose

FluxIQ currently distinguishes **tasks** (recording/policy-oriented work) from **routines** (orchestration), although visual graph documents already exist as flows. The distinction leaks implementation choices into the product and prevents one automation from naturally mixing integrations, deterministic logic, recordings, retries, and policy-based recovery.

The target has one first-class executable composition artifact: a **Flow**. A Flow supports conventional workflow-node capabilities *and* FluxIQ's observation, evidence, policy, expectation, and recovery model. Neither is a bolt-on or a separate product.

This plan also introduces domain-scoped private/public exports, reusable composite-flow nodes, TypeScript authoring, and a safe migration from the existing task/routine data model.

## Non-goals and invariants

- FluxIQ remains domain-neutral. Importing repositories own domain actions and runtime adapters.
- A visual graph and arbitrary edited TypeScript never silently compete as two authoritative mutable representations.
- Importer-registered output IDs remain the only executable domain actions. Raw recording inputs and mapped action-input confirmations remain evidence, never policy state.
- Global and domain scopes remain separate. A global Flow cannot implicitly obtain private domain runtime capabilities.
- Task/routine artifacts remain readable and executable through a compatibility period. Migration is explicit, idempotent, backed up, and tested.
- Persisted artifacts, published node contracts, and code-owned modules are validated before execution.

## Target terminology

| Term | Meaning |
| --- | --- |
| Flow | The only first-class executable graph artifact. It owns structure, interface ports, execution configuration, provenance, and lifecycle metadata. |
| Node definition | A reusable contract for ports, configuration, capabilities, and an implementation or implementation reference. |
| Node instance | A configured occurrence of a node definition in a Flow. |
| Composite node | A published Flow invoked as a node through its declared ports. It replaces task/routine orchestration. |
| Native node | A framework or importer-provided node implemented programmatically. |
| Recording-derived node | A reviewed Flow fragment or definition derived from recording evidence. |
| Policy region | A bounded Flow area that uses state eligibility, action ranking, expectations, and recovery. It is not a top-level Task. |
| Visual-owned Flow | Canonical source is stored Flow IR; FluxIQ also writes a durable generated TypeScript DSL file for review/export, but that file is not authoritative. |
| Code-owned Flow | Canonical source is constrained TypeScript FluxIQ DSL stored as the authoritative module; compilation constructs validated Flow IR. |

## Target architecture

```text
Project
  |- Flows
  |    |- graph, ports, regions, versions, provenance
  |    |- private Flow drafts
  |    `- exported/public Flow versions
  |- Node library
  |    |- framework built-ins
  |    |- importer-native domain nodes
  |    |- public composite Flow nodes
  |    `- approved recording-derived nodes
  |- recordings and evidence
  `- configurations / connections

Visual editor ----\
TypeScript SDK ----> canonical Flow IR -> validator/compiler -> runtime plan
AI tooling --------/                                      -> executor/traces
```

The editor, TypeScript SDK, and future AI tooling all author the same canonical representation. The runtime executes a compiled plan from validated IR, never arbitrary generated JavaScript.

## Scope and visibility

```ts
type FlowScope = { kind: "global" } | { kind: "domain"; domainId: string };
type FlowVisibility = "private" | "public";
```

- **Private**: usable only in the owning project; not shown as a reusable palette item outside it.
- **Public**: exported as a versioned composite node for other projects in the same scope.
- Public callers reference immutable published versions. Draft edits never alter callers unexpectedly.
- Future `shared` and `marketplace` tiers are deferred, but the model must allow them without a migration.
- A global Flow invokes a domain Flow only through an explicit cross-scope Call Flow node with visible capability and permission requirements.

Every public Flow has a semantic version, typed input/output contract, published snapshot, dependency list, and changelog/compatibility indication.

## Delivery rules

- Complete and validate each numbered point before starting the next.
- Stop for design review after points 1--4 and after point 6.
- Introduce contracts additively. Do not rename task/routine fields in place merely for appearance.
- Update authored architecture, program, integration, and reference documentation alongside substantial implementation.
- Use public, domain-neutral fixtures covering legacy tasks, routines, recordings, policy graphs, categories, and global/domain scopes.

## 1. Define the canonical Flow and export contracts

**Goal:** establish the durable data model for every later UI, runtime, and code-authoring change.

### Design

Introduce a new `AutomationStudioFlowArtifact` (final public name to follow existing API conventions) that is independent of Task/Routine ownership. It includes stable identity, project/scope/name metadata, source mode (`visual` or `code`), origin (`manual`, `recorded`, `imported`, `migrated`), graph IR, typed ports, execution defaults, visibility/publication/version state, immutable published interfaces, and references to evidence and policy models.

The initial type system remains intentionally small: primitives, JSON, records, arrays, named schema references, optionality, and `unknown`. It validates assignability and produces useful editor diagnostics; it does not attempt to reproduce the entire TypeScript type checker.

Publication states are draft, publishable, published, and deprecated. Publishing captures the interface, IR digest, provenance, author, and timestamp as an immutable version snapshot.

### Work

1. Specify Flow serialization/schema version and stable IDs.
2. Define port types, edge compatibility, interface errors, and structured diagnostics.
3. Define scope, visibility, publication, origin, and source-mode metadata.
4. Define version/publish/deprecation behavior and immutable snapshots.
5. Add global, domain-private, domain-public, and legacy-provenance fixtures.
6. Export only deliberate public contracts from `fluxiq/automation-studio`.

### Acceptance criteria

- A new Flow has no Task/Routine owner requirement.
- Invalid ports, edges, IDs, publication metadata, and scopes fail deterministically.
- A public Flow has an immutable versioned interface.
- New authored Flows can retain legacy provenance without carrying legacy fields.

## 2. Define the canonical Node Definition contract

**Goal:** let conventional, native, policy-aware, composite, and recording-derived nodes coexist in one registry without relaxing safety or scope.

### Design

Every node definition declares identity, category/display metadata, ports, configuration schema, required capabilities, supported scopes, safety metadata, and behavior capabilities. Capabilities are additive: `executable`, `trigger`, `stateAware`, `recordable`, `retryable`, `recoverable`, `asynchronous`, `composite`, and `codeBacked` are examples. This prevents replacing Task/Routine with a new rigid hierarchy.

Definitions originate from framework built-ins, importer-native nodes, public composite Flows, or approved recording-derived nodes. Palette resolution first finds definitions available in the active scope, then filters by placement context, permissions, connected ports, and runtime capability. Availability never bypasses a domain boundary.

### Work

1. Replace Task/Routine-centric registry and palette groups with definition categories.
2. Define native-node execution adapters and typed implementation references.
3. Map current policy and IO action nodes into the contract without behavior changes.
4. Define importer custom-node manifest/discovery using the existing domain node root.
5. Specify definition schema/version compatibility and missing-definition diagnostics.
6. Test scope filtering, capability requirements, and importer isolation.

### Acceptance criteria

- Existing built-ins work through the registry adapter.
- Importers register native nodes without domain code entering FluxIQ core.
- Missing/revoked/incompatible nodes block execution with a clear error.
- Palette discovery obeys global/domain and private/public boundaries.

## 3. Add legacy Task/Routine compatibility adapters

**Goal:** present one product model without invalidating existing projects.

### Design

Existing Task artifacts, Routine artifacts, owned Flow documents, recordings, policy graphs, and proposal/evidence documents stay unchanged initially. A pure compatibility resolver presents them as read-only `migrated` Flows. Tasks become recorded/policy-provenance Flows; Routines become deterministic/orchestration Flows. Stable legacy IDs remain in provenance metadata so recordings, deep links, and traces remain correlated.

New artifacts write canonical Flows. Compatibility must never infer that raw events are executable actions, and must not write adapted data into legacy documents until explicit migration.

### Work

1. Implement pure Task-to-Flow and Routine-to-Flow adapters.
2. Add a project catalog resolver for canonical and adapted Flow listing.
3. Define legacy/canonical ID collision handling.
4. Add origin, source-location, and migration-status metadata for UI/support.
5. Keep adapted Flow edits/deletes from mutating legacy data.
6. Test routines invoking tasks, policy graphs, empty legacy projects, and mixed projects.

### Acceptance criteria

- Existing projects open and execute unchanged.
- The Flow list displays legacy content without mutation.
- Recording/policy references remain intact and traceable.
- Adapter results are deterministic and unit tested.

## 4. Make canonical Flow storage and APIs the new write path

**Goal:** make direct Flow persistence authoritative for new work, with explicit recoverable migration.

### Design

The project catalog gains canonical `flows`; Task/Routine lists are compatibility views. New writes use the current SQLite-backed project artifact storage and transaction boundaries. The system does not recreate file-tree persistence.

Migration starts with an inspection/dry-run, writes backup/export metadata, converts unambiguous artifacts transactionally, and records a migration ledger. It is restart-safe and idempotent. Ambiguous data remains visible with a blocking diagnostic rather than being guessed or discarded.

### Work

1. Add create/list/get/save/delete/publish Flow contracts and permissions.
2. Add storage/indexes for scope, visibility, origin, and published versions.
3. Keep legacy endpoints operational while adapting their read paths where practical.
4. Implement `inspectFlowMigration` and `migrateFlows` plan/apply APIs with backup IDs and artifact outcomes.
5. Add audit events, recovery guidance, and conflict reporting.
6. Test transaction interruption, repeated apply, and mixed legacy/new catalogs.

### Acceptance criteria

- New Flow creation never creates Task/Routine artifacts.
- Migration is repeatable, safe, and retains a recoverable source.
- Global/domain Flow queries are isolated.
- Authoring/runtime permission checks remain enforced.

**Design gate:** review the persisted contract, migration report, and public API names before editor changes.

## 5. Migrate the editor to a single Flows experience

**Status: implemented and validated 2026-08-07.** The project tree lists the canonical Flow catalog rather than separate Task and Routine sections. All creation presets write canonical Flows. The shared editor owns graph, region, interface, publication-intent, source, and execution-grant state under one dirty-state boundary; it exposes scoped importer, recording-derived, code, and published-composite palette definitions. Legacy entries remain labelled and read-only until explicit migration.

**Goal:** remove Task/Routine as a user-facing decision while preserving recording and policy tooling.

### Design

The project hierarchy becomes Flows, Recordings/Evidence, Proposals, Configurations/Connections, and Node Library. Legacy adapters display a migration badge but no new Task/Routine controls. The existing editor remains the single Flow editor.

Creation presets configure one Flow model: Blank Flow, Deterministic Workflow, Recorded Automation, Integration Flow, Scheduled Flow, API Endpoint, and Reusable Component. The editor gains Flow interfaces, config/source ownership controls, visibility/publication/version state, and dependency warnings.

### Work

1. Replace Task/Routine models, labels, hierarchy sections, and clients.
2. Add preset creation templates.
3. Add Flow panels for ports, scope, visibility, origin, and versions.
4. Organize palette sections: built-in, integrations, domain nodes, public flows, project nodes, code, policy/evidence.
5. Preserve unsaved-change protection for graph edits and config/source ownership edits.
6. Redirect legacy deep links to adapted Flows.
7. Update architecture/user docs and UI tests.

### Acceptance criteria

- Users create a Flow without choosing Task or Routine.
- Legacy items remain identifiable during migration.
- A domain workspace exposes only its domain content plus explicitly allowed framework/global facilities.
- The global workspace never displays domain-private content.

## 6. Implement composite publishing and Call Flow execution

**Status: implemented and validated 2026-08-07.** Publication snapshots and the standalone publication index are durable and append-only, lifecycle deprecation is separate from immutable content, and dependency/used-by/upgrade APIs and UI are active. Call Flow execution uses exact pins, explicit bindings, declared defaults/errors, bounded nested execution, child traces, runtime capabilities, and explicit per-run domain grants.

**Goal:** make public Flows reusable as typed nodes and replace routine orchestration with versioned subflow composition.

### Design

Publishing projects a Flow's declared interface into a node definition and captures a versioned Flow snapshot. `Call Flow` binds inputs and exposes outputs/errors. Callers pin an immutable version; upgrades require review. Runtime execution creates child contexts and parent/child trace trees.

The compiler builds the dependency graph before execution and initially rejects all direct/indirect cycles. Cross-scope calls are explicit nodes declaring the target domain; validation checks caller permission and runtime capability availability.

### Work

1. Implement publication snapshotting and node-definition projection.
2. Implement Call Flow ports, bindings, outputs/errors, and editor drill-in.
3. Validate dependency graphs, versions, ports, scopes, and cycles.
4. Implement nested execution context, cancellation/timeout/retry propagation, and traces.
5. Add dependency/"used by" UI and deprecation warnings.
6. Test same-domain calls, private rejection, cycle rejection, pins, upgrades, and cross-scope calls.

### Acceptance criteria

- Public domain Flows appear as typed composite nodes in that domain.
- Draft edits never alter a published version already used by a caller.
- Cycles/scope errors fail before execution.
- Traces preserve nested boundaries and policy explanations.

**Design gate:** review call semantics, versioning, and cross-domain authorization before production UI activation.

## 7. Introduce execution regions inside a Flow

**Status:** implemented and validated 2026-08-07.

**Goal:** let ordinary deterministic workflows and FluxIQ adaptive behavior coexist in one graph.

### Design

Initial regions are deterministic, trigger/event, and policy. A policy region adapts the existing learned policy/evidence model rather than rewriting scoring in its first release. It declares entry/exit ports, signals, eligible output actions, expectations, recovery routes, and trace behavior.

Policy actions remain output-native. IO dispatches a registered output ID. Runtime action-input events remain confirmation observations; inputs mapped to outputs are prohibited from policy-state eligibility.

### Work

1. Define region IR, validation, and rendering.
2. Adapt legacy task policy graphs into policy regions.
3. Compile deterministic edges and policy transitions into a unified plan with explicit handoffs.
4. Preserve existing state collection, action dispatch, expectation, recovery, and evidence persistence boundaries.
5. Extend traces with selection/rejection explanations in parent-Flow context.
6. Test deterministic-to-policy/policy-to-deterministic handoffs, confirmation failure, recovery, and prohibited state input use.

### Acceptance criteria

- One Flow can contain trigger, deterministic work, policy region, and deterministic post-processing.
- Existing policy behavior remains equivalent through the adapter.
- No policy region dispatches raw/unregistered domain actions.

## 8. Build the TypeScript SDK, compiler, and source ownership modes

**Status:** implemented and validated 2026-08-07.

**Goal:** provide first-class code authoring and AI-safe structured editing without impossible arbitrary code/graph round-tripping.

### Design

The public `defineFlow` DSL constructs canonical Flow IR: inputs/outputs, registered nodes, edges, Call Flow, regions, and policy declarations. It is declarative. Runtime scheduling, fingerprint scoring, retries, recovery, subscriptions, persistence, and tracing remain runtime responsibilities.

Visual-owned Flows generate readable TypeScript for inspection/export, not direct arbitrary editing. The generated module is written under the project `.fluxiq` source tree even when visual IR remains authoritative. A deliberate conversion creates a code-owned Flow: its constrained DSL source is authoritative, FluxIQ stores the module under the project source tree, loads it through a controlled build path, obtains IR, validates it, then renders the graph. Visual editing is disabled for a code-owned Flow unless a reviewed conversion back occurs.

Compiler output is normalized and deterministic: identical IR and pinned dependencies yield identical plan/digest, enabling source review and CI.

### Work

1. Define a public DSL package with no web-editor dependency.
2. Implement DSL-to-IR construction, source locations, diagnostics, and registry validation.
3. Implement deterministic IR normalization and plan compilation.
4. Generate formatted code view/export for visual-owned Flows.
5. Implement code-owned metadata, source loading, and validation.
6. Define controlled module resolution: approved SDK imports and declared dependencies only; never implied host filesystem access.
7. Add config/source ownership UI, generated-code inspection, conversion warnings, and CI/compiler commands.

### Acceptance criteria

- Visual and DSL authored equivalents produce equivalent IR.
- Generated code is stable/readable enough for export and review.
- Invalid code-owned modules show source diagnostics and never execute.
- Editing arbitrary code cannot silently corrupt a visual source of truth.

## 9. Add Code Nodes and importer SDK integration

**Status:** implemented and validated 2026-08-07 using the trusted-local trust model. Untrusted/community code execution remains disabled.

**Goal:** provide a controlled custom-logic escape hatch while retaining an inspectable, typed outer Flow graph.

### Design

A TypeScript Code Node declares typed inputs/outputs and is a single node from the graph's perspective. Its internal code is not reversible into a graph. It declares capabilities such as network, secrets, filesystem, or child process and defaults to the minimum permitted set.

Importer SDK additions cover native nodes, recording mappers, target resolvers, comparators, custom types, and optional editor metadata. Importers own runtime implementations; FluxIQ hosts only domain-neutral contracts.

### Work

1. Specify Code Node source, context, logs, errors, timeout, cancellation, and permissions.
2. Decide/document execution isolation before enabling untrusted code. Initial support may be trusted-local-only rather than a claimed sandbox.
3. Implement compiler/type validation and runtime permission checks.
4. Define importer SDK and manifest discovery/update behavior.
5. Support importer display/config schemas without importing domain implementation into core.
6. Test port isolation, cancellation, denied capabilities, missing implementations, and manifest loading.

### Acceptance criteria

- Code Nodes are explicit, typed, and traceable.
- Trusted Node.js execution is never marketed as a sandbox.
- Importer native output/action nodes remain subject to existing output confirmation rules.

## 10. Evolve recordings into reviewed Flow/node proposals

**Status:** implemented and validated 2026-08-07. Recording observations are
mapped into reviewable, provenance-preserving Flow proposals; action-mapped
inputs remain confirmation-capable but are excluded from policy state.

**Goal:** make recordings a principled source of Flow fragments and reusable nodes without treating raw UI events as executable instructions.

### Design

```text
runtime input observation
  -> importer recording mapper / semanticizer
  -> registered output action + parameters
  -> proposed Flow node or fragment
  -> evidence / expectation review
  -> saved Flow or published recording-derived node
```

Recording mappers are importer-owned because raw observations are domain-specific. Core stores domain-neutral proposals, evidence/provenance, confidence, and review decisions. Approval can create a private fragment, Flow, or public definition only after interface and safety review.

### Work

1. Define recording-mapper and proposal contracts.
2. Preserve links to observations, mapper/version, output ID, confirmation evidence, and reviewer decision.
3. Add proposal rendering/review in the Flow editor.
4. Translate approved proposals into output-native nodes, policy regions, or composite fragments.
5. Test that mapped action inputs are confirmation-capable but never state-eligible.
6. Define invalidation when an importer changes/removes a mapped output or node definition.

### Acceptance criteria

- Every recording-derived action refers to a registered output ID.
- Users can inspect proposal provenance and success confirmation.
- Evidence remains immutable after a generated Flow is edited.
- Unreviewed proposals cannot silently become public nodes.

## 11. Retire Task/Routine terminology and legacy persistence

**Status:** implemented through the compatibility-retirement boundary and
validated 2026-08-07. New writes and authoring use canonical Flows; legacy
reads and non-destructive migration remain until the documented schema-major
physical-removal gate is satisfied.

**Goal:** finish only after compatibility, data safety, and operational support are proven.

### Preconditions

- Canonical Flow persistence, execution, publication, and migration have passed a compatibility release.
- Supported importer integrations and recorded-policy Flows are tested against Flow adapters.
- Operators have inspect/migrate/verify/rollback with backups.
- Docs/examples/reference contain no new Task/Routine authoring guidance.

### Work

1. Remove Task/Routine creation controls and public creation endpoints.
2. Deprecate legacy types/endpoints with migration diagnostics.
3. Remove legacy write paths after the compatibility window.
4. Remove legacy read adapters only in a later schema-major release or after explicit migration is recorded per project.
5. Preserve immutable migration/audit records.
6. Delete obsolete palette classes, UI labels, tests, and docs only after replacement coverage exists.

### Acceptance criteria

- No new persisted artifact depends on Task/Routine ownership.
- Every supported legacy project has a documented conversion path.
- Post-migration APIs, palette taxonomy, runtime terminology, and docs are simpler.
- Removal does not weaken domain IO safety, traces, or scope separation.

## Detailed implementation specifications

This section is the implementation contract for the numbered plan. It removes
ambiguity that would otherwise lead to incompatible storage, runtime, and UI
choices across later slices. “Implemented” records the current state; it does
not waive any listed compatibility or safety rule.

### 1. Canonical Flow contract

**Status:** implemented; extend additively only.

- A Flow has one stable `flowId`, one owning `projectId`, one scope, one source
  owner (`visual` or `code`), and an IR consisting of node instances and edges.
  It never has a Task or Routine owner field.
- The interface is the public boundary: port IDs are stable machine keys; names
  are display names; value types are limited to primitives, JSON, arrays,
  records, named schemas, and `unknown`. Defaults must satisfy the declared
  type. Errors and variables have equally stable IDs.
- A Flow draft may change freely subject to validation. A public publication is
  a separate immutable versioned snapshot. The snapshot includes its digest,
  graph, interface, declared errors, scope, source provenance, timestamp, and
  publisher identity once identity/audit ownership is added.
- Validation must reject duplicate IDs, dangling edges, incomplete port
  bindings, invalid interface/default values, invalid source metadata, invalid
  scope, and malformed publication state. It should produce structured issue
  codes and paths suitable for the editor.
- The factory defaults to a global, private, visual, manual Flow with a draft
  publication state. Importers may not alter those semantics by supplying a
  domain-specific base type.
- Any future fields—regions, code source references, publication history, or
  marketplace metadata—must be optional/additive and versioned, so existing
  saved Flows remain readable.

### 2. Node definition and registry contract

**Status:** implemented and validated, including trusted-local importer runtime
binding, capability enforcement, and recording-derived definitions.

- A definition contains immutable identity/version, display/category metadata,
  input/output ports, parameter schema, source provenance, availability scope,
  capability flags, runtime capability requirements, and safety requirements.
- Source variants are framework built-in, importer-native, published composite,
  and reviewed recording-derived. A definition describes behavior; it never
  embeds importer implementation code in FluxIQ storage or the web client.
- The registry resolves only definitions valid for the active Flow scope and
  runtime/permission context. Domain definitions require an exact domain match;
  global definitions never acquire domain access merely because a caller is
  domain-scoped.
- Importer manifests are declarative and validated before registration. Their
  nodes must identify the same domain as the manifest and cannot masquerade as
  global, built-in, or composite nodes.
- Missing or incompatible definitions are diagnostics, not fallback execution.
  A persisted node keeps its definition ID/version and is rendered as blocked
  until a compatible definition is available.
- The palette groups definitions by capability/category rather than old
  Task/Routine ownership. All executable domain action nodes remain subject to
  the IO output-ID and confirmation rules.

### 3. Legacy compatibility specification

**Status:** implemented as pure read adapters; no destructive conversion.

- The catalog combines canonical Flows with synthetic legacy Flow entries. A
  legacy Task becomes a migrated Flow preserving policy graph, recordings, and
  task identity; a Routine becomes a migrated Flow preserving its task links.
- Adapted IDs are collision-safe and deterministic (`legacy.task.*` and
  `legacy.routine.*`). Provenance stores the original artifact ID and original
  Flow document ID where present.
- Adapted entries are read-only. Editing, deleting, publishing, or changing
  their interface must never write through to a legacy Task/Routine document.
- Existing task/routine APIs and runtime behavior remain operational during the
  compatibility period. The compatibility layer is presentation and migration
  input—not a behavior rewrite.
- Deep links and historical traces resolve through provenance. UI surfaces use
  the term “legacy Flow” and identify its original kind only as support detail.
- Tests cover empty legacy projects, mixed catalogs, duplicated names/IDs,
  recording/policy references, and re-opening data after a canonical migration.

### 4. Persistence, migration, and API specification

**Status:** canonical Flow CRUD and non-destructive migration implemented.

- Canonical Flows live in the Automation Studio repository family and are
  isolated by `projectId`; project scope is verified server-side on every
  create, read, save, delete, publish, and runtime operation.
- The public API exposes create/list/get/save/delete/publish plus inspect and
  apply migration. Mutating calls require `flows.write` and the established
  PIN/identity authorization path. Read calls require program read access.
- Migration first reports candidate outcomes. Apply creates provenance-bearing
  canonical copies and a durable ledger/backup identity; it never deletes or
  rewrites legacy sources. Repeating the same migration reports already
  migrated entries rather than duplicating them.
- A migration failure must be transactional where the repository supports it;
  otherwise it records partial outcomes and leaves every source artifact
  readable. Recovery guidance identifies the migration ID and source IDs.
- New authoring writes only canonical Flows. Legacy generic artifact endpoints
  remain available only for compatibility and must not become the default UI
  write path again.
- Repository tests must cover interruption, repeated application, mixed
  global/domain projects, foreign project IDs, and a project reopening from the
  persisted SQLite layout.

### 5. Flow-first editor specification

**Status:** implemented and validated 2026-08-07.

- The project tree has a Flows root, Recordings/Evidence, Proposals, and
  Configurations. New Task/Routine creation controls do not exist. Canonical
  Flow catalog entries are editable; adapted entries carry a legacy/read-only
  label and offer migration guidance.
- Flow creation presets map to the same artifact: blank visual, deterministic,
  recorded, integration, scheduled, API endpoint, and reusable component. Code
  ownership is entered through the editable config/source ownership surface,
  not through a Flow canvas tab. A preset supplies only safe default
  metadata/nodes; it does not bypass validation or grant capabilities.
- The editor owns one dirty state spanning graph and node configuration. Flow
  identity, interface, visibility, publication intent, runtime defaults, source
  ownership, and node-contributed configuration belong to the config surface.
  Navigation, project switch, close, refresh, or run must prompt when any part
  is dirty.
- The inspector exposes Flow identity, scope, source owner, source file,
  origin, interface, visibility, publication history, dependencies, and
  compatibility warnings. The global inspector is the only properties/detail
  surface for Flow editor selections; mode-specific custom widgets must extend
  it rather than adding a second inspector inside the canvas. The graph canvas
  remains shared by conventional, policy, and composite nodes.
- Palette order is: framework built-ins, integrations/importer nodes,
  domain nodes, public Flows, project-local nodes, code, then policy/evidence.
  It is resolved from scope/capability/permissions rather than static client
  assumptions.
- Global pages must show global data plus explicitly exportable facilities only;
  a domain page can show its domain content plus global facilities allowed by
  registry scope. Domain-private project data never appears in global results.

### 6. Composite publication and Call Flow specification

**Status:** implemented after design review; versioned composite snapshots,
scope authorization, and nested execution are active.

- Publication versions are append-only records keyed by `(flowId, semver)`.
  Publishing an existing version with the same digest is idempotent; publishing
  the same version with a different digest fails. Deprecation marks a version
  without changing its snapshot. The current latest-publication field is
  supplemented by the durable standalone publication index.
- A publication snapshot freezes graph IR, interface, errors, scope,
  capabilities/dependency manifest, digest, timestamp, author, and changelog.
  Draft edits never modify a snapshot. Every Call Flow instance pins exactly one
  version and digest.
- Call Flow inputs and outputs are explicit. A child receives only declared
  input bindings and interface defaults—never ambient parent variables. Only
  declared output bindings and declared error routes leave the child. Unbound
  child errors fail the call node.
- Same-domain calls are allowed only to public pinned versions. Domain-to-global
  calls are allowed only when the global target’s capabilities are globally
  available. Domain-A-to-domain-B calls are denied in the first release.
- Global-to-domain calls are a first-class explicit operation because global
  orchestration is a FluxIQ requirement. The Call node names the domain; the
  runtime must have that importer/domain bound; the caller must carry a
  domain-execution grant; and the target snapshot’s required capabilities must
  be available. A global Flow never inherits a domain by implication.
- The compiler produces a dependency graph from pinned snapshots before run.
  It rejects direct and indirect cycles, missing/deprecated versions according
  to policy, invalid port types, unavailable runtime capability, and denied
  cross-scope grants.
- Cancellation propagates parent-to-child. A child timeout is bounded by the
  caller’s remaining deadline. Child retries retry child nodes; a caller retry
  re-invokes the whole pinned child. Trace records parent run/node, child run,
  target flow/version/digest, bindings, status, and error/recovery route.
- The editor provides publish, deprecate, version-history, used-by, dependency,
  call drill-in, and explicit reviewed-upgrade surfaces. It must never silently
  move a caller to a newer version.

### 7. Execution region specification

**Status:** implemented and validated 2026-08-07.

- A Flow owns an ordered/named set of regions: deterministic, trigger/event,
  and policy. Nodes/edges belong to exactly one region unless a typed handoff
  edge crosses an explicitly declared region boundary.
- Region contracts declare entry and exit ports, local variables, timeout and
  cancellation behavior, required runtime capabilities, and trace policy.
  Regions are compilation concepts, not new top-level artifacts.
- A policy region contains the existing evidence, eligibility, output action,
  confirmation, retry, and recovery semantics. Action-bound inputs remain
  confirmation observations and are prohibited from policy state eligibility.
- A deterministic-to-policy handoff supplies an explicit state/evidence
  context; a policy-to-deterministic handoff supplies typed selected outputs,
  outcome, and explanation. Missing handoffs are compile errors.
- The compiler emits one execution plan with region transitions. It must retain
  policy rejection/selection evidence and conventional node traces together.
- Tests cover all handoffs, cancellation and recovery across a boundary, absent
  confirmation, and rejection of raw/unregistered actions or mapped inputs as
  state conditions.

### 8. TypeScript DSL and compiler specification

**Status:** implemented and validated 2026-08-07.

- `defineFlow` is a declarative SDK that constructs canonical IR; it is not a
  general script runner. It supports interface declarations, nodes, edges,
  Call Flow pins, regions, policy declarations, and declared dependencies.
- A visual-owned Flow is stored IR and writes read-only/exportable TypeScript.
  A code-owned Flow stores a constrained module reference and generated IR;
  conversion between ownership modes happens through Flow configuration, is
  explicit, reviewed, and lossy only where disclosed. There is never two
  mutable authorities.
- Compilation normalizes IR deterministically, resolves pinned composites,
  validates scopes/capabilities/ports/regions, and emits a digestable execution
  plan. Same source plus same dependency pins must produce the same plan.
- Source diagnostics include module, line/column where available, Flow path,
  severity, and a remediation message. Invalid source is never run.
- Module resolution permits only approved FluxIQ SDK imports and explicitly
  declared dependencies. It does not infer filesystem, network, environment,
  or importer access from source text.
- CI commands validate/build DSL sources without starting the web editor or
  executing untrusted Flow code.

### 9. Code Node and importer SDK specification

**Status:** implemented and validated 2026-08-07 using the trusted-local trust model. Untrusted/community code execution remains disabled.

- A Code Node is a typed opaque node with declared ports, source reference,
  timeout, cancellation support, log policy, error contract, and required
  capabilities. Its internal code is not converted back into graph nodes.
- The initial trust model must be stated precisely. Trusted local Node.js is
  acceptable only when labelled trusted-local; it must never be marketed as a
  sandbox. Untrusted/community code needs actual isolation before execution.
- Permission grants are least-privilege and explicit: network destinations,
  secret handles, filesystem roots, process access, and child-process access
  are separate capabilities. Denial is a traceable runtime failure.
- Importer SDK declarations cover native node definitions, implementations,
  recording mappers, target resolvers, comparators, schemas, and editor hints.
  Core receives contracts and identifiers, never importer-specific behavior.
- Importer output/action nodes use the existing IO registration and confirmation
  mechanism. A Code Node cannot forge an arbitrary output ID or reclassify an
  action-confirmation input as policy state.
- Tests cover denied capability, timeout/cancellation, missing implementation,
  port/type boundaries, manifest version mismatch, and audit/trace redaction.

### 10. Recording-derived proposal specification

**Status:** implemented and validated 2026-08-07.

- An importer recording mapper transforms raw observations into semantic,
  domain-owned proposals. Core persists mapper ID/version, source observation
  IDs, registered output ID, parameters, expected confirmation, confidence,
  evidence links, and reviewer decision.
- A proposal is not executable and is not a public node. Approval creates a
  private Flow fragment, approved node instance, or public definition only
  after interface, output safety, and provenance review.
- Generated action candidates must reference a currently registered output ID;
  their mapped source inputs remain confirmation-capable at runtime but are
  never eligible as policy-state inputs.
- Editing the resulting Flow never mutates raw evidence. The Flow stores
  immutable proposal/evidence references and records later manual changes as
  separate provenance.
- Removing or materially changing an importer mapper/output invalidates affected
  proposals and warns on dependent drafts/publications; existing historical
  evidence remains readable.
- The editor presents proposal confidence, evidence, confirmation expectation,
  mapper version, diff/approval decisions, and an explicit destination Flow.

Implementation notes:

- The importer SDK now has typed recording observations/candidates, and the
  trusted-local runtime exposes mapper identity together with package/version.
- `RecordingFlowProposalArtifact` is a recording-owned pipeline artifact with
  inert proposed, approved, rejected, and invalidated states.
- Review endpoints support explicit existing/new Flow destinations and
  private/public reviewed node definitions. Public definitions are shared only
  within the matching global/domain scope.
- Approved definitions materialize through `builtin.policy.action`, preserving
  registered-output dispatch and action-input confirmation. Candidates always
  persist `policyStateEligible: false`.
- Revalidation removes stale definitions from execution/palettes and records
  warnings on affected Flow catalog entries without altering historical raw
  evidence.

### 11. Legacy retirement specification

**Status:** implemented and validated 2026-08-07 as a compatibility-first
retirement. Physical source/read-adapter deletion remains intentionally gated to
a future schema-major release with real project retention evidence.

- Define a compatibility window and observable completion criteria: supported
  importers migrated/tested, project migration inventory clean or intentionally
  deferred, backup/restore proven, docs/examples Flow-first, and support runbook
  published.
- First remove public Task/Routine creation UI and mark legacy endpoints/types
  deprecated with machine-readable migration diagnostics. Do not delete read
  adapters or source data in this stage.
- Later disable legacy writes behind an explicit schema/version gate. Legacy
  read adapters remain until a schema-major release or each project records a
  successful migration and retention policy permits removal.
- Preserve migration ledgers, source-to-canonical provenance, immutable audit
  events, historic trace references, and rollback/export tools throughout.
- Delete old palette groups, UI labels, tests, and docs only after equivalent
  Flow/policy/composite coverage exists. This is a simplification step, never a
  way to avoid migration support.
- Release validation includes migrated and unmigrated projects, global/domain
  isolation, recordings, output confirmations, published composites, and an
  upgrade/rollback rehearsal.

Implementation notes:

- New policy-proposal approvals write canonical recorded-origin Flows; reading
  legacy Tasks no longer embeds graphs by rewriting their source documents.
- Legacy Task/Routine types and generic write endpoints are deprecated. Their
  API responses expose machine-readable compatibility/write-lock diagnostics.
- Each project has a persisted retirement report, importer/deferment evidence,
  observable completion criteria, and an explicit `0.2` schema write lock.
- Migration creates a digest-verified legacy export before canonical writes.
  Ledgers retain canonical digests and provenance; append-only audit events
  record backup, verification, migration, rollback, evidence, and sealing.
- Rollback has separate plan/apply endpoints and refuses edited, published, or
  provenance-mismatched canonical Flows. Legacy source and read adapters remain.
- The support runbook documents the compatibility window, upgrade sequence,
  evidence collection, rollback rehearsal, and future physical-removal gate.

## Cross-cutting validation

| Area | Required evidence |
| --- | --- |
| Persistence/migration | mixed legacy/new fixtures, dry run, idempotent apply, backup/recovery, interrupted transaction tests |
| Scope/exports | global/domain separation, private rejection, same-domain public availability, explicit cross-scope validation |
| Graph validity | typed ports, missing-definition diagnostics, interface checks, cycles, version pins |
| Policy/IO | output-ID-only dispatch, mapped-input confirmation, prohibited mapped-input state eligibility, explainable traces |
| Code authoring | DSL/visual equivalence, deterministic compiler output, source diagnostics, source-mode conversions |
| Runtime | nested traces, cancellation/timeout/retry propagation, version snapshots, dependency invalidation |
| UI | presets, scoped palette, unsaved-change prompts, legacy deep links, accessible diagnostics |
| Documentation | architecture, persistence/API/SDK/integration/migration guidance and deterministic reference updates |

At each point, run focused checks plus the repository quality gates when feasible: `pnpm check`, `pnpm test`, `pnpm build`, and `pnpm docs:check`.

## Recommended first implementation slice

Implement points 1--4, then stop for review:

1. canonical Flow/port/scope/visibility types and validators;
2. node-definition contract and registry adapter;
3. read-only legacy Task/Routine adapters; and
4. canonical storage/API write path plus inspectable migration plan.

This establishes stable contracts before changing execution semantics, enabling public composites, or enabling code execution.

## Decision log

- 2026-08-07: Part 4 implemented: canonical Flows and migration ledgers now
  use the Automation Studio SQLite repository family. Dedicated Flow APIs
  create, save, list, delete, publish, inspect migration, and apply migration.
  Legacy generic artifact endpoints remain operational. Migration creates
  provenance-preserving canonical copies and leaves legacy source artifacts
  untouched; repeated runs are idempotent and ledger-backed.
- 2026-08-07: Part 3 implemented additively: pure Task/Routine-to-Flow
  adapters and a unified catalog resolver now produce marked read-only migrated
  Flows with stable provenance. This work does not persist converted Flows or
  alter current API, storage, editor, deletion, or runtime behavior.
- 2026-08-07: Part 2 implemented additively: a canonical node-definition
  contract and scope-aware registry now adapt existing built-ins and accept
  declarative importer manifests. Importer definitions are constrained to the
  registered domain and are filtered by runtime capability and permission.
  At that implementation slice, the executor and built-in registry remained
  unchanged and importer code loading/execution was deferred. Part 9 has since
  implemented the trusted-local importer SDK/runtime path.
- 2026-08-07: Part 1 implemented additively: owner-independent Flow, typed
  interface, global/domain scope, private/public visibility, publication,
  provenance, source ownership, factory, and structural validator were added.
  Existing Task/Routine documents, storage, APIs, and editor behavior remain
  unchanged until the later compatibility and migration slices.
- 2026-08-07: Flow is the single future executable composition type; Task and Routine are legacy compatibility concepts.
- 2026-08-07: Conventional workflows and FluxIQ evidence/policy nodes are both first-class. FluxIQ remains differentiated by output safety, observations, expectations, recovery, and explainability.
- 2026-08-07: Initial Flow visibility is `private | public`; public is reusable within the same global/domain scope. Broader sharing is deferred.
- 2026-08-07: Scriptability uses canonical Flow IR and a declarative TypeScript DSL. Generated code is not automatically bidirectionally editable; code-owned Flows are an explicit mode.
