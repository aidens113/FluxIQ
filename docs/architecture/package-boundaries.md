# Package Boundaries And Distribution

FluxIQ has three public ESM packages. They are compiled before use; consumers
must not depend on repository TypeScript sources, workspace aliases, or a
TypeScript runtime loader.

| Package | Owns | Environment | Runtime dependencies |
| --- | --- | --- | --- |
| `@fluxiq/contracts` | JSON primitives, program API schemas, client-gateway protocol, and external Automation Studio recording contracts | Browser and Node.js | `zod` |
| `fluxiq` | Domain-neutral framework runtime, global programs, storage, migrations, and host integration | Node.js 22 or newer | contracts, QR generation, and native SQLite |
| `@fluxiq/client-gateway-websocket` | WebSocket transport and browser-facing client helpers | Browser and Node.js 22 or newer | contracts only |

The contracts package is the dependency seam between browser clients and the
framework. It must not import the runtime. The WebSocket client must not pull
in `fluxiq`, SQLite, TypeDoc, QR generation, React, or Node filesystem modules.
The runtime preserves its existing contract-related exports as compatibility
re-exports, so current importing repositories do not have to change all imports
at once.

## Domain Ownership

These packages are domain-neutral. An importing repository defines its domain
manifest, program root, names, labels, adapters, and private assets. Framework
terms such as "global editor" describe shared ownership and persistence scope;
the imported UI still uses the active importer's domain manifest for visible
naming and branding.

## Exports And Builds

All packages are ESM-only and expose conditional `types` and `import` entries
from `dist/`. Relative source imports use TypeScript extensions during local
development and are rewritten to JavaScript extensions in emitted code and
declarations. Package tarballs include only compiled output and a package
README.

The runtime keeps its established public subpaths during the 0.1 compatibility
period. New subpaths should be added only for an independently useful surface;
internal folders are not automatically public API.

`fluxiq/automation-studio/action-permissions` is the browser-safe display seam
for a permission request Core already produced. It exports the consequence
phrases, request type, and strict request parser only. Browser panels use this
subpath instead of reaching into runtime source or importing the Node-oriented
`fluxiq/automation-studio` barrel; permission declaration, gating, instruction
authority, services, and storage remain server-only implementation surfaces.

`fluxiq` is a Node.js package, but one of its subpaths is not. The runtime is
the only place the element matcher lives, and a host that scores element
candidates does so where the elements are — in a browser. So
`fluxiq/automation-studio/fingerprinting` publishes the fingerprint contracts
and `createAutomationStudioElementMatcher` on their own, away from the
`fluxiq/automation-studio` barrel, which reaches `node:crypto` and
`node:perf_hooks` through `dsl/` and `testing/` and therefore cannot be
resolved by a browser bundler at all. The subpath's compiled graph is three
files with no runtime imports of any kind; that is not a claim about today's
code but an invariant, checked by
`src/programs/automation-studio/fingerprinting/tests/index.test.ts`, which
fails if any module in the closure gains a value import. The alternative — a
second matcher written in the browser host — would give two different answers
to the same question within a release.

Two of that matcher's scoring constants are no longer Core's to change alone.
`MISSING_STABLE_IDENTIFIER_SIMILARITY` (−0.1) and
`CONTRADICTED_STABLE_IDENTIFIER_SIMILARITY` (−0.8) in
`fingerprinting/element-fingerprint.ts` are calibrated against a spec in the
downstream FluxIQ Web Extension repository: returning the first to its former
−0.55 was measured there to turn the `reworded-aria` case in
`apps/extension/e2e/content/tests/identity-resolution.spec.ts` red. Changing
either weight is therefore a cross-repository change. Re-measure that spec, push
both `dev` branches in the same work unit, and give the release a minor version
and a migration note — these numbers reach a consumer as `confidence`, and the
runtime's own safety gates read it.

TypeDoc is an optional runtime peer. Repository development installs it to
generate API reference, while normal runtime import and setup work without it.
Native `sqlite3` remains external and is installed for the consumer platform.

## Validation And Release Policy

Run the complete distribution gate with:

```bash
pnpm package:validate
```

It builds the packages, checks their manifests and type resolution, packs local
tarballs, rejects source/private files, installs clean Node and browser
consumers, imports every runtime export, performs global/domain SQLite writes,
exercises a layout-v1 to layout-v2 migration, type-checks without workspace
paths, and browser-bundles the WebSocket client while checking its dependency
graph. CI repeats the checks on Node 22 for Windows and Linux.

`@fluxiq/contracts` is at version `0.2.0` and `fluxiq` at `0.7.0`;
`@fluxiq/client-gateway-websocket` is at `0.1.0`. Before 1.0, compatible
changes increment the patch version and intentional API breaks increment the
minor version with a note under [Migration Notes](#migration-notes).
"Compatible" is judged on what a consumer observes, not on the type surface: a
change that moves a published number a host gates on is a minor increment even
when every signature is identical, and it takes a migration note like any other
break. Registry publication, tags, signing, and provenance are separate release
actions and are not performed by validation.

All public packages carry the repository's source-available FluxIQ license and
include an exact copy in their tarball. Commercial use outside the community
terms is available only through a separate written agreement. Registry
publication, tags, signing, provenance, the final legal licensor identity, and
commercial contract templates remain separate owner-controlled release work.

## Migration Notes

### Next minor (unreleased): judges see the page before, and a re-author may find nothing to change (`fluxiq`)

t286 (week review W4, W17, R2-C8). Read this entry if you read a run's
`resultReauthor` marker or a result summary, or call the re-author build or the
dry-run gate directly.

**Added.**
- `AutomationStudioRunResultSummary.startView` and
  `AutomationStudioFlowDraftTestReport.startView`: the page before the run or
  test did anything, screened as `endView` is; `observedStateKeys` on
  `AutomationStudioResultVerificationPorts` (optional: absent, the end view's
  keys are used).
- `resultReauthor.outcome: "nothing_to_change"` with `reason` (or
  `reasonWithheld`): a wrong-answer re-author completed its seeded draft
  unchanged; nothing was approved, applied, held or re-run, and the check's
  verdict stands (`recovery/refuted-result/nothing-to-change.ts`). The build
  ends there only where its completion check asks the watch
  (`AutomationStudioReauthorEndingWatch`, the optional fifth argument of
  `AutomationStudioReauthorBuildDependencies.generate`).
- `AutomationStudioBuildTestVerdict` and a repair judgement's `judge` carry
  `checkedRows` beside `checked`; `automationStudioRequestRowsAfterRerun` says
  which of them a rerun of the read keeps.

**Changed.**
- A finished run's step changes skip a diff that reports `documentChanged`, not
  any `locationChanged` (a diff without `documentChanged` keeps the old rule).
- `automationStudioFlowDraftStepWithholdsLater`: a verified step that moved the
  target excuses later steps only when its own declaration names something
  lasting; one verified only for an instructed act claim lets the next step be
  put back on its own page.
- No model is shown a read condition's `testedLabel`.

### Next minor (unreleased): a paired client's run pays only for the checks that judge a repair (`fluxiq`)

MVP item 23. A run a person asked the model into has its result judged with
that person's key on every run. The extension's Automations Run is such a run,
and its person never agreed to pay for routine sampling. Read this entry if you
call `runRuntimeSession` or `run-runtime-session` from a paired client.

**Added.**
- `resultCheckCallerPays?: "every_run" | "repair_checks"` on
  `runRuntimeSession`'s input. `repair_checks` keeps the caller's key to the
  checks that judge a repair (`core.check.after_repair`,
  `core.check.after_refutation`). Absent is `every_run`, as before.

**Changed.**
- `run-runtime-session` sets `resultCheckCallerPays: "repair_checks"` when the
  actor is a paired client (`client-gateway:` session) mapped to an unlocked
  session. Its routine checks then fall to the Flow's standing result-check
  authorization, or are not made at all. A person's own session is unchanged.
- A re-authored Flow's re-run (`rerunRepairedFlow`) is now judged under the
  repaired-run decision, as the resumed retry already was, so the caller pays
  for it under `repair_checks`. The recorded `resultCheck` code is still the
  one taken when the run started.

### Next minor (unreleased): a re-authored Flow is kept only after a judged whole run (`fluxiq`)

t267, blocker 5. Both re-author routes -- a result the check refuted, and a
step the patch ladder could not repair -- approved *and applied* their
extend-mode Flow Bootstrap edit inside the build, then re-ran the stored Flow
and judged it. A re-run that was refuted or failed left the unjudged edit on
the Flow, and an extend cannot be reverted. Read this entry if you read a run's
`resultReauthor` marker, or call the re-author or re-run helpers directly.

**Changed.**
- The edit is approved and *held*: validated, unapplied. `resultReauthor`
  records `held: true` on the latest fields and the attempt, and
  `applied: true` is written only once the run's final judged session ended
  `succeeded` with a performed verdict of `answers` and its pass ran the held
  edit. Otherwise the edit is rejected, never applied, and the marker says why
  in `notAppliedReason` (the runtime-patch reasons, `run_errored` for a run
  that threw, and `superseded`); a rejection that is itself refused is
  `rejectRefused`. Left validated, it would stand pending and refuse every
  later build of the Flow.
- The re-run from the start runs the held graph as an unapplied candidate when
  the held topology is exactly the selected Subflow, on the same graph Flow,
  with every router rule targeting it. Any other shape is applied before the
  re-run, as before, and the marker says why in `appliedBeforeJudged`. A pass
  that ran a held edit names it in `heldReauthorAdaptationId` on the session and
  on the detail's `repairedRerun`.
- A later re-author attempt in the same run first rejects an earlier held edit
  still waiting, and marks it `superseded`: a pending Flow Bootstrap adaptation
  refuses every new build of the Flow (`flow_bootstrap.pending_adaptation_exists`).
- Not gated on `behavior.promoteAdaptations`: the route is authorised by its
  caller.

**Added.**
- `settleAutomationStudioRunJudgedReauthor`, `settleAutomationStudioJudgedReauthor`,
  `AUTOMATION_STUDIO_HELD_REAUTHOR_RAN_KEY` and their types
  (`service/runtime-adaptation/judged-reauthor.ts`).
- `automationStudioRefutedResultHeldReauthor`,
  `automationStudioRefutedResultWaitingReauthors` and
  `automationStudioRefutedResultReauthorMarked` (`recovery/refuted-result/held-reauthor.ts`).
- `automationStudioHeldReauthorCandidate` (`service/runtime-adaptation/held-candidate.ts`),
  and two new re-run `declinedCode`s: `repair_rerun.held_reauthor_unreadable`
  and `repair_rerun.held_reauthor_apply_failed`.
- `hold: true` on `automationStudioReauthorRefutedResult`, and `held` on
  `automationStudioRefutedResultReauthored`.

**Changed signatures.**
- `AutomationStudioReauthorBuildDependencies` (and the port dependencies built
  on it) drops `apply` and requires `reject`.
- `AutomationStudioRepairRerunPorts` requires `getFlowBootstrapAdaptation` and
  `applyFlowBootstrapAdaptation`.

### Next minor (unreleased): a target override that proved nothing is kept on its judged whole run (`fluxiq`)

A Flow built from an instruction declares nothing a trial can check, so a
runtime target override whose changed step succeeded there used to end its
trial `unverifiable` with `notResumableCode: "no_evidence"`, and stop: the run
did not carry on, and the promotion and apply gates refused an unproved change.
The judged whole run is now that change's evidence. Nothing changes for a
change whose trial proved or contradicted it, for any other patch kind, or for
a trial with a failed or unknown check. Read this entry if you read runtime
patch receipts or call the promotion gate yourself.

**Added.**
- `awaitsJudgedRun?: true` on the `unverifiable` member of
  `AutomationStudioRuntimePatchVerification`. It is set only for a
  `temporary_target_override` whose trial verdict is `unverifiable` with
  `notResumableCode: "no_evidence"`. The trial still records no validation
  result, `restoredExpectedState` stays false and the adaptation stays in
  `testing`.
- `awaitsJudgedRun?: boolean` on `AutomationStudioAdaptationPromotionGateInput`.
  When it is true and the confidence is `unverified` with no `lastFailure`,
  `decideAutomationStudioAdaptationPromotionGate` skips its trial-evidence
  refusal; a person's settings (manual mode, the first manual review, `mixed`
  for a high-risk change) still refuse. `decideAutomationStudioBootstrapApplyGate`
  is unchanged.

