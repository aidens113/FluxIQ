# Framework API Reference

This deterministic inventory is generated from the public exports of `packages/fluxiq/src/index.ts` using TypeDoc.
It intentionally omits timestamps, machine paths, Git state, and runtime data.

Regenerate it with `pnpm docs:reference`; CI verifies freshness with `pnpm docs:check`.

## API Summary

- Public declarations: 2896
- Class: 92
- Interface: 2
- Object: 362
- Type: 1647
- Type Alias: 1
- Value: 792

## Public Declarations

| Name | Kind | Source | Summary |
| --- | --- | --- | --- |
| `acceptAutomationStudioFlowBootstrapResult` | Value | `packages/fluxiq/src/programs/automation-studio/runtime/flow-bootstrap/authoring/accept.ts:27` | - |
| `AcquireComputeLeaseRequest` | Type | `packages/fluxiq/src/programs/compute-control/api/contracts.ts:40` | - |
| `ActionChannelDescriptor` | Type | `packages/fluxiq/src/programs/automation-studio/model/descriptors.ts:21` | - |
| `ActionDefinition` | Type | `packages/fluxiq/src/programs/automation-studio/model/actions.ts:29` | - |
| `ActionEffectCandidate` | Type | `packages/fluxiq/src/programs/automation-studio/mining/contracts.ts:161` | - |
| `ActionEffectRelationship` | Type | `packages/fluxiq/src/programs/automation-studio/mining/contracts.ts:154` | - |
| `ActionEntry` | Type | `packages/fluxiq/src/programs/automation-studio/model/timeline.ts:18` | - |
| `ActionResult` | Type | `packages/fluxiq/src/programs/automation-studio/model/actions.ts:66` | - |
| `ActionSafetyMetadata` | Type | `packages/fluxiq/src/programs/automation-studio/model/actions.ts:22` | - |
| `ActionTarget` | Type | `packages/fluxiq/src/programs/automation-studio/model/actions.ts:54` | - |
| `actionTargetParameterValues` | Value | `packages/fluxiq/src/programs/automation-studio/runtime/flow-change/action-target-parameters.ts:25` | - |
| `ActionVisualEntityTarget` | Type | `packages/fluxiq/src/programs/automation-studio/model/actions.ts:41` | - |
| `ActionVisualTargetResolution` | Type | `packages/fluxiq/src/programs/automation-studio/model/action-visual-target.ts:5` | - |
| `ActionVisualTargetSource` | Type | `packages/fluxiq/src/programs/automation-studio/model/actions.ts:39` | - |
| `ACTIVITY_ACTION_ICONS` | Object | `packages/fluxiq/src/ui/activity-action/icons.ts:27` | The icon each action kind's card shows: a lucide icon name (Core's icon set, `lucide-react`), in kebab case. A client maps the name to its own component. |
| `ACTIVITY_ACTION_NAMES` | Object | `packages/fluxiq/src/ui/activity-action/names.ts:23` | The short label each action kind's card carries beside its icon. |
| `ActivityAction` | Type | `packages/fluxiq/src/ui/activity-action/types.ts:39` | One action, ready for a card. `target` is the name of what it acted on as the event already carried it, or null when it named none (the client says "the page" in its own words). `why` is a short human reason for a failure, or null; never a result code. |
| `ActivityActionEvent` | Type | `packages/fluxiq/src/ui/activity-action/types.ts:51` | The fields of one activity event the classifier reads. A client passes the `server.activity` payload as it arrived; fields it does not have may be left out. |
| `activityActionKey` | Value | `packages/fluxiq/src/ui/activity-action/key.ts:18` | - |
| `ActivityActionKind` | Type | `packages/fluxiq/src/ui/activity-action/types.ts:6` | What kind of action a card shows; each has one icon and one short name. |
| `activityActionOf` | Value | `packages/fluxiq/src/ui/activity-action/action-of.ts:190` | - |
| `ActivityActionOutcome` | Type | `packages/fluxiq/src/ui/activity-action/types.ts:31` | Where the action stands: still going, finished, failed, or waiting on a person. |
| `activityActionVerb` | Value | `packages/fluxiq/src/ui/activity-action/verb.ts:43` | - |
| `ActivityActionVerb` | Type | `packages/fluxiq/src/ui/activity-action/types.ts:75` | The generic verbs an id, a label or a result code can name. Each belongs to one kind; the activity wording (`programs/automation-studio/runtime/activity/wording`) says each in a person's words. |
| `ActivityReadRequest` | Type | `packages/fluxiq/src/programs/automation-studio/api/contracts/activity.ts:9` | One project's live activity. Nothing else narrows it: the hub keeps one project's latest events. |
| `adaptationConfidence` | Value | `packages/fluxiq/src/programs/automation-studio/runtime/recovery/adaptation-promotion.ts:68` | - |
| `adaptationFromRuntimePatch` | Value | `packages/fluxiq/src/programs/automation-studio/runtime/live-patch.ts:339` | - |
| `adaptationValidationCounts` | Value | `packages/fluxiq/src/programs/automation-studio/runtime/recovery/adaptation-promotion.ts:77` | - |
| `adaptBuiltinAutomationNodeDefinition` | Value | `packages/fluxiq/src/programs/automation-studio/nodes/definitions.ts:127` | - |
| `adaptLegacyRoutineToAutomationStudioFlow` | Value | `packages/fluxiq/src/programs/automation-studio/model/flow-compatibility.ts:125` | - |
| `adaptLegacyTaskToAutomationStudioFlow` | Value | `packages/fluxiq/src/programs/automation-studio/model/flow-compatibility.ts:81` | - |
| `adaptPolicyGraphToPolicyRegion` | Value | `packages/fluxiq/src/programs/automation-studio/runtime/region-compiler.ts:26` | - |
| `adminRole` | Object | `packages/fluxiq/src/programs/identity-access/runtime/roles.ts:3` | - |
| `adoptUncommittedFluxIQStorage` | Value | `packages/fluxiq/src/framework/uncommitted-v2-adoption.ts:32` | - |
| `AdvanceProductionRunRequest` | Type | `packages/fluxiq/src/programs/production-runner/api/contracts.ts:30` | - |
| `annotateAutomationStudioRunDetailWithRuntimeLlm` | Value | `packages/fluxiq/src/programs/automation-studio/runtime/recovery/annotation/annotate.ts:117` | - |
| `annotateRunDetailWithTrainingMode` | Value | `packages/fluxiq/src/programs/automation-studio/runtime/training-modes.ts:206` | - |
| `AppendRecordingDomainEventRequest` | Type | `packages/fluxiq/src/programs/automation-studio/api/contracts/recording.ts:98` | - |
| `appendRecordingEntry` | Value | `packages/fluxiq/src/programs/automation-studio/model/recording-framework.ts:50` | - |
| `AppendRecordingEntryInput` | Type | `packages/fluxiq/src/programs/automation-studio/model/recording-framework.ts:19` | - |
| `AppendRecordingEntryRequest` | Type | `packages/fluxiq/src/programs/automation-studio/api/contracts/recording.ts:13` | - |
| `AppendRecordingMarkerRequest` | Type | `packages/fluxiq/src/programs/automation-studio/api/contracts/recording.ts:67` | - |
| `appendRecordingNote` | Value | `packages/fluxiq/src/programs/automation-studio/model/recording-framework.ts:89` | - |
| `AppendRecordingNoteRequest` | Type | `packages/fluxiq/src/programs/automation-studio/api/contracts/recording.ts:59` | - |
| `appendRecordingStateCheckpoint` | Value | `packages/fluxiq/src/programs/automation-studio/model/recording-framework.ts:65` | - |
| `appendRecordingStateDelta` | Value | `packages/fluxiq/src/programs/automation-studio/model/recording-framework.ts:77` | - |
| `applyAutomationStudioConversationAdaptation` | Value | `packages/fluxiq/src/programs/automation-studio/runtime/conversations/commands/apply.ts:15` | - |
| `applyAutomationStudioFlowDraftAmendments` | Value | `packages/fluxiq/src/programs/automation-studio/runtime/flow-draft/amendment.ts:171` | - |
| `applyAutomationStudioRuntimeRecoveryPatches` | Value | `packages/fluxiq/src/programs/automation-studio/runtime/recovery/annotation/patches.ts:112` | - |
| `ApplyGraphPatchRequest` | Type | `packages/fluxiq/src/programs/automation-studio/api/contracts/graph.ts:19` | - |
| `applyStateDeltas` | Value | `packages/fluxiq/src/programs/automation-studio/model/state-diff.ts:32` | - |
| `ApprovalStatus` | Type | `packages/fluxiq/src/programs/automation-studio/types.ts:3` | - |
| `ApprovePolicyProposalRequest` | Type | `packages/fluxiq/src/programs/automation-studio/api/contracts/policy.ts:26` | - |
| `askToConfirmAutomationStudioConversationCommand` | Value | `packages/fluxiq/src/programs/automation-studio/runtime/conversations/commands/confirmation.ts:25` | - |
| `assembleAutomationStudioFlowDraftPlan` | Value | `packages/fluxiq/src/programs/automation-studio/runtime/flow-bootstrap/authoring/assemble-draft.ts:64` | - |
| `assertAutomationStudioBootstrapHasNoRecordingProvenance` | Value | `packages/fluxiq/src/programs/automation-studio/runtime/flow-bootstrap/adaptation.ts:365` | - |
| `assertAutomationStudioBootstrapPermissionRequestAnswered` | Value | `packages/fluxiq/src/programs/automation-studio/runtime/flow-bootstrap/adaptation.ts:355` | - |
| `assertAutomationStudioCompiledPlan` | Value | `packages/fluxiq/src/programs/automation-studio/runtime/compiled-plan.ts:119` | - |
| `assertAutomationStudioFlowBootstrapPlanHandlesResolved` | Value | `packages/fluxiq/src/programs/automation-studio/runtime/llm/harness-options/plan-parameter-resolution.ts:126` | - |
| `assertAutomationStudioNormalEditorGraphEndpoint` | Value | `packages/fluxiq/src/programs/automation-studio/api/contracts/endpoints.ts:180` | - |
| `assertAutomationStudioReadPathDoesNotRepair` | Value | `packages/fluxiq/src/programs/automation-studio/storage/project/migration-cutover.ts:482` | - |
| `assertAutomationStudioScaleCertificationPasses` | Value | `packages/fluxiq/src/programs/automation-studio/testing/scale-certification.ts:196` | - |
| `assertFlowLlmExecutionSettings` | Value | `packages/fluxiq/src/programs/automation-studio/api/handlers/llm-execution-settings.ts:12` | - |
| `assertNoCriticalFullScan` | Value | `packages/fluxiq/src/programs/automation-studio/storage/query-plan.ts:13` | - |
| `assertPlanMentions` | Value | `packages/fluxiq/src/programs/automation-studio/storage/query-plan.ts:25` | - |
| `assertValidRecordingIndex` | Value | `packages/fluxiq/src/programs/automation-studio/storage/state-index.ts:246` | - |
| `atomicWriteJson` | Value | `packages/fluxiq/src/framework/storage-layout.ts:109` | - |
| `authorizeProgramPin` | Value | `packages/fluxiq/src/programs/_shared/authorization.ts:14` | - |
| `AUTOMATION_STUDIO_ACTION_CONSEQUENCE_PHRASES` | Object | `packages/fluxiq/src/programs/automation-studio/runtime/action-permissions/consequences.ts:67` | Each consequence as the person being asked would say it. Exhaustive, so a class added to the list above is a compile error here until it can be explained to someone. |
| `AUTOMATION_STUDIO_ACTION_CONSEQUENCES` | Object | `packages/fluxiq/src/programs/automation-studio/runtime/action-permissions/consequences.ts:47` | Every lasting consequence Core can be asked to permit, most serious first. The order is the order a request lists them in. |
| `AUTOMATION_STUDIO_ACTION_DECLARATION_CROSS_CHECK_SCHEMA_VERSION` | Object | `packages/fluxiq/src/programs/automation-studio/runtime/action-permissions/cross-check.ts:53` | - |
| `AUTOMATION_STUDIO_ACTION_DECLARATIONS_MAX` | Object | `packages/fluxiq/src/programs/automation-studio/runtime/action-permissions/declared.ts:23` | How many declarations one gate keeps. Past it the run acts as before and stops recording. |
| `AUTOMATION_STUDIO_ACTION_PERMISSION_CONTROL_NAME_MAX` | Object | `packages/fluxiq/src/programs/automation-studio/runtime/action-permissions/request.ts:81` | The longest control name a request carries. Past it the name is cut, never widened. |
| `AUTOMATION_STUDIO_ACTION_PERMISSION_REQUEST_SCHEMA_VERSION` | Object | `packages/fluxiq/src/programs/automation-studio/runtime/action-permissions/request.ts:28` | - |
| `AUTOMATION_STUDIO_ACTIVITY_LIMITS` | Object | `packages/fluxiq/src/programs/automation-studio/runtime/activity/limits.ts:6` | The bounds on every activity event (D4 of the live activity plan): string lengths match what `ClientGatewayActivity` promises its readers, and `recent` is how many events one project's snapshot keeps. |
| `AUTOMATION_STUDIO_ADAPTIVE_FAILURE_CLASSES` | Object | `packages/contracts/src/failure/adaptive-class.ts:10` | FluxIQ's one failure-category list. Core names every member and classifies failed attempts into them; a domain decides which member applies and reports it in an `AutomationStudioFailureRecord`. No second list exists in Core or in an importing domain. Adding a member breaks exhaustive consumers, so before 1.0 it is a minor version bump with a migration note. |
| `AUTOMATION_STUDIO_AES_GCM_PROJECT_CONTENT_PROTECTION_ID` | Object | `packages/fluxiq/src/programs/automation-studio/storage/project/content-protection.ts:3` | - |
| `AUTOMATION_STUDIO_ASK_EFFECT` | Object | `packages/fluxiq/src/programs/automation-studio/runtime/parking/ask-effect.ts:14` | The effect anything executing inside a run emits to ask the person something. An effect rather than a field on the node result, so the capability is open to every part of a run at once: a built-in node, a domain adapter answering a dispatch, a permission gate. The executor reads it where it reads the rest of an attempt's effects, and never hands it to a host dispatcher -- no domain is asked to know what an ask is. |
| `AUTOMATION_STUDIO_BASELINE_NODE_COUNTS` | Object | `packages/fluxiq/src/programs/automation-studio/testing/scale-baseline.ts:11` | - |
| `AUTOMATION_STUDIO_BUILD_REQUEST_MAX_CHARS` | Object | `packages/fluxiq/src/programs/automation-studio/runtime/activity/build.ts:34` | The most of the person's words one build's request carries. |
| `AUTOMATION_STUDIO_BUILTIN_HARNESS_OPTION_IDS` | Object | `packages/fluxiq/src/programs/automation-studio/runtime/llm/harness-options/builtin.ts:27` | - |
| `AUTOMATION_STUDIO_CATALOG_MIGRATIONS` | Object | `packages/fluxiq/src/programs/automation-studio/storage/catalog.ts:17` | - |
| `AUTOMATION_STUDIO_CHANGE_CONFIDENCE_DEFAULT_REPLAYS` | Object | `packages/fluxiq/src/programs/automation-studio/runtime/flow-change/confidence.ts:15` | Succeeded replays a low- or medium-risk change needs before it is `established`. |
| `AUTOMATION_STUDIO_CHANGE_VERDICT_EVIDENCE_KINDS` | Object | `packages/fluxiq/src/programs/automation-studio/runtime/flow-change/contracts.ts:48` | The evidence kinds, in the order a verdict's `basis` lists them. Declared with the kinds themselves so the verdict and the resume decision read one list rather than each keeping its own idea of what counts as evidence. |
| `AUTOMATION_STUDIO_CHANGE_VERDICT_SCHEMA_VERSION` | Object | `packages/fluxiq/src/programs/automation-studio/runtime/flow-change/verdict.ts:32` | - |
| `AUTOMATION_STUDIO_COMPILED_PLAN_COMPILER_VERSION` | Object | `packages/fluxiq/src/programs/automation-studio/runtime/compiled-plan.ts:7` | - |
| `AUTOMATION_STUDIO_COMPILED_PLAN_SCHEMA_VERSION` | Object | `packages/fluxiq/src/programs/automation-studio/runtime/compiled-plan.ts:6` | - |
| `AUTOMATION_STUDIO_CONVERSATION_ANSWER_ASK` | Object | `packages/fluxiq/src/programs/automation-studio/runtime/conversations/commands/answer-ask.ts:33` | - |
| `AUTOMATION_STUDIO_CONVERSATION_ANSWER_KINDS` | Object | `packages/fluxiq/src/programs/automation-studio/runtime/conversations/ask.ts:24` | - |
| `AUTOMATION_STUDIO_CONVERSATION_ANSWER_VALUE_MAX` | Object | `packages/fluxiq/src/programs/automation-studio/runtime/conversations/inputs.ts:23` | The longest an answer's value may be: an option id, or the words an open question takes. |
| `AUTOMATION_STUDIO_CONVERSATION_APPLY_CHANGE` | Object | `packages/fluxiq/src/programs/automation-studio/runtime/conversations/commands/apply-change.ts:15` | - |
| `AUTOMATION_STUDIO_CONVERSATION_ASK_ANSWERED` | Object | `packages/fluxiq/src/programs/automation-studio/runtime/conversations/store.ts:57` | The refusal a second, different answer gets. Named so a caller can recognise it without matching prose. |
| `AUTOMATION_STUDIO_CONVERSATION_ASK_COLUMNS` | Object | `packages/fluxiq/src/programs/automation-studio/runtime/conversations/rows.ts:75` | - |
| `AUTOMATION_STUDIO_CONVERSATION_ASK_KINDS` | Object | `packages/fluxiq/src/programs/automation-studio/runtime/conversations/ask.ts:18` | - |
| `AUTOMATION_STUDIO_CONVERSATION_ASK_STATUSES` | Object | `packages/fluxiq/src/programs/automation-studio/runtime/conversations/ask.ts:21` | - |
| `AUTOMATION_STUDIO_CONVERSATION_ASK_TIMEOUT_ACTIONS` | Object | `packages/fluxiq/src/programs/automation-studio/runtime/conversations/ask.ts:28` | What happens to a parked ask nobody answered: refuse, or take the option marked as the default. |
| `AUTOMATION_STUDIO_CONVERSATION_AUTHORS` | Object | `packages/fluxiq/src/programs/automation-studio/runtime/conversations/turn.ts:13` | - |
| `AUTOMATION_STUDIO_CONVERSATION_COLUMNS` | Object | `packages/fluxiq/src/programs/automation-studio/runtime/conversations/rows.ts:73` | - |
| `AUTOMATION_STUDIO_CONVERSATION_COMMAND_ASK_PREFIX` | Object | `packages/fluxiq/src/programs/automation-studio/runtime/conversations/commands/confirmation.ts:16` | The ask id prefix of a question a conversation command asked. |
| `AUTOMATION_STUDIO_CONVERSATION_COMMAND_ATTACHMENT` | Object | `packages/fluxiq/src/programs/automation-studio/runtime/conversations/commands/confirmation.ts:19` | The attachment kind that carries what a granted conversation-command ask runs. |
| `AUTOMATION_STUDIO_CONVERSATION_COMMANDS` | Object | `packages/fluxiq/src/programs/automation-studio/runtime/conversations/commands/catalog.ts:18` | - |
| `AUTOMATION_STUDIO_CONVERSATION_CONSEQUENTIAL_CLASSES` | Object | `packages/fluxiq/src/programs/automation-studio/runtime/conversations/ask.ts:177` | The consequence classes that make answering an ask something a person must do deliberately, with the whole question in front of them, rather than from a prompt floating over whatever else they were doing. It is the standing product rule read back: completing a purchase, deleting, and editing existing data are the acts that need the person's real say-so. Sending or publishing is here too, because it reaches other people and cannot be taken back. Only `create_new` is left out: making something new that did not exist is the one class that undoes cleanly. |
| `AUTOMATION_STUDIO_CONVERSATION_CREATE_HERE` | Object | `packages/fluxiq/src/programs/automation-studio/runtime/conversations/commands/create-here.ts:19` | - |
| `AUTOMATION_STUDIO_CONVERSATION_DESCRIBE` | Object | `packages/fluxiq/src/programs/automation-studio/runtime/conversations/commands/describe.ts:13` | - |
| `AUTOMATION_STUDIO_CONVERSATION_DISCARD_CHANGE` | Object | `packages/fluxiq/src/programs/automation-studio/runtime/conversations/commands/discard-change.ts:20` | - |
| `AUTOMATION_STUDIO_CONVERSATION_EXPLORE` | Object | `packages/fluxiq/src/programs/automation-studio/runtime/conversations/commands/explore.ts:20` | - |
| `AUTOMATION_STUDIO_CONVERSATION_FALLBACK_FLOOR` | Object | `packages/fluxiq/src/programs/automation-studio/runtime/conversations/instructions/fallback.ts:20` | Below this, a match on the words alone is not acted on. |
| `AUTOMATION_STUDIO_CONVERSATION_IMPROVE` | Object | `packages/fluxiq/src/programs/automation-studio/runtime/conversations/commands/improve.ts:20` | - |
| `AUTOMATION_STUDIO_CONVERSATION_INTERPRET_LIMITS` | Object | `packages/fluxiq/src/programs/automation-studio/runtime/conversations/instructions/interpret.ts:33` | - |
| `AUTOMATION_STUDIO_CONVERSATION_RUN_FLOW` | Object | `packages/fluxiq/src/programs/automation-studio/runtime/conversations/commands/run-flow.ts:18` | - |
| `AUTOMATION_STUDIO_CONVERSATION_STATUSES` | Object | `packages/fluxiq/src/programs/automation-studio/runtime/conversations/thread.ts:15` | - |
| `AUTOMATION_STUDIO_CONVERSATION_SUBJECT_KINDS` | Object | `packages/fluxiq/src/programs/automation-studio/runtime/conversations/thread.ts:12` | - |
| `AUTOMATION_STUDIO_CONVERSATION_TEXT_MAX` | Object | `packages/fluxiq/src/programs/automation-studio/runtime/conversations/turn.ts:17` | The longest a turn's text may be. Past it the write is refused, never cut. |
| `AUTOMATION_STUDIO_CONVERSATION_TITLE_MAX` | Object | `packages/fluxiq/src/programs/automation-studio/runtime/conversations/inputs.ts:21` | The longest a thread's title may be. |
| `AUTOMATION_STUDIO_CONVERSATION_TURN_COLUMNS` | Object | `packages/fluxiq/src/programs/automation-studio/runtime/conversations/rows.ts:74` | - |
| `AUTOMATION_STUDIO_CORE_LOOP_EVIDENCE_TOOL_POLICY_INSTRUCTION` | Object | `packages/fluxiq/src/programs/automation-studio/runtime/llm/stages/instructions.ts:108` | How to use tools, for a request that was offered some. This is Core's own evidence loop being described -- its decision schema, its completion variant, its {ok:false,code} result shape -- so it is mechanism rather than stage meaning, and it carries a reserved `core.loop-stage.` id that no registration can address. A domain that replaces "gather" replaces what gathering means for its medium; it does not get to rewrite how Core's loop is answered. It sits between the ordering statement and the stage's own instructions, and carries the text by reference rather than by copy, so there is exactly one copy of it in the codebase and the provider and the protocol cannot drift apart on what exploration means. |
| `AUTOMATION_STUDIO_CORE_LOOP_STAGE_INSTRUCTION_ID_PREFIX` | Object | `packages/fluxiq/src/programs/automation-studio/runtime/llm/stages/instructions.ts:33` | Every Core-owned stage instruction id begins with this. Reserved for the same reason. |
| `AUTOMATION_STUDIO_CORE_LOOP_STAGE_INSTRUCTIONS` | Object | `packages/fluxiq/src/programs/automation-studio/runtime/llm/stages/instructions.ts:73` | Core's default instruction for each stage: what the work of that stage is, said without naming any medium. A domain replaces one of these when its stage genuinely means something else, and adds beside them when it means the same thing with more detail. "gather" used to be the evidence loop's decision policy verbatim. That text is about choosing between offered tools -- which one to call, when not to call one, when to stop -- and the first production caller of the protocol is a runtime diagnosis, which is offered no tools at all. So every diagnosis was told how to use tools it did not have, and referred to a decision schema that was not in its request. The stage's own meaning is what stays here; the tool policy moved to AUTOMATION_STUDIO_CORE_LOOP_EVIDENCE_TOOL_POLICY_INSTRUCTION below, which is added only to a request that actually carries tools. |
| `AUTOMATION_STUDIO_DEEPSEEK_DEFAULT_MODEL` | Object | `packages/fluxiq/src/programs/automation-studio/runtime/llm/deepseek/models.ts:34` | What a caller who names no model gets: `deepseek-flash`, served by DeepSeek-V4.1-Flash. It is the cheaper of the two by roughly four and a half times on every axis, and the one every measurement in this repository was taken against once the retired alias was replaced. |
| `AUTOMATION_STUDIO_DEEPSEEK_MODEL_LIMITS` | Object | `packages/fluxiq/src/programs/automation-studio/runtime/llm/model-limits/model-limits.ts:20` | These are the only per-request size limits Core holds a request to. Core's own ceiling, `AUTOMATION_STUDIO_LLM_ABSOLUTE_MAX_TOTAL_TOKENS_PER_REQUEST`, is derived from them (`AUTOMATION_STUDIO_DEEPSEEK_MAX_CONTEXT_TOKENS`), and a request over its model's window is refused before it is sent, with its measured size (`../deepseek/provider.ts`). Spend is bounded separately, by the run's cost ceiling. |
| `AUTOMATION_STUDIO_DEEPSEEK_MODELS` | Object | `packages/fluxiq/src/programs/automation-studio/runtime/llm/deepseek/models.ts:24` | Every model id Core will accept. DeepSeek's current line, newest first. |
| `AUTOMATION_STUDIO_DEEPSEEK_OFF_PEAK_RATE_MULTIPLIER` | Object | `packages/fluxiq/src/programs/automation-studio/runtime/llm/deepseek/pricing.ts:50` | How much less an off-peak call costs: exactly half, on every rate and every model. |
| `AUTOMATION_STUDIO_DEEPSEEK_PEAK_CACHE_HIT_INPUT_USD_PER_MILLION_TOKENS` | Object | `packages/fluxiq/src/programs/automation-studio/runtime/llm/deepseek/pricing.ts:67` | What an input token costs when the provider served it from its own context cache, as against AUTOMATION_STUDIO_DEEPSEEK_PEAK_CACHE_MISS_INPUT_USD_PER_MILLION_TOKENS for one it had to read. **It never makes an estimate cheaper.** Core estimates a call against `estimateAutomationStudioDeepSeekInputTokens`, which measures the bytes it is about to send and knows nothing about caching, so the run's budget is still charged the cache-miss price before every call. This rate is applied only to hits the provider has already reported on a call that has already been made, which is a measurement rather than a promise -- so a hit rate that turns out to be wrong cannot let a run overspend its budget. |
| `AUTOMATION_STUDIO_DEEPSEEK_PEAK_CACHE_MISS_INPUT_USD_PER_MILLION_TOKENS` | Object | `packages/fluxiq/src/programs/automation-studio/runtime/llm/deepseek/pricing.ts:52` | - |
| `AUTOMATION_STUDIO_DEEPSEEK_PEAK_OUTPUT_USD_PER_MILLION_TOKENS` | Object | `packages/fluxiq/src/programs/automation-studio/runtime/llm/deepseek/pricing.ts:69` | - |
| `AUTOMATION_STUDIO_DEFAULT_ASK_ROUTES` | Object | `packages/fluxiq/src/programs/automation-studio/runtime/parking/parked-run.ts:68` | Where an ask that names no route of its own resumes: on through the node's success route when it is answered, out of its failure route when it is refused or nobody answers. A node with branch routes of its own -- Approval's `approved` and `rejected` -- names them on the ask instead. The durable ask allows a null route, meaning "none named". A run cannot leave a node by a null, so a route is filled in here, once, when the run parks -- which is also when `onTimeout: "deny"` is folded in, so the record says outright where silence leads rather than making a resume days later re-read what the node meant. |
| `AUTOMATION_STUDIO_DEFAULT_NODE_RETRY_POLICY` | Object | `packages/fluxiq/src/programs/automation-studio/runtime/executor/retry-policy.ts:29` | Retries are on by default, and this is that default: three attempts at 250 ms, then 1 s, then 2 s. It is a default rather than an opt-in because a runtime that retries only when someone remembered to ask does not survive a site nobody controls. A Flow, a node, or a Retry node guarding a branch may all override it, and the run's `maxRetriesPerAction` budget caps whatever they ask for. |
| `AUTOMATION_STUDIO_DEFAULT_PAGE_LIMIT` | Object | `packages/fluxiq/src/programs/automation-studio/storage/paging.ts:4` | - |
| `AUTOMATION_STUDIO_DESTRUCTIVE_ACTION_CONSEQUENCES` | Object | `packages/fluxiq/src/programs/automation-studio/runtime/action-permissions/destructive.ts:59` | The classes a person is still asked about, in Core's order. |
| `AUTOMATION_STUDIO_ENDPOINTS` | Object | `packages/fluxiq/src/programs/automation-studio/api/contracts/endpoints.ts:1` | - |
| `AUTOMATION_STUDIO_EVIDENCE_FLOW_BOOTSTRAP_COMPLETION_SCHEMA` | Object | `packages/fluxiq/src/programs/automation-studio/runtime/flow-bootstrap/plan/evidence-schema.ts:67` | The completion schema at the setting's default. |
| `AUTOMATION_STUDIO_EVIDENCE_FLOW_BOOTSTRAP_DRAFT_COMPLETION_SCHEMA` | Object | `packages/fluxiq/src/programs/automation-studio/runtime/flow-bootstrap/plan/evidence-schema.ts:140` | The draft completion schema at the setting's default. |
| `AUTOMATION_STUDIO_EVIDENCE_FLOW_BOOTSTRAP_LIMITS` | Object | `packages/fluxiq/src/programs/automation-studio/runtime/flow-bootstrap/plan/limits.ts:23` | - |
| `AUTOMATION_STUDIO_EXPLORATION_ANY_STATE` | Object | `packages/fluxiq/src/programs/automation-studio/runtime/exploration-reduction/state-predicate.ts:33` | The predicate that nothing has to satisfy. |
| `AUTOMATION_STUDIO_EXPLORATION_BUDGET_CEILINGS` | Object | `packages/fluxiq/src/programs/automation-studio/runtime/recovery/exploration-budget.ts:129` | The most a host may ask for. The three that bound the loop are Core's own loop ceilings, not a preference of this file's. They are written out rather than read from `AUTOMATION_STUDIO_LLM_EVIDENCE_LOOP_LIMITS` because `llm/harness/intervention.ts` imports a *value* from this directory, so reading one back at module-evaluation time closes a cycle and leaves this constant holding `undefined` -- observed, not theorised. A test pins the three equal to the loop's own limits, so they cannot drift apart silently. |
| `AUTOMATION_STUDIO_EXPLORATION_BUDGET_DEFAULTS` | Object | `packages/fluxiq/src/programs/automation-studio/runtime/recovery/exploration-budget.ts:101` | - |
| `AUTOMATION_STUDIO_EXPLORATION_DEFAULT_MAX_STEPS_WITHOUT_PROGRESS` | Object | `packages/fluxiq/src/programs/automation-studio/runtime/recovery/progress-guard.ts:62` | Consecutive steps that may fail to advance before the exploration is stopped. Three, not one: a single barren step is ordinary -- an observation that finds the thing absent is a finding -- and a refusal is meant to be feedback the model acts on. Three in a row is a loop that has stopped responding to what it is being told. |
| `AUTOMATION_STUDIO_EXPLORATION_DROP_REASONS` | Object | `packages/fluxiq/src/programs/automation-studio/runtime/exploration-reduction/reduction.ts:28` | Why a step is not in the minimum sequence. Exhaustive: a step in scope that is not kept carries exactly one of these. |
| `AUTOMATION_STUDIO_EXPLORATION_DROP_SENTENCE` | Object | `packages/fluxiq/src/programs/automation-studio/runtime/exploration-reduction/reduction.ts:44` | Core's own sentence for each reason. Never a model's. |
| `AUTOMATION_STUDIO_EXPLORATION_NO_PROGRESS_REASONS` | Object | `packages/fluxiq/src/programs/automation-studio/runtime/recovery/progress-guard.ts:41` | Why a step did not advance the exploration. Four reasons rather than one boolean: they are four different things for an operator to do about it. |
| `AUTOMATION_STUDIO_EXPLORATION_OUTCOME_FOR_LOOP_FAILURE` | Object | `packages/fluxiq/src/programs/automation-studio/runtime/recovery/exploration-outcome.ts:117` | Each evidence-loop failure code's outcome. The split that matters is three ways now, not two: the loop's own size limits are `budget_exhausted`, its repeat detection is `no_progress` -- a loop that asked twice for one thing did not run out of anything -- and everything meaning the loop could not be driven correctly is `failed`. `cancelled` is here for completeness only -- the runner aborts the loop itself whenever a limit fires, so it knows the real reason and never falls through to this row. |
| `AUTOMATION_STUDIO_EXPLORATION_OUTCOME_FOR_RUN_BUDGET` | Object | `packages/fluxiq/src/programs/automation-studio/runtime/recovery/exploration-outcome.ts:133` | Each run-budget diagnostic's outcome, for an exploration refused before it starts. |
| `AUTOMATION_STUDIO_EXPLORATION_OUTCOME_FOR_STOP_REASON` | Object | `packages/fluxiq/src/programs/automation-studio/runtime/recovery/exploration-outcome.ts:89` | Each stop reason's outcome. Exhaustive, so a new reason must be classified here. |
| `AUTOMATION_STUDIO_EXPLORATION_OUTCOMES` | Object | `packages/fluxiq/src/programs/automation-studio/runtime/recovery/exploration-outcome.ts:43` | The only endings there are. An exploration that ended for a reason outside this list is not possible: the runner has one exit and it classifies through these tables. |
| `AUTOMATION_STUDIO_EXPLORATION_STEP_OUTCOMES` | Object | `packages/fluxiq/src/programs/automation-studio/runtime/exploration-reduction/step.ts:50` | Whether the step happened, and if not, why not. `succeeded` is the only one the reduction can keep. The other three are kept apart because they are three different things to do about a step that contributed nothing: a `failed` step is a defect, a `refused` one is a policy boundary, and a `not_run` one is the loop declining to repeat itself. |
| `AUTOMATION_STUDIO_EXPLORATION_STOP_REASONS` | Object | `packages/fluxiq/src/programs/automation-studio/runtime/recovery/exploration-outcome.ts:73` | Why the budget closed an exploration, in Core's own words. A stop reason is finer than an outcome on purpose. Both `wall_clock_expired` and `recovery_deadline_expired` are `budget_exhausted`, but only one of them means the whole recovery ran out of time rather than this one exploration, and a report that could not say which would send somebody to raise the wrong limit. |
| `AUTOMATION_STUDIO_EXPLORATION_TRACE_GAPS` | Object | `packages/fluxiq/src/programs/automation-studio/runtime/exploration-reduction/evidence-loop-trace.ts:66` | Why a trace entry could not become a step. |
| `AUTOMATION_STUDIO_EXPLORED_EVIDENCE_MAX_ORDINAL` | Object | `packages/fluxiq/src/programs/automation-studio/runtime/llm/harness/explored-evidence-label.ts:25` | The largest ordinal a label can carry. |
| `AUTOMATION_STUDIO_FAILURE_RECORD_LIMITS` | Object | `packages/contracts/src/failure/record.ts:28` | Bounds `parseAutomationStudioFailureRecord` enforces; a record that exceeds them is dropped, not truncated. |
| `AUTOMATION_STUDIO_FAILURE_STAGES` | Object | `packages/contracts/src/failure/record.ts:4` | Where in an action's life a failure happened. |
| `AUTOMATION_STUDIO_FLOW_BOOTSTRAP_BUILD_ENDING_CODES` | Object | `packages/fluxiq/src/programs/automation-studio/runtime/flow-bootstrap/generation-failure/build-ending.ts:60` | The code each ending is published under. |
| `AUTOMATION_STUDIO_FLOW_BOOTSTRAP_BUILD_ENDING_MAX_MESSAGE` | Object | `packages/fluxiq/src/programs/automation-studio/runtime/flow-bootstrap/generation-failure/build-ending.ts:68` | The most a message may hold: what the chat shows of one row (`ClientGatewayActivity`, `detail.text`). |
| `AUTOMATION_STUDIO_FLOW_BOOTSTRAP_DECISION_STEP_IDS` | Object | `packages/fluxiq/src/programs/automation-studio/runtime/flow-bootstrap/decision-step-ids.ts:11` | The step names of decisions that called no tool. Core's own `core.` namespace, which no domain tool may take, so a reader tells them from tool steps by name. They ride in `steps` rather than in a field of their own so a reader that predates them still parses the record. |
| `AUTOMATION_STUDIO_FLOW_BOOTSTRAP_GENERATION_READINESS` | Object | `packages/fluxiq/src/programs/automation-studio/api/contracts/adaptation.ts:28` | - |
| `AUTOMATION_STUDIO_FLOW_BOOTSTRAP_LIMITS` | Object | `packages/fluxiq/src/programs/automation-studio/runtime/flow-bootstrap/plan/limits.ts:16` | - |
| `AUTOMATION_STUDIO_FLOW_BOOTSTRAP_MAX_REPAIR_ROUNDS` | Object | `packages/fluxiq/src/programs/automation-studio/runtime/flow-bootstrap/unfinished-build/phases.ts:82` | Repairs one build may make after its exploration, while each gets further. |
| `AUTOMATION_STUDIO_FLOW_BOOTSTRAP_MIN_REPAIR_MS` | Object | `packages/fluxiq/src/programs/automation-studio/runtime/flow-bootstrap/unfinished-build/phases.ts:85` | The least time worth starting a repair with: a look, a few decisions and the test. |
| `AUTOMATION_STUDIO_FLOW_BOOTSTRAP_OUTPUT_SCHEMA` | Object | `packages/fluxiq/src/programs/automation-studio/runtime/flow-bootstrap/plan/output-schema.ts:120` | The output schema at the setting's default. |
| `AUTOMATION_STUDIO_FLOW_BOOTSTRAP_PERMISSION_ASK_TIMEOUT_MS` | Object | `packages/fluxiq/src/programs/automation-studio/runtime/flow-bootstrap/action-permissions.ts:101` | How long a build waits for an answer, for a caller that waits at all. The one Core bound, under the name this path has always exported it by. The mechanism and the reasoning moved to `parking/permission-ask.ts` on 2026-09-22, when the repair path had to ask the same question the same way. |
| `AUTOMATION_STUDIO_FLOW_BOOTSTRAP_PERSON_NEEDED_MAX_ASKS` | Object | `packages/fluxiq/src/programs/automation-studio/runtime/flow-bootstrap/person-needed.ts:56` | How many times one build may put the question to a person. |
| `AUTOMATION_STUDIO_FLOW_BOOTSTRAP_PHASE_FAILURE_CODES` | Object | `packages/fluxiq/src/programs/automation-studio/runtime/flow-bootstrap/generation-failure/codes.ts:17` | - |
| `AUTOMATION_STUDIO_FLOW_DRAFT_ACT_ID` | Object | `packages/fluxiq/src/programs/automation-studio/runtime/flow-draft/amendment.ts:116` | The shape of an id the checklist gives: an act, `a` and its number, or a choice the person made for that act's item, the act's id and what it fixes (`a2.quantity`, `a2.size`; `../flow-bootstrap/instructed-acts/instruction-choices.ts`). |
| `AUTOMATION_STUDIO_FLOW_DRAFT_AMENDMENT_CHANGES` | Object | `packages/fluxiq/src/programs/automation-studio/runtime/flow-draft/amendment.ts:69` | Every change one amendment may ask for. |
| `AUTOMATION_STUDIO_FLOW_DRAFT_AMENDMENT_SCHEMA` | Object | `packages/fluxiq/src/programs/automation-studio/runtime/flow-draft/amendment.ts:139` | What the model is shown of the amendment shape, as a decision variant's schema. |
| `AUTOMATION_STUDIO_FLOW_DRAFT_DRY_RUN_ISSUE_CODE` | Object | `packages/fluxiq/src/programs/automation-studio/runtime/flow-draft/dry-run.ts:100` | The issue a refused dry run is counted under, beside each step's own code. |
| `AUTOMATION_STUDIO_FLOW_DRAFT_DRY_RUN_PAGE_TOOL_ID` | Object | `packages/fluxiq/src/programs/automation-studio/runtime/flow-draft/dry-run.ts:97` | The entry the page a replay broke on is shown under, beside the verdict. |
| `AUTOMATION_STUDIO_FLOW_DRAFT_DRY_RUN_TOOL_ID` | Object | `packages/fluxiq/src/programs/automation-studio/runtime/flow-draft/dry-run.ts:94` | The entry a dry run's verdict is shown to the model under. |
| `AUTOMATION_STUDIO_FLOW_DRAFT_REPLAY_PRESENT_CODE` | Object | `packages/fluxiq/src/programs/automation-studio/runtime/flow-draft/verify-only.ts:95` | The code a host answers a check with when the step's effect is already in place and nothing was run. |
| `AUTOMATION_STUDIO_FLOW_DRAFT_REPLAY_REANCHORED_CODE` | Object | `packages/fluxiq/src/programs/automation-studio/runtime/flow-draft/site-memory.ts:56` | The code Core records on a step it looked for on another page first and asked again on its own. |
| `AUTOMATION_STUDIO_FLOW_DRAFT_REPLAY_REMEMBERED_CODE` | Object | `packages/fluxiq/src/programs/automation-studio/runtime/flow-draft/site-memory.ts:53` | The code a host answers a replayed step with when its target is gone from the page it acted on. |
| `AUTOMATION_STUDIO_FLOW_DRAFT_REPLAY_STATUSES` | Object | `packages/fluxiq/src/programs/automation-studio/runtime/flow-draft/dry-run.ts:103` | How one step of the draft answered when it was run again. |
| `AUTOMATION_STUDIO_FLOW_DRAFT_REPLAY_VERIFIED_CODE` | Object | `packages/fluxiq/src/programs/automation-studio/runtime/flow-draft/verify-only.ts:92` | The code a host answers a check with when the step could run now and was not run. |
| `AUTOMATION_STUDIO_FLOW_DRAFT_ROUTING_KINDS` | Object | `packages/fluxiq/src/programs/automation-studio/runtime/flow-draft/routing.ts:38` | Every statement a step may carry about when it runs. |
| `AUTOMATION_STUDIO_FLOW_DRAFT_TOOL_ID` | Object | `packages/fluxiq/src/programs/automation-studio/runtime/flow-draft/entry.ts:36` | The entry the draft is shown under. |
| `AUTOMATION_STUDIO_FLOW_FIRST_SCHEMA_VERSION` | Object | `packages/fluxiq/src/programs/automation-studio/model/legacy-retirement.ts:4` | - |
| `AUTOMATION_STUDIO_FLOW_REPRESENTATION_VERSION` | Object | `packages/fluxiq/src/programs/automation-studio/model/flows.ts:21` | - |
| `AUTOMATION_STUDIO_FLOW_SCRIPT_FORMAT` | Object | `packages/fluxiq/src/programs/automation-studio/runtime/flow-bootstrap/plan/flow-script-format.ts:90` | - |
| `AUTOMATION_STUDIO_FLOW_SIZE_SETTING` | Object | `packages/fluxiq/src/programs/automation-studio/model/flow-size/flow-size-settings.ts:20` | The setting's identity, default and range, as every reader and the web panel name it. |
| `AUTOMATION_STUDIO_FLOW_START_LOCATION_MAX_LENGTH` | Object | `packages/fluxiq/src/programs/automation-studio/runtime/flow-bootstrap/start-location.ts:40` | The longest a start location may be. Chosen for a URL with a long path and query, which is the longest spelling any bound domain uses today, and bounded at all because the value reaches a provider's prompt. |
| `AUTOMATION_STUDIO_FLOW_VERSIONS_METADATA_KEY` | Object | `packages/fluxiq/src/programs/automation-studio/runtime/flow-version/contracts.ts:26` | The metadata key a run's version set is written under, on the session and on the run detail. |
| `AUTOMATION_STUDIO_GRAPH_PARTITION_SIZE` | Object | `packages/fluxiq/src/programs/automation-studio/storage/project/graph-store.ts:10` | - |
| `AUTOMATION_STUDIO_GRAPH_VIEWPORT_NODE_LIMIT` | Object | `packages/fluxiq/src/programs/automation-studio/storage/project/graph-store.ts:11` | - |
| `AUTOMATION_STUDIO_HARNESS_OPTION_LIMIT` | Object | `packages/fluxiq/src/programs/automation-studio/runtime/llm/harness-options/option.ts:23` | Maximum options one registry may hold, matching the evidence loop's own ceiling on the tool list it will accept. |
| `AUTOMATION_STUDIO_HIERARCHY_ROOT_PARENT_CACHE_ID` | Object | `packages/fluxiq/src/programs/automation-studio/storage/project/hierarchy/mutations.ts:5` | - |
| `AUTOMATION_STUDIO_IMPORTER_SDK_VERSION` | Object | `packages/fluxiq/src/programs/automation-studio/nodes/importer-sdk.ts:8` | - |
| `AUTOMATION_STUDIO_INSTRUCTED_ACT_MISSING_ISSUE_CODE` | Object | `packages/fluxiq/src/programs/automation-studio/runtime/flow-bootstrap/instructed-acts/check.ts:86` | The issue a missing act refuses completion under. |
| `AUTOMATION_STUDIO_INSTRUCTED_CONSEQUENCES_SCHEMA` | Object | `packages/fluxiq/src/programs/automation-studio/runtime/action-permissions/instructed.ts:63` | What the model is asked, as the completion it must return. The descriptions carry the question; the class descriptions are where "schedule a post" becomes both a new thing and a published one, so an instructed schedule is not asked about again. Leaving that to the class descriptions alone did not work. Live (`run-mud7fssy-902f877b`), the instruction "Schedule a post to the Northwind Trails account ... saying: Trail clean-up on Saturday" was read as asking for `send_or_publish` and nothing else, so when the build reached for the control it had read as `create_new` the run stopped to ask the person for a class their own instruction plainly asks for. Both descriptions list "schedule"; the model still answered with the closest single class. So the question now says, in the field the answer is given in, that one act often asks for several -- which is where a model reading "one entry for each" looks. |
| `AUTOMATION_STUDIO_INTERVENTION_MODE_VERSION` | Object | `packages/fluxiq/src/programs/automation-studio/model/flows.ts:63` | - |
| `AUTOMATION_STUDIO_LADDER_RUNG_KINDS` | Object | `packages/fluxiq/src/programs/automation-studio/runtime/executor/contracts.ts:120` | The rungs the executor runs itself, in ladder order. |
| `AUTOMATION_STUDIO_LEGACY_REPAIR_ENDPOINTS` | Object | `packages/fluxiq/src/programs/automation-studio/storage/project/migration-cutover.ts:480` | - |
| `AUTOMATION_STUDIO_LEGACY_RESOURCE_KINDS` | Object | `packages/fluxiq/src/programs/automation-studio/storage/project/migration-cutover.ts:15` | - |
| `AUTOMATION_STUDIO_LLM_ABSOLUTE_MAX_ESTIMATED_COST_USD` | Object | `packages/fluxiq/src/programs/automation-studio/runtime/llm/harness/token-limits.ts:30` | - |
| `AUTOMATION_STUDIO_LLM_ABSOLUTE_MAX_TOTAL_TOKENS_PER_REQUEST` | Object | `packages/fluxiq/src/programs/automation-studio/runtime/llm/harness/token-limits.ts:28` | The most a single request may carry: the model's context window. Derived, never restated: the largest `contextTokens` in `AUTOMATION_STUDIO_DEEPSEEK_MODEL_LIMITS` (1,000,000 for both models today). It was Core's own ceiling of 64,000 (and 50,000 before that), set as a budget decision; with whole-page evidence that ceiling hid the page from the model, and the standing decision of 2026-09-30 is that the only limit on a request is the model's window. A request over it is refused before it is sent, with its measured size (`./run.ts`, `../deepseek/provider.ts`), and is never trimmed to fit. Spend is not bounded here. The run's $0.25 cost ceiling and the per-call cost check derived from it (`../flow-execution-limits/`) are what stop a build spending, and they are unchanged. Every other per-request ceiling reads this: the API handler's Flow-settings bound, the provider's pre-flight, the session-key profile and the web app's Flow settings form. |
| `AUTOMATION_STUDIO_LLM_DEFAULT_MAX_ESTIMATED_COST_USD` | Object | `packages/fluxiq/src/programs/automation-studio/runtime/llm/harness/token-limits.ts:29` | - |
| `AUTOMATION_STUDIO_LLM_DEFAULT_REPLY_TOKENS` | Object | `packages/fluxiq/src/programs/automation-studio/runtime/llm/harness/token-limits.ts:43` | What one call reserves for the model's reply when its caller names no output limit: 8,000 tokens, the reply reserve the live session-key profile has used since the window became the request bound (`../session-key-provider.ts`). |
| `AUTOMATION_STUDIO_LLM_DEFAULT_TIMEOUT_MS` | Object | `packages/fluxiq/src/programs/automation-studio/runtime/llm/provider-contract.ts:110` | - |
| `AUTOMATION_STUDIO_LLM_DEFAULT_TOKEN_LIMITS` | Object | `packages/fluxiq/src/programs/automation-studio/runtime/llm/harness/token-limits.ts:59` | One call's limits when the caller names none: the model's context window, with the reply reserve taken out of it for the reply and the rest the input's. Until 2026-09-30 these were 8,000 input, 2,000 output and 10,000 total tokens, so a call through a resolver that named no limits was refused at 8,000 input tokens -- far below a whole page. The user's order that day leaves the window as the only bound on a request, so the defaults are the window: 992,000 input, 8,000 output and 1,000,000 total for DeepSeek today. A limit a caller names still binds, and the missing ones are derived from it: an output limit with no input limit leaves the input the window less that output, and a total limit with neither leaves the input the total less the reply reserve. |
| `AUTOMATION_STUDIO_LLM_DIAGNOSIS_TEXT_MAX_LENGTH` | Object | `packages/fluxiq/src/programs/automation-studio/runtime/llm/harness/structured-response.ts:99` | The bound on each description the model may supply. It is the same 500 characters the runtime's reader holds the field to, stated here as well because the two checks answer different questions: this one refuses the response at the boundary, and the reader's records a refusal on the run. A reader that is the only bound would accept an oversized field into the process first. |
| `AUTOMATION_STUDIO_LLM_DRAFT_WITHHELD_NOTE` | Object | `packages/fluxiq/src/programs/automation-studio/runtime/llm/harness/draft-screen.ts:27` | The note a screened draft carries, so the model knows a value exists and is not shown. |
| `AUTOMATION_STUDIO_LLM_EVIDENCE_AMENDMENT_FEEDBACK_TOOL_ID` | Object | `packages/fluxiq/src/programs/automation-studio/runtime/llm/draft-amendment-feedback.ts:35` | The evidence entry a refused amendment's feedback arrives under. |
| `AUTOMATION_STUDIO_LLM_EVIDENCE_BUDGET_TOOL_ID` | Object | `packages/fluxiq/src/programs/automation-studio/runtime/llm/loop-budget.ts:102` | The evidence entry the remaining budget is shown under. |
| `AUTOMATION_STUDIO_LLM_EVIDENCE_COMPLETION_FEEDBACK_TOOL_ID` | Object | `packages/fluxiq/src/programs/automation-studio/runtime/llm/evidence-loop/completion-check.ts:34` | The evidence entry a refused completion's feedback arrives under. |
| `AUTOMATION_STUDIO_LLM_EVIDENCE_DECISION_FEEDBACK_TOOL_ID` | Object | `packages/fluxiq/src/programs/automation-studio/runtime/llm/unusable-decision.ts:48` | The evidence entry an unusable decision's feedback arrives under. |
| `AUTOMATION_STUDIO_LLM_EVIDENCE_DECISION_INSTRUCTION` | Object | `packages/fluxiq/src/programs/automation-studio/runtime/llm/evidence-loop-decision.ts:54` | Provider-neutral decision policy for bounded evidence loops. Provider adapters should include this policy in their structured-decision instruction. The last two sentences were added after a live creation campaign in which every built Flow only read and none acted. The policy already said, rightly, never to mutate merely to perform a step that belongs in the generated result; nothing said the converse, that a refusal here is not a refusal there. Offered only tools that decline to act, and refused when it asked one to, the model read the whole exercise as "acting is unavailable" and wrote the only shape it had seen accepted. The "unless the result is a Flow built from the steps you run" clause was added 2026-09-30 (lane t195). A draft is the steps the build ran, so "never mutate to perform a workflow step" told a drafting model not to build its Flow, and "never repeat a successful mutation" read as "act on one row only": live run `run-munnop9n-5475d593` pressed one Confirm of four and never said repeat. |
| `AUTOMATION_STUDIO_LLM_EVIDENCE_HISTORY_TOOL_ID` | Object | `packages/fluxiq/src/programs/automation-studio/runtime/llm/decision-context/history-tool-id.ts:7` | The entry a decision's history is shown under. It replaces the call list the context window used to publish under the same id, which listed only tool calls and none of Core's answers to a decision, and is re-exported from `../evidence-loop.ts` under the name it always had. |
| `AUTOMATION_STUDIO_LLM_EVIDENCE_LOOP_DEFAULT_MAX_STEPS_WITHOUT_PROGRESS` | Object | `packages/fluxiq/src/programs/automation-studio/runtime/loop-limits/evidence-loop.ts:92` | The far backstop on steps in a row that give the loop nothing new, held in `runtime/loop-limits/` with the other numbers two directories read, and re-exported here so the loop's public surface names it. |
| `AUTOMATION_STUDIO_LLM_EVIDENCE_LOOP_DEFAULT_MAX_UNREADABLE_REPLIES_IN_A_ROW` | Object | `packages/fluxiq/src/programs/automation-studio/runtime/llm/unreadable-reply.ts:31` | Unreadable replies in a row after which a loop that asks again stops. The live record has runs of up to four followed by a good reply, so this leaves room past that; the budget binds underneath it either way. |
| `AUTOMATION_STUDIO_LLM_EVIDENCE_LOOP_DEFAULT_MAX_UNUSABLE_DECISIONS_IN_A_ROW` | Object | `packages/fluxiq/src/programs/automation-studio/runtime/llm/evidence-loop.ts:138` | Unusable decisions in a row, however much their issues differ, after which a loop that asks again stops: the far backstop under the no-progress guard. A model fixing one mistake at a time is progress, so this is set well past the handful of refusals a real correction takes; the cost, token and deadline guards still bind underneath it. Held to the loop's own iterations. |
| `AUTOMATION_STUDIO_LLM_EVIDENCE_LOOP_LIMITS` | Object | `packages/fluxiq/src/programs/automation-studio/runtime/loop-limits/evidence-loop.ts:34` | - |
| `AUTOMATION_STUDIO_LLM_EVIDENCE_LOOP_MAX_PROVIDER_UNANSWERED_IN_A_ROW` | Object | `packages/fluxiq/src/programs/automation-studio/runtime/llm/unanswered-calls.ts:22` | Unanswered decision calls in a row after which the loop ends. |
| `AUTOMATION_STUDIO_LLM_MAX_TIMEOUT_MS` | Object | `packages/fluxiq/src/programs/automation-studio/runtime/llm/provider-contract.ts:111` | - |
| `AUTOMATION_STUDIO_LLM_PROMPT_VERSIONS` | Object | `packages/fluxiq/src/programs/automation-studio/runtime/llm/harness/task-kind.ts:26` | - |
| `AUTOMATION_STUDIO_LLM_PROVIDER_CALL_ERROR_CODES` | Object | `packages/fluxiq/src/programs/automation-studio/runtime/llm/provider-contract.ts:59` | Every way a provider call fails once it is under way: resolving the credential, the transport, and the reply. Listed as values, beside the pre-flight list, so a table keyed by every code can be checked against the whole vocabulary at run time as well as by the type. |
| `AUTOMATION_STUDIO_LLM_PROVIDER_FAILURE_DISPOSITIONS` | Object | `packages/fluxiq/src/programs/automation-studio/runtime/llm/failure-disposition.ts:48` | Every provider failure code, and what it means for the model's next call. The pre-flight refusals all end the model's calls: a request Core refused to build or send will be refused identically next time, so retrying it only spends reveals, and one of them -- a credential found in the outbound body -- is an exfiltration signal in its own right. |
| `AUTOMATION_STUDIO_LLM_PROVIDER_PREFLIGHT_ERROR_CODES` | Object | `packages/fluxiq/src/programs/automation-studio/runtime/llm/provider-contract.ts:15` | Every way a provider refuses a request before sending it, one code per check. These were all `llm.provider_configuration_invalid`, and a run records codes, never messages, so a refusal said only that *something* local was wrong. That hid a stale field list in the DeepSeek adapter through every live recovery: each one made a call that was refused before it left the process, and the record could not say which check had refused it. A code names the check; the message stays out of the record. |
| `AUTOMATION_STUDIO_LLM_PROVIDER_REFUSAL_LIMITS` | Object | `packages/fluxiq/src/programs/automation-studio/runtime/provider-refusal/record.ts:40` | Every bound a refusal record must satisfy to be carried. A record outside them is not truncated into shape silently: either the field is dropped and named in `withheld`, or -- where the bound says the record is not one of ours at all -- the whole record is refused. |
| `AUTOMATION_STUDIO_LLM_PROVIDER_RETRY_LIMITS` | Object | `packages/fluxiq/src/programs/automation-studio/runtime/llm/provider-retry/limits.ts:29` | - |
| `AUTOMATION_STUDIO_LLM_PROVIDER_THROW_LIMITS` | Object | `packages/fluxiq/src/programs/automation-studio/runtime/llm/throw-account/read.ts:66` | The bounds a published throw is held to, written out again by the flow-bootstrap reader. |
| `AUTOMATION_STUDIO_LLM_REQUEST_REFUSAL_CODES` | Object | `packages/fluxiq/src/programs/automation-studio/runtime/llm/harness/request-refusal.ts:15` | Every guard that can refuse to build a model request, one code each. |
| `AUTOMATION_STUDIO_LLM_RUN_CALL_BACKSTOP` | Object | `packages/fluxiq/src/programs/automation-studio/runtime/llm/run-budget.ts:44` | The most provider calls one run may make when nobody says otherwise. A runaway backstop, not a working limit. What bounds a run is its estimated cost ceiling, its token budget, the recovery's wall clock, and the exploration's no-progress guard; a run that is still getting somewhere and still has money, tokens and time is meant to keep going. This number exists for the case none of those catch -- a loop that makes free, instant, ever different calls forever -- and it is set where a working loop never meets it. It is deliberately not a per-mode constant. A host or a setting that wants to allow fewer calls says so through `maxCallsPerRun`; nothing here infers a count from what kind of run it is. |
| `AUTOMATION_STUDIO_LLM_RUN_CALL_RECORD_LIMIT` | Object | `packages/fluxiq/src/programs/automation-studio/runtime/llm/run-budget.ts:52` | The most calls one run's receipt itemizes. Equal to the backstop, so a run under the default backstop is itemized in full; a host that raises its own call count past it gets the first this many, and the receipt says how many it left out rather than ending short without saying so. |
| `AUTOMATION_STUDIO_LLM_RUN_COST_CEILING_DEFAULT_USD` | Object | `packages/fluxiq/src/programs/automation-studio/model/run-cost-ceiling/run-cost-ceiling-env.ts:30` | The ceiling when the variable is unset or empty. |
| `AUTOMATION_STUDIO_LLM_RUN_COST_CEILING_ENV` | Object | `packages/fluxiq/src/programs/automation-studio/model/run-cost-ceiling/run-cost-ceiling-env.ts:27` | The environment variable that sets the run cost ceiling, in US dollars. |
| `AUTOMATION_STUDIO_LLM_RUN_COST_CEILING_MAX_USD` | Object | `packages/fluxiq/src/programs/automation-studio/model/run-cost-ceiling/run-cost-ceiling-env.ts:40` | The largest ceiling the variable may set. It is the run ledger's own server ceiling, `AUTOMATION_STUDIO_LLM_ABSOLUTE_MAX_ESTIMATED_COST_USD` (`runtime/llm/harness/token-limits.ts`), above which the ledger refuses to open at all; a literal because the model does not import the runtime, and `runtime/llm/flow-execution-limits/tests/run-cost-ceiling.test.ts` holds the two equal. |
| `AUTOMATION_STUDIO_LLM_RUN_COST_CEILING_USD` | Object | `packages/fluxiq/src/programs/automation-studio/runtime/llm/flow-execution-limits/run-cost-ceiling.ts:23` | The most one run -- a build, or a recovery -- may be estimated to spend: FLUXIQ_LLM_RUN_COST_CEILING_USD (the developer and Lab knob, default $0.10), read once when Core loads, so an invalid value stops Core at start. |
| `AUTOMATION_STUDIO_LLM_RUN_NODE_TOOL_ID` | Object | `packages/fluxiq/src/programs/automation-studio/runtime/llm/node-tools/run-node.ts:39` | The one verb that runs a node from the library. |
| `AUTOMATION_STUDIO_LLM_STEP_LOG_REDACTED` | Object | `packages/fluxiq/src/programs/automation-studio/runtime/llm/step-log/screen.ts:2` | What a credential-shaped run of text is written as. |
| `AUTOMATION_STUDIO_LOOP_PROTOCOL_INSTRUCTION_ID` | Object | `packages/fluxiq/src/programs/automation-studio/runtime/llm/stages/instructions.ts:31` | The id of the ordering statement. Reserved: a registration carrying it is refused. |
| `AUTOMATION_STUDIO_LOOP_PROTOCOL_SCOPE_KIND` | Object | `packages/fluxiq/src/programs/automation-studio/runtime/llm/stages/instructions.ts:26` | The scope name carried by the one instruction that states the order. |
| `AUTOMATION_STUDIO_LOOP_STAGE_INSTRUCTION_LIMIT` | Object | `packages/fluxiq/src/programs/automation-studio/runtime/llm/stages/registry.ts:30` | Maximum contributions one registry may hold, across every domain and stage. |
| `AUTOMATION_STUDIO_LOOP_STAGE_SCOPE_KIND` | Object | `packages/fluxiq/src/programs/automation-studio/runtime/llm/stages/instructions.ts:28` | The scope name carried by a stage's own instructions, Core's and a domain's alike. |
| `AUTOMATION_STUDIO_LOOP_STAGES` | Object | `packages/fluxiq/src/programs/automation-studio/runtime/llm/stages/protocol.ts:25` | The stages, in the only order they may be worked in. Frozen because a consumer holding this array is holding Core's ordering authority; sorting or splicing it in place would rewrite the protocol for everyone in the process. |
| `AUTOMATION_STUDIO_MAX_NODE_RETRY_WAIT_MS` | Object | `packages/fluxiq/src/programs/automation-studio/runtime/executor/defensive/retry-wait.ts:18` | The longest all the waits at one arrival at one node may add up to. Defaults must not turn a fast failure into a long hang. Without this bound a document could ask for 25 attempts at a minute each and pin a run to one node for half an hour with every check green, which is the shape of a hang, not of a defence. |
| `AUTOMATION_STUDIO_MAX_PAGE_LIMIT` | Object | `packages/fluxiq/src/programs/automation-studio/storage/paging.ts:5` | - |
| `AUTOMATION_STUDIO_MAX_RETRY_HINT_MS` | Object | `packages/fluxiq/src/programs/automation-studio/runtime/executor/defensive/retry-hint.ts:11` | The longest wait the runtime will take from a source's own hint. A service that asks for an hour is asking for something a run cannot give: the person is waiting, and a Flow that sleeps for an hour is indistinguishable from one that hung. The hint is honoured up to this bound and clamped past it, because clamping keeps the cooperative behaviour -- waiting longer than the backoff table would -- without handing a remote service control of the run's clock. |
| `AUTOMATION_STUDIO_MAX_RETRY_WAIT_MS` | Object | `packages/fluxiq/src/programs/automation-studio/runtime/executor/defensive/retry-wait.ts:8` | The longest one wait between two attempts of the same node. It matches the recorded-readiness ceiling on purpose: 30 s is the longest this runtime ever holds a run up for one thing, and a second number would be a second answer to the same question. |
| `AUTOMATION_STUDIO_MAX_RUN_RETRY_WAIT_MS` | Object | `packages/fluxiq/src/programs/automation-studio/runtime/executor/defensive/retry-wait.ts:29` | The longest all the waits in one run may add up to. The per-node bound alone is not a bound on the run: a Flow may arrive at hundreds of nodes, and the product of the two is hours. Past this figure the default policy stops absorbing faults by waiting -- the ladder keeps every other rung, and the Flow keeps its own authored error handling -- so a run that is failing everywhere fails in bounded time instead of grinding. |
| `AUTOMATION_STUDIO_NAME_MATCH_SCORE_FLOOR` | Object | `packages/fluxiq/src/programs/automation-studio/nodes/name-match/score-floor.ts:39` | The lowest `nearest` score that is still returned. Below it the answer is `undefined`: a name nobody wrote a near version of must stay an honest failure, or a correction becomes noise. Why 0.25. Measured over the real web and built-in node ids (`web.output.dom-*`, `builtin.*`) against 24 written names a model plausibly produces, the scores fall into two bands with a wide gap: - every name that should resolve scored 0.64 or better — `navigate` -> `web.output.browser-navigate` 0.64, `compare` -> `builtin.logic.compare` 0.68, `for_each` -> `builtin.control.for-each` 0.73, `filterList` -> `builtin.data.filter-list` 0.77, `dom-extract-list` -> `web.output.dom-extract_list` 0.82; - every name genuinely absent from the set scored 0.083 or worse — `upload-file` 0.083, `sendEmail` 0.070, `screenshot` 0.065, `http.request` 0.065, `banana` 0.045, `sleep` 0.036. The only case in between was `click-element` -> `web.output.dom-click` at 0.34: a name that shares the intent word and nothing else. That one should resolve, because a wrong correction is visible in the run and repairable, while a refusal costs a paid provider call the evidence says the model does not act on — run `run-mug776kx-0214b287` was refused the same way fourteen times and never corrected itself. So the floor sits inside the measured gap, nearer the absent band, admitting the 0.34 guess and rejecting the 0.083 one. Why it has not moved, and why it is not the answer to a name that misses. Names that plainly should resolve have twice been measured falling below it — short column words against long detected names, `url` at 0.042 and `prce` at 0.077 — and both times the *measure* was answering the wrong question rather than the bar being set too high. Lowering the floor far enough to admit them would have admitted `banana` (0.042) and `sponsored` (0.068) in the same movement, which is the opposite of resolving a name: it makes every refusal arbitrary. They were fixed where the score is computed (`./token-credit.ts`) and now land at 0.497 and 0.597, inside the band this floor was measured to accept. That they land there is the evidence that the measure and not the bar was at fault. |
| `AUTOMATION_STUDIO_NO_REPAIR_REASONS` | Object | `packages/fluxiq/src/programs/automation-studio/runtime/llm/harness/structured-response.ts:35` | Why there is nothing to repair, in the five ways a page says no. A model asked for a runtime patch had no way to answer "there is no repair": on a `diagnose_and_adapt` run the schema was one target override with at least one handle and no other shape, so the only schema-valid answer was a control -- and in the live repair campaign of 2026-09-17 every refusal task came back with one that was merely pressable. This is the answer that was missing. It is a closed list because a reason a run records is read by a person and matched on by the Lab, and free prose is neither. It is deliberately not the target-override refusal vocabulary (`runtime/live-patch/refusal-reasons.ts`): those words say why a domain refused a target the model proposed, and these say why the model proposed none. A refusal Core reached and a refusal the model reached are different facts about a run. |
| `AUTOMATION_STUDIO_NODE_ADAPTATION_IDS_LIMIT` | Object | `packages/fluxiq/src/programs/automation-studio/runtime/flow-change/contracts.ts:235` | A node lists at most this many adaptation ids; a longer stored list is malformed, not truncated. |
| `AUTOMATION_STUDIO_NODE_ADAPTATION_IDS_METADATA_KEY` | Object | `packages/fluxiq/src/programs/automation-studio/runtime/flow-change/contracts.ts:232` | The node-metadata key under which every change that writes or creates a node lists its adaptation id. |
| `AUTOMATION_STUDIO_NODE_REPLAY_KEY` | Object | `packages/fluxiq/src/programs/automation-studio/runtime/llm/node-tools/replay.ts:57` | The key a replay call carries, which no ordinary call of any tool may use. |
| `AUTOMATION_STUDIO_NODE_REPLAY_KINDS` | Object | `packages/fluxiq/src/programs/automation-studio/runtime/llm/node-tools/replay.ts:60` | What one replay call asks for. |
| `AUTOMATION_STUDIO_NODE_REPLAY_RESULT_CODES` | Object | `packages/fluxiq/src/programs/automation-studio/runtime/llm/node-tools/replay.ts:65` | The only codes a replay may answer with, and what each one means. |
| `AUTOMATION_STUDIO_NODE_RERUN_PLACE_UNREACHABLE_CODE` | Object | `packages/fluxiq/src/programs/automation-studio/runtime/llm/node-tools/step-place.ts:37` | The result code of a rerun that ran nothing, because its step's place could not be put back. |
| `AUTOMATION_STUDIO_NODE_VERIFIES_STATE_METADATA_KEY` | Object | `packages/fluxiq/src/programs/automation-studio/runtime/flow-change/contracts.ts:238` | The node-definition metadata key a verification verb sets to `true`, so its success counts as a downstream assertion. |
| `AUTOMATION_STUDIO_NORMAL_EDITOR_GRAPH_WRITE_ENDPOINT` | Object | `packages/fluxiq/src/programs/automation-studio/api/contracts/endpoints.ts:178` | - |
| `AUTOMATION_STUDIO_OBJECT_THRESHOLD_BYTES` | Object | `packages/fluxiq/src/programs/automation-studio/storage/object-store.ts:9` | - |
| `AUTOMATION_STUDIO_PAGE_CURSOR_VERSION` | Object | `packages/fluxiq/src/programs/automation-studio/storage/paging.ts:3` | - |
| `AUTOMATION_STUDIO_PAIRED_CLIENT_SESSION_PREFIX` | Object | `packages/fluxiq/src/programs/automation-studio/runtime/conversations/commands/caller.ts:19` | The session prefix a paired client's actor carries. |
| `AUTOMATION_STUDIO_PANEL_CAPABILITY_ATTACHMENT` | Object | `packages/fluxiq/src/programs/automation-studio/runtime/conversations/instructions/respond.ts:33` | The attachment kind that carries an invocation waiting on the person's confirmation. |
| `AUTOMATION_STUDIO_PANEL_CAPABILITY_MAX` | Object | `packages/fluxiq/src/programs/automation-studio/runtime/panel-capabilities/parse.ts:19` | The longest vocabulary Core will carry. Well past the panel's 38; a backstop, not a budget. |
| `AUTOMATION_STUDIO_PANEL_CAPABILITY_RESULT_ATTACHMENT` | Object | `packages/fluxiq/src/programs/automation-studio/runtime/conversations/instructions/request.ts:47` | The attachment kind the panel records what it did under. Read back as the panel speaking, not the person: the panel writes it on the person's behalf through the person's own endpoint, and a model that took "Started the run" as something the person said would misread the thread. |
| `AUTOMATION_STUDIO_PERMISSION_ASK_TIMEOUT_MS` | Object | `packages/fluxiq/src/programs/automation-studio/runtime/parking/permission-ask.ts:40` | How long any caller waits for an answer, at most. Short on purpose. A waiting caller holds its run, its budget and its own request open, so this is the cost of nobody being there, paid once. A person watching the thread answers in seconds; one who is not never had a build or a repair to rescue. A caller with nobody in front of it passes no timeout and does not wait -- the question is still asked, and the answer releases whatever it comes back to. |
| `AUTOMATION_STUDIO_PERSON_NEEDED_ASK_TIMEOUT_MS` | Object | `packages/fluxiq/src/programs/automation-studio/runtime/parking/person-needed-ask.ts:42` | How long the work waits for a person, at most. Longer than a permission question's two minutes: a permission is read and answered, a check has to be found in the browser and completed first. |
| `AUTOMATION_STUDIO_PERSON_NEEDED_ASKS_PER_RUN` | Object | `packages/fluxiq/src/programs/automation-studio/runtime/executor/person-needed.ts:40` | How many times one run asks a person before it stops asking and ends. |
| `AUTOMATION_STUDIO_PERSON_NEEDED_CONTROL_KIND` | Object | `packages/fluxiq/src/programs/automation-studio/runtime/parking/person-needed-ask.ts:28` | `control.kind` on every person-needed ask, and on nothing else. |
| `AUTOMATION_STUDIO_PERSON_NEEDED_DONE_OPTION` | Object | `packages/fluxiq/src/programs/automation-studio/runtime/parking/person-needed-ask.ts:30` | The option a person presses once they have completed the check. |
| `AUTOMATION_STUDIO_PERSON_NEEDED_ISSUE_CODES` | Object | `packages/fluxiq/src/programs/automation-studio/runtime/parking/person-needed-tool-calls.ts:53` | Each ending as the one issue code a build's or a recovery's record carries. |
| `AUTOMATION_STUDIO_PERSON_NEEDED_MAX_ASKS` | Object | `packages/fluxiq/src/programs/automation-studio/runtime/parking/person-needed-tool-calls.ts:47` | How many times one piece of work may put the question to a person. |
| `AUTOMATION_STUDIO_PERSON_NEEDED_STOP_OPTION` | Object | `packages/fluxiq/src/programs/automation-studio/runtime/parking/person-needed-ask.ts:32` | The option a person presses to stop the work instead. |
| `AUTOMATION_STUDIO_PERSON_NEEDED_TEXT` | Object | `packages/fluxiq/src/programs/automation-studio/runtime/parking/person-needed-ask.ts:34` | What the person is asked, in the thread and on the page's overlay. |
| `AUTOMATION_STUDIO_PHASE_12_REQUIRED_DOC_PATHS` | Object | `packages/fluxiq/src/programs/automation-studio/testing/scale-certification.ts:154` | - |
| `AUTOMATION_STUDIO_PLAN_NODE_HANDLE_KEY` | Object | `packages/fluxiq/src/programs/automation-studio/runtime/llm/harness-options/plan-node-handles.ts:39` | The key of a handle reference. |
| `AUTOMATION_STUDIO_PLAN_NODE_HANDLE_LOCATION_KEY` | Object | `packages/fluxiq/src/programs/automation-studio/runtime/llm/harness-options/plan-node-handles.ts:41` | The one other key a handle reference may carry: where the handle was seen. |
| `AUTOMATION_STUDIO_PLAN_PARAMETER_ISSUE_CODES` | Object | `packages/fluxiq/src/programs/automation-studio/runtime/llm/harness-options/plan-parameter-resolution.ts:42` | Core's own reasons a node's parameters were not accepted. A domain's refusal carries the domain's codes instead. |
| `AUTOMATION_STUDIO_PLAN_STEP_CONSEQUENCES_KEY` | Object | `packages/fluxiq/src/programs/automation-studio/runtime/llm/harness-options/plan-step-consequences.ts:43` | The field and the step word a consequence declaration is written as, and the word the Flow script format tells the model to write. One spelling, named once, for the node field, the reserved step word and the parameter fallback. |
| `AUTOMATION_STUDIO_PROGRAM` | Object | `packages/fluxiq/src/programs/automation-studio/metadata.ts:3` | - |
| `AUTOMATION_STUDIO_PROJECT_ADAPTATION_EVIDENCE_MIGRATION` | Object | `packages/fluxiq/src/programs/automation-studio/storage/project/schema/adaptations.ts:5` | - |
| `AUTOMATION_STUDIO_PROJECT_ADAPTATION_MATCHING_MIGRATION` | Object | `packages/fluxiq/src/programs/automation-studio/storage/project/schema/adaptation-matching.ts:14` | - |
| `AUTOMATION_STUDIO_PROJECT_ADMINISTRATION_MIGRATIONS` | Object | `packages/fluxiq/src/programs/automation-studio/storage/project/administration.ts:79` | - |
| `AUTOMATION_STUDIO_PROJECT_COMPILED_RUNTIME_ISOLATION_MIGRATION` | Object | `packages/fluxiq/src/programs/automation-studio/storage/project/schema/compiled-plans.ts:5` | - |
| `AUTOMATION_STUDIO_PROJECT_CONVERSATION_MIGRATION` | Object | `packages/fluxiq/src/programs/automation-studio/storage/project/schema/conversations.ts:24` | - |
| `AUTOMATION_STUDIO_PROJECT_DOMAIN_RESOURCE_MIGRATION` | Object | `packages/fluxiq/src/programs/automation-studio/storage/project/schema/domain-resources.ts:4` | - |
| `AUTOMATION_STUDIO_PROJECT_DOMAIN_TABLES` | Object | `packages/fluxiq/src/programs/automation-studio/storage/project/schema/table-names.ts:3` | - |
| `AUTOMATION_STUDIO_PROJECT_EVENT_CURSOR_MIGRATION` | Object | `packages/fluxiq/src/programs/automation-studio/storage/project/schema/event-streams.ts:38` | - |
| `AUTOMATION_STUDIO_PROJECT_FAST_UI_QUERY_INDEX_MIGRATION` | Object | `packages/fluxiq/src/programs/automation-studio/storage/project/schema/ui-query-indexes.ts:5` | - |
| `AUTOMATION_STUDIO_PROJECT_FLOW_GRAPH_JUDGEMENT_MIGRATION` | Object | `packages/fluxiq/src/programs/automation-studio/storage/project/schema/graph-judgements.ts:38` | - |
| `AUTOMATION_STUDIO_PROJECT_FLOW_RESOURCE_MIGRATION` | Object | `packages/fluxiq/src/programs/automation-studio/storage/project/flow-resource-repository.ts:40` | - |
| `AUTOMATION_STUDIO_PROJECT_INTERVENTION_MODE_MIGRATION` | Object | `packages/fluxiq/src/programs/automation-studio/storage/project/schema/flow-settings.ts:4` | - |
| `AUTOMATION_STUDIO_PROJECT_MIGRATION_CUTOVER_MIGRATION` | Object | `packages/fluxiq/src/programs/automation-studio/storage/project/migration-cutover.ts:159` | - |
| `AUTOMATION_STUDIO_PROJECT_MUTATION_MIGRATION` | Object | `packages/fluxiq/src/programs/automation-studio/storage/project/schema/mutations.ts:5` | - |
| `AUTOMATION_STUDIO_PROJECT_MUTATION_TABLES` | Object | `packages/fluxiq/src/programs/automation-studio/storage/project/schema/table-names.ts:59` | - |
| `AUTOMATION_STUDIO_PROJECT_RELATION_INDEX_MIGRATION` | Object | `packages/fluxiq/src/programs/automation-studio/storage/project/schema/relation-indexes.ts:6` | - |
| `AUTOMATION_STUDIO_PROJECT_RESULT_CHECK_MIGRATION` | Object | `packages/fluxiq/src/programs/automation-studio/storage/project/schema/result-checks.ts:36` | - |
| `AUTOMATION_STUDIO_PROJECT_RETENTION_MIGRATION` | Object | `packages/fluxiq/src/programs/automation-studio/storage/project/schema/event-streams.ts:50` | - |
| `AUTOMATION_STUDIO_PROJECT_REUSABLE_LLM_CONTEXT_AUDIT_MIGRATION` | Object | `packages/fluxiq/src/programs/automation-studio/storage/project/schema/reusable-llm-contexts.ts:38` | - |
| `AUTOMATION_STUDIO_PROJECT_REUSABLE_LLM_CONTEXT_MIGRATION` | Object | `packages/fluxiq/src/programs/automation-studio/storage/project/schema/reusable-llm-contexts.ts:6` | - |
| `AUTOMATION_STUDIO_PROJECT_REUSABLE_LLM_CONTEXT_VALIDATION_MIGRATION` | Object | `packages/fluxiq/src/programs/automation-studio/storage/project/schema/reusable-llm-contexts.ts:57` | - |
| `AUTOMATION_STUDIO_PROJECT_ROUTER_RUNTIME_SCALING_MIGRATION` | Object | `packages/fluxiq/src/programs/automation-studio/storage/project/schema/routers.ts:5` | - |
| `AUTOMATION_STUDIO_PROJECT_ROUTER_RUNTIME_SUMMARY_DETAIL_MIGRATION` | Object | `packages/fluxiq/src/programs/automation-studio/storage/project/schema/routers.ts:30` | - |
| `AUTOMATION_STUDIO_PROJECT_ROUTER_TARGET_REFERENCE_MIGRATION` | Object | `packages/fluxiq/src/programs/automation-studio/storage/project/schema/routers.ts:48` | - |
| `AUTOMATION_STUDIO_PROJECT_RUN_DATASET_MIGRATION` | Object | `packages/fluxiq/src/programs/automation-studio/storage/project/schema/run-datasets.ts:7` | - |
| `AUTOMATION_STUDIO_PROJECT_RUNTIME_SUMMARY_ENVELOPE_MIGRATION` | Object | `packages/fluxiq/src/programs/automation-studio/storage/project/schema/runtime-runs.ts:4` | - |
| `AUTOMATION_STUDIO_PROJECT_SEARCH_TABLES` | Object | `packages/fluxiq/src/programs/automation-studio/storage/project/schema/table-names.ts:57` | - |
| `AUTOMATION_STUDIO_PROJECT_STREAM_SPOOL_MIGRATION` | Object | `packages/fluxiq/src/programs/automation-studio/storage/project/schema/event-streams.ts:5` | - |
| `AUTOMATION_STUDIO_PROJECT_STREAM_SPOOL_TABLES` | Object | `packages/fluxiq/src/programs/automation-studio/storage/project/schema/table-names.ts:61` | - |
| `AUTOMATION_STUDIO_READINESS_CAP_MS` | Object | `packages/fluxiq/src/programs/automation-studio/runtime/executor/recorded-state.ts:38` | The longest one; a 90 s gap where the author went to make coffee must not stall a run. |
| `AUTOMATION_STUDIO_READINESS_FLOOR_MS` | Object | `packages/fluxiq/src/programs/automation-studio/runtime/executor/recorded-state.ts:35` | The shortest a recorded gap may hold the run up for; a 50 ms recording must not give up after 50 ms on a slow day. |
| `AUTOMATION_STUDIO_REAUTHOR_BRIEF_INSTRUCTION_ID` | Object | `packages/fluxiq/src/programs/automation-studio/runtime/recovery/refuted-result/brief.ts:42` | The id every repair brief carries, so a reader can tell it from an instruction a person wrote. |
| `AUTOMATION_STUDIO_RECORD_FIELD_HANDLINGS` | Object | `packages/contracts/src/record-sets/schema.ts:11` | What happens to a field's value. `include` (the default) keeps it. `exclude` keeps it out of node outputs, stored rows, the stored schema, previews, and exports. `encrypt` is refused until record keys exist (K11). |
| `AUTOMATION_STUDIO_RECORD_OUTPUT_LIMITS` | Object | `packages/contracts/src/record-sets/output.ts:9` | Caps on a record output and on the rows it captures. |
| `AUTOMATION_STUDIO_RECORD_SCHEMA_LIMITS` | Object | `packages/contracts/src/record-sets/schema.ts:16` | Bounds `parseAutomationStudioRecordSchema` enforces. A schema that exceeds them is rejected, not trimmed. |
| `AUTOMATION_STUDIO_RECORD_VALUE_TYPES` | Object | `packages/contracts/src/record-sets/schema.ts:2` | The value types a record field can hold. |
| `AUTOMATION_STUDIO_RECORD_WRITE_MODES` | Object | `packages/contracts/src/record-sets/output.ts:4` | How a capture meets rows already stored for the same dataset in the same run. |
| `AUTOMATION_STUDIO_RECORDED_GAP_METADATA_KEY` | Object | `packages/fluxiq/src/programs/automation-studio/runtime/executor/recorded-state.ts:32` | The node metadata field carrying the recorded inter-step gap, in milliseconds. |
| `AUTOMATION_STUDIO_RECOVERY_BUDGET_SHARES` | Object | `packages/fluxiq/src/programs/automation-studio/runtime/recovery/annotation/run-budget.ts:55` | How many shares a recovery's token pot and cost purse are sized and divided into. **Not a call limit.** Two numbers still have to be chosen: how big the default token pot is, and how much of the cost purse one call may reserve before it knows what it will spend. Both are sized as "enough for this many ordinary calls". A call is reserved at its share and charged what it actually used, so a run whose calls come in under their share -- nearly all of them, because the share covers a worst-case request -- makes more calls than this, not fewer. Only a run whose every call spends its full worst case stops here, and it stops on tokens or money, reported as such. Twenty-four is a diagnosis, a patch and a couple of dozen evidence decisions. |
| `AUTOMATION_STUDIO_RECOVERY_CONTEXT_SECTIONS` | Object | `packages/fluxiq/src/programs/automation-studio/runtime/recovery/context.ts:130` | Every section, in the order the context carries them. The order is the contract: it is the order a reader may assume. Nothing is dropped for size. `recent_nodes` overlaps the packet's own `recentActions`, deliberately. The packet's list is the last twelve *attempts* with their statuses and failure categories; this is the ordered chain of nodes that actually succeeded before the failure, and it is here so that `recoveryContext` is readable on its own by the recovery plan and by the adaptation that records it. It is next to last in priority precisely because the packet already says most of it. `recovered_failures` is its counterpart and ranks far higher, because what a run survived is evidence about the page and what it walked past is not. It sits immediately behind `recovery_candidates`: the same kind of fact -- what the recovery had to work with -- one step wider than the failure being repaired. `flow_graph` and `step_parameters` sit *after* the two transition sections and before everything else, and where they sit is the whole of how one fixed list serves two entry points. A failed step is repaired from what the step expected and what it got, so the transitions come first and nothing about that reading changed. A refuted *result* has no transition comparison at all -- every step did what it said -- so both transition sections are absent, and these two arrive immediately behind the failure record, which is where a repair that must rewrite the Flow needs them. No ranking is computed and no section moves: the same list reads differently only because a different run produced different sections. |
| `AUTOMATION_STUDIO_RECOVERY_EXPLORATION_COMPLETION_SCHEMA` | Object | `packages/fluxiq/src/programs/automation-studio/runtime/recovery/annotation/exploration.ts:101` | What an exploration is allowed to complete with. Deliberately narrow, and deliberately not a repair. An exploration answers "what is actually true out there"; deciding what to change about the Flow is the patch stage's work, and a completion schema that accepted a patch here would let the model skip the stage that is answerable to a policy. |
| `AUTOMATION_STUDIO_RECOVERY_LOOP_STAGES` | Object | `packages/fluxiq/src/programs/automation-studio/runtime/recovery/trace.ts:57` | Which loop-protocol stage each recovery stage drives, where one is driven. It lives beside the vocabulary rather than beside the assembler because two files now write the mapping -- the stage assembler and the exploration runner -- and a second copy is how a run comes to claim it drove `gather` from one place and `plan` from another for the same work. |
| `AUTOMATION_STUDIO_RECOVERY_MAX_DURATION_CEILING_MS` | Object | `packages/fluxiq/src/programs/automation-studio/runtime/recovery/recovery-deadline.ts:40` | The largest a host may set it to. Above this a recovery is a background job. |
| `AUTOMATION_STUDIO_RECOVERY_MAX_DURATION_MS` | Object | `packages/fluxiq/src/programs/automation-studio/runtime/recovery/recovery-deadline.ts:37` | The default ceiling on one recovery, end to end. Ten minutes. It was two, when a recovery was a diagnosis, a short look and a patch. A recovery now iterates for as long as it is learning something -- a default recovery allows twenty-six provider calls -- and at a realistic few seconds a call, two minutes would quietly have become the new call cap, ending explorations that were still making progress. The per-call timeout is unchanged, so a hung call is still caught at its own limit; this bounds only how long a recovery that keeps answering may keep going, and it is still the clock a person watching the run is waiting on. |
| `AUTOMATION_STUDIO_RECOVERY_TRACE_STAGES` | Object | `packages/fluxiq/src/programs/automation-studio/runtime/recovery/trace.ts:40` | The loop's stages at the failure entry point, in the only order they may occur. |
| `AUTOMATION_STUDIO_REFUTED_RESULT_ATTEMPT_PREFIX` | Object | `packages/fluxiq/src/programs/automation-studio/runtime/recovery/refuted-result/attempt.ts:41` | The attempt id prefix, so a reader can tell this attempt from one the graph executed. |
| `AUTOMATION_STUDIO_RESULT_CHECK_AUTHORIZATION_CODES` | Object | `packages/fluxiq/src/programs/automation-studio/runtime/result-check-authorization/contracts.ts:159` | Why a standing authorization was not redeemed. One code per reason, so a reader can act on it. |
| `AUTOMATION_STUDIO_RESULT_CHECK_AUTHORIZATION_DEFAULTS` | Object | `packages/fluxiq/src/programs/automation-studio/runtime/result-check-authorization/contracts.ts:144` | What a standing authorization is bounded by when the person turning checking on names no numbers. A verification call was measured at $0.001483 (four real DeepSeek calls, 2026-09-21), so the default total covers well over six hundred checks -- more than the default schedule reaches in a Flow's first several thousand runs -- while still being a number a person can reason about. The per-call ceiling is far above the measured call and far below a recovery's own $0.25, so a verification whose packet grew unexpectedly is refused rather than billed. |
| `AUTOMATION_STUDIO_RESULT_CHECK_CODES` | Object | `packages/fluxiq/src/programs/automation-studio/runtime/result-check-schedule/contracts.ts:42` | The codes a decision carries. One per reason, so a reader can tell them apart. |
| `AUTOMATION_STUDIO_RESULT_CHECK_DEFAULTS` | Object | `packages/fluxiq/src/programs/automation-studio/runtime/result-check-schedule/settings.ts:49` | What a Flow nobody has configured checks on. Every existing Flow reads these without a migration. |
| `AUTOMATION_STUDIO_RESULT_CHECK_REVEAL_TTL_MS` | Object | `packages/fluxiq/src/programs/automation-studio/runtime/result-check-authorization/reveal.ts:33` | How long the one-use reveal this mints may sit unclaimed. Unrelated to the standing authorization's own expiry: that says whether checking may happen for the next ninety days, this says how long this one release of the key may wait. It is claimed on the next line. |
| `AUTOMATION_STUDIO_RESULT_CHECK_TASK_KIND` | Object | `packages/fluxiq/src/programs/automation-studio/runtime/result-check-authorization/contracts.ts:49` | The one task kind a standing check authorization can ever be redeemed for. |
| `AUTOMATION_STUDIO_RESULT_OBSERVATION_CODES` | Object | `packages/fluxiq/src/programs/automation-studio/runtime/result-verification/core-observation.ts:48` | Core's codes for a verdict it reached itself. |
| `AUTOMATION_STUDIO_RESULT_REAUTHOR_METADATA_KEY` | Object | `packages/fluxiq/src/programs/automation-studio/runtime/recovery/refuted-result/reauthor.ts:58` | Where a refuted run's metadata records what became of the route. |
| `AUTOMATION_STUDIO_RESULT_REPAIR_COST_BOUND_CODE` | Object | `packages/fluxiq/src/programs/automation-studio/runtime/recovery/refuted-result/purse.ts:52` | The code a part of the repair is recorded under when the purse had nothing left for it: the run ledger's own code for a total that cannot take another call, so a reader keys on one code for "the money ran out" wherever it ran out. |
| `AUTOMATION_STUDIO_RESULT_REPAIR_FINDING_CODES` | Object | `packages/fluxiq/src/programs/automation-studio/runtime/result-verification/repair-directive.ts:51` | Core's stable codes for what it found wrong with a result. |
| `AUTOMATION_STUDIO_RESULT_REPAIR_MAX_ATTEMPTS` | Object | `packages/fluxiq/src/programs/automation-studio/runtime/recovery/refuted-result/history.ts:45` | How many times one run's answer may be re-authored. Three: the first repair acts on the check's advice, the second on what the first produced, and the third on both. Each is a full build under the run's own cost, token and deadline ledger, which is the bound that matters; this is the bound on a loop that keeps being refuted for reasons it cannot fix. |
| `AUTOMATION_STUDIO_RESULT_REPAIR_METADATA_KEY` | Object | `packages/fluxiq/src/programs/automation-studio/runtime/recovery/refuted-result/history.ts:48` | The run's own record that its result was taken through the failure entry point (`repair.ts`). |
| `AUTOMATION_STUDIO_RESULT_VERDICT_CODES` | Object | `packages/fluxiq/src/programs/automation-studio/runtime/result-verification/verdict.ts:48` | Core's codes for a verdict a model call reached, or failed to. The last two are for a first answer other than `yes` that a second call with the same evidence did not settle (`agreement.ts`): one of the two said `yes`, or neither did and they did not both say `no`. |
| `AUTOMATION_STUDIO_RESULT_VERIFICATION_DEADLINE_MS` | Object | `packages/fluxiq/src/programs/automation-studio/runtime/result-verification/deadline.ts:41` | How long the whole of a verification may take: resolving a provider, reading the instructions and the run detail, and both calls. Two calls at the harness's own per-call ceiling fit inside it with room for the reads around them, so a deadline reached here means something stopped settling rather than that the model was slow. |
| `AUTOMATION_STUDIO_RESULT_VERIFICATION_SKIP_CODES` | Object | `packages/fluxiq/src/programs/automation-studio/runtime/result-verification/verify.ts:78` | Core's codes for a run that was not verified, and why. Never a verdict. Two codes used to live here and no longer do, because the cases they named are now judged rather than skipped: `core.result.nothing_to_judge`, for a run that stored no record set, and `core.result.no_records`, for a record set holding no rows. Both are still readable on runs recorded before 2026-09-24, and `verification-status.ts` still maps the first to the `no_result` status a stored run may carry; nothing produces either any more. What is left is the two ways a question can fail to be put at all: no model to put it to, and a verification that did not finish inside its deadline (`deadline.ts`). Both are `performed: false`, both read as `unverified`, and neither is ever a pass. |
| `AUTOMATION_STUDIO_RESULT_WRONG_ANSWER_CODE` | Object | `packages/fluxiq/src/programs/automation-studio/runtime/recovery/refuted-result/reauthor.ts:54` | Core's code for the verdict this routes on. Written here rather than imported, because the value edge would close a cycle -- `result-verification/run-outcome.ts` already calls into this directory -- and typed against the table it comes from, so the two cannot drift: renaming the code there is a compile error here. |
| `AUTOMATION_STUDIO_RETIRED_ACTIVE_JSON_INDEXES` | Object | `packages/fluxiq/src/programs/automation-studio/storage/project/migration-cutover.ts:471` | - |
| `AUTOMATION_STUDIO_REUSABLE_LLM_CONTEXT_DEFAULT_TTL_MS` | Object | `packages/fluxiq/src/programs/automation-studio/storage/project/reusable-llm-context-store.ts:12` | - |
| `AUTOMATION_STUDIO_REUSABLE_LLM_CONTEXT_MAX_TTL_MS` | Object | `packages/fluxiq/src/programs/automation-studio/storage/project/reusable-llm-context-store.ts:11` | - |
| `AUTOMATION_STUDIO_REUSABLE_LLM_CONTEXT_VERSION` | Object | `packages/fluxiq/src/programs/automation-studio/storage/project/reusable-llm-context-store.ts:10` | - |
| `AUTOMATION_STUDIO_ROUTE_CONDITION_FORM` | Object | `packages/fluxiq/src/programs/automation-studio/runtime/flow-bootstrap/plan/route-condition.ts:57` | How a model is told to write a condition, used wherever one is refused. |
| `AUTOMATION_STUDIO_ROUTE_CONDITION_LIMITS` | Object | `packages/fluxiq/src/programs/automation-studio/runtime/flow-bootstrap/plan/route-condition.ts:68` | - |
| `AUTOMATION_STUDIO_ROUTE_CONDITION_OPERATORS` | Object | `packages/fluxiq/src/programs/automation-studio/runtime/flow-bootstrap/plan/route-condition.ts:27` | The operators the router evaluates on the state it is given. The rest of Core's vocabulary -- `changed`, `increased`, `decreased`, `stable_for` -- needs a history of transitions the router does not have, so it fails closed there and is refused here rather than authored into a rule that can never hold. |
| `AUTOMATION_STUDIO_ROUTE_SIGNAL_PATH` | Object | `packages/fluxiq/src/programs/automation-studio/runtime/flow-bootstrap/plan/route-condition.ts:66` | `inputs.<name>` or `state.<name>`, dotted, each segment a plain word. |
| `AUTOMATION_STUDIO_ROUTER_DECISION_TEXT` | Object | `packages/fluxiq/src/programs/automation-studio/runtime/flow-bootstrap/plan/routing-context.ts:21` | How the router decides, in the words the model reads. |
| `AUTOMATION_STUDIO_RUN_CONTROL_MAX_PAUSED_MS` | Object | `packages/fluxiq/src/programs/automation-studio/runtime/run-control/run-controller.ts:37` | How long a run may stay held before it stops itself. It matches how long the web panel reads a run back after its request was cut short, so a run held past it would be one no open panel was still watching. |
| `AUTOMATION_STUDIO_RUN_PROGRESS_STATUSES` | Object | `packages/fluxiq/src/programs/automation-studio/runtime/run-control/progress-status.ts:15` | - |
| `AUTOMATION_STUDIO_RUNTIME_PATCH_SKIP_CODES` | Object | `packages/fluxiq/src/programs/automation-studio/runtime/recovery/diagnosis-chain.ts:31` | Core's reasons for not asking for a runtime patch, one code each. Every one of these used to reach a run as the single code `llm.runtime_patch_not_requested`, so "the model said the goal is gone", "the diagnosis call returned something else" and "the policy permits no patch kind here" were one word on the record. Live run `run-muesyox4-930bef98` (2026-09-23) is the case that made it matter: a `target_not_found` whose diagnosis validated, and whose refusal could not be attributed to any of the five clauses from the run's artifacts. The shape is fixed by more than taste. The Lab's run-detail parser accepts a skip code only when it matches `llm.runtime_patch_[a-z_]+`, and drops anything else *silently*, so a code outside this shape would restore the silence it is here to end. |
| `AUTOMATION_STUDIO_RUNTIME_PATCH_SKIP_CODES_CHECKABLE_BY_EXPLORATION` | Object | `packages/fluxiq/src/programs/automation-studio/runtime/recovery/diagnosis-chain.ts:115` | The refusals a look at the page could overturn. One, and it is the one that matters. `goal_unachievable` is the model's claim *about the page* -- that the step's result can no longer be reached -- given before it had seen one. Live run `run-muesyox4-930bef98` (2026-09-23) is the case: the model was shown an 819-byte packet with no same-family control and no fingerprint candidate on it, said the goal was gone, and the loop cancelled the exploration on the strength of that answer, so the single claim a page could have settled was the single claim nothing checked. `plan.ts` has always said a refusal must stay checkable; the gate in `annotate.ts` did not, and this set is what reconciles them. The other six are out, each for its own reason. A diagnosis that was never requested, that failed, or that answered with something else leaves no claim to check and nothing to re-plan from. A failure Stage A resolved without the model was decided by Core's classifier rather than by a reading of the page. A policy that permits no patch kind is a person's setting, which a page cannot speak to, so looking would spend a run's calls on an answer that could not change. And `diagnosis_asked_for_none` cannot reach here at all: it is decided by `!patchNeeded && !explorationNeeded`, and `explorationNeeded` false is exactly what stops an exploration running, so there is never a look to re-plan from. It is left out rather than included harmlessly, because a set that lists an unreachable member reads as a rule nobody has checked. |
| `AUTOMATION_STUDIO_RUNTIME_SESSION_LLM_INTENTS` | Object | `packages/fluxiq/src/programs/automation-studio/runtime/llm/runtime-session-llm.ts:13` | Every intent a runtime session may be started with. |
| `AUTOMATION_STUDIO_RUNTIME_TARGET_HANDLE_MAX_LENGTH` | Object | `packages/fluxiq/src/programs/automation-studio/runtime/llm/harness/structured-response.ts:111` | - |
| `AUTOMATION_STUDIO_RUNTIME_TARGET_HANDLE_PATTERN` | Object | `packages/fluxiq/src/programs/automation-studio/runtime/llm/harness/structured-response.ts:110` | The vocabulary an opaque handle may use, and nothing wider. A handle is a name, not a path: no whitespace, no brackets, no quotes, no combinators, no slashes, no parentheses. That is deliberately narrower than "a bounded string", because the whole point of the handle is that it cannot carry structure. A domain that wants to say *where* something is says it in its own resolution, on the domain's side of this boundary, never here. |
| `AUTOMATION_STUDIO_RUNTIME_TARGET_MAX_HANDLES` | Object | `packages/fluxiq/src/programs/automation-studio/runtime/llm/harness/structured-response.ts:112` | - |
| `AUTOMATION_STUDIO_RUNTIME_TARGET_MAX_SERIALIZED_LENGTH` | Object | `packages/fluxiq/src/programs/automation-studio/runtime/llm/harness/structured-response.ts:113` | - |
| `AUTOMATION_STUDIO_RUNTIME_TARGET_OVERRIDE_REFUSAL_REASONS` | Object | `packages/fluxiq/src/programs/automation-studio/runtime/live-patch/refusal-reasons.ts:21` | - |
| `AUTOMATION_STUDIO_SCALE_CERTIFICATION_SCHEMA_VERSION` | Object | `packages/fluxiq/src/programs/automation-studio/testing/scale-certification.ts:4` | - |
| `AUTOMATION_STUDIO_SCALE_PROFILES` | Object | `packages/fluxiq/src/programs/automation-studio/testing/scale-fixtures.ts:35` | - |
| `AUTOMATION_STUDIO_SESSION_KEY_PROVIDER_DEFAULTS` | Object | `packages/fluxiq/src/programs/automation-studio/runtime/llm/session-key-provider.ts:53` | One call's defaults. The token limits are the largest window of any model; a resolved call gets its own model's window (below). |
| `AUTOMATION_STUDIO_STRUCTURED_DIAGNOSIS_MODEL_FIELDS` | Object | `packages/fluxiq/src/programs/automation-studio/runtime/recovery/structured-diagnosis.ts:62` | The model-supplied fields, named once so the reader and the summary agree. |
| `AUTOMATION_STUDIO_STRUCTURED_DIAGNOSIS_TEXT_MAX_LENGTH` | Object | `packages/fluxiq/src/programs/automation-studio/runtime/recovery/structured-diagnosis.ts:59` | The longest a model-supplied description may be before it is refused. |
| `AUTOMATION_STUDIO_TARGET_SCALE` | Object | `packages/fluxiq/src/programs/automation-studio/testing/scale-fixtures.ts:19` | - |
| `AUTOMATION_STUDIO_TOKENS_PER_RUN_DEFAULT_CLEARED_KEY` | Object | `packages/fluxiq/src/programs/automation-studio/model/tokens-per-run/tokens-per-run-default-cleared-key.ts:20` | Written on a Flow whose `trainingModeSettings.budgets.maxTokensPerRun` can no longer be the token cap Core once wrote into every new Flow. Until 2026-09-30 the default Flow settings (`../flows.ts`) carried `maxTokensPerRun: 12000`, which held an unattended recovery to 12,000 tokens and refused a whole page's diagnosis outright. The user's order that day was to remove every limit on what the model is passed: the model's own context window is the only bound on a request, and the $0.25 per-build ceiling the bound on spending. So the default carries no token cap, and a stored Flow that still holds exactly 12,000 has it cleared where it is read (`runtime/service/flow-settings/tokens-per-run-default-migration.ts`). The web settings form never saved 12,000 as a person's choice -- it saved only a value that differed from it -- so a stored 12,000 without this key is always the default. The key says the clearing is done or was never needed: a new Flow is created with it, a cleared Flow is given it, and the settings form writes it on every save, so a 12,000 a person sets from now on is theirs and stays. |
| `AUTOMATION_STUDIO_TRANSIENT_STATUSES` | Object | `packages/fluxiq/src/programs/automation-studio/runtime/executor/defensive/transient-status.ts:31` | The statuses the runtime retries by default, for a caller that needs the list rather than the question. |
| `AUTOMATION_STUDIO_UI_CACHE_MAX_BATCH_ENTRIES` | Object | `packages/fluxiq/src/programs/automation-studio/storage/project/ui-cache-store.ts:6` | - |
| `AUTOMATION_STUDIO_UI_CACHE_MAX_ENTRY_BYTES` | Object | `packages/fluxiq/src/programs/automation-studio/storage/project/ui-cache-store.ts:7` | - |
| `AUTOMATION_STUDIO_UI_CACHE_MAX_KEY_BYTES` | Object | `packages/fluxiq/src/programs/automation-studio/storage/project/ui-cache-store.ts:8` | - |
| `AUTOMATION_STUDIO_UNATTENDED_REPAIR_CODES` | Object | `packages/fluxiq/src/programs/automation-studio/runtime/result-check-authorization/repair.ts:40` | Why an unattended repair was not funded. One code per reason, so a reader can act on it. |
| `AUTOMATION_STUDIO_UNATTENDED_REPAIR_TASK_KINDS` | Object | `packages/fluxiq/src/programs/automation-studio/runtime/result-check-authorization/repair.ts:33` | The task kinds an unattended repair may be redeemed for, and the only ones. Exactly what `recovery/annotation/` runs and nothing beside it: the diagnosis that reads the failure, the evidence decisions an exploration makes, and the patch. Not `loop_plan` and not `flow_bootstrap`, so this cannot pay to build a Flow; not `loop_verification`, which is the check's own redemption. |
| `AUTOMATION_STUDIO_V2_STORAGE_FEATURE` | Object | `packages/fluxiq/src/programs/automation-studio/storage/project/migration-cutover.ts:13` | - |
| `AUTOMATION_STUDIO_WITHHELD_LOCATOR` | Object | `packages/fluxiq/src/programs/automation-studio/runtime/llm/harness/locator-text.ts:55` | What replaces a locator. Short, and obviously not something to copy. |
| `AUTOMATION_STUDIO_WITHHELD_VALUE` | Object | `packages/fluxiq/src/programs/automation-studio/runtime/executor/trace-withholding.ts:57` | What a withheld value reads as in a persisted trace. A constant rather than a removed field, so a reader can tell a value that was withheld from one that was never there. It is the framework runtime's marker, so a trace and the command attempts saved for its dispatches withhold alike. |
| `AutomationAction` | Type | `packages/fluxiq/src/programs/automation-studio/types.ts:19` | - |
| `AutomationCondition` | Type | `packages/fluxiq/src/programs/automation-studio/model/conditions.ts:19` | - |
| `AutomationConditionExpression` | Type | `packages/fluxiq/src/programs/automation-studio/model/conditions.ts:33` | - |
| `AutomationConditionGroup` | Type | `packages/fluxiq/src/programs/automation-studio/model/conditions.ts:35` | - |
| `AutomationConditionOperator` | Type | `packages/fluxiq/src/programs/automation-studio/model/conditions.ts:3` | - |
| `AutomationInMemoryStateStore` | Class | `packages/fluxiq/src/programs/automation-studio/model/state-store.ts:26` | - |
| `AutomationNodeClass` | Type | `packages/fluxiq/src/programs/automation-studio/nodes/contracts.ts:7` | - |
| `automationNodeClasses` | Object | `packages/fluxiq/src/programs/automation-studio/nodes/registry.ts:38` | - |
| `AutomationNodeClassGroup` | Type | `packages/fluxiq/src/programs/automation-studio/nodes/contracts.ts:193` | - |
| `automationNodeClassGroups` | Object | `packages/fluxiq/src/programs/automation-studio/nodes/registry.ts:12` | - |
| `AutomationNodeDefinition` | Type | `packages/fluxiq/src/programs/automation-studio/nodes/contracts.ts:176` | - |
| `AutomationNodeExecutionContext` | Type | `packages/fluxiq/src/programs/automation-studio/nodes/contracts.ts:112` | - |
| `AutomationNodeExecutionResult` | Type | `packages/fluxiq/src/programs/automation-studio/nodes/contracts.ts:154` | - |
| `AutomationNodeExecutor` | Type | `packages/fluxiq/src/programs/automation-studio/nodes/contracts.ts:174` | - |
| `AutomationNodeExpectationEvaluation` | Type | `packages/fluxiq/src/programs/automation-studio/nodes/contracts.ts:75` | A host's verdict on whether an expected state holds. |
| `AutomationNodeExpectationEvaluationContext` | Type | `packages/fluxiq/src/programs/automation-studio/nodes/contracts.ts:84` | Why Core asked, and which attempt and host snapshot the question is about. |
| `AutomationNodeExpectationEvaluator` | Type | `packages/fluxiq/src/programs/automation-studio/nodes/contracts.ts:97` | Decides whether an expected state holds. Core never evaluates the conditions itself: with no evaluator bound, an expectation keeps its unconditional pass. |
| `AutomationNodeIterationState` | Type | `packages/fluxiq/src/programs/automation-studio/nodes/contracts.ts:105` | Where a node that runs once per pass, such as For Each, keeps its place between passes. |
| `AutomationNodeOrigin` | Type | `packages/fluxiq/src/programs/automation-studio/nodes/contracts.ts:5` | - |
| `AutomationNodeParameter` | Type | `packages/fluxiq/src/programs/automation-studio/nodes/contracts.ts:40` | - |
| `AutomationNodeParameterStateBinding` | Type | `packages/fluxiq/src/programs/automation-studio/nodes/contracts.ts:66` | - |
| `AutomationNodePort` | Type | `packages/fluxiq/src/programs/automation-studio/nodes/contracts.ts:31` | - |
| `AutomationNodeScope` | Type | `packages/fluxiq/src/programs/automation-studio/nodes/contracts.ts:4` | - |
| `automationNodeStateBinding` | Value | `packages/fluxiq/src/programs/automation-studio/nodes/parameter-bindings.ts:24` | - |
| `AutomationNodeTargetResolution` | Type | `packages/fluxiq/src/programs/automation-studio/nodes/contracts.ts:141` | How an output-dispatching node resolved its element target before dispatch. `unresolved_no_candidates` means Core was given nothing to score the target against: it resolved nothing, applied no confidence floor, and left resolving the element to the output's adapter. That status carries no `minimumConfidence`, because a number there reads as a floor that was enforced. |
| `AutomationNodeValueType` | Type | `packages/fluxiq/src/programs/automation-studio/nodes/contracts.ts:20` | - |
| `AutomationPipelineArtifacts` | Type | `packages/fluxiq/src/programs/automation-studio/runtime/service/recordings/types.ts:34` | - |
| `AutomationRecording` | Type | `packages/fluxiq/src/programs/automation-studio/types.ts:63` | - |
| `AutomationStage` | Type | `packages/fluxiq/src/programs/automation-studio/types.ts:32` | - |
| `AutomationStateStore` | Type | `packages/fluxiq/src/programs/automation-studio/model/state-store.ts:14` | - |
| `AutomationStudioActionConsequence` | Type | `packages/fluxiq/src/programs/automation-studio/runtime/action-permissions/consequences.ts:60` | - |
| `AutomationStudioActionDeclaration` | Type | `packages/fluxiq/src/programs/automation-studio/runtime/action-permissions/declaration.ts:77` | One action, as the domain describes it before taking it. `control.name` is how a person would recognise the thing acted on -- the words on it, as they appeared in evidence the model has already been shown. It is never a locator, a fragment of markup or an internal id: Core carries it to a person, and a name it cannot find in evidence already shown is withheld rather than carried (see `gate.ts`). `control.kind` is one plain word or two for what sort of thing it is, in the domain's own vocabulary. `verb` is what the action does to it, as plainly: "press", "submit". `effect` is what the domain knows about the action itself rather than about this page: `observe` for one that reads, waits or asserts, `mutate` for one that acts. Absent is `mutate`, which gates as before. |
| `automationStudioActionDeclarationCrossCheck` | Value | `packages/fluxiq/src/programs/automation-studio/runtime/action-permissions/cross-check.ts:88` | - |
| `AutomationStudioActionDeclarationCrossCheck` | Type | `packages/fluxiq/src/programs/automation-studio/runtime/action-permissions/cross-check.ts:67` | - |
| `AutomationStudioActionDeclarationCrossCheckVerdict` | Type | `packages/fluxiq/src/programs/automation-studio/runtime/action-permissions/cross-check.ts:65` | Core's reading of the two answers together. `not_comparable` is the honest ending when no action was ever put to the gate: a build that only read a page declared nothing because it did nothing, and calling that a contradiction would make every extraction Flow suspect. |
| `AutomationStudioActionDeclarationError` | Class | `packages/fluxiq/src/programs/automation-studio/runtime/action-permissions/declaration.ts:116` | A declaration Core could not read. The action must not proceed. |
| `AutomationStudioActionDeclarationRecord` | Type | `packages/fluxiq/src/programs/automation-studio/runtime/action-permissions/declared.ts:26` | One action, as the domain declared it and as Core answered it. |
| `AutomationStudioActionEffect` | Type | `packages/fluxiq/src/programs/automation-studio/runtime/action-permissions/declaration.ts:60` | Whether taking the action changes anything, in the same two words the node registry, the harness options and the evidence loop already use. `observe` is a promise the domain makes about its own action -- it reads, waits or asserts, and the page and everything behind it is as it was afterwards. `mutate` is everything else, and is what an unstated effect means. |
| `AutomationStudioActionPermissionAction` | Type | `packages/fluxiq/src/programs/automation-studio/runtime/action-permissions/request.ts:46` | The action a request is about, as Core names it. |
| `AutomationStudioActionPermissionActionKind` | Type | `packages/fluxiq/src/programs/automation-studio/runtime/action-permissions/request.ts:43` | When the action would happen, which is the difference a person most needs: - `exploration_step` -- the run wanted to take it now, while finding out how to do the job. `id` is the option it called, `ref` the call. - `flow_step` -- the Flow would take it every time it runs: the Flow being built, or, at `recovery`, the Flow a repair would change. `id` is the step's node definition, `ref` the step's key in the plan or, for a repair, the node that failed. |
| `AutomationStudioActionPermissionCheck` | Type | `packages/fluxiq/src/programs/automation-studio/runtime/action-permissions/declaration.ts:113` | The check a domain calls before an action with a lasting consequence. Awaited immediately before acting: the first action in a build that has a lasting consequence may make Core read the person's instruction for what it already asks for (`instructed.ts`), once. It rejects with `AutomationStudioActionDeclarationError` when the declaration itself is malformed, which fails the action loudly: an action Core could not read is an action Core did not permit. |
| `automationStudioActionPermissionDenied` | Object | `packages/fluxiq/src/programs/automation-studio/runtime/action-permissions/gate.ts:409` | The check for an action run where no run stands behind it, so there is nobody to ask: a caller that drove a domain's option directly. It reads the declaration like any other and permits nothing that has a consequence. |
| `AutomationStudioActionPermissionGate` | Class | `packages/fluxiq/src/programs/automation-studio/runtime/action-permissions/gate.ts:113` | - |
| `AutomationStudioActionPermissionGateInput` | Type | `packages/fluxiq/src/programs/automation-studio/runtime/action-permissions/gate.ts:84` | - |
| `AutomationStudioActionPermissionRequest` | Type | `packages/fluxiq/src/programs/automation-studio/runtime/action-permissions/request.ts:52` | - |
| `automationStudioActionPermissionSentence` | Value | `packages/fluxiq/src/programs/automation-studio/runtime/action-permissions/request.ts:90` | - |
| `AutomationStudioActionPermissionStage` | Type | `packages/fluxiq/src/programs/automation-studio/runtime/action-permissions/request.ts:31` | Where in the improvement loop the run was when it needed permission. |
| `AutomationStudioActionPermissionVerdict` | Type | `packages/fluxiq/src/programs/automation-studio/runtime/action-permissions/declaration.ts:99` | Core's answer. `permitted: false` always means: do not take the action. `requestId` names the request that was raised for the person, and is `null` only where there is nobody to ask -- a caller that ran the domain's action without a run behind it. Either way the action does not happen. `declined` is present, and `true`, only when the refusal is a person's explicit no to this very question: the same control, asked about the same classes. The request it names has been answered and is not in front of anybody, so a domain tells its model not to make the action again rather than that a person is being asked. Absent means the request is still open, or nobody answered it, or there was nobody to ask. Optional, so a domain that never reads it is answered exactly as before. |
| `AutomationStudioActionTargetNode` | Type | `packages/fluxiq/src/programs/automation-studio/runtime/flow-change/action-target-parameters.ts:11` | The node a target repair re-points: its id, its definition, and the parameter values it holds now. |
| `automationStudioActivityAction` | Value | `packages/fluxiq/src/programs/automation-studio/runtime/activity/wording/action.ts:58` | - |
| `automationStudioActivityAskPort` | Value | `packages/fluxiq/src/programs/automation-studio/runtime/activity/ask/port.ts:28` | - |
| `automationStudioActivityAskResolution` | Value | `packages/fluxiq/src/programs/automation-studio/runtime/activity/ask/resolution.ts:13` | - |
| `automationStudioActivityCompletionRefusal` | Value | `packages/fluxiq/src/programs/automation-studio/runtime/activity/wording/completion-refusal.ts:22` | - |
| `automationStudioActivityDecision` | Value | `packages/fluxiq/src/programs/automation-studio/runtime/activity/wording/decision.ts:15` | - |
| `automationStudioActivityDecisionReason` | Object | `packages/fluxiq/src/programs/automation-studio/runtime/activity/decision-reason.ts:16` | - |
| `AutomationStudioActivityEmission` | Type | `packages/fluxiq/src/programs/automation-studio/runtime/activity/contracts.ts:22` | What an emission site says; the scope it runs under supplies the rest. |
| `AutomationStudioActivityFrame` | Type | `packages/fluxiq/src/programs/automation-studio/runtime/activity/contracts.ts:34` | What the scope storage holds for one unit of work. A run's id is known only once its session is admitted, so a run frame starts `pending` and emits nothing until it is bound. |
| `automationStudioActivityHub` | Object | `packages/fluxiq/src/programs/automation-studio/runtime/activity/default-hub.ts:4` | The one hub every emission in this process publishes to. |
| `AutomationStudioActivityHub` | Class | `packages/fluxiq/src/programs/automation-studio/runtime/activity/hub.ts:13` | The process's activity stream: numbers and stamps each event, bounds it, keeps the last few per project, and hands it to every subscriber. Activity is ephemeral (D2): nothing here is persisted, and a subscriber that throws loses its own copy of the event, never the work that emitted it. |
| `automationStudioActivityHumanLabel` | Value | `packages/fluxiq/src/programs/automation-studio/runtime/activity/wording/human-label.ts:11` | - |
| `AutomationStudioActivityInput` | Type | `packages/fluxiq/src/programs/automation-studio/runtime/activity/contracts.ts:19` | What the hub is handed: an event before it is numbered and stamped. |
| `AutomationStudioActivityListener` | Type | `packages/fluxiq/src/programs/automation-studio/runtime/activity/contracts.ts:24` | - |
| `automationStudioActivityReasonText` | Value | `packages/fluxiq/src/programs/automation-studio/runtime/activity/wording/reason-text.ts:29` | - |
| `automationStudioActivityRecoveryChoice` | Value | `packages/fluxiq/src/programs/automation-studio/runtime/activity/wording/recovery-choice.ts:18` | - |
| `AutomationStudioActivityScope` | Type | `packages/fluxiq/src/programs/automation-studio/runtime/activity/contracts.ts:10` | One unit of work the activity belongs to: a build or a run. |
| `AutomationStudioActivitySnapshot` | Type | `packages/fluxiq/src/programs/automation-studio/runtime/activity/contracts.ts:27` | The latest event of one project, and the events before it, oldest first. |
| `automationStudioActivityToolCall` | Value | `packages/fluxiq/src/programs/automation-studio/runtime/activity/wording/tool-call.ts:30` | - |
| `AutomationStudioActualTransition` | Type | `packages/fluxiq/src/programs/automation-studio/runtime/executor/contracts.ts:51` | - |
| `AutomationStudioAdaptationApprovalMode` | Type | `packages/fluxiq/src/programs/automation-studio/storage/project/adaptation-store.ts:16` | - |
| `AutomationStudioAdaptationArtifactRecord` | Type | `packages/fluxiq/src/programs/automation-studio/storage/project/adaptation-store.ts:20` | - |
| `AutomationStudioAdaptationAuditEvent` | Type | `packages/fluxiq/src/programs/automation-studio/storage/project/adaptation-store.ts:22` | - |
| `AutomationStudioAdaptationAuditEventType` | Type | `packages/fluxiq/src/programs/automation-studio/storage/project/adaptation-store.ts:17` | - |
| `AutomationStudioAdaptationDetailSection` | Type | `packages/fluxiq/src/programs/automation-studio/storage/project/adaptation-store.ts:23` | - |
| `automationStudioAdaptationDigest` | Value | `packages/fluxiq/src/programs/automation-studio/storage/project/adaptation-store.ts:775` | - |
| `AutomationStudioAdaptationPolicy` | Type | `packages/fluxiq/src/programs/automation-studio/model/flow-adaptation.ts:454` | - |
| `AutomationStudioAdaptationPolicyPreset` | Type | `packages/fluxiq/src/programs/automation-studio/model/flow-adaptation.ts:447` | - |
| `AutomationStudioAdaptationPolicySummary` | Type | `packages/fluxiq/src/programs/automation-studio/runtime/service/indexes/types.ts:67` | - |
| `AutomationStudioAdaptationPromotionGateDecision` | Type | `packages/fluxiq/src/programs/automation-studio/runtime/training-modes.ts:157` | - |
| `AutomationStudioAdaptationPromotionGateInput` | Type | `packages/fluxiq/src/programs/automation-studio/runtime/training-modes.ts:146` | `confidence` is the tier the change's saved trials and replays earn (`adaptationConfidence`). |
| `AutomationStudioAdaptationPromotionGates` | Type | `packages/fluxiq/src/programs/automation-studio/storage/project/adaptation-store.ts:33` | The promotion gates every apply path runs: whether a change may be applied, and why not. The caller passes `evaluateFlowAdaptationPromotionGates`. The store cannot import it: it lives in `runtime/recovery`, whose imports reach `runtime/service` and, through it, this store, so an import here would close a module cycle. The store refuses to apply without it. |
| `AutomationStudioAdaptationReplayInput` | Type | `packages/fluxiq/src/programs/automation-studio/runtime/adaptation-confidence/replay.ts:60` | - |
| `AutomationStudioAdaptationReplayOutcome` | Type | `packages/fluxiq/src/programs/automation-studio/runtime/adaptation-confidence/replay.ts:89` | - |
| `AutomationStudioAdaptationReplaySkipCode` | Type | `packages/fluxiq/src/programs/automation-studio/runtime/adaptation-confidence/replay.ts:79` | Why a run recorded nothing for a change. Codes only; each is a fact about the run, never a judgement of the change. |
| `AutomationStudioAdaptationReplaySubject` | Type | `packages/fluxiq/src/programs/automation-studio/runtime/adaptation-confidence/replay.ts:56` | A saved change a run may have replayed, as this module reads one. |
| `AutomationStudioAdaptationRevisionBindings` | Type | `packages/fluxiq/src/programs/automation-studio/storage/project/adaptation-store.ts:19` | - |
| `AutomationStudioAdaptationRiskLevel` | Type | `packages/fluxiq/src/programs/automation-studio/model/flow-adaptation.ts:373` | - |
| `AutomationStudioAdaptationSummary` | Type | `packages/fluxiq/src/programs/automation-studio/runtime/service/indexes/types.ts:46` | - |
| `AutomationStudioAdaptationSummaryPage` | Type | `packages/fluxiq/src/programs/automation-studio/runtime/service/summaries/store.ts:52` | - |
| `AutomationStudioAdaptationSummaryRecord` | Type | `packages/fluxiq/src/programs/automation-studio/storage/project/adaptation-store.ts:21` | - |
| `AutomationStudioAdapterActionRequest` | Type | `packages/fluxiq/src/programs/automation-studio/runtime/adapters.ts:12` | - |
| `AutomationStudioAdapterRegistry` | Class | `packages/fluxiq/src/programs/automation-studio/runtime/adapters.ts:30` | - |
| `AutomationStudioAdaptiveCandidateKind` | Type | `packages/fluxiq/src/programs/automation-studio/runtime/adaptive-orchestrator.ts:19` | - |
| `AutomationStudioAdaptiveFailure` | Type | `packages/fluxiq/src/programs/automation-studio/runtime/adaptive-orchestrator.ts:28` | - |
| `AutomationStudioAdaptiveFailureClass` | Type | `packages/contracts/src/failure/adaptive-class.ts:45` | - |
| `AutomationStudioAdaptiveFailureInput` | Type | `packages/fluxiq/src/programs/automation-studio/runtime/adaptive-orchestrator.ts:67` | - |
| `AutomationStudioAesGcmProjectContentProtection` | Class | `packages/fluxiq/src/programs/automation-studio/storage/project/content-protection.ts:19` | AES-256-GCM adapter whose host-owned resolver controls key creation, persistence, rotation, and retirement. |
| `AutomationStudioAppliedAdaptationResult` | Type | `packages/fluxiq/src/programs/automation-studio/storage/project/adaptation-store.ts:25` | - |
| `AutomationStudioArchivedChunk` | Type | `packages/fluxiq/src/programs/automation-studio/storage/project/retention-store.ts:7` | - |
| `AutomationStudioAsk` | Type | `packages/fluxiq/src/programs/automation-studio/runtime/parking/ask.ts:65` | A question Core puts to a person, raised from anywhere a run, a build or a repair needs one. `parks` is the whole of the difference between a question and a dead end. A parking ask stops the work where it stands and keeps everything it has done, so an answer resumes it; one that does not park is said and the work carries on. Nothing here opens a thread: the ask is what the runtime raises, and the port that carries it is what puts it in front of a person. |
| `AutomationStudioAskAnswer` | Type Alias | `packages/fluxiq/src/programs/automation-studio/runtime/parking/index.ts:2` | - |
| `AutomationStudioAskControl` | Type | `packages/fluxiq/src/programs/automation-studio/runtime/parking/ask.ts:33` | What the ask acts on, as the person would recognise it. |
| `AutomationStudioAskDraft` | Type | `packages/fluxiq/src/programs/automation-studio/runtime/parking/ask.ts:97` | An ask as whoever raises it writes it: no status and no account of where it came from, because the runtime knows both and the raiser does not. Keeping them off the draft is what lets a node -- or a gate, or a domain adapter -- raise an ask in one object literal. `askId` is optional rather than absent, because something that already keys its question under an id of its own keeps it. The action-permission request is the case that matters: its `requestId` is "the key a store would hold it under", which is an ask id by another name, and a gate must be able to raise an ask under the id its payload already carries. Anything else leaves it out and the runtime names the ask after the attempt that raised it. |
| `automationStudioAskedAndGranted` | Value | `packages/fluxiq/src/programs/automation-studio/runtime/parking/permission-ask.ts:79` | - |
| `automationStudioAskedPersonNeeded` | Value | `packages/fluxiq/src/programs/automation-studio/runtime/parking/person-needed-ask.ts:118` | - |
| `automationStudioAskEffect` | Value | `packages/fluxiq/src/programs/automation-studio/runtime/parking/ask-effect.ts:17` | - |
| `automationStudioAskInEffects` | Value | `packages/fluxiq/src/programs/automation-studio/runtime/parking/ask-effect.ts:37` | - |
| `AutomationStudioAskKind` | Type | `packages/fluxiq/src/programs/automation-studio/runtime/parking/ask.ts:27` | What an ask wants back from the person. |
| `AutomationStudioAskOption` | Type | `packages/fluxiq/src/programs/automation-studio/runtime/parking/ask.ts:31` | One answer a `choice` ask offers, and the route taking it resumes the run down. |
| `AutomationStudioAskOptionDraft` | Type | `packages/fluxiq/src/programs/automation-studio/runtime/parking/ask.ts:82` | One option as whoever raises the ask writes it: an id, and the rest filled in. The stored option names its label and its route outright, because a thread read back a week later cannot infer either. |
| `AutomationStudioAskRoutes` | Type | `packages/fluxiq/src/programs/automation-studio/runtime/parking/ask.ts:43` | Where each way of settling an ask resumes the run: `granted` for a grant, a free-text answer or a chosen option with no route of its own, `denied` for a refusal, `timedOut` for nobody answering. A null route is one the ask did not name. |
| `automationStudioAskSettlement` | Value | `packages/fluxiq/src/programs/automation-studio/runtime/parking/settlement.ts:37` | - |
| `AutomationStudioAskSettlement` | Type | `packages/fluxiq/src/programs/automation-studio/runtime/parking/settlement.ts:22` | What became of an ask, and where the run goes because of it. A refusal moves nothing: the run stays parked exactly as it was, so the answer can be put right and offered again. |
| `AutomationStudioAskStage` | Type | `packages/fluxiq/src/programs/automation-studio/runtime/parking/ask.ts:53` | Where in the product's work the ask was raised, so a surface can say what is waiting. |
| `AutomationStudioAskStatus` | Type | `packages/fluxiq/src/programs/automation-studio/runtime/parking/ask.ts:29` | Pending until it is answered or runs out of time. |
| `AutomationStudioAskTimeoutAction` | Type | `packages/fluxiq/src/programs/automation-studio/runtime/parking/ask.ts:35` | What happens to a parked ask nobody answered. |
| `automationStudioAssessAttemptFault` | Value | `packages/fluxiq/src/programs/automation-studio/runtime/executor/defensive/assess.ts:46` | - |
| `automationStudioAttemptCapturedRecords` | Value | `packages/fluxiq/src/programs/automation-studio/runtime/flow-change/attempt-projection.ts:19` | - |
| `automationStudioAttemptFaultIsAbsorbed` | Value | `packages/fluxiq/src/programs/automation-studio/runtime/executor/defensive/assess.ts:92` | - |
| `automationStudioAttemptIsRetryable` | Value | `packages/fluxiq/src/programs/automation-studio/runtime/executor/retry-policy.ts:99` | - |
| `automationStudioAttemptNeedsPerson` | Value | `packages/fluxiq/src/programs/automation-studio/runtime/executor/person-needed.ts:52` | - |
| `automationStudioAttemptVerifiesState` | Value | `packages/fluxiq/src/programs/automation-studio/runtime/flow-change/attempt-projection.ts:44` | - |
| `automationStudioAwaitNodeReadiness` | Value | `packages/fluxiq/src/programs/automation-studio/runtime/executor/ladder-run.ts:166` | - |
| `AutomationStudioBackgroundJob` | Type | `packages/fluxiq/src/programs/automation-studio/storage/project/administration.ts:61` | - |
| `AutomationStudioBackgroundJobRepository` | Class | `packages/fluxiq/src/programs/automation-studio/storage/project/administration.ts:326` | - |
| `AutomationStudioBackgroundJobStatus` | Type | `packages/fluxiq/src/programs/automation-studio/storage/project/administration.ts:60` | - |
| `AutomationStudioBackupReplayEvidence` | Type | `packages/fluxiq/src/programs/automation-studio/testing/scale-certification.ts:69` | - |
| `AutomationStudioBaselineOperation` | Type | `packages/fluxiq/src/programs/automation-studio/testing/scale-baseline.ts:13` | - |
| `AutomationStudioBootstrapAccounting` | Type | `packages/fluxiq/src/programs/automation-studio/runtime/flow-bootstrap/adaptation.ts:64` | - |
| `AutomationStudioBootstrapAdaptation` | Type | `packages/fluxiq/src/programs/automation-studio/runtime/flow-bootstrap/adaptation.ts:88` | - |
| `AutomationStudioBootstrapAdaptationMode` | Type | `packages/fluxiq/src/programs/automation-studio/runtime/flow-bootstrap/adaptation.ts:31` | `create` builds a whole topology on a blank Flow; `extend` only adds to an existing one. A record written before modes existed has none: read it as `create`. |
| `AutomationStudioBootstrapAdaptationOrigin` | Type | `packages/fluxiq/src/programs/automation-studio/runtime/flow-bootstrap/adaptation.ts:34` | A bootstrap change comes from an instruction, or from an edge case an existing Flow does not handle. |
| `AutomationStudioBootstrapAdaptationStatus` | Type | `packages/fluxiq/src/programs/automation-studio/runtime/flow-bootstrap/adaptation.ts:36` | - |
| `AutomationStudioBootstrapApplication` | Type | `packages/fluxiq/src/programs/automation-studio/runtime/flow-bootstrap/adaptation.ts:57` | - |
| `AutomationStudioBootstrapApplyGateInput` | Type | `packages/fluxiq/src/programs/automation-studio/runtime/training-modes.ts:152` | `mode` is `create` for a blank Flow and `extend` for one that already runs; upgrade a record saved without one first. |
| `AutomationStudioBootstrapAuditEvent` | Type | `packages/fluxiq/src/programs/automation-studio/runtime/flow-bootstrap/adaptation.ts:75` | - |
| `AutomationStudioBootstrapExistingTopology` | Type | `packages/fluxiq/src/programs/automation-studio/runtime/flow-bootstrap/extend.ts:46` | The ids an extend keeps, so the Flow is edited rather than replaced. Stored on the adaptation, because apply re-normalises the plan and compares the result with the topology that was proposed: a normalisation that could not see these ids would mint new ones and the comparison would refuse the record it was checking. |
| `automationStudioBootstrapExtendSubflow` | Value | `packages/fluxiq/src/programs/automation-studio/runtime/flow-bootstrap/extend.ts:104` | - |
| `AutomationStudioBootstrapParentState` | Type | `packages/fluxiq/src/programs/automation-studio/runtime/flow-bootstrap/adaptation.ts:43` | - |
| `automationStudioBootstrapTargetRefusal` | Value | `packages/fluxiq/src/programs/automation-studio/runtime/flow-bootstrap/extend.ts:72` | - |
| `AutomationStudioBootstrapTopology` | Type | `packages/fluxiq/src/programs/automation-studio/runtime/flow-bootstrap/adaptation.ts:49` | - |
| `automationStudioBoundedRetryWaitMs` | Value | `packages/fluxiq/src/programs/automation-studio/runtime/executor/defensive/retry-wait.ts:48` | - |
| `automationStudioBuiltinNodeRoots` | Object | `packages/fluxiq/src/programs/automation-studio/nodes/layout.ts:4` | - |
| `AutomationStudioCallFlowBinding` | Type | `packages/fluxiq/src/programs/automation-studio/model/composites.ts:45` | - |
| `AutomationStudioCallFlowConfiguration` | Type | `packages/fluxiq/src/programs/automation-studio/model/composites.ts:46` | - |
| `AutomationStudioCallFlowTarget` | Type | `packages/fluxiq/src/programs/automation-studio/model/composites.ts:44` | - |
| `AutomationStudioCarriedIteration` | Type | `packages/fluxiq/src/programs/automation-studio/runtime/parking/parked-run.ts:12` | One node's place in a list it was iterating, carried across a park. Declared structurally rather than imported from the node catalog. Parking is reached from a node definition, so importing the catalog here would close a module cycle; the shape is `AutomationNodeIterationState`, and the executor, where both are in scope, is where the compiler checks that it still is. |
| `AutomationStudioCatalog` | Class | `packages/fluxiq/src/programs/automation-studio/storage/catalog.ts:50` | - |
| `AutomationStudioCatalogCategory` | Type | `packages/fluxiq/src/programs/automation-studio/storage/catalog.ts:13` | - |
| `AutomationStudioCatalogProject` | Type | `packages/fluxiq/src/programs/automation-studio/storage/catalog.ts:7` | - |
| `AutomationStudioCategoryCatalogRepository` | Class | `packages/fluxiq/src/programs/automation-studio/storage/catalog.ts:146` | - |
| `AutomationStudioChangeConfidence` | Type | `packages/fluxiq/src/programs/automation-studio/runtime/flow-change/contracts.ts:210` | High, Medium and Low confidence in the MVP's words are `established`, `provisional` and `unverified`. |
| `AutomationStudioChangeConfidenceDecision` | Type | `packages/fluxiq/src/programs/automation-studio/runtime/flow-change/contracts.ts:219` | - |
| `AutomationStudioChangeConfidenceInput` | Type | `packages/fluxiq/src/programs/automation-studio/runtime/flow-change/contracts.ts:212` | - |
| `AutomationStudioChangeFeedEntityKind` | Type | `packages/fluxiq/src/programs/automation-studio/api/contracts/change-feed.ts:3` | - |
| `AutomationStudioChangeFeedHierarchyScope` | Type | `packages/fluxiq/src/programs/automation-studio/api/contracts/change-feed.ts:15` | - |
| `AutomationStudioChangeFeedOperation` | Type | `packages/fluxiq/src/programs/automation-studio/api/contracts/change-feed.ts:1` | - |
| `AutomationStudioChangeFeedRepository` | Class | `packages/fluxiq/src/programs/automation-studio/storage/project/administration.ts:218` | - |
| `AutomationStudioChangeProposalKind` | Type | `packages/fluxiq/src/programs/automation-studio/model/flow-adaptation.ts:150` | - |
| `AutomationStudioChangeProposalMode` | Type | `packages/fluxiq/src/programs/automation-studio/model/flow-adaptation.ts:139` | - |
| `AutomationStudioChangeProposalPatch` | Type | `packages/fluxiq/src/programs/automation-studio/model/flow-adaptation.ts:200` | - |
| `AutomationStudioChangeProposalStatus` | Type | `packages/fluxiq/src/programs/automation-studio/model/flow-adaptation.ts:141` | - |
| `AutomationStudioChangeProposalSummary` | Type | `packages/fluxiq/src/programs/automation-studio/runtime/service/indexes/types.ts:34` | - |
| `AutomationStudioChangeProposalSummaryPage` | Type | `packages/fluxiq/src/programs/automation-studio/runtime/service/adaptation-projections/contracts.ts:6` | - |
| `AutomationStudioChangeResumeDecision` | Type | `packages/fluxiq/src/programs/automation-studio/runtime/flow-change/contracts.ts:102` | Whether normal deterministic execution may continue, decided from the checks a trial made rather than from what it proved. `code` names why not, and is present exactly when `resumable` is false: - `no_checks`: the trial judged nothing, so there is nothing to continue from. - `check_failed`: a check contradicted the change. - `check_unknown`: a check the trial made could not be evaluated. Unknown is never a pass here either, so an unevaluated check ends the continuation. - `no_resume_point`: the continuation is not well defined, so there is no node to resume at. - `no_evidence`: nothing observed proves the change. Success alone is not evidence, so a run that merely did not fail is not resumable. |
| `AutomationStudioChangeResumePoint` | Type | `packages/fluxiq/src/programs/automation-studio/runtime/flow-change/contracts.ts:86` | Where a run continues after a change: the node the changed path led to and the route that led there, or a finished run. `subflowId` names the Subflow whose graph those node ids belong to, when the trial ran inside one, so a continuation inside a Subflow can be expressed rather than read as a node of the parent graph. A resume point is a fact about where the trial got to, not permission to go there. `AutomationStudioChangeVerdict.resumable` is the permission. |
| `AutomationStudioChangeTrialInput` | Type | `packages/fluxiq/src/programs/automation-studio/runtime/flow-change/contracts.ts:189` | - |
| `AutomationStudioChangeTrialResult` | Type | `packages/fluxiq/src/programs/automation-studio/runtime/flow-change/contracts.ts:201` | - |
| `automationStudioChangeValidationResult` | Value | `packages/fluxiq/src/programs/automation-studio/runtime/flow-change/verdict.ts:91` | - |
| `AutomationStudioChangeVerdict` | Type | `packages/fluxiq/src/programs/automation-studio/runtime/flow-change/contracts.ts:107` | - |
| `AutomationStudioChangeVerdictAttempt` | Type | `packages/fluxiq/src/programs/automation-studio/runtime/flow-change/contracts.ts:139` | One trial attempt, as the verdict reads it. The trial projects each executor attempt into this shape; every field is a fact the trial observed, and an absent optional field means the node declared nothing of that kind. |
| `AutomationStudioChangeVerdictCheck` | Type | `packages/fluxiq/src/programs/automation-studio/runtime/flow-change/contracts.ts:59` | - |
| `AutomationStudioChangeVerdictCheckKind` | Type | `packages/fluxiq/src/programs/automation-studio/runtime/flow-change/contracts.ts:31` | What one verdict check looked at. - `changed_node_succeeded`: every attempt of a node the change wrote, where the trial reached it. - `expected_state`: the host's evaluation of a changed node's declared `expectedState`. - `expected_route`: a changed node took the route it declares. Never the route the failure being repaired took. - `expected_outputs`: a changed node produced every output id it declares. - `records`: a changed node that saves records captured at least its minimum. With no minimum declared it passes on rows alone and carries the code `records_minimum_undeclared`, which the resume decision reads as unknown: nothing said how many rows the extraction owed. - `downstream_assertion`: a node whose definition declares `metadata.verifiesState`, run after the first changed attempt, succeeded. - `continuation`: the route the last changed node took led to a node that started, or to a successful end. |
| `AutomationStudioChangeVerdictCheckStatus` | Type | `packages/fluxiq/src/programs/automation-studio/runtime/flow-change/contracts.ts:57` | `unknown` is never a pass: a check that could not be evaluated proves nothing. |
| `AutomationStudioChangeVerdictEvidenceKind` | Type | `packages/fluxiq/src/programs/automation-studio/runtime/flow-change/contracts.ts:41` | The check kinds that count as evidence. Success alone and continuation never do. |
| `AutomationStudioChangeVerdictInput` | Type | `packages/fluxiq/src/programs/automation-studio/runtime/flow-change/contracts.ts:168` | - |
| `AutomationStudioChangeVerdictOutcome` | Type | `packages/fluxiq/src/programs/automation-studio/runtime/flow-change/contracts.ts:74` | - `verified`: every changed node the trial reached succeeded, no check failed, and at least one evidence check passed. - `contradicted`: a check failed. - `unverifiable`: nothing failed, but nothing proved the change either. - `not_executed`: the trial never ran a changed node. |
| `AutomationStudioChunkEvent` | Type | `packages/fluxiq/src/programs/automation-studio/storage/project/event-chunk-store.ts:6` | - |
| `AutomationStudioClearReusableLlmContextScopeRequest` | Type | `packages/fluxiq/src/programs/automation-studio/api/contracts/llm.ts:11` | - |
| `AutomationStudioClientGatewayBridge` | Class | `packages/fluxiq/src/programs/automation-studio/client-gateway/bridge.ts:86` | - |
| `AutomationStudioClientGatewayBridgeOptions` | Type | `packages/fluxiq/src/programs/automation-studio/client-gateway/bridge.ts:19` | - |
| `automationStudioClosestName` | Value | `packages/fluxiq/src/programs/automation-studio/runtime/conversations/instructions/closest.ts:50` | - |
| `AutomationStudioClosestNameMatch` | Type | `packages/fluxiq/src/programs/automation-studio/runtime/conversations/instructions/closest.ts:25` | - |
| `AutomationStudioComparatorDefinition` | Type | `packages/fluxiq/src/programs/automation-studio/nodes/importer-sdk.ts:44` | - |
| `AutomationStudioComparatorImplementation` | Type | `packages/fluxiq/src/programs/automation-studio/nodes/importer-sdk.ts:98` | - |
| `AutomationStudioCompiledArtifactManifest` | Type | `packages/fluxiq/src/programs/automation-studio/storage/project/compiled-plan-store.ts:18` | - |
| `AutomationStudioCompiledFlowPlan` | Type | `packages/fluxiq/src/programs/automation-studio/dsl/contracts.ts:45` | - |
| `AutomationStudioCompiledPlan` | Type | `packages/fluxiq/src/programs/automation-studio/runtime/compiled-plan.ts:39` | - |
| `AutomationStudioCompiledPlanEdge` | Type | `packages/fluxiq/src/programs/automation-studio/runtime/compiled-plan.ts:29` | - |
| `AutomationStudioCompiledPlanInstruction` | Type | `packages/fluxiq/src/programs/automation-studio/runtime/compiled-plan.ts:9` | - |
| `AutomationStudioCompiledPlanNode` | Type | `packages/fluxiq/src/programs/automation-studio/runtime/compiled-plan.ts:20` | - |
| `AutomationStudioCompiledPlanStoreOptions` | Type | `packages/fluxiq/src/programs/automation-studio/storage/project/compiled-plan-store.ts:52` | - |
| `AutomationStudioCompiledRouteRule` | Type | `packages/fluxiq/src/programs/automation-studio/runtime/router-runtime.ts:32` | - |
| `AutomationStudioConfigArtifact` | Type | `packages/fluxiq/src/programs/automation-studio/model/artifacts.ts:76` | - |
| `automationStudioConsequencesInOrder` | Value | `packages/fluxiq/src/programs/automation-studio/runtime/action-permissions/consequences.ts:101` | - |
| `automationStudioContinuationAfterFailure` | Value | `packages/fluxiq/src/programs/automation-studio/runtime/executor/defensive/continuation.ts:92` | - |
| `AutomationStudioConversation` | Type | `packages/fluxiq/src/programs/automation-studio/runtime/conversations/thread.ts:29` | One thread. `revision` rises on every turn and every answer, and is what the project change feed carries, so a reader that saw revision N knows it has not seen what produced N+1. |
| `AutomationStudioConversationAmbient` | Type | `packages/fluxiq/src/programs/automation-studio/runtime/conversations/context/storage.ts:17` | The chat thread a unit of work was started from. |
| `AutomationStudioConversationAnswer` | Type | `packages/fluxiq/src/programs/automation-studio/runtime/conversations/ask.ts:69` | - |
| `automationStudioConversationAnswerFits` | Value | `packages/fluxiq/src/programs/automation-studio/runtime/conversations/ask.ts:118` | - |
| `automationStudioConversationAnswerFromWords` | Value | `packages/fluxiq/src/programs/automation-studio/runtime/conversations/commands/answer-words.ts:23` | - |
| `AutomationStudioConversationAnswerInput` | Type | `packages/fluxiq/src/programs/automation-studio/runtime/conversations/inputs.ts:46` | - |
| `AutomationStudioConversationAnswerKind` | Type | `packages/fluxiq/src/programs/automation-studio/runtime/conversations/ask.ts:25` | - |
| `AutomationStudioConversationAnswerRequest` | Type | `packages/fluxiq/src/programs/automation-studio/runtime/conversations/conversations.ts:72` | - |
| `AutomationStudioConversationApplyResult` | Type | `packages/fluxiq/src/programs/automation-studio/runtime/conversations/commands/apply.ts:11` | - |
| `AutomationStudioConversationAsk` | Type | `packages/fluxiq/src/programs/automation-studio/runtime/conversations/ask.ts:79` | - |
| `AutomationStudioConversationAskControl` | Type | `packages/fluxiq/src/programs/automation-studio/runtime/conversations/ask.ts:64` | What the ask acts on, as the person would recognise it. Both may be null, as on a permission request. |
| `automationStudioConversationAskFromRow` | Value | `packages/fluxiq/src/programs/automation-studio/runtime/conversations/rows.ts:107` | - |
| `automationStudioConversationAskInput` | Value | `packages/fluxiq/src/programs/automation-studio/runtime/parking/conversation-port.ts:117` | - |
| `AutomationStudioConversationAskInput` | Type | `packages/fluxiq/src/programs/automation-studio/runtime/conversations/ask.ts:130` | What a caller hands the store to raise an ask on a turn. For a permission ask, `askId` is the request's own `requestId` and `permissionRequest` is the request verbatim, so nothing has to be rebuilt to show the person what the gate already said. |
| `automationStudioConversationAskIsConsequential` | Value | `packages/fluxiq/src/programs/automation-studio/runtime/conversations/ask.ts:193` | - |
| `AutomationStudioConversationAskKind` | Type | `packages/fluxiq/src/programs/automation-studio/runtime/conversations/ask.ts:19` | - |
| `AutomationStudioConversationAskOption` | Type | `packages/fluxiq/src/programs/automation-studio/runtime/conversations/ask.ts:36` | One option of a `choice` ask. `id` is what an answer carries back; `label` is what the person reads; `route` is where a parked run goes if this option is the one chosen, overriding the ask's `granted` route for this branch alone. |
| `automationStudioConversationAskOrRefuse` | Value | `packages/fluxiq/src/programs/automation-studio/runtime/conversations/inputs.ts:76` | - |
| `automationStudioConversationAskRoute` | Value | `packages/fluxiq/src/programs/automation-studio/runtime/conversations/ask.ts:152` | - |
| `AutomationStudioConversationAskRoutes` | Type | `packages/fluxiq/src/programs/automation-studio/runtime/conversations/ask.ts:54` | Where a parked run resumes, per answer. Without this an ask can stop a run and not say what stopping meant: "approved" and "rejected" have to name branches at the moment the question is asked, not at the moment it is answered, or the same answer could mean different things to different resumers. `builtin.routine.approval` already carries exactly this shape -- a prompt, a timeout and a route for nobody responding -- and `timeoutMs` and `onTimeout` above are the timeout half of it. A null route means "none named": the run resumes where it parked. Core does not interpret a route id; it carries it for whatever consumes the answer. |
| `AutomationStudioConversationAskRow` | Type | `packages/fluxiq/src/programs/automation-studio/runtime/conversations/rows.ts:51` | - |
| `AutomationStudioConversationAskStatus` | Type | `packages/fluxiq/src/programs/automation-studio/runtime/conversations/ask.ts:22` | - |
| `AutomationStudioConversationAskTimeoutAction` | Type | `packages/fluxiq/src/programs/automation-studio/runtime/conversations/ask.ts:29` | - |
| `AutomationStudioConversationAttachment` | Type | `packages/fluxiq/src/programs/automation-studio/runtime/conversations/turn.ts:20` | What a turn shows beside its words. `kind` names the renderer; `ref` is what it renders. |
| `AutomationStudioConversationAttachmentAnswer` | Type | `packages/fluxiq/src/programs/automation-studio/runtime/conversations/conversations.ts:104` | A turn's attachment and, when a resolver is configured, what it refers to. |
| `automationStudioConversationAttachmentOrRefuse` | Value | `packages/fluxiq/src/programs/automation-studio/runtime/conversations/inputs.ts:68` | - |
| `AutomationStudioConversationAttachmentRequest` | Type | `packages/fluxiq/src/programs/automation-studio/runtime/conversations/conversations.ts:97` | - |
| `AutomationStudioConversationAttachmentResolver` | Type | `packages/fluxiq/src/programs/automation-studio/runtime/conversations/conversations.ts:90` | What a turn's attachment actually is, when something can serve it. The thread stores a `kind` and a `ref` and renders nothing, so resolving the reference into a payload belongs to whatever owns the thing referred to -- a dataset page, a stored object, a run's detail. Core wires one of these in; without one, asking for an attachment's payload says so rather than answering with nothing. |
| `AutomationStudioConversationAuthor` | Type | `packages/fluxiq/src/programs/automation-studio/runtime/conversations/turn.ts:14` | - |
| `AutomationStudioConversationAutomationTurnRequest` | Type | `packages/fluxiq/src/programs/automation-studio/runtime/conversations/writer.ts:30` | One turn Core itself writes, with the ask it carries and the thing it shows. |
| `AutomationStudioConversationBuildResult` | Type | `packages/fluxiq/src/programs/automation-studio/runtime/conversations/commands/build.ts:13` | - |
| `automationStudioConversationCallCause` | Value | `packages/fluxiq/src/programs/automation-studio/runtime/conversations/commands/progress.ts:43` | - |
| `AutomationStudioConversationCaller` | Type | `packages/fluxiq/src/programs/automation-studio/runtime/conversations/instructions/model.ts:38` | Who sent the message: the person's user and the session they sent it from. A model whose key is the person's own releases it against this -- Secret Keys hands a key out only to the live, unlocked session of the user who unlocked it -- so the caller travels with every attempt rather than being assumed. |
| `automationStudioConversationChangedAt` | Value | `packages/fluxiq/src/programs/automation-studio/runtime/conversations/inputs.ts:131` | - |
| `AutomationStudioConversationCommand` | Type | `packages/fluxiq/src/programs/automation-studio/runtime/conversations/commands/command.ts:84` | A capability Core runs itself. |
| `AutomationStudioConversationCommandCallResult` | Type | `packages/fluxiq/src/programs/automation-studio/runtime/conversations/commands/command.ts:16` | What one registry call came back with, in the registry's own shape. |
| `AutomationStudioConversationCommandConfirmation` | Type | `packages/fluxiq/src/programs/automation-studio/runtime/conversations/commands/command.ts:61` | A question a command leaves in the thread after its result: "apply this?". Granting it runs `capabilityId` with `arguments` through the executor. |
| `AutomationStudioConversationCommandContext` | Type | `packages/fluxiq/src/programs/automation-studio/runtime/conversations/commands/command.ts:40` | Everything one run of a command works with. |
| `AutomationStudioConversationCommandExecution` | Type | `packages/fluxiq/src/programs/automation-studio/runtime/conversations/commands/command.ts:97` | `append-turn`'s `response.execution`: what Core did with the capability it chose. `started` means the work is running and its result will arrive in the thread as an automation turn with a `panel-capability-result` attachment. |
| `AutomationStudioConversationCommandHost` | Type | `packages/fluxiq/src/programs/automation-studio/runtime/conversations/commands/command.ts:33` | What a command needs from the thread: to say something, and to find the ask it answers. |
| `AutomationStudioConversationCommandOutcome` | Type | `packages/fluxiq/src/programs/automation-studio/runtime/conversations/commands/command.ts:72` | What one command came to. `summary` is what the thread says. |
| `automationStudioConversationCommandPort` | Value | `packages/fluxiq/src/programs/automation-studio/runtime/conversations/commands/port.ts:19` | - |
| `AutomationStudioConversationCommandPort` | Type | `packages/fluxiq/src/programs/automation-studio/runtime/conversations/commands/command.ts:28` | How a command reaches Core: one registry endpoint and its payload. The binding (`port.ts`) supplies the caller's actor and scope and refuses any endpoint that deletes or pays, so a command cannot do what the person could not have done by pressing the control. |
| `automationStudioConversationCommandProgress` | Value | `packages/fluxiq/src/programs/automation-studio/runtime/conversations/commands/progress.ts:23` | - |
| `AutomationStudioConversationCommandProgress` | Type | `packages/fluxiq/src/programs/automation-studio/runtime/conversations/commands/progress.ts:13` | - |
| `automationStudioConversationCommandText` | Value | `packages/fluxiq/src/programs/automation-studio/runtime/conversations/commands/argument.ts:2` | - |
| `automationStudioConversationCommandVocabulary` | Value | `packages/fluxiq/src/programs/automation-studio/runtime/conversations/commands/vocabulary.ts:11` | - |
| `automationStudioConversationCommandWork` | Object | `packages/fluxiq/src/programs/automation-studio/runtime/conversations/commands/work.ts:11` | - |
| `AutomationStudioConversationDecision` | Type | `packages/fluxiq/src/programs/automation-studio/runtime/conversations/instructions/decision.ts:55` | - |
| `AutomationStudioConversationDecisionContext` | Type | `packages/fluxiq/src/programs/automation-studio/runtime/conversations/instructions/invocation.ts:31` | What Core knows while deciding: the panel's vocabulary, the project's Flows, and what is on screen. |
| `AutomationStudioConversationDecisionSource` | Type | `packages/fluxiq/src/programs/automation-studio/runtime/conversations/instructions/decision.ts:61` | Who decided: the model, or Core matching the words itself because the model could not be used. |
| `automationStudioConversationEffectiveCaller` | Value | `packages/fluxiq/src/programs/automation-studio/runtime/conversations/commands/caller.ts:33` | - |
| `AutomationStudioConversationEffectiveCaller` | Type | `packages/fluxiq/src/programs/automation-studio/runtime/conversations/commands/caller.ts:24` | - |
| `automationStudioConversationFallbackDecision` | Value | `packages/fluxiq/src/programs/automation-studio/runtime/conversations/instructions/fallback.ts:29` | - |
| `automationStudioConversationFlowMentioned` | Value | `packages/fluxiq/src/programs/automation-studio/runtime/conversations/instructions/flows.ts:38` | - |
| `automationStudioConversationFlowNamed` | Value | `packages/fluxiq/src/programs/automation-studio/runtime/conversations/instructions/flows.ts:22` | - |
| `AutomationStudioConversationFlowReference` | Type | `packages/fluxiq/src/programs/automation-studio/runtime/conversations/instructions/decision.ts:16` | A Flow in the project, as a person or a model would name it. |
| `automationStudioConversationFlowWords` | Value | `packages/fluxiq/src/programs/automation-studio/runtime/conversations/instructions/flows.ts:60` | - |
| `automationStudioConversationFromRow` | Value | `packages/fluxiq/src/programs/automation-studio/runtime/conversations/rows.ts:78` | - |
| `automationStudioConversationIdOrRefuse` | Value | `packages/fluxiq/src/programs/automation-studio/runtime/conversations/inputs.ts:125` | - |
| `AutomationStudioConversationInstructionAnswer` | Type | `packages/fluxiq/src/programs/automation-studio/runtime/conversations/instructions/request.ts:34` | The person's turn, stored first, and what it became. `response` is null only when the answer could not be written into the thread; `problem` then says why in words, and the person's own turn is still there. |
| `AutomationStudioConversationInstructionRequest` | Type | `packages/fluxiq/src/programs/automation-studio/runtime/conversations/instructions/request.ts:18` | A person's turn that is also read as an instruction: the panel's vocabulary, the project's Flows and what is on screen travel with it. |
| `automationStudioConversationInstructions` | Value | `packages/fluxiq/src/programs/automation-studio/runtime/conversations/instructions/prompt.ts:24` | - |
| `AutomationStudioConversationInterpretation` | Type | `packages/fluxiq/src/programs/automation-studio/runtime/conversations/instructions/decision.ts:64` | A decision, how it was reached, and why the model was not the one to reach it when it was not. |
| `AutomationStudioConversationInterpretInput` | Type | `packages/fluxiq/src/programs/automation-studio/runtime/conversations/instructions/interpret.ts:40` | - |
| `AutomationStudioConversationInterpretLimits` | Type | `packages/fluxiq/src/programs/automation-studio/runtime/conversations/instructions/interpret.ts:25` | - |
| `AutomationStudioConversationInvocation` | Type | `packages/fluxiq/src/programs/automation-studio/runtime/conversations/instructions/decision.ts:37` | A capability to run, with everything Core could fill in already filled. |
| `automationStudioConversationInvocationDecision` | Value | `packages/fluxiq/src/programs/automation-studio/runtime/conversations/instructions/invocation.ts:61` | - |
| `AutomationStudioConversationListInput` | Type | `packages/fluxiq/src/programs/automation-studio/runtime/conversations/inputs.ts:55` | - |
| `AutomationStudioConversationListRequest` | Type | `packages/fluxiq/src/programs/automation-studio/runtime/conversations/conversations.ts:49` | - |
| `AutomationStudioConversationModel` | Type | `packages/fluxiq/src/programs/automation-studio/runtime/conversations/instructions/model.ts:49` | - |
| `AutomationStudioConversationModelExecution` | Type | `packages/fluxiq/src/programs/automation-studio/runtime/conversations/instructions/model.ts:43` | - |
| `automationStudioConversationModelProblem` | Value | `packages/fluxiq/src/programs/automation-studio/runtime/conversations/instructions/interpret.ts:92` | - |
| `AutomationStudioConversationModelRequest` | Type | `packages/fluxiq/src/programs/automation-studio/runtime/conversations/instructions/model.ts:20` | - |
| `automationStudioConversationModelTranscript` | Value | `packages/fluxiq/src/programs/automation-studio/runtime/conversations/instructions/request.ts:55` | - |
| `AutomationStudioConversationModelTurn` | Type | `packages/fluxiq/src/programs/automation-studio/runtime/conversations/instructions/model.ts:15` | One turn of the thread as the model reads it. `panel` is a record of what the panel did, written on the person's behalf. |
| `AutomationStudioConversationOnScreen` | Type | `packages/fluxiq/src/programs/automation-studio/runtime/conversations/instructions/decision.ts:22` | What the panel has open while the person writes. Every field may be absent. |
| `AutomationStudioConversationOpenInput` | Type | `packages/fluxiq/src/programs/automation-studio/runtime/conversations/inputs.ts:25` | - |
| `AutomationStudioConversationOpenRequest` | Type | `packages/fluxiq/src/programs/automation-studio/runtime/conversations/writer.ts:22` | Opening a subject's thread. Without `conversationId` the holder mints one. |
| `automationStudioConversationPageShown` | Value | `packages/fluxiq/src/programs/automation-studio/runtime/conversations/commands/page.ts:8` | - |
| `AutomationStudioConversationParkingHost` | Type | `packages/fluxiq/src/programs/automation-studio/runtime/parking/conversation-port.ts:24` | What carrying a question to a person takes: a thread to write in, and the ask read back as it now stands. |
| `automationStudioConversationParkingPort` | Value | `packages/fluxiq/src/programs/automation-studio/runtime/parking/conversation-port.ts:57` | - |
| `AutomationStudioConversationParkingPortInput` | Type | `packages/fluxiq/src/programs/automation-studio/runtime/parking/conversation-port.ts:33` | - |
| `AutomationStudioConversationParkingRequest` | Type | `packages/fluxiq/src/programs/automation-studio/runtime/conversations/conversations.ts:110` | A parking port bound to one subject's thread: where a run's questions go and where their answers come back from. |
| `automationStudioConversationPermissionAsk` | Value | `packages/fluxiq/src/programs/automation-studio/runtime/conversations/writer.ts:110` | - |
| `AutomationStudioConversationPermissionAskOptions` | Type | `packages/fluxiq/src/programs/automation-studio/runtime/conversations/writer.ts:45` | How a permission ask behaves while it waits. `parks` defaults to true: a question that ends the run is what this replaces. |
| `AutomationStudioConversationPersonTurnRequest` | Type | `packages/fluxiq/src/programs/automation-studio/runtime/conversations/conversations.ts:64` | A person's own turn, written through the API. |
| `AutomationStudioConversationReadInput` | Type | `packages/fluxiq/src/programs/automation-studio/runtime/conversations/inputs.ts:62` | - |
| `AutomationStudioConversationReadRequest` | Type | `packages/fluxiq/src/programs/automation-studio/runtime/conversations/conversations.ts:56` | - |
| `AutomationStudioConversationResponse` | Type | `packages/fluxiq/src/programs/automation-studio/runtime/conversations/instructions/decision.ts:74` | What the endpoint answers with after a person's turn, beside the turn itself. |
| `AutomationStudioConversationResponseWrite` | Type | `packages/fluxiq/src/programs/automation-studio/runtime/conversations/instructions/respond.ts:38` | - |
| `AutomationStudioConversationResponseWritten` | Type | `packages/fluxiq/src/programs/automation-studio/runtime/conversations/instructions/respond.ts:46` | - |
| `AutomationStudioConversationRow` | Type | `packages/fluxiq/src/programs/automation-studio/runtime/conversations/rows.ts:26` | - |
| `AutomationStudioConversations` | Class | `packages/fluxiq/src/programs/automation-studio/runtime/conversations/conversations.ts:124` | - |
| `automationStudioConversationShortTextOrRefuse` | Value | `packages/fluxiq/src/programs/automation-studio/runtime/conversations/inputs.ts:117` | - |
| `AutomationStudioConversationStatus` | Type | `packages/fluxiq/src/programs/automation-studio/runtime/conversations/thread.ts:16` | - |
| `AutomationStudioConversationSubject` | Type | `packages/fluxiq/src/programs/automation-studio/runtime/conversations/thread.ts:19` | What the thread is about. For `project` the id is the project's own id. |
| `AutomationStudioConversationSubjectKind` | Type | `packages/fluxiq/src/programs/automation-studio/runtime/conversations/thread.ts:13` | - |
| `automationStudioConversationTextOrRefuse` | Value | `packages/fluxiq/src/programs/automation-studio/runtime/conversations/inputs.ts:110` | - |
| `AutomationStudioConversationThread` | Type | `packages/fluxiq/src/programs/automation-studio/runtime/conversations/thread.ts:45` | A thread and the turns a reader asked for: everything, or everything after `sinceTurnId`. |
| `AutomationStudioConversationThreadPage` | Type | `packages/fluxiq/src/programs/automation-studio/runtime/conversations/whole-thread.ts:13` | One page of a thread, as `AutomationStudioConversationStore.getConversation` and the service's own reader return it. |
| `AutomationStudioConversationTurn` | Type | `packages/fluxiq/src/programs/automation-studio/runtime/conversations/turn.ts:25` | - |
| `automationStudioConversationTurnFromRow` | Value | `packages/fluxiq/src/programs/automation-studio/runtime/conversations/rows.ts:93` | - |
| `AutomationStudioConversationTurnInput` | Type | `packages/fluxiq/src/programs/automation-studio/runtime/conversations/inputs.ts:34` | - |
| `AutomationStudioConversationTurnRow` | Type | `packages/fluxiq/src/programs/automation-studio/runtime/conversations/rows.ts:39` | - |
| `AutomationStudioConversationUnlockedSessionResolver` | Type | `packages/fluxiq/src/programs/automation-studio/runtime/conversations/commands/caller.ts:22` | The person's live unlocked session, or null. Bound to Secret Keys in production. |
| `automationStudioConversationWholeThread` | Value | `packages/fluxiq/src/programs/automation-studio/runtime/conversations/whole-thread.ts:22` | - |
| `AutomationStudioConversationWordsAnswer` | Type | `packages/fluxiq/src/programs/automation-studio/runtime/conversations/commands/answer-words.ts:13` | - |
| `automationStudioConversationWriter` | Value | `packages/fluxiq/src/programs/automation-studio/runtime/conversations/writer.ts:68` | - |
| `AutomationStudioConversationWriter` | Type | `packages/fluxiq/src/programs/automation-studio/runtime/conversations/writer.ts:55` | One subject's thread, bound. Core posts turns and raises asks through this and nothing else. |
| `AutomationStudioConversationWriterHost` | Type | `packages/fluxiq/src/programs/automation-studio/runtime/conversations/writer.ts:39` | What a writer needs from whatever holds the store. The conversations collaborator satisfies it. |
| `AutomationStudioConversationWriterRequest` | Type | `packages/fluxiq/src/programs/automation-studio/runtime/conversations/conversations.ts:117` | - |
| `automationStudioCoreLoopStageInstructionId` | Value | `packages/fluxiq/src/programs/automation-studio/runtime/llm/stages/instructions.ts:35` | - |
| `AutomationStudioCrashInjectionEvidence` | Type | `packages/fluxiq/src/programs/automation-studio/testing/scale-certification.ts:42` | - |
| `AutomationStudioCriticalQueryEvidence` | Type | `packages/fluxiq/src/programs/automation-studio/testing/scale-certification.ts:58` | - |
| `AutomationStudioCursorPage` | Type | `packages/fluxiq/src/programs/automation-studio/storage/catalog.ts:15` | - |
| `automationStudioCustomNodeFolders` | Object | `packages/fluxiq/src/programs/automation-studio/nodes/layout.ts:9` | - |
| `automationStudioCustomNodeRoot` | Object | `packages/fluxiq/src/programs/automation-studio/nodes/layout.ts:7` | - |
| `automationStudioDeclaredConsequences` | Value | `packages/fluxiq/src/programs/automation-studio/runtime/action-permissions/declared.ts:59` | - |
| `automationStudioDeclaredNothingLasting` | Value | `packages/fluxiq/src/programs/automation-studio/runtime/action-permissions/declared.ts:73` | - |
| `automationStudioDeclinedRepairAttempt` | Value | `packages/fluxiq/src/programs/automation-studio/runtime/recovery/annotation/patches.ts:401` | - |
| `AutomationStudioDeepSeekModel` | Type | `packages/fluxiq/src/programs/automation-studio/runtime/llm/deepseek/models.ts:26` | - |
| `automationStudioDeepSeekModelRefusal` | Value | `packages/fluxiq/src/programs/automation-studio/runtime/llm/deepseek/models.ts:67` | - |
| `AutomationStudioDeepSeekPanelCommandOptions` | Type | `packages/fluxiq/src/programs/automation-studio/runtime/llm/deepseek/panel-command.ts:40` | - |
| `AutomationStudioDeepSeekProviderOptions` | Type | `packages/fluxiq/src/programs/automation-studio/runtime/llm/deepseek/provider.ts:45` | - |
| `AutomationStudioDefenceEntry` | Type | `packages/fluxiq/src/programs/automation-studio/runtime/executor/defensive/ledger.ts:17` | One fault the run met, and what became of it. |
| `automationStudioDefenceLedger` | Value | `packages/fluxiq/src/programs/automation-studio/runtime/executor/defensive/ledger.ts:71` | - |
| `AutomationStudioDefenceLedger` | Type | `packages/fluxiq/src/programs/automation-studio/runtime/executor/defensive/ledger.ts:59` | The run-scoped record of every fault met, and the waiting allowance spent on them. |
| `AutomationStudioDefenceOutcome` | Type | `packages/fluxiq/src/programs/automation-studio/runtime/executor/defensive/ledger.ts:8` | What the run did about one fault. |
| `AutomationStudioDefenceSummary` | Type | `packages/fluxiq/src/programs/automation-studio/runtime/executor/defensive/ledger.ts:42` | What one run survived, carried on its trace. A fault that was absorbed and left no mark is the failure mode this repository keeps meeting: a reason computed and discarded, a run that looks clean and a person who cannot tell a first-attempt success from a third. Every assessment lands here, absorbed or not. |
| `automationStudioDefinitionVerifiesState` | Value | `packages/fluxiq/src/programs/automation-studio/runtime/flow-change/contracts.ts:295` | - |
| `AutomationStudioDeleteProjectUiCacheRequest` | Type | `packages/fluxiq/src/programs/automation-studio/api/contracts/ui-cache.ts:38` | - |
| `AutomationStudioDeleteProjectUiCacheResponse` | Type | `packages/fluxiq/src/programs/automation-studio/api/contracts/ui-cache.ts:43` | - |
| `AutomationStudioDeleteReusableLlmContextRequest` | Type | `packages/fluxiq/src/programs/automation-studio/api/contracts/llm.ts:9` | - |
| `automationStudioDestructiveConsequences` | Value | `packages/fluxiq/src/programs/automation-studio/runtime/action-permissions/destructive.ts:72` | - |
| `AutomationStudioDeterministicPath` | Type | `packages/fluxiq/src/programs/automation-studio/model/flow-adaptation.ts:195` | The `after` value of an `insert_deterministic_path` patch: the nodes to insert, and optionally the node the path rejoins once they succeed. The patch's `targetId` is the node that failed. Applying it wires that node's `failed` port into `nodes[0]`, chains each node's `success` port into the next and, when `returnToNodeId` is set, chains the last node's `success` port back into that node. Every inserted node is therefore reachable from the failure it recovers, and only from it, so the recovery ladder's existing `deterministic_path` candidate picks the new failed edge up with no executor change at all. |
| `AutomationStudioDeterministicPathNode` | Type | `packages/fluxiq/src/programs/automation-studio/model/flow-adaptation.ts:173` | One action node a deterministic recovery path inserts into the graph it repairs. It is a whole node, not a hint: a definition the node runtime can dispatch, the parameters it runs with, the target it acts on, and the expectation its transition is compared against. `edit_recovery` carried only `actionDefinitionIds`, which named definitions but said nothing about what to run them on, so no applier could build a node from it. `target` is written through `actionTargetParameterValues`, so a policy action is re-pointed inside its output payload exactly as an `edit_action_target` patch re-points one, and `expectation` merges over the parameters. |
| `AutomationStudioDocumentationEvidence` | Type | `packages/fluxiq/src/programs/automation-studio/testing/scale-certification.ts:79` | - |
| `AutomationStudioDocumentIdentity` | Type | `packages/fluxiq/src/programs/automation-studio/storage/ids.ts:25` | - |
| `AutomationStudioEffectiveInstructionSet` | Type | `packages/fluxiq/src/programs/automation-studio/storage/project/flow-resource-repository.ts:38` | - |
| `AutomationStudioElementMatcher` | Type | `packages/fluxiq/src/programs/automation-studio/fingerprinting/element-fingerprint.ts:82` | - |
| `AutomationStudioElementTarget` | Type | `packages/fluxiq/src/programs/automation-studio/model/action-element-target.ts:43` | - |
| `AutomationStudioElementTargetCandidate` | Type | `packages/fluxiq/src/programs/automation-studio/model/action-element-target.ts:28` | - |
| `AutomationStudioElementTargetFingerprint` | Type | `packages/fluxiq/src/programs/automation-studio/model/action-element-target.ts:6` | - |
| `AutomationStudioElementTargetSelection` | Type | `packages/fluxiq/src/programs/automation-studio/model/action-element-target.ts:35` | - |
| `AutomationStudioElementTargetSource` | Type | `packages/fluxiq/src/programs/automation-studio/model/action-element-target.ts:4` | - |
| `AutomationStudioElementTargetValidationIssue` | Type | `packages/fluxiq/src/programs/automation-studio/model/action-element-target.ts:52` | - |
| `AutomationStudioElementTargetValidationResult` | Type | `packages/fluxiq/src/programs/automation-studio/model/action-element-target.ts:59` | - |
| `AutomationStudioEventChunkDocument` | Type | `packages/fluxiq/src/programs/automation-studio/storage/project/event-chunk-store.ts:7` | - |
| `AutomationStudioEventChunkRecord` | Type | `packages/fluxiq/src/programs/automation-studio/storage/project/event-chunk-store.ts:15` | - |
| `AutomationStudioEventCursorPage` | Type | `packages/fluxiq/src/programs/automation-studio/storage/project/event-chunk-store.ts:30` | - |
| `AutomationStudioEventStreamKind` | Type | `packages/fluxiq/src/programs/automation-studio/storage/project/event-chunk-store.ts:5` | - |
| `AutomationStudioEventStreamWriter` | Type | `packages/fluxiq/src/programs/automation-studio/storage/project/event-stream-writer.ts:7` | - |
| `automationStudioEvidenceFlowBootstrapCompletionSchema` | Value | `packages/fluxiq/src/programs/automation-studio/runtime/flow-bootstrap/plan/evidence-schema.ts:46` | - |
| `automationStudioEvidenceFlowBootstrapDraftCompletionSchema` | Value | `packages/fluxiq/src/programs/automation-studio/runtime/flow-bootstrap/plan/evidence-schema.ts:102` | - |
| `automationStudioEvidenceFlowBootstrapLimitsExceeded` | Value | `packages/fluxiq/src/programs/automation-studio/runtime/flow-bootstrap/plan/profile-limits.ts:52` | - |
| `automationStudioEvidenceKey` | Value | `packages/fluxiq/src/programs/automation-studio/runtime/llm/harness/failure-evidence.ts:26` | - |
| `automationStudioExecutableTargetKey` | Value | `packages/fluxiq/src/programs/automation-studio/runtime/llm/harness/evidence-screen.ts:96` | - |
| `AutomationStudioExecutionMode` | Type | `packages/fluxiq/src/programs/automation-studio/runtime/training-modes.ts:19` | - |
| `automationStudioExpectationSatisfiedAfterFailure` | Value | `packages/fluxiq/src/programs/automation-studio/runtime/executor/transition-comparison.ts:166` | - |
| `AutomationStudioExpectedTransition` | Type | `packages/fluxiq/src/programs/automation-studio/runtime/executor/contracts.ts:34` | - |
| `AutomationStudioExplorationBudget` | Type | `packages/fluxiq/src/programs/automation-studio/runtime/recovery/exploration-budget.ts:82` | - |
| `AutomationStudioExplorationBudgetLedger` | Class | `packages/fluxiq/src/programs/automation-studio/runtime/recovery/exploration-budget.ts:189` | One exploration's spending, and the signal that ends it. The ledger is the only thing that knows *why* the loop was stopped. The loop reports `cancelled` for every abort there is, so if the reason were not recorded here at the moment of the refusal, a wall clock, an action cap and a refused action would all arrive downstream as the same word -- which is precisely the collapse this phase exists to prevent. |
| `automationStudioExplorationCompletionOutcome` | Value | `packages/fluxiq/src/programs/automation-studio/runtime/recovery/exploration-outcome.ts:160` | - |
| `AutomationStudioExplorationDroppedStep` | Type | `packages/fluxiq/src/programs/automation-studio/runtime/exploration-reduction/reduction.ts:52` | - |
| `AutomationStudioExplorationDropReason` | Type | `packages/fluxiq/src/programs/automation-studio/runtime/exploration-reduction/reduction.ts:41` | - |
| `automationStudioExplorationEvidenceDigest` | Value | `packages/fluxiq/src/programs/automation-studio/runtime/recovery/progress-guard.ts:172` | - |
| `AutomationStudioExplorationNoProgressReason` | Type | `packages/fluxiq/src/programs/automation-studio/runtime/recovery/progress-guard.ts:52` | - |
| `AutomationStudioExplorationOutcome` | Type | `packages/fluxiq/src/programs/automation-studio/runtime/recovery/exploration-outcome.ts:62` | - |
| `AutomationStudioExplorationProgressGuard` | Class | `packages/fluxiq/src/programs/automation-studio/runtime/recovery/progress-guard.ts:92` | One exploration's progress, and the verdict on each step it takes. Deliberately knows nothing about aborting, budgets or outcomes. It is handed a step and answers whether that step advanced anything; the budget ledger owns what to do about the answer, because the ledger is the one place that records why an exploration stopped. |
| `AutomationStudioExplorationProgressStep` | Type | `packages/fluxiq/src/programs/automation-studio/runtime/recovery/progress-guard.ts:64` | - |
| `AutomationStudioExplorationProgressVerdict` | Type | `packages/fluxiq/src/programs/automation-studio/runtime/recovery/progress-guard.ts:75` | - |
| `AutomationStudioExplorationRecordedCall` | Type | `packages/fluxiq/src/programs/automation-studio/runtime/recovery/exploration-state/recorder.ts:27` | The part of one action's call this recorder reads. |
| `AutomationStudioExplorationReducedStep` | Type | `packages/fluxiq/src/programs/automation-studio/runtime/exploration-reduction/reduction.ts:59` | - |
| `AutomationStudioExplorationReduction` | Type | `packages/fluxiq/src/programs/automation-studio/runtime/exploration-reduction/reduction.ts:67` | - |
| `AutomationStudioExplorationReductionInput` | Type | `packages/fluxiq/src/programs/automation-studio/runtime/exploration-reduction/backward-slice.ts:61` | - |
| `AutomationStudioExplorationReductionReview` | Type | `packages/fluxiq/src/programs/automation-studio/runtime/recovery/exploration-state/reduction-review.ts:47` | - |
| `AutomationStudioExplorationReductionReviewInput` | Type | `packages/fluxiq/src/programs/automation-studio/runtime/recovery/exploration-state/reduction-review.ts:64` | - |
| `AutomationStudioExplorationRefusalClassifier` | Type | `packages/fluxiq/src/programs/automation-studio/runtime/recovery/runtime-exploration.ts:134` | How a domain translates its own refusal codes into Core's stop reasons. Core cannot read `web.action.rejected.target_unsafe`, and must not learn to: the refusal is semantic and the meaning belongs to whoever owns the medium (decision L3). So the domain is handed an opaque string and answers in Core's closed vocabulary, or answers nothing -- and nothing means ordinary feedback, which the loop already knows how to give back to the model. |
| `automationStudioExplorationScopeAllows` | Value | `packages/fluxiq/src/programs/automation-studio/runtime/recovery/exploration-budget.ts:171` | - |
| `AutomationStudioExplorationScopePolicy` | Type | `packages/fluxiq/src/programs/automation-studio/runtime/recovery/exploration-budget.ts:78` | Where an exploration may go. `same_scope` keeps it where the run already is. `allowlist` names the places it may also reach. Both sides are opaque to Core: the domain supplies the strings and calls `automationStudioExplorationScopeAllows` to compare them, so a domain with no pages and no origins expresses its own idea of "where" in exactly this policy. |
| `automationStudioExplorationStateDigestEquals` | Value | `packages/fluxiq/src/programs/automation-studio/runtime/exploration-reduction/state-predicate.ts:36` | - |
| `AutomationStudioExplorationStateDigestFailure` | Type | `packages/fluxiq/src/programs/automation-studio/runtime/recovery/exploration-state/digest-source.ts:91` | One moment whose digest was asked for and came back as a thrown error. |
| `AutomationStudioExplorationStateDigestPhase` | Type | `packages/fluxiq/src/programs/automation-studio/runtime/recovery/exploration-state/digest-source.ts:63` | Which side of a step a digest describes. |
| `AutomationStudioExplorationStateDigestRequest` | Type | `packages/fluxiq/src/programs/automation-studio/runtime/recovery/exploration-state/digest-source.ts:66` | The moment a digest is being asked for, named by the step it brackets. |
| `AutomationStudioExplorationStateDigestSource` | Type | `packages/fluxiq/src/programs/automation-studio/runtime/recovery/exploration-state/digest-source.ts:86` | How the caller answers what the state was at one moment. Returning nothing is the honest answer for a moment the caller could not observe: the step is then recorded without digests, the reduction reports it as a gap, and nothing is guessed at. Throwing is also allowed and is recorded as a failure against that moment; it never fails the step, because a step that ran and did something is a fact whether or not the bookkeeping around it worked. |
| `AutomationStudioExplorationStatePredicate` | Type | `packages/fluxiq/src/programs/automation-studio/runtime/exploration-reduction/state-predicate.ts:28` | A condition on one state, in the only vocabulary an opaque digest supports. `any_state` is not a weaker equality: it is what a reduction with nothing to replay carries, and it says the sequence needs no particular state because it does nothing. |
| `AutomationStudioExplorationStateRecorder` | Class | `packages/fluxiq/src/programs/automation-studio/runtime/recovery/exploration-state/recorder.ts:43` | One exploration's step record: every action that ran, in order, with the argument it was given and the state either side of it. Bound to one exploration and never reused across two. It holds no state of its own beyond what it recorded, so a caller that binds no digest source still gets the arguments -- which is the half of the record Core can always supply. |
| `automationStudioExplorationStateSatisfies` | Value | `packages/fluxiq/src/programs/automation-studio/runtime/exploration-reduction/state-predicate.ts:41` | - |
| `AutomationStudioExplorationStateSource` | Type | `packages/fluxiq/src/programs/automation-studio/runtime/exploration-reduction/evidence-loop-trace.ts:59` | How the caller answers, for one trace entry, what the trace left out. Keyed on the iteration rather than the call id, because an entry the loop answered from what it already held carries no call id and is still a step the receipt should account for. |
| `AutomationStudioExplorationStep` | Type | `packages/fluxiq/src/programs/automation-studio/runtime/exploration-reduction/step.ts:63` | - |
| `AutomationStudioExplorationStepEffect` | Type | `packages/fluxiq/src/programs/automation-studio/runtime/exploration-reduction/step.ts:40` | Whether a step only read the state or changed it. The same two words the evidence loop's tool table uses, deliberately: a second vocabulary for the same distinction is how the two come to disagree about one tool. |
| `AutomationStudioExplorationStepOutcome` | Type | `packages/fluxiq/src/programs/automation-studio/runtime/exploration-reduction/step.ts:61` | - |
| `AutomationStudioExplorationStepRecord` | Type | `packages/fluxiq/src/programs/automation-studio/runtime/recovery/exploration-state/step-record.ts:26` | - |
| `automationStudioExplorationStepsFromTrace` | Value | `packages/fluxiq/src/programs/automation-studio/runtime/exploration-reduction/evidence-loop-trace.ts:113` | - |
| `AutomationStudioExplorationStepsFromTraceInput` | Type | `packages/fluxiq/src/programs/automation-studio/runtime/exploration-reduction/evidence-loop-trace.ts:96` | - |
| `AutomationStudioExplorationStepState` | Type | `packages/fluxiq/src/programs/automation-studio/runtime/exploration-reduction/evidence-loop-trace.ts:43` | What the caller knows about a step that the exploration trace does not record. |
| `AutomationStudioExplorationStopReason` | Type | `packages/fluxiq/src/programs/automation-studio/runtime/recovery/exploration-outcome.ts:86` | - |
| `automationStudioExplorationTraceEvent` | Value | `packages/fluxiq/src/programs/automation-studio/runtime/recovery/runtime-exploration.ts:472` | - |
| `AutomationStudioExplorationTraceGap` | Type | `packages/fluxiq/src/programs/automation-studio/runtime/exploration-reduction/evidence-loop-trace.ts:75` | - |
| `AutomationStudioExplorationTraceGapEntry` | Type | `packages/fluxiq/src/programs/automation-studio/runtime/exploration-reduction/evidence-loop-trace.ts:77` | - |
| `AutomationStudioExplorationUnusableDecisionError` | Class | `packages/fluxiq/src/programs/automation-studio/runtime/recovery/unusable-decision.ts:15` | - |
| `automationStudioExploredEvidenceHandle` | Value | `packages/fluxiq/src/programs/automation-studio/runtime/llm/harness/explored-evidence-label.ts:49` | - |
| `automationStudioExploredEvidenceLabel` | Value | `packages/fluxiq/src/programs/automation-studio/runtime/llm/harness/explored-evidence-label.ts:28` | - |
| `AutomationStudioFailedStepRepairPort` | Type | `packages/fluxiq/src/programs/automation-studio/runtime/recovery/refuted-result/step-failure-decision.ts:80` | The port the verification calls for a run that failed at a step. It answers the run with the attempt recorded and whether the Flow was changed, or nothing when the run was not routed -- in which case nothing was written and the failed run stands exactly as the ladder left it. |
| `AutomationStudioFailureContinuation` | Type | `packages/fluxiq/src/programs/automation-studio/runtime/executor/defensive/continuation.ts:48` | Whether the Flow carries on past a node that failed for good, and the reason either way. |
| `AutomationStudioFailureRecord` | Type | `packages/contracts/src/failure/record.ts:42` | A structured failure. Core owns the category names; the producer owns `code`. Carried as `failure` on client-gateway action results, runtime command results, output dispatch results, node execution results, attempt traces, and run action records. Validate any value that crossed a process or storage boundary with `parseAutomationStudioFailureRecord`. |
| `AutomationStudioFailureStage` | Type | `packages/contracts/src/failure/record.ts:12` | - |
| `AutomationStudioFaultAssessment` | Type | `packages/fluxiq/src/programs/automation-studio/runtime/executor/defensive/contracts.ts:40` | One fault, classified: what it was, whether the runtime absorbs it, and why. `reason` exists because this repository has been bitten repeatedly by a reason that was computed and thrown away. Every assessment is recorded on the run's defence ledger whether it was absorbed or refused, so a debug can see what the run survived and what it declined to survive. |
| `AutomationStudioFaultDisposition` | Type | `packages/fluxiq/src/programs/automation-studio/runtime/executor/defensive/contracts.ts:11` | What the default runtime does about one fault. `retry` is the answer the product wants wherever it is honest: a fault the runtime can absorb is absorbed rather than ending a run. `refuse` is reserved for a fault where attempting the same thing again cannot change the outcome, or where attempting it again could act on the world twice. |
| `AutomationStudioFaultEffect` | Type | `packages/fluxiq/src/programs/automation-studio/runtime/executor/defensive/contracts.ts:21` | Whether the action behind this fault could already have taken effect. `unacted` means the request demonstrably never reached whatever would carry it out -- nothing accepted it, nothing answered it, or the answer says plainly it was not processed. `ambiguous` means it may have been carried out and the answer was lost, which is the case a mutating node must not repeat blindly. |
| `automationStudioFaultFromResultMessage` | Value | `packages/fluxiq/src/programs/automation-studio/runtime/executor/defensive/result-message.ts:19` | - |
| `automationStudioFaultFromThrownError` | Value | `packages/fluxiq/src/programs/automation-studio/runtime/executor/defensive/thrown-error.ts:79` | - |
| `AutomationStudioFaultSource` | Type | `packages/fluxiq/src/programs/automation-studio/runtime/executor/defensive/contracts.ts:24` | Where the classification came from, so a trace never has to be guessed at. |
| `AutomationStudioFeatureFlagEvidence` | Type | `packages/fluxiq/src/programs/automation-studio/testing/scale-certification.ts:88` | - |
| `AutomationStudioFileStorePaths` | Type | `packages/fluxiq/src/programs/automation-studio/storage/file-store.ts:164` | - |
| `automationStudioFilterHash` | Value | `packages/fluxiq/src/programs/automation-studio/storage/paging.ts:19` | - |
| `AutomationStudioFixture` | Type | `packages/fluxiq/src/programs/automation-studio/model/fixtures/recorded-task.ts:5` | - |
| `AutomationStudioFlowAdaptation` | Type | `packages/fluxiq/src/programs/automation-studio/model/flow-adaptation.ts:421` | - |
| `AutomationStudioFlowAdaptationStatus` | Type | `packages/fluxiq/src/programs/automation-studio/model/flow-adaptation.ts:375` | - |
| `AutomationStudioFlowAdaptationValidationResult` | Type | `packages/fluxiq/src/programs/automation-studio/model/flow-adaptation.ts:410` | One observed run of a change. |
| `AutomationStudioFlowArtifact` | Type | `packages/fluxiq/src/programs/automation-studio/model/flows.ts:197` | Canonical, owner-independent Flow artifact for new authoring surfaces. It deliberately coexists with AutomationStudioFlowDocument while legacy task/routine compatibility is implemented in the next migration slice. |
| `AutomationStudioFlowBootstrapAcceptance` | Type | `packages/fluxiq/src/programs/automation-studio/runtime/flow-bootstrap/authoring/contracts.ts:120` | A result the acceptor could read, or the issues that refused it. `script` is what the reply was read from, when it arrived as a Flow script, exactly as the model wrote it. It is carried on both answers because the checks that refuse a plan run after it was accepted, and each of them has to be able to hand the model back its own draft to correct. Every decision is a fresh request with no conversation history, so without this the model is asked to try again with its previous answer absent from the question, and the only thing it can do is write a new one from memory -- which is how a live build "completed again with those steps deleted and the wrong answer in their place". It is the model's own writing and never page content, so handing it back tells the model nothing its own tools had not already told it. A refusal may carry `refusedPlan`: the plan the script got as far as, so a refusal's feedback can read each node's definition out of it and answer with the parameters that node does declare. Nothing builds, validates or persists from it -- it holds at least one refused node by construction -- and it is deliberately not called `plan`, so no caller reaches it by widening a check. |
| `automationStudioFlowBootstrapActionPermissions` | Value | `packages/fluxiq/src/programs/automation-studio/runtime/flow-bootstrap/action-permissions.ts:145` | - |
| `AutomationStudioFlowBootstrapActionPermissions` | Type | `packages/fluxiq/src/programs/automation-studio/runtime/flow-bootstrap/action-permissions.ts:106` | - |
| `AutomationStudioFlowBootstrapAnswerability` | Type | `packages/fluxiq/src/programs/automation-studio/runtime/flow-bootstrap/answerability/contracts.ts:60` | Whether the plan may be proposed, or what the model is told instead. A refusal is not the end of a build. It is fed back exactly as a refused parameter is, and the exploration asks again on the same budget, cost and no-progress guards -- so nothing here can spin. |
| `AutomationStudioFlowBootstrapAnswerabilitySnapshot` | Type | `packages/fluxiq/src/programs/automation-studio/runtime/flow-bootstrap/answerability/contracts.ts:45` | Content-free capability facts observed when a completed plan is checked. |
| `automationStudioFlowBootstrapBlockedSaid` | Value | `packages/fluxiq/src/programs/automation-studio/runtime/flow-bootstrap/unfinished-build/not-done.ts:68` | - |
| `AutomationStudioFlowBootstrapBudgetBound` | Type | `packages/fluxiq/src/programs/automation-studio/runtime/flow-bootstrap/generation-failure/build-ending.ts:23` | Which budget ran out. |
| `automationStudioFlowBootstrapBudgetExhausted` | Value | `packages/fluxiq/src/programs/automation-studio/runtime/flow-bootstrap/unfinished-build/budget-exhausted.ts:36` | - |
| `AutomationStudioFlowBootstrapBudgetSizes` | Type | `packages/fluxiq/src/programs/automation-studio/runtime/flow-bootstrap/unfinished-build/budget-exhausted.ts:26` | The size of each budget, as the person is told it. |
| `AutomationStudioFlowBootstrapBuildEnding` | Type | `packages/fluxiq/src/programs/automation-studio/runtime/flow-bootstrap/generation-failure/build-ending.ts:38` | What a build that could not finish says about itself. |
| `AutomationStudioFlowBootstrapBuildPhasesInput` | Type | `packages/fluxiq/src/programs/automation-studio/runtime/flow-bootstrap/unfinished-build/phases.ts:105` | - |
| `AutomationStudioFlowBootstrapBuildPhasesOutcome` | Type | `packages/fluxiq/src/programs/automation-studio/runtime/flow-bootstrap/unfinished-build/phases.ts:134` | - |
| `AutomationStudioFlowBootstrapCatalogEntry` | Type | `packages/fluxiq/src/programs/automation-studio/runtime/flow-bootstrap/plan/contracts.ts:68` | - |
| `AutomationStudioFlowBootstrapCompletionFailureCode` | Type | `packages/fluxiq/src/programs/automation-studio/runtime/llm/harness-options/bootstrap-completion.ts:94` | - |
| `AutomationStudioFlowBootstrapCompletionVerdict` | Type | `packages/fluxiq/src/programs/automation-studio/runtime/llm/harness-options/bootstrap-completion.ts:102` | - |
| `AutomationStudioFlowBootstrapContext` | Type | `packages/fluxiq/src/programs/automation-studio/runtime/flow-bootstrap/plan/contracts.ts:93` | - |
| `AutomationStudioFlowBootstrapCurrentRoute` | Type | `packages/fluxiq/src/programs/automation-studio/runtime/flow-bootstrap/plan/routing-context.ts:40` | - |
| `AutomationStudioFlowBootstrapCurrentStructure` | Type | `packages/fluxiq/src/programs/automation-studio/runtime/flow-bootstrap/plan/routing-context.ts:47` | - |
| `automationStudioFlowBootstrapDeclaredRecordsPath` | Value | `packages/fluxiq/src/programs/automation-studio/runtime/flow-bootstrap/plan/record-output-contract.ts:81` | - |
| `automationStudioFlowBootstrapDraftActs` | Value | `packages/fluxiq/src/programs/automation-studio/runtime/llm/harness-options/draft-acts.ts:31` | - |
| `AutomationStudioFlowBootstrapDraftBasis` | Type | `packages/fluxiq/src/programs/automation-studio/runtime/flow-bootstrap/draft-reduction.ts:38` | Where a reduced draft's steps came from. |
| `automationStudioFlowBootstrapDraftNodeStep` | Value | `packages/fluxiq/src/programs/automation-studio/runtime/llm/node-tools/draft-step.ts:44` | - |
| `AutomationStudioFlowBootstrapDraftReduction` | Type | `packages/fluxiq/src/programs/automation-studio/runtime/flow-bootstrap/draft-reduction.ts:44` | - |
| `automationStudioFlowBootstrapDraftStepGoesToLocation` | Value | `packages/fluxiq/src/programs/automation-studio/runtime/flow-bootstrap/reachability/step-goes-to-location.ts:20` | - |
| `automationStudioFlowBootstrapDraftStepIsWritable` | Value | `packages/fluxiq/src/programs/automation-studio/runtime/llm/node-tools/draft-step.ts:104` | - |
| `automationStudioFlowBootstrapDraftWithStartStep` | Value | `packages/fluxiq/src/programs/automation-studio/runtime/flow-bootstrap/reachability/start-step.ts:59` | - |
| `AutomationStudioFlowBootstrapDraftWithStartStep` | Type | `packages/fluxiq/src/programs/automation-studio/runtime/flow-bootstrap/reachability/start-step.ts:42` | A draft as completion should build it, and the step it had to keep, if any. |
| `AutomationStudioFlowBootstrapEdge` | Type | `packages/fluxiq/src/programs/automation-studio/runtime/flow-bootstrap/plan/contracts.ts:30` | - |
| `AutomationStudioFlowBootstrapEvidenceStep` | Type | `packages/fluxiq/src/programs/automation-studio/runtime/flow-bootstrap/evidence-loop-steps.ts:64` | One decision as a step: identifiers, counts, a boolean and a code, and nothing else. |
| `automationStudioFlowBootstrapEvidenceSteps` | Value | `packages/fluxiq/src/programs/automation-studio/runtime/flow-bootstrap/evidence-loop-steps.ts:218` | - |
| `AutomationStudioFlowBootstrapEvidenceTraceRow` | Type | `packages/fluxiq/src/programs/automation-studio/runtime/flow-bootstrap/evidence-loop-steps.ts:61` | A trace row as a reader of the loop's record sees one. `at` -- the moment the row was recorded, in epoch milliseconds -- was first declared here rather than on the loop's trace type, on the reasoning that a timestamp is a diagnostic and the loop's type is the contract its callers build against. **That is exactly why nothing ever wrote one.** The loop is the only thing that knows when a row happened, and a field the loop's own type does not have is a field the loop cannot push: `run-mug776kx-0214b287` published 41 rows and 0 of them carried a moment, so its 695 seconds stayed one undivided gap in which a ten-minute stall and forty seventeen-second steps look identical. It now lives on `AutomationStudioLlmEvidenceLoopTrace` and the loop stamps every row it pushes. The intersection is kept because it is what every reader of a *stored* row names, and because it still says the true thing: a row from before the loop stamped them carries none, and a reader without one falls back to ordering by `iteration`. |
| `automationStudioFlowBootstrapFailedBuilds` | Value | `packages/fluxiq/src/programs/automation-studio/runtime/flow-bootstrap/generation-failure/failed-builds.ts:21` | - |
| `AutomationStudioFlowBootstrapFailedBuilds` | Type | `packages/fluxiq/src/programs/automation-studio/runtime/flow-bootstrap/generation-failure/failed-builds.ts:14` | The latest failed build of each recent Flow. |
| `AutomationStudioFlowBootstrapFailureDiagnostic` | Type | `packages/fluxiq/src/programs/automation-studio/runtime/flow-bootstrap/generation-failure/diagnostic.ts:19` | - |
| `automationStudioFlowBootstrapFailureDiagnosticOf` | Value | `packages/fluxiq/src/programs/automation-studio/runtime/flow-bootstrap/generation-failure/phase-failure.ts:118` | - |
| `AutomationStudioFlowBootstrapFailureStage` | Type | `packages/fluxiq/src/programs/automation-studio/runtime/flow-bootstrap/generation-failure/codes.ts:9` | - |
| `automationStudioFlowBootstrapFailureState` | Value | `packages/fluxiq/src/programs/automation-studio/runtime/flow-bootstrap/generation-failure/failure-state.ts:153` | - |
| `AutomationStudioFlowBootstrapFailureState` | Type | `packages/fluxiq/src/programs/automation-studio/runtime/flow-bootstrap/generation-failure/failure-state.ts:41` | The state a diagnostic with a given code and stage carries. `accounting` is what the record may hold rather than what it does: `required` for the harness refusals whose only trace of the call is its accounting, `absent` where naming a cost would claim a call that was not costed, and `optional` everywhere the harness may attach it and a phase failure may not. |
| `AutomationStudioFlowBootstrapGenerationError` | Class | `packages/fluxiq/src/programs/automation-studio/runtime/flow-bootstrap/generation-failure/error.ts:10` | - |
| `AutomationStudioFlowBootstrapGenerationReadiness` | Type | `packages/fluxiq/src/programs/automation-studio/api/contracts/adaptation.ts:4` | - |
| `AutomationStudioFlowBootstrapIncompleteDraft` | Type | `packages/fluxiq/src/programs/automation-studio/runtime/flow-bootstrap/incomplete-draft/record.ts:22` | - |
| `automationStudioFlowBootstrapIncompleteDraftContinuation` | Value | `packages/fluxiq/src/programs/automation-studio/runtime/flow-bootstrap/incomplete-draft/continuation.ts:24` | - |
| `AutomationStudioFlowBootstrapIncompleteDraftContinuation` | Type | `packages/fluxiq/src/programs/automation-studio/runtime/flow-bootstrap/incomplete-draft/continuation.ts:8` | What the evidence loop's `draft` is given to continue a stopped build. |
| `automationStudioFlowBootstrapIncompleteDraftKeeper` | Value | `packages/fluxiq/src/programs/automation-studio/runtime/flow-bootstrap/incomplete-draft/keeper.ts:67` | - |
| `AutomationStudioFlowBootstrapIncompleteDraftKeeper` | Type | `packages/fluxiq/src/programs/automation-studio/runtime/flow-bootstrap/incomplete-draft/keeper.ts:30` | - |
| `automationStudioFlowBootstrapIncompleteDraftKept` | Value | `packages/fluxiq/src/programs/automation-studio/runtime/flow-bootstrap/incomplete-draft/kept.ts:22` | - |
| `AutomationStudioFlowBootstrapIncompleteDraftPointer` | Type | `packages/fluxiq/src/programs/automation-studio/runtime/flow-bootstrap/incomplete-draft/keeper.ts:28` | What a failure says about the draft it kept (`generation-failure/diagnostic.ts`). |
| `AutomationStudioFlowBootstrapInstructionAsk` | Type | `packages/fluxiq/src/programs/automation-studio/runtime/flow-bootstrap/answerability/contracts.ts:25` | What the instruction plainly asks to be given back, read from its own words. |
| `automationStudioFlowBootstrapInstructionColumns` | Value | `packages/fluxiq/src/programs/automation-studio/runtime/flow-bootstrap/answerability/instruction-columns.ts:32` | - |
| `AutomationStudioFlowBootstrapIssue` | Type | `packages/fluxiq/src/programs/automation-studio/runtime/flow-bootstrap/plan/contracts.ts:134` | - |
| `automationStudioFlowBootstrapIssueFeedback` | Value | `packages/fluxiq/src/programs/automation-studio/runtime/flow-bootstrap/plan/issue-feedback.ts:119` | - |
| `AutomationStudioFlowBootstrapJudgement` | Type | `packages/fluxiq/src/programs/automation-studio/runtime/flow-bootstrap/unfinished-build/contracts.ts:96` | The judgement of a Flow a round left unfinished (phase 2): what the test did, and how much of what was asked the Flow does. Codes, counts and ids: what the repair is told, and what an ending is written from. |
| `automationStudioFlowBootstrapJudgementAdvanced` | Value | `packages/fluxiq/src/programs/automation-studio/runtime/flow-bootstrap/unfinished-build/judgement.ts:118` | - |
| `automationStudioFlowBootstrapJudgementValue` | Value | `packages/fluxiq/src/programs/automation-studio/runtime/flow-bootstrap/unfinished-build/judgement.ts:100` | - |
| `automationStudioFlowBootstrapJudgeUnfinished` | Value | `packages/fluxiq/src/programs/automation-studio/runtime/flow-bootstrap/unfinished-build/judgement.ts:51` | - |
| `automationStudioFlowBootstrapLargestSizeLimits` | Value | `packages/fluxiq/src/programs/automation-studio/runtime/flow-bootstrap/plan/size-limits.ts:98` | - |
| `AutomationStudioFlowBootstrapLastRoute` | Type | `packages/fluxiq/src/programs/automation-studio/runtime/flow-bootstrap/plan/routing-context.ts:54` | - |
| `AutomationStudioFlowBootstrapLimitExceeded` | Type | `packages/fluxiq/src/programs/automation-studio/runtime/flow-bootstrap/plan/profile-limits.ts:35` | One limit a completed result exceeded: which, its maximum, what it measured, where, and the setting it comes from when it does. |
| `AutomationStudioFlowBootstrapNameAssumption` | Type | `packages/fluxiq/src/programs/automation-studio/runtime/flow-bootstrap/plan/name-correction-assumption.ts:16` | - |
| `AutomationStudioFlowBootstrapNode` | Type | `packages/fluxiq/src/programs/automation-studio/runtime/flow-bootstrap/plan/contracts.ts:11` | - |
| `automationStudioFlowBootstrapNotDoable` | Value | `packages/fluxiq/src/programs/automation-studio/runtime/flow-bootstrap/unfinished-build/not-doable.ts:21` | - |
| `automationStudioFlowBootstrapNotDone` | Value | `packages/fluxiq/src/programs/automation-studio/runtime/flow-bootstrap/unfinished-build/not-done.ts:39` | - |
| `automationStudioFlowBootstrapNotDoneSaid` | Value | `packages/fluxiq/src/programs/automation-studio/runtime/flow-bootstrap/unfinished-build/not-done.ts:47` | - |
| `automationStudioFlowBootstrapOutputSchema` | Value | `packages/fluxiq/src/programs/automation-studio/runtime/flow-bootstrap/plan/output-schema.ts:14` | - |
| `AutomationStudioFlowBootstrapPermissionAsk` | Type | `packages/fluxiq/src/programs/automation-studio/runtime/flow-bootstrap/action-permissions.ts:104` | Where a build's permission question goes, and where its answer comes back from. |
| `automationStudioFlowBootstrapPersonNeeded` | Value | `packages/fluxiq/src/programs/automation-studio/runtime/flow-bootstrap/person-needed.ts:76` | - |
| `AutomationStudioFlowBootstrapPersonNeeded` | Type | `packages/fluxiq/src/programs/automation-studio/runtime/flow-bootstrap/person-needed.ts:60` | - |
| `AutomationStudioFlowBootstrapPhaseFailureCode` | Type | `packages/fluxiq/src/programs/automation-studio/runtime/flow-bootstrap/generation-failure/codes.ts:199` | - |
| `AutomationStudioFlowBootstrapPlan` | Type | `packages/fluxiq/src/programs/automation-studio/runtime/flow-bootstrap/plan/contracts.ts:62` | - |
| `AutomationStudioFlowBootstrapPlanLocations` | Type | `packages/fluxiq/src/programs/automation-studio/runtime/flow-bootstrap/reachability/contracts.ts:27` | What the Flow a build wrote does about where it starts, read off the plan. |
| `AutomationStudioFlowBootstrapPlanParameterResolution` | Type | `packages/fluxiq/src/programs/automation-studio/runtime/llm/harness-options/plan-parameter-resolution.ts:60` | - |
| `AutomationStudioFlowBootstrapPlanRecordSets` | Type | `packages/fluxiq/src/programs/automation-studio/runtime/flow-bootstrap/answerability/contracts.ts:35` | What the Flow a build wrote can do with a set of records, read off the plan. |
| `AutomationStudioFlowBootstrapPlanSource` | Type | `packages/fluxiq/src/programs/automation-studio/runtime/flow-bootstrap/plan/profile-limits.ts:49` | Where the plan came from. `reply`: the model wrote it, and the one-reply limits apply. `draft`: Core assembled it from the steps the build ran, and the Flow's own limits apply. |
| `automationStudioFlowBootstrapProgressSaid` | Value | `packages/fluxiq/src/programs/automation-studio/runtime/flow-bootstrap/unfinished-build/not-done.ts:105` | - |
| `automationStudioFlowBootstrapProviderStatus` | Value | `packages/fluxiq/src/programs/automation-studio/runtime/flow-bootstrap/generation-failure/failure-state.ts:221` | - |
| `automationStudioFlowBootstrapProviderUnavailable` | Value | `packages/fluxiq/src/programs/automation-studio/runtime/flow-bootstrap/unfinished-build/provider-unavailable.ts:27` | - |
| `AutomationStudioFlowBootstrapReachability` | Type | `packages/fluxiq/src/programs/automation-studio/runtime/flow-bootstrap/reachability/contracts.ts:43` | Whether the plan may be proposed, or what the model is told instead. A refusal is not the end of a build. It is fed back exactly as a refused parameter is, and the exploration asks again on the same budget, cost and no-progress guards -- so nothing here can spin. |
| `automationStudioFlowBootstrapRecordOutputContract` | Value | `packages/fluxiq/src/programs/automation-studio/runtime/flow-bootstrap/plan/record-output-contract.ts:99` | - |
| `AutomationStudioFlowBootstrapRecordOutputContract` | Type | `packages/fluxiq/src/programs/automation-studio/runtime/flow-bootstrap/plan/record-output-contract.ts:43` | - |
| `automationStudioFlowBootstrapRecordOutputIssues` | Value | `packages/fluxiq/src/programs/automation-studio/runtime/flow-bootstrap/plan/record-output-contract.ts:91` | - |
| `automationStudioFlowBootstrapRepairSeed` | Value | `packages/fluxiq/src/programs/automation-studio/runtime/flow-bootstrap/unfinished-build/judgement.ts:35` | - |
| `automationStudioFlowBootstrapRepliesUnreadable` | Value | `packages/fluxiq/src/programs/automation-studio/runtime/flow-bootstrap/unfinished-build/replies-unreadable.ts:23` | - |
| `AutomationStudioFlowBootstrapRisk` | Type | `packages/fluxiq/src/programs/automation-studio/runtime/flow-bootstrap/plan/contracts.ts:9` | - |
| `automationStudioFlowBootstrapRoundEnding` | Value | `packages/fluxiq/src/programs/automation-studio/runtime/flow-bootstrap/unfinished-build/round-ending.ts:24` | - |
| `AutomationStudioFlowBootstrapRoundEnding` | Type | `packages/fluxiq/src/programs/automation-studio/runtime/flow-bootstrap/unfinished-build/contracts.ts:34` | How one live round ended, read for what the build does next. |
| `AutomationStudioFlowBootstrapRoundProgress` | Type | `packages/fluxiq/src/programs/automation-studio/runtime/flow-bootstrap/unfinished-build/contracts.ts:26` | What a stopped round had recorded: its rows and what it spent. |
| `AutomationStudioFlowBootstrapRoundRequest` | Type | `packages/fluxiq/src/programs/automation-studio/runtime/flow-bootstrap/unfinished-build/phases.ts:88` | What one live round is given. |
| `AutomationStudioFlowBootstrapRouteCondition` | Type | `packages/fluxiq/src/programs/automation-studio/runtime/flow-bootstrap/plan/route-condition.ts:52` | A route's condition: Core's `AutomationConditionExpression`, narrowed to the operators the router evaluates, JSON values, and the three plain groups. Every value of it is an `AutomationConditionExpression`. |
| `automationStudioFlowBootstrapRouteIssues` | Value | `packages/fluxiq/src/programs/automation-studio/runtime/flow-bootstrap/plan/route-validation.ts:20` | - |
| `AutomationStudioFlowBootstrapRoutePath` | Type | `packages/fluxiq/src/programs/automation-studio/runtime/flow-bootstrap/plan/routing-context.ts:23` | - |
| `AutomationStudioFlowBootstrapRouter` | Type | `packages/fluxiq/src/programs/automation-studio/runtime/flow-bootstrap/plan/contracts.ts:44` | - |
| `AutomationStudioFlowBootstrapRouteSituation` | Type | `packages/fluxiq/src/programs/automation-studio/runtime/flow-bootstrap/plan/routing-context.ts:33` | - |
| `AutomationStudioFlowBootstrapRouteTest` | Type | `packages/fluxiq/src/programs/automation-studio/runtime/flow-bootstrap/plan/route-condition.ts:41` | One test a route makes: a path, an operator, and the value it is tested against. |
| `AutomationStudioFlowBootstrapRoutingContext` | Type | `packages/fluxiq/src/programs/automation-studio/runtime/flow-bootstrap/plan/routing-context.ts:62` | - |
| `automationStudioFlowBootstrapSizeLimits` | Value | `packages/fluxiq/src/programs/automation-studio/runtime/flow-bootstrap/plan/size-limits.ts:45` | - |
| `AutomationStudioFlowBootstrapSizeLimits` | Type | `packages/fluxiq/src/programs/automation-studio/runtime/flow-bootstrap/plan/size-limits.ts:19` | Every size bound on one Flow, from its setting. |
| `automationStudioFlowBootstrapSizeLimitsOf` | Value | `packages/fluxiq/src/programs/automation-studio/runtime/flow-bootstrap/plan/size-limits.ts:62` | - |
| `automationStudioFlowBootstrapSizeLimitsOfContext` | Value | `packages/fluxiq/src/programs/automation-studio/runtime/flow-bootstrap/plan/size-limits.ts:109` | - |
| `automationStudioFlowBootstrapSizeRefusal` | Value | `packages/fluxiq/src/programs/automation-studio/runtime/flow-bootstrap/plan/size-limits.ts:82` | - |
| `automationStudioFlowBootstrapSizeSetting` | Value | `packages/fluxiq/src/programs/automation-studio/runtime/flow-bootstrap/plan/size-limits.ts:70` | - |
| `AutomationStudioFlowBootstrapSizeSetting` | Type | `packages/fluxiq/src/programs/automation-studio/runtime/flow-bootstrap/plan/size-limits.ts:67` | The setting a size bound comes from, as a refusal names it: where it is stored, where a person changes it, and its value. |
| `automationStudioFlowBootstrapStopSaid` | Value | `packages/fluxiq/src/programs/automation-studio/runtime/flow-bootstrap/unfinished-build/not-done.ts:123` | - |
| `AutomationStudioFlowBootstrapSubflow` | Type | `packages/fluxiq/src/programs/automation-studio/runtime/flow-bootstrap/plan/contracts.ts:36` | - |
| `automationStudioFlowBootstrapSuppliedRecordsPath` | Value | `packages/fluxiq/src/programs/automation-studio/runtime/flow-bootstrap/plan/record-output-contract.ts:67` | - |
| `AutomationStudioFlowBootstrapTested` | Type | `packages/fluxiq/src/programs/automation-studio/runtime/flow-bootstrap/unfinished-build/contracts.ts:89` | What the test of the Flow so far found. |
| `automationStudioFlowBootstrapTestSaid` | Value | `packages/fluxiq/src/programs/automation-studio/runtime/flow-bootstrap/unfinished-build/not-done.ts:82` | - |
| `AutomationStudioFlowBootstrapUnfinishedStall` | Class | `packages/fluxiq/src/programs/automation-studio/runtime/flow-bootstrap/unfinished-build/unfinished-stall.ts:14` | - |
| `AutomationStudioFlowBootstrapUnfinishedStop` | Type | `packages/fluxiq/src/programs/automation-studio/runtime/flow-bootstrap/unfinished-build/contracts.ts:16` | Why a live round stopped without the model saying the Flow was ready, where no budget was the reason. |
| `AutomationStudioFlowBootstrapUnfinishedTest` | Type | `packages/fluxiq/src/programs/automation-studio/runtime/flow-bootstrap/unfinished-build/judgement.ts:28` | What the caller's test answers: the loop's dry-run gate, over the steps it is given. |
| `automationStudioFlowBootstrapUnreadColumnsSentence` | Value | `packages/fluxiq/src/programs/automation-studio/runtime/flow-bootstrap/authoring/instruction-record-columns.ts:68` | - |
| `AutomationStudioFlowBuildPlan` | Type | `packages/fluxiq/src/programs/automation-studio/runtime/flow-bootstrap/plan/contracts.ts:149` | Registry-validated, Core-risked and deterministically laid-out plan accepted by Bootstrap Adaptations. |
| `AutomationStudioFlowCatalogEntry` | Type | `packages/fluxiq/src/programs/automation-studio/model/flow-compatibility.ts:9` | - |
| `AutomationStudioFlowChangeEntryPoint` | Type | `packages/fluxiq/src/programs/automation-studio/model/flow-adaptation.ts:386` | Which of the three ways into the flow-improvement loop produced a change. |
| `automationStudioFlowChangeFailureState` | Value | `packages/fluxiq/src/programs/automation-studio/runtime/flow-change/trial.ts:115` | - |
| `AutomationStudioFlowChangeOrigin` | Type | `packages/fluxiq/src/programs/automation-studio/model/flow-adaptation.ts:395` | Where a change came from, whichever entry point produced it. A Flow adaptation keeps it at `metadata.origin`, which the typed store saves whole, so it needs no migration; a Flow Bootstrap adaptation keeps it at `origin`. Ids and Core failure signatures only, never page text or values. `parseAutomationStudioFlowChangeOrigin` is the only reader of a stored one. |
| `AutomationStudioFlowChangeProposal` | Type | `packages/fluxiq/src/programs/automation-studio/model/flow-adaptation.ts:209` | - |
| `AutomationStudioFlowChangeTrialReport` | Type | `packages/fluxiq/src/programs/automation-studio/runtime/flow-change/trial.ts:59` | - |
| `AutomationStudioFlowChangeTrialRequest` | Type | `packages/fluxiq/src/programs/automation-studio/runtime/flow-change/trial.ts:33` | - |
| `AutomationStudioFlowChangeValidationKind` | Type | `packages/fluxiq/src/programs/automation-studio/model/flow-adaptation.ts:407` | How a validation result was observed: a `trial` of the candidate on the live page before it was saved, or a `replay`, a later run that exercised the applied change with no model call. A result written before kinds existed has none and reads as `trial`. A structural check is never a validation result; it stays in `metadata.structuralChecks`. |
| `AutomationStudioFlowCompilation` | Type | `packages/fluxiq/src/programs/automation-studio/dsl/contracts.ts:54` | - |
| `AutomationStudioFlowCompilerDiagnostic` | Type | `packages/fluxiq/src/programs/automation-studio/dsl/contracts.ts:36` | - |
| `AutomationStudioFlowDefinition` | Type | `packages/fluxiq/src/programs/automation-studio/dsl/contracts.ts:16` | Declarative input accepted by defineFlow. It contains data, never callbacks. |
| `AutomationStudioFlowDefinitionMetadata` | Type | `packages/fluxiq/src/programs/automation-studio/dsl/contracts.ts:7` | Framework-owned identity fields that must survive the generated-source round trip. |
| `AutomationStudioFlowDependency` | Type | `packages/fluxiq/src/programs/automation-studio/dsl/contracts.ts:4` | - |
| `AutomationStudioFlowDocument` | Type | `packages/fluxiq/src/programs/automation-studio/model/artifacts.ts:33` | - |
| `automationStudioFlowDraft` | Value | `packages/fluxiq/src/programs/automation-studio/runtime/flow-draft/draft.ts:21` | - |
| `AutomationStudioFlowDraft` | Type | `packages/fluxiq/src/programs/automation-studio/runtime/flow-draft/draft.ts:14` | - |
| `AutomationStudioFlowDraftAmendment` | Type | `packages/fluxiq/src/programs/automation-studio/runtime/flow-draft/amendment.ts:77` | One edit to one step of the draft. |
| `AutomationStudioFlowDraftAmendmentChange` | Type | `packages/fluxiq/src/programs/automation-studio/runtime/flow-draft/amendment.ts:71` | - |
| `AutomationStudioFlowDraftAmendmentRefusal` | Type | `packages/fluxiq/src/programs/automation-studio/runtime/flow-draft/amendment.ts:122` | Why one amendment changed nothing -- or, for `act_on_a_read`, the one part of it that was not done: the act a read cannot do, beside the rest, which was. |
| `automationStudioFlowDraftClaimAct` | Value | `packages/fluxiq/src/programs/automation-studio/runtime/flow-draft/act-claim.ts:17` | - |
| `automationStudioFlowDraftConditionalStepIds` | Value | `packages/fluxiq/src/programs/automation-studio/runtime/flow-draft/routing.ts:115` | - |
| `AutomationStudioFlowDraftDryRun` | Type | `packages/fluxiq/src/programs/automation-studio/runtime/flow-draft/dry-run.ts:165` | One whole replay of the draft. |
| `automationStudioFlowDraftDryRunFeedback` | Value | `packages/fluxiq/src/programs/automation-studio/runtime/flow-draft/dry-run.ts:314` | - |
| `automationStudioFlowDraftDryRunGate` | Value | `packages/fluxiq/src/programs/automation-studio/runtime/llm/node-tools/dry-run-gate.ts:74` | - |
| `AutomationStudioFlowDraftDryRunGateInput` | Type | `packages/fluxiq/src/programs/automation-studio/runtime/llm/node-tools/dry-run-gate.ts:43` | - |
| `automationStudioFlowDraftDryRunIssueCodes` | Value | `packages/fluxiq/src/programs/automation-studio/runtime/flow-draft/dry-run.ts:262` | - |
| `AutomationStudioFlowDraftDryRunRefusal` | Type | `packages/fluxiq/src/programs/automation-studio/runtime/llm/node-tools/dry-run-gate.ts:41` | What a gate answers. `undefined` is the only way past it: either the draft replayed clean, or it is not a draft this gate applies to. The other two each end or interrupt the completion the loop was about to accept. |
| `automationStudioFlowDraftDryRunVerdict` | Value | `packages/fluxiq/src/programs/automation-studio/runtime/flow-draft/dry-run.ts:225` | - |
| `automationStudioFlowDraftEntry` | Value | `packages/fluxiq/src/programs/automation-studio/runtime/flow-draft/entry.ts:53` | - |
| `AutomationStudioFlowDraftFlowSeed` | Type | `packages/fluxiq/src/programs/automation-studio/runtime/llm/node-tools/draft-from-flow.ts:84` | A Flow read back as a draft: the steps, and which node each one stands for. The map is the half that makes this an edit rather than a replacement. A draft step carries no node id -- it is a record of an action, and an action has no id in a graph -- so the correspondence is kept beside the steps and travels with them to whoever materialises the amended draft (`automationStudioFlowDraftPlanNodeIds`). |
| `automationStudioFlowDraftKeepOpeners` | Value | `packages/fluxiq/src/programs/automation-studio/runtime/flow-draft/opener.ts:30` | - |
| `automationStudioFlowDraftPlanNodeIds` | Value | `packages/fluxiq/src/programs/automation-studio/runtime/llm/node-tools/draft-from-flow.ts:149` | - |
| `automationStudioFlowDraftPrecedingProposedStep` | Value | `packages/fluxiq/src/programs/automation-studio/runtime/flow-draft/routing.ts:152` | - |
| `automationStudioFlowDraftProposedSteps` | Value | `packages/fluxiq/src/programs/automation-studio/runtime/flow-draft/draft.ts:26` | - |
| `automationStudioFlowDraftReplayable` | Value | `packages/fluxiq/src/programs/automation-studio/runtime/flow-draft/dry-run.ts:186` | - |
| `automationStudioFlowDraftReplayClearedCode` | Value | `packages/fluxiq/src/programs/automation-studio/runtime/llm/node-tools/replay-draft.ts:91` | - |
| `automationStudioFlowDraftReplayFrom` | Value | `packages/fluxiq/src/programs/automation-studio/runtime/flow-draft/dry-run.ts:194` | - |
| `AutomationStudioFlowDraftReplayInput` | Type | `packages/fluxiq/src/programs/automation-studio/runtime/llm/node-tools/replay-draft.ts:58` | What the caller has to lend a replay: the executor. |
| `AutomationStudioFlowDraftReplayMode` | Type | `packages/fluxiq/src/programs/automation-studio/runtime/flow-draft/verify-only.ts:98` | Whether a replay runs a step again or only checks it. |
| `AutomationStudioFlowDraftReplayOutcome` | Type | `packages/fluxiq/src/programs/automation-studio/runtime/flow-draft/dry-run.ts:119` | One step's answer to being run again. |
| `automationStudioFlowDraftReplayOutcomeBlocks` | Value | `packages/fluxiq/src/programs/automation-studio/runtime/flow-draft/dry-run.ts:249` | - |
| `automationStudioFlowDraftReplayOutcomeKey` | Value | `packages/fluxiq/src/programs/automation-studio/runtime/flow-draft/dry-run.ts:257` | - |
| `automationStudioFlowDraftReplayOutcomeVerified` | Value | `packages/fluxiq/src/programs/automation-studio/runtime/flow-draft/verify-only.ts:138` | - |
| `automationStudioFlowDraftReplayOutcomeWord` | Value | `packages/fluxiq/src/programs/automation-studio/runtime/flow-draft/verify-only.ts:149` | - |
| `AutomationStudioFlowDraftReplayResult` | Type | `packages/fluxiq/src/programs/automation-studio/runtime/llm/node-tools/replay-draft.ts:67` | A replay, and the one piece of evidence worth showing the model afterwards. |
| `automationStudioFlowDraftReplaySignature` | Value | `packages/fluxiq/src/programs/automation-studio/runtime/flow-draft/dry-run.ts:208` | - |
| `AutomationStudioFlowDraftReplayStatus` | Type | `packages/fluxiq/src/programs/automation-studio/runtime/flow-draft/dry-run.ts:105` | - |
| `automationStudioFlowDraftRoutingReferences` | Value | `packages/fluxiq/src/programs/automation-studio/runtime/flow-draft/routing.ts:86` | - |
| `automationStudioFlowDraftSeedFromFlow` | Value | `packages/fluxiq/src/programs/automation-studio/runtime/llm/node-tools/draft-from-flow.ts:98` | - |
| `automationStudioFlowDraftSometimesPresentStepIds` | Value | `packages/fluxiq/src/programs/automation-studio/runtime/flow-draft/sometimes-present.ts:47` | - |
| `AutomationStudioFlowDraftStep` | Type | `packages/fluxiq/src/programs/automation-studio/runtime/flow-draft/step.ts:62` | - |
| `automationStudioFlowDraftStepById` | Value | `packages/fluxiq/src/programs/automation-studio/runtime/flow-draft/routing.ts:78` | - |
| `AutomationStudioFlowDraftStepDisposition` | Type | `packages/fluxiq/src/programs/automation-studio/runtime/flow-draft/step.ts:60` | What the model has since said about a step it took. `taken` is where every step the model runs starts when the model authors the draft (user, 2026-09-30: "IT SHOULD NOT JUST BLINDLY ADD EACH STEP THAT IT TOOK ONE BY ONE IN ORDER"): the step ran and is evidence, and it is not in the Flow until the model adds it -- `add` on the call itself, or an `add` amendment naming it (`./amendment.ts`). `kept` is a step the model put in the Flow; it is also where every step started under the older transcript rule, which a loop can still be run under to replay a build recorded before (`../llm/loop-configuration.ts`, `draftAuthoring`). The other two are the model's own withdrawals: `dropped` is "this should not be in the result at all", and `exploratory` is "I did this to look around". They are held apart because they are different statements about one step, and a reader of the draft can tell a step that was a mistake from one that was a detour, and both from one the model has simply not added. |
| `AutomationStudioFlowDraftStepEffect` | Type | `packages/fluxiq/src/programs/automation-studio/runtime/flow-draft/step.ts:41` | Whether a step only read the state or changed it. The same two words the evidence loop's tool table and the exploration reducer use, deliberately: a second vocabulary for the same distinction is how the two come to disagree about one action. |
| `automationStudioFlowDraftStepId` | Value | `packages/fluxiq/src/programs/automation-studio/runtime/flow-draft/routing.ts:73` | - |
| `automationStudioFlowDraftStepIsAction` | Value | `packages/fluxiq/src/programs/automation-studio/runtime/flow-draft/step.ts:217` | - |
| `automationStudioFlowDraftStepIsProposable` | Value | `packages/fluxiq/src/programs/automation-studio/runtime/flow-draft/step.ts:201` | - |
| `automationStudioFlowDraftStepIsProposed` | Value | `packages/fluxiq/src/programs/automation-studio/runtime/flow-draft/step.ts:188` | - |
| `automationStudioFlowDraftStepMovedTarget` | Value | `packages/fluxiq/src/programs/automation-studio/runtime/flow-draft/verify-only.ts:170` | - |
| `AutomationStudioFlowDraftStepReplay` | Type | `packages/fluxiq/src/programs/automation-studio/runtime/flow-draft/dry-run.ts:116` | What a step carries so it can be run again. Both fields are the caller's own and Core reads neither. `from` is how to put the target back the way this step found it; only the first proposed step's is ever used, because that is where a replay starts. `produced` is what the step produced, handed back to the caller on the replay so it -- not Core -- can say whether the replay reproduced it. |
| `automationStudioFlowDraftStepReplayMode` | Value | `packages/fluxiq/src/programs/automation-studio/runtime/flow-draft/verify-only.ts:113` | - |
| `AutomationStudioFlowDraftStepRouting` | Type | `packages/fluxiq/src/programs/automation-studio/runtime/flow-draft/routing.ts:50` | What one step says about when it runs, and what runs with it. Each id names another step of the same draft. An id that names no proposed step makes the statement unusable, which the assembler reports rather than silently ignoring: a Flow that quietly lost its recovery edge looks exactly like a Flow that never had one. |
| `AutomationStudioFlowDraftStepRoutingKind` | Type | `packages/fluxiq/src/programs/automation-studio/runtime/flow-draft/routing.ts:40` | - |
| `automationStudioFlowDraftStepWithholdsLater` | Value | `packages/fluxiq/src/programs/automation-studio/runtime/flow-draft/verify-only.ts:185` | - |
| `automationStudioFlowDraftWithheldStepIds` | Value | `packages/fluxiq/src/programs/automation-studio/runtime/flow-draft/verify-only.ts:160` | - |
| `AutomationStudioFlowDraftWrittenStep` | Type | `packages/fluxiq/src/programs/automation-studio/runtime/flow-bootstrap/authoring/assemble-draft.ts:42` | One draft step as a written step, in the caller's own vocabulary. |
| `AutomationStudioFlowEdge` | Type | `packages/fluxiq/src/programs/automation-studio/model/artifacts.ts:22` | - |
| `AutomationStudioFlowErrorDefinition` | Type | `packages/fluxiq/src/programs/automation-studio/model/flows.ts:148` | - |
| `AutomationStudioFlowExecutionDefaults` | Type | `packages/fluxiq/src/programs/automation-studio/model/flows.ts:163` | - |
| `AutomationStudioFlowExpansionFixture` | Type | `packages/fluxiq/src/programs/automation-studio/model/fixtures/flow-expansion.ts:14` | - |
| `AutomationStudioFlowExpansionInventory` | Type | `packages/fluxiq/src/programs/automation-studio/model/flow-adaptation.ts:489` | - |
| `AutomationStudioFlowExpansionReferences` | Type | `packages/fluxiq/src/programs/automation-studio/model/flow-adaptation.ts:478` | - |
| `AutomationStudioFlowExpansionStatus` | Type | `packages/fluxiq/src/programs/automation-studio/model/flow-adaptation.ts:8` | - |
| `AutomationStudioFlowGraphJudgement` | Type | `packages/fluxiq/src/programs/automation-studio/runtime/flow-version/contracts.ts:58` | A verdict, bound to the versions it judged. `status` is exactly `automationStudioResultVerificationStatus`'s four words and `code` the verdict's own code, so a reader of a row sees the same judgement the run's record shows. `instructionDigest` is `null` where the request was never read -- a verdict Core settled from its own arithmetic asks no model and reads no instruction -- and a null digest matches nothing, which keeps an unknown question from being compared against a known one. |
| `AutomationStudioFlowGraphJudgementRecord` | Type | `packages/fluxiq/src/programs/automation-studio/storage/project/graph-judgement-store.ts:15` | One verdict, about one graph Flow at one revision, reached by one run. |
| `AutomationStudioFlowGraphJudgementStatus` | Type | `packages/fluxiq/src/programs/automation-studio/storage/project/graph-judgement-store.ts:12` | - |
| `AutomationStudioFlowGraphJudgementWrite` | Type | `packages/fluxiq/src/programs/automation-studio/storage/project/graph-judgement-store.ts:27` | What one run's verdict is written as: the verdict once, against every version it judged. |
| `automationStudioFlowGraphSection` | Value | `packages/fluxiq/src/programs/automation-studio/runtime/recovery/repair-context/flow-graph.ts:42` | - |
| `automationStudioFlowGraphVersion` | Value | `packages/fluxiq/src/programs/automation-studio/runtime/flow-version/flow-graph-version.ts:18` | - |
| `AutomationStudioFlowGraphVersion` | Type | `packages/fluxiq/src/programs/automation-studio/runtime/flow-version/contracts.ts:37` | One graph Flow, at the revision a run executed it at. `graphFlowId` is the `flows` row whose `graph_revisions` chain this names -- the orchestration Flow for the parent entry, and the Subflow's own graph Flow for a Subflow the router entered. They are siblings, not parent and child: each has its own revision counter, so a repair that rewrites one Subflow's graph moves that graph's number and moves nothing else. |
| `AutomationStudioFlowHierarchyCategorySummary` | Type | `packages/fluxiq/src/programs/automation-studio/storage/file-store.ts:76` | - |
| `AutomationStudioFlowHierarchySubflowSummary` | Type | `packages/fluxiq/src/programs/automation-studio/storage/file-store.ts:69` | - |
| `AutomationStudioFlowInstruction` | Type | `packages/fluxiq/src/programs/automation-studio/model/flow-adaptation.ts:119` | - |
| `automationStudioFlowInstructionDigest` | Value | `packages/fluxiq/src/programs/automation-studio/runtime/flow-version/instruction-digest.ts:28` | - |
| `AutomationStudioFlowInterface` | Type | `packages/fluxiq/src/programs/automation-studio/model/flows.ts:143` | - |
| `AutomationStudioFlowIntervention` | Type | `packages/fluxiq/src/programs/automation-studio/model/flow-adaptation.ts:304` | - |
| `AutomationStudioFlowInterventionSummary` | Type | `packages/fluxiq/src/programs/automation-studio/model/flow-adaptation.ts:238` | - |
| `AutomationStudioFlowLegacyProvenance` | Type | `packages/fluxiq/src/programs/automation-studio/model/flows.ts:185` | Retains source identity when a legacy task or routine is later adapted/migrated. |
| `automationStudioFlowMaxNodesPerSubflow` | Value | `packages/fluxiq/src/programs/automation-studio/model/flow-size/flow-size-settings.ts:52` | - |
| `AutomationStudioFlowMigrationInspection` | Type | `packages/fluxiq/src/programs/automation-studio/runtime/service/legacy/migration-inspection.ts:8` | - |
| `AutomationStudioFlowMigrationLedger` | Type | `packages/fluxiq/src/programs/automation-studio/model/flows.ts:330` | Durable audit record for an explicit, non-destructive legacy Flow migration. |
| `AutomationStudioFlowMigrationOutcome` | Type | `packages/fluxiq/src/programs/automation-studio/model/flows.ts:319` | - |
| `AutomationStudioFlowMigrationRollbackPlan` | Type | `packages/fluxiq/src/programs/automation-studio/model/legacy-retirement.ts:81` | - |
| `AutomationStudioFlowNode` | Type | `packages/fluxiq/src/programs/automation-studio/model/artifacts.ts:10` | - |
| `AutomationStudioFlowOrigin` | Type | `packages/fluxiq/src/programs/automation-studio/model/flows.ts:19` | - |
| `AutomationStudioFlowOwnerKind` | Type | `packages/fluxiq/src/programs/automation-studio/model/artifacts.ts:8` | - |
| `AutomationStudioFlowPort` | Type | `packages/fluxiq/src/programs/automation-studio/model/flows.ts:133` | - |
| `AutomationStudioFlowPublication` | Type | `packages/fluxiq/src/programs/automation-studio/model/flows.ts:171` | - |
| `AutomationStudioFlowPublicationRecord` | Type | `packages/fluxiq/src/programs/automation-studio/model/composites.ts:31` | Mutable lifecycle metadata around an immutable published snapshot. |
| `AutomationStudioFlowRegion` | Type | `packages/fluxiq/src/programs/automation-studio/model/regions.ts:7` | - |
| `AutomationStudioFlowRegionHandoff` | Type | `packages/fluxiq/src/programs/automation-studio/model/regions.ts:18` | - |
| `AutomationStudioFlowRegionKind` | Type | `packages/fluxiq/src/programs/automation-studio/model/regions.ts:5` | - |
| `AutomationStudioFlowRegionPort` | Type | `packages/fluxiq/src/programs/automation-studio/model/regions.ts:6` | - |
| `automationStudioFlowRepresentationKind` | Value | `packages/fluxiq/src/programs/automation-studio/model/flows.ts:29` | - |
| `AutomationStudioFlowRepresentationKind` | Type | `packages/fluxiq/src/programs/automation-studio/model/flows.ts:22` | - |
| `AutomationStudioFlowResourceOffsetPage` | Type | `packages/fluxiq/src/programs/automation-studio/storage/project/flow-resource-repository.ts:9` | - |
| `AutomationStudioFlowResourcePage` | Type | `packages/fluxiq/src/programs/automation-studio/storage/project/flow-resource-repository.ts:8` | - |
| `AutomationStudioFlowRouteGroup` | Type | `packages/fluxiq/src/programs/automation-studio/model/flow-adaptation.ts:15` | - |
| `AutomationStudioFlowRouter` | Type | `packages/fluxiq/src/programs/automation-studio/model/flow-adaptation.ts:45` | - |
| `AutomationStudioFlowRouteRule` | Type | `packages/fluxiq/src/programs/automation-studio/model/flow-adaptation.ts:29` | - |
| `AutomationStudioFlowRunActionAttemptRecord` | Type | `packages/fluxiq/src/programs/automation-studio/model/flow-adaptation.ts:324` | - |
| `AutomationStudioFlowRunActionPage` | Type | `packages/fluxiq/src/programs/automation-studio/runtime/service.ts:305` | - |
| `AutomationStudioFlowRunDetail` | Type | `packages/fluxiq/src/programs/automation-studio/model/flow-adaptation.ts:355` | - |
| `AutomationStudioFlowRunRecoveryRecord` | Type | `packages/fluxiq/src/programs/automation-studio/model/flow-adaptation.ts:341` | - |
| `AutomationStudioFlowRunStatus` | Type | `packages/fluxiq/src/programs/automation-studio/model/flow-adaptation.ts:230` | - |
| `AutomationStudioFlowRunSummary` | Type | `packages/fluxiq/src/programs/automation-studio/model/flow-adaptation.ts:248` | - |
| `AutomationStudioFlowRunSummaryPage` | Type | `packages/fluxiq/src/programs/automation-studio/runtime/service/summaries/store.ts:45` | - |
| `AutomationStudioFlowScope` | Type | `packages/fluxiq/src/programs/automation-studio/model/flows.ts:12` | The workspace in which a canonical Flow is authored and may execute. |
| `AutomationStudioFlowScript` | Type | `packages/fluxiq/src/programs/automation-studio/runtime/flow-bootstrap/authoring/contracts.ts:93` | - |
| `AutomationStudioFlowScriptBlock` | Type | `packages/fluxiq/src/programs/automation-studio/runtime/flow-bootstrap/authoring/contracts.ts:82` | A block of steps: the main sequence, or a named subflow. |
| `AutomationStudioFlowScriptBranch` | Type | `packages/fluxiq/src/programs/automation-studio/runtime/flow-bootstrap/authoring/contracts.ts:20` | A branch from one of a step's output ports to a labelled step. |
| `AutomationStudioFlowScriptCondition` | Type | `packages/fluxiq/src/programs/automation-studio/runtime/flow-bootstrap/authoring/contracts.ts:73` | A `when:` or `unless:` line: when the router runs the block it sits in. |
| `AutomationStudioFlowScriptEntry` | Type | `packages/fluxiq/src/programs/automation-studio/runtime/flow-bootstrap/authoring/contracts.ts:10` | One `key: value` line inside a step, with its value already joined. |
| `AutomationStudioFlowScriptStep` | Type | `packages/fluxiq/src/programs/automation-studio/runtime/flow-bootstrap/authoring/contracts.ts:39` | - |
| `automationStudioFlowSizeSettingIssue` | Value | `packages/fluxiq/src/programs/automation-studio/model/flow-size/flow-size-settings.ts:40` | - |
| `AutomationStudioFlowSource` | Type | `packages/fluxiq/src/programs/automation-studio/model/flows.ts:59` | Controls which authoring surface owns the canonical Flow definition. |
| `AutomationStudioFlowSourceLocation` | Type | `packages/fluxiq/src/programs/automation-studio/dsl/contracts.ts:35` | - |
| `automationStudioFlowStartLocation` | Value | `packages/fluxiq/src/programs/automation-studio/runtime/flow-bootstrap/start-location.ts:49` | - |
| `AutomationStudioFlowSubflow` | Type | `packages/fluxiq/src/programs/automation-studio/model/flow-adaptation.ts:69` | - |
| `AutomationStudioFlowSummary` | Type | `packages/fluxiq/src/programs/automation-studio/storage/file-store.ts:81` | - |
| `AutomationStudioFlowSummaryIndex` | Type | `packages/fluxiq/src/programs/automation-studio/storage/file-store.ts:102` | - |
| `AutomationStudioFlowValueType` | Type | `packages/fluxiq/src/programs/automation-studio/model/flows.ts:122` | - |
| `AutomationStudioFlowVariable` | Type | `packages/fluxiq/src/programs/automation-studio/model/flows.ts:154` | - |
| `automationStudioFlowVersionsFromMetadata` | Value | `packages/fluxiq/src/programs/automation-studio/runtime/flow-version/stored-flow-versions.ts:14` | - |
| `AutomationStudioFlowVisibility` | Type | `packages/fluxiq/src/programs/automation-studio/model/flows.ts:17` | Public Flows are reusable composite-node candidates within their scope. |
| `AutomationStudioFrozenScope` | Type | `packages/fluxiq/src/programs/automation-studio/runtime/training-modes.ts:55` | - |
| `AutomationStudioGenerateFlowBootstrapAdaptationInput` | Type | `packages/fluxiq/src/programs/automation-studio/runtime/service/flow-bootstrap-commands/contracts.ts:8` | - |
| `AutomationStudioGenerateFlowBootstrapAdaptationResult` | Type | `packages/fluxiq/src/programs/automation-studio/runtime/service/flow-bootstrap-commands/contracts.ts:54` | - |
| `AutomationStudioGetProjectUiCacheRequest` | Type | `packages/fluxiq/src/programs/automation-studio/api/contracts/ui-cache.ts:19` | - |
| `AutomationStudioGetProjectUiCacheResponse` | Type | `packages/fluxiq/src/programs/automation-studio/api/contracts/ui-cache.ts:24` | - |
| `AutomationStudioGetReusableLlmContextRequest` | Type | `packages/fluxiq/src/programs/automation-studio/api/contracts/llm.ts:5` | - |
| `AutomationStudioGraphBoundaryEdge` | Type | `packages/fluxiq/src/programs/automation-studio/storage/project/graph-store.ts:19` | - |
| `AutomationStudioGraphBounds` | Type | `packages/fluxiq/src/programs/automation-studio/storage/project/graph-store.ts:13` | - |
| `AutomationStudioGraphCursorPage` | Type | `packages/fluxiq/src/programs/automation-studio/storage/project/graph-store.ts:33` | - |
| `AutomationStudioGraphEdgeRecord` | Type | `packages/fluxiq/src/programs/automation-studio/storage/project/graph-store.ts:15` | - |
| `AutomationStudioGraphExecutionOptions` | Type | `packages/fluxiq/src/programs/automation-studio/runtime/executor/contracts.ts:321` | - |
| `AutomationStudioGraphExecutionTrace` | Type | `packages/fluxiq/src/programs/automation-studio/runtime/executor/contracts.ts:256` | - |
| `AutomationStudioGraphNodeRecord` | Type | `packages/fluxiq/src/programs/automation-studio/storage/project/graph-store.ts:14` | - |
| `AutomationStudioGraphOperationRecord` | Type | `packages/fluxiq/src/programs/automation-studio/storage/project/graph-store.ts:18` | - |
| `AutomationStudioGraphPartitionRecord` | Type | `packages/fluxiq/src/programs/automation-studio/storage/project/graph-store.ts:16` | - |
| `AutomationStudioGraphPatchApplied` | Type | `packages/fluxiq/src/programs/automation-studio/storage/project/graph-store.ts:30` | - |
| `AutomationStudioGraphPatchConflict` | Type | `packages/fluxiq/src/programs/automation-studio/storage/project/graph-store.ts:31` | - |
| `AutomationStudioGraphPatchOperation` | Type | `packages/fluxiq/src/programs/automation-studio/storage/project/graph-store.ts:21` | - |
| `automationStudioGraphPatchRequestDigest` | Value | `packages/fluxiq/src/programs/automation-studio/storage/project/graph-store.ts:263` | - |
| `AutomationStudioGraphPatchResult` | Type | `packages/fluxiq/src/programs/automation-studio/storage/project/graph-store.ts:32` | - |
| `AutomationStudioGraphRevisionRecord` | Type | `packages/fluxiq/src/programs/automation-studio/storage/project/graph-store.ts:17` | - |
| `AutomationStudioGraphRunSeed` | Type | `packages/fluxiq/src/programs/automation-studio/runtime/executor/graph-run.ts:85` | What a run that parked on a question had, beyond what its trace holds, so the run that continues it is the same run rather than a second one. `route` is the way out of the parked node the answer chose. The node is not executed again: whatever it already did -- a dispatch, a record capture, a charge -- happened once, and repeating it is the difference between a gate and a dead end. |
| `AutomationStudioGraphRunStatus` | Type | `packages/fluxiq/src/programs/automation-studio/runtime/executor/contracts.ts:17` | - |
| `AutomationStudioGraphStoreBenchmark` | Type | `packages/fluxiq/src/programs/automation-studio/testing/scale-graph-store.ts:6` | - |
| `AutomationStudioGraphViewportPage` | Type | `packages/fluxiq/src/programs/automation-studio/storage/project/graph-store.ts:20` | - |
| `automationStudioHarnessInputWithDeniedEvidenceKeys` | Value | `packages/fluxiq/src/programs/automation-studio/runtime/llm/harness-options/binding.ts:333` | - |
| `AutomationStudioHarnessOption` | Type | `packages/fluxiq/src/programs/automation-studio/runtime/llm/harness-options/option.ts:54` | One registered action. The evidence-loop tool fields are the half the model ever sees; the rest is the gate, and is stripped before the option reaches a provider. |
| `AutomationStudioHarnessOptionBundle` | Type | `packages/fluxiq/src/programs/automation-studio/runtime/llm/harness-options/option.ts:94` | Declarations and implementations arrive together but are stored apart: the registry's browsing surface returns declarations only, so listing the options the loop may take never hands out host code. `domainId` absent means Core's own bundle. A domain bundle may only declare domain-scoped options and Core's may only declare unscoped ones, so a domain extends the set and can neither replace nor widen Core's half. |
| `automationStudioHarnessOptionBundleFromBinding` | Value | `packages/fluxiq/src/programs/automation-studio/runtime/llm/harness-options/binding.ts:349` | - |
| `AutomationStudioHarnessOptionExecution` | Type | `packages/fluxiq/src/programs/automation-studio/runtime/llm/harness-options/option.ts:62` | - |
| `AutomationStudioHarnessOptionHost` | Type | `packages/fluxiq/src/programs/automation-studio/runtime/llm/harness-options/host.ts:23` | - |
| `AutomationStudioHarnessOptionHostContext` | Type | `packages/fluxiq/src/programs/automation-studio/runtime/llm/harness-options/host.ts:16` | - |
| `AutomationStudioHarnessOptionImplementation` | Type | `packages/fluxiq/src/programs/automation-studio/runtime/llm/harness-options/option.ts:81` | - |
| `automationStudioHarnessOptionIssues` | Value | `packages/fluxiq/src/programs/automation-studio/runtime/llm/harness-options/option.ts:118` | - |
| `AutomationStudioHarnessOptionLoopBinding` | Type | `packages/fluxiq/src/programs/automation-studio/runtime/llm/harness-options/registry.ts:75` | - |
| `automationStudioHarnessOptionRegistry` | Value | `packages/fluxiq/src/programs/automation-studio/runtime/llm/harness-options/binding.ts:289` | - |
| `AutomationStudioHarnessOptionRegistry` | Class | `packages/fluxiq/src/programs/automation-studio/runtime/llm/harness-options/registry.ts:101` | - |
| `AutomationStudioHarnessOptionResolution` | Type | `packages/fluxiq/src/programs/automation-studio/runtime/llm/harness-options/registry.ts:48` | Everything that decides which options this call may be offered. `scope`, `runtimeCapabilities` and `permissions` are the node registry's resolution unchanged; `stage`, `policy` and `approvedOptionIds` are the dimensions an exploration call adds. |
| `AutomationStudioHarnessOptionSafety` | Type | `packages/fluxiq/src/programs/automation-studio/runtime/llm/harness-options/option.ts:43` | - |
| `AutomationStudioHarnessOptionSideEffect` | Type | `packages/fluxiq/src/programs/automation-studio/runtime/llm/harness-options/option.ts:41` | What running the option does beyond producing evidence. `none` and `observe` read. `mutate` changes the state the Flow acts on in order to reveal evidence that is otherwise unreachable. `destructive` removes or irreversibly commits something; the registry never offers one, because gathering information never requires destroying anything. |
| `AutomationStudioHarnessOptionStage` | Type | `packages/fluxiq/src/programs/automation-studio/runtime/llm/harness-options/option.ts:31` | A stage of the loop's fixed order of work. Carried as an opaque identifier while the stage protocol was still to land; now it is the protocol's own closed vocabulary, so an option pinned to a stage nobody will ever be in is a registration error rather than an option that silently never appears. |
| `automationStudioHarnessOptionTool` | Value | `packages/fluxiq/src/programs/automation-studio/runtime/llm/harness-options/option.ts:151` | - |
| `AutomationStudioHeapSwitchEvidence` | Type | `packages/fluxiq/src/programs/automation-studio/testing/scale-certification.ts:51` | - |
| `AutomationStudioHierarchyCacheUpdate` | Type | `packages/fluxiq/src/programs/automation-studio/storage/project/hierarchy/feed.ts:8` | - |
| `AutomationStudioHierarchyCacheUpdatePage` | Type | `packages/fluxiq/src/programs/automation-studio/storage/project/hierarchy/feed.ts:21` | - |
| `AutomationStudioHierarchyChildrenPage` | Type | `packages/fluxiq/src/programs/automation-studio/api/contracts/hierarchy.ts:43` | - |
| `AutomationStudioHierarchyCursorPage` | Type | `packages/fluxiq/src/programs/automation-studio/storage/project/hierarchy/repository.ts:24` | - |
| `AutomationStudioHierarchyEntry` | Type | `packages/fluxiq/src/programs/automation-studio/storage/project/hierarchy/repository.ts:7` | - |
| `AutomationStudioHierarchyNode` | Type | `packages/fluxiq/src/programs/automation-studio/api/contracts/hierarchy.ts:3` | - |
| `AutomationStudioHierarchyPageEntry` | Type | `packages/fluxiq/src/programs/automation-studio/api/contracts/hierarchy.ts:20` | - |
| `AutomationStudioHostRouteStatePath` | Type | `packages/fluxiq/src/programs/automation-studio/runtime/host-runtime.ts:30` | One `state.*` path a Router condition may test, and what it holds, in the host's own words. |
| `AutomationStudioHostRuntimeActionContext` | Type | `packages/fluxiq/src/programs/automation-studio/runtime/host-runtime.ts:22` | - |
| `AutomationStudioHostRuntimeBoundary` | Type | `packages/fluxiq/src/programs/automation-studio/runtime/host-runtime.ts:36` | - |
| `AutomationStudioHostRuntimeCapability` | Type | `packages/fluxiq/src/programs/automation-studio/runtime/host-runtime.ts:5` | - |
| `AutomationStudioHostStateSnapshotRef` | Type | `packages/fluxiq/src/programs/automation-studio/runtime/host-runtime.ts:15` | - |
| `AutomationStudioHybridReadComparison` | Type | `packages/fluxiq/src/programs/automation-studio/storage/project/migration-cutover.ts:115` | - |
| `AutomationStudioIdempotentMutationResult` | Type | `packages/fluxiq/src/programs/automation-studio/storage/project/unit-of-work.ts:41` | - |
| `AutomationStudioImporterImplementationBundle` | Type | `packages/fluxiq/src/programs/automation-studio/nodes/importer-sdk.ts:100` | - |
| `AutomationStudioImporterNodeManifest` | Type | `packages/fluxiq/src/programs/automation-studio/nodes/definitions.ts:115` | Plain registration boundary importers can expose from their configured source root. |
| `AutomationStudioImporterSchema` | Type | `packages/fluxiq/src/programs/automation-studio/nodes/importer-sdk.ts:9` | - |
| `AutomationStudioImporterSdkManifest` | Type | `packages/fluxiq/src/programs/automation-studio/nodes/importer-sdk.ts:56` | - |
| `AutomationStudioImporterSdkRegistry` | Class | `packages/fluxiq/src/programs/automation-studio/nodes/importer-sdk.ts:116` | Explicit manifest registry. FluxIQ never scans or imports host modules from display metadata. |
| `AutomationStudioInstructedAct` | Type | `packages/fluxiq/src/programs/automation-studio/runtime/flow-bootstrap/instructed-acts/contracts.ts:47` | One lasting act the instruction asks for, in the person's own words. |
| `AutomationStudioInstructedActChecklistItem` | Type | `packages/fluxiq/src/programs/automation-studio/runtime/flow-bootstrap/instructed-acts/checklist.ts:74` | One act as the model is shown it. |
| `AutomationStudioInstructedActClaim` | Type | `packages/fluxiq/src/programs/automation-studio/runtime/flow-bootstrap/instructed-acts/contracts.ts:112` | A model's claim that a draft step does an act. Both strings are the model's, bounded before use. |
| `AutomationStudioInstructedActKind` | Type | `packages/fluxiq/src/programs/automation-studio/runtime/flow-bootstrap/instructed-acts/contracts.ts:44` | The kinds of lasting act the reader recognises. Closed, so a refusal names a kind a model can read and a reader of the record can count. - `save`: save or bookmark something. - `add_to`: add or put something into a cart, basket, list or collection. - `claim`: collect, claim, clip, redeem or use a coupon, voucher or code. - `set`: switch or set a store, location, radius or other setting, or narrow, filter or sort results. - `move`: move something somewhere. - `open`: open a place the instruction reads from, such as saved items. - `submit`: book, buy, order, send, post, create, confirm, withdraw, place a bid, check out, or ask for a quote. |
| `AutomationStudioInstructedActMissing` | Type | `packages/fluxiq/src/programs/automation-studio/runtime/flow-bootstrap/instructed-acts/contracts.ts:179` | An act, or a choice of an act's item, with no step that does it, as the model is shown it. The two share `id`, `kind`, `quote` and `reason`. |
| `AutomationStudioInstructedActMissingReason` | Type | `packages/fluxiq/src/programs/automation-studio/runtime/flow-bootstrap/instructed-acts/contracts.ts:115` | Why an act has no step that does it. |
| `AutomationStudioInstructedActRepeatSpan` | Type | `packages/fluxiq/src/programs/automation-studio/runtime/flow-bootstrap/instructed-acts/span.ts:26` | One kept repeat that runs a step: the step carrying it, and the positions it runs from and through. |
| `automationStudioInstructedActRepeatSpans` | Value | `packages/fluxiq/src/programs/automation-studio/runtime/flow-bootstrap/instructed-acts/span.ts:29` | - |
| `automationStudioInstructedActs` | Value | `packages/fluxiq/src/programs/automation-studio/runtime/flow-bootstrap/instructed-acts/instruction-acts.ts:147` | - |
| `automationStudioInstructedActsChecklist` | Value | `packages/fluxiq/src/programs/automation-studio/runtime/flow-bootstrap/instructed-acts/checklist.ts:91` | - |
| `automationStudioInstructedActsChecklistValue` | Value | `packages/fluxiq/src/programs/automation-studio/runtime/flow-bootstrap/instructed-acts/checklist.ts:125` | - |
| `automationStudioInstructedActsNotDone` | Value | `packages/fluxiq/src/programs/automation-studio/runtime/flow-bootstrap/instructed-acts/checklist.ts:117` | - |
| `automationStudioInstructedActSpanStopsShort` | Value | `packages/fluxiq/src/programs/automation-studio/runtime/flow-bootstrap/instructed-acts/span.ts:48` | - |
| `automationStudioInstructedActsStanding` | Value | `packages/fluxiq/src/programs/automation-studio/runtime/flow-bootstrap/instructed-acts/standing.ts:46` | - |
| `automationStudioInstructedActStepFault` | Value | `packages/fluxiq/src/programs/automation-studio/runtime/flow-bootstrap/instructed-acts/step-fault.ts:20` | - |
| `AutomationStudioInstructedActsVerdict` | Type | `packages/fluxiq/src/programs/automation-studio/runtime/flow-bootstrap/instructed-acts/contracts.ts:188` | Whether every act has a step, or what the model is told instead. Like the answerability check, a refusal is correctable: it is fed back and the build asks again on the same budget and guards. |
| `AutomationStudioInstructedActTodo` | Type | `packages/fluxiq/src/programs/automation-studio/runtime/flow-bootstrap/instructed-acts/checklist.ts:43` | Why an act on the checklist is not done yet. |
| `AutomationStudioInstructedChoice` | Type | `packages/fluxiq/src/programs/automation-studio/runtime/flow-bootstrap/instructed-acts/contracts.ts:98` | A choice the instruction attaches to the item an act adds, as its own requirement: a setting (`kind: "set"`) that the act's own press does not make. Run 28 (`run-munvvc3z-3eadc185`) kept these as quote text only, and a Flow that chose no size and set no quantity passed. |
| `AutomationStudioInstructedChoiceChecklistItem` | Type | `packages/fluxiq/src/programs/automation-studio/runtime/flow-bootstrap/instructed-acts/checklist.ts:61` | One choice of an act's item as the model is shown it: how many, or which size, colour or version. |
| `AutomationStudioInstructedChoiceKind` | Type | `packages/fluxiq/src/programs/automation-studio/runtime/flow-bootstrap/instructed-acts/contracts.ts:90` | What a choice of an item fixes. Closed, like the act kinds. - `quantity`: how many, where the instruction asks for more than one. - `variant`: which one of the item's sizes, colours, counts, packs, flavours or versions. |
| `AutomationStudioInstructedConsequence` | Type | `packages/fluxiq/src/programs/automation-studio/runtime/action-permissions/instructed.ts:30` | One class the person's instruction plainly asks for, and the words that ask. |
| `AutomationStudioInstructedStanding` | Type | `packages/fluxiq/src/programs/automation-studio/runtime/flow-bootstrap/instructed-acts/standing.ts:37` | How one act or choice stands against the steps named for it: done by a step, or the fault of the step judged, with `after` for `span_stops_short` and `reads` -- the positions of every step named for it -- when each of them only reads the page. |
| `automationStudioInstructionDigest` | Value | `packages/fluxiq/src/programs/automation-studio/runtime/action-permissions/instructed.ts:95` | - |
| `AutomationStudioInstructionRequirement` | Type | `packages/fluxiq/src/programs/automation-studio/model/flow-adaptation.ts:117` | - |
| `AutomationStudioInstructionResolution` | Type | `packages/fluxiq/src/programs/automation-studio/runtime/llm/harness/instruction.ts:16` | - |
| `AutomationStudioInstructionResolutionInput` | Type | `packages/fluxiq/src/programs/automation-studio/runtime/llm/harness/instruction.ts:24` | - |
| `AutomationStudioInstructionScope` | Type | `packages/fluxiq/src/programs/automation-studio/model/flow-adaptation.ts:98` | - |
| `AutomationStudioInstructionSummary` | Type | `packages/fluxiq/src/programs/automation-studio/runtime/service/indexes/types.ts:20` | - |
| `AutomationStudioInstructionSummaryPage` | Type | `packages/fluxiq/src/programs/automation-studio/runtime/service/summaries/types.ts:12` | - |
| `AutomationStudioInstructionTag` | Type | `packages/fluxiq/src/programs/automation-studio/model/flow-adaptation.ts:108` | - |
| `AutomationStudioInstructionText` | Type | `packages/fluxiq/src/programs/automation-studio/runtime/action-permissions/instructed.ts:40` | An instruction as the derivation and the staleness check read it. |
| `automationStudioInterventionMode` | Value | `packages/fluxiq/src/programs/automation-studio/model/flows.ts:66` | - |
| `AutomationStudioInterventionMode` | Type | `packages/fluxiq/src/programs/automation-studio/model/flows.ts:64` | - |
| `AutomationStudioIoRecorder` | Class | `packages/fluxiq/src/programs/automation-studio/runtime/io-bridge.ts:10` | Converts importer-owned IO input events into recording evidence. Only action inputs with an explicit output binding become executable policy evidence. |
| `automationStudioIsPersonNeededAsk` | Value | `packages/fluxiq/src/programs/automation-studio/runtime/executor/person-needed.ts:57` | - |
| `AutomationStudioJudgedFlowGraphVersion` | Type | `packages/fluxiq/src/programs/automation-studio/runtime/flow-version/contracts.ts:46` | A version whose revision is known, which is the only kind a judgement can be written against. |
| `AutomationStudioLadderOutcome` | Type | `packages/fluxiq/src/programs/automation-studio/runtime/executor/ladder-run.ts:24` | What the ladder decided, and the decision to record on the failed attempt. The decision handed back is the one taken **after** every rung that ran was consumed, so a run that reaches the end of the ladder leaves the model's rung as the only candidate still standing. Recording an earlier decision would leave a deterministic candidate on the attempt and suppress escalation for good. |
| `AutomationStudioLadderRungKind` | Type | `packages/fluxiq/src/programs/automation-studio/runtime/executor/contracts.ts:127` | - |
| `AutomationStudioLadderState` | Type | `packages/fluxiq/src/programs/automation-studio/runtime/executor/recovery-ladder.ts:14` | What the executor already knows about this failure, which decides which deterministic rungs are worth offering. `consumed` is the heart of it. Every candidate still on the list that is not `llm_diagnosis` tells the adaptive classifier a deterministic answer is available and stops the model being consulted at all, so a rung that has already run has to leave the list rather than sit on it. |
| `AutomationStudioLargeProjectFixture` | Type | `packages/fluxiq/src/programs/automation-studio/model/fixtures/large-project.ts:26` | - |
| `AutomationStudioLargeProjectFixtureOptions` | Type | `packages/fluxiq/src/programs/automation-studio/model/fixtures/large-project.ts:15` | - |
| `AutomationStudioLazySqliteUiCacheStore` | Class | `packages/fluxiq/src/programs/automation-studio/storage/project/ui-cache-store.ts:79` | - |
| `AutomationStudioLegacyBackup` | Type | `packages/fluxiq/src/programs/automation-studio/model/legacy-retirement.ts:64` | - |
| `AutomationStudioLegacyBackupManifest` | Type | `packages/fluxiq/src/programs/automation-studio/storage/project/migration-cutover.ts:59` | - |
| `AutomationStudioLegacyBackupVerification` | Type | `packages/fluxiq/src/programs/automation-studio/storage/project/migration-cutover.ts:66` | - |
| `AutomationStudioLegacyDeferredArtifact` | Type | `packages/fluxiq/src/programs/automation-studio/model/legacy-retirement.ts:15` | - |
| `AutomationStudioLegacyImporterBatchResult` | Type | `packages/fluxiq/src/programs/automation-studio/storage/project/migration-cutover.ts:84` | - |
| `AutomationStudioLegacyImporterEvidence` | Type | `packages/fluxiq/src/programs/automation-studio/model/legacy-retirement.ts:8` | - |
| `AutomationStudioLegacyImportProgress` | Type | `packages/fluxiq/src/programs/automation-studio/storage/project/migration-cutover.ts:139` | - |
| `AutomationStudioLegacyInventoryManifest` | Type | `packages/fluxiq/src/programs/automation-studio/storage/project/migration-cutover.ts:47` | - |
| `AutomationStudioLegacyMigrationOperation` | Type | `packages/fluxiq/src/programs/automation-studio/storage/project/migration-cutover.ts:77` | - |
| `AutomationStudioLegacyMigrationOperationKind` | Type | `packages/fluxiq/src/programs/automation-studio/storage/project/migration-cutover.ts:34` | - |
| `AutomationStudioLegacyMigrationOrchestrationResult` | Type | `packages/fluxiq/src/programs/automation-studio/storage/project/migration-cutover.ts:95` | - |
| `AutomationStudioLegacyObjectIndexMigrationResult` | Type | `packages/fluxiq/src/programs/automation-studio/storage/project/object-index-migration.ts:7` | - |
| `AutomationStudioLegacyProjectCatalogIndex` | Type | `packages/fluxiq/src/programs/automation-studio/storage/catalog-index-migration.ts:6` | - |
| `AutomationStudioLegacyProjectCatalogMigrationResult` | Type | `packages/fluxiq/src/programs/automation-studio/storage/catalog-index-migration.ts:11` | - |
| `AutomationStudioLegacyResourceInventoryItem` | Type | `packages/fluxiq/src/programs/automation-studio/storage/project/migration-cutover.ts:38` | - |
| `AutomationStudioLegacyResourceKind` | Type | `packages/fluxiq/src/programs/automation-studio/storage/project/migration-cutover.ts:33` | - |
| `AutomationStudioLegacyRetirementAuditEvent` | Type | `packages/fluxiq/src/programs/automation-studio/model/legacy-retirement.ts:73` | - |
| `AutomationStudioLegacyRetirementCriterion` | Type | `packages/fluxiq/src/programs/automation-studio/model/legacy-retirement.ts:36` | - |
| `AutomationStudioLegacyRetirementDiagnostic` | Type | `packages/fluxiq/src/programs/automation-studio/model/legacy-retirement.ts:42` | - |
| `AutomationStudioLegacyRetirementPhase` | Type | `packages/fluxiq/src/programs/automation-studio/model/legacy-retirement.ts:6` | - |
| `AutomationStudioLegacyRetirementReport` | Type | `packages/fluxiq/src/programs/automation-studio/model/legacy-retirement.ts:51` | - |
| `AutomationStudioLegacyRetirementState` | Type | `packages/fluxiq/src/programs/automation-studio/model/legacy-retirement.ts:21` | - |
| `AutomationStudioLegacyWriteDisabledError` | Class | `packages/fluxiq/src/programs/automation-studio/model/legacy-retirement.ts:93` | Structured error retained across compatibility endpoints. |
| `AutomationStudioListHierarchyChildrenRequest` | Type | `packages/fluxiq/src/programs/automation-studio/api/contracts/hierarchy.ts:36` | - |
| `AutomationStudioListProjectUiCacheStatsRequest` | Type | `packages/fluxiq/src/programs/automation-studio/api/contracts/ui-cache.ts:47` | - |
| `AutomationStudioListProjectUiCacheStatsResponse` | Type | `packages/fluxiq/src/programs/automation-studio/api/contracts/ui-cache.ts:60` | - |
| `AutomationStudioListReusableLlmContextsRequest` | Type | `packages/fluxiq/src/programs/automation-studio/api/contracts/llm.ts:3` | - |
| `AutomationStudioLlmActionPermissions` | Type | `packages/fluxiq/src/programs/automation-studio/runtime/llm/harness/context-packet.ts:101` | What a run's permission gate lets its actions do, by consequence class. Given to a call whose actions the gate governs, it takes the place of the policy's side-effect flags in `policyGates`: the gate, not those flags, is what decides such an action, and a model told "no external side effects" would avoid the press a person's permission or instruction allowed. |
| `AutomationStudioLlmBuildCall` | Type | `packages/fluxiq/src/programs/automation-studio/runtime/llm/run-call-record.ts:166` | What a build knows about one of its own provider calls. A build is not a run: it holds no budget lease, so nothing reserves, counts or charges its calls one by one, and the per-call ledger above never saw them. What it does keep is the evidence loop's trace, which already records one row per decision with the usage the provider reported for it -- so a build's calls can be itemized after the fact from the record it already wrote, without changing anything about how a build runs. |
| `automationStudioLlmBuildCallRecord` | Value | `packages/fluxiq/src/programs/automation-studio/runtime/llm/run-call-record.ts:189` | - |
| `AutomationStudioLlmContextPacket` | Type | `packages/fluxiq/src/programs/automation-studio/runtime/llm/harness/context-packet.ts:34` | - |
| `AutomationStudioLlmConversationContext` | Type | `packages/fluxiq/src/programs/automation-studio/runtime/llm/harness/conversation.ts:34` | The thread, every turn of it. |
| `AutomationStudioLlmConversationTurn` | Type | `packages/fluxiq/src/programs/automation-studio/runtime/llm/harness/conversation.ts:27` | One turn, as a request carries it. |
| `AutomationStudioLlmDecisionContextAmendmentRefusal` | Type | `packages/fluxiq/src/programs/automation-studio/runtime/llm/decision-context/decision.ts:40` | One amendment the draft refused, and whether it had refused the same one before. |
| `AutomationStudioLlmDecisionContextChange` | Type | `packages/fluxiq/src/programs/automation-studio/runtime/llm/decision-context/decision.ts:25` | Whether a call changed what a later look would see. |
| `automationStudioLlmDecisionContextClosedCode` | Value | `packages/fluxiq/src/programs/automation-studio/runtime/llm/decision-context/closed-code.ts:10` | - |
| `automationStudioLlmDecisionContextClosedDetail` | Value | `packages/fluxiq/src/programs/automation-studio/runtime/llm/decision-context/closed-detail.ts:32` | - |
| `AutomationStudioLlmDecisionContextDecision` | Type | `packages/fluxiq/src/programs/automation-studio/runtime/llm/decision-context/decision.ts:43` | One decision and Core's answer, as the caller reports it. |
| `AutomationStudioLlmDecisionContextDryRun` | Type | `packages/fluxiq/src/programs/automation-studio/runtime/llm/decision-context/decision.ts:37` | What the replay of the draft said when a completion reached it: every step replayed (`clean`), the same draft had already replayed clean and was not replayed again (`reused_clean`), no replay applied to it (`not_run`: the dry run is off, or the draft does not say how to replay), or the steps it refused. |
| `AutomationStudioLlmDecisionContextDryRunRefusal` | Type | `packages/fluxiq/src/programs/automation-studio/runtime/llm/decision-context/decision.ts:28` | One step a dry run did not replay, and how it answered. |
| `automationStudioLlmDecisionContextEntry` | Value | `packages/fluxiq/src/programs/automation-studio/runtime/llm/decision-context/entry.ts:19` | - |
| `AutomationStudioLlmDecisionContextRecord` | Type | `packages/fluxiq/src/programs/automation-studio/runtime/llm/decision-context/decision.ts:112` | One row as the recorder holds it. `detail` is the completion feedback's closed codes; `firstSeenAt` is the first iteration the same decision was made, when that was earlier than this one. |
| `AutomationStudioLlmDecisionContextRecorder` | Class | `packages/fluxiq/src/programs/automation-studio/runtime/llm/decision-context/recorder.ts:21` | - |
| `AutomationStudioLlmDecisionContextRepeat` | Type | `packages/fluxiq/src/programs/automation-studio/runtime/llm/decision-context/decision.ts:124` | How often a decision has been made, this one included, and at which iterations, oldest first. For a completion "the same decision" is the same answer against the same draft revision. |
| `automationStudioLlmDecisionContextShown` | Value | `packages/fluxiq/src/programs/automation-studio/runtime/llm/decision-context/shown.ts:28` | - |
| `automationStudioLlmDecisionContextSignature` | Value | `packages/fluxiq/src/programs/automation-studio/runtime/llm/decision-context/signature.ts:24` | - |
| `AutomationStudioLlmDecisionContextSignatureInput` | Type | `packages/fluxiq/src/programs/automation-studio/runtime/llm/decision-context/signature.ts:17` | The part of a decision that identifies it. The loop's own decision type satisfies it. |
| `automationStudioLlmDecisionContextSupersede` | Value | `packages/fluxiq/src/programs/automation-studio/runtime/llm/decision-context/supersede.ts:21` | - |
| `AutomationStudioLlmDiagnosisFields` | Type | `packages/fluxiq/src/programs/automation-studio/runtime/llm/harness/structured-response.ts:63` | The one channel through which a model may contribute to a diagnosis. Every response's `metadata` is stripped on the way in, deliberately: it is an open field and an open field is a way to smuggle arbitrary JSON past the recognized-field allowlist. That left no channel at all, so the structured diagnosis the runtime builds was entirely Core's own verdicts and the model's answer was a sentence of prose nobody could act on. This is the narrow replacement: a named field, with a fixed set of keys, each bounded to a value Core can check without knowing anything about the medium the failure happened in. It is a channel, not an opening -- `metadata` is still stripped, and an unrecognized key inside `diagnosis` is still refused. |
| `AutomationStudioLlmDiagnostic` | Type | `packages/fluxiq/src/programs/automation-studio/runtime/llm/harness/diagnostic.ts:3` | - |
| `automationStudioLlmDraftEntryWithoutDeniedKeys` | Value | `packages/fluxiq/src/programs/automation-studio/runtime/llm/harness/draft-screen.ts:33` | - |
| `AutomationStudioLlmEvidenceCompletionCheck` | Type | `packages/fluxiq/src/programs/automation-studio/runtime/llm/evidence-loop/completion-check.ts:17` | What a caller's check made of a completed result. A refusal names why, in issue codes, and carries the feedback the model is shown before it is asked again: bounded JSON the caller authored -- what was wrong and where -- never content the model has not already seen from its own tools. |
| `automationStudioLlmEvidenceDraftAmendmentFeedback` | Value | `packages/fluxiq/src/programs/automation-studio/runtime/llm/draft-amendment-feedback.ts:92` | - |
| `AutomationStudioLlmEvidenceLoopAccounting` | Type | `packages/fluxiq/src/programs/automation-studio/runtime/llm/evidence-loop/accounting.ts:12` | What the loop's contract is, declared one noun per file in `evidence-loop/` and republished here, because a dozen modules across the runtime import them from this path and the split is meant to be one none of them notices. |
| `AutomationStudioLlmEvidenceLoopAnswerability` | Type | `packages/fluxiq/src/programs/automation-studio/runtime/llm/evidence-loop/answerability.ts:2` | Content-free capability facts observed while checking a completed plan. |
| `AutomationStudioLlmEvidenceLoopBudget` | Type | `packages/fluxiq/src/programs/automation-studio/runtime/llm/loop-budget.ts:51` | The bounds a loop is given, each optional. |
| `AutomationStudioLlmEvidenceLoopDecision` | Type | `packages/fluxiq/src/programs/automation-studio/runtime/llm/evidence-loop/decision.ts:10` | What the loop's contract is, declared one noun per file in `evidence-loop/` and republished here, because a dozen modules across the runtime import them from this path and the split is meant to be one none of them notices. |
| `AutomationStudioLlmEvidenceLoopDraftChange` | Type | `packages/fluxiq/src/programs/automation-studio/runtime/llm/evidence-loop/draft-change.ts:14` | Stable build-local identities and counts for one draft amendment decision. |
| `AutomationStudioLlmEvidenceLoopDraftShown` | Type | `packages/fluxiq/src/programs/automation-studio/runtime/llm/evidence-loop/draft-shown.ts:19` | What one decision was shown of the draft. |
| `AutomationStudioLlmEvidenceLoopExhaustedBound` | Type | `packages/fluxiq/src/programs/automation-studio/runtime/llm/evidence-loop/exhaustion.ts:38` | Which allowance ran out. Each is a number a retry can raise. |
| `AutomationStudioLlmEvidenceLoopExhaustion` | Type | `packages/fluxiq/src/programs/automation-studio/runtime/llm/evidence-loop/exhaustion.ts:58` | What an exhausted loop has to say for itself. The first two answer "was this budget the problem?"; the rest answer "how close was it?" -- a build that stopped one proposable step short of a plan reads very differently from one that never appended an action, and before this record the two were the same sentence. |
| `AutomationStudioLlmEvidenceLoopFailureCode` | Type | `packages/fluxiq/src/programs/automation-studio/runtime/llm/evidence-loop/result.ts:16` | What the loop's contract is, declared one noun per file in `evidence-loop/` and republished here, because a dozen modules across the runtime import them from this path and the split is meant to be one none of them notices. |
| `AutomationStudioLlmEvidenceLoopInput` | Type | `packages/fluxiq/src/programs/automation-studio/runtime/llm/loop-configuration.ts:34` | What a loop may be configured with, in `loop-configuration.ts` with the arithmetic that reads it. |
| `AutomationStudioLlmEvidenceLoopProgress` | Type | `packages/fluxiq/src/programs/automation-studio/runtime/llm/evidence-progress/progress.ts:2` | Content-free state transition measured for one evidence-loop trace row. |
| `AutomationStudioLlmEvidenceLoopProviderUnavailable` | Type | `packages/fluxiq/src/programs/automation-studio/runtime/llm/unanswered-calls.ts:51` | How a loop the provider stopped answering ended. |
| `AutomationStudioLlmEvidenceLoopResult` | Type | `packages/fluxiq/src/programs/automation-studio/runtime/llm/evidence-loop/result.ts:61` | What the loop's contract is, declared one noun per file in `evidence-loop/` and republished here, because a dozen modules across the runtime import them from this path and the split is meant to be one none of them notices. |
| `AutomationStudioLlmEvidenceLoopTrace` | Type | `packages/fluxiq/src/programs/automation-studio/runtime/llm/evidence-loop/trace.ts:32` | What the loop's contract is, declared one noun per file in `evidence-loop/` and republished here, because a dozen modules across the runtime import them from this path and the split is meant to be one none of them notices. |
| `AutomationStudioLlmEvidenceLoopUnreadable` | Type | `packages/fluxiq/src/programs/automation-studio/runtime/llm/unreadable-reply.ts:84` | How many unreadable replies a loop met, and which kinds. |
| `AutomationStudioLlmEvidenceRestoredStep` | Type | `packages/fluxiq/src/programs/automation-studio/runtime/llm/evidence-loop/completion-check.ts:31` | A withdrawn draft step the check put back before checking: which one, by the draft position it had, and how the model had withdrawn it. Content-free -- a position and a closed word -- so it may travel on every published record. Flow Bootstrap restores the step that reached the start location when the draft's amendments had withdrawn it (`../../flow-bootstrap/reachability/start-step.ts`), and that silently changed the Flow a completion was judged on: nothing in a run's record said the Flow had a step the model had taken out. |
| `AutomationStudioLlmEvidenceRuntimeBinding` | Type | `packages/fluxiq/src/programs/automation-studio/runtime/llm/harness-options/binding.ts:33` | What a host binds to give the loop its domain's actions. `domainId` is the field the slot never had, and everything the registry does about scoping follows from it. |
| `AutomationStudioLlmEvidenceScreenResult` | Type | `packages/fluxiq/src/programs/automation-studio/runtime/llm/harness/evidence-screen.ts:42` | What a screen found. Both are refusals; which one is for the caller's own record, never the value. |
| `AutomationStudioLlmEvidenceTool` | Type | `packages/fluxiq/src/programs/automation-studio/runtime/llm/evidence-loop/tool.ts:12` | What the loop's contract is, declared one noun per file in `evidence-loop/` and republished here, because a dozen modules across the runtime import them from this path and the split is meant to be one none of them notices. |
| `AutomationStudioLlmEvidenceToolExecutionResult` | Type | `packages/fluxiq/src/programs/automation-studio/runtime/llm/evidence-loop/tool-execution.ts:11` | What the loop's contract is, declared one noun per file in `evidence-loop/` and republished here, because a dozen modules across the runtime import them from this path and the split is meant to be one none of them notices. |
| `AutomationStudioLlmEvidenceToolFailureCode` | Type | `packages/fluxiq/src/programs/automation-studio/runtime/llm/tool-failure.ts:57` | The call threw, or it returned something that is not a tool result. A refused result's code names the check it failed, `llm_evidence_loop.tool_result_invalid.<check>`, and that one code is what the model, the trace row, the history and the draft step all carry. The bare `tool_result_invalid` stays for a caller that cannot say which. |
| `AutomationStudioLlmExploredEvidenceSlot` | Type | `packages/fluxiq/src/programs/automation-studio/runtime/llm/harness/explored-evidence.ts:18` | - |
| `AutomationStudioLlmFailureEvidenceCaptureInput` | Type | `packages/fluxiq/src/programs/automation-studio/runtime/llm/harness/failure-evidence.ts:8` | - |
| `AutomationStudioLlmHarnessInput` | Type | `packages/fluxiq/src/programs/automation-studio/runtime/llm/harness/task-request.ts:127` | - |
| `AutomationStudioLlmInvocationGateDecision` | Type | `packages/fluxiq/src/programs/automation-studio/runtime/training-modes.ts:112` | - |
| `AutomationStudioLlmInvocationGateInput` | Type | `packages/fluxiq/src/programs/automation-studio/runtime/training-modes.ts:101` | - |
| `AutomationStudioLlmModelCaller` | Type | `packages/fluxiq/src/programs/automation-studio/runtime/llm/model-caller.ts:12` | The person a model call is made for: whose unlocked Secret Keys key pays. Not an authorization. A model call made while building, exploring, repairing, verifying, diagnosing or adapting a Flow needs no grant: nothing is issued, held, digest-checked, confirmed or revoked around it. What stays gated is a lasting real-world consequence of an *action* -- moving money, deleting, sending -- which the action permission gate asks the person about one act at a time. Spend is bounded by the run's own budget and the Flow's configured cost ceiling. |
| `AutomationStudioLlmOpaqueSecretResolver` | Type | `packages/fluxiq/src/programs/automation-studio/runtime/llm/provider-contract.ts:172` | - |
| `AutomationStudioLlmProvider` | Type | `packages/fluxiq/src/programs/automation-studio/runtime/llm/harness/provider.ts:43` | - |
| `automationStudioLlmProviderCall` | Value | `packages/fluxiq/src/programs/automation-studio/runtime/llm/provider-retry/call.ts:43` | - |
| `AutomationStudioLlmProviderCallOutcome` | Type | `packages/fluxiq/src/programs/automation-studio/runtime/llm/provider-retry/call.ts:35` | - |
| `AutomationStudioLlmProviderError` | Class | `packages/fluxiq/src/programs/automation-studio/runtime/llm/provider-contract.ts:118` | - |
| `AutomationStudioLlmProviderErrorCode` | Type | `packages/fluxiq/src/programs/automation-studio/runtime/llm/provider-contract.ts:77` | - |
| `automationStudioLlmProviderErrorSpendsCall` | Value | `packages/fluxiq/src/programs/automation-studio/runtime/llm/failure-disposition.ts:120` | - |
| `AutomationStudioLlmProviderFailureDisposition` | Type | `packages/fluxiq/src/programs/automation-studio/runtime/llm/failure-disposition.ts:36` | What a failed call does to the rest of the model's calls in the run. |
| `AutomationStudioLlmProviderFailureProvenance` | Type | `packages/fluxiq/src/programs/automation-studio/runtime/llm/provider-contract.ts:89` | - |
| `automationStudioLlmProviderFailureSpendsCall` | Value | `packages/fluxiq/src/programs/automation-studio/runtime/llm/failure-disposition.ts:107` | - |
| `AutomationStudioLlmProviderInputSize` | Type | `packages/fluxiq/src/programs/automation-studio/runtime/llm/provider-contract.ts:101` | The size of a request a provider refused as too large (`llm.provider_input_budget_exceeded`), in numbers only. A size is safe to record where the check's own sentence is not, so this is the one pre-flight refusal whose recorded message says more than that it happened: a request over the model's window fails loudly, with its size, wherever it is caught. |
| `AutomationStudioLlmProviderInvocationState` | Type | `packages/fluxiq/src/programs/automation-studio/runtime/llm/provider-contract.ts:87` | - |
| `AutomationStudioLlmProviderMetadata` | Type | `packages/fluxiq/src/programs/automation-studio/runtime/llm/harness/provider.ts:4` | - |
| `AutomationStudioLlmProviderPreflightErrorCode` | Type | `packages/fluxiq/src/programs/automation-studio/runtime/llm/provider-contract.ts:51` | - |
| `AutomationStudioLlmProviderRefusal` | Type | `packages/fluxiq/src/programs/automation-studio/runtime/provider-refusal/record.ts:74` | A provider's refusal of one request. `withheld` names every omission, so a reader can tell "the provider said nothing" from "the provider said something this record would not carry". The vocabulary belongs to the producer -- Core's own adapter uses `body_unreadable`, `body_over_limit`, `body_empty`, `body_not_json`, `error_object_absent`, `error_fields_unnamed`, `message_truncated`, `message_locator_shaped` and `message_credential_shaped` -- and this module adds `request_unpublishable` when it drops a request shape of its own accord. |
| `AutomationStudioLlmProviderRefusalError` | Type | `packages/fluxiq/src/programs/automation-studio/runtime/provider-refusal/record.ts:56` | The provider's own error, read field by field out of a refusal body -- never the body itself. |
| `AutomationStudioLlmProviderResolution` | Type | `packages/fluxiq/src/programs/automation-studio/runtime/llm/resolver-contract.ts:9` | - |
| `AutomationStudioLlmProviderResolverInput` | Type | `packages/fluxiq/src/programs/automation-studio/runtime/llm/resolver-contract.ts:20` | - |
| `AutomationStudioLlmProviderResponseState` | Type | `packages/fluxiq/src/programs/automation-studio/runtime/llm/provider-contract.ts:88` | - |
| `AutomationStudioLlmProviderRetryAccount` | Type | `packages/fluxiq/src/programs/automation-studio/runtime/llm/provider-retry/account.ts:51` | The whole account of one provider call's attempts. |
| `AutomationStudioLlmProviderRetryAttempt` | Type | `packages/fluxiq/src/programs/automation-studio/runtime/llm/provider-retry/account.ts:17` | One provider request that failed, and what followed it. |
| `automationStudioLlmProviderRetryDecision` | Value | `packages/fluxiq/src/programs/automation-studio/runtime/llm/provider-retry/decision.ts:52` | - |
| `AutomationStudioLlmProviderRetryDecision` | Type | `packages/fluxiq/src/programs/automation-studio/runtime/llm/provider-retry/decision.ts:48` | - |
| `automationStudioLlmProviderRetryHintMs` | Value | `packages/fluxiq/src/programs/automation-studio/runtime/llm/provider-retry/hint.ts:30` | - |
| `AutomationStudioLlmProviderRetryLedger` | Class | `packages/fluxiq/src/programs/automation-studio/runtime/llm/provider-retry/ledger.ts:25` | - |
| `automationStudioLlmProviderRetryRunLedger` | Object | `packages/fluxiq/src/programs/automation-studio/runtime/llm/provider-retry/ledger.ts:50` | Core's own, used by every call whose caller names no other. |
| `AutomationStudioLlmProviderRetryStop` | Type | `packages/fluxiq/src/programs/automation-studio/runtime/llm/provider-retry/account.ts:42` | Why the loop stopped asking. `answered` is the ordinary end. `not_retryable` is the adapter's verdict -- a 400, an authentication failure, a malformed request of our own making -- and is the *correct* end for those: retrying one spends the run's money to be told the same thing. The three bounds are the ones `limits.ts` states. |
| `AutomationStudioLlmProviderThrow` | Type | `packages/fluxiq/src/programs/automation-studio/runtime/llm/throw-account/read.ts:39` | A bounded, screened account of an untyped provider throw, as a stored Flow Bootstrap failure publishes it. Every field is optional because a throw may carry any of them or none; a throw that yields none produces no record. |
| `automationStudioLlmProviderThrowRead` | Value | `packages/fluxiq/src/programs/automation-studio/runtime/llm/throw-account/read.ts:82` | - |
| `AutomationStudioLlmProviderThrowRead` | Type | `packages/fluxiq/src/programs/automation-studio/runtime/llm/throw-account/read.ts:60` | A throw as read, before its message is screened. `account` is publishable as it stands: codes and closed words only. `unscreenedMessage` is not, and nothing may publish it except through `../harness/throw-screen.ts`. |
| `AutomationStudioLlmProviderThrowWithheld` | Type | `packages/fluxiq/src/programs/automation-studio/runtime/llm/throw-account/read.ts:26` | Why part of a throw was not carried, one word per reason. |
| `automationStudioLlmProviderUnanswered` | Value | `packages/fluxiq/src/programs/automation-studio/runtime/llm/unanswered-calls.ts:46` | - |
| `AutomationStudioLlmRecentActionContext` | Type | `packages/fluxiq/src/programs/automation-studio/runtime/llm/harness/context-packet.ts:145` | - |
| `automationStudioLlmRequestEvidenceRefusal` | Value | `packages/fluxiq/src/programs/automation-studio/runtime/llm/harness/request-evidence-check.ts:37` | - |
| `AutomationStudioLlmRequestRefusalCode` | Type | `packages/fluxiq/src/programs/automation-studio/runtime/llm/harness/request-refusal.ts:32` | - |
| `AutomationStudioLlmRequestRefusedError` | Class | `packages/fluxiq/src/programs/automation-studio/runtime/llm/harness/request-refusal.ts:41` | The error a request guard throws. Recognised by `name` and `code` rather than by `instanceof`, so a reader in a directory that must not import this one as a value (the build's failure projection, which `runtime/llm` already imports from) can still name it. |
| `automationStudioLlmResolutionWithinFlowSettings` | Value | `packages/fluxiq/src/programs/automation-studio/runtime/llm/flow-execution-limits/resolution-within-flow-settings.ts:41` | - |
| `AutomationStudioLlmRunBudgetAllowance` | Type | `packages/fluxiq/src/programs/automation-studio/runtime/llm/run-budget.ts:28` | Which kind of call a reservation is, for the run's accounting. `run` is the diagnosis, the patch, and anything else the loop's fixed stages spend on this run. `exploration` is a decision inside a bounded exploration. This is a label, not a second allowance. It used to be both: the exploration had its own call count because the run's ordinary count was two, the diagnosis and the patch spent both, and an exploration that borrowed from it was refused before it looked at anything. Once the run's call count stopped being the thing that bounds a run, a separate count for exploring had nothing left to protect, and two overlapping call ceilings is one more than a person can reason about. What survives is the reason the split was worth having in the first place: a run's receipt says how much of what it spent went on looking around, rather than mixing it into the diagnosis and the patch. An undeclared reservation is a `run` reservation. |
| `AutomationStudioLlmRunBudgetDiagnostic` | Type | `packages/fluxiq/src/programs/automation-studio/runtime/llm/run-budget.ts:84` | - |
| `AutomationStudioLlmRunBudgetLease` | Type | `packages/fluxiq/src/programs/automation-studio/runtime/llm/run-budget.ts:89` | - |
| `AutomationStudioLlmRunBudgetLedger` | Class | `packages/fluxiq/src/programs/automation-studio/runtime/llm/run-budget.ts:137` | - |
| `AutomationStudioLlmRunBudgetLimits` | Type | `packages/fluxiq/src/programs/automation-studio/runtime/llm/run-budget.ts:54` | - |
| `AutomationStudioLlmRunBudgetReservation` | Type | `packages/fluxiq/src/programs/automation-studio/runtime/llm/run-budget.ts:106` | - |
| `AutomationStudioLlmRunBudgetReservationInput` | Type | `packages/fluxiq/src/programs/automation-studio/runtime/llm/run-budget.ts:67` | - |
| `AutomationStudioLlmRunCallCharge` | Type | `packages/fluxiq/src/programs/automation-studio/runtime/llm/run-call-record.ts:64` | What the ledger charged the run for one call. |
| `AutomationStudioLlmRunCallChargeBasis` | Type | `packages/fluxiq/src/programs/automation-studio/runtime/llm/run-call-record.ts:61` | Which source a charged figure came from. |
| `AutomationStudioLlmRunCallDescription` | Type | `packages/fluxiq/src/programs/automation-studio/runtime/llm/run-call-record.ts:44` | What a call is, known before it is sent. |
| `AutomationStudioLlmRunCallOutcome` | Type | `packages/fluxiq/src/programs/automation-studio/runtime/llm/run-call-record.ts:54` | How a call ended, known once its answer was checked. |
| `AutomationStudioLlmRunCallRecord` | Type | `packages/fluxiq/src/programs/automation-studio/runtime/llm/run-call-record.ts:73` | - |
| `automationStudioLlmRunCostCeilingUsd` | Value | `packages/fluxiq/src/programs/automation-studio/runtime/llm/flow-execution-limits/run-cost-ceiling.ts:30` | - |
| `automationStudioLlmRunNodeTool` | Value | `packages/fluxiq/src/programs/automation-studio/runtime/llm/node-tools/run-node.ts:91` | - |
| `AutomationStudioLlmSecretReference` | Type | `packages/fluxiq/src/programs/automation-studio/runtime/llm/deepseek/provider.ts:43` | - |
| `automationStudioLlmSignalTimedOut` | Value | `packages/fluxiq/src/programs/automation-studio/runtime/llm/provider-contract.ts:113` | - |
| `AutomationStudioLlmStepLogContext` | Type | `packages/fluxiq/src/programs/automation-studio/runtime/llm/step-log/scope.ts:8` | The round and phase every step made inside a scope is written with. |
| `automationStudioLlmStepLogDirectory` | Value | `packages/fluxiq/src/programs/automation-studio/runtime/llm/step-log/directory.ts:11` | - |
| `AutomationStudioLlmStepLogModelCall` | Type | `packages/fluxiq/src/programs/automation-studio/runtime/llm/step-log/model-step.ts:22` | Everything a provider adapter knows of a call before it is sent. Never the credential, never a header. |
| `automationStudioLlmStepLogModelStep` | Value | `packages/fluxiq/src/programs/automation-studio/runtime/llm/step-log/model-step.ts:56` | - |
| `AutomationStudioLlmStepLogModelStep` | Type | `packages/fluxiq/src/programs/automation-studio/runtime/llm/step-log/model-step.ts:39` | One model exchange being written down. Every method is best-effort and returns nothing. |
| `AutomationStudioLlmStepLogPhase` | Type | `packages/fluxiq/src/programs/automation-studio/runtime/llm/step-log/scope.ts:5` | Which part of a build a step belongs to, as the build's phases set it. |
| `automationStudioLlmStepLogScope` | Object | `packages/fluxiq/src/programs/automation-studio/runtime/llm/step-log/scope.ts:21` | The build's round and phase, carried to the provider adapters and the tool wrapper without threading them through every call between. Core's provider call knows its task but not which round of a build it serves: rounds and phases live in `flow-bootstrap/unfinished-build/phases.ts`, which sets a scope around each round and each test. With the step log off, `run` just calls `fn`. |
| `automationStudioLlmStepLogScreen` | Value | `packages/fluxiq/src/programs/automation-studio/runtime/llm/step-log/screen.ts:22` | - |
| `automationStudioLlmStepLogTool` | Value | `packages/fluxiq/src/programs/automation-studio/runtime/llm/step-log/tool-step.ts:26` | - |
| `AutomationStudioLlmStepLogUsage` | Type | `packages/fluxiq/src/programs/automation-studio/runtime/llm/step-log/model-step.ts:13` | What a model step's meta records of a call's token use. |
| `AutomationStudioLlmStructuredResponse` | Type | `packages/fluxiq/src/programs/automation-studio/runtime/llm/harness/structured-response.ts:9` | - |
| `automationStudioLlmTaskExpectsDiagnosis` | Value | `packages/fluxiq/src/programs/automation-studio/runtime/llm/harness/task-kind.ts:46` | - |
| `AutomationStudioLlmTaskKind` | Type | `packages/fluxiq/src/programs/automation-studio/runtime/llm/harness/task-kind.ts:4` | - |
| `AutomationStudioLlmTaskRequest` | Type | `packages/fluxiq/src/programs/automation-studio/runtime/llm/harness/task-request.ts:27` | - |
| `AutomationStudioLlmTaskResult` | Type | `packages/fluxiq/src/programs/automation-studio/runtime/llm/harness/task-request.ts:49` | - |
| `automationStudioLlmTaskResultSpentWithoutDecision` | Value | `packages/fluxiq/src/programs/automation-studio/runtime/llm/unusable-decision.ts:134` | - |
| `AutomationStudioLlmTokenLimits` | Type | `packages/fluxiq/src/programs/automation-studio/runtime/llm/harness/token-limits.ts:32` | - |
| `automationStudioLlmUnreadableReplySaid` | Value | `packages/fluxiq/src/programs/automation-studio/runtime/llm/unreadable-reply.ts:78` | - |
| `automationStudioLlmUnusableDecisionError` | Value | `packages/fluxiq/src/programs/automation-studio/runtime/llm/unusable-decision.ts:148` | - |
| `AutomationStudioLlmUnusableDecisionError` | Class | `packages/fluxiq/src/programs/automation-studio/runtime/llm/unusable-decision.ts:108` | Thrown by a decision callback to say "the provider was asked and its answer cannot be acted on, for a reason another attempt could fix". It carries issue codes only, never a model's words. Where the provider's reply arrived and could not be read, it also carries the reply's account: which malformed case it was, its finish reason, its length and what it cost (`./reply-account.ts`). One code for seven cases is what left 14 refused decisions of `run-munw7ffn-fe1cecd2` unexplained; the loop writes this onto the decision's row. |
| `AutomationStudioLlmUsageSummary` | Type | `packages/fluxiq/src/programs/automation-studio/runtime/llm/harness/provider.ts:12` | - |
| `AutomationStudioLoadedCompiledPlan` | Type | `packages/fluxiq/src/programs/automation-studio/storage/project/compiled-plan-store.ts:29` | - |
| `automationStudioLocatorShapedText` | Value | `packages/fluxiq/src/programs/automation-studio/runtime/llm/harness/locator-text.ts:108` | - |
| `automationStudioLoopProtocolInstruction` | Value | `packages/fluxiq/src/programs/automation-studio/runtime/llm/stages/instructions.ts:44` | - |
| `AutomationStudioLoopStage` | Type | `packages/fluxiq/src/programs/automation-studio/runtime/llm/stages/protocol.ts:33` | - |
| `automationStudioLoopStageIndex` | Value | `packages/fluxiq/src/programs/automation-studio/runtime/llm/stages/protocol.ts:55` | - |
| `AutomationStudioLoopStageInstructionBundle` | Type | `packages/fluxiq/src/programs/automation-studio/runtime/llm/stages/registry.ts:50` | - |
| `AutomationStudioLoopStageInstructionContribution` | Type | `packages/fluxiq/src/programs/automation-studio/runtime/llm/stages/registry.ts:39` | One instruction a domain attaches to one stage. `mode` is the whole of L15's second power. `extend` leaves Core's default in place and adds beside it; `replace` takes its place. There is no third mode, and in particular none that reaches the ordering statement. |
| `AutomationStudioLoopStageInstructionRegistry` | Class | `packages/fluxiq/src/programs/automation-studio/runtime/llm/stages/registry.ts:64` | - |
| `automationStudioLoopStageInstructions` | Value | `packages/fluxiq/src/programs/automation-studio/runtime/llm/stages/registry.ts:140` | - |
| `AutomationStudioLoopStageRefusalCode` | Type | `packages/fluxiq/src/programs/automation-studio/runtime/llm/stages/protocol.ts:40` | Why a move between stages was refused. Each one names a distinct way of getting the order wrong, so a refusal is actionable and so a test can assert the specific rule rather than "it threw". |
| `automationStudioLoopStageTransition` | Value | `packages/fluxiq/src/programs/automation-studio/runtime/llm/stages/protocol.ts:75` | - |
| `AutomationStudioLoopStageTransition` | Type | `packages/fluxiq/src/programs/automation-studio/runtime/llm/stages/protocol.ts:46` | - |
| `AutomationStudioMarketingDemo` | Type | `packages/fluxiq/src/programs/automation-studio/testing/marketing-demo.ts:3` | - |
| `automationStudioMarkRunAdapting` | Value | `packages/fluxiq/src/programs/automation-studio/runtime/run-control/mark-adapting.ts:12` | - |
| `automationStudioMatchName` | Value | `packages/fluxiq/src/programs/automation-studio/nodes/name-match/match-name.ts:34` | - |
| `automationStudioMatchWrittenParameterName` | Value | `packages/fluxiq/src/programs/automation-studio/runtime/flow-bootstrap/plan/name-correction.ts:153` | - |
| `AutomationStudioMemoryRepository` | Class | `packages/fluxiq/src/programs/automation-studio/storage/memory-repository.ts:19` | - |
| `AutomationStudioMemoryRepositoryOptions` | Type | `packages/fluxiq/src/programs/automation-studio/storage/memory-repository.ts:15` | - |
| `AutomationStudioMemoryUiCacheStore` | Class | `packages/fluxiq/src/programs/automation-studio/storage/project/ui-cache-store.ts:125` | - |
| `automationStudioMetadataWithFlowVersions` | Value | `packages/fluxiq/src/programs/automation-studio/runtime/flow-version/flow-versions-metadata.ts:13` | - |
| `automationStudioMigrationChecksum` | Value | `packages/fluxiq/src/programs/automation-studio/storage/schema-migrations.ts:256` | - |
| `AutomationStudioMigrationJob` | Type | `packages/fluxiq/src/programs/automation-studio/storage/project/administration.ts:49` | - |
| `AutomationStudioMigrationJobRepository` | Class | `packages/fluxiq/src/programs/automation-studio/storage/project/administration.ts:286` | - |
| `AutomationStudioMigrationJobStatus` | Type | `packages/fluxiq/src/programs/automation-studio/storage/project/administration.ts:48` | - |
| `AutomationStudioMigrationManifestKind` | Type | `packages/fluxiq/src/programs/automation-studio/storage/project/migration-cutover.ts:35` | - |
| `AutomationStudioMigrationManifestRecord` | Type | `packages/fluxiq/src/programs/automation-studio/storage/project/migration-cutover.ts:127` | - |
| `AutomationStudioMigrationVerificationReport` | Type | `packages/fluxiq/src/programs/automation-studio/storage/project/migration-cutover.ts:103` | - |
| `automationStudioMutationDigest` | Value | `packages/fluxiq/src/programs/automation-studio/storage/project/unit-of-work.ts:162` | - |
| `AutomationStudioMutationRecord` | Type | `packages/fluxiq/src/programs/automation-studio/storage/project/unit-of-work.ts:8` | - |
| `AutomationStudioMutationRecordStatus` | Type | `packages/fluxiq/src/programs/automation-studio/storage/project/unit-of-work.ts:7` | - |
| `AutomationStudioMutationTouchedEntity` | Type | `packages/fluxiq/src/programs/automation-studio/storage/project/unit-of-work.ts:25` | - |
| `AutomationStudioNameCandidate` | Type | `packages/fluxiq/src/programs/automation-studio/nodes/name-match/candidate.ts:12` | One name a written name may be resolved to: a node id, a parameter id, an output id. `accepts` is optional because a caller often knows the names without knowing what each one takes, and a caller that does know gets a better answer for the same call. `accepts` admits an explicit `undefined` so a caller can pass a shape it derived and may not have found, without building the object two ways. |
| `AutomationStudioNamedCandidate` | Type | `packages/fluxiq/src/programs/automation-studio/runtime/conversations/instructions/closest.ts:20` | A name to match against, and the other ways it is known: a title, phrases, a Flow's own name. |
| `automationStudioNameEditDistance` | Value | `packages/fluxiq/src/programs/automation-studio/nodes/name-match/edit-distance.ts:10` | - |
| `AutomationStudioNameMatch` | Type | `packages/fluxiq/src/programs/automation-studio/nodes/name-match/match.ts:6` | The name a written name resolved to, and how much of that resolution was a guess. A caller reports `how` back to the model and to the run record, so a corrected name is visible rather than silently substituted. |
| `automationStudioNameSimilarity` | Value | `packages/fluxiq/src/programs/automation-studio/nodes/name-match/similarity.ts:28` | - |
| `automationStudioNameSynonymCredit` | Value | `packages/fluxiq/src/programs/automation-studio/nodes/name-match/synonyms.ts:69` | - |
| `automationStudioNameTokenCredit` | Value | `packages/fluxiq/src/programs/automation-studio/nodes/name-match/token-credit.ts:69` | - |
| `automationStudioNameTokenOverlap` | Value | `packages/fluxiq/src/programs/automation-studio/nodes/name-match/token-overlap.ts:34` | - |
| `AutomationStudioNameTokenOverlapResult` | Type | `packages/fluxiq/src/programs/automation-studio/nodes/name-match/token-overlap.ts:4` | How much two normalised names share as tokens, from two angles. |
| `AutomationStudioNameValueShape` | Type | `packages/fluxiq/src/programs/automation-studio/nodes/name-match/value-shape.ts:6` | What a named thing accepts, at the coarseness a model's guess can be judged against. It is a tie-break signal, not a type system: `unknown` means the caller does not know, and carries no signal either way. |
| `automationStudioNameWords` | Value | `packages/fluxiq/src/programs/automation-studio/runtime/conversations/instructions/closest.ts:37` | - |
| `AutomationStudioNativeExecution` | Type | `packages/fluxiq/src/programs/automation-studio/runtime/native-node-runtime.ts:16` | - |
| `AutomationStudioNativeLogEntry` | Type | `packages/fluxiq/src/programs/automation-studio/nodes/importer-sdk.ts:72` | - |
| `AutomationStudioNativeNodeContext` | Type | `packages/fluxiq/src/programs/automation-studio/nodes/importer-sdk.ts:73` | - |
| `AutomationStudioNativeNodeImplementation` | Type | `packages/fluxiq/src/programs/automation-studio/nodes/importer-sdk.ts:89` | - |
| `AutomationStudioNativeNodeRuntime` | Class | `packages/fluxiq/src/programs/automation-studio/runtime/native-node-runtime.ts:22` | Explicit trusted-local implementation binder. This is an authorization and tracing boundary, not a security sandbox or containment mechanism. |
| `AutomationStudioNativeRuntimeGrants` | Type | `packages/fluxiq/src/programs/automation-studio/runtime/native-node-runtime.ts:7` | - |
| `automationStudioNextResultCheckOrdinal` | Value | `packages/fluxiq/src/programs/automation-studio/runtime/result-check-schedule/ordinals.ts:50` | - |
| `automationStudioNodeAdaptationIds` | Value | `packages/fluxiq/src/programs/automation-studio/runtime/flow-change/contracts.ts:262` | - |
| `AutomationStudioNodeAttemptTrace` | Type | `packages/fluxiq/src/programs/automation-studio/runtime/executor/contracts.ts:153` | - |
| `AutomationStudioNodeAvailability` | Type | `packages/fluxiq/src/programs/automation-studio/nodes/definitions.ts:11` | - |
| `AutomationStudioNodeCapabilities` | Type | `packages/fluxiq/src/programs/automation-studio/nodes/definitions.ts:23` | - |
| `AutomationStudioNodeDefinition` | Type | `packages/fluxiq/src/programs/automation-studio/nodes/definitions.ts:67` | Canonical node contract used by new Flow authoring surfaces. Existing AutomationNodeDefinition remains the executable built-in contract until the runtime adopts this registry in a later slice. |
| `AutomationStudioNodeDefinitionMatch` | Type | `packages/fluxiq/src/programs/automation-studio/nodes/canonical-registry.ts:15` | A definition a written node id resolved to, with how much of it was a guess. |
| `AutomationStudioNodeEditorHints` | Type | `packages/fluxiq/src/programs/automation-studio/nodes/definitions.ts:55` | - |
| `automationStudioNodeMutates` | Value | `packages/fluxiq/src/programs/automation-studio/runtime/executor/defensive/node-side-effect.ts:41` | - |
| `AutomationStudioNodeOutputActionContract` | Type | `packages/fluxiq/src/programs/automation-studio/nodes/definitions.ts:50` | - |
| `AutomationStudioNodeParameterContract` | Type | `packages/fluxiq/src/programs/automation-studio/nodes/definitions.ts:108` | A domain's check of one parameter value on a node it registered, bound with `AutomationStudioNodeRegistry.bindParameterContract`. Flow Bootstrap calls it while it validates a generated plan, so a structured value the domain would refuse at dispatch is refused before the plan is accepted. - It is called only for a literal value that already has the parameter's declared type. A value that is itself a state binding is not checked; a value holding a nested binding is passed as it is, `{ $state: { path } }` included, and a contract that does not accept one there refuses it. - `value` is a copy: changing it changes nothing. - It must be synchronous, and return stable issue codes, empty when the value is acceptable. A code is lower-case and dot-separated, at most 120 characters, never starts with `bootstrap.`, and never carries the value. Any other code is reported as `bootstrap.parameter_contract_violation`, and at most 8 codes are kept for one value. A throw, or an answer that is not an array, is reported as `bootstrap.parameter_contract_failed`. |
| `automationStudioNodeReadinessState` | Value | `packages/fluxiq/src/programs/automation-studio/runtime/executor/recorded-state.ts:83` | - |
| `AutomationStudioNodeRegistry` | Class | `packages/fluxiq/src/programs/automation-studio/nodes/canonical-registry.ts:32` | Scope-aware definition registry for new Flow authoring paths. This registry intentionally registers declarative importer manifests only. Loading importer code and binding execution adapters remains a later runtime concern, so an editor cannot acquire arbitrary host code by browsing nodes. The one piece of host code it holds is a parameter contract: a check the host that registered a node binds to it explicitly, which plan validation calls and nothing executes. It is kept beside the definitions rather than on them, so a definition stays plain data. |
| `AutomationStudioNodeRegistryResolution` | Type | `packages/fluxiq/src/programs/automation-studio/nodes/definitions.ts:121` | - |
| `automationStudioNodeRepeatCannotAct` | Value | `packages/fluxiq/src/programs/automation-studio/runtime/executor/defensive/node-side-effect.ts:73` | - |
| `automationStudioNodeRepeatIsSafe` | Value | `packages/fluxiq/src/programs/automation-studio/runtime/executor/defensive/node-side-effect.ts:95` | - |
| `AutomationStudioNodeReplayKind` | Type | `packages/fluxiq/src/programs/automation-studio/runtime/llm/node-tools/replay.ts:62` | - |
| `automationStudioNodeReplayResetCall` | Value | `packages/fluxiq/src/programs/automation-studio/runtime/llm/node-tools/replay.ts:92` | - |
| `automationStudioNodeReplayStatus` | Value | `packages/fluxiq/src/programs/automation-studio/runtime/llm/node-tools/replay.ts:154` | - |
| `automationStudioNodeReplayStepCall` | Value | `packages/fluxiq/src/programs/automation-studio/runtime/llm/node-tools/replay.ts:106` | - |
| `automationStudioNodeReplayToolId` | Value | `packages/fluxiq/src/programs/automation-studio/runtime/llm/node-tools/replay.ts:137` | - |
| `automationStudioNodeReplayVerifyCall` | Value | `packages/fluxiq/src/programs/automation-studio/runtime/llm/node-tools/replay.ts:126` | - |
| `automationStudioNodeRerunFromItsPlace` | Value | `packages/fluxiq/src/programs/automation-studio/runtime/llm/node-tools/step-place.ts:47` | - |
| `AutomationStudioNodeRerunPlace` | Type | `packages/fluxiq/src/programs/automation-studio/runtime/llm/node-tools/step-place.ts:40` | Where a rerun runs: as the target stands, after it was put back, or nowhere. |
| `automationStudioNodeRetryPolicy` | Value | `packages/fluxiq/src/programs/automation-studio/runtime/executor/retry-policy.ts:51` | - |
| `AutomationStudioNodeRetryPolicy` | Type | `packages/fluxiq/src/programs/automation-studio/runtime/executor/retry-policy.ts:15` | How many times one node may be attempted, and how long the run waits between those attempts. `maxAttempts` counts the first attempt, so the default of three means one attempt and two retries. `backoffMs` is read by attempt number: the wait before attempt two is `backoffMs[0]`, before attempt three `backoffMs[1]`, and a policy with fewer entries than attempts repeats its last one. |
| `AutomationStudioNodeRuntimeRequirements` | Type | `packages/fluxiq/src/programs/automation-studio/nodes/definitions.ts:42` | - |
| `AutomationStudioNodeSafety` | Type | `packages/fluxiq/src/programs/automation-studio/nodes/definitions.ts:35` | - |
| `automationStudioNodeSideEffectClass` | Value | `packages/fluxiq/src/programs/automation-studio/runtime/executor/defensive/node-side-effect.ts:15` | - |
| `AutomationStudioNodeSideEffectClass` | Type | `packages/fluxiq/src/programs/automation-studio/runtime/executor/defensive/contracts.ts:63` | How consequential a node is, which decides whether an ambiguous fault may be attempted again and whether a Flow may walk past the node's failure. `none` and `internal` change nothing outside the run. `external` and `destructive` act on the world, so a second attempt is a second act unless the node says it is safe to repeat. |
| `AutomationStudioNodeSource` | Type | `packages/fluxiq/src/programs/automation-studio/nodes/definitions.ts:16` | - |
| `AutomationStudioNoRepairReason` | Type | `packages/fluxiq/src/programs/automation-studio/runtime/llm/harness/structured-response.ts:43` | - |
| `automationStudioObjectApiPath` | Value | `packages/fluxiq/src/programs/automation-studio/storage/object-store.ts:338` | - |
| `AutomationStudioObjectAsset` | Type | `packages/fluxiq/src/programs/automation-studio/storage/object-store.ts:21` | - |
| `automationStudioObjectContentRef` | Value | `packages/fluxiq/src/programs/automation-studio/storage/object-store.ts:334` | - |
| `AutomationStudioObjectCursorPage` | Type | `packages/fluxiq/src/programs/automation-studio/storage/project/object-repository.ts:26` | - |
| `AutomationStudioObjectIndex` | Type | `packages/fluxiq/src/programs/automation-studio/storage/file-store.ts:125` | - |
| `AutomationStudioObjectOwner` | Type | `packages/fluxiq/src/programs/automation-studio/storage/file-store.ts:109` | - |
| `AutomationStudioObjectReference` | Type | `packages/fluxiq/src/programs/automation-studio/storage/object-store.ts:11` | - |
| `AutomationStudioObjectStore` | Class | `packages/fluxiq/src/programs/automation-studio/storage/object-store.ts:37` | - |
| `AutomationStudioObjectSummary` | Type | `packages/fluxiq/src/programs/automation-studio/storage/file-store.ts:115` | - |
| `AutomationStudioObjectWriteOptions` | Type | `packages/fluxiq/src/programs/automation-studio/storage/object-store.ts:32` | - |
| `AutomationStudioObservation` | Type | `packages/fluxiq/src/programs/automation-studio/runtime/adapters.ts:4` | - |
| `AutomationStudioPackReusableLlmContextsRequest` | Type | `packages/fluxiq/src/programs/automation-studio/api/contracts/llm.ts:15` | - |
| `AutomationStudioPageCursor` | Type | `packages/fluxiq/src/programs/automation-studio/storage/paging.ts:7` | - |
| `automationStudioPageLimit` | Value | `packages/fluxiq/src/programs/automation-studio/storage/paging.ts:14` | - |
| `AutomationStudioPanel` | Type | `packages/fluxiq/src/programs/automation-studio/ui/contracts.ts:1` | - |
| `AutomationStudioPanelCapability` | Type | `packages/fluxiq/src/programs/automation-studio/runtime/panel-capabilities/capability.ts:47` | One capability, as the model is shown it. The fields are exactly what the panel's `panelCapabilityVocabulary()` produces, so the browser hands its own list straight across with no translation step to fall out of date. |
| `AutomationStudioPanelCapabilityArgument` | Type | `packages/fluxiq/src/programs/automation-studio/runtime/panel-capabilities/capability.ts:24` | A value a capability takes, described for whoever has to supply it. |
| `automationStudioPanelCapabilityIds` | Value | `packages/fluxiq/src/programs/automation-studio/runtime/panel-capabilities/vocabulary.ts:52` | - |
| `automationStudioPanelCapabilityVocabulary` | Value | `packages/fluxiq/src/programs/automation-studio/runtime/panel-capabilities/vocabulary.ts:36` | - |
| `automationStudioPanelCommandKeyFromSecretKeys` | Value | `packages/fluxiq/src/programs/automation-studio/runtime/llm/deepseek/panel-command-key.ts:17` | - |
| `AutomationStudioPanelCommandKeyPorts` | Type | `packages/fluxiq/src/programs/automation-studio/runtime/llm/deepseek/panel-command-key.ts:9` | - |
| `automationStudioPanelInvocationRef` | Value | `packages/fluxiq/src/programs/automation-studio/runtime/conversations/instructions/respond.ts:112` | - |
| `automationStudioParkedRun` | Value | `packages/fluxiq/src/programs/automation-studio/runtime/parking/parked-run.ts:70` | - |
| `AutomationStudioParkedRun` | Type | `packages/fluxiq/src/programs/automation-studio/runtime/parking/parked-run.ts:42` | A run stopped on a question, and everything needed to go on from it. It rides on the trace, which is what the runtime already persists, so a parked run survives wherever its run record survives and needs no store of its own. Resuming reads this beside the trace it sits on and carries on from the node named here -- it never runs the node again, so nothing the run already did happens twice. |
| `AutomationStudioParkedRunCarry` | Type | `packages/fluxiq/src/programs/automation-studio/runtime/parking/parked-run.ts:24` | What a parked run held that its trace does not already carry. Deliberately not a second copy of the run: `values`, `attempts`, `effects` and the region transitions are on the trace the parked run returned, and duplicating them here would double what is persisted and leave two records to disagree. What is here is what lives only in memory while a run executes -- its variables, its loop positions, and how much of its step budget it has spent -- and would otherwise be lost the moment the run returned. |
| `AutomationStudioParkingPort` | Type | `packages/fluxiq/src/programs/automation-studio/runtime/parking/port.ts:13` | Where an ask goes, and -- when the host can hold a run in place -- where its answer comes back from. The executor raises asks; it does not know what a conversation is. Binding a port is what turns "this run has a question" into a person being asked. A run with no port bound still parks and is still resumable: the port decides whether anybody hears about it, not whether the run can go on. |
| `AutomationStudioParkRefusalReason` | Type | `packages/fluxiq/src/programs/automation-studio/runtime/parking/settlement.ts:5` | Why an answer did not move a parked run on. |
| `AutomationStudioPermissionAsk` | Type | `packages/fluxiq/src/programs/automation-studio/runtime/parking/permission-ask.ts:43` | Where a permission question goes, and where its answer comes back from. |
| `automationStudioPermissionAskOutcome` | Value | `packages/fluxiq/src/programs/automation-studio/runtime/parking/permission-ask.ts:87` | - |
| `AutomationStudioPermissionAskOutcome` | Type | `packages/fluxiq/src/programs/automation-studio/runtime/parking/permission-ask.ts:76` | How one permission question came back. `granted` and `declined` are a person's own answer, `grant` and `deny` in the thread. `unanswered` is everything else: nobody answered before the wait ran out, the caller did not wait, the wait was cancelled, or the thread could not be written to or read. The difference matters to a caller that keeps going after a refusal. A person who said no to one control is still there to be asked about another; a person who never answered is not, and asking them again only costs another wait (t195-w18). |
| `automationStudioPermissionAskWaitMs` | Value | `packages/fluxiq/src/programs/automation-studio/runtime/parking/permission-ask.ts:60` | - |
| `automationStudioPersonNeededAnswerIsDone` | Value | `packages/fluxiq/src/programs/automation-studio/runtime/parking/person-needed-ask.ts:75` | - |
| `automationStudioPersonNeededAsk` | Value | `packages/fluxiq/src/programs/automation-studio/runtime/parking/person-needed-ask.ts:96` | - |
| `automationStudioPersonNeededAskDraft` | Value | `packages/fluxiq/src/programs/automation-studio/runtime/parking/person-needed-ask.ts:48` | - |
| `automationStudioPersonNeededEnding` | Value | `packages/fluxiq/src/programs/automation-studio/runtime/executor/person-needed.ts:104` | - |
| `AutomationStudioPersonNeededEnding` | Type | `packages/fluxiq/src/programs/automation-studio/runtime/parking/person-needed-tool-calls.ts:50` | Why work stopped for a person: how the last question came out, or the bound. |
| `automationStudioPersonNeededLookCallId` | Value | `packages/fluxiq/src/programs/automation-studio/runtime/parking/person-needed-tool-calls.ts:86` | - |
| `AutomationStudioPersonNeededOutcome` | Type | `packages/fluxiq/src/programs/automation-studio/runtime/parking/person-needed-ask.ts:89` | How one person-needed question came out, for a caller that waited on it. `done` is the only outcome the work goes on from. The others each end it with a person-needed code, and are told apart only so the ending can say which: the person pressed Stop (`stopped`), nobody answered in time (`timed_out`), the question could not be put or waited on at all (`unreachable`), or the caller's own work was cancelled while it waited (`cancelled`). |
| `automationStudioPersonNeededStep` | Value | `packages/fluxiq/src/programs/automation-studio/runtime/executor/person-needed.ts:66` | - |
| `AutomationStudioPersonNeededStep` | Type | `packages/fluxiq/src/programs/automation-studio/runtime/executor/person-needed.ts:43` | What the executor does about one failed attempt, as far as a person is concerned. |
| `automationStudioPersonNeededToolCalls` | Value | `packages/fluxiq/src/programs/automation-studio/runtime/parking/person-needed-tool-calls.ts:95` | - |
| `AutomationStudioPersonNeededToolCalls` | Type | `packages/fluxiq/src/programs/automation-studio/runtime/parking/person-needed-tool-calls.ts:70` | - |
| `automationStudioPlanDetails` | Value | `packages/fluxiq/src/programs/automation-studio/storage/query-plan.ts:9` | - |
| `AutomationStudioPlanNodeHandleSite` | Type | `packages/fluxiq/src/programs/automation-studio/runtime/llm/harness-options/plan-node-handles.ts:45` | Where a handle is named inside a node's parameters, and which one. |
| `automationStudioPlanNodeHandleSites` | Value | `packages/fluxiq/src/programs/automation-studio/runtime/llm/harness-options/plan-node-handles.ts:64` | - |
| `automationStudioPlanNodeParametersNameHandle` | Value | `packages/fluxiq/src/programs/automation-studio/runtime/llm/harness-options/plan-node-handles.ts:107` | - |
| `automationStudioPlanStepConsequences` | Value | `packages/fluxiq/src/programs/automation-studio/runtime/llm/harness-options/plan-step-consequences.ts:71` | - |
| `AutomationStudioPlanStepConsequences` | Type | `packages/fluxiq/src/programs/automation-studio/runtime/llm/harness-options/plan-step-consequences.ts:58` | A step's declaration, read out of its parameters. - `declared` absent: the step said nothing. The domain decides whether a step of its kind may leave it unsaid. - `declared` empty: the step said, in so many words, that it causes nothing lasting. Nothing is asked of anybody. - `malformed`: something was written and Core could not read it as its own classes. The step is refused. |
| `AutomationStudioProblem` | Type | `packages/fluxiq/src/programs/automation-studio/api/contracts/project.ts:40` | - |
| `AutomationStudioProblemPage` | Type | `packages/fluxiq/src/programs/automation-studio/runtime/service/problems/contracts.ts:5` | - |
| `AutomationStudioProject` | Type | `packages/fluxiq/src/programs/automation-studio/api/contracts/project.ts:6` | - |
| `AutomationStudioProjectAdaptationStore` | Class | `packages/fluxiq/src/programs/automation-studio/storage/project/adaptation-store.ts:45` | - |
| `AutomationStudioProjectAdministration` | Class | `packages/fluxiq/src/programs/automation-studio/storage/project/administration.ts:152` | - |
| `AutomationStudioProjectArtifactKind` | Type | `packages/fluxiq/src/programs/automation-studio/model/artifacts.ts:5` | `task`, `routine`, and owner-bound `flow` are legacy compatibility kinds. New executable work uses canonical Flow APIs. |
| `AutomationStudioProjectArtifacts` | Type | `packages/fluxiq/src/programs/automation-studio/model/artifacts.ts:87` | - |
| `AutomationStudioProjectCatalogRepository` | Class | `packages/fluxiq/src/programs/automation-studio/storage/catalog.ts:85` | - |
| `AutomationStudioProjectCategory` | Type | `packages/fluxiq/src/programs/automation-studio/api/contracts/project.ts:17` | - |
| `AutomationStudioProjectChangeFeedEvent` | Type | `packages/fluxiq/src/programs/automation-studio/api/contracts/change-feed.ts:20` | - |
| `AutomationStudioProjectChangeFeedPage` | Type | `packages/fluxiq/src/programs/automation-studio/api/contracts/change-feed.ts:39` | - |
| `AutomationStudioProjectChangeFeedRequest` | Type | `packages/fluxiq/src/programs/automation-studio/api/contracts/change-feed.ts:33` | - |
| `AutomationStudioProjectCompiledPlanStore` | Class | `packages/fluxiq/src/programs/automation-studio/storage/project/compiled-plan-store.ts:59` | - |
| `AutomationStudioProjectContentAsset` | Type | `packages/fluxiq/src/programs/automation-studio/storage/project/content-store.ts:15` | - |
| `AutomationStudioProjectContentProtection` | Interface | `packages/fluxiq/src/programs/automation-studio/storage/project/content-protection.ts:10` | Generic project-content protection boundary. Implementations must authenticate project and media-type context. |
| `AutomationStudioProjectContentProtectionKey` | Type | `packages/fluxiq/src/programs/automation-studio/storage/project/content-protection.ts:5` | - |
| `AutomationStudioProjectContentProtectionKeyResolver` | Type | `packages/fluxiq/src/programs/automation-studio/storage/project/content-protection.ts:6` | - |
| `AutomationStudioProjectContentStore` | Class | `packages/fluxiq/src/programs/automation-studio/storage/project/content-store.ts:17` | - |
| `AutomationStudioProjectContentWrite` | Type | `packages/fluxiq/src/programs/automation-studio/storage/project/content-store.ts:8` | - |
| `AutomationStudioProjectConversationStore` | Class | `packages/fluxiq/src/programs/automation-studio/runtime/conversations/store.ts:59` | - |
| `automationStudioProjectCustomNodeRoot` | Object | `packages/fluxiq/src/programs/automation-studio/nodes/layout.ts:11` | - |
| `AutomationStudioProjectDatabase` | Class | `packages/fluxiq/src/programs/automation-studio/storage/project/database.ts:121` | - |
| `AutomationStudioProjectDatabaseLease` | Type | `packages/fluxiq/src/programs/automation-studio/storage/project/database.ts:23` | - |
| `AutomationStudioProjectDatabasePool` | Class | `packages/fluxiq/src/programs/automation-studio/storage/project/database.ts:36` | - |
| `AutomationStudioProjectDatabasePoolOptions` | Type | `packages/fluxiq/src/programs/automation-studio/storage/project/database.ts:29` | - |
| `AutomationStudioProjectEventChunkStore` | Class | `packages/fluxiq/src/programs/automation-studio/storage/project/event-chunk-store.ts:32` | - |
| `AutomationStudioProjectEventStreamStore` | Class | `packages/fluxiq/src/programs/automation-studio/storage/project/event-stream-writer.ts:13` | - |
| `AutomationStudioProjectFlowGraphJudgementStore` | Class | `packages/fluxiq/src/programs/automation-studio/storage/project/graph-judgement-store.ts:36` | - |
| `AutomationStudioProjectFlowResourceMutations` | Class | `packages/fluxiq/src/programs/automation-studio/storage/project/flow-resource-mutations.ts:7` | - |
| `AutomationStudioProjectFlowResourceRepository` | Class | `packages/fluxiq/src/programs/automation-studio/storage/project/flow-resource-repository.ts:55` | - |
| `AutomationStudioProjectFlowRunActionPage` | Type | `packages/fluxiq/src/programs/automation-studio/storage/project/runtime-stream-store.ts:57` | - |
| `AutomationStudioProjectGraphRepository` | Class | `packages/fluxiq/src/programs/automation-studio/storage/project/graph-store.ts:35` | - |
| `AutomationStudioProjectHierarchy` | Type | `packages/fluxiq/src/programs/automation-studio/api/contracts/hierarchy.ts:14` | - |
| `AutomationStudioProjectHierarchyFeed` | Class | `packages/fluxiq/src/programs/automation-studio/storage/project/hierarchy/feed.ts:27` | - |
| `AutomationStudioProjectHierarchyMutations` | Class | `packages/fluxiq/src/programs/automation-studio/storage/project/hierarchy/mutations.ts:7` | - |
| `AutomationStudioProjectHierarchyRepository` | Class | `packages/fluxiq/src/programs/automation-studio/storage/project/hierarchy/repository.ts:26` | - |
| `AutomationStudioProjectMeta` | Type | `packages/fluxiq/src/programs/automation-studio/storage/project/administration.ts:10` | - |
| `AutomationStudioProjectMetaRepository` | Class | `packages/fluxiq/src/programs/automation-studio/storage/project/administration.ts:187` | - |
| `AutomationStudioProjectMigrationCutoverStore` | Class | `packages/fluxiq/src/programs/automation-studio/storage/project/migration-cutover.ts:202` | - |
| `AutomationStudioProjectMutationContext` | Type | `packages/fluxiq/src/programs/automation-studio/storage/project/unit-of-work.ts:33` | - |
| `AutomationStudioProjectObjectRecord` | Type | `packages/fluxiq/src/programs/automation-studio/storage/project/object-repository.ts:5` | - |
| `AutomationStudioProjectObjectReferenceRecord` | Type | `packages/fluxiq/src/programs/automation-studio/storage/project/object-repository.ts:17` | - |
| `AutomationStudioProjectObjectRepository` | Class | `packages/fluxiq/src/programs/automation-studio/storage/project/object-repository.ts:28` | - |
| `AutomationStudioProjectRetentionStore` | Class | `packages/fluxiq/src/programs/automation-studio/storage/project/retention-store.ts:9` | - |
| `AutomationStudioProjectReusableLlmContextStore` | Class | `packages/fluxiq/src/programs/automation-studio/storage/project/reusable-llm-context-store.ts:94` | Project-isolated durable storage for domain-sanitized, prompt-safe reusable LLM context. Disabled unless explicitly enabled. |
| `AutomationStudioProjectRunDatasetStore` | Class | `packages/fluxiq/src/programs/automation-studio/storage/project/run-dataset-store.ts:114` | The rows runs capture per dataset, stored raw in `project.sqlite` (CD16) and kept as long as the project unless deleted (CD17), with the project catalog of tables per Flow (CD21) and typed audit events (CD20). |
| `AutomationStudioProjectRuntimeRunSummaryPage` | Type | `packages/fluxiq/src/programs/automation-studio/storage/project/runtime-stream-store.ts:50` | - |
| `AutomationStudioProjectRuntimeStreamStore` | Class | `packages/fluxiq/src/programs/automation-studio/storage/project/runtime-stream-store.ts:97` | - |
| `AutomationStudioProjectSummary` | Type | `packages/fluxiq/src/programs/automation-studio/storage/file-store.ts:8` | - |
| `AutomationStudioProjectUiCacheEntry` | Type | `packages/fluxiq/src/programs/automation-studio/api/contracts/ui-cache.ts:3` | - |
| `AutomationStudioProjectUiCachePutEntry` | Type | `packages/fluxiq/src/programs/automation-studio/api/contracts/ui-cache.ts:12` | - |
| `AutomationStudioProjectUiCacheStats` | Type | `packages/fluxiq/src/programs/automation-studio/api/contracts/ui-cache.ts:51` | - |
| `AutomationStudioProjectUnitOfWork` | Class | `packages/fluxiq/src/programs/automation-studio/storage/project/unit-of-work.ts:49` | - |
| `AutomationStudioProposalApprovalGateDecision` | Type | `packages/fluxiq/src/programs/automation-studio/runtime/training-modes.ts:128` | - |
| `AutomationStudioProposalApprovalGateInput` | Type | `packages/fluxiq/src/programs/automation-studio/runtime/training-modes.ts:120` | - |
| `AutomationStudioProposalSummary` | Type | `packages/fluxiq/src/programs/automation-studio/storage/file-store.ts:49` | - |
| `AutomationStudioProposalSummaryIndex` | Type | `packages/fluxiq/src/programs/automation-studio/storage/file-store.ts:64` | - |
| `AutomationStudioProtectedProjectContent` | Type | `packages/fluxiq/src/programs/automation-studio/storage/project/content-protection.ts:7` | - |
| `AutomationStudioPublishedFlowSnapshot` | Type | `packages/fluxiq/src/programs/automation-studio/model/composites.ts:8` | - |
| `AutomationStudioPurgeExpiredReusableLlmContextsRequest` | Type | `packages/fluxiq/src/programs/automation-studio/api/contracts/llm.ts:13` | - |
| `AutomationStudioPutReusableLlmContextRequest` | Type | `packages/fluxiq/src/programs/automation-studio/api/contracts/llm.ts:7` | - |
| `AutomationStudioQueryPlanRow` | Type | `packages/fluxiq/src/programs/automation-studio/storage/query-plan.ts:3` | - |
| `AutomationStudioReadActionDeclaration` | Type | `packages/fluxiq/src/programs/automation-studio/runtime/action-permissions/declaration.ts:125` | A declaration after Core has read it: consequences deduplicated, text trimmed. |
| `automationStudioReadinessCeilingMs` | Value | `packages/fluxiq/src/programs/automation-studio/runtime/executor/recorded-state.ts:69` | - |
| `AutomationStudioReadinessOutcome` | Type | `packages/fluxiq/src/programs/automation-studio/runtime/executor/ladder-run.ts:154` | What a readiness wait observed, or nothing when the node names no state to wait for. |
| `automationStudioReauthorBrief` | Value | `packages/fluxiq/src/programs/automation-studio/runtime/recovery/refuted-result/brief.ts:52` | - |
| `automationStudioReauthorRefutedResult` | Value | `packages/fluxiq/src/programs/automation-studio/runtime/recovery/refuted-result/reauthor.ts:124` | - |
| `AutomationStudioRecordBatch` | Type | `packages/fluxiq/src/programs/automation-studio/runtime/executor/contracts.ts:297` | The rows one record output captured from one successful dispatch, handed to `onRecordBatch`. `rows` is the array the node's `records` output holds and the one put back at `recordsPath` inside its `result`: validated by allowlist copy, so it holds `include` fields only, in schema order. |
| `automationStudioRecordedResultRepair` | Value | `packages/fluxiq/src/programs/automation-studio/runtime/result-verification/repair-directive.ts:128` | - |
| `automationStudioRecordedState` | Value | `packages/fluxiq/src/programs/automation-studio/runtime/executor/recorded-state.ts:41` | - |
| `AutomationStudioRecordedState` | Type | `packages/fluxiq/src/programs/automation-studio/runtime/executor/recorded-state.ts:13` | What a recorded node knows about the state it was taken in. Every node a recording proposal produces carries `stateLink`, `stateSnapshotId`, `stateRef` and `screenshotRef` in its metadata, written by `recordingCandidateStateLinkMetadata`. Until now no execution path read any of them: the recorded state was captured, stored, indexed -- and never consulted while the Flow ran. This is the reader. |
| `AutomationStudioRecorder` | Type | `packages/fluxiq/src/programs/automation-studio/runtime/contracts.ts:10` | - |
| `AutomationStudioRecordField` | Type | `packages/contracts/src/record-sets/schema.ts:25` | - |
| `AutomationStudioRecordFieldHandling` | Type | `packages/contracts/src/record-sets/schema.ts:13` | - |
| `AutomationStudioRecordingController` | Class | `packages/fluxiq/src/programs/automation-studio/runtime/recording-controller.ts:19` | - |
| `AutomationStudioRecordingControllerOptions` | Type | `packages/fluxiq/src/programs/automation-studio/runtime/recording-controller.ts:13` | - |
| `AutomationStudioRecordingMapperCandidate` | Type | `packages/fluxiq/src/programs/automation-studio/nodes/importer-sdk.ts:20` | - |
| `AutomationStudioRecordingMapperContext` | Type | `packages/fluxiq/src/programs/automation-studio/nodes/importer-sdk.ts:90` | - |
| `AutomationStudioRecordingMapperDefinition` | Type | `packages/fluxiq/src/programs/automation-studio/nodes/importer-sdk.ts:10` | - |
| `AutomationStudioRecordingMapperImplementation` | Type | `packages/fluxiq/src/programs/automation-studio/nodes/importer-sdk.ts:96` | - |
| `AutomationStudioRecordingMapperObservation` | Type | `packages/fluxiq/src/programs/automation-studio/nodes/importer-sdk.ts:11` | - |
| `AutomationStudioRecordingMapperResult` | Type | `packages/fluxiq/src/programs/automation-studio/nodes/importer-sdk.ts:42` | - |
| `AutomationStudioRecordingSummary` | Type | `packages/fluxiq/src/programs/automation-studio/storage/file-store.ts:28` | - |
| `AutomationStudioRecordingSummaryIndex` | Type | `packages/fluxiq/src/programs/automation-studio/storage/file-store.ts:44` | - |
| `AutomationStudioRecordingSummaryPage` | Type | `packages/fluxiq/src/programs/automation-studio/storage/project/runtime-stream-store.ts:66` | - |
| `AutomationStudioRecordOutput` | Type | `packages/contracts/src/record-sets/output.ts:33` | Declares that a node's output carries rows to store as a dataset. Validate any value that crossed a process or storage boundary with `parseAutomationStudioRecordOutput`. |
| `AutomationStudioRecordOutputParseResult` | Type | `packages/contracts/src/record-sets/parse-output.ts:11` | - |
| `AutomationStudioRecordParseOptions` | Type | `packages/contracts/src/record-sets/parse-schema.ts:12` | - |
| `AutomationStudioRecordSchema` | Type | `packages/contracts/src/record-sets/schema.ts:40` | The shape of every row in one dataset. Validate any value that crossed a process or storage boundary with `parseAutomationStudioRecordSchema`. |
| `AutomationStudioRecordValidationOptions` | Type | `packages/contracts/src/record-sets/validate-records.ts:6` | - |
| `AutomationStudioRecordValidationResult` | Type | `packages/contracts/src/record-sets/validate-records.ts:11` | - |
| `AutomationStudioRecordValueType` | Type | `packages/contracts/src/record-sets/schema.ts:4` | - |
| `AutomationStudioRecordWriteMode` | Type | `packages/contracts/src/record-sets/output.ts:6` | - |
| `AutomationStudioRecoveryBudget` | Type | `packages/fluxiq/src/programs/automation-studio/runtime/executor/contracts.ts:146` | - |
| `AutomationStudioRecoveryCandidate` | Type | `packages/fluxiq/src/programs/automation-studio/runtime/executor/contracts.ts:129` | - |
| `AutomationStudioRecoveryCandidateKind` | Type | `packages/fluxiq/src/programs/automation-studio/runtime/executor/contracts.ts:105` | The rungs of the recovery ladder, cheapest first, with the model last. The four in `AUTOMATION_STUDIO_LADDER_RUNG_KINDS` are the deterministic ones the executor runs itself. Each is **consumed** once it has run and is not offered again for the same arrival at the node, because any non-`llm_diagnosis` candidate still on offer tells `classifyAutomationStudioAdaptiveFailure` that a deterministic answer exists and permanently suppresses escalation to the model. |
| `AutomationStudioRecoveryContextOmission` | Type | `packages/fluxiq/src/programs/automation-studio/runtime/recovery/context.ts:166` | - |
| `AutomationStudioRecoveryContextOmissionReason` | Type | `packages/fluxiq/src/programs/automation-studio/runtime/recovery/context.ts:164` | Why a section is not in the context. `absent` means the run never produced it -- no state diff was captured, the failure was not inside a subflow, no adaptation matched. `withheld` means it existed and carried a secret-shaped value or a raw-payload key, so Core refused to carry it. There is no size reason: no section is dropped to fit. Two reasons rather than one flag, because collapsing them makes a context that lost its evidence indistinguishable from one that never had any -- which is the failure this whole record exists to prevent. In particular a refusal must never read as an absence: "the host captured no state diff" and "the state diff carried something Core will not pass on" are different problems with different answers. |
| `AutomationStudioRecoveryContextSection` | Type | `packages/fluxiq/src/programs/automation-studio/runtime/recovery/context.ts:147` | - |
| `AutomationStudioRecoveryContextSummary` | Type | `packages/fluxiq/src/programs/automation-studio/runtime/recovery/context-summary.ts:29` | - |
| `AutomationStudioRecoveryConversationReader` | Type | `packages/fluxiq/src/programs/automation-studio/runtime/recovery/refuted-result/conversation.ts:24` | The narrow slice of the conversations collaborator this reads. |
| `automationStudioRecoveryConversationTurns` | Value | `packages/fluxiq/src/programs/automation-studio/runtime/recovery/refuted-result/conversation.ts:38` | - |
| `AutomationStudioRecoveryDeadline` | Type | `packages/fluxiq/src/programs/automation-studio/runtime/recovery/recovery-deadline.ts:42` | - |
| `automationStudioRecoveryDeadlineExpired` | Value | `packages/fluxiq/src/programs/automation-studio/runtime/recovery/recovery-deadline.ts:74` | - |
| `automationStudioRecoveryDeadlineRemainingMs` | Value | `packages/fluxiq/src/programs/automation-studio/runtime/recovery/recovery-deadline.ts:70` | - |
| `AutomationStudioRecoveryDecision` | Type | `packages/fluxiq/src/programs/automation-studio/runtime/executor/contracts.ts:139` | - |
| `AutomationStudioRecoveryExplorationInput` | Type | `packages/fluxiq/src/programs/automation-studio/runtime/recovery/annotation/exploration.ts:119` | - |
| `AutomationStudioRecoveryExplorationResult` | Type | `packages/fluxiq/src/programs/automation-studio/runtime/recovery/annotation/exploration.ts:164` | - |
| `AutomationStudioRecoveryExploredPacket` | Type | `packages/fluxiq/src/programs/automation-studio/runtime/recovery/annotation/exploration.ts:162` | One packet an exploration returned, labelled for the runtime patch request. |
| `AutomationStudioRecoveryLookupInput` | Type | `packages/fluxiq/src/programs/automation-studio/runtime/executor/contracts.ts:86` | - |
| `AutomationStudioRecoveryPatchReserve` | Type | `packages/fluxiq/src/programs/automation-studio/runtime/recovery/annotation/patch-reserve.ts:36` | - |
| `automationStudioRecoveryPermissionGate` | Value | `packages/fluxiq/src/programs/automation-studio/runtime/recovery/annotation/permissions.ts:59` | - |
| `AutomationStudioRecoveryPermissions` | Type | `packages/fluxiq/src/programs/automation-studio/runtime/recovery/annotation/permissions.ts:53` | - |
| `AutomationStudioRecoveryPermissionSummary` | Type | `packages/fluxiq/src/programs/automation-studio/runtime/recovery/annotation/permissions.ts:44` | The recovery's authority, as classes only: what a run detail records and a reader compares. |
| `AutomationStudioRecoveryReplan` | Type | `packages/fluxiq/src/programs/automation-studio/runtime/recovery/annotation/replan.ts:52` | What re-planning after a look produced, and whether the look changed anything. |
| `AutomationStudioRecoveryReplanInput` | Type | `packages/fluxiq/src/programs/automation-studio/runtime/recovery/annotation/replan.ts:66` | - |
| `AutomationStudioRecoveryRunBudget` | Type | `packages/fluxiq/src/programs/automation-studio/runtime/recovery/annotation/run-budget.ts:85` | - |
| `AutomationStudioRecoveryRunBudgetInput` | Type | `packages/fluxiq/src/programs/automation-studio/runtime/recovery/annotation/run-budget.ts:57` | - |
| `AutomationStudioRecoveryTrace` | Type | `packages/fluxiq/src/programs/automation-studio/runtime/recovery/trace.ts:113` | - |
| `AutomationStudioRecoveryTraceEvent` | Type | `packages/fluxiq/src/programs/automation-studio/runtime/recovery/trace.ts:74` | - |
| `AutomationStudioRecoveryTraceRefusal` | Type | `packages/fluxiq/src/programs/automation-studio/runtime/recovery/trace.ts:87` | - |
| `AutomationStudioRecoveryTraceStage` | Type | `packages/fluxiq/src/programs/automation-studio/runtime/recovery/trace.ts:47` | - |
| `AutomationStudioRecoveryTraceStatus` | Type | `packages/fluxiq/src/programs/automation-studio/runtime/recovery/trace.ts:72` | How a stage ended. `completed` means the stage ran and produced its answer, not that the answer was good news. `skipped` means it did not need to run; `refused` means something declined to let it; `failed` means it ran and did not produce an answer. |
| `automationStudioRefutedResultAttempt` | Value | `packages/fluxiq/src/programs/automation-studio/runtime/recovery/refuted-result/attempt.ts:80` | - |
| `AutomationStudioRefutedResultAttempt` | Type | `packages/fluxiq/src/programs/automation-studio/runtime/recovery/refuted-result/attempt.ts:48` | The failure entry point's two shapes of the same attempt: the live trace the ladder classifies and patches from, and the run record the recovery context and the request's recent actions are read out of. |
| `AutomationStudioRefutedResultAttemptInput` | Type | `packages/fluxiq/src/programs/automation-studio/runtime/recovery/refuted-result/attempt.ts:53` | - |
| `automationStudioRefutedResultDegraded` | Value | `packages/fluxiq/src/programs/automation-studio/runtime/recovery/refuted-result/reauthor.ts:254` | - |
| `AutomationStudioRefutedResultFailure` | Type | `packages/fluxiq/src/programs/automation-studio/runtime/recovery/refuted-result/reauthor.ts:281` | What a reader is told about a step of this route that failed: the code, and the closed facts around it that say which kind of failure it was. Codes, flags, counts and a status number, because this is written onto the run and published from there. `accounting` and `evidenceLoop` are the failed build's own diagnostic sections, already bounded and screened by the build (`flow-bootstrap/generation-failure/diagnostic.ts`), so a build that failed part way can be walked decision by decision. |
| `automationStudioRefutedResultFlowWasReauthored` | Value | `packages/fluxiq/src/programs/automation-studio/runtime/recovery/refuted-result/reauthor.ts:300` | - |
| `AutomationStudioRefutedResultGenerated` | Type | `packages/fluxiq/src/programs/automation-studio/runtime/recovery/refuted-result/reauthor.ts:171` | What a successful re-author build answers: its adaptation, and what it spent (`generateFlowBootstrapAdaptation`'s accounting). |
| `automationStudioRefutedResultReauthorDecision` | Value | `packages/fluxiq/src/programs/automation-studio/runtime/recovery/refuted-result/reauthor.ts:79` | - |
| `AutomationStudioRefutedResultReauthorDecision` | Type | `packages/fluxiq/src/programs/automation-studio/runtime/recovery/refuted-result/reauthor.ts:67` | - |
| `automationStudioRefutedResultReauthored` | Value | `packages/fluxiq/src/programs/automation-studio/runtime/recovery/refuted-result/reauthor.ts:191` | - |
| `AutomationStudioRefutedResultReauthorRefusal` | Type | `packages/fluxiq/src/programs/automation-studio/runtime/recovery/refuted-result/reauthor.ts:61` | Why a refuted run was not re-authored, in codes a reader can key on. |
| `AutomationStudioRefutedResultRepairInput` | Type | `packages/fluxiq/src/programs/automation-studio/runtime/recovery/refuted-result/repair.ts:87` | - |
| `AutomationStudioRefutedResultRepairPort` | Type | `packages/fluxiq/src/programs/automation-studio/runtime/recovery/refuted-result/repair.ts:71` | The recovery, as the verification reaches it. A port rather than a direct call, for the reason `annotation/ports.ts` states: the recovery needs a provider resolution, a graph binding and an adaptation context, all of which the run service holds and none of which belongs in the verification. It answers the annotated run detail, or nothing when it declined to annotate at all. |
| `AutomationStudioRefutedResultRepairResult` | Type | `packages/fluxiq/src/programs/automation-studio/runtime/recovery/refuted-result/repair.ts:106` | What the entry point did with one refutation. |
| `AutomationStudioRegionExecutionPlan` | Type | `packages/fluxiq/src/programs/automation-studio/runtime/region-compiler.ts:4` | - |
| `automationStudioRepeatSuggestion` | Value | `packages/fluxiq/src/programs/automation-studio/runtime/llm/harness-options/repeat-suggestion.ts:45` | - |
| `AutomationStudioRepeatSuggestion` | Type | `packages/fluxiq/src/programs/automation-studio/runtime/llm/harness-options/repeat-suggestion.ts:39` | The sentence that goes with a suggestion, in the draft's numbers. |
| `AutomationStudioRepositories` | Type | `packages/fluxiq/src/programs/automation-studio/storage/contracts.ts:13` | - |
| `AutomationStudioRepository` | Type | `packages/fluxiq/src/programs/automation-studio/storage/contracts.ts:6` | - |
| `AutomationStudioResolvedAskRoutes` | Type | `packages/fluxiq/src/programs/automation-studio/runtime/parking/ask.ts:50` | The same three routes with every gap filled in, which is what a parked run holds. Derived from the ask's own routes rather than written out again, so a route added to the ask is a route a parked run must resolve. |
| `AutomationStudioResolvedInstruction` | Type | `packages/fluxiq/src/programs/automation-studio/runtime/llm/harness/instruction.ts:5` | - |
| `automationStudioResultCheckActivity` | Value | `packages/fluxiq/src/programs/automation-studio/runtime/result-verification/check-activity.ts:22` | - |
| `automationStudioResultCheckAskId` | Value | `packages/fluxiq/src/programs/automation-studio/runtime/result-check-schedule/conversation.ts:28` | - |
| `AutomationStudioResultCheckAuthorization` | Type | `packages/fluxiq/src/programs/automation-studio/runtime/result-check-authorization/contracts.ts:76` | - |
| `AutomationStudioResultCheckConfiguration` | Type | `packages/fluxiq/src/programs/automation-studio/runtime/result-check-schedule/configuration.ts:20` | - |
| `AutomationStudioResultCheckDecision` | Type | `packages/fluxiq/src/programs/automation-studio/runtime/result-check-schedule/contracts.ts:31` | Whether this run is checked, why, and when the next one falls due. `reason` and `code` are recorded on every run, checked or not, so a run that was not put to the question says so rather than being silent about it. |
| `automationStudioResultCheckOrdinals` | Value | `packages/fluxiq/src/programs/automation-studio/runtime/result-check-schedule/ordinals.ts:28` | - |
| `AutomationStudioResultCheckProviderPorts` | Type | `packages/fluxiq/src/programs/automation-studio/runtime/result-check-authorization/provider-contract.ts:13` | The Secret Keys operations a standing check needs, and no others. |
| `AutomationStudioResultCheckProviderResolution` | Type | `packages/fluxiq/src/programs/automation-studio/runtime/result-check-authorization/provider-contract.ts:22` | The model a standing check resolved to, with the ceiling the redemption worked out. |
| `AutomationStudioResultCheckProviderScope` | Type | `packages/fluxiq/src/programs/automation-studio/runtime/result-check-authorization/provider-contract.ts:28` | The one Flow, one key and one call ceiling this resolution is bound to. |
| `AutomationStudioResultCheckRedemption` | Type | `packages/fluxiq/src/programs/automation-studio/runtime/result-check-authorization/contracts.ts:114` | What redeeming a standing authorization produced: a bounded provider request, or the stated reason there is none. |
| `AutomationStudioResultCheckSchedule` | Type | `packages/fluxiq/src/programs/automation-studio/runtime/result-check-schedule/policy.ts:13` | - |
| `AutomationStudioResultCheckSettings` | Type | `packages/fluxiq/src/programs/automation-studio/runtime/result-check-schedule/settings.ts:33` | - |
| `AutomationStudioResultCheckShape` | Type | `packages/fluxiq/src/programs/automation-studio/runtime/result-check-schedule/settings.ts:26` | How the interval between checks changes as a Flow keeps working. `initial_then_exponential` is the default and is the user's stated schedule. The other four exist so the policy is genuinely replaceable rather than one curve with knobs: a Flow run twice a year wants `every_run`, a Flow whose result is checked by something else wants `never`, and a regulated one wants a `fixed_interval` that never widens. |
| `automationStudioResultCheckShapeValue` | Value | `packages/fluxiq/src/programs/automation-studio/runtime/result-check-schedule/settings.ts:65` | - |
| `AutomationStudioResultCheckState` | Type | `packages/fluxiq/src/programs/automation-studio/runtime/result-check-schedule/contracts.ts:14` | - |
| `AutomationStudioResultCheckThread` | Type | `packages/fluxiq/src/programs/automation-studio/runtime/result-check-schedule/conversation.ts:81` | The two methods posting a result check needs. `AutomationStudioConversationWriter` satisfies it. |
| `automationStudioResultCheckTurn` | Value | `packages/fluxiq/src/programs/automation-studio/runtime/result-check-schedule/conversation.ts:39` | - |
| `AutomationStudioResultCheckTurn` | Type | `packages/fluxiq/src/programs/automation-studio/runtime/result-check-schedule/conversation.ts:33` | One turn, or nothing. `attachment` names the dataset that was judged, where the run stored one. |
| `automationStudioResultCoreObservation` | Value | `packages/fluxiq/src/programs/automation-studio/runtime/result-verification/core-observation.ts:60` | - |
| `automationStudioResultFailureRecord` | Value | `packages/fluxiq/src/programs/automation-studio/runtime/result-verification/core-observation.ts:101` | - |
| `AutomationStudioResultFlowStepSummary` | Type | `packages/fluxiq/src/programs/automation-studio/runtime/result-verification/contracts.ts:117` | One step of the Flow that produced the result, as the judgement reads it. It carried a node id and a definition id and nothing else, and that is not enough to answer the question the judgement is asked. The instruction tells the judge to answer `no` for "a Flow with no step that could have narrowed or filtered what the request asked to narrow" -- and two definition ids apart, a Flow that filters on the right field and a Flow that filters on the wrong one are the same list of names. Five consecutive live runs were refuted with that list in front of the judge, correctly, and with nothing in the refutation that said which step was wrong. So the step now carries what the Flow authored it with, screened by `repair-context/parameter-screen.ts` -- the same projection, the same screens and the same dotted-path notation the *repair* has been shown since t139. A judgement poorer than the repair that follows it is the parity gap this closes. |
| `AutomationStudioResultJudgementText` | Type | `packages/fluxiq/src/programs/automation-studio/runtime/result-verification/repair-directive.ts:79` | What the model said, as the verdict reader hands it over: read forgivingly, never required. |
| `automationStudioResultObservation` | Value | `packages/fluxiq/src/programs/automation-studio/runtime/result-verification/verdict.ts:141` | - |
| `AutomationStudioResultReadAccount` | Type | `packages/fluxiq/src/programs/automation-studio/runtime/result-verification/contracts.ts:152` | How one read of a list went, as the judgement and the repair read it. **Why it exists.** `run-munq5s8x-6d620cdf`: the Flow's extraction followed five pages, filtered on four conditions and kept one row per link, and the check refuted its eight rows -- correctly -- then advised "add a pagination loop ... and a filter/dedup step", every part of which the step already had. It had been told "8 records stored" and a list of definition ids; the step's parameters had been cut to fit the call. The re-author was told the same. So neither could see that the read already paged, nor which of its conditions rejected the rows the request wanted. Two sources, joined by node id. The counts are the read's own account of itself, which the run record already holds (`service/summaries/ extraction-summary.ts` admits it on the attempt as `metadata.extraction`); the conditions, the paging and the dedupe key are what the Flow authored the step with. Counts, closed words, column ids and the model's own condition wording -- no locator and no page value. |
| `automationStudioResultReadAccounts` | Value | `packages/fluxiq/src/programs/automation-studio/runtime/result-verification/read-account/accounts.ts:50` | - |
| `AutomationStudioResultReadAccountsInput` | Type | `packages/fluxiq/src/programs/automation-studio/runtime/result-verification/read-account/accounts.ts:40` | - |
| `automationStudioResultReadConditionText` | Value | `packages/fluxiq/src/programs/automation-studio/runtime/result-verification/read-account/condition.ts:66` | - |
| `automationStudioResultReadEmptiedColumns` | Value | `packages/fluxiq/src/programs/automation-studio/runtime/result-verification/read-account/emptied-columns.ts:26` | - |
| `automationStudioResultReadSentence` | Value | `packages/fluxiq/src/programs/automation-studio/runtime/result-verification/read-account/sentence.ts:23` | - |
| `automationStudioResultReadStop` | Value | `packages/fluxiq/src/programs/automation-studio/runtime/result-verification/read-account/stop.ts:27` | - |
| `AutomationStudioResultReadStopMeaning` | Type | `packages/fluxiq/src/programs/automation-studio/runtime/result-verification/read-account/stop.ts:21` | Why a read's paging stopped, as what a reader does about it. |
| `AutomationStudioResultRecordSetInput` | Type | `packages/fluxiq/src/programs/automation-studio/runtime/result-verification/result-summary.ts:46` | One record set as the caller reads it out of the store. |
| `AutomationStudioResultRecordSetSummary` | Type | `packages/fluxiq/src/programs/automation-studio/runtime/result-verification/contracts.ts:73` | One record set the run stored, as the verification reads it. |
| `automationStudioResultRepairContinuation` | Value | `packages/fluxiq/src/programs/automation-studio/runtime/recovery/refuted-result/history.ts:126` | - |
| `automationStudioResultRepairDirective` | Value | `packages/fluxiq/src/programs/automation-studio/runtime/result-verification/repair-directive.ts:102` | - |
| `AutomationStudioResultRepairDirective` | Type | `packages/fluxiq/src/programs/automation-studio/runtime/result-verification/contracts.ts:290` | What to fix, and what the check itself said about it. The user's instruction of 2026-09-26: "judging answers: it should give explicit instructions on what to fix regarding the data + possible suggestions." Before this, a refutation was a verdict and a code. Five consecutive live runs were refuted as `core.result.does_not_answer_request`, correctly, and that string was the whole of what the repair was told -- so the repair had to rediscover the defect from scratch, at the cost of a second full exploration, and on the one run where it reached the model it produced no correction at all. **The two halves are kept apart because their provenance differs.** `findings` and `fix` are Core's: arithmetic over the summary it already holds, and a sentence per finding that Core wrote. `judgement` is the model's own reading, screened. A run record carries only the first two (`run-outcome.ts`); the second reaches the repair through the failure record's `expected` and `actual`, which is where a sentence written outside Core has always travelled (`llm/harness/locator-text.ts`). **Nothing here is demanded of the model.** No new response field, no new schema key, nothing a malformed answer can fail: `judgement` is read off the `expected`, `observed` and `changed` the diagnosis channel already carries, and a field that is missing, oversized, wrongly typed or refused by a screen is simply absent from the directive. A judgement that says nothing beyond `no` still produces a valid refutation with Core's own findings in it. |
| `AutomationStudioResultRepairDirectiveInput` | Type | `packages/fluxiq/src/programs/automation-studio/runtime/result-verification/repair-directive.ts:88` | - |
| `AutomationStudioResultRepairFinding` | Type | `packages/fluxiq/src/programs/automation-studio/runtime/result-verification/contracts.ts:252` | One thing wrong with what a run produced, as Core's own arithmetic found it. Coded, so a repair can act on it without reading prose, and ids only -- a column id, a record set id -- because a value belongs to the person and a count belongs to Core. `detail` is Core's sentence for a reader, never a model's. |
| `automationStudioResultRepairFindings` | Value | `packages/fluxiq/src/programs/automation-studio/runtime/result-verification/repair-directive.ts:150` | - |
| `automationStudioResultRepairHistoryEntry` | Value | `packages/fluxiq/src/programs/automation-studio/runtime/recovery/refuted-result/history.ts:95` | - |
| `AutomationStudioResultRepairHistoryEntry` | Type | `packages/fluxiq/src/programs/automation-studio/runtime/recovery/refuted-result/history.ts:66` | One refuted answer, as the next repair is shown it. `attempt` is the repair this refutation opened: 1 for the Flow as first built, 2 for the Flow the first repair produced, and so on. |
| `automationStudioResultRepairHistoryRecord` | Value | `packages/fluxiq/src/programs/automation-studio/runtime/recovery/refuted-result/history.ts:157` | - |
| `AutomationStudioResultRepairOutcome` | Type | `packages/fluxiq/src/programs/automation-studio/runtime/recovery/refuted-result/repair.ts:194` | How a repair that is not going any further ended, in words a reader can key on. - `answered`: the repaired Flow's answer was judged to answer the request. - `unverified`: its answer was put to the check and nothing was settled. - `stopped`: refuted again, and not repaired again (the marker's `stopped` says why). - `not_rerun`: the repair produced no applied edit, or the edit could not be run. - `rerun_failed`: the repaired Flow was run and did not finish with a result to judge. |
| `AutomationStudioResultRepairPart` | Type | `packages/fluxiq/src/programs/automation-studio/runtime/recovery/refuted-result/purse.ts:55` | A part of the repair the purse can refuse. |
| `automationStudioResultRepairPurse` | Value | `packages/fluxiq/src/programs/automation-studio/runtime/recovery/refuted-result/purse.ts:77` | - |
| `AutomationStudioResultRepairPurse` | Type | `packages/fluxiq/src/programs/automation-studio/runtime/recovery/refuted-result/purse.ts:58` | The repair's purse, as the run records it. |
| `automationStudioResultRepairPurseAllowsPart` | Value | `packages/fluxiq/src/programs/automation-studio/runtime/recovery/refuted-result/purse.ts:96` | - |
| `automationStudioResultRepairPurseCharged` | Value | `packages/fluxiq/src/programs/automation-studio/runtime/recovery/refuted-result/purse.ts:107` | - |
| `automationStudioResultRepairPurseLeftUsd` | Value | `packages/fluxiq/src/programs/automation-studio/runtime/recovery/refuted-result/purse.ts:88` | - |
| `automationStudioResultRepairPurseRefused` | Value | `packages/fluxiq/src/programs/automation-studio/runtime/recovery/refuted-result/purse.ts:122` | - |
| `automationStudioResultRepairSettled` | Value | `packages/fluxiq/src/programs/automation-studio/runtime/recovery/refuted-result/repair.ts:203` | - |
| `AutomationStudioResultRepairStop` | Type | `packages/fluxiq/src/programs/automation-studio/runtime/recovery/refuted-result/history.ts:54` | Why a refuted run was not re-authored again, in codes a reader can key on. |
| `automationStudioResultRepairUnchangedInARow` | Value | `packages/fluxiq/src/programs/automation-studio/runtime/recovery/refuted-result/history.ts:143` | - |
| `automationStudioResultRepairWithPurse` | Value | `packages/fluxiq/src/programs/automation-studio/runtime/recovery/refuted-result/purse.ts:127` | - |
| `automationStudioResultSummaryWithUnreadColumns` | Value | `packages/fluxiq/src/programs/automation-studio/runtime/result-verification/read-account/unread-columns.ts:21` | - |
| `automationStudioResultVerdict` | Value | `packages/fluxiq/src/programs/automation-studio/runtime/result-verification/verdict.ts:92` | - |
| `AutomationStudioResultVerdict` | Type | `packages/fluxiq/src/programs/automation-studio/runtime/result-verification/contracts.ts:46` | The verdict on whether a finished run's result answers the request. Three words, because two would force a model with no view to guess. `unsure` exists so that "I cannot tell" is sayable, and it is emphatically not a pass: `automationStudioResultVerificationAnswers` is the one reader of these values, and only `answers` passes. What any other verdict does to the run is `automationStudioResultVerificationFailsRun`'s to say: it fails the run unless two checks of the same result did not settle it. |
| `AutomationStudioResultVerdictBasis` | Type | `packages/fluxiq/src/programs/automation-studio/runtime/result-verification/contracts.ts:49` | How a verdict was reached. Recorded so a reader can tell a judgement from an unanswered question. |
| `automationStudioResultVerdictFromDiagnosis` | Value | `packages/fluxiq/src/programs/automation-studio/runtime/result-verification/verdict.ts:59` | - |
| `AutomationStudioResultVerdictInput` | Type | `packages/fluxiq/src/programs/automation-studio/runtime/result-verification/verdict.ts:65` | - |
| `AutomationStudioResultVerification` | Type | `packages/fluxiq/src/programs/automation-studio/runtime/result-verification/contracts.ts:308` | The verdict, the reason a person reads, and the observation behind it. |
| `automationStudioResultVerificationAnswers` | Value | `packages/fluxiq/src/programs/automation-studio/runtime/result-verification/contracts.ts:371` | - |
| `AutomationStudioResultVerificationBounded` | Type | `packages/fluxiq/src/programs/automation-studio/runtime/result-verification/deadline.ts:44` | What a bounded verification came to: its value, or why there is none. |
| `automationStudioResultVerificationFailsRun` | Value | `packages/fluxiq/src/programs/automation-studio/runtime/result-verification/contracts.ts:387` | - |
| `AutomationStudioResultVerificationOutcome` | Type | `packages/fluxiq/src/programs/automation-studio/runtime/result-verification/contracts.ts:358` | What a finished run's verification produced: a verdict, or a stated reason there is none. |
| `AutomationStudioResultVerificationPorts` | Type | `packages/fluxiq/src/programs/automation-studio/runtime/result-verification/run-outcome.ts:112` | Everything the verification reaches outside itself. |
| `automationStudioResultVerificationProvider` | Value | `packages/fluxiq/src/programs/automation-studio/runtime/result-verification/run-outcome.ts:96` | - |
| `AutomationStudioResultVerificationProvider` | Type | `packages/fluxiq/src/programs/automation-studio/runtime/result-verification/run-outcome.ts:104` | The model that judges a result, with whatever the resolution bounds it to. |
| `AutomationStudioResultVerificationReport` | Type | `packages/fluxiq/src/programs/automation-studio/runtime/result-verification/verify.ts:108` | The outcome, and the intervention record of each call made: none, one, or two. |
| `AutomationStudioResultVerificationRequest` | Type | `packages/fluxiq/src/programs/automation-studio/runtime/result-verification/verify.ts:84` | - |
| `AutomationStudioResultVerificationSkipped` | Type | `packages/fluxiq/src/programs/automation-studio/runtime/result-verification/contracts.ts:350` | Why a run was not verified at all. This is not a verdict and must never be read as one. A run that produces no records has no result to judge, and a deployment with no model configured cannot ask for a judgement -- neither is the model saying "it looks fine". Recording the reason is what keeps the two apart on a run's record. |
| `automationStudioResultVerificationStatus` | Value | `packages/fluxiq/src/programs/automation-studio/runtime/result-verification/verification-status.ts:40` | - |
| `AutomationStudioResultVerificationStatus` | Type | `packages/fluxiq/src/programs/automation-studio/runtime/result-verification/verification-status.ts:38` | - |
| `automationStudioResultVerificationWithinDeadline` | Value | `packages/fluxiq/src/programs/automation-studio/runtime/result-verification/deadline.ts:56` | - |
| `AutomationStudioResumeOutcome` | Type | `packages/fluxiq/src/programs/automation-studio/runtime/executor/resume.ts:18` | A resume either produces the continued run or moves nothing at all. A refusal leaves the run parked exactly as it was, so a mistaken answer costs nothing and the right one still works. |
| `automationStudioRetryBackoffMs` | Value | `packages/fluxiq/src/programs/automation-studio/runtime/executor/retry-policy.ts:78` | - |
| `automationStudioRetryHintMs` | Value | `packages/fluxiq/src/programs/automation-studio/runtime/executor/defensive/retry-hint.ts:27` | - |
| `AutomationStudioRetryWait` | Type | `packages/fluxiq/src/programs/automation-studio/runtime/executor/defensive/retry-wait.ts:32` | What one wait costs, and whether a bound shortened it. |
| `AutomationStudioReusableLlmContextAuditEvent` | Type | `packages/fluxiq/src/programs/automation-studio/storage/project/reusable-llm-context-store.ts:71` | - |
| `AutomationStudioReusableLlmContextFeatureStatus` | Type | `packages/fluxiq/src/programs/automation-studio/runtime/service/reusable-context/contracts.ts:33` | - |
| `AutomationStudioReusableLlmContextFreshEvidenceInput` | Type | `packages/fluxiq/src/programs/automation-studio/runtime/service/reusable-context/contracts.ts:13` | - |
| `AutomationStudioReusableLlmContextHostConfiguration` | Type | `packages/fluxiq/src/programs/automation-studio/runtime/service/reusable-context/contracts.ts:26` | - |
| `AutomationStudioReusableLlmContextList` | Type | `packages/fluxiq/src/programs/automation-studio/storage/project/reusable-llm-context-store.ts:55` | - |
| `AutomationStudioReusableLlmContextOption` | Type | `packages/fluxiq/src/programs/automation-studio/runtime/service/reusable-context/contracts.ts:7` | - |
| `AutomationStudioReusableLlmContextOutcome` | Type | `packages/fluxiq/src/programs/automation-studio/storage/project/reusable-llm-context-store.ts:20` | - |
| `AutomationStudioReusableLlmContextPacket` | Type | `packages/fluxiq/src/programs/automation-studio/runtime/reusable-llm-context.ts:5` | - |
| `AutomationStudioReusableLlmContextPackingResult` | Type | `packages/fluxiq/src/programs/automation-studio/runtime/reusable-llm-context.ts:20` | - |
| `AutomationStudioReusableLlmContextRecord` | Type | `packages/fluxiq/src/programs/automation-studio/storage/project/reusable-llm-context-store.ts:25` | - |
| `AutomationStudioReusableLlmContextReviewerState` | Type | `packages/fluxiq/src/programs/automation-studio/storage/project/reusable-llm-context-store.ts:21` | - |
| `AutomationStudioReusableLlmContextSelection` | Type | `packages/fluxiq/src/programs/automation-studio/runtime/service/reusable-context/contracts.ts:22` | - |
| `AutomationStudioReusableLlmContextSummary` | Type | `packages/fluxiq/src/programs/automation-studio/runtime/service/reusable-context/contracts.ts:32` | - |
| `AutomationStudioReusableLlmContextTag` | Type | `packages/fluxiq/src/programs/automation-studio/storage/project/reusable-llm-context-store.ts:23` | - |
| `AutomationStudioReusableLlmContextValidationState` | Type | `packages/fluxiq/src/programs/automation-studio/storage/project/reusable-llm-context-store.ts:22` | - |
| `AutomationStudioReusableLlmContextWrite` | Type | `packages/fluxiq/src/programs/automation-studio/storage/project/reusable-llm-context-store.ts:49` | - |
| `AutomationStudioRootIndex` | Type | `packages/fluxiq/src/programs/automation-studio/storage/file-store.ts:23` | - |
| `automationStudioRouteConditionIssues` | Value | `packages/fluxiq/src/programs/automation-studio/runtime/flow-bootstrap/plan/route-condition.ts:78` | - |
| `automationStudioRouteConditionKey` | Value | `packages/fluxiq/src/programs/automation-studio/runtime/flow-bootstrap/plan/route-condition.ts:106` | - |
| `automationStudioRouteConditionPaths` | Value | `packages/fluxiq/src/programs/automation-studio/runtime/flow-bootstrap/plan/route-condition.ts:88` | - |
| `AutomationStudioRouteDecisionRecord` | Type | `packages/fluxiq/src/programs/automation-studio/model/flow-adaptation.ts:275` | - |
| `AutomationStudioRoutePlanDiagnostic` | Type | `packages/fluxiq/src/programs/automation-studio/runtime/router-runtime.ts:38` | - |
| `AutomationStudioRouterExecutionInput` | Type | `packages/fluxiq/src/programs/automation-studio/runtime/router-runtime.ts:13` | - |
| `AutomationStudioRouterExecutionPlan` | Type | `packages/fluxiq/src/programs/automation-studio/runtime/router-runtime.ts:46` | - |
| `AutomationStudioRouterExecutionResult` | Type | `packages/fluxiq/src/programs/automation-studio/runtime/router-runtime.ts:63` | - |
| `AutomationStudioRouterRouteCounts` | Type | `packages/fluxiq/src/programs/automation-studio/storage/project/flow-resource-repository.ts:11` | - |
| `AutomationStudioRouterRoutePage` | Type | `packages/fluxiq/src/programs/automation-studio/runtime/service/flow-map-routes/contracts.ts:17` | - |
| `AutomationStudioRouterSummary` | Type | `packages/fluxiq/src/programs/automation-studio/runtime/service/indexes/types.ts:57` | - |
| `AutomationStudioRouterTargetReferenceBatch` | Type | `packages/fluxiq/src/programs/automation-studio/runtime/service/flow-map-routes/contracts.ts:26` | - |
| `AutomationStudioRouteRuleEvaluation` | Type | `packages/fluxiq/src/programs/automation-studio/runtime/router-runtime.ts:56` | - |
| `AutomationStudioRouteTarget` | Type | `packages/fluxiq/src/programs/automation-studio/model/flow-adaptation.ts:10` | - |
| `AutomationStudioRoutineArtifact` | Type | `packages/fluxiq/src/programs/automation-studio/model/artifacts.ts:64` | - |
| `automationStudioRunChangedDurableBehavior` | Value | `packages/fluxiq/src/programs/automation-studio/runtime/durable-behavior/durable-behavior-changed.ts:12` | - |
| `AutomationStudioRunCheckpoint` | Type | `packages/fluxiq/src/programs/automation-studio/runtime/run-control/types.ts:63` | Where the executor is when it asks whether it may go on. |
| `AutomationStudioRunCheckpointOutcome` | Type | `packages/fluxiq/src/programs/automation-studio/runtime/run-control/types.ts:73` | How a held run was let go. `resume` goes on from the node it held before; `stop` ends the run as cancelled with `message` -- a run stopped while held, or one held past its limit. |
| `AutomationStudioRunControlEvent` | Type | `packages/fluxiq/src/programs/automation-studio/runtime/run-control/types.ts:31` | One thing that happened to a run's control, in order. Kept for the run's record. |
| `AutomationStudioRunControlGate` | Type | `packages/fluxiq/src/programs/automation-studio/runtime/run-control/types.ts:84` | The seam the executor waits at, once per step, before it executes a node. `checkpoint` returns `null` synchronously when the run may go straight on, so an unpaused run pays no await and no scheduling change. Otherwise it returns a promise that settles when the run is let go, and never rejects. |
| `AutomationStudioRunControlHolder` | Type | `packages/fluxiq/src/programs/automation-studio/runtime/run-control/types.ts:25` | Who has the page while a run is held. `fluxiq` is a plain pause: the person asked the run to wait. `person` is a takeover: the person is acting on the page, and FluxIQ must not touch it until control is returned. |
| `AutomationStudioRunController` | Class | `packages/fluxiq/src/programs/automation-studio/runtime/run-control/run-controller.ts:54` | - |
| `AutomationStudioRunControllerInput` | Type | `packages/fluxiq/src/programs/automation-studio/runtime/run-control/run-controller.ts:45` | - |
| `automationStudioRunControlOf` | Value | `packages/fluxiq/src/programs/automation-studio/runtime/run-control/host-registry.ts:11` | - |
| `AutomationStudioRunControlPhase` | Type | `packages/fluxiq/src/programs/automation-studio/runtime/run-control/types.ts:28` | What the run is doing while it runs, as far as a person needs to know. |
| `AutomationStudioRunControlRegistry` | Class | `packages/fluxiq/src/programs/automation-studio/runtime/run-control/registry.ts:19` | - |
| `AutomationStudioRunControlRegistryOptions` | Type | `packages/fluxiq/src/programs/automation-studio/runtime/run-control/registry.ts:14` | - |
| `AutomationStudioRunControlSnapshot` | Type | `packages/fluxiq/src/programs/automation-studio/runtime/run-control/types.ts:43` | A live run's control, as any surface reads it. `nodeId` and `step` name the node the run is held *before*: it has not executed on this arrival, and it is the first thing the run does when it resumes. |
| `AutomationStudioRunControlState` | Type | `packages/fluxiq/src/programs/automation-studio/runtime/run-control/types.ts:18` | Where a live run stands with respect to a person. - `running`: FluxIQ is driving and nothing is asked of it. - `pause_requested`: a pause was asked while a step was in flight. The step finishes -- a click is never cut in half -- and the run holds at the next checkpoint. - `paused`: the run is held between two steps. Nothing is dispatched to the page until it is resumed or stopped. |
| `AutomationStudioRunDatasetAuditEvent` | Type | `packages/fluxiq/src/programs/automation-studio/storage/project/run-dataset-store.ts:31` | A typed audit event. It carries ids and counts only, so no row value can reach it. |
| `AutomationStudioRunDatasetAuditEventInput` | Type | `packages/fluxiq/src/programs/automation-studio/storage/project/run-dataset-store.ts:43` | - |
| `AutomationStudioRunDatasetAuditEventType` | Type | `packages/fluxiq/src/programs/automation-studio/storage/project/run-dataset-store.ts:28` | - |
| `AutomationStudioRunDatasetBatch` | Type | `packages/fluxiq/src/programs/automation-studio/storage/project/run-dataset-store.ts:55` | One capture's rows for one dataset, already validated against `schema` by the caller. |
| `AutomationStudioRunDatasetDeletion` | Type | `packages/fluxiq/src/programs/automation-studio/storage/project/run-dataset-store.ts:80` | - |
| `AutomationStudioRunDatasetRow` | Type | `packages/fluxiq/src/programs/automation-studio/storage/project/run-dataset-store.ts:26` | One stored row: a JSON object keyed by the stored schema's field ids. |
| `AutomationStudioRunDatasetRowBatch` | Type | `packages/fluxiq/src/programs/automation-studio/storage/project/run-dataset-store.ts:78` | Rows read for streaming, with the ordinal to continue after. |
| `automationStudioRunFlowVersions` | Value | `packages/fluxiq/src/programs/automation-studio/runtime/flow-version/run-flow-versions.ts:17` | - |
| `automationStudioRunMayStillAbsorb` | Value | `packages/fluxiq/src/programs/automation-studio/runtime/executor/defensive/retry-wait.ts:68` | - |
| `automationStudioRunProgress` | Value | `packages/fluxiq/src/programs/automation-studio/runtime/run-control/progress-status.ts:50` | - |
| `AutomationStudioRunProgress` | Type | `packages/fluxiq/src/programs/automation-studio/runtime/run-control/progress-status.ts:29` | - |
| `AutomationStudioRunProgressStatus` | Type | `packages/fluxiq/src/programs/automation-studio/runtime/run-control/progress-status.ts:27` | - |
| `automationStudioRunResultAlreadyRepaired` | Value | `packages/fluxiq/src/programs/automation-studio/runtime/recovery/refuted-result/repair.ts:215` | - |
| `automationStudioRunResultRepairAttempts` | Value | `packages/fluxiq/src/programs/automation-studio/runtime/recovery/refuted-result/repair.ts:225` | - |
| `AutomationStudioRunResultSummary` | Type | `packages/fluxiq/src/programs/automation-studio/runtime/result-verification/contracts.ts:200` | The bounded account of what a run produced, and of the shape of the Flow that produced it. The Flow's shape is here because one of the four measured failures is only visible in it: a request for the records matching a description produced a Flow that navigated, extracted and ended, with no step that narrows anything, so returning every record was the only thing it could ever do. Definition ids and node ids are the same identifiers a run's recent actions already carry. |
| `AutomationStudioRunResultSummaryInput` | Type | `packages/fluxiq/src/programs/automation-studio/runtime/result-verification/result-summary.ts:59` | - |
| `AutomationStudioRunResumption` | Type | `packages/fluxiq/src/programs/automation-studio/runtime/executor/resume.ts:9` | How a parked run is being settled: somebody answered, or nobody did. |
| `AutomationStudioRuntimeAdaptationContext` | Type | `packages/fluxiq/src/programs/automation-studio/runtime/service/runtime-adaptation/contracts.ts:9` | - |
| `automationStudioRuntimeAdaptationContextForLlmRun` | Value | `packages/fluxiq/src/programs/automation-studio/runtime/llm/runtime-session-llm.ts:26` | - |
| `AutomationStudioRuntimeAdapter` | Type | `packages/fluxiq/src/programs/automation-studio/runtime/adapters.ts:19` | - |
| `AutomationStudioRuntimeContext` | Type | `packages/fluxiq/src/programs/automation-studio/runtime/contracts.ts:4` | - |
| `AutomationStudioRuntimeDeterministicDiagnosis` | Type | `packages/fluxiq/src/programs/automation-studio/runtime/recovery/deterministic-diagnosis.ts:66` | - |
| `AutomationStudioRuntimeDeterministicDiagnosisInput` | Type | `packages/fluxiq/src/programs/automation-studio/runtime/recovery/deterministic-diagnosis.ts:94` | - |
| `AutomationStudioRuntimeDiagnosisAchievability` | Type | `packages/fluxiq/src/programs/automation-studio/runtime/recovery/deterministic-diagnosis.ts:64` | Whether the run's goal is still reachable at all. Three values rather than a boolean, because "we do not know" is the common case and is not the same claim as "no". `no` is reserved for the two classes where Core knows a person must act first; everything else is `unknown` until something observes otherwise. Nothing here ever returns `yes` from the absence of a contradiction. |
| `AutomationStudioRuntimeDiagnosisPriorAction` | Type | `packages/fluxiq/src/programs/automation-studio/runtime/recovery/deterministic-diagnosis.ts:48` | What must happen before the model may be asked, when something must. |
| `automationStudioRuntimeDiagnosisResolution` | Value | `packages/fluxiq/src/programs/automation-studio/runtime/recovery/deterministic-diagnosis.ts:126` | - |
| `AutomationStudioRuntimeDiagnosisResolution` | Type | `packages/fluxiq/src/programs/automation-studio/runtime/recovery/deterministic-diagnosis.ts:41` | What answers this failure, decided before any provider exists. Four outcomes, and only the last one reaches a model. The first two name work that is already known and must run first; the third names a failure the loop cannot resolve at all, whoever is asked. |
| `AutomationStudioRuntimeEventKind` | Type | `packages/fluxiq/src/programs/automation-studio/storage/project/runtime-stream-store.ts:24` | - |
| `AutomationStudioRuntimeEventPage` | Type | `packages/fluxiq/src/programs/automation-studio/storage/project/runtime-stream-store.ts:43` | - |
| `AutomationStudioRuntimeExploration` | Type | `packages/fluxiq/src/programs/automation-studio/runtime/recovery/runtime-exploration.ts:205` | - |
| `AutomationStudioRuntimeExplorationInput` | Type | `packages/fluxiq/src/programs/automation-studio/runtime/recovery/runtime-exploration.ts:136` | - |
| `AutomationStudioRuntimeInterventionKind` | Type | `packages/fluxiq/src/programs/automation-studio/model/flow-adaptation.ts:295` | - |
| `AutomationStudioRuntimeLlmInvocationDecision` | Type | `packages/fluxiq/src/programs/automation-studio/runtime/recovery/llm-invocation.ts:10` | - |
| `AutomationStudioRuntimeLlmInvocationInput` | Type | `packages/fluxiq/src/programs/automation-studio/runtime/recovery/llm-invocation.ts:26` | - |
| `AutomationStudioRuntimePatch` | Type | `packages/fluxiq/src/programs/automation-studio/runtime/llm/harness/structured-response.ts:192` | A runtime patch as a model writes it. `consequences` is what an acting patch says it would lastingly do each time the Flow runs, in Core's classes, `[]` when it only opens, shows or chooses. The schema a model is shown requires it wherever the patch may run, and the recovery's permission gate is asked about it before the patch does. It is optional here because it is read forgivingly: a patch that left it out is recorded as undeclared and does not run, rather than the whole answer being refused, and a proposal-only patch never carries it. |
| `AutomationStudioRuntimePatchExecutionInput` | Type | `packages/fluxiq/src/programs/automation-studio/runtime/live-patch.ts:92` | - |
| `AutomationStudioRuntimePatchExecutionResult` | Type | `packages/fluxiq/src/programs/automation-studio/runtime/live-patch.ts:58` | - |
| `AutomationStudioRuntimePatchKind` | Type | `packages/fluxiq/src/programs/automation-studio/runtime/recovery/plan.ts:55` | - |
| `automationStudioRuntimePatchKindPolicyRefusal` | Value | `packages/fluxiq/src/programs/automation-studio/runtime/recovery/plan.ts:173` | - |
| `automationStudioRuntimePatchOutputSchema` | Value | `packages/fluxiq/src/programs/automation-studio/runtime/llm/harness/runtime-patch-schema.ts:169` | - |
| `AutomationStudioRuntimePatchPreflight` | Type | `packages/fluxiq/src/programs/automation-studio/runtime/live-patch.ts:34` | - |
| `automationStudioRuntimePatchRefusalIsCheckableByExploration` | Value | `packages/fluxiq/src/programs/automation-studio/runtime/recovery/diagnosis-chain.ts:125` | - |
| `AutomationStudioRuntimePatchRequestDecision` | Type | `packages/fluxiq/src/programs/automation-studio/runtime/recovery/diagnosis-chain.ts:61` | Whether the second, billed `runtime_patch` call should happen, and -- when it should not -- which rung said so and under which code. |
| `AutomationStudioRuntimePatchSkipCode` | Type | `packages/fluxiq/src/programs/automation-studio/runtime/recovery/diagnosis-chain.ts:54` | - |
| `AutomationStudioRuntimePatchVerification` | Type | `packages/fluxiq/src/programs/automation-studio/runtime/live-patch.ts:52` | What a runtime patch's trial proved, as a receipt reads it: a projection of the trial's flow-change verdict (`result.verdict`), which alone decides it. - `verified`: the verdict's first basis, in its canonical order. - `contradicted`: the codes of the checks that failed, comma-separated. - `unverifiable`: why nothing was proved. A changed node that did not finish, evidence nobody could evaluate, a comparison that declared nothing, or no comparison at all. Success is never inferred from the absence of contradicting evidence, and no validation is recorded. - `not_executed`: why the trial did not run the change. |
| `AutomationStudioRuntimeRecoveryAnnotationInput` | Type | `packages/fluxiq/src/programs/automation-studio/runtime/recovery/annotation/annotate.ts:82` | - |
| `AutomationStudioRuntimeRecoveryContext` | Type | `packages/fluxiq/src/programs/automation-studio/runtime/recovery/context.ts:173` | - |
| `AutomationStudioRuntimeRecoveryContextInput` | Type | `packages/fluxiq/src/programs/automation-studio/runtime/recovery/context.ts:185` | - |
| `AutomationStudioRuntimeRecoveryPatchInput` | Type | `packages/fluxiq/src/programs/automation-studio/runtime/recovery/annotation/patches.ts:60` | - |
| `AutomationStudioRuntimeRecoveryPatchOutcome` | Type | `packages/fluxiq/src/programs/automation-studio/runtime/recovery/annotation/patches.ts:105` | - |
| `AutomationStudioRuntimeRecoveryPlan` | Type | `packages/fluxiq/src/programs/automation-studio/runtime/recovery/plan.ts:63` | - |
| `AutomationStudioRuntimeRecoveryPlanInput` | Type | `packages/fluxiq/src/programs/automation-studio/runtime/recovery/plan.ts:80` | - |
| `AutomationStudioRuntimeRecoveryPlanStep` | Type | `packages/fluxiq/src/programs/automation-studio/runtime/recovery/plan.ts:58` | One thing the plan intends, in the order the plan intends it. |
| `AutomationStudioRuntimeRecoveryPorts` | Type | `packages/fluxiq/src/programs/automation-studio/runtime/recovery/annotation/ports.ts:42` | Everything the runtime recovery path reaches outside itself for. Optional members are written `?: T \| undefined` deliberately: the service holds them as optional fields, and under `exactOptionalPropertyTypes` a bare `?: T` would refuse the field it already has. |
| `automationStudioRuntimeRecoveryRefusedTrace` | Value | `packages/fluxiq/src/programs/automation-studio/runtime/recovery/stages.ts:79` | - |
| `AutomationStudioRuntimeRecoveryRung` | Type | `packages/fluxiq/src/programs/automation-studio/runtime/recovery/diagnosis-chain.ts:13` | Which rung of the recovery loop declined, when one did. A code says *why* nothing was repaired; this says *who* decided it, in the loop's own four-stage vocabulary (`stages.ts`). The two together are what a run needs to say instead of falling silent: `plan` + `goal_unachievable` reads as "the plan stopped, because the diagnosis said the step's result can no longer be reached", which is a different thing to answer than `resolution` + `permission_required`. |
| `automationStudioRuntimeRecoveryTrace` | Value | `packages/fluxiq/src/programs/automation-studio/runtime/recovery/stages.ts:89` | - |
| `AutomationStudioRuntimeRecoveryTraceInput` | Type | `packages/fluxiq/src/programs/automation-studio/runtime/recovery/stages.ts:30` | - |
| `AutomationStudioRuntimeRunSummary` | Type | `packages/fluxiq/src/programs/automation-studio/storage/file-store.ts:130` | - |
| `AutomationStudioRuntimeRunSummaryPage` | Type | `packages/fluxiq/src/programs/automation-studio/storage/file-store.ts:144` | - |
| `AutomationStudioRuntimeSession` | Type | `packages/fluxiq/src/programs/automation-studio/model/runtime.ts:28` | - |
| `AutomationStudioRuntimeSessionLlm` | Type | `packages/fluxiq/src/programs/automation-studio/runtime/llm/runtime-session-llm.ts:18` | A run a person asked the model to take part in. |
| `AutomationStudioRuntimeSessionLlmIntent` | Type | `packages/fluxiq/src/programs/automation-studio/runtime/llm/runtime-session-llm.ts:15` | - |
| `AutomationStudioRuntimeSessionStatus` | Type | `packages/fluxiq/src/programs/automation-studio/model/runtime.ts:20` | - |
| `AutomationStudioRuntimeSessionVerificationInput` | Type | `packages/fluxiq/src/programs/automation-studio/runtime/result-verification/run-outcome.ts:203` | - |
| `AutomationStudioRuntimeStartFromCompiledPlan` | Type | `packages/fluxiq/src/programs/automation-studio/storage/project/compiled-plan-store.ts:35` | - |
| `AutomationStudioRuntimeStreamEvent` | Type | `packages/fluxiq/src/programs/automation-studio/storage/project/runtime-stream-store.ts:32` | - |
| `AutomationStudioRuntimeStructuredDiagnosis` | Type | `packages/fluxiq/src/programs/automation-studio/runtime/recovery/structured-diagnosis.ts:75` | - |
| `AutomationStudioRuntimeStructuredDiagnosisInput` | Type | `packages/fluxiq/src/programs/automation-studio/runtime/recovery/structured-diagnosis.ts:111` | - |
| `AutomationStudioRuntimeSummaryIndex` | Type | `packages/fluxiq/src/programs/automation-studio/storage/file-store.ts:151` | - |
| `AutomationStudioRuntimeTargetOverrideControl` | Type | `packages/fluxiq/src/programs/automation-studio/runtime/live-patch/refusal-reasons.ts:56` | The thing an accepted target names, as a person would recognise it: its name exactly as the evidence the model was shown printed it, and one plain word or two for what sort of thing it is, in the domain's own vocabulary. A domain supplies it with an accepted target so a repair that needs permission can say what it would act on. Core carries it only to the permission gate, which withholds a name that never appeared in evidence already shown. |
| `AutomationStudioRuntimeTargetOverrideEvidenceValidation` | Type | `packages/fluxiq/src/programs/automation-studio/runtime/live-patch/refusal-reasons.ts:58` | - |
| `AutomationStudioRuntimeTargetOverrideFailedAction` | Type | `packages/fluxiq/src/programs/automation-studio/runtime/live-patch/refusal-reasons.ts:70` | Bounded, domain-neutral identity of the action whose target failed. |
| `AutomationStudioRuntimeTargetOverrideRefusal` | Type | `packages/fluxiq/src/programs/automation-studio/runtime/live-patch/refusal-reasons.ts:64` | A domain's refusal as Core records it: the status, and the reason only where it is one of Core's. |
| `AutomationStudioRuntimeTargetOverrideRefusalReason` | Type | `packages/fluxiq/src/programs/automation-studio/runtime/live-patch/refusal-reasons.ts:46` | - |
| `AutomationStudioRuntimeTargetOverrideTarget` | Type | `packages/fluxiq/src/programs/automation-studio/runtime/llm/harness/structured-response.ts:140` | A repair target, opaque to Core. `handles` is the only part of it Core and a domain agree on: a map from a repairable parameter the domain declared -- one control to re-point, or a list row and its fields for an extraction -- to an opaque handle the domain minted and named in the evidence it issued. Core bounds both sides of that map and reads neither. What a handle points at is the domain's business. Every other key is the domain's own resolution of those handles, in the domain's own vocabulary, written only after the domain has checked the handle against evidence it actually issued. Core carries it and never looks inside, which is what makes this type domain-neutral rather than a browser concept wearing a neutral name: it was `{ selector: string }`, and a non-browser domain had no way to answer it. A model-authored target carries `handles` and nothing else. That is not a convention, it is enforced twice -- `isAutomationStudioModelAuthoredTargetOverrideTarget` at the provider and at output validation, and `additionalProperties: false` in the response schema -- so a locator can never enter through the model, only through a domain that resolved one from its own evidence. |
| `AutomationStudioSafePointAdoption` | Type | `packages/fluxiq/src/programs/automation-studio/storage/project/compiled-plan-store.ts:41` | - |
| `AutomationStudioSaveProjectUiCacheRequest` | Type | `packages/fluxiq/src/programs/automation-studio/api/contracts/ui-cache.ts:29` | - |
| `AutomationStudioSaveProjectUiCacheResponse` | Type | `packages/fluxiq/src/programs/automation-studio/api/contracts/ui-cache.ts:34` | - |
| `automationStudioScaleAssetBatch` | Value | `packages/fluxiq/src/programs/automation-studio/testing/scale-fixtures.ts:194` | - |
| `AutomationStudioScaleBaseline` | Type | `packages/fluxiq/src/programs/automation-studio/testing/scale-baseline.ts:21` | - |
| `AutomationStudioScaleBatchOptions` | Type | `packages/fluxiq/src/programs/automation-studio/testing/scale-fixtures.ts:41` | - |
| `AutomationStudioScaleCertificationEvidence` | Type | `packages/fluxiq/src/programs/automation-studio/testing/scale-certification.ts:122` | - |
| `AutomationStudioScaleCertificationGate` | Type | `packages/fluxiq/src/programs/automation-studio/testing/scale-certification.ts:133` | - |
| `AutomationStudioScaleCertificationGateId` | Type | `packages/fluxiq/src/programs/automation-studio/testing/scale-certification.ts:8` | - |
| `AutomationStudioScaleCertificationInput` | Type | `packages/fluxiq/src/programs/automation-studio/testing/scale-certification.ts:96` | - |
| `AutomationStudioScaleCertificationMeasurement` | Type | `packages/fluxiq/src/programs/automation-studio/testing/scale-certification.ts:18` | - |
| `AutomationStudioScaleCertificationReport` | Type | `packages/fluxiq/src/programs/automation-studio/testing/scale-certification.ts:142` | - |
| `AutomationStudioScaleCertificationStatus` | Type | `packages/fluxiq/src/programs/automation-studio/testing/scale-certification.ts:6` | - |
| `automationStudioScaleFlowBatch` | Value | `packages/fluxiq/src/programs/automation-studio/testing/scale-fixtures.ts:76` | - |
| `automationStudioScaleGraphEdgeBatch` | Value | `packages/fluxiq/src/programs/automation-studio/testing/scale-fixtures.ts:117` | - |
| `automationStudioScaleGraphNodeBatch` | Value | `packages/fluxiq/src/programs/automation-studio/testing/scale-fixtures.ts:101` | - |
| `automationStudioScaleInstructionBatch` | Value | `packages/fluxiq/src/programs/automation-studio/testing/scale-fixtures.ts:134` | - |
| `AutomationStudioScaleManifest` | Type | `packages/fluxiq/src/programs/automation-studio/testing/scale-fixtures.ts:48` | - |
| `AutomationStudioScaleMatrixRun` | Type | `packages/fluxiq/src/programs/automation-studio/testing/scale-certification.ts:25` | - |
| `AutomationStudioScaleProfile` | Type | `packages/fluxiq/src/programs/automation-studio/testing/scale-fixtures.ts:3` | - |
| `automationStudioScaleProjectBatch` | Value | `packages/fluxiq/src/programs/automation-studio/testing/scale-fixtures.ts:65` | - |
| `automationStudioScaleRecordingBatch` | Value | `packages/fluxiq/src/programs/automation-studio/testing/scale-fixtures.ts:171` | - |
| `automationStudioScaleRecordingEventBatch` | Value | `packages/fluxiq/src/programs/automation-studio/testing/scale-fixtures.ts:183` | - |
| `automationStudioScaleRunBatch` | Value | `packages/fluxiq/src/programs/automation-studio/testing/scale-fixtures.ts:147` | - |
| `automationStudioScaleRuntimeEventBatch` | Value | `packages/fluxiq/src/programs/automation-studio/testing/scale-fixtures.ts:159` | - |
| `automationStudioScaleSubflowBatch` | Value | `packages/fluxiq/src/programs/automation-studio/testing/scale-fixtures.ts:89` | - |
| `AutomationStudioSchemaBackupContext` | Type | `packages/fluxiq/src/programs/automation-studio/storage/schema-migrations.ts:9` | - |
| `AutomationStudioSchemaMigration` | Type | `packages/fluxiq/src/programs/automation-studio/storage/schema-migrations.ts:4` | - |
| `AutomationStudioSchemaMigrationResult` | Type | `packages/fluxiq/src/programs/automation-studio/storage/schema-migrations.ts:24` | - |
| `AutomationStudioSchemaMigrationRunner` | Class | `packages/fluxiq/src/programs/automation-studio/storage/schema-migrations.ts:72` | - |
| `AutomationStudioSchemaMigrationRunnerOptions` | Type | `packages/fluxiq/src/programs/automation-studio/storage/schema-migrations.ts:15` | - |
| `AutomationStudioSchemaState` | Type | `packages/fluxiq/src/programs/automation-studio/storage/schema-migrations.ts:31` | - |
| `AutomationStudioSchemaVersion` | Type | `packages/fluxiq/src/programs/automation-studio/model/evidence.ts:4` | - |
| `automationStudioScopeIsFrozen` | Value | `packages/fluxiq/src/programs/automation-studio/runtime/training-modes.ts:415` | - |
| `automationStudioScreenedAuthoredState` | Value | `packages/fluxiq/src/programs/automation-studio/runtime/recovery/repair-context/authored-state-screen.ts:93` | - |
| `AutomationStudioScreenedAuthoredState` | Type | `packages/fluxiq/src/programs/automation-studio/runtime/recovery/repair-context/authored-state-screen.ts:46` | An authored document value as the repair is shown it, with what did not survive named. |
| `automationStudioScreenedNodeParameters` | Value | `packages/fluxiq/src/programs/automation-studio/runtime/recovery/repair-context/parameter-screen.ts:115` | - |
| `AutomationStudioScreenedParameters` | Type | `packages/fluxiq/src/programs/automation-studio/runtime/recovery/repair-context/parameter-screen.ts:86` | The parameters a step ran with, as the repair is shown them. |
| `automationStudioSecretNamedKey` | Value | `packages/fluxiq/src/programs/automation-studio/runtime/recovery/repair-context/secret-named-key.ts:34` | - |
| `AutomationStudioService` | Class | `packages/fluxiq/src/programs/automation-studio/runtime/service.ts:332` | - |
| `AutomationStudioServiceOptions` | Type | `packages/fluxiq/src/programs/automation-studio/runtime/service.ts:290` | - |
| `AutomationStudioSessionKeyPorts` | Type | `packages/fluxiq/src/programs/automation-studio/runtime/llm/deepseek/session-key.ts:17` | The Secret Keys operations releasing a person's key needs. |
| `AutomationStudioSnapshot` | Type | `packages/fluxiq/src/programs/automation-studio/api/contracts/project.ts:26` | - |
| `AutomationStudioSoakEvidence` | Type | `packages/fluxiq/src/programs/automation-studio/testing/scale-certification.ts:31` | - |
| `automationStudioSourceNodeRoot` | Object | `packages/fluxiq/src/programs/automation-studio/nodes/layout.ts:3` | - |
| `AutomationStudioSqlAdaptationPolicy` | Type | `packages/fluxiq/src/programs/automation-studio/storage/project/flow-resource-repository.ts:37` | - |
| `AutomationStudioSqlExecutor` | Type | `packages/fluxiq/src/programs/automation-studio/storage/project/database.ts:11` | - |
| `AutomationStudioSqlFlowDetail` | Type | `packages/fluxiq/src/programs/automation-studio/storage/project/flow-resource-repository.ts:24` | - |
| `AutomationStudioSqlFlowError` | Type | `packages/fluxiq/src/programs/automation-studio/storage/project/flow-resource-repository.ts:27` | - |
| `AutomationStudioSqlFlowPort` | Type | `packages/fluxiq/src/programs/automation-studio/storage/project/flow-resource-repository.ts:25` | - |
| `AutomationStudioSqlFlowRecord` | Type | `packages/fluxiq/src/programs/automation-studio/storage/project/flow-resource-repository.ts:16` | - |
| `AutomationStudioSqlFlowSettings` | Type | `packages/fluxiq/src/programs/automation-studio/storage/project/flow-resource-repository.ts:23` | - |
| `AutomationStudioSqlFlowVariable` | Type | `packages/fluxiq/src/programs/automation-studio/storage/project/flow-resource-repository.ts:26` | - |
| `AutomationStudioSqlInstruction` | Type | `packages/fluxiq/src/programs/automation-studio/storage/project/flow-resource-repository.ts:34` | - |
| `AutomationStudioSqlInstructionBinding` | Type | `packages/fluxiq/src/programs/automation-studio/storage/project/flow-resource-repository.ts:36` | - |
| `AutomationStudioSqlInstructionScope` | Type | `packages/fluxiq/src/programs/automation-studio/storage/project/flow-resource-repository.ts:33` | - |
| `AutomationStudioSqlInstructionSummary` | Type | `packages/fluxiq/src/programs/automation-studio/storage/project/flow-resource-repository.ts:35` | - |
| `AutomationStudioSqliteUiCacheStore` | Class | `packages/fluxiq/src/programs/automation-studio/storage/project/ui-cache-store.ts:233` | - |
| `AutomationStudioSqlRouter` | Type | `packages/fluxiq/src/programs/automation-studio/storage/project/flow-resource-repository.ts:30` | - |
| `AutomationStudioSqlRouterGroup` | Type | `packages/fluxiq/src/programs/automation-studio/storage/project/flow-resource-repository.ts:31` | - |
| `AutomationStudioSqlRouterRoute` | Type | `packages/fluxiq/src/programs/automation-studio/storage/project/flow-resource-repository.ts:32` | - |
| `AutomationStudioSqlRouterRoutePage` | Type | `packages/fluxiq/src/programs/automation-studio/storage/project/flow-resource-repository.ts:12` | - |
| `AutomationStudioSqlRouterSummary` | Type | `packages/fluxiq/src/programs/automation-studio/storage/project/flow-resource-repository.ts:13` | - |
| `AutomationStudioSqlRouterTargetReference` | Type | `packages/fluxiq/src/programs/automation-studio/storage/project/flow-resource-repository.ts:14` | - |
| `AutomationStudioSqlRouterTargetReferenceBatch` | Type | `packages/fluxiq/src/programs/automation-studio/storage/project/flow-resource-repository.ts:15` | - |
| `AutomationStudioSqlRunResult` | Type | `packages/fluxiq/src/programs/automation-studio/storage/project/database.ts:7` | - |
| `AutomationStudioSqlSubflow` | Type | `packages/fluxiq/src/programs/automation-studio/storage/project/flow-resource-repository.ts:29` | - |
| `AutomationStudioSqlSubflowCategory` | Type | `packages/fluxiq/src/programs/automation-studio/storage/project/flow-resource-repository.ts:28` | - |
| `AutomationStudioSqlSubflowTargetPage` | Type | `packages/fluxiq/src/programs/automation-studio/storage/project/flow-resource-repository.ts:10` | - |
| `AutomationStudioStabilityMetrics` | Type | `packages/fluxiq/src/programs/automation-studio/runtime/training-modes.ts:68` | - |
| `AutomationStudioStartNodeChoice` | Type | `packages/fluxiq/src/programs/automation-studio/runtime/executor/start-node.ts:15` | Where a run of a graph begins when its caller names no node, or why it cannot begin. `declared` and `root` carry the node. Every other status carries the message a run fails with, and no node. |
| `AutomationStudioStatePathRecord` | Type | `packages/fluxiq/src/programs/automation-studio/storage/project/runtime-stream-store.ts:86` | - |
| `AutomationStudioStateSnapshotRecord` | Type | `packages/fluxiq/src/programs/automation-studio/storage/project/runtime-stream-store.ts:73` | - |
| `AutomationStudioStateVisualizerDefinition` | Type | `packages/fluxiq/src/programs/automation-studio/nodes/importer-sdk.ts:45` | - |
| `automationStudioStepFailureReauthorBrief` | Value | `packages/fluxiq/src/programs/automation-studio/runtime/recovery/refuted-result/step-failure-brief.ts:43` | - |
| `automationStudioStepFailureReauthorDecision` | Value | `packages/fluxiq/src/programs/automation-studio/runtime/recovery/refuted-result/step-failure-decision.ts:99` | - |
| `AutomationStudioStepFailureReauthorDecision` | Type | `packages/fluxiq/src/programs/automation-studio/runtime/recovery/refuted-result/step-failure-decision.ts:61` | - |
| `AutomationStudioStepFailureReauthorRefusal` | Type | `packages/fluxiq/src/programs/automation-studio/runtime/recovery/refuted-result/step-failure-decision.ts:50` | Why a failed run was not re-authored, in codes a reader can key on. |
| `automationStudioStepFailureTarget` | Value | `packages/fluxiq/src/programs/automation-studio/runtime/recovery/refuted-result/step-failure-target.ts:55` | - |
| `automationStudioStepParametersSection` | Value | `packages/fluxiq/src/programs/automation-studio/runtime/recovery/repair-context/step-parameters.ts:39` | - |
| `AutomationStudioStorageOutboxEntry` | Type | `packages/fluxiq/src/programs/automation-studio/storage/project/administration.ts:36` | - |
| `AutomationStudioStorageOutboxRepository` | Class | `packages/fluxiq/src/programs/automation-studio/storage/project/administration.ts:248` | - |
| `AutomationStudioStorageOutboxStatus` | Type | `packages/fluxiq/src/programs/automation-studio/storage/project/administration.ts:35` | - |
| `AutomationStudioStoredAdaptationArtifactKind` | Type | `packages/fluxiq/src/programs/automation-studio/storage/project/adaptation-store.ts:15` | - |
| `AutomationStudioStoredAdaptationDetail` | Type | `packages/fluxiq/src/programs/automation-studio/storage/project/adaptation-store.ts:24` | - |
| `AutomationStudioStoredAdaptationStatus` | Type | `packages/fluxiq/src/programs/automation-studio/storage/project/adaptation-store.ts:14` | - |
| `AutomationStudioStructuredDiagnosisModelField` | Type | `packages/fluxiq/src/programs/automation-studio/runtime/recovery/structured-diagnosis.ts:72` | - |
| `AutomationStudioStructuredDiagnosisSummary` | Type | `packages/fluxiq/src/programs/automation-studio/runtime/recovery/structured-diagnosis.ts:106` | The counts-and-verdicts record written onto a run. Carries no model prose. |
| `AutomationStudioSubflowExecutionRecord` | Type | `packages/fluxiq/src/programs/automation-studio/model/flow-adaptation.ts:286` | - |
| `AutomationStudioSubflowRole` | Type | `packages/fluxiq/src/programs/automation-studio/model/flow-adaptation.ts:60` | - |
| `AutomationStudioSubflowSummary` | Type | `packages/fluxiq/src/programs/automation-studio/runtime/service/indexes/types.ts:7` | - |
| `AutomationStudioSubflowSummaryPage` | Type | `packages/fluxiq/src/programs/automation-studio/runtime/service/summaries/types.ts:5` | - |
| `AutomationStudioSubflowTargetPage` | Type | `packages/fluxiq/src/programs/automation-studio/runtime/service/flow-map-routes/contracts.ts:9` | - |
| `AutomationStudioTargetResolverDefinition` | Type | `packages/fluxiq/src/programs/automation-studio/nodes/importer-sdk.ts:43` | - |
| `AutomationStudioTargetResolverImplementation` | Type | `packages/fluxiq/src/programs/automation-studio/nodes/importer-sdk.ts:97` | - |
| `AutomationStudioTaskArtifact` | Type | `packages/fluxiq/src/programs/automation-studio/model/artifacts.ts:48` | - |
| `automationStudioThrownErrorText` | Value | `packages/fluxiq/src/programs/automation-studio/runtime/executor/defensive/thrown-error.ts:220` | - |
| `automationStudioToolResultNeedsPerson` | Value | `packages/fluxiq/src/programs/automation-studio/runtime/parking/person-needed-tool-calls.ts:91` | - |
| `automationStudioTraceSummary` | Value | `packages/fluxiq/src/programs/automation-studio/runtime/executor/trace-summary.ts:4` | - |
| `AutomationStudioTrainingAdaptationSummary` | Type | `packages/fluxiq/src/programs/automation-studio/runtime/training-modes.ts:8` | - |
| `AutomationStudioTrainingBudgetControls` | Type | `packages/fluxiq/src/programs/automation-studio/runtime/training-modes.ts:48` | - |
| `AutomationStudioTrainingBudgetDecision` | Type | `packages/fluxiq/src/programs/automation-studio/runtime/training-modes.ts:95` | - |
| `AutomationStudioTrainingBudgetState` | Type | `packages/fluxiq/src/programs/automation-studio/runtime/training-modes.ts:89` | - |
| `AutomationStudioTrainingModeBehavior` | Type | `packages/fluxiq/src/programs/automation-studio/runtime/training-modes.ts:60` | - |
| `AutomationStudioTrainingModeSettings` | Type | `packages/fluxiq/src/programs/automation-studio/runtime/training-modes.ts:25` | - |
| `AutomationStudioTrainingStatus` | Type | `packages/fluxiq/src/programs/automation-studio/runtime/training-modes.ts:163` | - |
| `automationStudioTransientStatusEffect` | Value | `packages/fluxiq/src/programs/automation-studio/runtime/executor/defensive/transient-status.ts:38` | - |
| `AutomationStudioTransitionComparison` | Type | `packages/fluxiq/src/programs/automation-studio/runtime/executor/contracts.ts:66` | - |
| `AutomationStudioTransitionComparisonStatus` | Type | `packages/fluxiq/src/programs/automation-studio/runtime/executor/contracts.ts:19` | - |
| `AutomationStudioUiCacheCompactResult` | Type | `packages/fluxiq/src/programs/automation-studio/storage/project/ui-cache-store.ts:55` | - |
| `AutomationStudioUiCacheDeleteInput` | Type | `packages/fluxiq/src/programs/automation-studio/storage/project/ui-cache-store.ts:36` | - |
| `AutomationStudioUiCacheEntry` | Type | `packages/fluxiq/src/programs/automation-studio/storage/project/ui-cache-store.ts:12` | - |
| `AutomationStudioUiCachePutEntry` | Type | `packages/fluxiq/src/programs/automation-studio/storage/project/ui-cache-store.ts:25` | - |
| `AutomationStudioUiCacheStats` | Type | `packages/fluxiq/src/programs/automation-studio/storage/project/ui-cache-store.ts:45` | - |
| `AutomationStudioUiCacheStore` | Interface | `packages/fluxiq/src/programs/automation-studio/storage/project/ui-cache-store.ts:68` | - |
| `AutomationStudioUiCacheStoreOptions` | Type | `packages/fluxiq/src/programs/automation-studio/storage/project/ui-cache-store.ts:61` | - |
| `AutomationStudioUiCacheValue` | Type | `packages/fluxiq/src/programs/automation-studio/storage/project/ui-cache-store.ts:10` | - |
| `AutomationStudioUnattendedRepairClause` | Type | `packages/fluxiq/src/programs/automation-studio/runtime/result-check-authorization/contracts.ts:60` | What the person authorized an unattended *repair* to do, when they authorized one at all. Absent means checking only, which is what every authorization written before this existed meant and what every stored one still reads back as. A permission to spend never defaults, so this is opt-in exactly as the authorization itself is. |
| `AutomationStudioUnattendedRepairRedemption` | Type | `packages/fluxiq/src/programs/automation-studio/runtime/result-check-authorization/repair.ts:54` | What redeeming the repair clause produced: a bounded provider request, or the stated reason there is none. |
| `AutomationStudioUncertaintySummary` | Type | `packages/fluxiq/src/programs/automation-studio/runtime/training-modes.ts:79` | - |
| `AutomationStudioV2CutoverState` | Type | `packages/fluxiq/src/programs/automation-studio/storage/project/migration-cutover.ts:36` | - |
| `AutomationStudioV2FeatureState` | Type | `packages/fluxiq/src/programs/automation-studio/storage/project/migration-cutover.ts:150` | - |
| `AutomationStudioValidatedFlowBootstrapPlan` | Type | `packages/fluxiq/src/programs/automation-studio/runtime/flow-bootstrap/plan/contracts.ts:141` | - |
| `AutomationStudioValidationIssue` | Type | `packages/fluxiq/src/programs/automation-studio/model/validation/issue.ts:3` | - |
| `AutomationStudioValidationResult` | Type | `packages/fluxiq/src/programs/automation-studio/model/validation/issue.ts:10` | - |
| `automationStudioValidationResultKind` | Value | `packages/fluxiq/src/programs/automation-studio/runtime/flow-change/confidence.ts:22` | - |
| `AutomationStudioValidationSeverity` | Type | `packages/fluxiq/src/programs/automation-studio/model/validation/issue.ts:1` | - |
| `AutomationStudioVersionedFlowDocument` | Type | `packages/fluxiq/src/programs/automation-studio/runtime/flow-version/contracts.ts:68` | The shape this module reads a version off: any Flow document or artifact. |
| `AutomationStudioViewState` | Type | `packages/fluxiq/src/programs/automation-studio/ui/contracts.ts:8` | - |
| `AutomationStudioWalCheckpointMode` | Type | `packages/fluxiq/src/programs/automation-studio/storage/project/database.ts:8` | - |
| `AutomationStudioWalCheckpointResult` | Type | `packages/fluxiq/src/programs/automation-studio/storage/project/database.ts:9` | - |
| `automationStudioWithoutLocators` | Value | `packages/fluxiq/src/programs/automation-studio/runtime/llm/harness/locator-text.ts:120` | - |
| `AutomationStudioWorkspacePreference` | Type | `packages/fluxiq/src/programs/automation-studio/storage/project/hierarchy/repository.ts:23` | - |
| `AutomationStudioWorkspaceSummary` | Type | `packages/fluxiq/src/programs/automation-studio/storage/file-store.ts:156` | - |
| `AutomationStudioWriteProjectObjectAssetInput` | Type | `packages/fluxiq/src/programs/automation-studio/runtime/service/object-documents.ts:20` | - |
| `AutomationStudioWriteProjectObjectAssetResult` | Type | `packages/fluxiq/src/programs/automation-studio/runtime/service/object-documents.ts:28` | - |
| `automationStudioZeroProviderGate` | Value | `packages/fluxiq/src/programs/automation-studio/runtime/result-verification/zero-provider-run.ts:30` | - |
| `AutomationTask` | Type | `packages/fluxiq/src/programs/automation-studio/types.ts:42` | - |
| `BACKGROUND_TASKS_ENDPOINTS` | Object | `packages/fluxiq/src/programs/background-tasks/api/contracts.ts:4` | - |
| `BACKGROUND_TASKS_PROGRAM` | Object | `packages/fluxiq/src/programs/background-tasks/metadata.ts:3` | - |
| `BackgroundTaskDefinition` | Type | `packages/fluxiq/src/programs/background-tasks/types.ts:5` | - |
| `BackgroundTaskDetailRequest` | Type | `packages/fluxiq/src/programs/background-tasks/api/contracts.ts:18` | - |
| `BackgroundTaskHandler` | Type | `packages/fluxiq/src/programs/background-tasks/runtime/service.ts:6` | - |
| `BackgroundTaskRun` | Type | `packages/fluxiq/src/programs/background-tasks/types.ts:17` | - |
| `BackgroundTasksPanel` | Type | `packages/fluxiq/src/programs/background-tasks/ui/contracts.ts:1` | - |
| `BackgroundTasksService` | Class | `packages/fluxiq/src/programs/background-tasks/runtime/service.ts:16` | - |
| `BackgroundTasksSnapshot` | Type | `packages/fluxiq/src/programs/background-tasks/types.ts:28` | - |
| `BackgroundTasksSnapshotResponse` | Type | `packages/fluxiq/src/programs/background-tasks/api/contracts.ts:44` | - |
| `BackgroundTasksStore` | Type | `packages/fluxiq/src/programs/background-tasks/storage/contracts.ts:3` | - |
| `BackgroundTaskStatus` | Type | `packages/fluxiq/src/programs/background-tasks/types.ts:3` | - |
| `BackgroundTasksViewState` | Type | `packages/fluxiq/src/programs/background-tasks/ui/contracts.ts:3` | - |
| `behaviorForAutomationStudioTrainingMode` | Value | `packages/fluxiq/src/programs/automation-studio/runtime/training-modes.ts:173` | - |
| `bestElementFingerprintCandidate` | Value | `packages/fluxiq/src/programs/automation-studio/fingerprinting/element-fingerprint.ts:131` | - |
| `bindAutomationStudioActivityRun` | Value | `packages/fluxiq/src/programs/automation-studio/runtime/activity/bind.ts:9` | - |
| `bootstrapAdaptationAsFlowAdaptation` | Value | `packages/fluxiq/src/programs/automation-studio/runtime/flow-bootstrap/review-projection.ts:43` | - |
| `boundedAutomationStudioActivity` | Value | `packages/fluxiq/src/programs/automation-studio/runtime/activity/bounded.ts:35` | - |
| `buildAutomationStudioFlowBootstrapContext` | Value | `packages/fluxiq/src/programs/automation-studio/runtime/flow-bootstrap/plan/catalog.ts:26` | - |
| `buildAutomationStudioFlowBootstrapRoutingContext` | Value | `packages/fluxiq/src/programs/automation-studio/runtime/flow-bootstrap/plan/routing-context.ts:84` | - |
| `buildAutomationStudioFlowFromConversation` | Value | `packages/fluxiq/src/programs/automation-studio/runtime/conversations/commands/build.ts:22` | - |
| `buildAutomationStudioLegacyMigrationOperations` | Value | `packages/fluxiq/src/programs/automation-studio/storage/project/migration-cutover.ts:366` | - |
| `buildAutomationStudioLlmEvidenceLoopDecisionSchema` | Value | `packages/fluxiq/src/programs/automation-studio/runtime/llm/evidence-loop-decision.ts:246` | - |
| `buildAutomationStudioRecoveryTrace` | Value | `packages/fluxiq/src/programs/automation-studio/runtime/recovery/trace.ts:129` | - |
| `buildAutomationStudioRuntimeDeterministicDiagnosis` | Value | `packages/fluxiq/src/programs/automation-studio/runtime/recovery/deterministic-diagnosis.ts:138` | - |
| `buildAutomationStudioRuntimeRecoveryContext` | Value | `packages/fluxiq/src/programs/automation-studio/runtime/recovery/context.ts:221` | - |
| `buildAutomationStudioRuntimeStructuredDiagnosis` | Value | `packages/fluxiq/src/programs/automation-studio/runtime/recovery/structured-diagnosis.ts:121` | - |
| `buildProgramDirectory` | Value | `packages/fluxiq/src/programs/_shared/catalog.ts:42` | - |
| `buildSignalRegistryFromSchemas` | Value | `packages/fluxiq/src/programs/automation-studio/model/signal-registry.ts:9` | - |
| `builtinAutomationNodeDefinitions` | Object | `packages/fluxiq/src/programs/automation-studio/nodes/registry.ts:26` | - |
| `builtinAutomationStudioHarnessOptions` | Value | `packages/fluxiq/src/programs/automation-studio/runtime/llm/harness-options/builtin.ts:45` | - |
| `candidatesFromStateSnapshot` | Value | `packages/fluxiq/src/programs/automation-studio/fingerprinting/element-fingerprint.ts:184` | - |
| `canonicalArtifactIdentity` | Value | `packages/fluxiq/src/programs/automation-studio/storage/ids.ts:64` | - |
| `CanonicalAutomationStudioArtifact` | Type | `packages/fluxiq/src/programs/automation-studio/storage/ids.ts:5` | - |
| `CanonicalAutomationStudioArtifactKind` | Type | `packages/fluxiq/src/programs/automation-studio/storage/ids.ts:15` | - |
| `CanonicalAutomationStudioRepositories` | Type | `packages/fluxiq/src/programs/automation-studio/storage/contracts.ts:19` | - |
| `canonicalBuiltinAutomationNodeDefinitions` | Object | `packages/fluxiq/src/programs/automation-studio/nodes/canonical-registry.ts:106` | - |
| `CaptureClientSnapshotRequest` | Type | `packages/fluxiq/src/programs/automation-studio/api/contracts/client.ts:21` | - |
| `checkAutomationStudioFlowBootstrapAnswersInstruction` | Value | `packages/fluxiq/src/programs/automation-studio/runtime/flow-bootstrap/answerability/check.ts:54` | - |
| `checkAutomationStudioFlowBootstrapCompletion` | Value | `packages/fluxiq/src/programs/automation-studio/runtime/llm/harness-options/bootstrap-completion.ts:156` | - |
| `checkAutomationStudioFlowBootstrapReachesStartLocation` | Value | `packages/fluxiq/src/programs/automation-studio/runtime/flow-bootstrap/reachability/check.ts:56` | - |
| `checkAutomationStudioInstructedActs` | Value | `packages/fluxiq/src/programs/automation-studio/runtime/flow-bootstrap/instructed-acts/check.ts:143` | - |
| `CheckpointPolicy` | Type | `packages/fluxiq/src/programs/automation-studio/normalization/contracts.ts:15` | - |
| `chooseAutomationStudioRecovery` | Value | `packages/fluxiq/src/programs/automation-studio/runtime/executor/recovery-ladder.ts:55` | - |
| `chooseAutomationStudioStartNode` | Value | `packages/fluxiq/src/programs/automation-studio/runtime/executor/start-node.ts:40` | - |
| `chooseNextEdge` | Value | `packages/fluxiq/src/engine/index.ts:186` | - |
| `classifyAutomationStudioAdaptiveFailure` | Value | `packages/fluxiq/src/programs/automation-studio/runtime/adaptive-orchestrator.ts:78` | - |
| `clearFluxIQPerformanceMetrics` | Value | `packages/fluxiq/src/programs/_shared/performance-metrics.ts:105` | - |
| `CLIENT_GATEWAY_ACTIVITY_CAPABILITY_ID` | Object | `packages/contracts/src/client-gateway.ts:119` | The capability a client advertises to receive `server.activity`. Core sends the activity stream only to ready sessions that declared it. |
| `CLIENT_GATEWAY_ACTIVITY_RESOLUTIONS` | Object | `packages/contracts/src/client-gateway.ts:145` | How a wait on the person ended, on the `ask` row that says so: - `answered`: the person answered (a robot check's Continue, a choice, words); - `allowed`: the person granted a permission ask; - `waited_out`: a check that clears by itself cleared while Core waited; - `declined`: the person refused, or pressed Stop at a robot check; - `timed_out`: nobody answered in time; - `cancelled`: the work stopped before anyone answered -- it was cancelled or failed while it waited, or the question could no longer be read. |
| `CLIENT_GATEWAY_PROTOCOL_VERSION` | Object | `packages/contracts/src/client-gateway.ts:4` | - |
| `ClientGatewayActionCommand` | Type | `packages/contracts/src/client-gateway.ts:91` | - |
| `ClientGatewayActionResponse` | Type | `packages/contracts/src/client-gateway.ts:341` | - |
| `ClientGatewayActionResult` | Type | `packages/contracts/src/client-gateway.ts:99` | - |
| `ClientGatewayActivity` | Type | `packages/contracts/src/client-gateway.ts:172` | One activity event: the current status of one unit of work (a build or a run) plus an optional detail row for the chat stream. Bounded, and content-free beyond what the person's own panel already shows: labels and titles are Core's own sentences, the actions a step's own input names, tool and node ids, and authored step labels; never raw evidence a tool gathered, tokens or secrets. A `thought` row's `text` is the model's own stated reason for that step (what it does next, on what, and why) or its diagnosis or verdict, whitespace-collapsed, with token-shaped runs hidden, and bounded (240 characters for a decision's reason). Core truncates `label` to 160 characters, `detail.title` to 160 and `detail.text` to 1,000. A wait on the person is one `ask` row pair for one card. The wait opens as `phase: "waiting_permission"`, `detail: { kind: "ask", ref: <askId>, status: "started" }`. When it is settled, Core sends one more `ask` row for the same unit of work with the same `ref` and `title`, the phase the work returns to, `status` `succeeded` (answered, allowed, waited out) or `failed` (declined, timed out, cancelled), `resolution`, and `text`, a sentence such as "You pressed Continue.". A client marks the card from that row alone and never infers the answer from later events. Every wait Core announced gets that row, including one whose work stopped first (`cancelled`); a wait Core never announced is never resolved. A run parked durably is still waiting until it is resumed. |
| `ClientGatewayActivityPhase` | Type | `packages/contracts/src/client-gateway.ts:122` | What FluxIQ is doing now. Each value is set only by a real Core event. |
| `ClientGatewayActivityResolution` | Type | `packages/contracts/src/client-gateway.ts:146` | - |
| `ClientGatewayAppendRecordingEntryRequest` | Type | `packages/contracts/src/client-gateway.ts:76` | - |
| `ClientGatewayAuditEntry` | Type | `packages/contracts/src/client-gateway.ts:266` | - |
| `ClientGatewayCapability` | Type | `packages/contracts/src/client-gateway.ts:19` | - |
| `ClientGatewayClientHello` | Type | `packages/contracts/src/client-gateway.ts:27` | - |
| `ClientGatewayClientMessage` | Type | `packages/contracts/src/client-gateway.ts:286` | - |
| `ClientGatewayClientType` | Type | `packages/contracts/src/client-gateway.ts:6` | - |
| `ClientGatewayEnvelope` | Type | `packages/contracts/src/client-gateway.ts:275` | - |
| `ClientGatewayEvent` | Type | `packages/contracts/src/client-gateway.ts:327` | - |
| `ClientGatewayEventHandler` | Type | `packages/contracts/src/client-gateway.ts:339` | - |
| `ClientGatewayItemKind` | Type | `packages/fluxiq/src/client-gateway/service/types.ts:47` | - |
| `ClientGatewayPairingChallenge` | Type | `packages/contracts/src/client-gateway.ts:212` | - |
| `ClientGatewayRecordingEvent` | Type | `packages/contracts/src/client-gateway.ts:45` | - |
| `ClientGatewayRuntimeTransport` | Class | `packages/fluxiq/src/runtime/client-gateway-transport.ts:28` | - |
| `ClientGatewayRuntimeTransportOptions` | Type | `packages/fluxiq/src/runtime/client-gateway-transport.ts:22` | - |
| `ClientGatewayServerMessage` | Type | `packages/contracts/src/client-gateway.ts:300` | - |
| `ClientGatewayService` | Class | `packages/fluxiq/src/client-gateway/service.ts:52` | The client gateway: pairing, durable client trust, session lifecycle, and the command channel to a paired client. This class is a facade. It holds no gateway state of its own; each method forwards to the collaborator under `service/` that owns the state it touches. Its public surface is the gateway contract every program imports, so a method is added or removed here only when that contract changes — the collaborators behind it can be reshaped freely. |
| `ClientGatewayServiceOptions` | Type | `packages/fluxiq/src/client-gateway/service/types.ts:18` | Construction options for `ClientGatewayService`. |
| `ClientGatewaySession` | Type | `packages/contracts/src/client-gateway.ts:226` | - |
| `ClientGatewaySessionStatus` | Type | `packages/contracts/src/client-gateway.ts:13` | - |
| `ClientGatewaySnapshot` | Type | `packages/contracts/src/client-gateway.ts:82` | - |
| `ClientGatewaySnapshotView` | Type | `packages/contracts/src/client-gateway.ts:313` | - |
| `ClientGatewaySocket` | Type | `packages/contracts/src/client-gateway.ts:322` | - |
| `ClientGatewayStartRecordingRequest` | Type | `packages/contracts/src/client-gateway.ts:57` | - |
| `ClientGatewayStateUpdate` | Type | `packages/contracts/src/client-gateway.ts:37` | - |
| `ClientGatewayStopRecordingRequest` | Type | `packages/contracts/src/client-gateway.ts:70` | - |
| `ClientGatewaySummaryItem` | Type | `packages/fluxiq/src/client-gateway/service/types.ts:48` | - |
| `ClientGatewaySummaryPage` | Type | `packages/fluxiq/src/client-gateway/service/types.ts:49` | - |
| `ClientGatewayTrustedClient` | Type | `packages/contracts/src/client-gateway.ts:246` | - |
| `ClientGatewayTrustedClientStore` | Type | `packages/fluxiq/src/client-gateway/service/types.ts:12` | Durable store the gateway reads trusted clients from and writes them back to. |
| `ClientGatewayTrustedClientView` | Type | `packages/contracts/src/client-gateway.ts:262` | - |
| `ClientGatewayUnknownPayload` | Type | `packages/contracts/src/client-gateway.ts:347` | - |
| `ClientRecordingContext` | Type | `packages/fluxiq/src/programs/automation-studio/client-gateway/bridge.ts:27` | - |
| `ClientRecordingContextProvider` | Type | `packages/fluxiq/src/programs/automation-studio/client-gateway/bridge.ts:31` | - |
| `Clock` | Type | `packages/fluxiq/src/core/index.ts:11` | - |
| `compactAutomationStudioAdaptiveFailure` | Value | `packages/fluxiq/src/programs/automation-studio/runtime/adaptive-orchestrator.ts:117` | - |
| `ComparatorDefinition` | Type | `packages/fluxiq/src/programs/automation-studio/model/signals.ts:12` | - |
| `comparatorForStateType` | Value | `packages/fluxiq/src/programs/automation-studio/model/signal-registry.ts:68` | - |
| `compareAutomationStudioHybridRead` | Value | `packages/fluxiq/src/programs/automation-studio/storage/project/migration-cutover.ts:450` | - |
| `compareAutomationStudioTransition` | Value | `packages/fluxiq/src/programs/automation-studio/runtime/executor/transition-comparison.ts:39` | - |
| `compileAutomationStudioPlan` | Value | `packages/fluxiq/src/programs/automation-studio/runtime/compiled-plan.ts:85` | - |
| `CompileAutomationStudioPlanInput` | Type | `packages/fluxiq/src/programs/automation-studio/runtime/compiled-plan.ts:67` | - |
| `compileAutomationStudioRegions` | Value | `packages/fluxiq/src/programs/automation-studio/runtime/region-compiler.ts:11` | - |
| `compileAutomationStudioRouterPlan` | Value | `packages/fluxiq/src/programs/automation-studio/runtime/router-runtime.ts:88` | - |
| `compiledPlanToFlowDocument` | Value | `packages/fluxiq/src/programs/automation-studio/runtime/compiled-plan.ts:130` | - |
| `compileFlowDefinition` | Value | `packages/fluxiq/src/programs/automation-studio/dsl/compiler.ts:14` | - |
| `compileFlowSource` | Value | `packages/fluxiq/src/programs/automation-studio/dsl/source.ts:10` | - |
| `CompleteComputeCommandRequest` | Type | `packages/fluxiq/src/programs/compute-control/api/contracts.ts:33` | - |
| `ComponentDefinition` | Type | `packages/fluxiq/src/components/index.ts:26` | - |
| `ComponentParamSpec` | Type | `packages/fluxiq/src/components/index.ts:4` | - |
| `ComponentRegistry` | Class | `packages/fluxiq/src/components/index.ts:31` | - |
| `ComponentSpec` | Type | `packages/fluxiq/src/components/index.ts:13` | - |
| `compositeNodeDefinitionId` | Value | `packages/fluxiq/src/programs/automation-studio/model/composites.ts:66` | - |
| `COMPUTE_CONTROL_ENDPOINTS` | Object | `packages/fluxiq/src/programs/compute-control/api/contracts.ts:4` | - |
| `COMPUTE_CONTROL_PROGRAM` | Object | `packages/fluxiq/src/programs/compute-control/metadata.ts:3` | - |
| `computeAutomationStudioStabilityMetrics` | Value | `packages/fluxiq/src/programs/automation-studio/runtime/training-modes.ts:217` | - |
| `ComputeCommand` | Type | `packages/fluxiq/src/programs/compute-control/types.ts:16` | - |
| `ComputeControlCommandRequest` | Type | `packages/fluxiq/src/programs/compute-control/api/contracts.ts:22` | - |
| `ComputeControlPanel` | Type | `packages/fluxiq/src/programs/compute-control/ui/contracts.ts:1` | - |
| `ComputeControlService` | Class | `packages/fluxiq/src/programs/compute-control/runtime/service.ts:12` | - |
| `ComputeControlSnapshot` | Type | `packages/fluxiq/src/programs/compute-control/types.ts:37` | - |
| `ComputeControlSnapshotResponse` | Type | `packages/fluxiq/src/programs/compute-control/api/contracts.ts:51` | - |
| `ComputeControlStore` | Type | `packages/fluxiq/src/programs/compute-control/storage/contracts.ts:3` | - |
| `ComputeControlViewState` | Type | `packages/fluxiq/src/programs/compute-control/ui/contracts.ts:3` | - |
| `ComputeHeartbeatRequest` | Type | `packages/fluxiq/src/programs/compute-control/api/contracts.ts:17` | - |
| `ComputeLease` | Type | `packages/fluxiq/src/programs/compute-control/types.ts:29` | - |
| `ComputeNode` | Type | `packages/fluxiq/src/programs/compute-control/types.ts:5` | - |
| `ComputeStatus` | Type | `packages/fluxiq/src/programs/compute-control/types.ts:3` | - |
| `Condition` | Type | `packages/fluxiq/src/programs/automation-studio/types.ts:5` | - |
| `ConditionSet` | Type | `packages/fluxiq/src/programs/automation-studio/types.ts:11` | - |
| `ConservativeTimelineNormalizer` | Class | `packages/fluxiq/src/programs/automation-studio/normalization/default-normalizer.ts:7` | - |
| `ControlBackgroundTaskRequest` | Type | `packages/fluxiq/src/programs/background-tasks/api/contracts.ts:40` | - |
| `ConversationAnswerRequest` | Type | `packages/fluxiq/src/programs/automation-studio/api/contracts/conversation.ts:123` | The answer to one ask. `kind` must settle the ask's kind -- grant or deny a permission or a confirmation, name an option for a choice, words for an open question -- and `value` carries the option id or the words. |
| `ConversationAttachmentRequest` | Type | `packages/fluxiq/src/programs/automation-studio/api/contracts/conversation.ts:134` | What a turn's attachment refers to. Optional in every sense: a thread with no attachments never calls it, and a deployment that cannot serve the kind says so rather than answering with nothing. |
| `ConversationCommandExecution` | Type | `packages/fluxiq/src/programs/automation-studio/api/contracts/conversation.ts:116` | `append-turn`'s `payload.response.execution`, and `answer-ask`'s `payload.execution` when a granted question runs something: null when Core does not run the chosen capability or nothing is run now; otherwise `done` or `failed` for work that finished in the request, and `started` for a build or run whose result arrives later as an automation turn with a `panel-capability-result` attachment naming the capability. |
| `ConversationListRequest` | Type | `packages/fluxiq/src/programs/automation-studio/api/contracts/conversation.ts:33` | A project's threads, most recently touched first, optionally narrowed to one subject or to the open ones. `projectId` may be null, meaning "every project this caller can see". That exists for the globally mounted prompt: nothing can push to the browser, so reachability is a poll, and a poll cannot name the project an unanswered ask belongs to before it has found it. The projects searched are exactly the ones `projects` itself would return for this request's domain scope. |
| `ConversationOpenRequest` | Type | `packages/fluxiq/src/programs/automation-studio/api/contracts/conversation.ts:54` | The thread a person starts. `subjectKind` and `subjectId` say what the thread is about, and are checked by `requestedSubject`, which takes only `project`, `flow`, `build` or `run`. Both are optional together: a person opening the chat with nothing selected is talking about the project, so the subject falls back to the project's own id rather than being refused. `openConversation` continues the subject's open thread when there is one, so asking twice does not leave two. Opening a thread is `authoring`, like writing a turn: it creates nothing a person would need warning about and must not take a PIN. |
| `ConversationReadRequest` | Type | `packages/fluxiq/src/programs/automation-studio/api/contracts/conversation.ts:61` | One thread. With `sinceTurnId` only the turns after that one are read, which is what a reader already holding it asks for. |
| `ConversationTurnAppendRequest` | Type | `packages/fluxiq/src/programs/automation-studio/api/contracts/conversation.ts:86` | A turn the person writes. The author is always the person: Core's own turns do not come through the API. With `capabilities` the turn is also read as an instruction. That is the panel's vocabulary (`fluxiq/automation-studio/panel-capabilities`), handed across on every message so Core never keeps a second catalog; Core stores the turn first, has the model decide whether to run a capability, ask one question or reply, writes that into the thread, and answers with the decision so the panel can run what was chosen. Without it the turn is only stored, exactly as before -- which is how the panel records what it did. For the capabilities Core runs itself (`runtime/conversations/commands/`: `flow.createHere`, `flow.describe`, `flow.explore`, `flow.improve`, `run.execute`, `ask.answer`) a client need send only the id: Core's own descriptor replaces whatever was sent, Core runs the capability, and the answer's `response.execution` says what came of it (`ConversationCommandExecution`). The client then runs nothing itself. |
| `convertCodeOwnedFlowToVisual` | Value | `packages/fluxiq/src/programs/automation-studio/dsl/source.ts:28` | - |
| `correctAutomationStudioFlowBootstrapPlanNames` | Value | `packages/fluxiq/src/programs/automation-studio/runtime/flow-bootstrap/plan/name-correction.ts:56` | - |
| `createAutomationStudioDeepSeekPanelCommandModel` | Value | `packages/fluxiq/src/programs/automation-studio/runtime/llm/deepseek/panel-command.ts:48` | - |
| `createAutomationStudioDeepSeekProvider` | Value | `packages/fluxiq/src/programs/automation-studio/runtime/llm/deepseek/provider.ts:53` | - |
| `createAutomationStudioElementMatcher` | Value | `packages/fluxiq/src/programs/automation-studio/fingerprinting/element-fingerprint.ts:112` | - |
| `createAutomationStudioFileStorePaths` | Value | `packages/fluxiq/src/programs/automation-studio/storage/file-store.ts:191` | - |
| `createAutomationStudioFixture` | Value | `packages/fluxiq/src/programs/automation-studio/model/fixtures/recorded-task.ts:13` | - |
| `createAutomationStudioFlowExpansionFixture` | Value | `packages/fluxiq/src/programs/automation-studio/model/fixtures/flow-expansion.ts:26` | - |
| `createAutomationStudioLargeProjectFixture` | Value | `packages/fluxiq/src/programs/automation-studio/model/fixtures/large-project.ts:39` | - |
| `createAutomationStudioMarketingDemo` | Value | `packages/fluxiq/src/programs/automation-studio/testing/marketing-demo.ts:23` | - |
| `createAutomationStudioResultCheckProvider` | Value | `packages/fluxiq/src/programs/automation-studio/runtime/result-check-authorization/provider.ts:24` | - |
| `createAutomationStudioScaleCertificationReport` | Value | `packages/fluxiq/src/programs/automation-studio/testing/scale-certification.ts:161` | - |
| `createAutomationStudioScaleCertificationTemplate` | Value | `packages/fluxiq/src/programs/automation-studio/testing/scale-certification.ts:202` | - |
| `createAutomationStudioScaleManifest` | Value | `packages/fluxiq/src/programs/automation-studio/testing/scale-fixtures.ts:55` | - |
| `createAutomationStudioScaleMatrixTemplate` | Value | `packages/fluxiq/src/programs/automation-studio/testing/scale-certification.ts:221` | - |
| `createAutomationStudioSessionKeyProviderResolver` | Value | `packages/fluxiq/src/programs/automation-studio/runtime/llm/session-key-provider.ts:68` | - |
| `createAutomationStudioTrainingStatus` | Value | `packages/fluxiq/src/programs/automation-studio/runtime/training-modes.ts:425` | - |
| `createAutomationStudioVerifiedBackupManifest` | Value | `packages/fluxiq/src/programs/automation-studio/storage/project/migration-cutover.ts:319` | - |
| `createBlankAutomationStudioFlow` | Value | `packages/fluxiq/src/programs/automation-studio/model/artifacts.ts:94` | - |
| `createBlankAutomationStudioFlowArtifact` | Value | `packages/fluxiq/src/programs/automation-studio/model/flows.ts:342` | - |
| `createCallFlowNode` | Value | `packages/fluxiq/src/programs/automation-studio/model/composites.ts:84` | - |
| `createCanonicalAutomationStudioMemoryRepositories` | Value | `packages/fluxiq/src/programs/automation-studio/storage/memory-repository.ts:61` | - |
| `createCanonicalAutomationStudioSQLiteRepositories` | Value | `packages/fluxiq/src/programs/automation-studio/storage/sqlite-repository.ts:59` | - |
| `createEnvelope` | Value | `packages/fluxiq/src/io/index.ts:429` | - |
| `CreateFlowRequest` | Type | `packages/fluxiq/src/programs/automation-studio/api/contracts/flow.ts:14` | - |
| `CreateFlowSubflowInput` | Type | `packages/fluxiq/src/programs/automation-studio/runtime/service/flows/mutations.ts:27` | - |
| `CreateFlowSubflowRequest` | Type | `packages/fluxiq/src/programs/automation-studio/api/contracts/subflow.ts:12` | - |
| `createGlobalProgramRuntime` | Value | `packages/fluxiq/src/programs/_shared/runtime.ts:36` | - |
| `CreateGraphSnapshotRequest` | Type | `packages/fluxiq/src/programs/automation-studio/api/contracts/graph.ts:28` | - |
| `createId` | Value | `packages/fluxiq/src/core/index.ts:21` | - |
| `CreateIdentityUserRequest` | Type | `packages/fluxiq/src/programs/identity-access/api/contracts.ts:20` | - |
| `createIoPolicyEffectDispatcher` | Value | `packages/fluxiq/src/programs/automation-studio/runtime/io-policy.ts:59` | - |
| `createPassingAutomationStudioScaleCertificationFixture` | Value | `packages/fluxiq/src/programs/automation-studio/testing/scale-certification.ts:360` | - |
| `createPublishedFlowSnapshot` | Value | `packages/fluxiq/src/programs/automation-studio/model/composites.ts:50` | - |
| `createRecord` | Value | `packages/fluxiq/src/programs/database-manager/storage/sqlite-repository.ts:215` | - |
| `CreateRecordingFlowProposalsResult` | Type | `packages/fluxiq/src/programs/automation-studio/runtime/service/proposals/types.ts:44` | - |
| `CreateRecordingRequest` | Type | `packages/fluxiq/src/programs/automation-studio/api/contracts/recording.ts:11` | - |
| `createRecordingSession` | Value | `packages/fluxiq/src/programs/automation-studio/model/recording-framework.ts:25` | - |
| `CreateRecordingSessionInput` | Type | `packages/fluxiq/src/programs/automation-studio/model/recording-framework.ts:8` | - |
| `createRuntimeInputs` | Value | `packages/fluxiq/src/engine/index.ts:199` | - |
| `createRuntimeOutputs` | Value | `packages/fluxiq/src/engine/index.ts:209` | - |
| `createRuntimePolicyEffectDispatcher` | Value | `packages/fluxiq/src/programs/automation-studio/runtime/io-policy.ts:75` | - |
| `createRuntimeSession` | Value | `packages/fluxiq/src/engine/index.ts:28` | - |
| `CreateSecretKeyRequest` | Type | `packages/fluxiq/src/programs/secret-keys/api/contracts.ts:20` | - |
| `currentAutomationStudioConversation` | Value | `packages/fluxiq/src/programs/automation-studio/runtime/conversations/context/current.ts:9` | - |
| `currentAutomationStudioInstructedConsequences` | Value | `packages/fluxiq/src/programs/automation-studio/runtime/action-permissions/instructed.ts:137` | - |
| `DATABASE_MANAGER_ENDPOINTS` | Object | `packages/fluxiq/src/programs/database-manager/api/contracts.ts:4` | - |
| `DATABASE_MANAGER_PROGRAM` | Object | `packages/fluxiq/src/programs/database-manager/metadata.ts:3` | - |
| `DatabaseManagerPanel` | Type | `packages/fluxiq/src/programs/database-manager/ui/contracts.ts:1` | - |
| `DatabaseManagerPutRecordRequest` | Type | `packages/fluxiq/src/programs/database-manager/api/contracts.ts:39` | - |
| `DatabaseManagerRecordPageResponse` | Type | `packages/fluxiq/src/programs/database-manager/api/contracts.ts:48` | - |
| `DatabaseManagerRecordRequest` | Type | `packages/fluxiq/src/programs/database-manager/api/contracts.ts:35` | - |
| `DatabaseManagerRecordResponse` | Type | `packages/fluxiq/src/programs/database-manager/api/contracts.ts:50` | - |
| `DatabaseManagerRunMigrationRequest` | Type | `packages/fluxiq/src/programs/database-manager/api/contracts.ts:43` | - |
| `DatabaseManagerSensitiveGrantResponse` | Type | `packages/fluxiq/src/programs/database-manager/api/contracts.ts:49` | - |
| `DatabaseManagerService` | Class | `packages/fluxiq/src/programs/database-manager/runtime/service.ts:19` | - |
| `DatabaseManagerSnapshot` | Type | `packages/fluxiq/src/programs/database-manager/types.ts:62` | - |
| `DatabaseManagerSnapshotRequest` | Type | `packages/fluxiq/src/programs/database-manager/api/contracts.ts:14` | - |
| `DatabaseManagerSnapshotResponse` | Type | `packages/fluxiq/src/programs/database-manager/api/contracts.ts:18` | - |
| `DatabaseManagerStoreRequest` | Type | `packages/fluxiq/src/programs/database-manager/api/contracts.ts:20` | - |
| `DatabaseManagerStoreSummary` | Type | `packages/fluxiq/src/programs/database-manager/types.ts:56` | - |
| `DatabaseManagerViewState` | Type | `packages/fluxiq/src/programs/database-manager/ui/contracts.ts:3` | - |
| `DatasetRunListRequest` | Type | `packages/fluxiq/src/programs/automation-studio/api/contracts/dataset.ts:46` | The runs holding rows for one table, identified by the pair (`flowId`, `datasetId`). |
| `decideAutomationStudioAdaptationPromotionGate` | Value | `packages/fluxiq/src/programs/automation-studio/runtime/training-modes.ts:329` | - |
| `decideAutomationStudioBootstrapApplyGate` | Value | `packages/fluxiq/src/programs/automation-studio/runtime/training-modes.ts:363` | - |
| `decideAutomationStudioChangeConfidence` | Value | `packages/fluxiq/src/programs/automation-studio/runtime/flow-change/confidence.ts:28` | - |
| `decideAutomationStudioChangeResume` | Value | `packages/fluxiq/src/programs/automation-studio/runtime/flow-change/resume.ts:29` | - |
| `decideAutomationStudioChangeVerdict` | Value | `packages/fluxiq/src/programs/automation-studio/runtime/flow-change/verdict.ts:37` | - |
| `decideAutomationStudioLlmInvocationGate` | Value | `packages/fluxiq/src/programs/automation-studio/runtime/training-modes.ts:288` | - |
| `decideAutomationStudioProposalApprovalGate` | Value | `packages/fluxiq/src/programs/automation-studio/runtime/training-modes.ts:307` | - |
| `decideAutomationStudioResultCheck` | Value | `packages/fluxiq/src/programs/automation-studio/runtime/result-check-schedule/decide.ts:39` | - |
| `decideAutomationStudioRuntimeLlmInvocation` | Value | `packages/fluxiq/src/programs/automation-studio/runtime/recovery/llm-invocation.ts:63` | - |
| `decideAutomationStudioRuntimePatchRequest` | Value | `packages/fluxiq/src/programs/automation-studio/runtime/recovery/diagnosis-chain.ts:81` | - |
| `decideAutomationStudioTrainingBudget` | Value | `packages/fluxiq/src/programs/automation-studio/runtime/training-modes.ts:273` | - |
| `decodeAutomationStudioPageCursor` | Value | `packages/fluxiq/src/programs/automation-studio/storage/paging.ts:27` | - |
| `DEFAULT_ELEMENT_FINGERPRINT_WEIGHTS` | Object | `packages/fluxiq/src/programs/automation-studio/fingerprinting/element-fingerprint.ts:90` | - |
| `DEFAULT_SESSION_TTL_MS` | Object | `packages/fluxiq/src/programs/identity-access/runtime/service.ts:51` | - |
| `defaultAutomationStudioFlowSettingsMetadata` | Value | `packages/fluxiq/src/programs/automation-studio/model/flows.ts:242` | - |
| `defaultAutomationStudioSubflowForFlow` | Value | `packages/fluxiq/src/programs/automation-studio/runtime/router-runtime.ts:71` | - |
| `defaultGlobalProgramCatalog` | Value | `packages/fluxiq/src/programs/_shared/catalog.ts:26` | - |
| `defaultProgramCatalog` | Object | `packages/fluxiq/src/programs/_shared/catalog.ts:40` | - |
| `defaultRoles` | Object | `packages/fluxiq/src/programs/identity-access/runtime/roles.ts:22` | - |
| `DefinedInput` | Type | `packages/fluxiq/src/io/index.ts:127` | - |
| `defineDomainIo` | Value | `packages/fluxiq/src/io/index.ts:140` | - |
| `DefinedOutput` | Type | `packages/fluxiq/src/io/index.ts:128` | - |
| `defineFlow` | Value | `packages/fluxiq/src/programs/automation-studio/dsl/compiler.ts:10` | - |
| `defineInput` | Value | `packages/fluxiq/src/io/index.ts:130` | - |
| `defineOutput` | Value | `packages/fluxiq/src/io/index.ts:135` | - |
| `DeleteFlowMapRouteGroupRequest` | Type | `packages/fluxiq/src/programs/automation-studio/api/contracts/flow-map.ts:12` | - |
| `DeleteFlowMapRouteRequest` | Type | `packages/fluxiq/src/programs/automation-studio/api/contracts/flow-map.ts:50` | - |
| `DeleteRecordingRequest` | Type | `packages/fluxiq/src/programs/automation-studio/api/contracts/recording.ts:24` | - |
| `DeleteRecordingsRequest` | Type | `packages/fluxiq/src/programs/automation-studio/api/contracts/recording.ts:28` | - |
| `DeleteSecretKeyRequest` | Type | `packages/fluxiq/src/programs/secret-keys/api/contracts.ts:53` | - |
| `DEPLOYMENT_SYNC_ENDPOINTS` | Object | `packages/fluxiq/src/programs/deployment-sync/api/contracts.ts:3` | - |
| `DEPLOYMENT_SYNC_PROGRAM` | Object | `packages/fluxiq/src/programs/deployment-sync/metadata.ts:3` | - |
| `DeploymentArtifact` | Type | `packages/fluxiq/src/programs/deployment-sync/types.ts:15` | - |
| `DeploymentGitBranch` | Type | `packages/fluxiq/src/programs/deployment-sync/types.ts:36` | - |
| `DeploymentGitSnapshot` | Type | `packages/fluxiq/src/programs/deployment-sync/types.ts:53` | - |
| `DeploymentGitVersion` | Type | `packages/fluxiq/src/programs/deployment-sync/types.ts:44` | - |
| `DeploymentRunMode` | Type | `packages/fluxiq/src/programs/deployment-sync/types.ts:4` | - |
| `DeploymentRunOptions` | Type | `packages/fluxiq/src/programs/deployment-sync/runtime/service.ts:16` | - |
| `DeploymentSyncPanel` | Type | `packages/fluxiq/src/programs/deployment-sync/ui/contracts.ts:1` | - |
| `DeploymentSyncProvider` | Type | `packages/fluxiq/src/programs/deployment-sync/runtime/service.ts:9` | - |
| `DeploymentSyncRequest` | Type | `packages/fluxiq/src/programs/deployment-sync/api/contracts.ts:12` | - |
| `DeploymentSyncResponse` | Type | `packages/fluxiq/src/programs/deployment-sync/api/contracts.ts:20` | - |
| `DeploymentSyncRun` | Type | `packages/fluxiq/src/programs/deployment-sync/types.ts:24` | - |
| `DeploymentSyncService` | Class | `packages/fluxiq/src/programs/deployment-sync/runtime/service.ts:26` | - |
| `DeploymentSyncSnapshot` | Type | `packages/fluxiq/src/programs/deployment-sync/types.ts:66` | - |
| `DeploymentSyncSnapshotResponse` | Type | `packages/fluxiq/src/programs/deployment-sync/api/contracts.ts:22` | - |
| `DeploymentSyncStatus` | Type | `packages/fluxiq/src/programs/deployment-sync/types.ts:3` | - |
| `DeploymentSyncStore` | Type | `packages/fluxiq/src/programs/deployment-sync/storage/contracts.ts:3` | - |
| `DeploymentSyncViewState` | Type | `packages/fluxiq/src/programs/deployment-sync/ui/contracts.ts:3` | - |
| `DeploymentTarget` | Type | `packages/fluxiq/src/programs/deployment-sync/types.ts:6` | - |
| `DeprecateFlowPublicationRequest` | Type | `packages/fluxiq/src/programs/automation-studio/api/contracts/flow.ts:38` | - |
| `DIAGNOSTIC_ISSUE_CODE` | Object | `packages/fluxiq/src/programs/automation-studio/runtime/flow-bootstrap/generation-failure/diagnostic.ts:164` | The shape an issue code must have to travel: no whitespace, so no sentence. |
| `diffStateSnapshots` | Value | `packages/fluxiq/src/programs/automation-studio/model/state-diff.ts:7` | - |
| `discoverSignalDefinitions` | Value | `packages/fluxiq/src/programs/automation-studio/model/signal-registry.ts:18` | - |
| `dispatchPolicyOutput` | Value | `packages/fluxiq/src/programs/automation-studio/runtime/io-policy.ts:21` | - |
| `DOCS_ENDPOINTS` | Object | `packages/fluxiq/src/programs/docs/api/contracts.ts:3` | - |
| `DOCS_PROGRAM` | Object | `packages/fluxiq/src/programs/docs/metadata.ts:3` | - |
| `DocsPageRequest` | Type | `packages/fluxiq/src/programs/docs/api/contracts.ts:12` | - |
| `DocsPageResponse` | Type | `packages/fluxiq/src/programs/docs/api/contracts.ts:16` | - |
| `DocsPanel` | Type | `packages/fluxiq/src/programs/docs/ui/contracts.ts:1` | - |
| `DocsService` | Class | `packages/fluxiq/src/programs/docs/runtime/service.ts:14` | - |
| `DocsSnapshot` | Type | `packages/fluxiq/src/programs/docs/types.ts:41` | - |
| `DocsSnapshotResponse` | Type | `packages/fluxiq/src/programs/docs/api/contracts.ts:10` | - |
| `DocsStore` | Type | `packages/fluxiq/src/programs/docs/storage/contracts.ts:3` | - |
| `DocsViewState` | Type | `packages/fluxiq/src/programs/docs/ui/contracts.ts:3` | - |
| `DocumentationGenerator` | Type | `packages/fluxiq/src/programs/docs/types.ts:35` | - |
| `DocumentationGeneratorContext` | Type | `packages/fluxiq/src/programs/docs/types.ts:29` | - |
| `DocumentationPage` | Type | `packages/fluxiq/src/programs/docs/types.ts:9` | - |
| `DocumentationPageContent` | Type | `packages/fluxiq/src/programs/docs/types.ts:18` | - |
| `DocumentationRuntimeProviders` | Type | `packages/fluxiq/src/programs/_shared/docs-generators.ts:14` | - |
| `DocumentationSource` | Type | `packages/fluxiq/src/programs/docs/types.ts:1` | - |
| `DomainEventEntry` | Type | `packages/fluxiq/src/programs/automation-studio/model/timeline.ts:51` | - |
| `DomainInputDefinition` | Type | `packages/fluxiq/src/domains/index.ts:18` | - |
| `DomainIoRegistration` | Type | `packages/fluxiq/src/io/index.ts:123` | A cohesive importer-owned domain IO package. |
| `DomainManifest` | Type | `packages/fluxiq/src/domains/index.ts:5` | - |
| `DomainOutputDefinition` | Type | `packages/fluxiq/src/domains/index.ts:36` | - |
| `DomainRegistration` | Type | `packages/fluxiq/src/domains/index.ts:51` | - |
| `DomainRegistry` | Class | `packages/fluxiq/src/domains/index.ts:62` | - |
| `DomainStatus` | Type | `packages/fluxiq/src/domains/index.ts:3` | - |
| `domainSummary` | Value | `packages/fluxiq/src/domains/index.ts:95` | - |
| `DomainSummary` | Type | `packages/fluxiq/src/domains/index.ts:57` | - |
| `DomainSummaryContract` | Type | `packages/contracts/src/program-api.ts:40` | - |
| `domainSummarySchema` | Object | `packages/contracts/src/program-api.ts:19` | - |
| `DuplicateFlowSubflowRequest` | Type | `packages/fluxiq/src/programs/automation-studio/api/contracts/subflow.ts:39` | - |
| `DynamicPolicyArtifact` | Type | `packages/fluxiq/src/programs/automation-studio/types.ts:89` | - |
| `DynamicPolicyEdge` | Type | `packages/fluxiq/src/programs/automation-studio/types.ts:82` | - |
| `DynamicPolicyNode` | Type | `packages/fluxiq/src/programs/automation-studio/types.ts:73` | - |
| `ElementFingerprint` | Type | `packages/fluxiq/src/programs/automation-studio/fingerprinting/element-fingerprint.ts:4` | - |
| `ElementFingerprintCandidate` | Type | `packages/fluxiq/src/programs/automation-studio/fingerprinting/element-fingerprint.ts:26` | - |
| `ElementFingerprintContribution` | Type | `packages/fluxiq/src/programs/automation-studio/fingerprinting/element-fingerprint.ts:33` | - |
| `ElementFingerprintScore` | Type | `packages/fluxiq/src/programs/automation-studio/fingerprinting/element-fingerprint.ts:41` | - |
| `ElementFingerprintScoringOptions` | Type | `packages/fluxiq/src/programs/automation-studio/fingerprinting/element-fingerprint.ts:76` | - |
| `ElementFingerprintWeights` | Type | `packages/fluxiq/src/programs/automation-studio/fingerprinting/element-fingerprint.ts:54` | - |
| `emitAutomationStudioActivity` | Value | `packages/fluxiq/src/programs/automation-studio/runtime/activity/emit.ts:15` | - |
| `emitAutomationStudioActivityAskResolved` | Value | `packages/fluxiq/src/programs/automation-studio/runtime/activity/ask/resolved.ts:33` | - |
| `emitAutomationStudioActivityClearedWait` | Value | `packages/fluxiq/src/programs/automation-studio/runtime/activity/ask/cleared-wait.ts:37` | - |
| `emitAutomationStudioActivityStep` | Value | `packages/fluxiq/src/programs/automation-studio/runtime/activity/step.ts:17` | - |
| `emitAutomationStudioActivityThought` | Value | `packages/fluxiq/src/programs/automation-studio/runtime/activity/thought.ts:12` | - |
| `emitAutomationStudioActivityWaitedOut` | Value | `packages/fluxiq/src/programs/automation-studio/runtime/activity/ask/waited-out.ts:15` | - |
| `emitAutomationStudioActivityWaitingOnAsk` | Value | `packages/fluxiq/src/programs/automation-studio/runtime/activity/ask/ask.ts:20` | - |
| `emitAutomationStudioBuildRequest` | Value | `packages/fluxiq/src/programs/automation-studio/runtime/activity/build.ts:45` | - |
| `emptyAutomationStudioRootIndex` | Value | `packages/fluxiq/src/programs/automation-studio/storage/file-store.ts:225` | - |
| `emptyFlowSummaryIndex` | Value | `packages/fluxiq/src/programs/automation-studio/storage/file-store.ts:237` | - |
| `emptyObjectIndex` | Value | `packages/fluxiq/src/programs/automation-studio/storage/file-store.ts:245` | - |
| `emptyProposalSummaryIndex` | Value | `packages/fluxiq/src/programs/automation-studio/storage/file-store.ts:233` | - |
| `emptyRecordingIndex` | Value | `packages/fluxiq/src/programs/automation-studio/storage/state-index.ts:146` | - |
| `EmptyRecordingIndexInput` | Type | `packages/fluxiq/src/programs/automation-studio/storage/state-index.ts:136` | - |
| `emptyRecordingSummaryIndex` | Value | `packages/fluxiq/src/programs/automation-studio/storage/file-store.ts:229` | - |
| `emptyRuntimeSummaryIndex` | Value | `packages/fluxiq/src/programs/automation-studio/storage/file-store.ts:241` | - |
| `emptyStateSnapshot` | Value | `packages/fluxiq/src/programs/automation-studio/model/state-store.ts:95` | - |
| `encodeAutomationStudioPageCursor` | Value | `packages/fluxiq/src/programs/automation-studio/storage/paging.ts:23` | - |
| `EncryptedSecretValueRecord` | Type | `packages/fluxiq/src/programs/secret-keys/types.ts:72` | - |
| `EncryptedSecretValueRecordV1` | Type | `packages/fluxiq/src/programs/secret-keys/types.ts:43` | A version 1 seal: scrypt at Node's default cost (N=2^14), recording no parameters, with the base64url salt text itself as the scrypt salt. Still read; never written. It is re-sealed as version 2 at its next successful unlock or reveal. |
| `EncryptedSecretValueRecordV2` | Type | `packages/fluxiq/src/programs/secret-keys/types.ts:60` | A version 2 seal: records its scrypt parameters, which must be in the read allowlist, and derives from the decoded salt bytes. `sealedByUserId` is a non-secret hint naming the account whose password sealed the value, so a login tries only that user's keys; tampering with it affects availability only. |
| `EnvironmentDescriptor` | Type | `packages/fluxiq/src/programs/automation-studio/model/descriptors.ts:3` | - |
| `estimateAutomationStudioDeepSeekCostUsd` | Value | `packages/fluxiq/src/programs/automation-studio/runtime/llm/deepseek/pricing.ts:84` | - |
| `estimateAutomationStudioDeepSeekInputTokens` | Value | `packages/fluxiq/src/programs/automation-studio/runtime/llm/deepseek/request-body.ts:13` | - |
| `evaluateAutomationStudioRouteCondition` | Value | `packages/fluxiq/src/programs/automation-studio/runtime/router-runtime.ts:263` | - |
| `evaluateBootstrapAdaptationApplyGates` | Value | `packages/fluxiq/src/programs/automation-studio/runtime/recovery/adaptation-promotion.ts:42` | - |
| `evaluateFlowAdaptationPromotionGates` | Value | `packages/fluxiq/src/programs/automation-studio/runtime/recovery/adaptation-promotion.ts:22` | - |
| `EvidenceAnchor` | Type | `packages/fluxiq/src/programs/automation-studio/model/state.ts:70` | - |
| `EvidenceClaim` | Type | `packages/fluxiq/src/programs/automation-studio/mining/contracts.ts:87` | - |
| `EvidenceClaimConfidence` | Type | `packages/fluxiq/src/programs/automation-studio/mining/contracts.ts:80` | - |
| `EvidenceClaimType` | Type | `packages/fluxiq/src/programs/automation-studio/mining/contracts.ts:72` | - |
| `EvidenceComparator` | Type | `packages/fluxiq/src/programs/automation-studio/model/evidence.ts:56` | - |
| `EvidenceFact` | Type | `packages/fluxiq/src/programs/automation-studio/mining/contracts.ts:15` | - |
| `EvidenceFactKind` | Type | `packages/fluxiq/src/programs/automation-studio/mining/contracts.ts:6` | - |
| `EvidenceLayer` | Type | `packages/fluxiq/src/programs/automation-studio/model/evidence.ts:6` | - |
| `EvidenceObservation` | Type | `packages/fluxiq/src/programs/automation-studio/mining/contracts.ts:45` | - |
| `EvidenceObservationKind` | Type | `packages/fluxiq/src/programs/automation-studio/mining/contracts.ts:36` | - |
| `EvidenceReference` | Type | `packages/fluxiq/src/programs/automation-studio/model/evidence.ts:18` | - |
| `evidenceStepAnswerability` | Value | `packages/fluxiq/src/programs/automation-studio/runtime/flow-bootstrap/evidence-loop-steps.ts:481` | - |
| `evidenceStepDraft` | Value | `packages/fluxiq/src/programs/automation-studio/runtime/flow-bootstrap/evidence-loop-steps.ts:456` | - |
| `evidenceStepDraftChange` | Value | `packages/fluxiq/src/programs/automation-studio/runtime/flow-bootstrap/evidence-loop-steps.ts:438` | - |
| `evidenceStepProgress` | Value | `packages/fluxiq/src/programs/automation-studio/runtime/flow-bootstrap/evidence-loop-steps.ts:422` | - |
| `evidenceStepRestoredStep` | Value | `packages/fluxiq/src/programs/automation-studio/runtime/flow-bootstrap/evidence-loop-steps.ts:411` | - |
| `executeAutomationStudioConversationCommand` | Value | `packages/fluxiq/src/programs/automation-studio/runtime/conversations/commands/execute.ts:30` | - |
| `executeAutomationStudioRuntimePatch` | Value | `packages/fluxiq/src/programs/automation-studio/runtime/live-patch.ts:237` | - |
| `ExecuteClientActionRequest` | Type | `packages/fluxiq/src/programs/automation-studio/api/contracts/client.ts:27` | - |
| `Expectation` | Type | `packages/fluxiq/src/programs/automation-studio/model/policies.ts:50` | - |
| `explainAutomationStudioQueryPlan` | Value | `packages/fluxiq/src/programs/automation-studio/storage/query-plan.ts:5` | - |
| `FileRepository` | Class | `packages/fluxiq/src/programs/database-manager/storage/file-repository.ts:11` | - |
| `FileRuntimeStore` | Class | `packages/fluxiq/src/runtime/storage.ts:21` | - |
| `FileRuntimeStoreOptions` | Type | `packages/fluxiq/src/runtime/storage.ts:17` | - |
| `FinalizeRecordingRequest` | Type | `packages/fluxiq/src/programs/automation-studio/api/contracts/recording.ts:100` | - |
| `finalizeRecordingSession` | Value | `packages/fluxiq/src/programs/automation-studio/model/recording-framework.ts:105` | - |
| `FingerprintCandidateScore` | Type | `packages/fluxiq/src/programs/automation-studio/fingerprinting/contracts.ts:12` | - |
| `FingerprintScorer` | Type | `packages/fluxiq/src/programs/automation-studio/fingerprinting/contracts.ts:30` | - |
| `FingerprintScoringContext` | Type | `packages/fluxiq/src/programs/automation-studio/fingerprinting/contracts.ts:24` | - |
| `FLOW_BOOTSTRAP_DEFAULT_PHASE_FAILURE_CODE` | Object | `packages/fluxiq/src/programs/automation-studio/runtime/flow-bootstrap/generation-failure/codes.ts:235` | The code a stage falls back to when nothing more specific is established. |
| `FLOW_BOOTSTRAP_HARNESS_PREFLIGHT_CODE_SET` | Object | `packages/fluxiq/src/programs/automation-studio/runtime/flow-bootstrap/generation-failure/codes.ts:232` | - |
| `FLOW_BOOTSTRAP_PHASE_FAILURE_CODE_STAGE` | Object | `packages/fluxiq/src/programs/automation-studio/runtime/flow-bootstrap/generation-failure/codes.ts:203` | The stage a code belongs to. A code appears under exactly one stage, so this is total. |
| `FLOW_BOOTSTRAP_PROVIDER_PREFLIGHT_CODE_LIST` | Object | `packages/fluxiq/src/programs/automation-studio/runtime/flow-bootstrap/generation-failure/harness-vocabulary.ts:49` | - |
| `FLOW_BOOTSTRAP_PROVIDER_PREFLIGHT_CODE_SET` | Object | `packages/fluxiq/src/programs/automation-studio/runtime/flow-bootstrap/generation-failure/harness-vocabulary.ts:50` | - |
| `FLOW_BOOTSTRAP_PROVIDER_PREFLIGHT_CODES` | Object | `packages/fluxiq/src/programs/automation-studio/runtime/flow-bootstrap/generation-failure/harness-vocabulary.ts:24` | Each provider refusal made before a request is sent, under its Flow-bootstrap name. They all used to arrive as one `llm.provider_configuration_invalid` and leave as one `flow_bootstrap.provider_configuration_invalid`, so a refusal could not say which check made it. |
| `FLOW_BOOTSTRAP_RUN_BUDGET_CODE_LIST` | Object | `packages/fluxiq/src/programs/automation-studio/runtime/flow-bootstrap/generation-failure/harness-vocabulary.ts:103` | - |
| `FLOW_BOOTSTRAP_RUN_BUDGET_CODES` | Object | `packages/fluxiq/src/programs/automation-studio/runtime/flow-bootstrap/generation-failure/harness-vocabulary.ts:94` | Each refusal of the run's spending authority, under its Flow-bootstrap name. **These had no name here at all, and that is how a run that never reached the provider could be recorded as a provider fault.** The harness used to refuse a reservation before sending anything and return the provider's metadata anyway, so `flowBootstrapHarnessFailure` took its provider branch, no arm matched, and the `default` arm named it `flow_bootstrap.provider_transport_unknown` at stage `provider_request` with `providerInvocation: "attempted"` -- a request attempted whose answer is unknown, true of nothing that happened. They are pre-provider refusals, so their diagnostics say plainly that no request was made -- and they keep the request's accounting, which is the only record of the call that did not happen. Nothing else: no provider, no model, no status, no usage, whichever branch the refusal arrives on. **Both halves of that fix are in, and the harness's half came second.** A refused reservation no longer returns provider metadata (`runtime/llm/harness/run.ts`), so these codes are reached through the pre-provider branch and the provider branch's arm for them is unreachable from the harness -- kept as a guard, for the reason given at that arm. **What the two runs that started this were not.** `run-muhs8hx3-6fd929e6` and `run-muhtuizo-c458e49c` recorded `provider_transport_unknown` with no provider status, no usage and no evidence loop, and t145 narrowed the cause to these six refusals. That cannot be right: `runBudget` is passed to the harness by exactly three production callers -- `recovery/annotation/exploration.ts`, `recovery/annotation/patch-reserve.ts` and `result-verification/verify.ts` -- and a Flow Bootstrap build is none of them, so `reservation` is `null` for a build and this branch cannot fire on one. Both runs were builds. The shape that does fit every field they recorded is `llm.provider_request_failed`, which `normalizedAutomationStudioLlmProviderFailure` answers when a throw cannot be structurally typed, projected by its own arm to `provider_transport_unknown`. Their 167 s and 194 s are the calls that succeeded before it: a harness-projected build failure carries no evidence-loop counts and no per-call usage however many calls preceded it, so those nulls were read as evidence of no call and are evidence of nothing. Established by elimination, not observed -- which is why the `default` arm now publishes the harness code it could not name, so the next such run answers the question from its own record instead of from an argument about the other fields. |
| `FlowAdaptationRequest` | Type | `packages/fluxiq/src/programs/automation-studio/api/contracts/adaptation.ts:185` | - |
| `flowBootstrapBuildEndingFailure` | Value | `packages/fluxiq/src/programs/automation-studio/runtime/flow-bootstrap/generation-failure/evidence-failure.ts:192` | - |
| `flowBootstrapDiagnosticIssueCodes` | Value | `packages/fluxiq/src/programs/automation-studio/runtime/flow-bootstrap/generation-failure/diagnostic.ts:167` | - |
| `flowBootstrapEvidenceCompletionFailure` | Value | `packages/fluxiq/src/programs/automation-studio/runtime/flow-bootstrap/generation-failure/evidence-failure.ts:102` | - |
| `flowBootstrapEvidenceLoopFailure` | Value | `packages/fluxiq/src/programs/automation-studio/runtime/flow-bootstrap/generation-failure/evidence-failure.ts:56` | - |
| `flowBootstrapEvidenceUnusableDecisionFailure` | Value | `packages/fluxiq/src/programs/automation-studio/runtime/flow-bootstrap/generation-failure/evidence-failure.ts:85` | - |
| `flowBootstrapHarnessFailure` | Value | `packages/fluxiq/src/programs/automation-studio/runtime/flow-bootstrap/generation-failure/harness-failure.ts:28` | - |
| `flowBootstrapPermissionRequiredFailure` | Value | `packages/fluxiq/src/programs/automation-studio/runtime/flow-bootstrap/generation-failure/evidence-failure.ts:138` | - |
| `flowBootstrapPhaseFailure` | Value | `packages/fluxiq/src/programs/automation-studio/runtime/flow-bootstrap/generation-failure/phase-failure.ts:25` | - |
| `flowBootstrapThrownIssueCodes` | Value | `packages/fluxiq/src/programs/automation-studio/runtime/flow-bootstrap/generation-failure/thrown-issue-codes.ts:18` | - |
| `flowBootstrapUnclassifiedThrowCode` | Value | `packages/fluxiq/src/programs/automation-studio/runtime/flow-bootstrap/generation-failure/phase-failure.ts:91` | - |
| `flowBootstrapUserInterventionRequiredFailure` | Value | `packages/fluxiq/src/programs/automation-studio/runtime/flow-bootstrap/generation-failure/evidence-failure.ts:165` | - |
| `FlowChangeProposalRequest` | Type | `packages/fluxiq/src/programs/automation-studio/api/contracts/instruction.ts:26` | - |
| `FlowDocument` | Type | `packages/fluxiq/src/flows/index.ts:31` | - |
| `flowDocumentId` | Value | `packages/fluxiq/src/programs/automation-studio/storage/ids.ts:36` | - |
| `FlowEdge` | Type | `packages/fluxiq/src/flows/index.ts:21` | - |
| `FlowExpansionSummaryRequest` | Type | `packages/fluxiq/src/programs/automation-studio/api/contracts/flow.ts:40` | - |
| `FlowIdProjectRequest` | Type | `packages/fluxiq/src/programs/automation-studio/api/contracts/flow.ts:26` | - |
| `FlowInstructionRequest` | Type | `packages/fluxiq/src/programs/automation-studio/api/contracts/instruction.ts:3` | - |
| `flowInstructionScopeFromPayload` | Value | `packages/fluxiq/src/programs/automation-studio/api/handlers/instruction-scope.ts:6` | - |
| `FlowInstructionSetRequest` | Type | `packages/fluxiq/src/programs/automation-studio/api/contracts/instruction.ts:7` | - |
| `FlowMetadataPageRequest` | Type | `packages/fluxiq/src/programs/automation-studio/api/contracts/flow.ts:8` | - |
| `flowMigrationLedgerDocumentId` | Value | `packages/fluxiq/src/programs/automation-studio/storage/ids.ts:40` | - |
| `FlowNode` | Type | `packages/fluxiq/src/flows/index.ts:4` | - |
| `FlowNodeContext` | Type | `packages/fluxiq/src/flows/index.ts:48` | - |
| `FlowNodeHandler` | Type | `packages/fluxiq/src/flows/index.ts:56` | - |
| `FlowProjectRequest` | Type | `packages/fluxiq/src/programs/automation-studio/api/contracts/flow.ts:4` | - |
| `flowPublicationDocumentId` | Value | `packages/fluxiq/src/programs/automation-studio/storage/ids.ts:44` | - |
| `FlowRetry` | Type | `packages/fluxiq/src/flows/index.ts:15` | - |
| `FlowRunActionPageRequest` | Type | `packages/fluxiq/src/programs/automation-studio/api/contracts/run.ts:8` | - |
| `FlowRunDetailRequest` | Type | `packages/fluxiq/src/programs/automation-studio/api/contracts/run.ts:3` | - |
| `FlowRunEventPageRequest` | Type | `packages/fluxiq/src/programs/automation-studio/api/contracts/run.ts:15` | - |
| `FlowState` | Type | `packages/fluxiq/src/flows/index.ts:41` | - |
| `FlowStepResult` | Type | `packages/fluxiq/src/engine/index.ts:101` | - |
| `FlowSubflowRequest` | Type | `packages/fluxiq/src/programs/automation-studio/api/contracts/subflow.ts:3` | - |
| `FlowValidationIssue` | Type | `packages/fluxiq/src/flows/index.ts:61` | - |
| `FluxIQ` | Class | `packages/fluxiq/src/framework/index.ts:120` | - |
| `FLUXIQ_RUNTIME_WITHHELD_VALUE` | Object | `packages/fluxiq/src/runtime/contracts.ts:158` | What a withheld value reads as in a command attempt the runtime keeps. A constant rather than a removed field, so a reader can tell a value that was withheld from one that was never there. |
| `FLUXIQ_STORAGE_LAYOUT_VERSION` | Object | `packages/fluxiq/src/framework/storage-layout.ts:6` | - |
| `FluxIQConfigFile` | Type | `packages/fluxiq/src/framework/index.ts:106` | - |
| `fluxiqConsoleTheme` | Object | `packages/fluxiq/src/ui/index.ts:79` | - |
| `FluxIQEnvironment` | Type | `packages/fluxiq/src/framework/index.ts:82` | - |
| `FluxIQEnvironmentKey` | Type | `packages/fluxiq/src/framework/index.ts:84` | - |
| `FluxIQHostPaths` | Type | `packages/fluxiq/src/framework/index.ts:23` | - |
| `FluxIQIconName` | Type | `packages/fluxiq/src/ui/index.ts:32` | - |
| `FluxIQMigrationJournal` | Type | `packages/fluxiq/src/framework/storage-layout.ts:26` | - |
| `FluxIQOptions` | Type | `packages/fluxiq/src/framework/index.ts:55` | - |
| `FluxIQPerformanceMetric` | Type | `packages/fluxiq/src/programs/_shared/performance-metrics.ts:34` | - |
| `fluxiqPerformanceMetricsSnapshot` | Value | `packages/fluxiq/src/programs/_shared/performance-metrics.ts:100` | - |
| `FluxIQRuntimeAdapter` | Type | `packages/fluxiq/src/runtime/contracts.ts:200` | - |
| `FluxIQRuntimeCapability` | Type | `packages/fluxiq/src/runtime/contracts.ts:22` | - |
| `FluxIQRuntimeCapabilityKind` | Type | `packages/fluxiq/src/runtime/contracts.ts:12` | - |
| `FluxIQRuntimeClient` | Type | `packages/fluxiq/src/runtime/contracts.ts:40` | - |
| `FluxIQRuntimeClientStatus` | Type | `packages/fluxiq/src/runtime/contracts.ts:33` | - |
| `FluxIQRuntimeCommand` | Type | `packages/fluxiq/src/runtime/contracts.ts:60` | - |
| `FluxIQRuntimeCommandAttempt` | Type | `packages/fluxiq/src/runtime/contracts.ts:131` | - |
| `FluxIQRuntimeCommandAttemptResult` | Type | `packages/fluxiq/src/runtime/contracts.ts:164` | The result a command attempt keeps: the command's result, except that a payload its caller withheld reads as `FLUXIQ_RUNTIME_WITHHELD_VALUE`. |
| `FluxIQRuntimeCommandKind` | Type | `packages/fluxiq/src/runtime/contracts.ts:53` | - |
| `FluxIQRuntimeCommandResult` | Type | `packages/fluxiq/src/runtime/contracts.ts:82` | - |
| `FluxIQRuntimeCommandStatus` | Type | `packages/fluxiq/src/runtime/contracts.ts:74` | - |
| `FluxIQRuntimeDispatchContext` | Type | `packages/fluxiq/src/runtime/contracts.ts:179` | - |
| `FluxIQRuntimeEvent` | Type | `packages/fluxiq/src/runtime/contracts.ts:233` | - |
| `FluxIQRuntimeEventHandler` | Type | `packages/fluxiq/src/runtime/contracts.ts:247` | - |
| `FluxIQRuntimeExecutionContext` | Type | `packages/fluxiq/src/runtime/contracts.ts:147` | - |
| `FluxIQRuntimeRun` | Type | `packages/fluxiq/src/runtime/contracts.ts:112` | - |
| `FluxIQRuntimeRunStatus` | Type | `packages/fluxiq/src/runtime/contracts.ts:104` | - |
| `FluxIQRuntimeSnapshot` | Type | `packages/fluxiq/src/runtime/contracts.ts:251` | - |
| `fluxiqRuntimeTextWithholding` | Value | `packages/fluxiq/src/runtime/text-withholding.ts:25` | - |
| `FluxIQRuntimeTransport` | Type | `packages/fluxiq/src/runtime/contracts.ts:221` | - |
| `FluxIQRuntimeTransportKind` | Type | `packages/fluxiq/src/runtime/contracts.ts:4` | - |
| `FluxIQRuntimeWithheldValues` | Type | `packages/fluxiq/src/runtime/contracts.ts:172` | Values a command carries that its caller supplied from run-time data of unknown sensitivity. The runtime is told that they are withheld, never why. |
| `FluxIQSetupOptions` | Type | `packages/fluxiq/src/framework/index.ts:49` | - |
| `FluxIQSetupResult` | Type | `packages/fluxiq/src/framework/index.ts:112` | - |
| `fluxiqStatusLabel` | Value | `packages/fluxiq/src/ui/index.ts:23` | - |
| `fluxiqStatusTone` | Value | `packages/fluxiq/src/ui/index.ts:14` | - |
| `FluxIQStorageConfig` | Type | `packages/fluxiq/src/framework/storage-layout.ts:8` | - |
| `FluxIQStorageInspection` | Type | `packages/fluxiq/src/framework/storage-layout.ts:15` | - |
| `FluxIQStorageMigrationResult` | Type | `packages/fluxiq/src/framework/storage-migration.ts:17` | - |
| `FluxIQTheme` | Type | `packages/fluxiq/src/ui/index.ts:59` | - |
| `FluxIQThemeColorToken` | Type | `packages/fluxiq/src/ui/index.ts:51` | - |
| `FluxIQUncommittedV2AdoptionResult` | Type | `packages/fluxiq/src/framework/uncommitted-v2-adoption.ts:20` | - |
| `FrameworkResult` | Type | `packages/fluxiq/src/core/index.ts:3` | - |
| `GeneratedDocumentationPage` | Type | `packages/fluxiq/src/programs/docs/types.ts:24` | - |
| `GeneratedMetadata` | Type | `packages/fluxiq/src/programs/automation-studio/model/evidence.ts:78` | - |
| `GenerateFlowBootstrapAdaptationFailureDiagnostic` | Type | `packages/fluxiq/src/programs/automation-studio/api/contracts/adaptation.ts:131` | - |
| `GenerateFlowBootstrapAdaptationRequest` | Type | `packages/fluxiq/src/programs/automation-studio/api/contracts/adaptation.ts:94` | - |
| `GenerateFlowBootstrapAdaptationResponse` | Type | `packages/fluxiq/src/programs/automation-studio/api/contracts/adaptation.ts:157` | - |
| `generateFlowTypeScript` | Value | `packages/fluxiq/src/programs/automation-studio/dsl/generator.ts:7` | - |
| `GeneratePolicyRequest` | Type | `packages/fluxiq/src/programs/automation-studio/api/contracts/policy.ts:4` | - |
| `GeneratePolicyResponse` | Type | `packages/fluxiq/src/programs/automation-studio/api/contracts/policy.ts:10` | - |
| `GenerateRecordingProposalInput` | Type | `packages/fluxiq/src/programs/automation-studio/runtime/service/proposals/types.ts:23` | - |
| `GenerateRecordingProposalResult` | Type | `packages/fluxiq/src/programs/automation-studio/runtime/service/proposals/types.ts:33` | - |
| `getAutomationNodeDefinition` | Value | `packages/fluxiq/src/programs/automation-studio/nodes/registry.ts:53` | - |
| `getAutomationNodeDefinitions` | Value | `packages/fluxiq/src/programs/automation-studio/nodes/registry.ts:40` | - |
| `getAutomationNodeDefinitionsByClass` | Value | `packages/fluxiq/src/programs/automation-studio/nodes/registry.ts:45` | - |
| `getCallFlowConfiguration` | Value | `packages/fluxiq/src/programs/automation-studio/model/composites.ts:89` | - |
| `GetProposalRequest` | Type | `packages/fluxiq/src/programs/automation-studio/api/contracts/recording.ts:54` | - |
| `GetRecordingEntryStateRequest` | Type | `packages/fluxiq/src/programs/automation-studio/api/contracts/recording.ts:32` | - |
| `GetRuntimeRunRequest` | Type | `packages/fluxiq/src/programs/runtime-control/api/contracts.ts:9` | - |
| `GetStateSnapshotRequest` | Type | `packages/fluxiq/src/programs/automation-studio/api/contracts/recording.ts:41` | - |
| `GLOBAL_PROGRAMS` | Object | `packages/fluxiq/src/programs/_shared/catalog.ts:13` | - |
| `GlobalProgramApiRegistry` | Class | `packages/fluxiq/src/programs/_shared/api.ts:65` | - |
| `GlobalProgramDefinition` | Type | `packages/fluxiq/src/programs/_shared/types.ts:22` | - |
| `GlobalProgramRuntime` | Type | `packages/fluxiq/src/programs/_shared/runtime.ts:20` | - |
| `GraphPatchOperation` | Type | `packages/fluxiq/src/programs/automation-studio/api/contracts/graph.ts:11` | - |
| `GraphViewportRequest` | Type | `packages/fluxiq/src/programs/automation-studio/api/contracts/graph.ts:4` | - |
| `holdAutomationStudioRecoveryPatchReserve` | Value | `packages/fluxiq/src/programs/automation-studio/runtime/recovery/annotation/patch-reserve.ts:45` | - |
| `hostExpectationEvaluator` | Value | `packages/fluxiq/src/programs/automation-studio/runtime/host-runtime.ts:59` | - |
| `hostRuntimeCapabilityIds` | Value | `packages/fluxiq/src/programs/automation-studio/runtime/host-runtime.ts:65` | - |
| `IDENTITY_ACCESS_ENDPOINTS` | Object | `packages/fluxiq/src/programs/identity-access/api/contracts.ts:3` | - |
| `IDENTITY_ACCESS_PROGRAM` | Object | `packages/fluxiq/src/programs/identity-access/metadata.ts:3` | - |
| `IdentityAccessPanel` | Type | `packages/fluxiq/src/programs/identity-access/ui/contracts.ts:1` | - |
| `IdentityAccessService` | Class | `packages/fluxiq/src/programs/identity-access/runtime/service.ts:53` | - |
| `IdentityAccessServiceOptions` | Type | `packages/fluxiq/src/programs/identity-access/types.ts:96` | - |
| `IdentityAccessSnapshot` | Type | `packages/fluxiq/src/programs/identity-access/types.ts:55` | - |
| `IdentityAccessSnapshotResponse` | Type | `packages/fluxiq/src/programs/identity-access/api/contracts.ts:18` | - |
| `IdentityAccessStore` | Type | `packages/fluxiq/src/programs/identity-access/storage/contracts.ts:3` | - |
| `IdentityAccessViewState` | Type | `packages/fluxiq/src/programs/identity-access/ui/contracts.ts:3` | - |
| `IdentityCredentialChange` | Type | `packages/fluxiq/src/programs/identity-access/types.ts:76` | A password change announced to credential-change subscribers, such as a program that re-seals data under the new password. `currentPassword` is set only for a self-service change, where the account's own current password was proven for it; an administrator's reset of another account carries none, so data sealed under the old password cannot be recovered. |
| `IdentityCredentialChangeSubscriber` | Type | `packages/fluxiq/src/programs/identity-access/types.ts:90` | The credential-change port. Every subscriber `prepare`s before the credential is written, and a `prepare` that throws refuses the change. After the write each subscriber is sent `commit`; when a `prepare` or the write fails, each subscriber asked to prepare is sent `abort` instead. |
| `initializeFluxIQStorage` | Value | `packages/fluxiq/src/framework/storage-layout.ts:82` | - |
| `initialNodeStatePhases` | Object | `packages/fluxiq/src/programs/automation-studio/model/node-state.ts:67` | - |
| `InputAdapter` | Type | `packages/fluxiq/src/io/index.ts:68` | - |
| `InputOutputBinding` | Type | `packages/fluxiq/src/io/index.ts:83` | - |
| `InputReadRequest` | Type | `packages/fluxiq/src/io/index.ts:18` | - |
| `inspectFluxIQStorage` | Value | `packages/fluxiq/src/framework/storage-layout.ts:49` | - |
| `InspectStateDiffRequest` | Type | `packages/fluxiq/src/programs/automation-studio/api/contracts/recording.ts:128` | - |
| `interpretAutomationStudioConversationTurn` | Value | `packages/fluxiq/src/programs/automation-studio/runtime/conversations/instructions/interpret.ts:56` | - |
| `inventoryAutomationStudioLegacyProject` | Value | `packages/fluxiq/src/programs/automation-studio/storage/project/migration-cutover.ts:294` | - |
| `IoAdapterSummary` | Type | `packages/fluxiq/src/io/index.ts:156` | - |
| `IoEnvelope` | Type | `packages/fluxiq/src/io/index.ts:8` | - |
| `IoInputRole` | Type | `packages/fluxiq/src/io/index.ts:81` | - |
| `IoMode` | Type | `packages/fluxiq/src/io/index.ts:6` | - |
| `IoRegistration` | Type | `packages/fluxiq/src/io/index.ts:116` | - |
| `IoRegistry` | Class | `packages/fluxiq/src/io/index.ts:173` | - |
| `IoSnapshot` | Type | `packages/fluxiq/src/io/index.ts:168` | - |
| `IoUnsubscribe` | Type | `packages/fluxiq/src/io/index.ts:52` | - |
| `IoValidationIssue` | Type | `packages/fluxiq/src/io/index.ts:147` | - |
| `isAutomationNodeParameterStateBinding` | Value | `packages/fluxiq/src/programs/automation-studio/nodes/parameter-bindings.ts:28` | - |
| `isAutomationStudioActionConsequence` | Value | `packages/fluxiq/src/programs/automation-studio/runtime/action-permissions/consequences.ts:75` | - |
| `isAutomationStudioActionPermissionCarriedName` | Value | `packages/fluxiq/src/programs/automation-studio/runtime/action-permissions/request.ts:172` | - |
| `isAutomationStudioAdaptationId` | Value | `packages/fluxiq/src/programs/automation-studio/runtime/flow-change/contracts.ts:247` | - |
| `isAutomationStudioAdaptiveFailureClass` | Value | `packages/contracts/src/failure/adaptive-class.ts:49` | - |
| `isAutomationStudioConversationAuthor` | Value | `packages/fluxiq/src/programs/automation-studio/runtime/conversations/turn.ts:40` | - |
| `isAutomationStudioConversationStatus` | Value | `packages/fluxiq/src/programs/automation-studio/runtime/conversations/thread.ts:56` | - |
| `isAutomationStudioConversationSubjectKind` | Value | `packages/fluxiq/src/programs/automation-studio/runtime/conversations/thread.ts:52` | - |
| `isAutomationStudioDeepSeekModel` | Value | `packages/fluxiq/src/programs/automation-studio/runtime/llm/deepseek/models.ts:57` | - |
| `isAutomationStudioDestructiveActionConsequence` | Value | `packages/fluxiq/src/programs/automation-studio/runtime/action-permissions/destructive.ts:63` | - |
| `isAutomationStudioElementTarget` | Value | `packages/fluxiq/src/programs/automation-studio/model/action-element-target.ts:64` | - |
| `isAutomationStudioEvidenceFlowBootstrapResultWithinLimits` | Value | `packages/fluxiq/src/programs/automation-studio/runtime/flow-bootstrap/plan/evidence-schema.ts:147` | - |
| `isAutomationStudioExplorationOutcome` | Value | `packages/fluxiq/src/programs/automation-studio/runtime/recovery/exploration-outcome.ts:142` | - |
| `isAutomationStudioExplorationStepReplayable` | Value | `packages/fluxiq/src/programs/automation-studio/runtime/exploration-reduction/step.ts:77` | - |
| `isAutomationStudioExploredEvidenceLabel` | Value | `packages/fluxiq/src/programs/automation-studio/runtime/llm/harness/explored-evidence-label.ts:36` | - |
| `isAutomationStudioLlmRecentActionContext` | Value | `packages/fluxiq/src/programs/automation-studio/runtime/llm/harness/context-packet.ts:199` | - |
| `isAutomationStudioLoopStage` | Value | `packages/fluxiq/src/programs/automation-studio/runtime/llm/stages/protocol.ts:50` | - |
| `isAutomationStudioModelAuthoredTargetOverrideTarget` | Value | `packages/fluxiq/src/programs/automation-studio/runtime/llm/harness/structured-response.ts:217` | - |
| `isAutomationStudioNoRepairReason` | Value | `packages/fluxiq/src/programs/automation-studio/runtime/llm/harness/structured-response.ts:45` | - |
| `isAutomationStudioObjectReference` | Value | `packages/fluxiq/src/programs/automation-studio/storage/object-store.ts:329` | - |
| `isAutomationStudioRuntimeTargetOverrideTarget` | Value | `packages/fluxiq/src/programs/automation-studio/runtime/llm/harness/structured-response.ts:204` | - |
| `isAutomationStudioSubflowGraphMetadata` | Value | `packages/fluxiq/src/programs/automation-studio/model/flows.ts:37` | - |
| `isRecord` | Value | `packages/fluxiq/src/programs/automation-studio/runtime/flow-bootstrap/generation-failure/diagnostic-parse.ts:324` | - |
| `isRecordingIndex` | Value | `packages/fluxiq/src/programs/automation-studio/storage/state-index.ts:170` | - |
| `JsonObject` | Type | `packages/contracts/src/core.ts:3` | - |
| `JsonPrimitive` | Type | `packages/contracts/src/core.ts:1` | - |
| `JsonValue` | Type | `packages/contracts/src/core.ts:2` | - |
| `latestStateSnapshot` | Value | `packages/fluxiq/src/programs/automation-studio/model/recording-domain.ts:245` | - |
| `LearnedActionCluster` | Type | `packages/fluxiq/src/programs/automation-studio/learning/contracts.ts:21` | - |
| `LearnedConditionCandidate` | Type | `packages/fluxiq/src/programs/automation-studio/mining/contracts.ts:183` | - |
| `LearnedConditionRole` | Type | `packages/fluxiq/src/programs/automation-studio/mining/contracts.ts:176` | - |
| `LearnedEffect` | Type | `packages/fluxiq/src/programs/automation-studio/learning/contracts.ts:13` | - |
| `LearnedTaskModel` | Type | `packages/fluxiq/src/programs/automation-studio/learning/contracts.ts:43` | - |
| `learnedTaskModelDocumentId` | Value | `packages/fluxiq/src/programs/automation-studio/storage/ids.ts:56` | - |
| `LearnedTransition` | Type | `packages/fluxiq/src/programs/automation-studio/learning/contracts.ts:34` | - |
| `LearningUncertainty` | Type | `packages/fluxiq/src/programs/automation-studio/learning/contracts.ts:5` | - |
| `LearnTaskModelRequest` | Type | `packages/fluxiq/src/programs/automation-studio/api/contracts/policy.ts:15` | - |
| `ListGraphRevisionsRequest` | Type | `packages/fluxiq/src/programs/automation-studio/api/contracts/graph.ts:26` | - |
| `ListRecordingDomainsResponse` | Type | `packages/fluxiq/src/programs/automation-studio/api/contracts/recording.ts:92` | - |
| `loadFluxIQEnv` | Value | `packages/fluxiq/src/framework/index.ts:418` | - |
| `LoadFluxIQEnvOptions` | Type | `packages/fluxiq/src/framework/index.ts:412` | - |
| `MarkerEntry` | Type | `packages/fluxiq/src/programs/automation-studio/model/timeline.ts:62` | - |
| `MAX_DIAGNOSTIC_ISSUE_CODES` | Object | `packages/fluxiq/src/programs/automation-studio/runtime/flow-bootstrap/generation-failure/diagnostic.ts:162` | - |
| `measureAutomationStudioGraphStoreBenchmark` | Value | `packages/fluxiq/src/programs/automation-studio/testing/scale-graph-store.ts:14` | - |
| `measureAutomationStudioLegacyBaseline` | Value | `packages/fluxiq/src/programs/automation-studio/testing/scale-baseline.ts:37` | - |
| `migrateAutomationStudioLegacyObjectIndex` | Value | `packages/fluxiq/src/programs/automation-studio/storage/project/object-index-migration.ts:14` | - |
| `migrateAutomationStudioLegacyProjectCatalog` | Value | `packages/fluxiq/src/programs/automation-studio/storage/catalog-index-migration.ts:18` | - |
| `migrateFluxIQStorage` | Value | `packages/fluxiq/src/framework/storage-migration.ts:53` | - |
| `MigrateLegacyFlowRepresentationRequest` | Type | `packages/fluxiq/src/programs/automation-studio/api/contracts/subflow.ts:7` | - |
| `Migration` | Type | `packages/fluxiq/src/programs/database-manager/types.ts:39` | - |
| `MigrationRun` | Type | `packages/fluxiq/src/programs/database-manager/types.ts:46` | - |
| `MineRecordingEvidenceRequest` | Type | `packages/fluxiq/src/programs/automation-studio/api/contracts/recording.ts:123` | - |
| `MiningWindow` | Type | `packages/fluxiq/src/programs/automation-studio/mining/contracts.ts:144` | - |
| `MiningWindowKind` | Type | `packages/fluxiq/src/programs/automation-studio/mining/contracts.ts:142` | - |
| `MockClientGatewayClient` | Class | `packages/fluxiq/src/client-gateway/testing/mock-client.ts:4` | - |
| `MutateFlowMapRouteRequest` | Type | `packages/fluxiq/src/programs/automation-studio/api/contracts/flow-map.ts:45` | - |
| `NavigationItem` | Type | `packages/fluxiq/src/ui/index.ts:43` | - |
| `NodeEvidenceBinding` | Type | `packages/fluxiq/src/programs/automation-studio/model/evidence.ts:64` | - |
| `NodeEvidenceRole` | Type | `packages/fluxiq/src/programs/automation-studio/model/evidence.ts:46` | - |
| `NodeStatePhase` | Type | `packages/fluxiq/src/programs/automation-studio/model/node-state.ts:34` | - |
| `NodeStateRuntimeComparison` | Type | `packages/fluxiq/src/programs/automation-studio/model/node-state.ts:46` | - |
| `NodeStateSource` | Type | `packages/fluxiq/src/programs/automation-studio/model/node-state.ts:5` | - |
| `NodeStateSourceKind` | Type | `packages/fluxiq/src/programs/automation-studio/model/node-state.ts:3` | - |
| `NodeStateViewSelection` | Type | `packages/fluxiq/src/programs/automation-studio/model/node-state.ts:40` | - |
| `NormalizationIssue` | Type | `packages/fluxiq/src/programs/automation-studio/normalization/contracts.ts:6` | - |
| `NormalizationIssueSeverity` | Type | `packages/fluxiq/src/programs/automation-studio/normalization/contracts.ts:4` | - |
| `NormalizationOptions` | Type | `packages/fluxiq/src/programs/automation-studio/normalization/contracts.ts:22` | - |
| `NormalizationReviewArtifact` | Type | `packages/fluxiq/src/programs/automation-studio/runtime/service/recordings/types.ts:9` | - |
| `normalizeAutomationStudioElementTarget` | Value | `packages/fluxiq/src/programs/automation-studio/model/action-element-target.ts:74` | - |
| `normalizeAutomationStudioFlow` | Value | `packages/fluxiq/src/programs/automation-studio/dsl/compiler.ts:38` | - |
| `normalizeAutomationStudioFlowBuildPlan` | Value | `packages/fluxiq/src/programs/automation-studio/runtime/flow-bootstrap/adaptation.ts:157` | - |
| `normalizeAutomationStudioName` | Value | `packages/fluxiq/src/programs/automation-studio/nodes/name-match/normalize.ts:19` | - |
| `normalizeAutomationStudioRuntimeInterventionMode` | Value | `packages/fluxiq/src/programs/automation-studio/runtime/service/runtime-adaptation/intervention-mode.ts:6` | - |
| `normalizedAutomationStudioLlmProviderFailure` | Value | `packages/fluxiq/src/programs/automation-studio/runtime/llm/provider-contract.ts:183` | - |
| `normalizeDomainId` | Value | `packages/fluxiq/src/domains/index.ts:112` | - |
| `NormalizedTimeline` | Type | `packages/fluxiq/src/programs/automation-studio/normalization/contracts.ts:36` | - |
| `normalizedTimelineDocumentId` | Value | `packages/fluxiq/src/programs/automation-studio/storage/ids.ts:48` | - |
| `NormalizedTimelineProjectRequest` | Type | `packages/fluxiq/src/programs/automation-studio/api/contracts/recording.ts:119` | - |
| `normalizeFluxIQStatus` | Value | `packages/fluxiq/src/ui/index.ts:10` | - |
| `NormalizeRecordingRequest` | Type | `packages/fluxiq/src/programs/automation-studio/api/contracts/recording.ts:110` | - |
| `normalizeRecordingTimeline` | Value | `packages/fluxiq/src/programs/automation-studio/normalization/default-normalizer.ts:96` | - |
| `NoteEntry` | Type | `packages/fluxiq/src/programs/automation-studio/model/timeline.ts:57` | - |
| `ObservationEntry` | Type | `packages/fluxiq/src/programs/automation-studio/model/timeline.ts:44` | - |
| `observeAutomationStudioEvidenceLoop` | Value | `packages/fluxiq/src/programs/automation-studio/runtime/activity/observer.ts:87` | - |
| `OutputAdapter` | Type | `packages/fluxiq/src/io/index.ts:109` | - |
| `OutputDispatchRequest` | Type | `packages/fluxiq/src/io/index.ts:24` | - |
| `OutputDispatchResult` | Type | `packages/fluxiq/src/io/index.ts:31` | - |
| `packAutomationStudioLlmContext` | Value | `packages/fluxiq/src/programs/automation-studio/runtime/llm/harness/context-packet.ts:215` | - |
| `packAutomationStudioReusableLlmContext` | Value | `packages/fluxiq/src/programs/automation-studio/runtime/reusable-llm-context.ts:46` | - |
| `ParameterDefinition` | Type | `packages/fluxiq/src/programs/automation-studio/model/actions.ts:7` | - |
| `parseAutomationStudioActionPermissionRequest` | Value | `packages/fluxiq/src/programs/automation-studio/runtime/action-permissions/request.ts:125` | - |
| `parseAutomationStudioConversationDecision` | Value | `packages/fluxiq/src/programs/automation-studio/runtime/conversations/instructions/parse.ts:32` | - |
| `parseAutomationStudioDeterministicPath` | Value | `packages/fluxiq/src/programs/automation-studio/model/validation/adaptation.ts:194` | - |
| `parseAutomationStudioFailureRecord` | Value | `packages/contracts/src/failure/parse-record.ts:48` | - |
| `parseAutomationStudioFlowBootstrapBuildEnding` | Value | `packages/fluxiq/src/programs/automation-studio/runtime/flow-bootstrap/generation-failure/build-ending.ts:83` | - |
| `parseAutomationStudioFlowBootstrapEvidenceSteps` | Value | `packages/fluxiq/src/programs/automation-studio/runtime/flow-bootstrap/evidence-loop-steps.ts:325` | - |
| `parseAutomationStudioFlowBootstrapFailureDiagnostic` | Value | `packages/fluxiq/src/programs/automation-studio/runtime/flow-bootstrap/generation-failure/diagnostic-parse.ts:23` | - |
| `parseAutomationStudioFlowBootstrapGenerationError` | Value | `packages/fluxiq/src/programs/automation-studio/runtime/flow-bootstrap/generation-failure/error.ts:25` | - |
| `parseAutomationStudioFlowBootstrapGenerationReadiness` | Value | `packages/fluxiq/src/programs/automation-studio/api/contracts/adaptation.ts:52` | - |
| `parseAutomationStudioFlowBootstrapIncompleteDraft` | Value | `packages/fluxiq/src/programs/automation-studio/runtime/flow-bootstrap/incomplete-draft/parse.ts:34` | - |
| `parseAutomationStudioFlowBootstrapPlan` | Value | `packages/fluxiq/src/programs/automation-studio/runtime/flow-bootstrap/plan/parsing.ts:18` | - |
| `parseAutomationStudioFlowBootstrapProviderThrow` | Value | `packages/fluxiq/src/programs/automation-studio/runtime/flow-bootstrap/generation-failure/diagnostic-parse.ts:106` | - |
| `parseAutomationStudioFlowChangeOrigin` | Value | `packages/fluxiq/src/programs/automation-studio/model/validation/adaptation.ts:255` | - |
| `parseAutomationStudioFlowScript` | Value | `packages/fluxiq/src/programs/automation-studio/runtime/flow-bootstrap/authoring/parse.ts:40` | - |
| `parseAutomationStudioLlmProviderRefusal` | Value | `packages/fluxiq/src/programs/automation-studio/runtime/provider-refusal/record.ts:127` | - |
| `parseAutomationStudioLlmProviderResult` | Value | `packages/fluxiq/src/programs/automation-studio/runtime/llm/harness/provider-result.ts:18` | - |
| `parseAutomationStudioObjectContentRef` | Value | `packages/fluxiq/src/programs/automation-studio/storage/object-store.ts:342` | - |
| `parseAutomationStudioPanelCapabilities` | Value | `packages/fluxiq/src/programs/automation-studio/runtime/panel-capabilities/parse.ts:30` | - |
| `parseAutomationStudioPermittedConsequences` | Value | `packages/fluxiq/src/programs/automation-studio/runtime/action-permissions/consequences.ts:90` | - |
| `parseAutomationStudioRecordOutput` | Value | `packages/contracts/src/record-sets/parse-output.ts:26` | - |
| `parseConstrainedFlowModule` | Value | `packages/fluxiq/src/programs/automation-studio/dsl/source.ts:19` | - |
| `pathSize` | Value | `packages/fluxiq/src/framework/storage-layout.ts:121` | - |
| `Permission` | Type | `packages/fluxiq/src/programs/identity-access/types.ts:4` | - |
| `planAutomationStudioRuntimeRecovery` | Value | `packages/fluxiq/src/programs/automation-studio/runtime/recovery/plan.ts:106` | - |
| `PolicyAction` | Type | `packages/fluxiq/src/programs/automation-studio/model/actions.ts:73` | - |
| `PolicyEdge` | Type | `packages/fluxiq/src/programs/automation-studio/model/policies.ts:40` | - |
| `PolicyGraph` | Type | `packages/fluxiq/src/programs/automation-studio/model/policies.ts:80` | - |
| `policyGraphDocumentId` | Value | `packages/fluxiq/src/programs/automation-studio/storage/ids.ts:60` | - |
| `PolicyGraphPatch` | Type | `packages/fluxiq/src/programs/automation-studio/runtime/policy-model.ts:20` | - |
| `PolicyNode` | Type | `packages/fluxiq/src/programs/automation-studio/model/policies.ts:60` | - |
| `PolicyProposalArtifact` | Type | `packages/fluxiq/src/programs/automation-studio/runtime/policy-model.ts:7` | - |
| `PolicyRunner` | Type | `packages/fluxiq/src/programs/automation-studio/runtime/contracts.ts:16` | - |
| `PollComputeCommandsRequest` | Type | `packages/fluxiq/src/programs/compute-control/api/contracts.ts:28` | - |
| `preflightAutomationStudioRuntimePatch` | Value | `packages/fluxiq/src/programs/automation-studio/runtime/live-patch.ts:143` | - |
| `preflightAutomationStudioRuntimeTargetOverrideProposal` | Value | `packages/fluxiq/src/programs/automation-studio/runtime/live-patch.ts:181` | - |
| `PreflightDefinition` | Type | `packages/fluxiq/src/programs/automation-studio/model/actions.ts:16` | - |
| `ProcessFinalizedRecordingRequest` | Type | `packages/fluxiq/src/programs/automation-studio/api/contracts/recording.ts:105` | - |
| `ProcessFinalizedRecordingResult` | Type | `packages/fluxiq/src/programs/automation-studio/runtime/service/proposals/types.ts:10` | - |
| `processRecordingDomainEvent` | Value | `packages/fluxiq/src/programs/automation-studio/model/recording-domain.ts:172` | - |
| `PRODUCTION_RUNNER_ENDPOINTS` | Object | `packages/fluxiq/src/programs/production-runner/api/contracts.ts:4` | - |
| `PRODUCTION_RUNNER_PROGRAM` | Object | `packages/fluxiq/src/programs/production-runner/metadata.ts:3` | - |
| `ProductionRun` | Type | `packages/fluxiq/src/programs/production-runner/types.ts:7` | - |
| `ProductionRunDispatcher` | Type | `packages/fluxiq/src/programs/production-runner/runtime/service.ts:6` | - |
| `ProductionRunExecution` | Type | `packages/fluxiq/src/programs/production-runner/types.ts:27` | - |
| `ProductionRunnerPanel` | Type | `packages/fluxiq/src/programs/production-runner/ui/contracts.ts:1` | - |
| `ProductionRunnerService` | Class | `packages/fluxiq/src/programs/production-runner/runtime/service.ts:16` | - |
| `ProductionRunnerSnapshot` | Type | `packages/fluxiq/src/programs/production-runner/types.ts:44` | - |
| `ProductionRunnerSnapshotResponse` | Type | `packages/fluxiq/src/programs/production-runner/api/contracts.ts:37` | - |
| `ProductionRunnerStore` | Type | `packages/fluxiq/src/programs/production-runner/storage/contracts.ts:3` | - |
| `ProductionRunnerViewState` | Type | `packages/fluxiq/src/programs/production-runner/ui/contracts.ts:3` | - |
| `ProductionRunResponse` | Type | `packages/fluxiq/src/programs/production-runner/api/contracts.ts:35` | - |
| `ProductionRunStatus` | Type | `packages/fluxiq/src/programs/production-runner/types.ts:3` | - |
| `ProductionRunTargetType` | Type | `packages/fluxiq/src/programs/production-runner/types.ts:5` | - |
| `ProductionTarget` | Type | `packages/fluxiq/src/programs/production-runner/types.ts:35` | - |
| `ProgramApiActor` | Type | `packages/fluxiq/src/programs/_shared/api.ts:33` | - |
| `ProgramApiHandler` | Type | `packages/fluxiq/src/programs/_shared/api.ts:55` | - |
| `ProgramApiRequest` | Type | `packages/fluxiq/src/programs/_shared/api.ts:40` | - |
| `ProgramApiResponse` | Type | `packages/fluxiq/src/programs/_shared/api.ts:48` | - |
| `programAuthorizationPinError` | Value | `packages/fluxiq/src/programs/_shared/authorization.ts:8` | - |
| `ProgramDirectory` | Type | `packages/fluxiq/src/programs/_shared/types.ts:31` | - |
| `ProgramDirectoryContract` | Type | `packages/contracts/src/program-api.ts:41` | - |
| `programDirectorySchema` | Object | `packages/contracts/src/program-api.ts:30` | - |
| `ProgramEndpointClassification` | Type | `packages/fluxiq/src/programs/_shared/api.ts:31` | What an endpoint does to persisted state, and therefore which credential the registry requires beyond the endpoint's permission. Every registration declares one, so a new endpoint cannot reach the wire unclassified: omitting the field is a compile error, not a review note. - `read` — persists nothing. The permission is the whole gate. - `authoring` — creates or edits user content, or withdraws access without removing persisted data. The permission is the whole gate: the operator's PIN guards destruction, not authorship, so an autonomous loop can build and edit Flows with nobody at the keyboard, and revoking a compromised session or client never waits behind a prompt. - `destructive` — removes persisted user data, or takes an irreversible external action. `call()` requires the operator's session PIN before the handler runs. - `program-gated` — the owning program runs its own, stronger credential check inside the handler (password, PIN and TOTP, or a time-boxed grant). The registry adds nothing, so that one regime stays the single rule. - `destructive-ungated` — destructive, and no credential is checked. A declared gap, not an endorsement: either no operator auth session reaches the program at all, or the gate was never written. Each one is listed in `docs/architecture/automation-studio/persistence.md`. |
| `ProgramEndpointPerformanceMetric` | Type | `packages/fluxiq/src/programs/_shared/performance-metrics.ts:19` | - |
| `ProgramPinAuthorizationPayload` | Type | `packages/fluxiq/src/programs/_shared/authorization.ts:3` | - |
| `ProgramScope` | Type | `packages/fluxiq/src/programs/_shared/types.ts:4` | - |
| `ProgramScopeContract` | Type | `packages/contracts/src/program-api.ts:38` | - |
| `programScopeSchema` | Object | `packages/contracts/src/program-api.ts:3` | - |
| `ProgramStatus` | Type | `packages/fluxiq/src/programs/_shared/types.ts:8` | - |
| `ProgramSummary` | Type | `packages/fluxiq/src/programs/_shared/types.ts:10` | - |
| `ProgramSummaryContract` | Type | `packages/contracts/src/program-api.ts:39` | - |
| `programSummarySchema` | Object | `packages/contracts/src/program-api.ts:7` | - |
| `ProjectDatasetListRequest` | Type | `packages/fluxiq/src/programs/automation-studio/api/contracts/dataset.ts:38` | The Data window's tables for a project, newest write first (CD21). |
| `projectPublishedFlowSnapshotToNodeDefinition` | Value | `packages/fluxiq/src/programs/automation-studio/model/composites.ts:71` | - |
| `projectSummaryFromProject` | Value | `packages/fluxiq/src/programs/automation-studio/storage/file-store.ts:249` | - |
| `ProposalNodeStateLink` | Type | `packages/fluxiq/src/programs/automation-studio/storage/state-index.ts:107` | - |
| `proposalSummaryFromPolicyProposal` | Value | `packages/fluxiq/src/programs/automation-studio/storage/file-store.ts:262` | - |
| `proposalSummaryFromRecordingFlowProposal` | Value | `packages/fluxiq/src/programs/automation-studio/storage/file-store.ts:278` | - |
| `proposeAutomationStudioRuntimeTargetOverride` | Value | `packages/fluxiq/src/programs/automation-studio/runtime/live-patch.ts:202` | - |
| `ProposePolicyFromModelRequest` | Type | `packages/fluxiq/src/programs/automation-studio/api/contracts/policy.ts:20` | - |
| `PublishFlowRequest` | Type | `packages/fluxiq/src/programs/automation-studio/api/contracts/flow.ts:30` | - |
| `readAutomationStudioActionDeclaration` | Value | `packages/fluxiq/src/programs/automation-studio/runtime/action-permissions/declaration.ts:143` | - |
| `readAutomationStudioInstructedConsequences` | Value | `packages/fluxiq/src/programs/automation-studio/runtime/action-permissions/instructed.ts:104` | - |
| `readMigrationJournal` | Value | `packages/fluxiq/src/framework/storage-layout.ts:97` | - |
| `readStorageConfig` | Value | `packages/fluxiq/src/framework/storage-layout.ts:40` | - |
| `recordAutomationStudioAdaptationReplays` | Value | `packages/fluxiq/src/programs/automation-studio/runtime/adaptation-confidence/replay.ts:111` | - |
| `RecordEnvelope` | Type | `packages/fluxiq/src/programs/database-manager/types.ts:7` | - |
| `RECORDING_STATE_INDEX_SCHEMA_VERSION` | Object | `packages/fluxiq/src/programs/automation-studio/storage/state-index.ts:5` | - |
| `RecordingActionIndexItem` | Type | `packages/fluxiq/src/programs/automation-studio/storage/state-index.ts:51` | - |
| `recordingActionVisualTargetIndexItem` | Value | `packages/fluxiq/src/programs/automation-studio/storage/state-index.ts:276` | - |
| `RecordingActionVisualTargetIndexItem` | Type | `packages/fluxiq/src/programs/automation-studio/storage/state-index.ts:65` | - |
| `RecordingDomainDefinition` | Type | `packages/fluxiq/src/programs/automation-studio/model/recording-domain.ts:94` | - |
| `RecordingDomainEventDefinition` | Type | `packages/fluxiq/src/programs/automation-studio/model/recording-domain.ts:83` | - |
| `RecordingDomainEventInput` | Type | `packages/fluxiq/src/programs/automation-studio/model/recording-domain.ts:37` | - |
| `RecordingDomainEventProcessingResult` | Type | `packages/fluxiq/src/programs/automation-studio/model/recording-domain.ts:105` | - |
| `RecordingDomainEventReducer` | Type | `packages/fluxiq/src/programs/automation-studio/model/recording-domain.ts:75` | - |
| `RecordingDomainEventReducerContext` | Type | `packages/fluxiq/src/programs/automation-studio/model/recording-domain.ts:67` | - |
| `RecordingDomainEventValidationIssue` | Type | `packages/fluxiq/src/programs/automation-studio/model/recording-domain.ts:50` | - |
| `RecordingDomainEventValidationResult` | Type | `packages/fluxiq/src/programs/automation-studio/model/recording-domain.ts:56` | - |
| `RecordingDomainObservationExtractor` | Type | `packages/fluxiq/src/programs/automation-studio/model/recording-domain.ts:79` | - |
| `RecordingDomainReducerResult` | Type | `packages/fluxiq/src/programs/automation-studio/model/recording-domain.ts:61` | - |
| `RecordingDomainRegistry` | Class | `packages/fluxiq/src/programs/automation-studio/model/recording-domain.ts:116` | - |
| `RecordingDomainStatePathDefinition` | Type | `packages/fluxiq/src/programs/automation-studio/model/recording-domain.ts:22` | - |
| `RecordingEntryIndexItem` | Type | `packages/fluxiq/src/programs/automation-studio/storage/state-index.ts:38` | - |
| `RecordingEntryStateLookupInput` | Type | `packages/fluxiq/src/programs/automation-studio/runtime/service/recording-state-index/contracts.ts:6` | - |
| `RecordingEntryStateLookupResult` | Type | `packages/fluxiq/src/programs/automation-studio/runtime/service/recording-state-index/contracts.ts:15` | - |
| `RecordingEvent` | Type | `packages/fluxiq/src/programs/automation-studio/types.ts:54` | - |
| `RecordingEventJsonSchema` | Type | `packages/fluxiq/src/programs/automation-studio/model/recording-domain.ts:11` | - |
| `RecordingFlowActionCandidate` | Type | `packages/fluxiq/src/programs/automation-studio/runtime/recording-flow-proposal.ts:13` | - |
| `RecordingFlowProposalArtifact` | Type | `packages/fluxiq/src/programs/automation-studio/runtime/recording-flow-proposal.ts:62` | - |
| `RecordingFlowProposalDestination` | Type | `packages/fluxiq/src/programs/automation-studio/runtime/recording-flow-proposal.ts:50` | - |
| `RecordingFlowProposalReview` | Type | `packages/fluxiq/src/programs/automation-studio/runtime/recording-flow-proposal.ts:54` | - |
| `RecordingIdProjectRequest` | Type | `packages/fluxiq/src/programs/automation-studio/api/contracts/recording.ts:115` | - |
| `RecordingIndex` | Type | `packages/fluxiq/src/programs/automation-studio/storage/state-index.ts:9` | - |
| `RecordingIndexSchemaVersion` | Type | `packages/fluxiq/src/programs/automation-studio/storage/state-index.ts:7` | - |
| `recordingIndexStateObjectRefs` | Value | `packages/fluxiq/src/programs/automation-studio/storage/state-index.ts:253` | - |
| `RecordingIndexSummary` | Type | `packages/fluxiq/src/programs/automation-studio/storage/state-index.ts:21` | - |
| `RecordingNote` | Type | `packages/fluxiq/src/programs/automation-studio/model/recordings.ts:7` | - |
| `RecordingProjectRequest` | Type | `packages/fluxiq/src/programs/automation-studio/api/contracts/recording.ts:4` | - |
| `recordingProposalDefinitionId` | Value | `packages/fluxiq/src/programs/automation-studio/runtime/recording-flow-proposal.ts:79` | - |
| `RecordingProposalEvidenceReference` | Type | `packages/fluxiq/src/programs/automation-studio/runtime/recording-flow-proposal.ts:6` | - |
| `RecordingProposalIndexItem` | Type | `packages/fluxiq/src/programs/automation-studio/storage/state-index.ts:95` | - |
| `RecordingSession` | Type | `packages/fluxiq/src/programs/automation-studio/model/recordings.ts:20` | - |
| `recordingSessionDocumentId` | Value | `packages/fluxiq/src/programs/automation-studio/storage/ids.ts:32` | - |
| `RecordingStateCoordinateSpace` | Type | `packages/fluxiq/src/programs/automation-studio/storage/state-index.ts:88` | - |
| `RecordingStateIndexItem` | Type | `packages/fluxiq/src/programs/automation-studio/storage/state-index.ts:75` | - |
| `RecordingStateIndexStore` | Class | `packages/fluxiq/src/programs/automation-studio/storage/recording-index-store.ts:16` | - |
| `RecordingStateIndexValidationIssue` | Type | `packages/fluxiq/src/programs/automation-studio/storage/state-index.ts:116` | - |
| `RecordingSummaryItem` | Type | `packages/fluxiq/src/programs/automation-studio/runtime/service/recording-projections/contracts.ts:4` | - |
| `RecordingSummaryList` | Type | `packages/fluxiq/src/programs/automation-studio/runtime/service/recording-projections/contracts.ts:16` | - |
| `RecordingTimelineIndex` | Type | `packages/fluxiq/src/programs/automation-studio/storage/state-index.ts:32` | - |
| `recordProgramEndpointPerformance` | Value | `packages/fluxiq/src/programs/_shared/performance-metrics.ts:96` | - |
| `recordSqlPerformance` | Value | `packages/fluxiq/src/programs/_shared/performance-metrics.ts:61` | - |
| `RecoveryPolicy` | Type | `packages/fluxiq/src/programs/automation-studio/model/policies.ts:28` | - |
| `redeemAutomationStudioResultCheckAuthorization` | Value | `packages/fluxiq/src/programs/automation-studio/runtime/result-check-authorization/redeem.ts:17` | - |
| `redeemAutomationStudioUnattendedRepairAuthorization` | Value | `packages/fluxiq/src/programs/automation-studio/runtime/result-check-authorization/repair.ts:75` | - |
| `reduceAutomationStudioExploration` | Value | `packages/fluxiq/src/programs/automation-studio/runtime/exploration-reduction/backward-slice.ts:80` | - |
| `reduceAutomationStudioFlowBootstrapDraft` | Value | `packages/fluxiq/src/programs/automation-studio/runtime/flow-bootstrap/draft-reduction.ts:61` | - |
| `registerAutomationStudioApi` | Value | `packages/fluxiq/src/programs/automation-studio/api/handlers/register.ts:31` | - |
| `registerBackgroundTasksApi` | Value | `packages/fluxiq/src/programs/background-tasks/api/handlers.ts:12` | - |
| `registerBasicComponents` | Value | `packages/fluxiq/src/components/index.ts:56` | - |
| `registerComputeControlApi` | Value | `packages/fluxiq/src/programs/compute-control/api/handlers.ts:14` | - |
| `RegisterComputeNodeRequest` | Type | `packages/fluxiq/src/programs/compute-control/api/contracts.ts:15` | - |
| `registerDatabaseManagerApi` | Value | `packages/fluxiq/src/programs/database-manager/api/handlers.ts:18` | - |
| `registerDeploymentSyncApi` | Value | `packages/fluxiq/src/programs/deployment-sync/api/handlers.ts:10` | - |
| `registerDocsApi` | Value | `packages/fluxiq/src/programs/docs/api/handlers.ts:5` | - |
| `RegisterDocsSourceRequest` | Type | `packages/fluxiq/src/programs/docs/api/contracts.ts:18` | - |
| `registerGlobalDocumentationGenerators` | Value | `packages/fluxiq/src/programs/_shared/docs-generators.ts:19` | - |
| `registerHostDocumentationGenerators` | Value | `packages/fluxiq/src/programs/_shared/docs-generators.ts:206` | - |
| `registerIdentityAccessApi` | Value | `packages/fluxiq/src/programs/identity-access/api/handlers.ts:58` | - |
| `registerProductionRunnerApi` | Value | `packages/fluxiq/src/programs/production-runner/api/handlers.ts:11` | - |
| `RegisterProductionTargetRequest` | Type | `packages/fluxiq/src/programs/production-runner/api/contracts.ts:24` | - |
| `registerRuntimeApi` | Value | `packages/fluxiq/src/programs/runtime-control/api/handlers.ts:5` | - |
| `registerSecretKeysApi` | Value | `packages/fluxiq/src/programs/secret-keys/api/handlers.ts:17` | - |
| `releaseAutomationStudioSessionDeepSeekKey` | Value | `packages/fluxiq/src/programs/automation-studio/runtime/llm/deepseek/session-key.ts:33` | - |
| `ReleaseComputeLeaseRequest` | Type | `packages/fluxiq/src/programs/compute-control/api/contracts.ts:47` | - |
| `RemoveRecordingEntryRequest` | Type | `packages/fluxiq/src/programs/automation-studio/api/contracts/recording.ts:80` | Removes every entry of a still-open recording that was recorded from one gateway event: each entry whose `metadata.eventId` is `eventId`, the id `runtime/io-bridge.ts` copies from the recorded event's envelope. A finalized recording is refused. |
| `RemoveRecordingEntryResponse` | Type | `packages/fluxiq/src/programs/automation-studio/api/contracts/recording.ts:87` | How many entries were removed, and the recording as a summary: no timeline, notes or state. |
| `RenameFlowSubflowRequest` | Type | `packages/fluxiq/src/programs/automation-studio/api/contracts/subflow.ts:35` | - |
| `repairAutomationStudioRefutedRunResult` | Value | `packages/fluxiq/src/programs/automation-studio/runtime/recovery/refuted-result/repair.ts:126` | - |
| `RepairRecordingStateIndexRequest` | Type | `packages/fluxiq/src/programs/automation-studio/api/contracts/recording.ts:48` | - |
| `RepairRecordingStateIndexResult` | Type | `packages/fluxiq/src/programs/automation-studio/runtime/service/recording-state-index/contracts.ts:32` | - |
| `replanAutomationStudioRecoveryAfterExploration` | Value | `packages/fluxiq/src/programs/automation-studio/runtime/recovery/annotation/replan.ts:103` | - |
| `replayAutomationStudioFlowDraft` | Value | `packages/fluxiq/src/programs/automation-studio/runtime/llm/node-tools/replay-draft.ts:98` | - |
| `ReplayPolicyAgainstRecordingRequest` | Type | `packages/fluxiq/src/programs/automation-studio/api/contracts/policy.ts:36` | - |
| `ReplayResultArtifact` | Type | `packages/fluxiq/src/programs/automation-studio/runtime/service/recordings/types.ts:20` | - |
| `Repository` | Type | `packages/fluxiq/src/programs/database-manager/types.ts:31` | - |
| `RepositoryListPage` | Type | `packages/fluxiq/src/programs/database-manager/types.ts:24` | - |
| `RepositoryListPageOptions` | Type | `packages/fluxiq/src/programs/database-manager/types.ts:16` | - |
| `RepositoryScope` | Type | `packages/fluxiq/src/programs/database-manager/types.ts:3` | - |
| `resolveActionVisualTarget` | Value | `packages/fluxiq/src/programs/automation-studio/model/action-visual-target.ts:27` | - |
| `ResolveActionVisualTargetInput` | Type | `packages/fluxiq/src/programs/automation-studio/model/action-visual-target.ts:21` | - |
| `resolveAutomationNodeParameterValues` | Value | `packages/fluxiq/src/programs/automation-studio/nodes/parameter-bindings.ts:41` | - |
| `resolveAutomationStudioDeepSeekModel` | Value | `packages/fluxiq/src/programs/automation-studio/runtime/llm/deepseek/models.ts:82` | - |
| `resolveAutomationStudioExplorationBudget` | Value | `packages/fluxiq/src/programs/automation-studio/runtime/recovery/exploration-budget.ts:146` | - |
| `resolveAutomationStudioFlowBootstrapPlanParameters` | Value | `packages/fluxiq/src/programs/automation-studio/runtime/llm/harness-options/plan-parameter-resolution.ts:69` | - |
| `resolveAutomationStudioFlowCatalog` | Value | `packages/fluxiq/src/programs/automation-studio/model/flow-compatibility.ts:31` | - |
| `ResolveAutomationStudioFlowCatalogInput` | Type | `packages/fluxiq/src/programs/automation-studio/model/flow-compatibility.ts:17` | - |
| `resolveAutomationStudioLlmInstructions` | Value | `packages/fluxiq/src/programs/automation-studio/runtime/llm/harness/instruction.ts:55` | - |
| `resolveAutomationStudioLlmRunCostCeilingUsd` | Value | `packages/fluxiq/src/programs/automation-studio/model/run-cost-ceiling/run-cost-ceiling-env.ts:55` | - |
| `resolveAutomationStudioLlmTokenLimits` | Value | `packages/fluxiq/src/programs/automation-studio/runtime/llm/harness/token-limits.ts:65` | - |
| `resolveAutomationStudioRecoveryRunBudget` | Value | `packages/fluxiq/src/programs/automation-studio/runtime/recovery/annotation/run-budget.ts:99` | - |
| `resolveAutomationStudioResultCheckSchedule` | Value | `packages/fluxiq/src/programs/automation-studio/runtime/result-check-schedule/resolve.ts:21` | - |
| `resolveAutomationStudioV2Feature` | Value | `packages/fluxiq/src/programs/automation-studio/storage/project/migration-cutover.ts:463` | - |
| `ResolvedActionVisualTarget` | Type | `packages/fluxiq/src/programs/automation-studio/model/action-visual-target.ts:7` | - |
| `respondToAutomationStudioConversationTurn` | Value | `packages/fluxiq/src/programs/automation-studio/runtime/conversations/instructions/respond.ts:52` | - |
| `RestoreGraphSnapshotRequest` | Type | `packages/fluxiq/src/programs/automation-studio/api/contracts/graph.ts:30` | - |
| `ResultState` | Type | `packages/fluxiq/src/core/index.ts:1` | - |
| `resumeAutomationStudioGraph` | Value | `packages/fluxiq/src/programs/automation-studio/runtime/executor/resume.ts:39` | - |
| `resumeAutomationStudioGraphRun` | Value | `packages/fluxiq/src/programs/automation-studio/runtime/executor/graph-run.ts:103` | - |
| `RetryPolicy` | Type | `packages/fluxiq/src/programs/automation-studio/model/policies.ts:23` | How many times one step may be attempted, and how long the run waits between those attempts. `backoffMs` had no consumer anywhere in the runtime: a policy could declare a wait and nothing ever waited it. Both fields are now read by `automationStudioNodeRetryPolicy` (`runtime/executor/retry-policy.ts`), which accepts this exact shape from a node's `parameterValues.retry`, a node's `metadata.retry`, or a Flow's `metadata.retry`. `maxAttempts` counts the first attempt, so 3 means one attempt and two retries, and `backoffMs` is the wait before each retry. |
| `revealAutomationStudioResultCheckSecret` | Value | `packages/fluxiq/src/programs/automation-studio/runtime/result-check-authorization/reveal.ts:35` | - |
| `RevealSecretKeyRequest` | Type | `packages/fluxiq/src/programs/secret-keys/api/contracts.ts:49` | - |
| `RevealSecretKeyResponse` | Type | `packages/fluxiq/src/programs/secret-keys/api/contracts.ts:59` | - |
| `reviewAutomationStudioExplorationReduction` | Value | `packages/fluxiq/src/programs/automation-studio/runtime/recovery/exploration-state/reduction-review.ts:80` | - |
| `reviewerApprovalForAdaptation` | Value | `packages/fluxiq/src/programs/automation-studio/runtime/recovery/adaptation-promotion.ts:59` | - |
| `ReviewFlowAdaptationInput` | Type | `packages/fluxiq/src/programs/automation-studio/runtime/service/adaptation-projections/contracts.ts:13` | - |
| `ReviewFlowAdaptationRequest` | Type | `packages/fluxiq/src/programs/automation-studio/api/contracts/adaptation.ts:189` | - |
| `RevokeClientTrustRequest` | Type | `packages/fluxiq/src/programs/automation-studio/api/contracts/client.ts:4` | - |
| `RevokeSessionRequest` | Type | `packages/fluxiq/src/programs/identity-access/api/contracts.ts:72` | - |
| `Role` | Type | `packages/fluxiq/src/programs/identity-access/types.ts:14` | - |
| `rollbackFluxIQStorageMigration` | Value | `packages/fluxiq/src/framework/storage-migration.ts:27` | - |
| `RotateSecretKeyRequest` | Type | `packages/fluxiq/src/programs/secret-keys/api/contracts.ts:44` | - |
| `runAutomationStudioCompiledPlan` | Value | `packages/fluxiq/src/programs/automation-studio/runtime/compiled-plan.ts:155` | - |
| `runAutomationStudioFlowBootstrapBuildPhases` | Value | `packages/fluxiq/src/programs/automation-studio/runtime/flow-bootstrap/unfinished-build/phases.ts:177` | - |
| `runAutomationStudioGraph` | Value | `packages/fluxiq/src/programs/automation-studio/runtime/executor/graph-run.ts:68` | - |
| `runAutomationStudioLegacyImporterBatch` | Value | `packages/fluxiq/src/programs/automation-studio/storage/project/migration-cutover.ts:375` | - |
| `runAutomationStudioLegacyMigrationOrchestration` | Value | `packages/fluxiq/src/programs/automation-studio/storage/project/migration-cutover.ts:407` | - |
| `runAutomationStudioLlmEvidenceLoop` | Value | `packages/fluxiq/src/programs/automation-studio/runtime/llm/evidence-loop.ts:175` | - |
| `runAutomationStudioLlmHarness` | Value | `packages/fluxiq/src/programs/automation-studio/runtime/llm/harness/run.ts:27` | - |
| `runAutomationStudioRecoveryExploration` | Value | `packages/fluxiq/src/programs/automation-studio/runtime/recovery/annotation/exploration.ts:194` | - |
| `runAutomationStudioRecoveryLadder` | Value | `packages/fluxiq/src/programs/automation-studio/runtime/executor/ladder-run.ts:61` | - |
| `runAutomationStudioRouter` | Value | `packages/fluxiq/src/programs/automation-studio/runtime/router-runtime.ts:139` | - |
| `runAutomationStudioRuntimeExploration` | Value | `packages/fluxiq/src/programs/automation-studio/runtime/recovery/runtime-exploration.ts:252` | - |
| `RunBackgroundTaskRequest` | Type | `packages/fluxiq/src/programs/background-tasks/api/contracts.ts:13` | - |
| `RunBackgroundTaskResponse` | Type | `packages/fluxiq/src/programs/background-tasks/api/contracts.ts:25` | - |
| `runCanonicalAutomationStudioFlow` | Value | `packages/fluxiq/src/programs/automation-studio/runtime/composite-executor.ts:17` | - |
| `runConfirmedAutomationStudioConversationCommand` | Value | `packages/fluxiq/src/programs/automation-studio/runtime/conversations/commands/confirmed.ts:36` | - |
| `runCurrentNode` | Value | `packages/fluxiq/src/engine/index.ts:42` | - |
| `RunDatasetDeleteRequest` | Type | `packages/fluxiq/src/programs/automation-studio/api/contracts/dataset.ts:32` | Without `datasetId`, every dataset the run stored is deleted (CD17). |
| `RunDatasetExportRequest` | Type | `packages/fluxiq/src/programs/automation-studio/api/contracts/dataset.ts:25` | One dataset as a single CSV or JSON body, or a `tooLarge` answer pointing at the streaming route. |
| `RunDatasetListRequest` | Type | `packages/fluxiq/src/programs/automation-studio/api/contracts/dataset.ts:12` | Every dataset one run stored. |
| `RunDatasetPageRequest` | Type | `packages/fluxiq/src/programs/automation-studio/api/contracts/dataset.ts:17` | One page of one dataset's rows, 1-200 rows and 50 by default. |
| `runDatasetSummariesForRun` | Value | `packages/fluxiq/src/programs/automation-studio/storage/project/run-dataset-store.ts:389` | - |
| `runFlow` | Value | `packages/fluxiq/src/engine/index.ts:165` | - |
| `runInAutomationStudioConversation` | Value | `packages/fluxiq/src/programs/automation-studio/runtime/conversations/context/run.ts:8` | - |
| `RUNTIME_ENDPOINTS` | Object | `packages/fluxiq/src/programs/runtime-control/api/contracts.ts:1` | - |
| `RUNTIME_PROGRAM` | Object | `packages/fluxiq/src/programs/runtime-control/metadata.ts:3` | - |
| `RuntimeActionAttempt` | Type | `packages/fluxiq/src/programs/automation-studio/model/runtime.ts:6` | - |
| `runtimeClientFromGatewaySession` | Value | `packages/fluxiq/src/runtime/client-gateway-transport.ts:131` | - |
| `RuntimeInputs` | Type | `packages/fluxiq/src/io/index.ts:54` | - |
| `RuntimeMode` | Type | `packages/fluxiq/src/engine/index.ts:11` | - |
| `RuntimeOutputs` | Type | `packages/fluxiq/src/io/index.ts:59` | - |
| `RuntimeService` | Class | `packages/fluxiq/src/runtime/service.ts:26` | - |
| `RuntimeServiceOptions` | Type | `packages/fluxiq/src/runtime/service.ts:20` | - |
| `RuntimeSession` | Type | `packages/fluxiq/src/engine/index.ts:13` | - |
| `RuntimeSessionControlRequest` | Type | `packages/fluxiq/src/programs/automation-studio/api/contracts/run.ts:22` | - |
| `RuntimeSessionOptions` | Type | `packages/fluxiq/src/engine/index.ts:22` | - |
| `RuntimeStore` | Type | `packages/fluxiq/src/runtime/storage.ts:11` | - |
| `RuntimeStoreSnapshot` | Type | `packages/fluxiq/src/runtime/storage.ts:6` | - |
| `runWithAutomationStudioActivity` | Value | `packages/fluxiq/src/programs/automation-studio/runtime/activity/scope.ts:9` | - |
| `sanitizeAutomationStudioLlmFailureEvidence` | Value | `packages/fluxiq/src/programs/automation-studio/runtime/llm/harness/failure-evidence.ts:47` | - |
| `sanitizedBootstrapAccounting` | Value | `packages/fluxiq/src/programs/automation-studio/runtime/flow-bootstrap/review-projection.ts:18` | - |
| `SaveBackgroundTaskScheduleRequest` | Type | `packages/fluxiq/src/programs/background-tasks/api/contracts.ts:32` | - |
| `SaveFlowGenerationInstructionRequest` | Type | `packages/fluxiq/src/programs/automation-studio/api/contracts/instruction.ts:30` | - |
| `SaveFlowInstructionRequest` | Type | `packages/fluxiq/src/programs/automation-studio/api/contracts/instruction.ts:12` | - |
| `SaveFlowMapFallbackRequest` | Type | `packages/fluxiq/src/programs/automation-studio/api/contracts/flow-map.ts:33` | - |
| `SaveFlowMapRouteGroupRequest` | Type | `packages/fluxiq/src/programs/automation-studio/api/contracts/flow-map.ts:3` | - |
| `SaveFlowMapRouteRequest` | Type | `packages/fluxiq/src/programs/automation-studio/api/contracts/flow-map.ts:16` | - |
| `SaveFlowRequest` | Type | `packages/fluxiq/src/programs/automation-studio/api/contracts/flow.ts:20` | - |
| `sayAutomationStudioResultCheck` | Value | `packages/fluxiq/src/programs/automation-studio/runtime/result-check-schedule/conversation.ts:93` | - |
| `scaleProfile` | Value | `packages/fluxiq/src/programs/automation-studio/testing/scale-fixtures.ts:205` | - |
| `scoreElementFingerprintCandidate` | Value | `packages/fluxiq/src/programs/automation-studio/fingerprinting/element-fingerprint.ts:135` | - |
| `scoreElementFingerprintCandidates` | Value | `packages/fluxiq/src/programs/automation-studio/fingerprinting/element-fingerprint.ts:123` | - |
| `screenAutomationStudioLlmEvidence` | Value | `packages/fluxiq/src/programs/automation-studio/runtime/llm/harness/evidence-screen.ts:51` | - |
| `SECRET_KEYS_ENDPOINTS` | Object | `packages/fluxiq/src/programs/secret-keys/api/contracts.ts:4` | - |
| `SECRET_KEYS_PROGRAM` | Object | `packages/fluxiq/src/programs/secret-keys/metadata.ts:3` | - |
| `SecretKeyAuthorizationPayload` | Type | `packages/fluxiq/src/programs/secret-keys/api/contracts.ts:13` | - |
| `SecretKeyCredentialChange` | Type | `packages/fluxiq/src/programs/secret-keys/runtime/credential-changes.ts:9` | A prepared or committed credential change; `resealedKeyCount` counts the keys re-sealed under the next password. |
| `SecretKeyCredentialChangeInput` | Type | `packages/fluxiq/src/programs/secret-keys/runtime/credential-changes.ts:14` | - |
| `SecretKeyKind` | Type | `packages/fluxiq/src/programs/secret-keys/types.ts:4` | - |
| `SecretKeyMutationResponse` | Type | `packages/fluxiq/src/programs/secret-keys/api/contracts.ts:58` | - |
| `SecretKeyRecord` | Type | `packages/fluxiq/src/programs/secret-keys/types.ts:25` | - |
| `SecretKeyScope` | Type | `packages/fluxiq/src/programs/secret-keys/types.ts:6` | - |
| `SecretKeysService` | Class | `packages/fluxiq/src/programs/secret-keys/runtime/service.ts:75` | Secret Keys: values sealed under account passwords. This class is the public surface; records and their writes live in `SecretKeyStore`, held derived keys in `HeldKeys`, seal upgrades in `SealUpgrades`, and credential changes, including pending seals, in `CredentialChanges`. |
| `SecretKeysSnapshot` | Type | `packages/fluxiq/src/programs/secret-keys/types.ts:74` | - |
| `SecretKeysSnapshotResponse` | Type | `packages/fluxiq/src/programs/secret-keys/api/contracts.ts:57` | - |
| `SecretKeySummary` | Type | `packages/fluxiq/src/programs/secret-keys/types.ts:8` | - |
| `SecretRevealAuthorizationMetadata` | Type | `packages/fluxiq/src/programs/secret-keys/runtime/held-keys.ts:1` | - |
| `selectActionContextStateCheckpointIds` | Value | `packages/fluxiq/src/programs/automation-studio/normalization/default-normalizer.ts:100` | - |
| `selectActionContextStateEntryIds` | Value | `packages/fluxiq/src/programs/automation-studio/normalization/default-normalizer.ts:105` | - |
| `serializedByteCount` | Value | `packages/fluxiq/src/programs/automation-studio/runtime/recovery/context.ts:265` | - |
| `serializedMetricBytes` | Value | `packages/fluxiq/src/programs/_shared/performance-metrics.ts:114` | - |
| `Session` | Type | `packages/fluxiq/src/programs/identity-access/types.ts:41` | - |
| `SessionRequest` | Type | `packages/fluxiq/src/programs/identity-access/api/contracts.ts:63` | - |
| `SetBackgroundTaskEnabledRequest` | Type | `packages/fluxiq/src/programs/background-tasks/api/contracts.ts:27` | - |
| `SetIdentitySecretRequest` | Type | `packages/fluxiq/src/programs/identity-access/api/contracts.ts:45` | - |
| `SignalContribution` | Type | `packages/fluxiq/src/programs/automation-studio/fingerprinting/contracts.ts:4` | - |
| `SignalDefinition` | Type | `packages/fluxiq/src/programs/automation-studio/model/signals.ts:19` | - |
| `signalDefinitionFromSchema` | Value | `packages/fluxiq/src/programs/automation-studio/model/signal-registry.ts:41` | - |
| `SignalMiner` | Type | `packages/fluxiq/src/programs/automation-studio/mining/contracts.ts:211` | - |
| `SignalMiningResult` | Type | `packages/fluxiq/src/programs/automation-studio/mining/contracts.ts:191` | - |
| `SignalProvenance` | Type | `packages/fluxiq/src/programs/automation-studio/model/signals.ts:5` | - |
| `SignalRegistry` | Type | `packages/fluxiq/src/programs/automation-studio/model/signals.ts:35` | - |
| `SignalRegistryBuildOptions` | Type | `packages/fluxiq/src/programs/automation-studio/model/signal-registry.ts:4` | - |
| `signalRegistryDocumentId` | Value | `packages/fluxiq/src/programs/automation-studio/storage/ids.ts:52` | - |
| `signalValueFromSnapshot` | Value | `packages/fluxiq/src/programs/automation-studio/model/signal-registry.ts:82` | - |
| `slugify` | Value | `packages/fluxiq/src/core/index.ts:27` | - |
| `sortRecordingIndex` | Value | `packages/fluxiq/src/programs/automation-studio/storage/state-index.ts:266` | - |
| `SourceDescriptor` | Type | `packages/fluxiq/src/programs/automation-studio/model/descriptors.ts:12` | - |
| `SQLiteListPage` | Type | `packages/fluxiq/src/programs/database-manager/storage/sqlite-repository.ts:21` | - |
| `SQLiteListPageOptions` | Type | `packages/fluxiq/src/programs/database-manager/storage/sqlite-repository.ts:20` | - |
| `SQLiteRepository` | Class | `packages/fluxiq/src/programs/database-manager/storage/sqlite-repository.ts:23` | - |
| `SQLiteRepositoryOptions` | Type | `packages/fluxiq/src/programs/database-manager/storage/sqlite-repository.ts:8` | - |
| `SQLiteTransaction` | Type | `packages/fluxiq/src/programs/database-manager/storage/sqlite-repository.ts:14` | - |
| `SqlPerformanceContext` | Type | `packages/fluxiq/src/programs/_shared/performance-metrics.ts:35` | - |
| `SqlPerformanceMetric` | Type | `packages/fluxiq/src/programs/_shared/performance-metrics.ts:4` | - |
| `startAutomationStudioConversationCommand` | Value | `packages/fluxiq/src/programs/automation-studio/runtime/conversations/commands/start.ts:17` | - |
| `startAutomationStudioRecoveryDeadline` | Value | `packages/fluxiq/src/programs/automation-studio/runtime/recovery/recovery-deadline.ts:57` | - |
| `StartClientRecordingInput` | Type | `packages/fluxiq/src/programs/automation-studio/client-gateway/bridge.ts:36` | - |
| `StartClientRecordingRequest` | Type | `packages/fluxiq/src/programs/automation-studio/api/contracts/client.ts:9` | - |
| `StartProductionRunRequest` | Type | `packages/fluxiq/src/programs/production-runner/api/contracts.ts:13` | - |
| `StateActionCorrelation` | Type | `packages/fluxiq/src/programs/automation-studio/mining/contracts.ts:118` | - |
| `StateActionCorrelationRelation` | Type | `packages/fluxiq/src/programs/automation-studio/mining/contracts.ts:108` | - |
| `StateBounds` | Type | `packages/fluxiq/src/programs/automation-studio/model/state.ts:60` | - |
| `StateBoundsKind` | Type | `packages/fluxiq/src/programs/automation-studio/model/state.ts:67` | - |
| `StateChangeEvent` | Type | `packages/fluxiq/src/programs/automation-studio/model/state-store.ts:5` | - |
| `StateCheckpointEntry` | Type | `packages/fluxiq/src/programs/automation-studio/model/timeline.ts:39` | - |
| `StateCoordinateSpace` | Type | `packages/fluxiq/src/programs/automation-studio/model/state.ts:51` | - |
| `StateDelta` | Type | `packages/fluxiq/src/programs/automation-studio/model/state.ts:222` | - |
| `StateDeltaEntry` | Type | `packages/fluxiq/src/programs/automation-studio/model/timeline.ts:34` | - |
| `StateDiffOptions` | Type | `packages/fluxiq/src/programs/automation-studio/model/state-diff.ts:3` | - |
| `StateElementDescriptor` | Type | `packages/fluxiq/src/programs/automation-studio/model/state.ts:37` | - |
| `StateElementKind` | Type | `packages/fluxiq/src/programs/automation-studio/model/state.ts:19` | - |
| `StateFact` | Type | `packages/fluxiq/src/programs/automation-studio/model/evidence.ts:37` | - |
| `StateFactReference` | Type | `packages/fluxiq/src/programs/automation-studio/model/evidence.ts:29` | - |
| `StateNamespace` | Type | `packages/fluxiq/src/programs/automation-studio/model/state.ts:169` | - |
| `StateNamespaceId` | Type | `packages/fluxiq/src/programs/automation-studio/model/state.ts:184` | - |
| `StatePath` | Type | `packages/fluxiq/src/programs/automation-studio/model/state.ts:193` | - |
| `StatePathPermissions` | Type | `packages/fluxiq/src/programs/automation-studio/model/state.ts:198` | - |
| `StatePathSchema` | Type | `packages/fluxiq/src/programs/automation-studio/model/state.ts:204` | - |
| `StatePresentationMetadata` | Type | `packages/fluxiq/src/programs/automation-studio/model/state.ts:79` | - |
| `StateRenderKind` | Type | `packages/fluxiq/src/programs/automation-studio/model/state.ts:68` | - |
| `StateSnapshot` | Type | `packages/fluxiq/src/programs/automation-studio/model/state.ts:176` | - |
| `StateSnapshotPresentation` | Type | `packages/fluxiq/src/programs/automation-studio/model/state.ts:148` | - |
| `StateUnsubscribe` | Type | `packages/fluxiq/src/programs/automation-studio/model/state-store.ts:12` | - |
| `stateValue` | Value | `packages/fluxiq/src/programs/automation-studio/model/state-store.ts:99` | - |
| `StateValue` | Type | `packages/fluxiq/src/programs/automation-studio/model/state.ts:154` | - |
| `StateValueType` | Type | `packages/fluxiq/src/programs/automation-studio/model/state.ts:4` | - |
| `StateVisualFrame` | Type | `packages/fluxiq/src/programs/automation-studio/model/state.ts:138` | - |
| `StateVisualLayer` | Type | `packages/fluxiq/src/programs/automation-studio/model/state.ts:91` | - |
| `StateVolatility` | Type | `packages/fluxiq/src/programs/automation-studio/model/state.ts:17` | - |
| `stepFlow` | Value | `packages/fluxiq/src/engine/index.ts:108` | - |
| `StopClientRecordingRequest` | Type | `packages/fluxiq/src/programs/automation-studio/api/contracts/client.ts:17` | - |
| `StopProductionRunRequest` | Type | `packages/fluxiq/src/programs/production-runner/api/contracts.ts:26` | - |
| `subscribeFluxIQPerformanceMetrics` | Value | `packages/fluxiq/src/programs/_shared/performance-metrics.ts:109` | - |
| `summarizeAutomationStudioRunResult` | Value | `packages/fluxiq/src/programs/automation-studio/runtime/result-verification/result-summary.ts:82` | - |
| `summarizeAutomationStudioRuntimeRecoveryContext` | Value | `packages/fluxiq/src/programs/automation-studio/runtime/recovery/context-summary.ts:41` | - |
| `summarizeAutomationStudioRuntimeStructuredDiagnosis` | Value | `packages/fluxiq/src/programs/automation-studio/runtime/recovery/structured-diagnosis.ts:187` | - |
| `summarizeAutomationStudioUncertainty` | Value | `packages/fluxiq/src/programs/automation-studio/runtime/training-modes.ts:246` | - |
| `summarizeStateDeltas` | Value | `packages/fluxiq/src/programs/automation-studio/model/state-diff.ts:47` | - |
| `SurfaceTone` | Type | `packages/fluxiq/src/ui/index.ts:2` | - |
| `systemClock` | Object | `packages/fluxiq/src/core/index.ts:16` | - |
| `TaskModelLearner` | Type | `packages/fluxiq/src/programs/automation-studio/learning/contracts.ts:58` | - |
| `TestFlowMapRouteConditionRequest` | Type | `packages/fluxiq/src/programs/automation-studio/api/contracts/flow-map.ts:39` | - |
| `TimelineBase` | Type | `packages/fluxiq/src/programs/automation-studio/model/timeline.ts:5` | - |
| `TimelineEntry` | Type | `packages/fluxiq/src/programs/automation-studio/model/timeline.ts:67` | - |
| `TimelineNormalizer` | Type | `packages/fluxiq/src/programs/automation-studio/normalization/contracts.ts:49` | - |
| `TimeoutPolicy` | Type | `packages/fluxiq/src/programs/automation-studio/model/policies.ts:6` | - |
| `TotpConfirmRequest` | Type | `packages/fluxiq/src/programs/identity-access/api/contracts.ts:54` | - |
| `TotpRequiredError` | Class | `packages/fluxiq/src/programs/identity-access/runtime/service.ts:44` | - |
| `trialAutomationStudioFlowChange` | Value | `packages/fluxiq/src/programs/automation-studio/runtime/flow-change/trial.ts:72` | - |
| `UpdateFlowSubflowInput` | Type | `packages/fluxiq/src/programs/automation-studio/runtime/service.ts:314` | - |
| `UpdateFlowSubflowRequest` | Type | `packages/fluxiq/src/programs/automation-studio/api/contracts/subflow.ts:20` | - |
| `UpdateIdentityUserRequest` | Type | `packages/fluxiq/src/programs/identity-access/api/contracts.ts:33` | - |
| `UpdateRecordingRequest` | Type | `packages/fluxiq/src/programs/automation-studio/api/contracts/recording.ts:18` | - |
| `UpdateSecretKeyRequest` | Type | `packages/fluxiq/src/programs/secret-keys/api/contracts.ts:32` | - |
| `upgradeAutomationStudioBootstrapAdaptation` | Value | `packages/fluxiq/src/programs/automation-studio/runtime/flow-bootstrap/adaptation.ts:323` | - |
| `UpsertDeploymentArtifactRequest` | Type | `packages/fluxiq/src/programs/deployment-sync/api/contracts.ts:18` | - |
| `UpsertDeploymentTargetRequest` | Type | `packages/fluxiq/src/programs/deployment-sync/api/contracts.ts:17` | - |
| `UpsertFlowMapRouteGroupInput` | Type | `packages/fluxiq/src/programs/automation-studio/runtime/service/flow-map-routes/contracts.ts:44` | - |
| `UpsertFlowMapRouteInput` | Type | `packages/fluxiq/src/programs/automation-studio/runtime/service/flow-map-routes/contracts.ts:55` | - |
| `User` | Type | `packages/fluxiq/src/programs/identity-access/types.ts:19` | - |
| `UserCredential` | Type | `packages/fluxiq/src/programs/identity-access/types.ts:32` | - |
| `validateActionVisualEntityTarget` | Value | `packages/fluxiq/src/programs/automation-studio/model/validation/visual-target.ts:5` | - |
| `validateAutomationStudioAdaptationPolicy` | Value | `packages/fluxiq/src/programs/automation-studio/model/validation/adaptation.ts:315` | - |
| `validateAutomationStudioElementTarget` | Value | `packages/fluxiq/src/programs/automation-studio/model/action-element-target.ts:89` | - |
| `validateAutomationStudioFlow` | Value | `packages/fluxiq/src/programs/automation-studio/model/validation/flow.ts:10` | - |
| `validateAutomationStudioFlowAdaptation` | Value | `packages/fluxiq/src/programs/automation-studio/model/validation/adaptation.ts:131` | - |
| `validateAutomationStudioFlowBootstrapPlan` | Value | `packages/fluxiq/src/programs/automation-studio/runtime/flow-bootstrap/plan/validation.ts:53` | - |
| `validateAutomationStudioFlowChangeProposal` | Value | `packages/fluxiq/src/programs/automation-studio/model/validation/adaptation.ts:110` | - |
| `validateAutomationStudioFlowInstruction` | Value | `packages/fluxiq/src/programs/automation-studio/model/validation/adaptation.ts:95` | - |
| `validateAutomationStudioFlowRegions` | Value | `packages/fluxiq/src/programs/automation-studio/model/regions.ts:27` | - |
| `validateAutomationStudioFlowRouter` | Value | `packages/fluxiq/src/programs/automation-studio/model/validation/adaptation.ts:20` | - |
| `validateAutomationStudioFlowSubflow` | Value | `packages/fluxiq/src/programs/automation-studio/model/validation/adaptation.ts:53` | - |
| `validateAutomationStudioImporterNodeManifest` | Value | `packages/fluxiq/src/programs/automation-studio/nodes/definitions.ts:173` | - |
| `validateAutomationStudioImporterSdkManifest` | Value | `packages/fluxiq/src/programs/automation-studio/nodes/importer-sdk.ts:134` | - |
| `validateAutomationStudioLlmOutput` | Value | `packages/fluxiq/src/programs/automation-studio/runtime/llm/harness/output-validation.ts:7` | - |
| `validateAutomationStudioNodeDefinition` | Value | `packages/fluxiq/src/programs/automation-studio/nodes/definitions.ts:148` | - |
| `validateAutomationStudioRecords` | Value | `packages/contracts/src/record-sets/validate-records.ts:37` | - |
| `validateDomainIo` | Value | `packages/fluxiq/src/io/index.ts:337` | - |
| `validateEvidenceAnchor` | Value | `packages/fluxiq/src/programs/automation-studio/model/validation/state.ts:54` | - |
| `validateFlow` | Value | `packages/fluxiq/src/flows/index.ts:68` | - |
| `validateFlowComposition` | Value | `packages/fluxiq/src/programs/automation-studio/model/composites.ts:101` | - |
| `validateIoRequirements` | Value | `packages/fluxiq/src/io/index.ts:388` | - |
| `validateNodeEvidenceBinding` | Value | `packages/fluxiq/src/programs/automation-studio/model/validation/evidence.ts:26` | - |
| `validateNodeStateRuntimeComparison` | Value | `packages/fluxiq/src/programs/automation-studio/model/validation/node-state.ts:33` | - |
| `validateNodeStateSource` | Value | `packages/fluxiq/src/programs/automation-studio/model/validation/node-state.ts:4` | - |
| `validateNodeStateViewSelection` | Value | `packages/fluxiq/src/programs/automation-studio/model/validation/node-state.ts:27` | - |
| `validatePolicyGraph` | Value | `packages/fluxiq/src/programs/automation-studio/model/validation/policy-graph.ts:5` | - |
| `ValidateRecordingDomainEventRequest` | Type | `packages/fluxiq/src/programs/automation-studio/api/contracts/recording.ts:96` | - |
| `validateRecordingIndex` | Value | `packages/fluxiq/src/programs/automation-studio/storage/state-index.ts:184` | - |
| `validateRecordingSession` | Value | `packages/fluxiq/src/programs/automation-studio/model/validation/recording.ts:5` | - |
| `validateSignalRegistry` | Value | `packages/fluxiq/src/programs/automation-studio/model/validation/signal-registry.ts:4` | - |
| `validateStateFact` | Value | `packages/fluxiq/src/programs/automation-studio/model/validation/evidence.ts:17` | - |
| `validateStateFactReference` | Value | `packages/fluxiq/src/programs/automation-studio/model/validation/evidence.ts:5` | - |
| `validateStateSnapshot` | Value | `packages/fluxiq/src/programs/automation-studio/model/validation/state.ts:4` | - |
| `validateStateVisualFrame` | Value | `packages/fluxiq/src/programs/automation-studio/model/validation/state.ts:36` | - |
| `VaultRecord` | Type | `packages/fluxiq/src/programs/identity-access/types.ts:62` | - |
| `VaultStatus` | Type | `packages/fluxiq/src/programs/identity-access/types.ts:47` | - |
| `VaultUnlockRequest` | Type | `packages/fluxiq/src/programs/identity-access/api/contracts.ts:76` | - |
| `verifyAutomationStudioBackupManifest` | Value | `packages/fluxiq/src/programs/automation-studio/storage/project/migration-cutover.ts:335` | - |
| `verifyAutomationStudioRunResult` | Value | `packages/fluxiq/src/programs/automation-studio/runtime/result-verification/verify.ts:122` | - |
| `verifyAutomationStudioRuntimeSessionResult` | Value | `packages/fluxiq/src/programs/automation-studio/runtime/result-verification/run-outcome.ts:249` | - |
| `verifyAutomationStudioV2Migration` | Value | `packages/fluxiq/src/programs/automation-studio/storage/project/migration-cutover.ts:438` | - |
| `verifyCodeOwnedFlowCompilation` | Value | `packages/fluxiq/src/programs/automation-studio/dsl/compiler.ts:51` | - |
| `viewerRole` | Object | `packages/fluxiq/src/programs/identity-access/runtime/roles.ts:17` | - |
| `WeightedAutomationCondition` | Type | `packages/fluxiq/src/programs/automation-studio/model/conditions.ts:29` | - |
| `withAutomationStudioAdaptationReplay` | Value | `packages/fluxiq/src/programs/automation-studio/runtime/adaptation-confidence/replay.ts:121` | - |
| `withAutomationStudioBuildActivity` | Value | `packages/fluxiq/src/programs/automation-studio/runtime/activity/build.ts:15` | - |
| `withAutomationStudioFlowRepresentation` | Value | `packages/fluxiq/src/programs/automation-studio/model/flows.ts:47` | - |
| `withAutomationStudioInterventionMode` | Value | `packages/fluxiq/src/programs/automation-studio/model/flows.ts:82` | - |
| `withAutomationStudioNodeAdaptationId` | Value | `packages/fluxiq/src/programs/automation-studio/runtime/flow-change/contracts.ts:280` | - |
| `withAutomationStudioRunActivity` | Value | `packages/fluxiq/src/programs/automation-studio/runtime/activity/run.ts:22` | - |
| `withEndpointPerformanceScope` | Value | `packages/fluxiq/src/programs/_shared/performance-metrics.ts:55` | - |
| `withSqlPerformanceContext` | Value | `packages/fluxiq/src/programs/_shared/performance-metrics.ts:51` | - |
| `writeMigrationJournal` | Value | `packages/fluxiq/src/framework/storage-layout.ts:105` | - |