**Changed.**
- `retryOriginalAction` (on the execution result, its receipt and the
  adaptation's metadata) is now true for a verification that awaits its judged
  run, as it is for a `verified` one; never for `temporary_action_sequence`.
- The run resumes at the trial's resume point for such a receipt, under every
  other resume-point rule. The promotion decision records
  `evidence: "judged_whole_run"` when it allows one unattended.
- When that run ends `succeeded` and is judged to answer, the settle records
  `{ runId, status: "succeeded", kind: "trial", basis: ["judged_whole_run"] }`
  in the adaptation's `validationResults` before the apply, so the apply's
  evidence gate passes. A refuted, unjudged, failed or cancelled run records
  nothing and leaves the change unapplied as before.

### Next minor (unreleased): a domain adds its own system instructions (`fluxiq`)

A domain bound through `llmEvidenceRuntime` can now register instructions that
Core adds to the system message of every model request made for that domain's
work. Nothing changes for a host that binds none: every system message is byte
for byte what it was. Read this entry if a domain binds an evidence runtime, a
host writes its own LLM provider, or a test pins a system message.

**Added.**
- `systemInstructions?: AutomationStudioLlmDomainSystemInstructions` on
  `AutomationStudioLlmEvidenceRuntimeBinding`, `{ version, text }`. `version`
  matches `^[a-z0-9][a-z0-9._-]{0,63}$`; `text` is not blank, is at most
  `AUTOMATION_STUDIO_LLM_DOMAIN_SYSTEM_INSTRUCTIONS_MAX_LENGTH` (4,000)
  characters, and has no control character but a line feed. The service checks
  it in its constructor and in `bindLlmEvidenceRuntime`, and throws there; a
  domain can run the same check itself with
  `assertAutomationStudioLlmDomainSystemInstructions(value, domainId)`.
- `domainInstructions?: { domainId, version, text }` on
  `AutomationStudioLlmTaskRequest`. It is never part of the user payload. A
  provider that builds its own system message should place `text` there; a
  provider's `measureInput` counts it.
- `automationStudioLlmProviderWithDomainInstructions(provider, instructions)`
  and `automationStudioLlmResolverWithDomainInstructions(resolver, binding)`.
  The service wraps the execution resolver and the result-check resolver with
  the second, so every provider it resolves stamps `domainInstructions` on each
  request it runs or measures: evidence decisions, Flow Bootstrap, repairs,
  result verification, the build judge and the standing repair authority.

**Where the text goes.** The DeepSeek adapter's system message is Core's
JSON-only and injection rules with the schema instruction, a blank line, the
domain's text, a blank line, then Core's task prose. The chat's interpreter
gets the text after the panel's capability vocabulary and before the project's
Flows; its answer-shape rules stay last. Neither replaces any of Core's rules.

### Next minor (unreleased): the model sees the whole page (`fluxiq`)

Core no longer caps, ranks or trims what a model call is shown. Only two
bounds remain: secret screening, and the run cost ceiling
(`FLUXIQ_LLM_RUN_COST_CEILING_USD`, $0.10 by default; it was $0.25). A request
over the model's context window (1,000,000 tokens) is refused before it is
sent, with its size, and is never trimmed. Read this entry if a domain binds an
evidence runtime or harness options, a host supplies its own LLM provider, or a
test pins a limit below.

**Removed.**
- `maxEvidenceBytes` on the `executeTool` input of
  `AutomationStudioLlmEvidenceRuntimeBinding`, on
  `AutomationStudioHarnessOptionExecution`, and on the harness-option loop
  binding. A domain that passes it in an object literal fails to compile.
- `withheldPackets` on the explored-evidence slot. A packet Core will not send
  stands in the list as `{ schemaVersion:
  "automation-studio.explored-packet-withheld.v1", withheld: <reason> }`.
- `AUTOMATION_STUDIO_RESULT_SUMMARY_LIMITS`, the failure-evidence byte limit
  (6,000 bytes), the recovery context byte budget and its omission reason
  `byte_budget`, the result summary's 4,000-byte ceiling and sampling, the
  repair parameter screen's depth, key, item and length caps, the reusable
  context's five-record and 8,192-byte caps, and the 24,000-byte evidence
  context window.
- `AUTOMATION_STUDIO_RECOVERY_DEFAULT_TOKENS_PER_SHARE`. A recovery nobody
  asked for no longer has a token pot of Core's own (it was 144,000 tokens):
  its pot is the per-call total times the shares, lowered by a
  `maxTokensPerRun` a person set or a resolver's `maxTotalTokensPerRun`.
- The default Flow settings' `trainingModeSettings.budgets.maxTokensPerRun:
  12000`. A new Flow carries no token cap and is created with
  `tokensPerRunDefaultCleared: true`
  (`AUTOMATION_STUDIO_TOKENS_PER_RUN_DEFAULT_CLEARED_KEY`). A stored Flow
  without that key that holds exactly 12,000 has it cleared where it is read
  and where its settings resolve
  (`runtime/service/flow-settings/tokens-per-run-default-migration.ts`);
  any other value stays. The web settings form saves a blank box as no cap
  and writes the key on every save, so a 12,000 a person types stays.
- The caps on what a judgement, a repair and a build decision are told about
  a run: the read account's four reads, eight conditions, six dedupe keys,
  six compared values and its 60- and 200-character cuts; the run record's
  64-condition and 60-character `conditions.seen` bounds; the instructed-act
  checklist's eight acts, four choices per act and 200- and 120-character
  quotes; the completion check's 100 listed steps and 16 read claims; the
  reachability and answerability refusals' 100 and 24 listed steps
  (`stepsWithheld` is gone from both); the unfinished build's 16 codes and
  acts in the judgement a repair reads; and the failed-step brief's 1,200-
  and 6,000-character cuts. `automationStudioResultReadAccounts` returns
  `{ reads }` without `withheld`.
- The node catalog's ranking and budgets: `automationStudioFlowBootstrapCatalogByteBudget`,
  `AUTOMATION_STUDIO_FLOW_BOOTSTRAP_LIMITS.maxCatalogEntries` (100),
  `.maxCatalogBytes` (49,152), `.firstLiveMaxInputTokens` (4,000) and
  `.bootstrapInstructionTokens` (384); the `maxCatalogBytes` and
  `maxCatalogEntries` inputs of `buildAutomationStudioFlowBootstrapContext`,
  the evidence-guided build's 64-entry cap, its 16,000-token catalog
  allocation and the harness input's `flowBootstrap.maxInputTokens`; and
  `catalogSelection.byteBudget`. The catalog is every node the resolution
  offers, in id order, each whole: label, description and every parameter's
  authoring text uncut, with no condensed form. `catalogTruncated` is always
  `false`. An evidence decision is sent every node by name and the full
  entries only of the nodes the build asked `core.describe_nodes` for, and
  neither `catalogTruncated` nor `catalogSelection` is on its payload; that
  is a change of form, not a limit, since nothing is withheld that one
  describe call does not return. The instruction is still read for one thing, a capability it asks
  for that no offered node provides (`missingRequiredTerms`).
- Instruction truncation. The harness carries every instruction whole; it cut
  them to 2,000 tokens by default, 384 for a flow bootstrap and 4,000 for a
  repair build. `tokenBudget` is now only the request's input limit, reported.
- The context packet's counts: `AUTOMATION_STUDIO_LLM_MAX_RECENT_ACTIONS` (the
  last 12 actions) and the DeepSeek pre-flight's check of it, and the 25
  relevant runs, 25 relevant adaptations, 100 Subflows and 100 available
  actions. A packet carries every one, in order. A runtime diagnosis's
  `expected`, `observed` and `changed` are carried back whole, not cut at 500
  characters.
- The conversation caps: `AUTOMATION_STUDIO_LLM_CONVERSATION_MAX_TURNS` (20),
  `AUTOMATION_STUDIO_LLM_CONVERSATION_MAX_BYTES` (4,000) and the 1,500-character
  turn cut on a request's `conversation` slot (`packAutomationStudioLlmConversation`
  takes no `maxBytes` argument); `AUTOMATION_STUDIO_CONVERSATION_TRANSCRIPT_TURNS`
  (the chat's instruction reader read the last 20 turns, each cut at 1,500
  characters); and `AUTOMATION_STUDIO_RECOVERY_CONVERSATION_TURN_LIMIT` (a
  recovery read the first 40). A model that reads a thread reads all of it,
  page after page (`automationStudioConversationWholeThread`). The slot keeps
  `withheldTurns` and `textCut`, always `0` and `false`, so a stored request
  still reads. `AutomationStudioRecoveryConversationReader.getConversation`
  takes `sinceTurnId` and returns `hasMore`.
- The chat's instruction prompt's 60-Flow list: the model is told every Flow.
- The caps on what a refused build decision is told: the completion refusal's
  16 issues and its 6,000-character limit on quoting the refused script back;
  the issue feedback's 16 issues, 300-character paths, 400-character messages
  and 3,000-byte budget on accepted shapes; the 12 exceeded limits listed; a
  parameter contract's first 8 codes; an amendment refusal's 16 refusals and 32
  positions; an unusable decision's 8 issue codes; a refused plan's 12 keys, each
  cut at 40 characters; and the provider-output check's 200 findings
  (`llm_output.finding_limit` is no longer produced). A step name that matches
  several nodes names every near match, in id order; it named the five sharing
  the most words.
- `core.run_node`'s node enum stops at no count; past 400 ids it used to leave
  the names to the catalog.
- `core.prior_adaptations` has no maximum `limit` (it was 20) and no default
  (it was 5): asked without one, the host is asked for every adaptation, and
  `AutomationStudioHarnessOptionHost.listPriorAdaptations` receives `limit`
  only when the model gave one.
- `AUTOMATION_STUDIO_RESULT_REPAIR_DIRECTIVE_LIMITS`. A refutation's repair
  directive carries every finding, every fix line, every column and the
  judgement's own words whole; it held them to 8 findings, 8 fix lines of 300
  characters, 240-character details, 8 columns and 500 characters.
- `getFlowInstructionSet`, which the judgement and the repair read, returns
  every instruction, not the first 100.
- `AUTOMATION_STUDIO_KNOWN_ADAPTATION_LOAD_LIMIT` (25). A run's adaptation
  context reads every adaptation summary, page after page (it read the newest
  100), and loads every record, which the recovery context shows the model. The
  context port's `listFlowAdaptationSummaries` may return `total`; paging stops
  at a short page or at `total`. The stability metrics are computed over all of
  them.
- The reusable-context store's single page. `AutomationStudioReusableLlmContextList`
  gains `offset`, and `AutomationStudioProjectReusableLlmContextStore.listEvery`
  reads every page; `packReusableLlmContexts` uses it, so a model is offered
  every eligible record, not the newest 100.

**Changed.**
- The per-request ceiling
  (`AUTOMATION_STUDIO_LLM_ABSOLUTE_MAX_TOTAL_TOKENS_PER_REQUEST`, and the web
  app's `FLOW_LLM_HARD_MAX_TOKENS`) is the model's window, 1,000,000 tokens; it
  was 64,000. The session-key profile is 992,000 input, 8,000 output,
  1,000,000 total.
- A call whose caller names no token limits gets the same window: 992,000
  input, 8,000 output (`AUTOMATION_STUDIO_LLM_DEFAULT_REPLY_TOKENS`) and
  1,000,000 total (`AUTOMATION_STUDIO_LLM_DEFAULT_TOKEN_LIMITS`); it got 8,000,
  2,000 and 10,000. A limit it names still binds, and the ones it leaves out
  are derived from it. A recovery whose resolver names no limits reserves an
  even share of its purse per call, not a window-sized worst case.
- One estimator measures a request everywhere: UTF-8 bytes / 3. The harness
  measured characters / 4, so a request of about 3 to 4 MB passed the harness
  and was refused by the adapter without its size.
- `AutomationStudioLlmProvider` gains two optional methods. `measureInput`
  returns the request's size as the provider will send it, and the harness
  refuses on the larger of that and the packed request, so its size-carrying
  refusal fires first. `estimateCostUsd` prices a call of a given size, and the
  harness reserves that price against the run's ledger, under the call's cost
  ceiling. A provider without them is measured on the packed request and held
  at its ceiling, as before. The built-in DeepSeek adapter implements both.
- The run ledger reserves each call at its own measured input tokens, not its
  `maxInputTokens`. At the window profile a window-sized reservation was the
  whole purse, and every call after the first was refused.
- The recovery's patch reserve sizes each held call on the largest call the run
  has made, priced by the provider, instead of on the token limits.
- `AutomationStudioLlmProviderError` takes an optional eighth argument,
  `inputSize`. On `llm.provider_input_budget_exceeded` the normalized failure
  carries it, and its message states the size in numbers. Every other
  pre-flight refusal keeps the one safe sentence.
- A credential-shaped explored packet is withheld by the harness, in place,
  rather than refused. The adapter still refuses a slot that carries one.
- The repair parameter screen no longer treats the bare word `key` as a secret,
  so a keyboard step's `key: "Enter"` reaches the repair. `apikey`,
  `secretkey`, `privatekey`, `accesskey` and the other named kinds still
  withhold, including across two adjacent words (`api_key`, `private_key_pem`).
- Reusable context is ordered by creation time, newest first, with no ranking
  by outcome, validation or review.
- `flowParametersWithheld` on a result summary is no longer set by a new
  summary.

### Next minor (unreleased): model calls need no execution grant (`fluxiq`)

LLM execution grants are removed. A model call made while building, exploring,
repairing, verifying or judging, diagnosing or adapting a Flow runs on the
caller's own unlocked Secret Keys key: nothing is issued, leased, preflighted,
digest-checked, confirmed for size, or revoked before or during a provider
call. The grant, purpose, lifetime, high-token and failure-for-the-grant
passages of the 0.6.0 and 0.7.0 entries below describe what was removed. Read
this entry if a host binds a provider resolver, calls the build or runtime
session endpoints, or reads LLM readiness.

**Removed.**
- The endpoints `preflight-llm-execution` and `issue-llm-execution-grant`, and
  their request, response, preflight and grant contracts.
- `AutomationStudioLlmExecutionGrantService`, the `runtime/llm/execution/`
  module, `runtime/llm/grant-capabilities.ts`,
  `runtime/llm/runtime-session-grant.ts`, the grant constants and refusal codes,
  `AutomationStudioBuildAndAdaptExecutionGrant`, and
  `GlobalProgramRuntime.llmExecutionGrants`.
- Readiness `runtime.llmExecutionGrantsConfigured`.
- `llmExecutionGrantId` on `generate-flow-bootstrap-adaptation`,
  `run-runtime-session`, and every other build endpoint.
- The service options `revokeLlmExecutionGrant`,
  `continueLlmExecutionGrantAfterAppliedFlowAdaptation` and
  `closeLlmExecutionGrants`.

**Changed.**
- `automationStudio.bindLlmExecutionProvider(resolver)` takes the resolver
  only. `AutomationStudioLlmProviderResolverInput.executionGrant` is replaced
  by `caller?: AutomationStudioLlmModelCaller` (`{ actorUserId,
  actorSessionId }`, the person whose key pays; not an authorization).
  `createAutomationStudioSessionKeyProviderResolver({ ports })` is the shipped
  resolver: no caller resolves no provider.
- `AutomationStudioLlmProviderResolution` no longer carries
  `permittedConsequences`. Builds and runs carry optional
  `permittedConsequences` on their own input; the recovery's consequence gate
  reads it from there. The gate still asks before a consequential act
  (`permission_required`).
- `generateFlowBootstrapAdaptation` takes `caller` and optional
  `permittedConsequences`; the API endpoint's caller is the request's actor.
- `runRuntimeSession` takes `llmExecution?: AutomationStudioRuntimeSessionLlm`
  (the caller plus an intent from
  `AUTOMATION_STUDIO_RUNTIME_SESSION_LLM_INTENTS`) and optional
  `permittedConsequences`. `run-runtime-session` makes `llmExecution` from a
  `runIntent` sent by a signed-in actor.
- Spend is bounded by the loop budget. The Flow setting
  `adaptationPolicySettings.maxEstimatedCostUsdPerRun`, when set, is the run's
  total estimated-cost ceiling for builds and recoveries; otherwise the
  resolution's default applies.

The Flow-scoped standing result-check authorization for unattended runs is
unchanged.

### 0.7.0: node execution is defensive, provider retry is grant-accounted, and result repair is structured (`fluxiq`)

No export was removed. Public Automation Studio contracts gain optional fields
and new exports, while several existing behaviors change without host opt-in.
Read the whole entry if a host writes an LLM provider or resolver, issues or
displays execution grants, calls the node executor directly, reads result
verification or recovery records, or displays or exhaustively matches action
consequences.

**Provider retry is grant-accounted, and purpose is not task authorization.**
- LLM preflight and issue inputs may carry `providerRetryCount`. Preflight,
  grant, resolution, and public metadata expose a bounded number from zero
  through two, default two, rather than the former literal zero. Resolution may
  report less when the grant's remaining uses cannot fund the retries.
- A provider or resolver must expect several separately authorized attempts for
  one harness request and preserve typed retryability, HTTP status, and refusal
  provenance. Every attempt consumes and settles a real grant use; the last
  remaining use permits no retry.
- Grant purpose remains part of issuance, runtime-endpoint compatibility,
  accounting, and audit metadata. It no longer restricts model work by task
  kind, dry-run, side-effect, or risk flags. An exhaustive purpose/task mapping
  must not recreate that removed gate. The runtime session endpoint still
  accepts only its runtime purposes, and Flow Bootstrap still requires
  `build_and_adapt`.

**Result verification exposes screened flow shape and a repair directive.**
- `AutomationStudioResultFlowStepSummary` carries a bounded label, screened
  `parameters`, and optional dotted `parametersWithheld` paths.
  `flowParametersWithheld` on the result summary distinguishes a flow-wide
  byte-budget omission from a step with no parameters.
- A `does_not_answer` `AutomationStudioResultVerification` may carry the
  structured `automation-studio.result-repair-directive.v1`: Core-authored
  findings and fix lines plus optional screened judgement fields and a
  `withheld` flag. Hosts must not treat it as unrestricted provider prose.

**Default node execution is defensive without host opt-in.**
`executeAutomationStudioNode` now classifies structured failures, thrown values,
and bounded legacy result messages for every built-in, output-dispatch, native,
and composite node. It applies node side-effect safety before repeating work,
honours bounded retry hints and wait budgets, and may continue past a terminal
non-fatal failure when the Flow declares that policy. A host that relied on a
throw escaping the graph run, or on `verification`/`confirmation` always
forbidding retry by stage alone, must instead inspect the recorded attempt and
defence ledger.

**The exported high-risk consequence list changes membership.**
`AUTOMATION_STUDIO_DESTRUCTIVE_ACTION_CONSEQUENCES` contains exactly
`move_money`, `delete`, and `send_or_publish`. Consumers that display or
exhaustively match the list must not assume `modify_existing` or `create_new`
is permission-gated, and must retain `send_or_publish` when filtering an
action's declared consequences.

### 0.6.0: adaptations iterate under guards instead of call counts, endpoints declare what they destroy, and repair targets are opaque (`fluxiq`)

No export was removed, but several host-facing types gain required fields,
several published numbers move, and much of what a failed run does next
changes without any host opt-in. One table changes shape. Project migration
`0020_adaptation_matching_columns` adds three nullable columns and two indexes
to `adaptations`. Opening the adaptation store fills those columns for rows
that have none. Nothing else is rewritten on load, no stored record or file
changes shape, and records written by 0.5.0 are read as they are. A 0.5.0
build keeps working on a migrated database: its migration runner applies only
the migrations it knows, and its adaptation store names the columns it
inserts. Read the whole entry if a host:
- registers its own endpoints on `GlobalProgramApiRegistry`, or constructs the
  registry itself;
- calls `delete-run-datasets`, or the Identity Access user, session, TOTP or
  vault endpoints;
- binds `llmEvidenceRuntime`, implements `validateTargetOverrideEvidence`, or
  writes an LLM provider or provider resolver;
- builds an LLM harness input itself, or calls
  `sanitizeAutomationStudioLlmFailureEvidence`;
- preflights, issues or displays LLM execution grants;
- implements `AutomationStudioLlmRunBudgetLease`, or reads a run ledger's
  limits;
- matches exhaustively on a grant purpose or an LLM task kind;
- or reads what a failed run's recovery recorded, or applies adaptations.

**Every endpoint declares what it does to persisted state.**
- `GlobalProgramApiRegistry.register` requires `classification`, a
  `ProgramEndpointClassification`: `read`, `authoring`, `destructive`,
  `program-gated` or `destructive-ungated`. A host endpoint without one does not
  compile. `endpoints()` reports it.
- `call()` now asks for the operator's session PIN before the handler of every
  `destructive` endpoint, and of no other. The registry takes Identity Access
  from its constructor: `new GlobalProgramApiRegistry({ identityAccess })`.
  `registerAutomationStudioApi` still accepts an `identityAccess` argument but
  no longer uses it. A host that builds its registry without one therefore gets
  "PIN authorization service is not available." from every destructive
  endpoint. `createGlobalProgramRuntime` already passes it.
- **Fewer PIN prompts.** 45 Automation Studio endpoints no longer ask for a
  PIN. Most create, save, publish or edit Flows, subflows, routes,
  instructions, projects, categories and recordings. The rest review
  adaptations and proposals, start or stop client recordings, revoke client
  trust, run Flow migrations, or delete a Flow map route. A PIN sent to them is
  ignored. Twelve still ask: nine deletes, `execute-client-action`,
  `seal-legacy-writes` and `rollback-flow-migration`.
- **One new PIN prompt.** `delete-run-datasets` now asks for a PIN. It used to
  delete captured rows under `flows.write` alone. Send `authSessionId` and
  `authorizationPin`, or the call is refused.
- **Declared gaps.** `database-manager/run-migration`, `deployment-sync/sync`
  and `deployment-sync/rollback` are `destructive-ungated` and still check
  nothing. [Declared gaps](automation-studio/persistence.md#declared-gaps) says
  why.

**Identity Access re-proves the caller before it hands out authority.**
`create-user`, `create-session`, `begin-totp`, `confirm-totp` and
`unlock-vault` now recheck the calling session's own credentials.
- **What to send.** Send `authSessionId` with `authorizationPassword`,
  `authorizationPin` and, when the calling account has TOTP enabled,
  `authorizationTotp`. Their request types gain those four optional fields.
- **`update-user`.** It now rechecks when the request carries `roleId` or
  `enabled`. It used to recheck only for `roleId`.
- **Refusal.** A refusal is `{ ok: false, requiresRecheck: true, error }`.
- **Unchecked.** `revoke-session` and `lock-vault` still check nothing.

**A domain's evidence binding names its domain, and what must never reach the
model.**
- **Two required fields.** `llmEvidenceRuntime` is now typed
  `AutomationStudioLlmEvidenceRuntimeBinding`, which requires `domainId`
  and `deniedEvidenceKeys`. A binding without them does not compile, and a
  `domainId` outside `[A-Za-z0-9._:-]`, 1–200 characters, is refused when its
  tools are registered. It may also declare `harnessOptions` and
  `classifyRefusal`.
- **Core no longer denies keys by name.** 0.5.0 refused `html`, `innerHtml`,
  `outerHtml`, `pageSource`, `snapshot`, `cookies` and `headers` in failure
  evidence, and `selector` and `selectors` in reusable context. Now each is
  refused only when the domain lists it, compared ignoring case, `_` and `-`.
  Core still refuses the `target` family in reusable context, and still bounds
  depth, size and shape. To keep the old protection, list those keys; `[]`
  denies nothing.
- **An undeclared packet is refused.** A context packet carrying failure
  evidence or reusable context now needs `deniedEvidenceKeys` on its harness
  input, or packing throws. The service forwards the binding's list, Flow
  Bootstrap included. A host that builds a harness input itself must pass it.
  `sanitizeAutomationStudioLlmFailureEvidence` takes the list as an optional
  third argument and, without it, denies nothing.
- **Tools are scoped to the domain.** The binding's tools now reach Flows in its
  own domain and Flows that name no domain, never a Flow in another domain.
  Evidence-guided Flow Bootstrap for such a Flow gets no tools and fails.

**A repair target is opaque.** `AutomationStudioRuntimeTargetOverrideTarget`
was `{ selector: string }`. It is now
`JsonObject & { handles: Record<string, string> }`: handles the domain issued in
its evidence, plus any resolution the domain adds.
- A model's target override must carry `handles` and nothing else. A provider
  that returns `{ selector }` has the patch refused with
  `llm_output.invalid_target_override`.
- `validateTargetOverrideEvidence`, on the binding and on
  `AutomationStudioRuntimePatchExecutionInput`, receives the new shape. A
  domain that checked selectors must resolve its handles instead.
- It now judges every target override, executed ones included, and a host that
  binds none has every target override refused, with the reason
  `domain_check_unavailable`. Its failed-action argument gains an optional
  `outputId`. A refusal may name a `reason` from
  `AUTOMATION_STUDIO_RUNTIME_TARGET_OVERRIDE_REFUSAL_REASONS`, and Core drops
  any other reason.

**A grant's purpose no longer fixes its call count.**
- **Backstop.** `AUTOMATION_STUDIO_LLM_EXECUTION_GRANT_MAX_CALLS` is now 64,
  where it was 8. It exists only to stop a runaway loop.
- **Default.** `diagnose_and_adapt`, `explore_and_adapt` and `build_and_adapt`
  default to 26 calls (`AUTOMATION_STUDIO_LLM_EXECUTION_GRANT_DEFAULT_MAX_CALLS`).
  `diagnose_and_adapt` defaulted to 2 and `build_and_adapt` to 4.
  `diagnose_and_adapt` refused any count but 2 and now takes 1 to 64.
  `diagnosis_only` is still exactly one.
- **Cost.** The default cost purse follows the count, so a default adapting
  grant may spend $2.00. `diagnose_and_adapt` could spend $0.50, and a build
  grant $1.00.
- **`maxUses`.** It must still equal the call count. A request that sends
  `maxUses: 2` or `4` without `maxCalls` is now refused with "LLM execution
  grant uses must match its call limit."; send `maxCalls` as well.
- **Task kinds.** `diagnose_and_adapt` may now also ask for evidence decisions,
  and every adapting purpose for the new `loop_plan` and `loop_verification`
  task kinds, which `AutomationStudioLlmTaskKind` gains. What
  `diagnose_and_adapt` may change is unchanged: one target-override proposal.

**A grant carries a run token budget, and the high-token confirmation is judged
on it.**
- **The budget.** The limit request, the preflight, the grant and `resolve()`
  gain `maxTotalTokensPerRun`. By default it is the per-call total times the
  calls, held to 100,000 and never below one call's total. A supplied value
  outside that range is refused with "LLM total token limit is invalid."
- **The confirmation.** `issue()` asks for `highTokenConfirmation` when the
  larger of that budget and the per-call total exceeds 100,000. It used to
  multiply per-call tokens by calls. So a default 26-call grant needs no
  confirmation.
- **Fewer prompts, lower exposure.** A request that used to need confirmation,
  such as 8 calls at 20,000 tokens, no longer does, and is held to 100,000
  tokens. To keep the old exposure, ask for that `maxTotalTokensPerRun` and
  confirm it.
- **Enforced by the grant.** A call whose worst case would cross the budget is
  refused with "LLM execution total token limit exceeded.", and the grant is
  revoked. Each call is charged the usage it reported, or its worst case when
  the report is missing or inconsistent.
- **For resolvers.** `AutomationStudioLlmProviderResolution` gains an optional
  `maxTotalTokensPerRun`, which a recovery uses as its token budget's ceiling.

**`explore_and_adapt` is a new purpose, and a runtime session accepts it.** The
grant purpose types and the resolver's `executionGrant` include it, and
`run-runtime-session` accepts it as `runIntent`
(`AUTOMATION_STUDIO_RUNTIME_SESSION_GRANT_PURPOSES`). An exhaustive `switch` or
resolver must handle it.
- **No exemption.** Unlike `diagnose_and_adapt`, it gets no target-override
  exemption, and its patches are not proposal-only.
- **Patches run live.** Each patch the Flow's policy permits is run on a patched
  copy of the Flow with the run's own graph options, for at most 50 steps. A
  target override also needs the domain's `validateTargetOverrideEvidence` to
  accept it.
- **Side effects.** A side-effecting patch is refused where the policy disallows
  external side effects or requires approval for them, because an explicit run
  never carries that approval. A policy that allows them without approval lets
  one run. Every result still goes to manual review.

**A grant's TTL is a claim window, and a claimed grant runs on a 600-second
lease.**
- **Claim window.** `ttlMs` (default 60,000, at most 300,000) now bounds only
  how long a grant may wait to be claimed. `expiresAtMs` is the end of that
  window, not of the grant.
- **Run lease.** Claiming starts a lease of
  `AUTOMATION_STUDIO_LLM_EXECUTION_GRANT_MAX_RUN_MS`, 600,000 ms. A claimed
  grant used to be refused and revoked at `expiresAtMs`. It now keeps calling
  until the lease ends, the host revokes it, a limit is reached, or the actor's
  session or Secret Keys unlock ends. A host that shows `expiresAtMs` as the
  grant's lifetime under-reports a claimed grant.
- **Fresh authorizations.** A call made after the claim window swaps its reveal
  authorization for a fresh one, minted from the actor's unlocked Secret Keys
  session. The swap is one for one, so reveals stay capped at the call count.

**A recovery is bounded by cost, tokens, time and progress, not by a call
count.** This covers every failed run the model is asked about, with or without
a grant.
- **Calls.** A recovery takes the call count its provider resolver declares,
  and otherwise 250 (`AUTOMATION_STUDIO_LLM_RUN_CALL_BACKSTOP`). 0.5.0 used 1
  for `diagnosis_only` and 2 for `diagnose_and_adapt`. Otherwise it used the
  smallest of the policy's and settings' `maxInterventionsPerRun` and the
  resolver's count, or 2. Intervention limits no longer cap provider calls.
- **Tokens without a grant.** The settings' `maxTokensPerRun` still binds as
  written, and default Flow settings carry 12,000. Without that setting, and
  with no call count from the resolver, the budget is 144,000; it was 12,000.
- **Tokens with a grant.** The per-call total times the declared calls, held to
  the grant's `maxTotalTokensPerRun`. A default adapting grant gets 100,000;
  `diagnose_and_adapt` got 20,000.
- **Cost.** Without a grant it is still at most the run cost ceiling
  (`FLUXIQ_LLM_RUN_COST_CEILING_USD`, $0.10 by default), and with one it is the
  grant's total. It is never more than $2.00
  (`AUTOMATION_STUDIO_RECOVERY_MAX_ESTIMATED_COST_USD_PER_RUN`). Each call
  reserves the purse divided by the declared calls, or by 24. So the
  `maxEstimatedCostUsd` a provider receives is smaller. With no grant and no
  declared count it is about $0.0042 ($0.10 / 24), where it was $0.125.
- **Time and progress.** The whole recovery runs under a fixed 600,000 ms
  deadline (`AUTOMATION_STUDIO_RECOVERY_MAX_DURATION_MS`), new in this release.
  An exploration also stops as `no_progress` after 3 consecutive steps that
  bring back nothing new.
- **The ledger.** `AutomationStudioLlmRunBudgetLimits.maxCallsPerRun` is
  optional. `AutomationStudioLlmRunBudgetLease` gains a required `release()`,
  which returns a reservation unspent, so a host implementing the lease must
  add it. `complete()` takes an optional outcome. The ledger's `snapshot()`
  gains `explorationCalls`, and `callRecords(runId)` lists each call.

**What a failed run does next changes.**
- **Deterministic first.** The model is not asked when Core already has an
  answer: a known recovery, a reroute, a matching adaptation, or a failure a
  person must clear. `metadata.llmGate` records `invoked: false`, the reason and
  `requiredPriorAction`.
- **A patch only when called for.** 0.5.0 asked for a patch whenever a
  provider was configured, even after a failed diagnosis. Now a patch call
  follows only when four things hold: the diagnosis call succeeded and returned
  a diagnosis, Core's own diagnosis needs the model, the structured diagnosis
  calls for a patch or for exploration, and the policy permits a patch kind for
  that failure.
- **One channel for the model's verdict.** A provider answers a diagnosis
  through `response.diagnosis` (`AutomationStudioLlmDiagnosisFields`), and only
  there. `patchNeeded: false` there cancels the patch call. The same keys in
  `response.metadata` are not read, and the run records them as refused.
- **Exploration calls the host's tools.** When the diagnosis asks for evidence,
  the recovery explores with the bound domain's tools. That calls the binding's
  `executeTool` during a failed run; 0.5.0 called it only from Flow Bootstrap.
  A mutating tool is offered only when the policy sets
  `allowExternalSideEffects`. One patch call's worth of calls, tokens and cost
  is held back while it explores.
- **A larger request.** Diagnosis and patch requests now carry
  `recoveryContext`, and staged requests a `stage`, whose prompt version gains
  `+stage.<stage>`.
- **What the run records.** The run detail's `metadata` gains `recoveryTrace`.
  `llmGate` gains `providerCalls` (one line per provider call, including the
  evidence decisions no intervention records), `providerCallsOmitted`,
  `recoveryContext` and `structuredDiagnosis`, and its `costAccounting` gains
  `explorationCalls`.

**A patch is recorded as validated only when a rerun proved it.**
- **Nothing to compare.** A live-tested patch whose rerun succeeded with no
  declared expectation used to be `validated`, with a succeeded validation
  result. It is now `testing` with no validation result, and its
  `metadata.verification` says `unverifiable`.
- **Cannot be applied.** A patch whose target node is gone, or whose kind is
  `temporary_action_sequence` or `temporary_recovery_subflow_call`, is no longer
  run against the unpatched Flow. It is `rejected` as `not_executed`.
- **Proposal-only.** A proposal-only target override no longer carries a
  succeeded validation result.
- **Types.** `AutomationStudioRuntimePatchExecutionResult` gains `verification`.
  `adaptationFromRuntimePatch` takes an `AutomationStudioRuntimePatchVerification`
  where it took `restoredExpectedState: boolean`.
- **Applying.** An adaptation now needs a succeeded trial or replay, or a named
  reviewer's approval. A `validated` status alone used to be enough. A
  validation result with no `kind` counts as a trial, and a result of any other
  kind counts for nothing. The reviewer is read from `metadata.review.approvedBy`,
  which an approval by a named actor other than `runtime` now writes. The typed
  store also accepts the latest such `approved` audit event. An approval never
  outweighs a failure: while the latest counted trial or replay is a failure,
  the adaptation cannot be applied.
- **The typed store needs the gates.**
  `AutomationStudioProjectAdaptationStore.applyApprovedAdaptation` takes a
  required `promotionGates`; pass `evaluateFlowAdaptationPromotionGates`. A call
  without it does not compile. Missing gates, gates that throw, or an
  inconsistent verdict refuse the apply and record a `policy_blocked` audit
  event.
- **A repaired recorded step acts on the repair.** An applied action-target
  repair of a `builtin.policy.action` node is written to
  `parameterValues.parameters.target`, the payload the step dispatches. It used
  to be written beside the payload, where the step never read it. A step whose
  payload is not a plain object is refused.
- **Old records.** The saved detail of an adaptation from 0.5.0 is not
  rewritten; only its three new columns are filled. One that 0.5.0 validated on
  a proposal-only check, or on a rerun with nothing to compare, still carries
  its succeeded validation result, which counts as a trial, and can still be
  applied.

**`edit_recovery` adaptations are refused.** Applying one used to report
success and change nothing. It now throws "Adaptation patch edit_recovery has
no durable application; <id> refused."

**Rolling back a graph change restores the whole graph.** The inverse of
`delete_node` now restores the edges the deletion removed. Restoring a snapshot
restores every node field, not only position and parameters. A graph revision
records each cascaded edge deletion as its own operation, and its
`operation_count` counts them.

**Smaller changes.**
- `AUTOMATION_STUDIO_LLM_EVIDENCE_LOOP_LIMITS` allows 64 iterations and tool
  calls; it allowed 16.
- Evidence-guided Flow Bootstrap makes one decision per authorized call, or up
  to 64 when the resolver names no count. It made at most 8, or 4 when no count
  was named. It allows one more tool call than decisions, where it always
  allowed 7.
- `AutomationStudioRuntimeAdaptationContext` gains a required
  `recentAdaptations`.
- `AUTOMATION_STUDIO_LLM_EVIDENCE_DECISION_INSTRUCTION` no longer mentions
  pages, so its text changed.
- `InputOutputBinding` gains an opt-in `recordInputPayload`. A binding that sets
  it keeps the input event's payload on the recorded action entry, under
  `metadata.inputPayload`. Other bindings are unchanged.
- 182 names are newly exported from the root, `fluxiq/automation-studio` and
  `fluxiq/programs`, most of them from `runtime/recovery/` and `runtime/llm/`.

**For Core contributors.** The structure audit now fails a value import from
`runtime/llm/` into `runtime/recovery/` (`importBoundaries` in
`scripts/structure-audit/config.mjs`). Type-only imports stay allowed, and a
value both sides need lives in `runtime/loop-limits/`. No host is affected.

### 0.5.0: stronger password derivation, hashed session ids, and credential hardening (`fluxiq`)

Stored credentials and Secret Keys move to a format that 0.4.x cannot read, and
several credential behaviours change without any host opt-in. Read the whole
entry if a host:
- may roll back to 0.4.x after upgrading;
- expects sessions to survive the upgrade, or PIN-gated actions to survive a
  restart;
- constructs `IdentityAccessService` or `SecretKeysService` itself, or reads
  `EncryptedSecretValueRecord`;
- calls `upsertUser` with the id of an existing account;
- matches on Secret Keys error text;
- or reads `result.payload` from saved command attempts.

**Records upgrade forward only.** Password-derived keys and hashes use `scrypt`
at N=2^17, r=8, p=1. 0.4.x used Node's default N=2^14 and recorded nothing.
- Credential envelopes and Secret Keys seals are written as `version: 2` with
  `kdfParams`. Password and PIN hashes are written as
  `$scrypt$ln=17,r=8,p=1$<salt>$<hash>`.
- Version 1 records and older hashes are still read. Each upgrades after its
  next successful login, Secret Keys unlock or reveal, or PIN check, with no
  user step. A record is never rewritten at a lower cost.
- 0.4.x skips version 2 records: a user whose credential 0.5.0 re-sealed cannot
  log in to 0.4.x, and upgraded Secret Keys disappear from it.
- **Rollback** means rolling forward again, or restoring a `global.sqlite`
  backup taken before the upgrade. Take that backup before upgrading.
- `EncryptedSecretValueRecord` is now a union of `EncryptedSecretValueRecordV1`
  and `EncryptedSecretValueRecordV2`.

**Existing sessions are signed out.** Sessions are stored under the SHA-256
digest of their id, never the id, which is the cookie's bearer value. The first
load deletes session records stored under a raw id, so every signed-in user
signs in again after the upgrade. `snapshot().sessions[].id` is now the digest.

**A PIN gate after a restart needs a new sign-in.** No PIN verifier is stored
outside the credential seal, and a stored `pinVerifierHash` is removed at the
first load. A PIN verifies only against a credential unlocked in the current
process. After a restart, a PIN-gated action fails with "PIN verifier upgrade
required. Sign out and sign back in, then try again." until the user signs in.

**A login costs more, and the same for any username.** A login spends one
derivation, observed once at about 350 ms on a development machine. Derivations
run off the event loop, at most two at a time in the process. An unknown,
disabled, or password-less username runs a dummy derivation.

**A password change re-seals Secret Keys.**
- `IdentityAccessServiceOptions` gains `credentialChangeSubscribers`, a list of
  `IdentityCredentialChangeSubscriber` (`prepare`, `commit`, `abort`).
  `SecretKeysService` gains `prepareCredentialChange`,
  `commitCredentialChange`, and `abortCredentialChange`. Both services gain a
  test-only `passwordKdf` option.
- `createGlobalProgramRuntime` subscribes Secret Keys. A user's own password
  change re-seals that user's keys under the new password, and a failure to
  prepare that re-seal refuses the change. Once the credential is written the
  change stands: a subscriber whose `commit` throws is logged with the change
  id, user id, and failure count only, and the password change still succeeds.
  It used to rethrow the first commit error. A host that constructs both services itself
  must subscribe Secret Keys the same way, or a password change leaves that
  user's keys unreadable.
- An administrator's reset of another account cannot re-seal that account's
  keys. They stay sealed under the old password.
- `upsertUser` now throws when given a password or PIN for an existing account.
  Change credentials with `setPassword`, `setPasswordAuthorized`, `setPin`, or
  `setPinAuthorized`.

**Other credential checks tighten.**
- `createRevealAuthorization` refuses a password that does not open the key,
  with "Secret reveal authorization was refused". It used to succeed.
- A reveal with the wrong password fails with "Secret key could not be opened"
  instead of Node's decryption error.
- A Secret Keys metadata edit no longer stops that key unlocking at login.
- Secret Keys API handlers take `createdBy` from the acting user and ignore one
  in the payload.
- Database Manager `put-record` and `delete-record` on `identity.users` and
  `secret.keys` require the same credential recheck as reading them.

**A saved command attempt can withhold its result payload.**
`FluxIQRuntimeDispatchContext` gains `withheldResultPayload?: boolean`.
- When it is `true` and a payload comes back, the attempt in memory, in
  `snapshot()`, and in `attempt.json` holds `FLUXIQ_RUNTIME_WITHHELD_VALUE` in
  place of `result.payload`. The caller of `dispatch` still receives the
  payload, and the flag is never handed to the adapter or transport.
- `FluxIQRuntimeCommandAttempt.result` is now
  `FluxIQRuntimeCommandAttemptResult`, whose `payload` may be that marker.
- Automation Studio sets the flag for every dispatch whose effect payload
  carries a `recordOutput`.

### 0.4.0: failed expectations fail, client recordings start in order, and traces claim only what Core applied (`fluxiq`)

No type or export was removed, but several behaviours change without any host
opt-in. Read the whole entry if a host:
- binds an expectation evaluator;
- reads persisted traces or target resolutions;
- reads saved command attempts or run inputs back;
- runs its own client-gateway client;
- dispatches runtime or client-gateway commands with a `timeoutMs`;
- runs a Flow that has no Start node, or stores compiled plans;
- binds a host runtime's `captureStateSnapshot` or `inspectStateDiff`;
- reads a run's recovery attempts or interventions when its LLM is off;
- or writes a recording mapper.

**A rejected expected state fails the attempt.** Some nodes other than
`builtin.policy.expectation` succeed while carrying an `expectedState` with at
least one key. For those, the transition comparison asks a bound
`expectationEvaluator`, and a rejection now fails the attempt:
- its status and route become `failed`, and its message is the host's;
- its failure record is the host's when that record parses, and otherwise
  `expected_state_missing` with code `core.policy.expectation_rejected`.

So the next node is not dispatched unless a failed-route edge or the recovery
ladder leads there. Some cases are unchanged: a host that binds no evaluator, an
evaluator that throws, and an empty `expectedState`. Nothing in Core honours a
node's `failureRoute` yet.

**Recording mappers see what followed, and can claim a state.** Both additions
are additive.
- A mapper's context gains `following`, the next 32 timeline observations. Code
  that calls a mapper implementation directly must pass it.
- A candidate may carry `expectedState`. Core keeps it only as a plain object
  with at least one key, and writes it into the approved Flow node's
  `parameterValues.expectedState`. Approving a proposal into a node definition
  does not carry it.

**A client-started recording is ordered with what follows it, and
acknowledged.**
- **Ordering.** The client-gateway bridge holds every later message from a
  client until that client's `client.start_recording` has been handled.
- **Arrival order.** A client's `client.recording_entry`,
  `client.recording_event`, `client.snapshot`, `client.state_update` and
  `client.error` messages are stored in the order the gateway received them.
  Queued state snapshots are written before any later directly appended entry,
  action results included, and Stop waits for messages received before its
  drain ends. Stored timelines, entry sequences and the mapper's `following`
  lists can differ from earlier releases, and a receive now resolves only after
  that client's earlier messages are stored.
- **Acknowledgement.** Once the recording is open, the bridge sends the client
  `server.start_recording` for it, unless a `client.stop_recording` for that
  recording has already arrived. A client that treats `server.start_recording`
  only as a start FluxIQ requested must now ignore one for a recording it
  already has.
- **Late messages.** A message arriving after Stop finalized its recording no
  longer fails the connection. It is discarded with a
  `recording.action_discarded` or `recording.event_discarded` audit entry naming
  the recording id the message carries. Dropped snapshots and state updates are
  audited too.
- **Entry metadata.** A recorded input's entry metadata gains `eventId` and
  `sourceId`.

**A value resolved out of state is withheld from the persisted trace.** A
persisted trace reads `[withheld]` wherever a run resolved a value from state.
A plan that nests a binding inside a literal-only parameter now fails validation
with `bootstrap.invalid_state_binding`.

**A run's supplied inputs are withheld at rest.** Two persisted copies keep each
input's key and read `[withheld]` for its value:
- a runtime session record's `metadata.inputs`;
- the `inputs` of the run-summary envelope in a run's runtime event stream.

The run itself executes with the inputs its request supplied, held in memory. So
a run detail read back through `get-flow-run-detail`, the run event APIs, or
`getRuntimeSession` carries input keys but not values. This affects hosts in two
ways:
- **Running a queued session by `runId`** no longer falls back to the inputs
  recorded when it was started. A run request without `inputs` now runs with
  none, so send them again with `run-runtime-session`. The web panel already
  does.
- **A host that read input values back** from a session record or run detail,
  to show or replay them, must keep its own copy.

Records persisted before this release are not rewritten.

**Runtime command attempts withhold values their caller marks as withheld, and a
run trace withholds its run inputs where it saves them.**
- **The contract.** `FluxIQRuntimeDispatchContext` gains an optional
  `withheldValues` field (`FluxIQRuntimeWithheldValues`, `{ texts, numbers }`).
  The runtime exports its marker as `FLUXIQ_RUNTIME_WITHHELD_VALUE`
  (`"[withheld]"`), and `AUTOMATION_STUDIO_WITHHELD_VALUE` is now that constant.
- **The attempt.** `RuntimeService` builds a command attempt with the marker in
  place of each withheld text inside `command.parameters`, and of each parameter
  number equal to a withheld number. When the attempt settles, it does the same
  inside `result.message`, `result.error` and the attempt's `message`.
- **What stays.** Every key and every other value stays, so the attempt in
  memory, in `snapshot()` and in `attempt.json` is the same. The adapter or
  transport is not handed the list.
- **Automation Studio.** Its runtime dispatcher fills `withheldValues` with every
  value its run resolved out of a parameter state binding, and the executor's
  `effectDispatcher` context gains the same optional field.
- **Run inputs.** A run trace now also withholds each run input, in `values` and
  in every attempt's `inputs`, while that entry still holds the supplied value,
  whether or not a node reads it. An input no binding reads, which a node copies
  into an output under another key, is not withheld at that copy.
- **Call Flow.** A parent's saved trace also withholds every value a Call Flow
  child withheld by value, and the attempt keeps the child's saved trace.
- **What a reader sees.** A reader of `commandAttemptsList()`, of
  `command-attempts/<attemptId>/attempt.json`, or of a trace's input entries that
  expected a clear value now sees the marker. Callers that pass no
  `withheldValues`, and runs without inputs, see no change.
- **Not withheld:** `command.metadata`, `result.failure` and `result.metadata`.
  `result.payload` was not withheld in this release either. From 0.5.0 a caller
  withholds it with `withheldResultPayload`, and Automation Studio does so for
  every dispatch that carries a `recordOutput` (see 0.5.0 above).
- **Old attempts.** Attempts saved by earlier versions are not rewritten. Remove
  `.fluxiq/artifacts/runtime/command-attempts/` if they may hold run-time secrets.

**Execution is unchanged; only saved copies are withheld.** Everything a run
executes with keeps the real value:
- the adapter or transport executes the unwithheld command, and the caller of
  `dispatch` gets the unwithheld result;
- a Call Flow parent builds its outputs, and a bound error message, from the
  trace its child executed;
- a live-patch rerun is seeded from the failed attempt as the run executed it.

Two additive parameters hand that executed trace to a caller that goes on
executing: an optional third argument to `runAutomationStudioGraph` and an
optional fifth to `runCanonicalAutomationStudioFlow`, each
`onExecutedTrace(executed, saved)`. The executed trace is for executing with
only; persist the returned one.

**One text rule withholds inside strings.** `fluxiqRuntimeTextWithholding(texts)`
is a new export, and both a saved attempt and a persisted trace use it:
- every stretch of a string covered by a withheld text becomes one `[withheld]`,
  so a text that contains or overlaps another is replaced whole and leaves no
  fragment;
- a `[withheld]` already in the string is never rewritten.

A trace used to replace texts in the order its run resolved them, and could keep
fragments of a longer value around a shorter one inside it.

**The element-target trace claims only what Core applied.**
`AutomationNodeTargetResolution` is now a union discriminated by `status`. Its
`unresolved_no_candidates` member carries `candidateCount: 0` and no
`minimumConfidence`: with no runtime candidates Core scores nothing and enforces
no floor, so the number it used to write there named a threshold nothing was
compared against. The dispatch diagnostics' `reason` now says so. The other
three statuses keep `minimumConfidence`. A host that reads `minimumConfidence`
from every resolution must narrow on `status` first, and a parser that treats a
resolution without it as malformed must accept this member.

Recording-mapped element targets change without any host opt-in. When a mapped
action's parameters carry `element`, the node's `parameters.target.fingerprint`
now holds that element's identity, with `implicitRole` read as `role`, beside
the parameters' own locator signals; the parameters' own `text` is no longer
copied into `visibleText`. The same normalization applies at dispatch to
parameters that carry no explicit target.

`appendRecordingDomainEvent` now refuses a finalized recording, as the other
recording appends already did, and the client gateway bridge reports a domain
event that arrives in that window as `recording.event_discarded` instead of
writing it into the recording.

**A command's target is given its timeout, and Core waits 3,000 ms longer for
the answer.** No type or export changes.
- **The deadlines.** `RuntimeService` resolves a command with a positive
  `timeoutMs` as `timed_out` after `timeoutMs` plus 3,000 ms, for every adapter
  and transport target; it used to give up at `timeoutMs`. The client gateway's
  pending command waits the same when the command carries a `timeoutMs`. A
  gateway command without one still waits `commandTimeoutMs`, 30,000 ms by
  default.
- **Unchanged.** The `timeoutMs` sent to a client, and what a `timed_out`
  result means: the target never answered, which Automation Studio still names
  `output_dispatch.timed_out`.
- **What hosts see.** An answer that arrives after `timeoutMs` but inside the
  margin is now reported as the target sent it, with its status, message and
  failure record. It used to be discarded for Core's own `timed_out`. A target
  that never answers is abandoned 3,000 ms later than before, including an
  in-process adapter.
- **Messages.** The runtime's timeout message now names the full wait, its
  timeout and the margin, and the gateway's names the full wait. A host that
  matched `Runtime command timed out after <timeoutMs>ms.` must match the new
  text.

**A run with no named start begins where its graph says, not at the first
listed node.** `chooseAutomationStudioStartNode` is a new export, and both a
graph run and a compiled plan use it.
- **The rule.** Exactly one `builtin.control.start` node is where a run begins,
  as before. With no Start node, a run begins at the one node that no edge from
  another node enters; an End node that no edge enters counts only when no
  other node does. A run used to begin at the first node listed, and a Flow
  read back through the project graph index lists its nodes by id, so a
  recorded Flow of more than ten entries could begin at a later action.
- **Refusals.** Several Start nodes, several such roots, or no root now fail
  the run before any node runs, with a message naming the case. Such a run used
  to begin at the first node listed.
- **Compiled plans.** `startNodeId` follows the same rule and is `null` where a
  run would refuse. `AUTOMATION_STUDIO_COMPILED_PLAN_COMPILER_VERSION` is now
  `compiled-plan.v2`, so a plan compiled for a Flow revision before this change
  is compiled again instead of being reused with its earlier start, and its
  artifact id ends in `compiled-plan.v2`. The schema version is unchanged.

**A host runtime is told which node ran after the action, as it is before it.**
No type or export changes. A host runtime's `captureStateSnapshot` at
`after_action`, and its `inspectStateDiff`, now receive the node that ran with
its parameter values resolved, the same node the `before_action` capture
receives. They used to receive only its `id` and `definitionId`, with empty
`parameterValues`. This holds on every path that captures after the action: a
succeeded or failed dispatch, a dispatch or node that throws, a pinned version
Core does not have, and a node that is not executable. A host that keys its
capture or diff on a node's parameters, such as a policy action's `outputId`,
now sees them after the action; one that declined such a node there now handles
it. A node whose state-bound parameters do not resolve is still not captured.

**The recovery ladder honours a disabled LLM.**
`AutomationStudioGraphExecutionOptions` gains an optional `allowLlmDiagnosis`.
When it is `false`, the ladder offers no `llm_diagnosis` candidate; omitting it
keeps the previous behaviour, so callers of `runAutomationStudioGraph` need no
change.
- **Who sets it.** The Automation Studio runtime service sets it from the run's
  training behaviour (`invokeLlm`), after any run override.
- **What hosts see.** A run whose LLM is off, such as `adaptiveMode:
  "deterministic"` without `dryRunLlm`, or a project with
  `allowLlmIntervention: false`, no longer records an LLM diagnosis fallback for
  a failed node with no deterministic recovery. Its recovery attempt is
  `exhausted` rather than `diagnosis_only`, no `diagnosis` intervention is
  written, and the run summary's `interventionCount` counts none. The run fails
  with the same structured failure record, and its trace message is the failed
  node's own.
- **Unchanged.** Deterministic recovery candidates, recovery budgets, and runs
  that allow the LLM, including `dryRunLlm: true`, `manual_approval` and explicit
  `diagnose_and_adapt` runs.

### 0.3.0: a missing stable identifier costs less (`fluxiq`)

No type or export changed. One published number moves. An element candidate
that does not carry a stable identifier the recording captured is now charged
−0.1 of that identifier's weight where it was charged −0.55. A candidate
carrying a *different* identifier is untouched and still costs −0.8. The two
branches of `compareExactSignal` in `fluxiq/automation-studio/fingerprinting`
are now the named constants `MISSING_STABLE_IDENTIFIER_SIMILARITY` and
`CONTRADICTED_STABLE_IDENTIFIER_SIMILARITY`.

**Who is affected.** Only candidates missing an identifier the fingerprint
recorded. For those, `totalScore` rises by `0.45 × w` for each recorded
identifier the candidate lacks — at the default weights `id` 26, `testId` 28,
`automationId` 28, `entityId` 24, `statePath` 22 — over an unchanged
`possibleScore`. So `confidence` only ever rises or stays equal; it never falls.
`matchedSignals` and `failedSignals` are identical before and after, because an
absent identifier is still a negative contribution and still a failed signal, so
a diagnostic reading those lists sees nothing change.

**Measured, on the case this was weighed against.** A candidate matching
`visibleText` and `accessibleName` exactly and carrying no `id`, scored against
a fingerprint that recorded one: `(24 + 24 − 2.6) / 74 = 0.614` normalized,
times the two-strong-match multiplier `0.94`, so **confidence 0.577** — from
`33.7 / 74 = 0.455`, `× 0.94 = 0.428`.

**Which rungs of the element-target ladder that crosses.** The runtime's default
minimum confidence for an element target is destructive `0.9`, privileged
`0.82`, review `0.68`, safe `0.45`, and `0.5` for an output declaring no safety
level. The candidate above newly clears **`safe` and the default rung**;
`review`, `privileged` and `destructive` still refuse it.

That is a statement about that candidate, not about every candidate, and the
difference decides whether you are exposed. Across the 1,024 combinations of
which of five recorded identifiers, three text signals and two loose signals a
candidate carries (matching exactly wherever present), 170 profiles newly clear
`safe`, 145 the default rung, 44 `review`, and 7 `privileged`. Those reaching
`review` already matched three of the five identifiers exactly and all three
text signals; those reaching `privileged` matched four of five. And a candidate
agreeing exactly on everything else a recording captured — all three text
signals, role, tag name, entity kind, all three structural paths, URL, class
names, attributes, bounds, and visibility — while missing one recorded
identifier crosses **`destructive`** as well: missing `statePath` goes
`0.883 → 0.917`, missing `entityId` `0.873 → 0.910`, missing `id`
`0.862 → 0.902`. No rung is categorically out of reach; what still protects the
high ones is that clearing them takes near-total agreement on every other
signal.

**The selected candidate can change, not only its score.** Candidates rank by
`totalScore` and only candidates missing an identifier gain, so a ranking can
invert. Against a fingerprint recording `id`, `testId`, `visibleText` and
`accessibleName`: a candidate with exact text and neither identifier scores
`18.3` before and `42.6` after, while a candidate carrying both identifiers
exactly and contradicting the text stays at `27.6` throughout.
`bestElementFingerprintCandidate` returns the second before this release and the
first after it.

**What to check.** If you gate on `confidence` — your own floor, an output's
`elementTargetMinConfidence` metadata, or the default ladder — re-measure
against your own recordings rather than reasoning from these figures: the delta
depends on which identifiers your fingerprints capture and how you weight them.
Nothing needs to change where your candidates carry the identifiers they
recorded, since that path is untouched. A host that filled an absent identifier
with a placeholder to dodge the old penalty should stop doing so — a wrong
value now costs far more than an absent one, as the
[importing-repos guide](../integrations/automation-studio-importing-repos.md)
now explains.

**Why a minor increment, and why `0.2.1` is ambiguous.** This behaviour shipped
in `a575df2` on 2026-09-12 under `0.2.1`, a version `fafe7c7` had already
published earlier the same day for an unrelated additive export, and it took no
increment of its own. Two builds therefore bear `0.2.1`, one refusing the
candidate above and one accepting it, and no version string tells them apart;
treat `fluxiq@0.2.1` as unspecified on this behaviour and read the commit.
`0.3.0` is the first version that names it. Minor rather than patch because the
change is not opt-out-able and moves a number the runtime's own safety gates
read — the same reason the 0.2.0 note's closing paragraph carries a behaviour
change under a minor increment.

### 0.2.0: one failure taxonomy (`@fluxiq/contracts`, `fluxiq`)

`AutomationStudioAdaptiveFailureClass` now lives in `@fluxiq/contracts`
(`@fluxiq/contracts/automation-studio`, with the frozen list
`AUTOMATION_STUDIO_ADAPTIVE_FAILURE_CLASSES`) and `fluxiq/automation-studio`
re-exports it under the same name. It gains seven members: `target_not_found`,
`target_ambiguous`, `navigation_unexpected`, `output_not_observed`,
`page_changed`, `auth_required`, and `user_intervention_required`.
`AutomationStudioTransitionComparisonStatus` gains `target_not_found` and
`target_ambiguous`. An exhaustive `switch` or `Record` over either type must
handle the new members; code that only reads the values needs no change.
Domains take category names from this export and never keep their own list.

Everything else is additive and optional: `failure`
(`AutomationStudioFailureRecord`) on `ClientGatewayActionResult`,
`FluxIQRuntimeCommandResult`, `OutputDispatchResult`,
`AutomationNodeExecutionResult`, `AutomationStudioNodeAttemptTrace`, and
`AutomationStudioFlowRunActionAttemptRecord`; `status` on
`OutputDispatchResult`; `message` and `targetResolution` on
`AutomationNodeExecutionResult`; `targetResolution` on the attempt trace; and
`failureCategory` on the LLM recent-action context. Validate a record that
crossed a process or storage boundary with `parseAutomationStudioFailureRecord`,
which returns `null` for anything inexact, unbounded, or self-contradictory.

One behaviour changes without any host opt-in: Core now names the failures its
own structured signals prove instead of leaving them to message matching. A
`timed_out` runtime command classifies as `timeout`, a `rejected` one as
`blocked_by_capability_or_policy`, a dispatched output whose bound confirmation
input never arrives as `output_not_observed`, and an element target without a
confident candidate as `target_not_found`. Failed dispatch attempts also carry
the dispatch error as their `message`.
