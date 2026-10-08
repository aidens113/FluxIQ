# Framework API Reference

This deterministic inventory is generated from the public exports of `packages/fluxiq/src/index.ts` using TypeDoc.
It intentionally omits line numbers, timestamps, machine paths, Git state, and runtime data, so it changes only when the public surface changes.

Regenerate it with `pnpm docs:reference`; CI verifies freshness with `pnpm docs:check`.

## API Summary

- Public declarations: 3366
- Class: 106
- Interface: 2
- Object: 430
- Type: 1834
- Type Alias: 1
- Value: 993

## Public Declarations

| Name | Kind | Source | Summary |
| --- | --- | --- | --- |
| `acceptAutomationStudioFlowBootstrapResult` | Value | `packages/fluxiq/src/programs/automation-studio/runtime/flow-bootstrap/authoring/accept.ts` | - |
| `AcquireComputeLeaseRequest` | Type | `packages/fluxiq/src/programs/compute-control/api/contracts.ts` | - |
| `ActionChannelDescriptor` | Type | `packages/fluxiq/src/programs/automation-studio/model/descriptors.ts` | - |
| `ActionDefinition` | Type | `packages/fluxiq/src/programs/automation-studio/model/actions.ts` | - |
| `ActionEffectCandidate` | Type | `packages/fluxiq/src/programs/automation-studio/mining/contracts.ts` | - |
| `ActionEffectRelationship` | Type | `packages/fluxiq/src/programs/automation-studio/mining/contracts.ts` | - |
| `ActionEntry` | Type | `packages/fluxiq/src/programs/automation-studio/model/timeline.ts` | - |
| `ActionResult` | Type | `packages/fluxiq/src/programs/automation-studio/model/actions.ts` | - |
| `ActionSafetyMetadata` | Type | `packages/fluxiq/src/programs/automation-studio/model/actions.ts` | - |
| `ActionTarget` | Type | `packages/fluxiq/src/programs/automation-studio/model/actions.ts` | - |
| `actionTargetParameterValues` | Value | `packages/fluxiq/src/programs/automation-studio/runtime/flow-change/action-target-parameters.ts` | - |
| `ActionVisualEntityTarget` | Type | `packages/fluxiq/src/programs/automation-studio/model/actions.ts` | - |
| `ActionVisualTargetResolution` | Type | `packages/fluxiq/src/programs/automation-studio/model/action-visual-target.ts` | - |
| `ActionVisualTargetSource` | Type | `packages/fluxiq/src/programs/automation-studio/model/actions.ts` | - |
| `ACTIVITY_ACTION_ICONS` | Object | `packages/fluxiq/src/ui/activity-action/icons.ts` | The icon each action kind's card shows: a lucide icon name (Core's icon set, `lucide-react`), in kebab case. A client maps the name to its own component. |
| `ACTIVITY_ACTION_NAMES` | Object | `packages/fluxiq/src/ui/activity-action/names.ts` | The short label each action kind's card carries beside its icon. |
| `ACTIVITY_ACTION_REFUSAL_WORDS` | Object | `packages/fluxiq/src/ui/activity-action/refusal-words.ts` | Core's plain words for why it did not do what a decision asked, written once for every client's card and for Core's own wording (`programs/automation-studio/runtime/activity/wording/draft-edit-card.ts`, which checks at compile time that every reason the draft can give has words here). - `amendment`: why an edit to the draft changed nothing, by the draft's own refusal reason (`programs/automation-studio/runtime/flow-draft/amendment/types.ts`). - `repeated`: why a call, or a step asked to run again, was not run, by what the same call came to before (`programs/automation-studio/runtime/llm/repeat-guard/outcomes.ts`). Each finishes "Not done: ...", so each opens in lower case and is no code. |
| `ACTIVITY_RESULT_CHECK_LABELS` | Object | `packages/fluxiq/src/ui/activity-action/result-check-labels.ts` | The status sentence (`ClientGatewayActivity.label`) each verdict of a run's result check is said in (`programs/automation-studio/runtime/result-verification/check-activity.ts`). Written once, here, because a chat card reads two of them back: a result Core could not confirm (`unconfirmed`, the two checks disagreed or the model was unsure) and one it could not check at all (`unchecked`) are not a pass, and they are not a failure either. The row's `status` is `failed` for both, fail-closed, so the label is the only thing that tells them from `refuted`. |
| `ActivityAction` | Type | `packages/fluxiq/src/ui/activity-action/types.ts` | One action, ready for a card. `target` is the name of what it acted on as the event already carried it, or null when it named none (the client says "the page" in its own words). `why` is a short human reason for a failure, or null; never a result code. `tested` is set only on a step a test of the Flow did not simply do again, and says what it did instead, in words a card shows in place of "Done" ("Checked, not pressed", "Already done on the site", "Skipped: not there, optional"; `./tested.ts`). |
| `ActivityActionEvent` | Type | `packages/fluxiq/src/ui/activity-action/types.ts` | The fields of one activity event the classifier reads. A client passes the `server.activity` payload as it arrived; fields it does not have may be left out. |
| `activityActionFailureReason` | Value | `packages/fluxiq/src/ui/activity-action/failure-reason.ts` | - |
| `activityActionKey` | Value | `packages/fluxiq/src/ui/activity-action/key.ts` | - |
| `ActivityActionKind` | Type | `packages/fluxiq/src/ui/activity-action/types.ts` | What kind of action a card shows; each has one icon and one short name. |
| `activityActionOf` | Value | `packages/fluxiq/src/ui/activity-action/action-of.ts` | - |
| `ActivityActionOutcome` | Type | `packages/fluxiq/src/ui/activity-action/types.ts` | Where the action stands: still going, finished, failed, or waiting on a person. |
| `activityActionReplayFailing` | Value | `packages/fluxiq/src/ui/activity-action/replay-failing.ts` | - |
| `activityActionSentences` | Value | `packages/fluxiq/src/ui/activity-action/sentences.ts` | - |
| `activityActionTested` | Value | `packages/fluxiq/src/ui/activity-action/tested.ts` | - |
| `activityActionVerb` | Value | `packages/fluxiq/src/ui/activity-action/verb.ts` | - |
| `ActivityActionVerb` | Type | `packages/fluxiq/src/ui/activity-action/types.ts` | The generic verbs an id, a label or a result code can name. Each belongs to one kind; the activity wording (`programs/automation-studio/runtime/activity/wording`) says each in a person's words. |
| `ActivityReadRequest` | Type | `packages/fluxiq/src/programs/automation-studio/api/contracts/activity.ts` | One project's live activity. Nothing else narrows it: the hub keeps one project's latest events. |
| `adaptationConfidence` | Value | `packages/fluxiq/src/programs/automation-studio/runtime/recovery/adaptation-promotion.ts` | - |
| `adaptationFromRuntimePatch` | Value | `packages/fluxiq/src/programs/automation-studio/runtime/live-patch.ts` | - |
| `adaptationValidationCounts` | Value | `packages/fluxiq/src/programs/automation-studio/runtime/recovery/adaptation-promotion.ts` | - |
| `adaptBuiltinAutomationNodeDefinition` | Value | `packages/fluxiq/src/programs/automation-studio/nodes/definitions.ts` | - |
| `adaptLegacyRoutineToAutomationStudioFlow` | Value | `packages/fluxiq/src/programs/automation-studio/model/flow-compatibility.ts` | - |
| `adaptLegacyTaskToAutomationStudioFlow` | Value | `packages/fluxiq/src/programs/automation-studio/model/flow-compatibility.ts` | - |
| `adaptPolicyGraphToPolicyRegion` | Value | `packages/fluxiq/src/programs/automation-studio/runtime/region-compiler.ts` | - |
| `adminRole` | Object | `packages/fluxiq/src/programs/identity-access/runtime/roles.ts` | - |
| `adoptUncommittedFluxIQStorage` | Value | `packages/fluxiq/src/framework/uncommitted-v2-adoption.ts` | - |
| `AdvanceProductionRunRequest` | Type | `packages/fluxiq/src/programs/production-runner/api/contracts.ts` | - |
| `annotateAutomationStudioRunDetailWithRuntimeLlm` | Value | `packages/fluxiq/src/programs/automation-studio/runtime/recovery/annotation/annotate.ts` | - |
| `annotateRunDetailWithTrainingMode` | Value | `packages/fluxiq/src/programs/automation-studio/runtime/training-modes.ts` | - |
| `AppendRecordingDomainEventRequest` | Type | `packages/fluxiq/src/programs/automation-studio/api/contracts/recording.ts` | - |
| `appendRecordingEntry` | Value | `packages/fluxiq/src/programs/automation-studio/model/recording-framework.ts` | - |
| `AppendRecordingEntryInput` | Type | `packages/fluxiq/src/programs/automation-studio/model/recording-framework.ts` | - |
| `AppendRecordingEntryRequest` | Type | `packages/fluxiq/src/programs/automation-studio/api/contracts/recording.ts` | - |
| `AppendRecordingMarkerRequest` | Type | `packages/fluxiq/src/programs/automation-studio/api/contracts/recording.ts` | - |
| `appendRecordingNote` | Value | `packages/fluxiq/src/programs/automation-studio/model/recording-framework.ts` | - |
| `AppendRecordingNoteRequest` | Type | `packages/fluxiq/src/programs/automation-studio/api/contracts/recording.ts` | - |
| `appendRecordingStateCheckpoint` | Value | `packages/fluxiq/src/programs/automation-studio/model/recording-framework.ts` | - |
| `appendRecordingStateDelta` | Value | `packages/fluxiq/src/programs/automation-studio/model/recording-framework.ts` | - |
| `applyAutomationStudioConversationAdaptation` | Value | `packages/fluxiq/src/programs/automation-studio/runtime/conversations/commands/apply.ts` | - |
| `applyAutomationStudioFlowDraftAmendments` | Value | `packages/fluxiq/src/programs/automation-studio/runtime/flow-draft/amendment/apply.ts` | - |
| `applyAutomationStudioRuntimeRecoveryPatches` | Value | `packages/fluxiq/src/programs/automation-studio/runtime/recovery/annotation/patches.ts` | - |
| `ApplyGraphPatchRequest` | Type | `packages/fluxiq/src/programs/automation-studio/api/contracts/graph.ts` | - |
| `applyStateDeltas` | Value | `packages/fluxiq/src/programs/automation-studio/model/state-diff.ts` | - |
| `ApprovalStatus` | Type | `packages/fluxiq/src/programs/automation-studio/types.ts` | - |
| `ApprovePolicyProposalRequest` | Type | `packages/fluxiq/src/programs/automation-studio/api/contracts/policy.ts` | - |
| `askToConfirmAutomationStudioConversationCommand` | Value | `packages/fluxiq/src/programs/automation-studio/runtime/conversations/commands/confirmation.ts` | - |
| `assembleAutomationStudioFlowDraftPlan` | Value | `packages/fluxiq/src/programs/automation-studio/runtime/flow-bootstrap/authoring/assemble-draft.ts` | - |
| `assertAutomationStudioBootstrapHasNoRecordingProvenance` | Value | `packages/fluxiq/src/programs/automation-studio/runtime/flow-bootstrap/adaptation.ts` | - |
| `assertAutomationStudioBootstrapPermissionRequestAnswered` | Value | `packages/fluxiq/src/programs/automation-studio/runtime/flow-bootstrap/adaptation.ts` | - |
| `assertAutomationStudioCompiledPlan` | Value | `packages/fluxiq/src/programs/automation-studio/runtime/compiled-plan.ts` | - |
| `assertAutomationStudioFlowBootstrapPlanHandlesResolved` | Value | `packages/fluxiq/src/programs/automation-studio/runtime/llm/harness-options/plan-parameter-resolution.ts` | - |
| `assertAutomationStudioLlmDomainSystemInstructions` | Value | `packages/fluxiq/src/programs/automation-studio/runtime/llm/domain-instructions/validate.ts` | - |
| `assertAutomationStudioNormalEditorGraphEndpoint` | Value | `packages/fluxiq/src/programs/automation-studio/api/contracts/endpoints.ts` | - |
| `assertAutomationStudioReadPathDoesNotRepair` | Value | `packages/fluxiq/src/programs/automation-studio/storage/project/migration-cutover.ts` | - |
| `assertAutomationStudioScaleCertificationPasses` | Value | `packages/fluxiq/src/programs/automation-studio/testing/scale-certification.ts` | - |
| `assertFlowLlmExecutionSettings` | Value | `packages/fluxiq/src/programs/automation-studio/api/handlers/llm-execution-settings.ts` | - |
| `assertNoCriticalFullScan` | Value | `packages/fluxiq/src/programs/automation-studio/storage/query-plan.ts` | - |
| `assertPlanMentions` | Value | `packages/fluxiq/src/programs/automation-studio/storage/query-plan.ts` | - |
| `assertValidRecordingIndex` | Value | `packages/fluxiq/src/programs/automation-studio/storage/state-index.ts` | - |
| `atomicWriteJson` | Value | `packages/fluxiq/src/framework/storage-layout.ts` | - |
| `AuthorityGuardCaptureIdentity` | Type | `packages/fluxiq/src/programs/automation-studio/storage/project/authority-guard/contracts.ts` | - |
| `AuthorityGuardCaptureRecord` | Type | `packages/fluxiq/src/programs/automation-studio/storage/project/authority-guard/contracts.ts` | - |
| `AuthorityGuardCaptureRelease` | Type | `packages/fluxiq/src/programs/automation-studio/storage/project/authority-guard/contracts.ts` | - |
| `AuthorityGuardCaptureReleaseOwner` | Type | `packages/fluxiq/src/programs/automation-studio/storage/project/authority-guard/contracts.ts` | - |
| `AuthorityGuardCaptureRequest` | Type | `packages/fluxiq/src/programs/automation-studio/storage/project/authority-guard/contracts.ts` | - |
| `AuthorityGuardClaim` | Type | `packages/fluxiq/src/programs/automation-studio/storage/project/authority-guard/contracts.ts` | - |
| `AuthorityGuardCompletion` | Type | `packages/fluxiq/src/programs/automation-studio/storage/project/authority-guard/contracts.ts` | - |
| `AuthorityGuardCompletionCapability` | Type | `packages/fluxiq/src/programs/automation-studio/storage/project/authority-guard/contracts.ts` | - |
| `AuthorityGuardLegacyOutcome` | Type | `packages/fluxiq/src/programs/automation-studio/storage/project/authority-guard/contracts.ts` | - |
| `AuthorityGuardLegacyRecord` | Type | `packages/fluxiq/src/programs/automation-studio/storage/project/authority-guard/contracts.ts` | - |
| `AuthorityGuardLegacyRequest` | Type | `packages/fluxiq/src/programs/automation-studio/storage/project/authority-guard/contracts.ts` | - |
| `AuthorityGuardOpenOptions` | Type | `packages/fluxiq/src/programs/automation-studio/storage/project/authority-guard/contracts.ts` | - |
| `AuthorityGuardOwner` | Type | `packages/fluxiq/src/programs/automation-studio/storage/project/authority-guard/contracts.ts` | - |
| `AuthorityGuardState` | Type | `packages/fluxiq/src/programs/automation-studio/storage/project/authority-guard/contracts.ts` | - |
| `AuthorityGuardUnknownReason` | Type | `packages/fluxiq/src/programs/automation-studio/storage/project/authority-guard/contracts.ts` | - |
| `authorizeProgramPin` | Value | `packages/fluxiq/src/programs/_shared/authorization.ts` | - |
| `AUTOMATION_NODE_OUTPUT_REFERENCE_ROOT` | Object | `packages/fluxiq/src/programs/automation-studio/nodes/parameter-bindings.ts` | The first segment of a state path that names another node of the same graph by its key, rather than a key of run state: `$node.<key>.<output>[.<field>]` (P5, t270). A Flow assembled from a draft names its nodes `s1`, `s2`, ... by where they sit, and only the stored Flow knows the id each became, so the executor resolves the key to that id when the node runs (`../runtime/executor/node-inputs.ts`). No run state is ever keyed under it, so a reference nothing resolved is reported missing, never read. |
| `AUTOMATION_STUDIO_ACTION_CONSEQUENCE_PHRASES` | Object | `packages/fluxiq/src/programs/automation-studio/runtime/action-permissions/consequences.ts` | Each consequence as the person being asked would say it. Exhaustive, so a class added to the list above is a compile error here until it can be explained to someone. |
| `AUTOMATION_STUDIO_ACTION_CONSEQUENCES` | Object | `packages/fluxiq/src/programs/automation-studio/runtime/action-permissions/consequences.ts` | Every lasting consequence Core can be asked to permit, most serious first. The order is the order a request lists them in. |
| `AUTOMATION_STUDIO_ACTION_DECLARATION_CROSS_CHECK_SCHEMA_VERSION` | Object | `packages/fluxiq/src/programs/automation-studio/runtime/action-permissions/cross-check.ts` | - |
| `AUTOMATION_STUDIO_ACTION_DECLARATIONS_MAX` | Object | `packages/fluxiq/src/programs/automation-studio/runtime/action-permissions/declared.ts` | How many declarations one gate keeps. Past it the run acts as before and stops recording. |
| `AUTOMATION_STUDIO_ACTION_PERMISSION_CONTROL_NAME_MAX` | Object | `packages/fluxiq/src/programs/automation-studio/runtime/action-permissions/request.ts` | The longest control name a request carries. Past it the name is cut, never widened. |
| `AUTOMATION_STUDIO_ACTION_PERMISSION_REQUEST_SCHEMA_VERSION` | Object | `packages/fluxiq/src/programs/automation-studio/runtime/action-permissions/request.ts` | - |
| `AUTOMATION_STUDIO_ACTIVITY_LIMITS` | Object | `packages/fluxiq/src/programs/automation-studio/runtime/activity/limits.ts` | The bounds on every activity event (D4 of the live activity plan): string lengths match what `ClientGatewayActivity` promises its readers, and `recent` is how many events one project's snapshot keeps. |
| `AUTOMATION_STUDIO_ADAPTIVE_FAILURE_CLASSES` | Object | `packages/contracts/src/failure/adaptive-class.ts` | FluxIQ's one failure-category list. Core names every member and classifies failed attempts into them; a domain decides which member applies and reports it in an `AutomationStudioFailureRecord`. No second list exists in Core or in an importing domain. Adding a member breaks exhaustive consumers, so before 1.0 it is a minor version bump with a migration note. |
| `AUTOMATION_STUDIO_AES_GCM_PROJECT_CONTENT_PROTECTION_ID` | Object | `packages/fluxiq/src/programs/automation-studio/storage/project/content-protection.ts` | - |
| `AUTOMATION_STUDIO_ASK_EFFECT` | Object | `packages/fluxiq/src/programs/automation-studio/runtime/parking/ask-effect.ts` | The effect anything executing inside a run emits to ask the person something. An effect rather than a field on the node result, so the capability is open to every part of a run at once: a built-in node, a domain adapter answering a dispatch, a permission gate. The executor reads it where it reads the rest of an attempt's effects, and never hands it to a host dispatcher -- no domain is asked to know what an ask is. |
| `AUTOMATION_STUDIO_AUTHORING_MODE_DEFAULT` | Object | `packages/fluxiq/src/programs/automation-studio/model/authoring-mode/authoring-mode.ts` | The mode when nothing is set. |
| `AUTOMATION_STUDIO_AUTHORING_MODE_ENV` | Object | `packages/fluxiq/src/programs/automation-studio/model/authoring-mode/authoring-mode.ts` | The variable the Core process reads. |
| `AUTOMATION_STUDIO_AUTHORING_MODES` | Object | `packages/fluxiq/src/programs/automation-studio/model/authoring-mode/authoring-mode.ts` | Every mode, in the spelling the variable takes. |
| `AUTOMATION_STUDIO_AUTHORITY_GUARD_MIGRATION` | Object | `packages/fluxiq/src/programs/automation-studio/storage/project/authority-guard/migration.ts` | - |
| `AUTOMATION_STUDIO_BASELINE_NODE_COUNTS` | Object | `packages/fluxiq/src/programs/automation-studio/testing/scale-baseline.ts` | - |
| `AUTOMATION_STUDIO_BUILD_REQUEST_MAX_CHARS` | Object | `packages/fluxiq/src/programs/automation-studio/runtime/activity/build.ts` | The most of the person's words one build's request carries. |
| `AUTOMATION_STUDIO_BUILD_TEST_CHANGE_LINES_KEY` | Object | `packages/fluxiq/src/programs/automation-studio/runtime/result-verification/build-test/change-lines.ts` | The member of a replayed step's answer that says what it changed. The domain writes the same word. |
| `AUTOMATION_STUDIO_BUILD_TEST_READ_ROWS_KEY` | Object | `packages/fluxiq/src/programs/automation-studio/runtime/result-verification/build-test/read-rows.ts` | The member of a replayed read's answer that names its rows. The domain writes the same word. |
| `AUTOMATION_STUDIO_BUILTIN_HARNESS_OPTION_IDS` | Object | `packages/fluxiq/src/programs/automation-studio/runtime/llm/harness-options/builtin.ts` | - |
| `AUTOMATION_STUDIO_CANDIDATE_MAX_TRIALS_PER_REVISION` | Object | `packages/fluxiq/src/programs/automation-studio/runtime/flow-bootstrap/candidate/trial-gate.ts` | Trials of one revision and digest, the first included; a transient verdict may be tested again until this many have run. |
| `AUTOMATION_STUDIO_CANDIDATE_START_HOOK_ENV` | Object | `packages/fluxiq/src/programs/automation-studio/runtime/candidate-start-hook/environment.ts` | The variables the Core process reads for the candidate start hook. |
| `AUTOMATION_STUDIO_CANDIDATE_SUBMISSION_REFUSED_CODE` | Object | `packages/fluxiq/src/programs/automation-studio/runtime/flow-bootstrap/candidate/submission-refusal.ts` | The code a refused submission is counted under when its check names no closed code of its own. |
| `AUTOMATION_STUDIO_CANDIDATE_TEST_TOOL_ID` | Object | `packages/fluxiq/src/programs/automation-studio/runtime/flow-bootstrap/candidate/trial-gate.ts` | - |
| `AUTOMATION_STUDIO_CANDIDATE_TRIAL_VERDICTS` | Object | `packages/fluxiq/src/programs/automation-studio/runtime/flow-bootstrap/candidate/contracts.ts` | - |
| `AUTOMATION_STUDIO_CANDIDATE_VERIFICATION_MIGRATION` | Object | `packages/fluxiq/src/programs/automation-studio/storage/project/candidate-verification/migration.ts` | - |
| `AUTOMATION_STUDIO_CATALOG_MIGRATIONS` | Object | `packages/fluxiq/src/programs/automation-studio/storage/catalog.ts` | - |
| `AUTOMATION_STUDIO_CHANGE_CONFIDENCE_DEFAULT_REPLAYS` | Object | `packages/fluxiq/src/programs/automation-studio/runtime/flow-change/confidence.ts` | Succeeded replays a low- or medium-risk change needs before it is `established`. |
| `AUTOMATION_STUDIO_CHANGE_VERDICT_EVIDENCE_KINDS` | Object | `packages/fluxiq/src/programs/automation-studio/runtime/flow-change/contracts.ts` | The evidence kinds, in the order a verdict's `basis` lists them. Declared with the kinds themselves so the verdict and the resume decision read one list rather than each keeping its own idea of what counts as evidence. |
| `AUTOMATION_STUDIO_CHANGE_VERDICT_SCHEMA_VERSION` | Object | `packages/fluxiq/src/programs/automation-studio/runtime/flow-change/verdict.ts` | - |
| `AUTOMATION_STUDIO_COMMAND_LEDGER_MIGRATION` | Object | `packages/fluxiq/src/programs/automation-studio/storage/project/command-ledger/migration.ts` | - |
| `AUTOMATION_STUDIO_COMMAND_SCAN_LIMIT` | Object | `packages/fluxiq/src/programs/automation-studio/storage/project/command-ledger/contracts.ts` | - |
| `AUTOMATION_STUDIO_COMMAND_SCAN_PAGE` | Object | `packages/fluxiq/src/programs/automation-studio/storage/project/command-ledger/contracts.ts` | - |
| `AUTOMATION_STUDIO_COMPILED_PLAN_COMPILER_VERSION` | Object | `packages/fluxiq/src/programs/automation-studio/runtime/compiled-plan.ts` | - |
| `AUTOMATION_STUDIO_COMPILED_PLAN_SCHEMA_VERSION` | Object | `packages/fluxiq/src/programs/automation-studio/runtime/compiled-plan.ts` | - |
| `AUTOMATION_STUDIO_CONVERSATION_ANSWER_ASK` | Object | `packages/fluxiq/src/programs/automation-studio/runtime/conversations/commands/answer-ask.ts` | - |
| `AUTOMATION_STUDIO_CONVERSATION_ANSWER_KINDS` | Object | `packages/fluxiq/src/programs/automation-studio/runtime/conversations/ask.ts` | - |
| `AUTOMATION_STUDIO_CONVERSATION_ANSWER_VALUE_MAX` | Object | `packages/fluxiq/src/programs/automation-studio/runtime/conversations/inputs.ts` | The longest an answer's value may be: an option id, or the words an open question takes. |
| `AUTOMATION_STUDIO_CONVERSATION_APPLY_CHANGE` | Object | `packages/fluxiq/src/programs/automation-studio/runtime/conversations/commands/apply-change.ts` | - |
| `AUTOMATION_STUDIO_CONVERSATION_ARGUMENT_WORDS` | Object | `packages/fluxiq/src/programs/automation-studio/runtime/conversations/commands/argument.ts` | Said beside "saved what it should do" when the words saved were the command's argument, not the person's. |
| `AUTOMATION_STUDIO_CONVERSATION_ASK_ANSWERED` | Object | `packages/fluxiq/src/programs/automation-studio/runtime/conversations/store.ts` | The refusal a second, different answer gets. Named so a caller can recognise it without matching prose. |
| `AUTOMATION_STUDIO_CONVERSATION_ASK_COLUMNS` | Object | `packages/fluxiq/src/programs/automation-studio/runtime/conversations/rows.ts` | - |
| `AUTOMATION_STUDIO_CONVERSATION_ASK_KINDS` | Object | `packages/fluxiq/src/programs/automation-studio/runtime/conversations/ask.ts` | - |
| `AUTOMATION_STUDIO_CONVERSATION_ASK_STATUSES` | Object | `packages/fluxiq/src/programs/automation-studio/runtime/conversations/ask.ts` | - |
| `AUTOMATION_STUDIO_CONVERSATION_ASK_TIMEOUT_ACTIONS` | Object | `packages/fluxiq/src/programs/automation-studio/runtime/conversations/ask.ts` | What happens to a parked ask nobody answered: refuse, or take the option marked as the default. |
| `AUTOMATION_STUDIO_CONVERSATION_AUTHORS` | Object | `packages/fluxiq/src/programs/automation-studio/runtime/conversations/turn.ts` | - |
| `AUTOMATION_STUDIO_CONVERSATION_CANDIDATE_JUDGED` | Object | `packages/fluxiq/src/programs/automation-studio/runtime/conversations/commands/build.ts` | What a candidate build did before its steps went in, as the ready line's last clause (candidate mode only). The ready line used to keep the legacy build's words, "I tried its steps on the page you had open and put the ones that worked into it", which a candidate build never did: it explores, writes the whole Flow, and puts it in only after a test run of the whole Flow from its start is judged to do what was asked; the person is told that plainly (t370, lane A round 7 UI). |
| `AUTOMATION_STUDIO_CONVERSATION_CANDIDATE_SAVED` | Object | `packages/fluxiq/src/programs/automation-studio/runtime/conversations/commands/build.ts` | What a create-here, explore or improve says once its candidate draft is saved with no trial runner (candidate mode only). |
| `AUTOMATION_STUDIO_CONVERSATION_COLUMNS` | Object | `packages/fluxiq/src/programs/automation-studio/runtime/conversations/rows.ts` | - |
| `AUTOMATION_STUDIO_CONVERSATION_COMMAND_ASK_PREFIX` | Object | `packages/fluxiq/src/programs/automation-studio/runtime/conversations/commands/confirmation.ts` | The ask id prefix of a question a conversation command asked. |
| `AUTOMATION_STUDIO_CONVERSATION_COMMAND_ATTACHMENT` | Object | `packages/fluxiq/src/programs/automation-studio/runtime/conversations/commands/confirmation.ts` | The attachment kind that carries what a granted conversation-command ask runs. |
| `AUTOMATION_STUDIO_CONVERSATION_COMMANDS` | Object | `packages/fluxiq/src/programs/automation-studio/runtime/conversations/commands/catalog.ts` | - |
| `AUTOMATION_STUDIO_CONVERSATION_CONSEQUENTIAL_CLASSES` | Object | `packages/fluxiq/src/programs/automation-studio/runtime/conversations/ask.ts` | The consequence classes that make answering an ask something a person must do deliberately, with the whole question in front of them, rather than from a prompt floating over whatever else they were doing. It is the standing product rule read back: completing a purchase, deleting, and editing existing data are the acts that need the person's real say-so. Sending or publishing is here too, because it reaches other people and cannot be taken back. Only `create_new` is left out: making something new that did not exist is the one class that undoes cleanly. |
| `AUTOMATION_STUDIO_CONVERSATION_CREATE_HERE` | Object | `packages/fluxiq/src/programs/automation-studio/runtime/conversations/commands/create-here.ts` | - |
| `AUTOMATION_STUDIO_CONVERSATION_DESCRIBE` | Object | `packages/fluxiq/src/programs/automation-studio/runtime/conversations/commands/describe.ts` | - |
| `AUTOMATION_STUDIO_CONVERSATION_DISCARD_CHANGE` | Object | `packages/fluxiq/src/programs/automation-studio/runtime/conversations/commands/discard-change.ts` | - |
| `AUTOMATION_STUDIO_CONVERSATION_EXPLORE` | Object | `packages/fluxiq/src/programs/automation-studio/runtime/conversations/commands/explore.ts` | - |
| `AUTOMATION_STUDIO_CONVERSATION_FALLBACK_FLOOR` | Object | `packages/fluxiq/src/programs/automation-studio/runtime/conversations/instructions/fallback.ts` | Below this, a match on the words alone is not acted on. |
| `AUTOMATION_STUDIO_CONVERSATION_IMPROVE` | Object | `packages/fluxiq/src/programs/automation-studio/runtime/conversations/commands/improve.ts` | - |
| `AUTOMATION_STUDIO_CONVERSATION_INTERPRET_LIMITS` | Object | `packages/fluxiq/src/programs/automation-studio/runtime/conversations/instructions/interpret.ts` | - |
| `AUTOMATION_STUDIO_CONVERSATION_RUN_FLOW` | Object | `packages/fluxiq/src/programs/automation-studio/runtime/conversations/commands/run-flow.ts` | - |
| `AUTOMATION_STUDIO_CONVERSATION_STATUSES` | Object | `packages/fluxiq/src/programs/automation-studio/runtime/conversations/thread.ts` | - |
| `AUTOMATION_STUDIO_CONVERSATION_SUBJECT_KINDS` | Object | `packages/fluxiq/src/programs/automation-studio/runtime/conversations/thread.ts` | - |
| `AUTOMATION_STUDIO_CONVERSATION_TEXT_MAX` | Object | `packages/fluxiq/src/programs/automation-studio/runtime/conversations/turn.ts` | The longest a turn's text may be. Past it the write is refused, never cut. |
| `AUTOMATION_STUDIO_CONVERSATION_TITLE_MAX` | Object | `packages/fluxiq/src/programs/automation-studio/runtime/conversations/inputs.ts` | The longest a thread's title may be. |
| `AUTOMATION_STUDIO_CONVERSATION_TURN_COLUMNS` | Object | `packages/fluxiq/src/programs/automation-studio/runtime/conversations/rows.ts` | - |
| `AUTOMATION_STUDIO_CORE_LOOP_EVIDENCE_TOOL_POLICY_INSTRUCTION` | Object | `packages/fluxiq/src/programs/automation-studio/runtime/llm/stages/instructions.ts` | How to use tools, for a request that was offered some. This is Core's own evidence loop being described -- its decision schema, its completion variant, its {ok:false,code} result shape -- so it is mechanism rather than stage meaning, and it carries a reserved `core.loop-stage.` id that no registration can address. A domain that replaces "gather" replaces what gathering means for its medium; it does not get to rewrite how Core's loop is answered. It sits between the ordering statement and the stage's own instructions, and carries the text by reference rather than by copy, so there is exactly one copy of it in the codebase and the provider and the protocol cannot drift apart on what exploration means. |
| `AUTOMATION_STUDIO_CORE_LOOP_STAGE_INSTRUCTION_ID_PREFIX` | Object | `packages/fluxiq/src/programs/automation-studio/runtime/llm/stages/instructions.ts` | Every Core-owned stage instruction id begins with this. Reserved for the same reason. |
| `AUTOMATION_STUDIO_CORE_LOOP_STAGE_INSTRUCTIONS` | Object | `packages/fluxiq/src/programs/automation-studio/runtime/llm/stages/instructions.ts` | Core's default instruction for each stage: what the work of that stage is, said without naming any medium. A domain replaces one of these when its stage genuinely means something else, and adds beside them when it means the same thing with more detail. "gather" used to be the evidence loop's decision policy verbatim. That text is about choosing between offered tools -- which one to call, when not to call one, when to stop -- and the first production caller of the protocol is a runtime diagnosis, which is offered no tools at all. So every diagnosis was told how to use tools it did not have, and referred to a decision schema that was not in its request. The stage's own meaning is what stays here; the tool policy moved to AUTOMATION_STUDIO_CORE_LOOP_EVIDENCE_TOOL_POLICY_INSTRUCTION below, which is added only to a request that actually carries tools. |
| `AUTOMATION_STUDIO_DECLARED_CONSEQUENCES_METADATA_KEY` | Object | `packages/fluxiq/src/programs/automation-studio/runtime/executor/defensive/lasting-act.ts` | Where a Flow node keeps its step's declared consequences: the plan's plain strings, `[]` when the step declared `none`. Written by the build (`../../flow-bootstrap/adaptation.ts`) and read here. |
| `AUTOMATION_STUDIO_DEEPSEEK_BUILT_IN_DEFAULT_MODEL` | Object | `packages/fluxiq/src/programs/automation-studio/runtime/llm/deepseek/models.ts` | The default model when `FLUXIQ_LLM_DEFAULT_MODEL` is unset: `deepseek-flash`, served by DeepSeek-V4.1-Flash. It is the cheaper of the two by roughly four and a half times on every axis, and the one every measurement in this repository was taken against once the retired alias was replaced. What a caller who names no model actually gets is AUTOMATION_STUDIO_DEEPSEEK_DEFAULT_MODEL, at the end of this file. |
| `AUTOMATION_STUDIO_DEEPSEEK_DEFAULT_MODEL` | Object | `packages/fluxiq/src/programs/automation-studio/runtime/llm/deepseek/models.ts` | What a caller who names no model gets, a new Flow's builds among them: resolveAutomationStudioLlmDefaultModel, read once when this module loads -- `deepseek-flash` unless `FLUXIQ_LLM_DEFAULT_MODEL` says otherwise. |
| `AUTOMATION_STUDIO_DEEPSEEK_MODEL_LIMITS` | Object | `packages/fluxiq/src/programs/automation-studio/runtime/llm/model-limits/model-limits.ts` | These are the only per-request size limits Core holds a request to. Core's own ceiling, `AUTOMATION_STUDIO_LLM_ABSOLUTE_MAX_TOTAL_TOKENS_PER_REQUEST`, is derived from them (`AUTOMATION_STUDIO_DEEPSEEK_MAX_CONTEXT_TOKENS`), and a request over its model's window is refused before it is sent, with its measured size (`../deepseek/provider.ts`). Spend is bounded separately, by the run's cost ceiling. |
| `AUTOMATION_STUDIO_DEEPSEEK_MODELS` | Object | `packages/fluxiq/src/programs/automation-studio/runtime/llm/deepseek/models.ts` | Every model id Core will accept. DeepSeek's current line, newest first. |
| `AUTOMATION_STUDIO_DEEPSEEK_OFF_PEAK_RATE_MULTIPLIER` | Object | `packages/fluxiq/src/programs/automation-studio/runtime/llm/deepseek/pricing.ts` | How much less an off-peak call costs: exactly half, on every rate and every model. |
| `AUTOMATION_STUDIO_DEEPSEEK_PEAK_CACHE_HIT_INPUT_USD_PER_MILLION_TOKENS` | Object | `packages/fluxiq/src/programs/automation-studio/runtime/llm/deepseek/pricing.ts` | What an input token costs when the provider served it from its own context cache, as against AUTOMATION_STUDIO_DEEPSEEK_PEAK_CACHE_MISS_INPUT_USD_PER_MILLION_TOKENS for one it had to read. **It never makes an estimate cheaper.** Core estimates a call against `estimateAutomationStudioDeepSeekInputTokens`, which measures the bytes it is about to send and knows nothing about caching, so the run's budget is still charged the cache-miss price before every call. This rate is applied only to hits the provider has already reported on a call that has already been made, which is a measurement rather than a promise -- so a hit rate that turns out to be wrong cannot let a run overspend its budget. |
| `AUTOMATION_STUDIO_DEEPSEEK_PEAK_CACHE_MISS_INPUT_USD_PER_MILLION_TOKENS` | Object | `packages/fluxiq/src/programs/automation-studio/runtime/llm/deepseek/pricing.ts` | - |
| `AUTOMATION_STUDIO_DEEPSEEK_PEAK_OUTPUT_USD_PER_MILLION_TOKENS` | Object | `packages/fluxiq/src/programs/automation-studio/runtime/llm/deepseek/pricing.ts` | - |
| `AUTOMATION_STUDIO_DEFAULT_ASK_ROUTES` | Object | `packages/fluxiq/src/programs/automation-studio/runtime/parking/parked-run.ts` | Where an ask that names no route of its own resumes: on through the node's success route when it is answered, out of its failure route when it is refused or nobody answers. A node with branch routes of its own -- Approval's `approved` and `rejected` -- names them on the ask instead. The durable ask allows a null route, meaning "none named". A run cannot leave a node by a null, so a route is filled in here, once, when the run parks -- which is also when `onTimeout: "deny"` is folded in, so the record says outright where silence leads rather than making a resume days later re-read what the node meant. |
| `AUTOMATION_STUDIO_DEFAULT_NODE_RETRY_POLICY` | Object | `packages/fluxiq/src/programs/automation-studio/runtime/executor/retry-policy.ts` | Retries are on by default, and this is that default: the first attempt and three retries, at 250 ms, then 1 s, then 2 s. **The user's rule (2026-10-07): three retries is always the default, for every node, on every path** -- a saved Flow's playback, a build's candidate trial, the build's own test runs, and every call it makes while exploring. This constant is the one place that number is written. The graph executor reads it below; a node run outside a graph run -- a domain running one node against a live page while a build explores or tests its draft -- goes through `automationStudioDispatchWithNodeRetries` (`./outside-graph/retries.ts`), which reads it too; and the Flow settings' `maxRetriesPerAction` default is derived from it (`model/flows.ts`). It is a floor. A Flow, a node, a Retry node or a run may ask for more attempts, and the run's `maxRetriesPerAction` caps what they ask for, but nothing lowers a node below this: what ends a node's retries early is the per-fault assessment refusing to repeat an act whose effect is uncertain (`defensive/assess.ts`), asked of every fault rather than declared ahead of time. Settings stored before 2026-10-07 carry `maxRetriesPerAction: 2` from the old default of three attempts; the floor keeps those Flows from running one retry short. |
| `AUTOMATION_STUDIO_DEFAULT_PAGE_LIMIT` | Object | `packages/fluxiq/src/programs/automation-studio/storage/paging.ts` | - |
| `AUTOMATION_STUDIO_DESTRUCTIVE_ACTION_CONSEQUENCES` | Object | `packages/fluxiq/src/programs/automation-studio/runtime/action-permissions/destructive.ts` | The classes a person is still asked about, in Core's order. |
| `AUTOMATION_STUDIO_ENDPOINTS` | Object | `packages/fluxiq/src/programs/automation-studio/api/contracts/endpoints.ts` | - |
| `AUTOMATION_STUDIO_EVIDENCE_FLOW_BOOTSTRAP_COMPLETION_SCHEMA` | Object | `packages/fluxiq/src/programs/automation-studio/runtime/flow-bootstrap/plan/evidence-schema.ts` | The completion schema at the setting's default. |
| `AUTOMATION_STUDIO_EVIDENCE_FLOW_BOOTSTRAP_DRAFT_COMPLETION_SCHEMA` | Object | `packages/fluxiq/src/programs/automation-studio/runtime/flow-bootstrap/plan/evidence-schema.ts` | The draft completion schema at the setting's default. |
| `AUTOMATION_STUDIO_EVIDENCE_FLOW_BOOTSTRAP_LIMITS` | Object | `packages/fluxiq/src/programs/automation-studio/runtime/flow-bootstrap/plan/limits.ts` | - |
| `AUTOMATION_STUDIO_EXPLORATION_ANY_STATE` | Object | `packages/fluxiq/src/programs/automation-studio/runtime/exploration-reduction/state-predicate.ts` | The predicate that nothing has to satisfy. |
| `AUTOMATION_STUDIO_EXPLORATION_BUDGET_CEILINGS` | Object | `packages/fluxiq/src/programs/automation-studio/runtime/recovery/exploration-budget.ts` | The most a host may ask for. The three that bound the loop are Core's own loop ceilings, not a preference of this file's. They are written out rather than read from `AUTOMATION_STUDIO_LLM_EVIDENCE_LOOP_LIMITS` because `llm/harness/intervention.ts` imports a *value* from this directory, so reading one back at module-evaluation time closes a cycle and leaves this constant holding `undefined` -- observed, not theorised. A test pins the three equal to the loop's own limits, so they cannot drift apart silently. |
| `AUTOMATION_STUDIO_EXPLORATION_BUDGET_DEFAULTS` | Object | `packages/fluxiq/src/programs/automation-studio/runtime/recovery/exploration-budget.ts` | - |
| `AUTOMATION_STUDIO_EXPLORATION_DEFAULT_MAX_STEPS_WITHOUT_PROGRESS` | Object | `packages/fluxiq/src/programs/automation-studio/runtime/recovery/progress-guard.ts` | Consecutive steps that may fail to advance before the exploration is stopped. Three, not one: a single barren step is ordinary -- an observation that finds the thing absent is a finding -- and a refusal is meant to be feedback the model acts on. Three in a row is a loop that has stopped responding to what it is being told. |
| `AUTOMATION_STUDIO_EXPLORATION_DROP_REASONS` | Object | `packages/fluxiq/src/programs/automation-studio/runtime/exploration-reduction/reduction.ts` | Why a step is not in the minimum sequence. Exhaustive: a step in scope that is not kept carries exactly one of these. |
| `AUTOMATION_STUDIO_EXPLORATION_DROP_SENTENCE` | Object | `packages/fluxiq/src/programs/automation-studio/runtime/exploration-reduction/reduction.ts` | Core's own sentence for each reason. Never a model's. |
| `AUTOMATION_STUDIO_EXPLORATION_NO_PROGRESS_REASONS` | Object | `packages/fluxiq/src/programs/automation-studio/runtime/recovery/progress-guard.ts` | Why a step did not advance the exploration. Four reasons rather than one boolean: they are four different things for an operator to do about it. |
| `AUTOMATION_STUDIO_EXPLORATION_OUTCOME_FOR_LOOP_FAILURE` | Object | `packages/fluxiq/src/programs/automation-studio/runtime/recovery/exploration-outcome.ts` | Each evidence-loop failure code's outcome. The split that matters is three ways now, not two: the loop's own size limits are `budget_exhausted`, its repeat detection is `no_progress` -- a loop that asked twice for one thing did not run out of anything -- and everything meaning the loop could not be driven correctly is `failed`. `cancelled` is here for completeness only -- the runner aborts the loop itself whenever a limit fires, so it knows the real reason and never falls through to this row. |
| `AUTOMATION_STUDIO_EXPLORATION_OUTCOME_FOR_RUN_BUDGET` | Object | `packages/fluxiq/src/programs/automation-studio/runtime/recovery/exploration-outcome.ts` | Each run-budget diagnostic's outcome, for an exploration refused before it starts. |
| `AUTOMATION_STUDIO_EXPLORATION_OUTCOME_FOR_STOP_REASON` | Object | `packages/fluxiq/src/programs/automation-studio/runtime/recovery/exploration-outcome.ts` | Each stop reason's outcome. Exhaustive, so a new reason must be classified here. |
| `AUTOMATION_STUDIO_EXPLORATION_OUTCOMES` | Object | `packages/fluxiq/src/programs/automation-studio/runtime/recovery/exploration-outcome.ts` | The only endings there are. An exploration that ended for a reason outside this list is not possible: the runner has one exit and it classifies through these tables. |
| `AUTOMATION_STUDIO_EXPLORATION_STEP_OUTCOMES` | Object | `packages/fluxiq/src/programs/automation-studio/runtime/exploration-reduction/step.ts` | Whether the step happened, and if not, why not. `succeeded` is the only one the reduction can keep. The other three are kept apart because they are three different things to do about a step that contributed nothing: a `failed` step is a defect, a `refused` one is a policy boundary, and a `not_run` one is the loop declining to repeat itself. |
| `AUTOMATION_STUDIO_EXPLORATION_STOP_REASONS` | Object | `packages/fluxiq/src/programs/automation-studio/runtime/recovery/exploration-outcome.ts` | Why the budget closed an exploration, in Core's own words. A stop reason is finer than an outcome on purpose. Both `wall_clock_expired` and `recovery_deadline_expired` are `budget_exhausted`, but only one of them means the whole recovery ran out of time rather than this one exploration, and a report that could not say which would send somebody to raise the wrong limit. |
| `AUTOMATION_STUDIO_EXPLORATION_TRACE_GAPS` | Object | `packages/fluxiq/src/programs/automation-studio/runtime/exploration-reduction/evidence-loop-trace.ts` | Why a trace entry could not become a step. |
| `AUTOMATION_STUDIO_EXPLORED_EVIDENCE_MAX_ORDINAL` | Object | `packages/fluxiq/src/programs/automation-studio/runtime/llm/harness/explored-evidence-label.ts` | The largest ordinal a label can carry. |
| `AUTOMATION_STUDIO_FAILURE_RECORD_LIMITS` | Object | `packages/contracts/src/failure/record.ts` | Bounds `parseAutomationStudioFailureRecord` enforces; a record that exceeds them is dropped, not truncated. |
| `AUTOMATION_STUDIO_FAILURE_STAGES` | Object | `packages/contracts/src/failure/record.ts` | Where in an action's life a failure happened. |
| `AUTOMATION_STUDIO_FLOW_BOOTSTRAP_BUILD_ENDING_CODES` | Object | `packages/fluxiq/src/programs/automation-studio/runtime/flow-bootstrap/generation-failure/build-ending.ts` | The code each ending is published under. |
| `AUTOMATION_STUDIO_FLOW_BOOTSTRAP_BUILD_ENDING_MAX_MESSAGE` | Object | `packages/fluxiq/src/programs/automation-studio/runtime/flow-bootstrap/generation-failure/build-ending.ts` | The most a message may hold: what the chat shows of one row (`ClientGatewayActivity`, `detail.text`). |
| `AUTOMATION_STUDIO_FLOW_BOOTSTRAP_DECISION_STEP_IDS` | Object | `packages/fluxiq/src/programs/automation-studio/runtime/flow-bootstrap/decision-step-ids.ts` | The step names of decisions that called no tool. Core's own `core.` namespace, which no domain tool may take, so a reader tells them from tool steps by name. They ride in `steps` rather than in a field of their own so a reader that predates them still parses the record. |
| `AUTOMATION_STUDIO_FLOW_BOOTSTRAP_GENERATION_READINESS` | Object | `packages/fluxiq/src/programs/automation-studio/api/contracts/adaptation.ts` | - |
| `AUTOMATION_STUDIO_FLOW_BOOTSTRAP_LIMITS` | Object | `packages/fluxiq/src/programs/automation-studio/runtime/flow-bootstrap/plan/limits.ts` | - |
| `AUTOMATION_STUDIO_FLOW_BOOTSTRAP_MIN_REPAIR_MS` | Object | `packages/fluxiq/src/programs/automation-studio/runtime/flow-bootstrap/unfinished-build/phases.ts` | The least time worth starting a repair with: a look, a few decisions and the test. |
| `AUTOMATION_STUDIO_FLOW_BOOTSTRAP_OUTPUT_SCHEMA` | Object | `packages/fluxiq/src/programs/automation-studio/runtime/flow-bootstrap/plan/output-schema.ts` | The output schema at the setting's default. |
| `AUTOMATION_STUDIO_FLOW_BOOTSTRAP_PERMISSION_ASK_TIMEOUT_MS` | Object | `packages/fluxiq/src/programs/automation-studio/runtime/flow-bootstrap/action-permissions.ts` | How long a build waits for an answer, for a caller that waits at all. The one Core bound, under the name this path has always exported it by. The mechanism and the reasoning moved to `parking/permission-ask.ts` on 2026-09-22, when the repair path had to ask the same question the same way. |
| `AUTOMATION_STUDIO_FLOW_BOOTSTRAP_PERSON_NEEDED_MAX_ASKS` | Object | `packages/fluxiq/src/programs/automation-studio/runtime/flow-bootstrap/person-needed.ts` | How many times one build may put the question to a person. |
| `AUTOMATION_STUDIO_FLOW_BOOTSTRAP_PHASE_FAILURE_CODES` | Object | `packages/fluxiq/src/programs/automation-studio/runtime/flow-bootstrap/generation-failure/codes.ts` | - |
| `AUTOMATION_STUDIO_FLOW_BOOTSTRAP_UNCHANGED_SINCE_JUDGED_WRONG` | Object | `packages/fluxiq/src/programs/automation-studio/runtime/flow-bootstrap/unfinished-build/unchanged-complete.ts` | The issue code a completion of the unchanged refuted Flow is refused with. |
| `AUTOMATION_STUDIO_FLOW_DRAFT_ACT_ID` | Object | `packages/fluxiq/src/programs/automation-studio/runtime/flow-draft/amendment/act-id.ts` | The shape of an id the checklist gives: an act, `a` and its number, or a choice the person made for that act's item, the act's id and what it fixes (`a2.quantity`, `a2.size`; `../../flow-bootstrap/instructed-acts/instruction-choices.ts`). |
| `AUTOMATION_STUDIO_FLOW_DRAFT_AMENDMENT_CHANGES` | Object | `packages/fluxiq/src/programs/automation-studio/runtime/flow-draft/amendment/changes.ts` | Every change one amendment may ask for (`./index.ts` says what each does). |
| `AUTOMATION_STUDIO_FLOW_DRAFT_AMENDMENT_SCHEMA` | Object | `packages/fluxiq/src/programs/automation-studio/runtime/flow-draft/amendment/schema.ts` | What the model is shown of the amendment shape, as a decision variant's schema. It opens with how the numbers of one decision are read (`./shown-numbering.ts`): every number names the step as the draft entry showed it, and the draft is renumbered once, after the whole decision (live run `run-musr9pv3-f4bf6256`, t195 w45). |
| `AUTOMATION_STUDIO_FLOW_DRAFT_DRY_RUN_ISSUE_CODE` | Object | `packages/fluxiq/src/programs/automation-studio/runtime/flow-draft/dry-run.ts` | The issue a refused dry run is counted under, beside each step's own code. |
| `AUTOMATION_STUDIO_FLOW_DRAFT_DRY_RUN_PAGE_TOOL_ID` | Object | `packages/fluxiq/src/programs/automation-studio/runtime/flow-draft/dry-run.ts` | The entry the page a replay broke on is shown under, beside the verdict. |
| `AUTOMATION_STUDIO_FLOW_DRAFT_DRY_RUN_TOOL_ID` | Object | `packages/fluxiq/src/programs/automation-studio/runtime/flow-draft/dry-run.ts` | The entry a dry run's verdict is shown to the model under. |
| `AUTOMATION_STUDIO_FLOW_DRAFT_FULL_RUN_REQUIRED_CODE` | Object | `packages/fluxiq/src/programs/automation-studio/runtime/flow-draft/full-run-required.ts` | The issue a completion refused for steps the test cannot run is counted under. |
| `AUTOMATION_STUDIO_FLOW_DRAFT_INPUT_NAME` | Object | `packages/fluxiq/src/programs/automation-studio/runtime/flow-draft/binding-forms.ts` | The name a Flow input may have. |
| `AUTOMATION_STUDIO_FLOW_DRAFT_REPLACED_ATTEMPT_REASON` | Object | `packages/fluxiq/src/programs/automation-studio/runtime/flow-draft/amendment/replaced-attempt.ts` | The reason an amendment or rerun naming the attempt a rerun replaced is refused under, with `replacedBy` beside it. Borrowed, as the add and keep of a look borrow it (`./apply.ts`): the attempt is out of the Flow, so the borrowed words are true of it, and a dedicated reason is a change of this one constant plus the reason's words wherever the refusal union is exhaustive. |
| `AUTOMATION_STUDIO_FLOW_DRAFT_REPLAY_PRESENT_CODE` | Object | `packages/fluxiq/src/programs/automation-studio/runtime/flow-draft/verify-only.ts` | The code a host answers a check with when the step's effect is already in place and nothing was run. |
| `AUTOMATION_STUDIO_FLOW_DRAFT_REPLAY_REANCHORED_CODE` | Object | `packages/fluxiq/src/programs/automation-studio/runtime/flow-draft/site-memory.ts` | The code Core records on a step it looked for on another page first and asked again on its own. |
| `AUTOMATION_STUDIO_FLOW_DRAFT_REPLAY_REMEMBERED_CODE` | Object | `packages/fluxiq/src/programs/automation-studio/runtime/flow-draft/site-memory.ts` | The code a host answers a replayed step with when its target is gone from the page it acted on. |
| `AUTOMATION_STUDIO_FLOW_DRAFT_REPLAY_STATUSES` | Object | `packages/fluxiq/src/programs/automation-studio/runtime/flow-draft/dry-run.ts` | How one step of the draft answered when it was run again. |
| `AUTOMATION_STUDIO_FLOW_DRAFT_REPLAY_VERIFIED_CODE` | Object | `packages/fluxiq/src/programs/automation-studio/runtime/flow-draft/verify-only.ts` | The code a host answers a check with when the step could run now and was not run. |
| `AUTOMATION_STUDIO_FLOW_DRAFT_ROUTE_PLACE_VALUE` | Object | `packages/fluxiq/src/programs/automation-studio/runtime/flow-draft/route-places/place-value.ts` | What a model may write as `place` (D phase 2): the places on the route the person named that one step is on, by the draft's ids for them (`r1`, `r2` ... in the route's order), comma-separated with no space, or `none` to say the step is on none. A route has at most 20 places (`../../action-permissions/instruction-route/schema.ts`). |
| `AUTOMATION_STUDIO_FLOW_DRAFT_ROUTING_KINDS` | Object | `packages/fluxiq/src/programs/automation-studio/runtime/flow-draft/routing.ts` | Every statement a step may carry about when it runs. |
| `AUTOMATION_STUDIO_FLOW_DRAFT_ROW_FIELD` | Object | `packages/fluxiq/src/programs/automation-studio/runtime/flow-draft/binding-forms.ts` | The name a row's field may have: one path segment. |
| `AUTOMATION_STUDIO_FLOW_DRAFT_STEP_OUTPUT_ROOT` | Object | `packages/fluxiq/src/programs/automation-studio/runtime/flow-draft/binding-forms.ts` | The first segment of the path an earlier step's output is stored under, until assembly names the node: `$step.<step id>.<output>[.<field>]`. |
| `AUTOMATION_STUDIO_FLOW_DRAFT_TOOL_ID` | Object | `packages/fluxiq/src/programs/automation-studio/runtime/flow-draft/entry.ts` | The entry the draft is shown under. |
| `AUTOMATION_STUDIO_FLOW_FIRST_SCHEMA_VERSION` | Object | `packages/fluxiq/src/programs/automation-studio/model/legacy-retirement.ts` | - |
| `AUTOMATION_STUDIO_FLOW_REPRESENTATION_VERSION` | Object | `packages/fluxiq/src/programs/automation-studio/model/flows.ts` | - |
| `AUTOMATION_STUDIO_FLOW_SCRIPT_ACT_EXAMPLE` | Object | `packages/fluxiq/src/programs/automation-studio/runtime/flow-bootstrap/plan/flow-script-format.ts` | How a candidate sets a choice and marks a step only sometimes needed, then the act-on-one-item example, shown after the format wherever candidate mode shows it (`../candidate/authoring-loop.ts`). Kept beside the format rather than in it, so the legacy completion schema the default build sends stays byte for byte what the live baseline ran with. Every line of the example is the grammar `../authoring/parse.ts` reads, and its optional step assembles into the optional shape the runtime skips when the banner is absent (`../authoring/assemble.ts`). |
| `AUTOMATION_STUDIO_FLOW_SCRIPT_FORMAT` | Object | `packages/fluxiq/src/programs/automation-studio/runtime/flow-bootstrap/plan/flow-script-format.ts` | - |
| `AUTOMATION_STUDIO_FLOW_SCRIPT_LOOP_FORMAT` | Object | `packages/fluxiq/src/programs/automation-studio/runtime/flow-bootstrap/plan/flow-script-format.ts` | How a candidate repeats a span and binds a value, with an example of each loop (t346): reading every page of a list and processing the rows at the end of the run (lane C's shape), and acting on each row a listing kept (lane D's). Candidate-only, beside the act example and for the same reason: the legacy completion schema carries `AUTOMATION_STUDIO_FLOW_SCRIPT_FORMAT` and stays byte for byte what the baseline ran with. Every line is the grammar `../authoring/parse.ts` reads and every loop the one a drafted repeat becomes (`../authoring/draft-routing.ts`), so the examples build the graph shape the legacy path builds for the same loop. |
| `AUTOMATION_STUDIO_FLOW_SIZE_SETTING` | Object | `packages/fluxiq/src/programs/automation-studio/model/flow-size/flow-size-settings.ts` | The setting's identity, default and range, as every reader and the web panel name it. |
| `AUTOMATION_STUDIO_FLOW_START_LOCATION_MAX_LENGTH` | Object | `packages/fluxiq/src/programs/automation-studio/runtime/flow-bootstrap/start-location.ts` | The longest a start location may be. Chosen for a URL with a long path and query, which is the longest spelling any bound domain uses today, and bounded at all because the value reaches a provider's prompt. |
| `AUTOMATION_STUDIO_FLOW_VERSIONS_METADATA_KEY` | Object | `packages/fluxiq/src/programs/automation-studio/runtime/flow-version/contracts.ts` | The metadata key a run's version set is written under, on the session and on the run detail. |
| `AUTOMATION_STUDIO_GRAPH_PARTITION_SIZE` | Object | `packages/fluxiq/src/programs/automation-studio/storage/project/graph-store.ts` | - |
| `AUTOMATION_STUDIO_GRAPH_VIEWPORT_NODE_LIMIT` | Object | `packages/fluxiq/src/programs/automation-studio/storage/project/graph-store.ts` | - |
| `AUTOMATION_STUDIO_HARNESS_OPTION_LIMIT` | Object | `packages/fluxiq/src/programs/automation-studio/runtime/llm/harness-options/option.ts` | Maximum options one registry may hold, matching the evidence loop's own ceiling on the tool list it will accept. |
| `AUTOMATION_STUDIO_HIERARCHY_ROOT_PARENT_CACHE_ID` | Object | `packages/fluxiq/src/programs/automation-studio/storage/project/hierarchy/mutations.ts` | - |
| `AUTOMATION_STUDIO_IMPORTER_SDK_VERSION` | Object | `packages/fluxiq/src/programs/automation-studio/nodes/importer-sdk.ts` | - |
| `AUTOMATION_STUDIO_INSTRUCTED_ACT_CONSEQUENCE_INSTRUCTION` | Object | `packages/fluxiq/src/programs/automation-studio/runtime/flow-bootstrap/instructed-acts/check.ts` | Said only when an act's verb names a class a person is asked about and no step of it declared that class. |
| `AUTOMATION_STUDIO_INSTRUCTED_ACT_DONE_WORDS` | Object | `packages/fluxiq/src/programs/automation-studio/runtime/flow-bootstrap/instructed-acts/kind-words.ts` | Per kind, the words a page states once the act is done, on a line that appeared or now reads so (see above). |
| `AUTOMATION_STUDIO_INSTRUCTED_ACT_KIND_WORDS` | Object | `packages/fluxiq/src/programs/automation-studio/runtime/flow-bootstrap/instructed-acts/kind-words.ts` | The shared vocabulary for an act's kind, used by claim matching and advisory control feedback. |
| `AUTOMATION_STUDIO_INSTRUCTED_ACT_MISSING_ISSUE_CODE` | Object | `packages/fluxiq/src/programs/automation-studio/runtime/flow-bootstrap/instructed-acts/check.ts` | The issue a missing act refuses completion under. |
| `AUTOMATION_STUDIO_INSTRUCTED_ACT_OPTIONAL_ISSUE_CODE` | Object | `packages/fluxiq/src/programs/automation-studio/runtime/flow-bootstrap/instructed-acts/optional-only.ts` | The issue an act whose only step may be skipped is answered under. |
| `AUTOMATION_STUDIO_INSTRUCTED_ACT_OPTIONAL_ONLY_INSTRUCTION` | Object | `packages/fluxiq/src/programs/automation-studio/runtime/flow-bootstrap/instructed-acts/optional-only.ts` | What the model is told about such an act, after the opening sentence of a refusal. |
| `AUTOMATION_STUDIO_INSTRUCTED_ACT_PLACE_WORDS` | Object | `packages/fluxiq/src/programs/automation-studio/runtime/flow-bootstrap/instructed-acts/kind-words.ts` | Per kind, the places whose count rising shows the act was done (see above). |
| `AUTOMATION_STUDIO_INSTRUCTED_ACTS_INSTRUCTION` | Object | `packages/fluxiq/src/programs/automation-studio/runtime/flow-bootstrap/instructed-acts/check.ts` | What a refusal over the acts is told first; `./permission.ts` says it too. |
| `AUTOMATION_STUDIO_INSTRUCTED_CONSEQUENCES_SCHEMA` | Object | `packages/fluxiq/src/programs/automation-studio/runtime/action-permissions/instructed.ts` | What the model is asked, as the completion it must return. The descriptions carry the question; the class descriptions are where "schedule a post" becomes both a new thing and a published one, so an instructed schedule is not asked about again. Leaving that to the class descriptions alone did not work. Live (`run-mud7fssy-902f877b`), the instruction "Schedule a post to the Northwind Trails account ... saying: Trail clean-up on Saturday" was read as asking for `send_or_publish` and nothing else, so when the build reached for the control it had read as `create_new` the run stopped to ask the person for a class their own instruction plainly asks for. Both descriptions list "schedule"; the model still answered with the closest single class. So the question now says, in the field the answer is given in, that one act often asks for several -- which is where a model reading "one entry for each" looks. |
| `AUTOMATION_STUDIO_INSTRUCTION_ROUTE_MAX_WAYPOINTS` | Object | `packages/fluxiq/src/programs/automation-studio/runtime/action-permissions/instruction-route/schema.ts` | The most places one named route may list. More is not shortened: it is unavailable. |
| `AUTOMATION_STUDIO_INSTRUCTION_ROUTE_SCHEMA` | Object | `packages/fluxiq/src/programs/automation-studio/runtime/action-permissions/instruction-route/schema.ts` | - |
| `AUTOMATION_STUDIO_INTERVENTION_MODE_VERSION` | Object | `packages/fluxiq/src/programs/automation-studio/model/flows.ts` | - |
| `AUTOMATION_STUDIO_JUDGED_PROMOTION_APPLY_AT` | Object | `packages/fluxiq/src/programs/automation-studio/runtime/durable-behavior/judged-decision.ts` | What a deferred promotion decision waits for, as its `applyAt`. |
| `AUTOMATION_STUDIO_LADDER_RUNG_KINDS` | Object | `packages/fluxiq/src/programs/automation-studio/runtime/executor/contracts.ts` | The rungs the executor runs itself, in ladder order. |
| `AUTOMATION_STUDIO_LEGACY_REPAIR_ENDPOINTS` | Object | `packages/fluxiq/src/programs/automation-studio/storage/project/migration-cutover.ts` | - |
| `AUTOMATION_STUDIO_LEGACY_RESOURCE_KINDS` | Object | `packages/fluxiq/src/programs/automation-studio/storage/project/migration-cutover.ts` | - |
| `AUTOMATION_STUDIO_LLM_ABSOLUTE_MAX_ESTIMATED_COST_USD` | Object | `packages/fluxiq/src/programs/automation-studio/runtime/llm/harness/token-limits.ts` | - |
| `AUTOMATION_STUDIO_LLM_ABSOLUTE_MAX_TOTAL_TOKENS_PER_REQUEST` | Object | `packages/fluxiq/src/programs/automation-studio/runtime/llm/harness/token-limits.ts` | The most a single request may carry: the model's context window. Derived, never restated: the largest `contextTokens` in `AUTOMATION_STUDIO_DEEPSEEK_MODEL_LIMITS` (1,000,000 for both models today). It was Core's own ceiling of 64,000 (and 50,000 before that), set as a budget decision; with whole-page evidence that ceiling hid the page from the model, and the standing decision of 2026-09-30 is that the only limit on a request is the model's window. A request over it is refused before it is sent, with its measured size (`./run.ts`, `../deepseek/provider.ts`), and is never trimmed to fit. Spend is not bounded here. The run cost ceiling (`AUTOMATION_STUDIO_LLM_RUN_COST_CEILING_USD`, $0.10 unless FLUXIQ_LLM_RUN_COST_CEILING_USD says otherwise) and the per-call cost check derived from it (`../flow-execution-limits/`) are what stop a build spending. Every other per-request ceiling reads this: the API handler's Flow-settings bound, the provider's pre-flight, the session-key profile and the web app's Flow settings form. |
| `AUTOMATION_STUDIO_LLM_BUILD_CALL_LIMIT_ENV` | Object | `packages/fluxiq/src/programs/automation-studio/model/build-call-limit/env.ts` | - |
| `AUTOMATION_STUDIO_LLM_BUILD_CALL_LIMIT_SCOPE_ENV` | Object | `packages/fluxiq/src/programs/automation-studio/model/build-call-limit/scope-env.ts` | - |
| `AUTOMATION_STUDIO_LLM_DEFAULT_MAX_ESTIMATED_COST_USD` | Object | `packages/fluxiq/src/programs/automation-studio/runtime/llm/harness/token-limits.ts` | - |
| `AUTOMATION_STUDIO_LLM_DEFAULT_MODEL_ENV` | Object | `packages/fluxiq/src/programs/automation-studio/runtime/llm/deepseek/models.ts` | The environment variable that sets Core's default DeepSeek model. |
| `AUTOMATION_STUDIO_LLM_DEFAULT_REPLY_TOKENS` | Object | `packages/fluxiq/src/programs/automation-studio/runtime/llm/harness/token-limits.ts` | What one call sets aside for the model's reply in its context-window check when its caller names no output limit: 8,000 tokens, the reply reserve the live session-key profile has used since the window became the request bound (`../session-key-provider.ts`). It is never sent as a cap (t254). |
| `AUTOMATION_STUDIO_LLM_DEFAULT_TIMEOUT_MS` | Object | `packages/fluxiq/src/programs/automation-studio/runtime/llm/provider-contract.ts` | - |
| `AUTOMATION_STUDIO_LLM_DEFAULT_TOKEN_LIMITS` | Object | `packages/fluxiq/src/programs/automation-studio/runtime/llm/harness/token-limits.ts` | One call's limits when the caller names none: the model's context window, with the reply reserve taken out of it for the reply and the rest the input's. Until 2026-09-30 these were 8,000 input, 2,000 output and 10,000 total tokens, so a call through a resolver that named no limits was refused at 8,000 input tokens -- far below a whole page. The user's order that day leaves the window as the only bound on a request, so the defaults are the window: 992,000 input, 8,000 output and 1,000,000 total for DeepSeek today. A limit a caller names still binds, and the missing ones are derived from it: an output limit with no input limit leaves the input the window less that output, and a total limit with neither leaves the input the total less the reply reserve. |
| `AUTOMATION_STUDIO_LLM_DESCRIBE_NODES_TOOL_ID` | Object | `packages/fluxiq/src/programs/automation-studio/runtime/llm/node-tools/describe-nodes.ts` | The option that describes nodes. |
| `AUTOMATION_STUDIO_LLM_DESCRIBED_NODES_KEY` | Object | `packages/fluxiq/src/programs/automation-studio/runtime/llm/node-tools/described-nodes-key.ts` | The key a call's result names the nodes it newly described under; on the wire it holds their definitions. |
| `AUTOMATION_STUDIO_LLM_DIAGNOSIS_TEXT_MAX_LENGTH` | Object | `packages/fluxiq/src/programs/automation-studio/runtime/llm/harness/structured-response.ts` | The bound on each description the model may supply. It is the same 500 characters the runtime's reader holds the field to, stated here as well because the two checks answer different questions: this one refuses the response at the boundary, and the reader's records a refusal on the run. A reader that is the only bound would accept an oversized field into the process first. |
| `AUTOMATION_STUDIO_LLM_DOMAIN_SYSTEM_INSTRUCTIONS_MAX_LENGTH` | Object | `packages/fluxiq/src/programs/automation-studio/runtime/llm/domain-instructions/max-length.ts` | The most a domain's system instructions may run to, in UTF-16 code units. They are sent with every request a domain's build makes, in the system message every call repeats, so they are paid for on every call: a bound that keeps them to a page of rules, not a second prompt. |
| `AUTOMATION_STUDIO_LLM_DRAFT_WITHHELD_NOTE` | Object | `packages/fluxiq/src/programs/automation-studio/runtime/llm/harness/draft-screen.ts` | The note a screened draft carries, so the model knows a value exists and is not shown. |
| `AUTOMATION_STUDIO_LLM_EVIDENCE_AMENDMENT_FEEDBACK_TOOL_ID` | Object | `packages/fluxiq/src/programs/automation-studio/runtime/llm/draft-amendment-feedback.ts` | The evidence entry a refused amendment's feedback arrives under. |
| `AUTOMATION_STUDIO_LLM_EVIDENCE_BUDGET_TOOL_ID` | Object | `packages/fluxiq/src/programs/automation-studio/runtime/llm/loop-budget.ts` | The evidence entry the remaining budget is shown under. |
| `AUTOMATION_STUDIO_LLM_EVIDENCE_CHECKED_ROWS_NOW_KEY` | Object | `packages/fluxiq/src/programs/automation-studio/runtime/llm/node-tools/rerun-checked-rows.ts` | The member of a rerun's answer that says which named rows it keeps now. |
| `AUTOMATION_STUDIO_LLM_EVIDENCE_COMPLETION_FEEDBACK_TOOL_ID` | Object | `packages/fluxiq/src/programs/automation-studio/runtime/llm/evidence-loop/completion-check.ts` | The evidence entry a refused completion's feedback arrives under. |
| `AUTOMATION_STUDIO_LLM_EVIDENCE_DECISION_FEEDBACK_TOOL_ID` | Object | `packages/fluxiq/src/programs/automation-studio/runtime/llm/unusable-decision.ts` | The evidence entry an unusable decision's feedback arrives under. |
| `AUTOMATION_STUDIO_LLM_EVIDENCE_DECISION_INSTRUCTION` | Object | `packages/fluxiq/src/programs/automation-studio/runtime/llm/evidence-loop-decision.ts` | Provider-neutral decision policy for bounded evidence loops. Provider adapters should include this policy in their structured-decision instruction. The last two sentences were added after a live creation campaign in which every built Flow only read and none acted. The policy already said, rightly, never to mutate merely to perform a step that belongs in the generated result; nothing said the converse, that a refusal here is not a refusal there. Offered only tools that decline to act, and refused when it asked one to, the model read the whole exercise as "acting is unavailable" and wrote the only shape it had seen accepted. The "unless the result is a Flow built from the steps you run" clause was added 2026-09-30 (lane t195). A draft is the steps the build ran, so "never mutate to perform a workflow step" told a drafting model not to build its Flow, and "never repeat a successful mutation" read as "act on one row only": live run `run-munnop9n-5475d593` pressed one Confirm of four and never said repeat. t252 (user, 2026-10-02: "if the task is repetitive, it should be smart and make a flow that loops, takes params"): "run each step it needs once and add it" read as "a step must be run to be in the Flow", so repetitive work was performed item by item. The clause now says to run to learn, that a step may be written once what was seen is enough, that repetitive work is a loop, and that a value that changes is bound. Live run `run-mustzxhi-2e2cda87` read "a value that changes ... is bound" as covering a press's target and tried to bind one about 12 times: what is bound is a value a step typed, or a read's condition, and a press's control or option never is. |
| `AUTOMATION_STUDIO_LLM_EVIDENCE_HISTORY_TOOL_ID` | Object | `packages/fluxiq/src/programs/automation-studio/runtime/llm/decision-context/history-tool-id.ts` | The entry a decision's history is shown under. It replaces the call list the context window used to publish under the same id, which listed only tool calls and none of Core's answers to a decision, and is re-exported from `../evidence-loop.ts` under the name it always had. |
| `AUTOMATION_STUDIO_LLM_EVIDENCE_LOOP_DEFAULT_MAX_STEPS_WITHOUT_PROGRESS` | Object | `packages/fluxiq/src/programs/automation-studio/runtime/loop-limits/evidence-loop.ts` | The far backstop on steps in a row that give the loop nothing new, held in `runtime/loop-limits/` with the other numbers two directories read, and re-exported here so the loop's public surface names it. |
| `AUTOMATION_STUDIO_LLM_EVIDENCE_LOOP_DEFAULT_MAX_UNREADABLE_REPLIES_IN_A_ROW` | Object | `packages/fluxiq/src/programs/automation-studio/runtime/llm/unreadable-reply.ts` | Unreadable replies in a row after which a loop that asks again stops. The live record has runs of up to four followed by a good reply, so this leaves room past that; the budget binds underneath it either way. |
| `AUTOMATION_STUDIO_LLM_EVIDENCE_LOOP_DEFAULT_MAX_UNUSABLE_DECISIONS_IN_A_ROW` | Object | `packages/fluxiq/src/programs/automation-studio/runtime/llm/evidence-loop.ts` | Unusable decisions in a row, however much their issues differ, after which a loop that asks again stops: the far backstop under the no-progress guard. A model fixing one mistake at a time is progress, so this is set well past the handful of refusals a real correction takes; the cost, token and deadline guards still bind underneath it. Held to the loop's own iterations. |
| `AUTOMATION_STUDIO_LLM_EVIDENCE_LOOP_LIMITS` | Object | `packages/fluxiq/src/programs/automation-studio/runtime/loop-limits/evidence-loop.ts` | - |
| `AUTOMATION_STUDIO_LLM_EVIDENCE_LOOP_MAX_PROVIDER_UNANSWERED_IN_A_ROW` | Object | `packages/fluxiq/src/programs/automation-studio/runtime/llm/unanswered-calls.ts` | Unanswered decision calls in a row after which the loop ends. |
| `AUTOMATION_STUDIO_LLM_EVIDENCE_RECALL_DESCRIPTION` | Object | `packages/fluxiq/src/programs/automation-studio/runtime/llm/evidence-recall/description.ts` | - |
| `AUTOMATION_STUDIO_LLM_EVIDENCE_RECALL_TOOL_ID` | Object | `packages/fluxiq/src/programs/automation-studio/runtime/llm/evidence-recall/tool-id.ts` | `core.recall_result`: one earlier result's held views, whole (`./binding.ts`). |
| `AUTOMATION_STUDIO_LLM_MAX_TIMEOUT_MS` | Object | `packages/fluxiq/src/programs/automation-studio/runtime/llm/provider-contract.ts` | - |
| `AUTOMATION_STUDIO_LLM_PROMPT_VERSIONS` | Object | `packages/fluxiq/src/programs/automation-studio/runtime/llm/harness/task-kind.ts` | - |
| `AUTOMATION_STUDIO_LLM_PROVIDER_CALL_ERROR_CODES` | Object | `packages/fluxiq/src/programs/automation-studio/runtime/llm/provider-contract.ts` | Every way a provider call fails once it is under way: resolving the credential, the transport, and the reply. Listed as values, beside the pre-flight list, so a table keyed by every code can be checked against the whole vocabulary at run time as well as by the type. |
| `AUTOMATION_STUDIO_LLM_PROVIDER_FAILURE_DISPOSITIONS` | Object | `packages/fluxiq/src/programs/automation-studio/runtime/llm/failure-disposition.ts` | Every provider failure code, and what it means for the model's next call. The pre-flight refusals all end the model's calls: a request Core refused to build or send will be refused identically next time, so retrying it only spends reveals, and one of them -- a credential found in the outbound body -- is an exfiltration signal in its own right. |
| `AUTOMATION_STUDIO_LLM_PROVIDER_PREFLIGHT_ERROR_CODES` | Object | `packages/fluxiq/src/programs/automation-studio/runtime/llm/provider-contract.ts` | Every way a provider refuses a request before sending it, one code per check. These were all `llm.provider_configuration_invalid`, and a run records codes, never messages, so a refusal said only that *something* local was wrong. That hid a stale field list in the DeepSeek adapter through every live recovery: each one made a call that was refused before it left the process, and the record could not say which check had refused it. A code names the check; the message stays out of the record. |
| `AUTOMATION_STUDIO_LLM_PROVIDER_REFUSAL_LIMITS` | Object | `packages/fluxiq/src/programs/automation-studio/runtime/provider-refusal/record.ts` | Every bound a refusal record must satisfy to be carried. A record outside them is not truncated into shape silently: either the field is dropped and named in `withheld`, or -- where the bound says the record is not one of ours at all -- the whole record is refused. |
| `AUTOMATION_STUDIO_LLM_PROVIDER_RETRY_LIMITS` | Object | `packages/fluxiq/src/programs/automation-studio/runtime/llm/provider-retry/limits.ts` | - |
| `AUTOMATION_STUDIO_LLM_PROVIDER_THROW_LIMITS` | Object | `packages/fluxiq/src/programs/automation-studio/runtime/llm/throw-account/read.ts` | The bounds a published throw is held to, written out again by the flow-bootstrap reader. |
| `AUTOMATION_STUDIO_LLM_REQUEST_REFUSAL_CODES` | Object | `packages/fluxiq/src/programs/automation-studio/runtime/llm/harness/request-refusal.ts` | Every guard that can refuse to build a model request, one code each. |
| `AUTOMATION_STUDIO_LLM_RUN_CALL_BACKSTOP` | Object | `packages/fluxiq/src/programs/automation-studio/runtime/llm/run-budget.ts` | The most provider calls one run may make when nobody says otherwise. A runaway backstop, not a working limit. What bounds a run is its estimated cost ceiling, its token budget, the recovery's wall clock, and the exploration's no-progress guard; a run that is still getting somewhere and still has money, tokens and time is meant to keep going. This number exists for the case none of those catch -- a loop that makes free, instant, ever different calls forever -- and it is set where a working loop never meets it. It is deliberately not a per-mode constant. A host or a setting that wants to allow fewer calls says so through `maxCallsPerRun`; nothing here infers a count from what kind of run it is. |
| `AUTOMATION_STUDIO_LLM_RUN_CALL_RECORD_LIMIT` | Object | `packages/fluxiq/src/programs/automation-studio/runtime/llm/run-budget.ts` | The most calls one run's receipt itemizes. Equal to the backstop, so a run under the default backstop is itemized in full; a host that raises its own call count past it gets the first this many, and the receipt says how many it left out rather than ending short without saying so. |
| `AUTOMATION_STUDIO_LLM_RUN_COST_CEILING_DEFAULT_USD` | Object | `packages/fluxiq/src/programs/automation-studio/model/run-cost-ceiling/run-cost-ceiling-env.ts` | - |
| `AUTOMATION_STUDIO_LLM_RUN_COST_CEILING_ENV` | Object | `packages/fluxiq/src/programs/automation-studio/model/run-cost-ceiling/run-cost-ceiling-env.ts` | - |
| `AUTOMATION_STUDIO_LLM_RUN_COST_CEILING_MAX_USD` | Object | `packages/fluxiq/src/programs/automation-studio/model/run-cost-ceiling/run-cost-ceiling-env.ts` | - |
| `AUTOMATION_STUDIO_LLM_RUN_COST_CEILING_SCOPE_ENV` | Object | `packages/fluxiq/src/programs/automation-studio/model/run-cost-ceiling/run-cost-ceiling-env.ts` | - |
| `AUTOMATION_STUDIO_LLM_RUN_COST_CEILING_USD` | Object | `packages/fluxiq/src/programs/automation-studio/runtime/llm/flow-execution-limits/run-cost-ceiling.ts` | Default purse; user-specified policies may replace the ordinary default. |
| `AUTOMATION_STUDIO_LLM_RUN_FLOW_TOOL_ID` | Object | `packages/fluxiq/src/programs/automation-studio/runtime/llm/node-tools/run-flow.ts` | The tool that runs part of the Flow. |
| `AUTOMATION_STUDIO_LLM_RUN_NODE_TOOL_ID` | Object | `packages/fluxiq/src/programs/automation-studio/runtime/llm/node-tools/run-node.ts` | The one verb that runs a node from the library. |
| `AUTOMATION_STUDIO_LLM_STEP_LOG_ANSWER_REWRITE` | Object | `packages/fluxiq/src/programs/automation-studio/runtime/llm/step-log/answer-step.ts` | Passed as `told` to write a row already written again as it now stands, telling it nothing new: a row Core corrected after it was recorded (R3-2). A row never written is not written by it. |
| `AUTOMATION_STUDIO_LLM_STEP_LOG_REDACTED` | Object | `packages/fluxiq/src/programs/automation-studio/runtime/llm/step-log/screen.ts` | What a credential-shaped run of text is written as. |
| `AUTOMATION_STUDIO_LLM_TEST_RUN_COST_CEILING_DEFAULT_USD` | Object | `packages/fluxiq/src/programs/automation-studio/model/run-cost-ceiling/run-cost-ceiling-env.ts` | - |
| `AUTOMATION_STUDIO_LOOP_PROTOCOL_INSTRUCTION_ID` | Object | `packages/fluxiq/src/programs/automation-studio/runtime/llm/stages/instructions.ts` | The id of the ordering statement. Reserved: a registration carrying it is refused. |
| `AUTOMATION_STUDIO_LOOP_PROTOCOL_SCOPE_KIND` | Object | `packages/fluxiq/src/programs/automation-studio/runtime/llm/stages/instructions.ts` | The scope name carried by the one instruction that states the order. |
| `AUTOMATION_STUDIO_LOOP_STAGE_INSTRUCTION_LIMIT` | Object | `packages/fluxiq/src/programs/automation-studio/runtime/llm/stages/registry.ts` | Maximum contributions one registry may hold, across every domain and stage. |
| `AUTOMATION_STUDIO_LOOP_STAGE_SCOPE_KIND` | Object | `packages/fluxiq/src/programs/automation-studio/runtime/llm/stages/instructions.ts` | The scope name carried by a stage's own instructions, Core's and a domain's alike. |
| `AUTOMATION_STUDIO_LOOP_STAGES` | Object | `packages/fluxiq/src/programs/automation-studio/runtime/llm/stages/protocol.ts` | The stages, in the only order they may be worked in. Frozen because a consumer holding this array is holding Core's ordering authority; sorting or splicing it in place would rewrite the protocol for everyone in the process. |
| `AUTOMATION_STUDIO_MAX_NODE_RETRY_WAIT_MS` | Object | `packages/fluxiq/src/programs/automation-studio/runtime/executor/defensive/retry-wait.ts` | The longest all the waits at one arrival at one node may add up to. Defaults must not turn a fast failure into a long hang. Without this bound a document could ask for 25 attempts at a minute each and pin a run to one node for half an hour with every check green, which is the shape of a hang, not of a defence. |
| `AUTOMATION_STUDIO_MAX_PAGE_LIMIT` | Object | `packages/fluxiq/src/programs/automation-studio/storage/paging.ts` | - |
| `AUTOMATION_STUDIO_MAX_RETRY_HINT_MS` | Object | `packages/fluxiq/src/programs/automation-studio/runtime/executor/defensive/retry-hint.ts` | The longest wait the runtime will take from a source's own hint. A service that asks for an hour is asking for something a run cannot give: the person is waiting, and a Flow that sleeps for an hour is indistinguishable from one that hung. The hint is honoured up to this bound and clamped past it, because clamping keeps the cooperative behaviour -- waiting longer than the backoff table would -- without handing a remote service control of the run's clock. |
| `AUTOMATION_STUDIO_MAX_RETRY_WAIT_MS` | Object | `packages/fluxiq/src/programs/automation-studio/runtime/executor/defensive/retry-wait.ts` | The longest one wait between two attempts of the same node. It matches the recorded-readiness ceiling on purpose: 30 s is the longest this runtime ever holds a run up for one thing, and a second number would be a second answer to the same question. |
| `AUTOMATION_STUDIO_MAX_RUN_RETRY_WAIT_MS` | Object | `packages/fluxiq/src/programs/automation-studio/runtime/executor/defensive/retry-wait.ts` | The longest all the waits in one run may add up to. The per-node bound alone is not a bound on the run: a Flow may arrive at hundreds of nodes, and the product of the two is hours. Past this figure the default policy stops absorbing faults by waiting -- the ladder keeps every other rung, and the Flow keeps its own authored error handling -- so a run that is failing everywhere fails in bounded time instead of grinding. |
| `AUTOMATION_STUDIO_NAME_MATCH_SCORE_FLOOR` | Object | `packages/fluxiq/src/programs/automation-studio/nodes/name-match/score-floor.ts` | The lowest `nearest` score that is still returned. Below it the answer is `undefined`: a name nobody wrote a near version of must stay an honest failure, or a correction becomes noise. Why 0.25. Measured over the real web and built-in node ids (`web.output.dom-*`, `builtin.*`) against 24 written names a model plausibly produces, the scores fall into two bands with a wide gap: - every name that should resolve scored 0.64 or better — `navigate` -> `web.output.browser-navigate` 0.64, `compare` -> `builtin.logic.compare` 0.68, `for_each` -> `builtin.control.for-each` 0.73, `filterList` -> `builtin.data.filter-list` 0.77, `dom-extract-list` -> `web.output.dom-extract_list` 0.82; - every name genuinely absent from the set scored 0.083 or worse — `upload-file` 0.083, `sendEmail` 0.070, `screenshot` 0.065, `http.request` 0.065, `banana` 0.045, `sleep` 0.036. The only case in between was `click-element` -> `web.output.dom-click` at 0.34: a name that shares the intent word and nothing else. That one should resolve, because a wrong correction is visible in the run and repairable, while a refusal costs a paid provider call the evidence says the model does not act on — run `run-mug776kx-0214b287` was refused the same way fourteen times and never corrected itself. So the floor sits inside the measured gap, nearer the absent band, admitting the 0.34 guess and rejecting the 0.083 one. Why it has not moved, and why it is not the answer to a name that misses. Names that plainly should resolve have twice been measured falling below it — short column words against long detected names, `url` at 0.042 and `prce` at 0.077 — and both times the *measure* was answering the wrong question rather than the bar being set too high. Lowering the floor far enough to admit them would have admitted `banana` (0.042) and `sponsored` (0.068) in the same movement, which is the opposite of resolving a name: it makes every refusal arbitrary. They were fixed where the score is computed (`./token-credit.ts`) and now land at 0.497 and 0.597, inside the band this floor was measured to accept. That they land there is the evidence that the measure and not the bar was at fault. |
| `AUTOMATION_STUDIO_NO_REPAIR_REASONS` | Object | `packages/fluxiq/src/programs/automation-studio/runtime/llm/harness/structured-response.ts` | Why there is nothing to repair, in the five ways a page says no. A model asked for a runtime patch had no way to answer "there is no repair": on a `diagnose_and_adapt` run the schema was one target override with at least one handle and no other shape, so the only schema-valid answer was a control -- and in the live repair campaign of 2026-09-17 every refusal task came back with one that was merely pressable. This is the answer that was missing. It is a closed list because a reason a run records is read by a person and matched on by the Lab, and free prose is neither. It is deliberately not the target-override refusal vocabulary (`runtime/live-patch/refusal-reasons.ts`): those words say why a domain refused a target the model proposed, and these say why the model proposed none. A refusal Core reached and a refusal the model reached are different facts about a run. |
| `AUTOMATION_STUDIO_NODE_ADAPTATION_IDS_LIMIT` | Object | `packages/fluxiq/src/programs/automation-studio/runtime/flow-change/node-adaptation/contracts.ts` | A node lists at most this many adaptation ids; a longer stored list is malformed, not truncated. |
| `AUTOMATION_STUDIO_NODE_ADAPTATION_IDS_METADATA_KEY` | Object | `packages/fluxiq/src/programs/automation-studio/runtime/flow-change/node-adaptation/contracts.ts` | The node-metadata key under which every change that writes or creates a node lists its adaptation id. |
| `AUTOMATION_STUDIO_NODE_OUTPUTS_KEY` | Object | `packages/fluxiq/src/programs/automation-studio/runtime/llm/node-tools/replay.ts` | The execution result member a node's output values travel in: carried, never shown. |
| `AUTOMATION_STUDIO_NODE_REPLAY_ITEM_KEY` | Object | `packages/fluxiq/src/programs/automation-studio/runtime/llm/node-tools/replay.ts` | The key a test pass's row travels under: the name a For Each pass's row has in run state. |
| `AUTOMATION_STUDIO_NODE_REPLAY_KEY` | Object | `packages/fluxiq/src/programs/automation-studio/runtime/llm/node-tools/replay.ts` | The key a replay call carries, which no ordinary call of any tool may use. |
| `AUTOMATION_STUDIO_NODE_REPLAY_KINDS` | Object | `packages/fluxiq/src/programs/automation-studio/runtime/llm/node-tools/replay.ts` | What one replay call asks for. |
| `AUTOMATION_STUDIO_NODE_REPLAY_RESULT_CODES` | Object | `packages/fluxiq/src/programs/automation-studio/runtime/llm/node-tools/replay.ts` | The only codes a replay may answer with, and what each one means. |
| `AUTOMATION_STUDIO_NODE_RERUN_PLACE_UNREACHABLE_CODE` | Object | `packages/fluxiq/src/programs/automation-studio/runtime/llm/node-tools/step-place.ts` | The result code of a rerun that ran nothing, because its step's place could not be put back. |
| `AUTOMATION_STUDIO_NODE_VERIFIES_STATE_METADATA_KEY` | Object | `packages/fluxiq/src/programs/automation-studio/runtime/flow-change/contracts.ts` | The node-definition metadata key a verification verb sets to `true`, so its success counts as a downstream assertion. |
| `AUTOMATION_STUDIO_NODE_WRITE_KEY` | Object | `packages/fluxiq/src/programs/automation-studio/runtime/llm/node-tools/replay.ts` | The key that asks for a step to be written rather than run (`./run-node.ts`). |
| `AUTOMATION_STUDIO_NODE_WRITTEN_CODE` | Object | `packages/fluxiq/src/programs/automation-studio/runtime/llm/node-tools/replay.ts` | The code a host answers a written step with: checked, frozen and not done. Not a replay code: a replay answered with it did not run, so `automationStudioNodeReplayStatus` reads it as `failed`. |
| `AUTOMATION_STUDIO_NORMAL_EDITOR_GRAPH_WRITE_ENDPOINT` | Object | `packages/fluxiq/src/programs/automation-studio/api/contracts/endpoints.ts` | - |
| `AUTOMATION_STUDIO_OBJECT_THRESHOLD_BYTES` | Object | `packages/fluxiq/src/programs/automation-studio/storage/object-store.ts` | - |
| `AUTOMATION_STUDIO_PAGE_CURSOR_VERSION` | Object | `packages/fluxiq/src/programs/automation-studio/storage/paging.ts` | - |
| `AUTOMATION_STUDIO_PAIRED_CLIENT_SESSION_PREFIX` | Object | `packages/fluxiq/src/programs/automation-studio/runtime/conversations/commands/caller.ts` | The session prefix a paired client's actor carries. |
| `AUTOMATION_STUDIO_PANEL_CAPABILITY_ATTACHMENT` | Object | `packages/fluxiq/src/programs/automation-studio/runtime/conversations/instructions/respond.ts` | The attachment kind that carries an invocation waiting on the person's confirmation. |
| `AUTOMATION_STUDIO_PANEL_CAPABILITY_MAX` | Object | `packages/fluxiq/src/programs/automation-studio/runtime/panel-capabilities/parse.ts` | The longest vocabulary Core will carry. Well past the panel's 38; a backstop, not a budget. |
| `AUTOMATION_STUDIO_PANEL_CAPABILITY_RESULT_ATTACHMENT` | Object | `packages/fluxiq/src/programs/automation-studio/runtime/conversations/instructions/request.ts` | The attachment kind the panel records what it did under. Read back as the panel speaking, not the person: the panel writes it on the person's behalf through the person's own endpoint, and a model that took "Started the run" as something the person said would misread the thread. |
| `AUTOMATION_STUDIO_PERMISSION_ASK_TIMEOUT_MS` | Object | `packages/fluxiq/src/programs/automation-studio/runtime/parking/permission-ask.ts` | How long any caller waits for an answer, at most. Short on purpose. A waiting caller holds its run, its budget and its own request open, so this is the cost of nobody being there, paid once. A person watching the thread answers in seconds; one who is not never had a build or a repair to rescue. A caller with nobody in front of it passes no timeout and does not wait -- the question is still asked, and the answer releases whatever it comes back to. |
| `AUTOMATION_STUDIO_PERSON_NEEDED_ASK_TIMEOUT_MS` | Object | `packages/fluxiq/src/programs/automation-studio/runtime/parking/person-needed-ask.ts` | How long the work waits for a person, at most. Longer than a permission question's two minutes: a permission is read and answered, a check has to be found in the browser and completed first. |
| `AUTOMATION_STUDIO_PERSON_NEEDED_ASKS_PER_RUN` | Object | `packages/fluxiq/src/programs/automation-studio/runtime/executor/person-needed.ts` | How many times one run asks a person before it stops asking and ends. |
| `AUTOMATION_STUDIO_PERSON_NEEDED_CONTROL_KIND` | Object | `packages/fluxiq/src/programs/automation-studio/runtime/parking/person-needed-ask.ts` | `control.kind` on every person-needed ask, and on nothing else. |
| `AUTOMATION_STUDIO_PERSON_NEEDED_DONE_OPTION` | Object | `packages/fluxiq/src/programs/automation-studio/runtime/parking/person-needed-ask.ts` | The option a person presses once they have completed the check. |
| `AUTOMATION_STUDIO_PERSON_NEEDED_ISSUE_CODES` | Object | `packages/fluxiq/src/programs/automation-studio/runtime/parking/person-needed-tool-calls.ts` | Each ending as the one issue code a build's or a recovery's record carries. |
| `AUTOMATION_STUDIO_PERSON_NEEDED_MAX_ASKS` | Object | `packages/fluxiq/src/programs/automation-studio/runtime/parking/person-needed-tool-calls.ts` | How many times one piece of work may put the question to a person. |
| `AUTOMATION_STUDIO_PERSON_NEEDED_STOP_OPTION` | Object | `packages/fluxiq/src/programs/automation-studio/runtime/parking/person-needed-ask.ts` | The option a person presses to stop the work instead. |
| `AUTOMATION_STUDIO_PERSON_NEEDED_TEXT` | Object | `packages/fluxiq/src/programs/automation-studio/runtime/parking/person-needed-ask.ts` | What the person is asked, in the thread and on the page's overlay. |
| `AUTOMATION_STUDIO_PHASE_12_REQUIRED_DOC_PATHS` | Object | `packages/fluxiq/src/programs/automation-studio/testing/scale-certification.ts` | - |
| `AUTOMATION_STUDIO_PLAN_NODE_HANDLE_KEY` | Object | `packages/fluxiq/src/programs/automation-studio/runtime/llm/harness-options/plan-node-handles.ts` | The key of a handle reference. |
| `AUTOMATION_STUDIO_PLAN_NODE_HANDLE_LOCATION_KEY` | Object | `packages/fluxiq/src/programs/automation-studio/runtime/llm/harness-options/plan-node-handles.ts` | The one other key a handle reference may carry: where the handle was seen. |
| `AUTOMATION_STUDIO_PLAN_PARAMETER_ISSUE_CODES` | Object | `packages/fluxiq/src/programs/automation-studio/runtime/llm/harness-options/plan-parameter-resolution.ts` | Core's own reasons a node's parameters were not accepted. A domain's refusal carries the domain's codes instead. |
| `AUTOMATION_STUDIO_PLAN_STEP_CONSEQUENCES_KEY` | Object | `packages/fluxiq/src/programs/automation-studio/runtime/llm/harness-options/plan-step-consequences.ts` | The field and the step word a consequence declaration is written as, and the word the Flow script format tells the model to write. One spelling, named once, for the node field, the reserved step word and the parameter fallback. |
| `AUTOMATION_STUDIO_PROGRAM` | Object | `packages/fluxiq/src/programs/automation-studio/metadata.ts` | - |
| `AUTOMATION_STUDIO_PROJECT_ADAPTATION_EVIDENCE_MIGRATION` | Object | `packages/fluxiq/src/programs/automation-studio/storage/project/schema/adaptations.ts` | - |
| `AUTOMATION_STUDIO_PROJECT_ADAPTATION_MATCHING_MIGRATION` | Object | `packages/fluxiq/src/programs/automation-studio/storage/project/schema/adaptation-matching.ts` | - |
| `AUTOMATION_STUDIO_PROJECT_ADMINISTRATION_MIGRATIONS` | Object | `packages/fluxiq/src/programs/automation-studio/storage/project/administration.ts` | - |
| `AUTOMATION_STUDIO_PROJECT_COMPILED_RUNTIME_ISOLATION_MIGRATION` | Object | `packages/fluxiq/src/programs/automation-studio/storage/project/schema/compiled-plans.ts` | - |
| `AUTOMATION_STUDIO_PROJECT_CONVERSATION_MIGRATION` | Object | `packages/fluxiq/src/programs/automation-studio/storage/project/schema/conversations.ts` | - |
| `AUTOMATION_STUDIO_PROJECT_DOMAIN_RESOURCE_MIGRATION` | Object | `packages/fluxiq/src/programs/automation-studio/storage/project/schema/domain-resources.ts` | - |
| `AUTOMATION_STUDIO_PROJECT_DOMAIN_TABLES` | Object | `packages/fluxiq/src/programs/automation-studio/storage/project/schema/table-names.ts` | - |
| `AUTOMATION_STUDIO_PROJECT_EVENT_CURSOR_MIGRATION` | Object | `packages/fluxiq/src/programs/automation-studio/storage/project/schema/event-streams.ts` | - |
| `AUTOMATION_STUDIO_PROJECT_FAST_UI_QUERY_INDEX_MIGRATION` | Object | `packages/fluxiq/src/programs/automation-studio/storage/project/schema/ui-query-indexes.ts` | - |
| `AUTOMATION_STUDIO_PROJECT_FLOW_GRAPH_JUDGEMENT_MIGRATION` | Object | `packages/fluxiq/src/programs/automation-studio/storage/project/schema/graph-judgements.ts` | - |
| `AUTOMATION_STUDIO_PROJECT_FLOW_RESOURCE_MIGRATION` | Object | `packages/fluxiq/src/programs/automation-studio/storage/project/flow-resource-repository.ts` | - |
| `AUTOMATION_STUDIO_PROJECT_INTERVENTION_MODE_MIGRATION` | Object | `packages/fluxiq/src/programs/automation-studio/storage/project/schema/flow-settings.ts` | - |
| `AUTOMATION_STUDIO_PROJECT_MIGRATION_CUTOVER_MIGRATION` | Object | `packages/fluxiq/src/programs/automation-studio/storage/project/migration-cutover.ts` | - |
| `AUTOMATION_STUDIO_PROJECT_MUTATION_MIGRATION` | Object | `packages/fluxiq/src/programs/automation-studio/storage/project/schema/mutations.ts` | - |
| `AUTOMATION_STUDIO_PROJECT_MUTATION_TABLES` | Object | `packages/fluxiq/src/programs/automation-studio/storage/project/schema/table-names.ts` | - |
| `AUTOMATION_STUDIO_PROJECT_RELATION_INDEX_MIGRATION` | Object | `packages/fluxiq/src/programs/automation-studio/storage/project/schema/relation-indexes.ts` | - |
| `AUTOMATION_STUDIO_PROJECT_RESULT_CHECK_MIGRATION` | Object | `packages/fluxiq/src/programs/automation-studio/storage/project/schema/result-checks.ts` | - |
| `AUTOMATION_STUDIO_PROJECT_RETENTION_MIGRATION` | Object | `packages/fluxiq/src/programs/automation-studio/storage/project/schema/event-streams.ts` | - |
| `AUTOMATION_STUDIO_PROJECT_REUSABLE_LLM_CONTEXT_AUDIT_MIGRATION` | Object | `packages/fluxiq/src/programs/automation-studio/storage/project/schema/reusable-llm-contexts.ts` | - |
| `AUTOMATION_STUDIO_PROJECT_REUSABLE_LLM_CONTEXT_MIGRATION` | Object | `packages/fluxiq/src/programs/automation-studio/storage/project/schema/reusable-llm-contexts.ts` | - |
| `AUTOMATION_STUDIO_PROJECT_REUSABLE_LLM_CONTEXT_VALIDATION_MIGRATION` | Object | `packages/fluxiq/src/programs/automation-studio/storage/project/schema/reusable-llm-contexts.ts` | - |
| `AUTOMATION_STUDIO_PROJECT_ROUTER_RUNTIME_SCALING_MIGRATION` | Object | `packages/fluxiq/src/programs/automation-studio/storage/project/schema/routers.ts` | - |
| `AUTOMATION_STUDIO_PROJECT_ROUTER_RUNTIME_SUMMARY_DETAIL_MIGRATION` | Object | `packages/fluxiq/src/programs/automation-studio/storage/project/schema/routers.ts` | - |
| `AUTOMATION_STUDIO_PROJECT_ROUTER_TARGET_REFERENCE_MIGRATION` | Object | `packages/fluxiq/src/programs/automation-studio/storage/project/schema/routers.ts` | - |
| `AUTOMATION_STUDIO_PROJECT_RUN_DATASET_ANSWER_MIGRATION` | Object | `packages/fluxiq/src/programs/automation-studio/storage/project/schema/run-datasets.ts` | - |
| `AUTOMATION_STUDIO_PROJECT_RUN_DATASET_MIGRATION` | Object | `packages/fluxiq/src/programs/automation-studio/storage/project/schema/run-datasets.ts` | - |
| `AUTOMATION_STUDIO_PROJECT_RUNTIME_SUMMARY_ENVELOPE_MIGRATION` | Object | `packages/fluxiq/src/programs/automation-studio/storage/project/schema/runtime-runs.ts` | - |
| `AUTOMATION_STUDIO_PROJECT_SEARCH_TABLES` | Object | `packages/fluxiq/src/programs/automation-studio/storage/project/schema/table-names.ts` | - |
| `AUTOMATION_STUDIO_PROJECT_STREAM_SPOOL_MIGRATION` | Object | `packages/fluxiq/src/programs/automation-studio/storage/project/schema/event-streams.ts` | - |
| `AUTOMATION_STUDIO_PROJECT_STREAM_SPOOL_TABLES` | Object | `packages/fluxiq/src/programs/automation-studio/storage/project/schema/table-names.ts` | - |
| `AUTOMATION_STUDIO_READINESS_CAP_MS` | Object | `packages/fluxiq/src/programs/automation-studio/runtime/executor/recorded-state.ts` | The longest one; a 90 s gap where the author went to make coffee must not stall a run. |
| `AUTOMATION_STUDIO_READINESS_FLOOR_MS` | Object | `packages/fluxiq/src/programs/automation-studio/runtime/executor/recorded-state.ts` | The shortest a recorded gap may hold the run up for; a 50 ms recording must not give up after 50 ms on a slow day. |
| `AUTOMATION_STUDIO_REAUTHOR_BRIEF_INSTRUCTION_ID` | Object | `packages/fluxiq/src/programs/automation-studio/runtime/recovery/refuted-result/brief.ts` | The id every repair brief carries, so a reader can tell it from an instruction a person wrote. |
| `AUTOMATION_STUDIO_REAUTHOR_NOTHING_TO_CHANGE` | Object | `packages/fluxiq/src/programs/automation-studio/runtime/recovery/refuted-result/nothing-to-change.ts` | The outcome a re-author that found nothing to change is recorded under (`resultReauthor.outcome`). |
| `AUTOMATION_STUDIO_REAUTHOR_NOTHING_TO_CHANGE_FIELD` | Object | `packages/fluxiq/src/programs/automation-studio/runtime/recovery/refuted-result/nothing-to-change.ts` | The member of a completion's result by which a re-author says the Flow needs no change. |
| `AUTOMATION_STUDIO_RECORD_FIELD_HANDLINGS` | Object | `packages/contracts/src/record-sets/schema.ts` | What happens to a field's value. `include` (the default) keeps it. `exclude` keeps it out of node outputs, stored rows, the stored schema, previews, and exports. `encrypt` is refused until record keys exist (K11). |
| `AUTOMATION_STUDIO_RECORD_OUTPUT_LIMITS` | Object | `packages/contracts/src/record-sets/output.ts` | Caps on a record output and on the rows it captures. |
| `AUTOMATION_STUDIO_RECORD_SCHEMA_LIMITS` | Object | `packages/contracts/src/record-sets/schema.ts` | Bounds `parseAutomationStudioRecordSchema` enforces. A schema that exceeds them is rejected, not trimmed. |
| `AUTOMATION_STUDIO_RECORD_VALUE_TYPES` | Object | `packages/contracts/src/record-sets/schema.ts` | The value types a record field can hold. |
| `AUTOMATION_STUDIO_RECORD_WRITE_MODES` | Object | `packages/contracts/src/record-sets/output.ts` | How a capture meets rows already stored for the same dataset in the same run. |
| `AUTOMATION_STUDIO_RECORDED_GAP_METADATA_KEY` | Object | `packages/fluxiq/src/programs/automation-studio/runtime/executor/recorded-state.ts` | The node metadata field carrying the recorded inter-step gap, in milliseconds. |
| `AUTOMATION_STUDIO_RECOVERY_BUDGET_SHARES` | Object | `packages/fluxiq/src/programs/automation-studio/runtime/recovery/annotation/run-budget.ts` | How many shares a recovery's token pot and cost purse are sized and divided into. **Not a call limit.** Two numbers still have to be chosen: how big the default token pot is, and how much of the cost purse one call may reserve before it knows what it will spend. Both are sized as "enough for this many ordinary calls". A call is reserved at its share and charged what it actually used, so a run whose calls come in under their share -- nearly all of them, because the share covers a worst-case request -- makes more calls than this, not fewer. Only a run whose every call spends its full worst case stops here, and it stops on tokens or money, reported as such. Twenty-four is a diagnosis, a patch and a couple of dozen evidence decisions. |
| `AUTOMATION_STUDIO_RECOVERY_CONTEXT_SECTIONS` | Object | `packages/fluxiq/src/programs/automation-studio/runtime/recovery/context.ts` | Every section, in the order the context carries them. The order is the contract: it is the order a reader may assume. Nothing is dropped for size. `recent_nodes` overlaps the packet's own `recentActions`, deliberately. The packet's list is the last twelve *attempts* with their statuses and failure categories; this is the ordered chain of nodes that actually succeeded before the failure, and it is here so that `recoveryContext` is readable on its own by the recovery plan and by the adaptation that records it. It is next to last in priority precisely because the packet already says most of it. `recovered_failures` is its counterpart and ranks far higher, because what a run survived is evidence about the page and what it walked past is not. It sits immediately behind `recovery_candidates`: the same kind of fact -- what the recovery had to work with -- one step wider than the failure being repaired. `flow_graph` and `step_parameters` sit *after* the two transition sections and before everything else, and where they sit is the whole of how one fixed list serves two entry points. A failed step is repaired from what the step expected and what it got, so the transitions come first and nothing about that reading changed. A refuted *result* has no transition comparison at all -- every step did what it said -- so both transition sections are absent, and these two arrive immediately behind the failure record, which is where a repair that must rewrite the Flow needs them. No ranking is computed and no section moves: the same list reads differently only because a different run produced different sections. |
| `AUTOMATION_STUDIO_RECOVERY_EXPLORATION_COMPLETION_SCHEMA` | Object | `packages/fluxiq/src/programs/automation-studio/runtime/recovery/annotation/exploration.ts` | What an exploration is allowed to complete with. Deliberately narrow, and deliberately not a repair. An exploration answers "what is actually true out there"; deciding what to change about the Flow is the patch stage's work, and a completion schema that accepted a patch here would let the model skip the stage that is answerable to a policy. |
| `AUTOMATION_STUDIO_RECOVERY_LOOP_STAGES` | Object | `packages/fluxiq/src/programs/automation-studio/runtime/recovery/trace.ts` | Which loop-protocol stage each recovery stage drives, where one is driven. It lives beside the vocabulary rather than beside the assembler because two files now write the mapping -- the stage assembler and the exploration runner -- and a second copy is how a run comes to claim it drove `gather` from one place and `plan` from another for the same work. |
| `AUTOMATION_STUDIO_RECOVERY_MAX_DURATION_CEILING_MS` | Object | `packages/fluxiq/src/programs/automation-studio/runtime/recovery/recovery-deadline.ts` | The largest a host may set it to. Above this a recovery is a background job. |
| `AUTOMATION_STUDIO_RECOVERY_MAX_DURATION_MS` | Object | `packages/fluxiq/src/programs/automation-studio/runtime/recovery/recovery-deadline.ts` | The default ceiling on one recovery, end to end. Ten minutes. It was two, when a recovery was a diagnosis, a short look and a patch. A recovery now iterates for as long as it is learning something -- a default recovery allows twenty-six provider calls -- and at a realistic few seconds a call, two minutes would quietly have become the new call cap, ending explorations that were still making progress. The per-call timeout is unchanged, so a hung call is still caught at its own limit; this bounds only how long a recovery that keeps answering may keep going, and it is still the clock a person watching the run is waiting on. |
| `AUTOMATION_STUDIO_RECOVERY_TRACE_STAGES` | Object | `packages/fluxiq/src/programs/automation-studio/runtime/recovery/trace.ts` | The loop's stages at the failure entry point, in the only order they may occur. |
| `AUTOMATION_STUDIO_REFUTED_RESULT_ATTEMPT_PREFIX` | Object | `packages/fluxiq/src/programs/automation-studio/runtime/recovery/refuted-result/attempt.ts` | The attempt id prefix, so a reader can tell this attempt from one the graph executed. |
| `AUTOMATION_STUDIO_REFUTED_RESULT_NODE_ID` | Object | `packages/fluxiq/src/programs/automation-studio/runtime/recovery/refuted-result/attempt.ts` | The node id, and the definition id, of a refutation that names no step: the result's own verification. A valid id, because the run's stores require one on every attempt, and one no Flow node carries. |
| `AUTOMATION_STUDIO_RESULT_CHECK_AUTHORIZATION_CODES` | Object | `packages/fluxiq/src/programs/automation-studio/runtime/result-check-authorization/contracts.ts` | Why a standing authorization was not redeemed. One code per reason, so a reader can act on it. |
| `AUTOMATION_STUDIO_RESULT_CHECK_AUTHORIZATION_DEFAULTS` | Object | `packages/fluxiq/src/programs/automation-studio/runtime/result-check-authorization/contracts.ts` | What a standing authorization is bounded by when the person turning checking on names no numbers. A verification call was measured at $0.001483 (four real DeepSeek calls, 2026-09-21), so the default total covers well over six hundred checks -- more than the default schedule reaches in a Flow's first several thousand runs -- while still being a number a person can reason about. The per-call ceiling is far above the measured call and below a recovery's own ceiling (the run cost default, $0.25), so a verification whose packet grew unexpectedly is refused rather than billed. |
| `AUTOMATION_STUDIO_RESULT_CHECK_CODES` | Object | `packages/fluxiq/src/programs/automation-studio/runtime/result-check-schedule/contracts.ts` | The codes a decision carries. One per reason, so a reader can tell them apart. |
| `AUTOMATION_STUDIO_RESULT_CHECK_DEFAULTS` | Object | `packages/fluxiq/src/programs/automation-studio/runtime/result-check-schedule/settings.ts` | What a Flow nobody has configured checks on. Every existing Flow reads these without a migration. |
| `AUTOMATION_STUDIO_RESULT_CHECK_REVEAL_TTL_MS` | Object | `packages/fluxiq/src/programs/automation-studio/runtime/result-check-authorization/reveal.ts` | How long the one-use reveal this mints may sit unclaimed. Unrelated to the standing authorization's own expiry: that says whether checking may happen for the next ninety days, this says how long this one release of the key may wait. It is claimed on the next line. |
| `AUTOMATION_STUDIO_RESULT_CHECK_TASK_KIND` | Object | `packages/fluxiq/src/programs/automation-studio/runtime/result-check-authorization/contracts.ts` | The one task kind a standing check authorization can ever be redeemed for. |
| `AUTOMATION_STUDIO_RESULT_OBSERVATION_CODES` | Object | `packages/fluxiq/src/programs/automation-studio/runtime/result-verification/core-observation.ts` | Core's codes for a verdict it reached itself. |
| `AUTOMATION_STUDIO_RESULT_REAUTHOR_METADATA_KEY` | Object | `packages/fluxiq/src/programs/automation-studio/runtime/recovery/refuted-result/reauthor.ts` | Where a refuted run's metadata records what became of the route. |
| `AUTOMATION_STUDIO_RESULT_REPAIR_COST_BOUND_CODE` | Object | `packages/fluxiq/src/programs/automation-studio/runtime/recovery/refuted-result/purse.ts` | The code a part of the repair is recorded under when the purse had nothing left for it: the run ledger's own code for a total that cannot take another call, so a reader keys on one code for "the money ran out" wherever it ran out. |
| `AUTOMATION_STUDIO_RESULT_REPAIR_FINDING_CODES` | Object | `packages/fluxiq/src/programs/automation-studio/runtime/result-verification/repair-directive.ts` | Core's stable codes for what it found wrong with a result. |
| `AUTOMATION_STUDIO_RESULT_REPAIR_MAX_ATTEMPTS` | Object | `packages/fluxiq/src/programs/automation-studio/runtime/recovery/refuted-result/history.ts` | How many times one run's answer may be re-authored. Three: the first repair acts on the check's advice, the second on what the first produced, and the third on both. Each is a full build under the run's own cost, token and deadline ledger, which is the bound that matters; this is the bound on a loop that keeps being refuted for reasons it cannot fix. |
| `AUTOMATION_STUDIO_RESULT_REPAIR_METADATA_KEY` | Object | `packages/fluxiq/src/programs/automation-studio/runtime/recovery/refuted-result/history.ts` | The run's own record that its result was taken through the failure entry point (`repair.ts`). |
| `AUTOMATION_STUDIO_RESULT_UNSETTLED_WORDS` | Object | `packages/fluxiq/src/programs/automation-studio/runtime/result-verification/unsettled/unsettled-words.ts` | The closing sentence of a verification two checks did not settle (`../agreement.ts`), as each unit of work reads it. A run is not failed on such checks, and its result card says so (`run`). A build cannot finish on them: its test has to be judged to do what was asked. There the run's sentence sat on the judge's card directly above an ending saying the build was not finished (t193 1003, D10), so a build's card says what a split means there instead (`build`, `../check-activity.ts`). The recorded reason keeps the run's sentence; only the card a build shows swaps it. |
| `AUTOMATION_STUDIO_RESULT_VERDICT_CODES` | Object | `packages/fluxiq/src/programs/automation-studio/runtime/result-verification/verdict.ts` | Core's codes for a verdict a model call reached, or failed to. The last two are for a first answer other than `yes` that a second call with the same evidence did not settle (`agreement.ts`): one of the two said `yes`, or neither did and they did not both say `no`. |
| `AUTOMATION_STUDIO_RESULT_VERIFICATION_DEADLINE_MS` | Object | `packages/fluxiq/src/programs/automation-studio/runtime/result-verification/deadline.ts` | How long the whole of a verification may take: resolving a provider, reading the instructions and the run detail, and both calls. Two calls at the harness's own per-call ceiling fit inside it with room for the reads around them, so a deadline reached here means something stopped settling rather than that the model was slow. |
| `AUTOMATION_STUDIO_RESULT_VERIFICATION_SKIP_CODES` | Object | `packages/fluxiq/src/programs/automation-studio/runtime/result-verification/verify.ts` | Core's codes for a run that was not verified, and why. Never a verdict. Two codes used to live here and no longer do, because the cases they named are now judged rather than skipped: `core.result.nothing_to_judge`, for a run that stored no record set, and `core.result.no_records`, for a record set holding no rows. Both are still readable on runs recorded before 2026-09-24, and `verification-status.ts` still maps the first to the `no_result` status a stored run may carry; nothing produces either any more. What is left is the two ways a question can fail to be put at all: no model to put it to, and a verification that did not finish inside its deadline (`deadline.ts`). Both are `performed: false`, both read as `unverified`, and neither is ever a pass. |
| `AUTOMATION_STUDIO_RESULT_WRONG_ANSWER_CODE` | Object | `packages/fluxiq/src/programs/automation-studio/runtime/recovery/refuted-result/reauthor.ts` | Core's code for the verdict this routes on. Written here rather than imported, because the value edge would close a cycle -- `result-verification/run-outcome.ts` already calls into this directory -- and typed against the table it comes from, so the two cannot drift: renaming the code there is a compile error here. |
| `AUTOMATION_STUDIO_RETIRED_ACTIVE_JSON_INDEXES` | Object | `packages/fluxiq/src/programs/automation-studio/storage/project/migration-cutover.ts` | - |
| `AUTOMATION_STUDIO_REUSABLE_LLM_CONTEXT_DEFAULT_TTL_MS` | Object | `packages/fluxiq/src/programs/automation-studio/storage/project/reusable-llm-context-store.ts` | - |
| `AUTOMATION_STUDIO_REUSABLE_LLM_CONTEXT_MAX_TTL_MS` | Object | `packages/fluxiq/src/programs/automation-studio/storage/project/reusable-llm-context-store.ts` | - |
| `AUTOMATION_STUDIO_REUSABLE_LLM_CONTEXT_VERSION` | Object | `packages/fluxiq/src/programs/automation-studio/storage/project/reusable-llm-context-store.ts` | - |
| `AUTOMATION_STUDIO_ROUTE_CONDITION_FORM` | Object | `packages/fluxiq/src/programs/automation-studio/runtime/flow-bootstrap/plan/route-condition.ts` | How a model is told to write a condition, used wherever one is refused. |
| `AUTOMATION_STUDIO_ROUTE_CONDITION_LIMITS` | Object | `packages/fluxiq/src/programs/automation-studio/runtime/flow-bootstrap/plan/route-condition.ts` | - |
| `AUTOMATION_STUDIO_ROUTE_CONDITION_OPERATORS` | Object | `packages/fluxiq/src/programs/automation-studio/runtime/flow-bootstrap/plan/route-condition.ts` | The operators the router evaluates on the state it is given. The rest of Core's vocabulary -- `changed`, `increased`, `decreased`, `stable_for` -- needs a history of transitions the router does not have, so it fails closed there and is refused here rather than authored into a rule that can never hold. |
| `AUTOMATION_STUDIO_ROUTE_SIGNAL_PATH` | Object | `packages/fluxiq/src/programs/automation-studio/runtime/flow-bootstrap/plan/route-condition.ts` | `inputs.<name>` or `state.<name>`, dotted, each segment a plain word. |
| `AUTOMATION_STUDIO_ROUTER_DECISION_TEXT` | Object | `packages/fluxiq/src/programs/automation-studio/runtime/flow-bootstrap/plan/routing-context.ts` | How the router decides, in the words the model reads. |
| `AUTOMATION_STUDIO_RUN_CONTROL_MAX_PAUSED_MS` | Object | `packages/fluxiq/src/programs/automation-studio/runtime/run-control/run-controller.ts` | How long a run may stay held before it stops itself. It matches how long the web panel reads a run back after its request was cut short, so a run held past it would be one no open panel was still watching. |
| `AUTOMATION_STUDIO_RUN_PROGRESS_STATUSES` | Object | `packages/fluxiq/src/programs/automation-studio/runtime/run-control/progress-status.ts` | - |
| `AUTOMATION_STUDIO_RUNTIME_PATCH_SKIP_CODES` | Object | `packages/fluxiq/src/programs/automation-studio/runtime/recovery/diagnosis-chain.ts` | Core's reasons for not asking for a runtime patch, one code each. Every one of these used to reach a run as the single code `llm.runtime_patch_not_requested`, so "the model said the goal is gone", "the diagnosis call returned something else" and "the policy permits no patch kind here" were one word on the record. Live run `run-muesyox4-930bef98` (2026-09-23) is the case that made it matter: a `target_not_found` whose diagnosis validated, and whose refusal could not be attributed to any of the five clauses from the run's artifacts. The shape is fixed by more than taste. The Lab's run-detail parser accepts a skip code only when it matches `llm.runtime_patch_[a-z_]+`, and drops anything else *silently*, so a code outside this shape would restore the silence it is here to end. |
| `AUTOMATION_STUDIO_RUNTIME_PATCH_SKIP_CODES_CHECKABLE_BY_EXPLORATION` | Object | `packages/fluxiq/src/programs/automation-studio/runtime/recovery/diagnosis-chain.ts` | The refusals a look at the page could overturn. One, and it is the one that matters. `goal_unachievable` is the model's claim *about the page* -- that the step's result can no longer be reached -- given before it had seen one. Live run `run-muesyox4-930bef98` (2026-09-23) is the case: the model was shown an 819-byte packet with no same-family control and no fingerprint candidate on it, said the goal was gone, and the loop cancelled the exploration on the strength of that answer, so the single claim a page could have settled was the single claim nothing checked. `plan.ts` has always said a refusal must stay checkable; the gate in `annotate.ts` did not, and this set is what reconciles them. The other six are out, each for its own reason. A diagnosis that was never requested, that failed, or that answered with something else leaves no claim to check and nothing to re-plan from. A failure Stage A resolved without the model was decided by Core's classifier rather than by a reading of the page. A policy that permits no patch kind is a person's setting, which a page cannot speak to, so looking would spend a run's calls on an answer that could not change. And `diagnosis_asked_for_none` cannot reach here at all: it is decided by `!patchNeeded && !explorationNeeded`, and `explorationNeeded` false is exactly what stops an exploration running, so there is never a look to re-plan from. It is left out rather than included harmlessly, because a set that lists an unreachable member reads as a rule nobody has checked. |
| `AUTOMATION_STUDIO_RUNTIME_SESSION_LLM_INTENTS` | Object | `packages/fluxiq/src/programs/automation-studio/runtime/llm/runtime-session-llm.ts` | Every intent a runtime session may be started with. |
| `AUTOMATION_STUDIO_RUNTIME_TARGET_HANDLE_MAX_LENGTH` | Object | `packages/fluxiq/src/programs/automation-studio/runtime/llm/harness/structured-response.ts` | - |
| `AUTOMATION_STUDIO_RUNTIME_TARGET_HANDLE_PATTERN` | Object | `packages/fluxiq/src/programs/automation-studio/runtime/llm/harness/structured-response.ts` | The vocabulary an opaque handle may use, and nothing wider. A handle is a name, not a path: no whitespace, no brackets, no quotes, no combinators, no slashes, no parentheses. That is deliberately narrower than "a bounded string", because the whole point of the handle is that it cannot carry structure. A domain that wants to say *where* something is says it in its own resolution, on the domain's side of this boundary, never here. |
| `AUTOMATION_STUDIO_RUNTIME_TARGET_MAX_HANDLES` | Object | `packages/fluxiq/src/programs/automation-studio/runtime/llm/harness/structured-response.ts` | - |
| `AUTOMATION_STUDIO_RUNTIME_TARGET_MAX_SERIALIZED_LENGTH` | Object | `packages/fluxiq/src/programs/automation-studio/runtime/llm/harness/structured-response.ts` | - |
| `AUTOMATION_STUDIO_RUNTIME_TARGET_OVERRIDE_REFUSAL_REASONS` | Object | `packages/fluxiq/src/programs/automation-studio/runtime/live-patch/refusal-reasons.ts` | - |
| `AUTOMATION_STUDIO_SCALE_CERTIFICATION_SCHEMA_VERSION` | Object | `packages/fluxiq/src/programs/automation-studio/testing/scale-certification.ts` | - |
| `AUTOMATION_STUDIO_SCALE_PROFILES` | Object | `packages/fluxiq/src/programs/automation-studio/testing/scale-fixtures.ts` | - |
| `AUTOMATION_STUDIO_SESSION_KEY_PROVIDER_DEFAULTS` | Object | `packages/fluxiq/src/programs/automation-studio/runtime/llm/session-key-provider.ts` | One call's defaults. The token limits are the largest window of any model; a resolved call gets its own model's window (below). |
| `AUTOMATION_STUDIO_STAGED_PROJECT_AUTHORITY_MIGRATION` | Object | `packages/fluxiq/src/programs/automation-studio/storage/project/accepted-state/migration.ts` | - |
| `AUTOMATION_STUDIO_STATE_ROUTE_RETURN_LIMIT` | Object | `packages/fluxiq/src/programs/automation-studio/runtime/executor/state-routing/progress-guard.ts` | How many times state routing may return the run to one node without the run having made progress since the previous route there. The next return ends the run as failed, and says so: a page that keeps sending the run back to the same step is a loop, not a recovery. |
| `AUTOMATION_STUDIO_STRUCTURED_DIAGNOSIS_MODEL_FIELDS` | Object | `packages/fluxiq/src/programs/automation-studio/runtime/recovery/structured-diagnosis.ts` | The model-supplied fields, named once so the reader and the summary agree. |
| `AUTOMATION_STUDIO_STRUCTURED_DIAGNOSIS_TEXT_MAX_LENGTH` | Object | `packages/fluxiq/src/programs/automation-studio/runtime/recovery/structured-diagnosis.ts` | The longest a model-supplied description may be before it is refused. |
| `AUTOMATION_STUDIO_TARGET_SCALE` | Object | `packages/fluxiq/src/programs/automation-studio/testing/scale-fixtures.ts` | - |
| `AUTOMATION_STUDIO_TOKENS_PER_RUN_DEFAULT_CLEARED_KEY` | Object | `packages/fluxiq/src/programs/automation-studio/model/tokens-per-run/tokens-per-run-default-cleared-key.ts` | Written on a Flow whose `trainingModeSettings.budgets.maxTokensPerRun` can no longer be the token cap Core once wrote into every new Flow. Until 2026-09-30 the default Flow settings (`../flows.ts`) carried `maxTokensPerRun: 12000`, which held an unattended recovery to 12,000 tokens and refused a whole page's diagnosis outright. The user's order that day was to remove every limit on what the model is passed: the model's own context window is the only bound on a request, and the run cost ceiling (then $0.25; now `AUTOMATION_STUDIO_LLM_RUN_COST_CEILING_USD`, $0.10 by default) the bound on spending. So the default carries no token cap, and a stored Flow that still holds exactly 12,000 has it cleared where it is read (`runtime/service/flow-settings/tokens-per-run-default-migration.ts`). The web settings form never saved 12,000 as a person's choice -- it saved only a value that differed from it -- so a stored 12,000 without this key is always the default. The key says the clearing is done or was never needed: a new Flow is created with it, a cleared Flow is given it, and the settings form writes it on every save, so a 12,000 a person sets from now on is theirs and stays. |
| `AUTOMATION_STUDIO_TRANSIENT_STATUSES` | Object | `packages/fluxiq/src/programs/automation-studio/runtime/executor/defensive/transient-status.ts` | The statuses the runtime retries by default, for a caller that needs the list rather than the question. |
| `AUTOMATION_STUDIO_UI_CACHE_MAX_BATCH_ENTRIES` | Object | `packages/fluxiq/src/programs/automation-studio/storage/project/ui-cache-store.ts` | - |
| `AUTOMATION_STUDIO_UI_CACHE_MAX_ENTRY_BYTES` | Object | `packages/fluxiq/src/programs/automation-studio/storage/project/ui-cache-store.ts` | - |
| `AUTOMATION_STUDIO_UI_CACHE_MAX_KEY_BYTES` | Object | `packages/fluxiq/src/programs/automation-studio/storage/project/ui-cache-store.ts` | - |
| `AUTOMATION_STUDIO_UNATTENDED_REPAIR_CODES` | Object | `packages/fluxiq/src/programs/automation-studio/runtime/result-check-authorization/repair.ts` | Why an unattended repair was not funded. One code per reason, so a reader can act on it. |
| `AUTOMATION_STUDIO_UNATTENDED_REPAIR_TASK_KINDS` | Object | `packages/fluxiq/src/programs/automation-studio/runtime/result-check-authorization/repair.ts` | The task kinds an unattended repair may be redeemed for, and the only ones. Exactly what `recovery/annotation/` runs and nothing beside it: the diagnosis that reads the failure, the evidence decisions an exploration makes, and the patch. Not `loop_plan` and not `flow_bootstrap`, so this cannot pay to build a Flow; not `loop_verification`, which is the check's own redemption. |
| `AUTOMATION_STUDIO_V2_STORAGE_FEATURE` | Object | `packages/fluxiq/src/programs/automation-studio/storage/project/migration-cutover.ts` | - |
| `AUTOMATION_STUDIO_WITHHELD_LOCATOR` | Object | `packages/fluxiq/src/programs/automation-studio/runtime/llm/harness/locator-text.ts` | What replaces a locator. Short, and obviously not something to copy. |
| `AUTOMATION_STUDIO_WITHHELD_VALUE` | Object | `packages/fluxiq/src/programs/automation-studio/runtime/executor/trace-withholding.ts` | What a withheld value reads as in a persisted trace. A constant rather than a removed field, so a reader can tell a value that was withheld from one that was never there. It is the framework runtime's marker, so a trace and the command attempts saved for its dispatches withhold alike. |
| `AutomationAction` | Type | `packages/fluxiq/src/programs/automation-studio/types.ts` | - |
| `AutomationCondition` | Type | `packages/fluxiq/src/programs/automation-studio/model/conditions.ts` | - |
| `AutomationConditionExpression` | Type | `packages/fluxiq/src/programs/automation-studio/model/conditions.ts` | - |
| `AutomationConditionGroup` | Type | `packages/fluxiq/src/programs/automation-studio/model/conditions.ts` | - |
| `AutomationConditionOperator` | Type | `packages/fluxiq/src/programs/automation-studio/model/conditions.ts` | - |
| `AutomationInMemoryStateStore` | Class | `packages/fluxiq/src/programs/automation-studio/model/state-store.ts` | - |
| `AutomationNodeClass` | Type | `packages/fluxiq/src/programs/automation-studio/nodes/contracts.ts` | - |
| `automationNodeClasses` | Object | `packages/fluxiq/src/programs/automation-studio/nodes/registry.ts` | - |
| `AutomationNodeClassGroup` | Type | `packages/fluxiq/src/programs/automation-studio/nodes/contracts.ts` | - |
| `automationNodeClassGroups` | Object | `packages/fluxiq/src/programs/automation-studio/nodes/registry.ts` | - |
| `AutomationNodeDefinition` | Type | `packages/fluxiq/src/programs/automation-studio/nodes/contracts.ts` | - |
| `AutomationNodeExecutionContext` | Type | `packages/fluxiq/src/programs/automation-studio/nodes/contracts.ts` | - |
| `AutomationNodeExecutionResult` | Type | `packages/fluxiq/src/programs/automation-studio/nodes/contracts.ts` | - |
| `AutomationNodeExecutor` | Type | `packages/fluxiq/src/programs/automation-studio/nodes/contracts.ts` | - |
| `AutomationNodeExpectationEvaluation` | Type | `packages/fluxiq/src/programs/automation-studio/nodes/contracts.ts` | A host's verdict on whether an expected state holds. |
| `AutomationNodeExpectationEvaluationContext` | Type | `packages/fluxiq/src/programs/automation-studio/nodes/contracts.ts` | Why Core asked, and which attempt and host snapshot the question is about. |
| `AutomationNodeExpectationEvaluator` | Type | `packages/fluxiq/src/programs/automation-studio/nodes/contracts.ts` | Decides whether an expected state holds. Core never evaluates the conditions itself: with no evaluator bound, an expectation keeps its unconditional pass. |
| `AutomationNodeIterationState` | Type | `packages/fluxiq/src/programs/automation-studio/nodes/contracts.ts` | Where a node that runs once per pass, such as For Each, keeps its place between passes. |
| `AutomationNodeOrigin` | Type | `packages/fluxiq/src/programs/automation-studio/nodes/contracts.ts` | - |
| `automationNodeOutputReference` | Value | `packages/fluxiq/src/programs/automation-studio/nodes/parameter-bindings.ts` | - |
| `AutomationNodeParameter` | Type | `packages/fluxiq/src/programs/automation-studio/nodes/contracts.ts` | - |
| `AutomationNodeParameterStateBinding` | Type | `packages/fluxiq/src/programs/automation-studio/nodes/contracts.ts` | - |
| `AutomationNodePort` | Type | `packages/fluxiq/src/programs/automation-studio/nodes/contracts.ts` | - |
| `AutomationNodeScope` | Type | `packages/fluxiq/src/programs/automation-studio/nodes/contracts.ts` | - |
| `automationNodeStateBinding` | Value | `packages/fluxiq/src/programs/automation-studio/nodes/parameter-bindings.ts` | - |
| `AutomationNodeTargetResolution` | Type | `packages/fluxiq/src/programs/automation-studio/nodes/contracts.ts` | How an output-dispatching node resolved its element target before dispatch. `unresolved_no_candidates` means Core was given nothing to score the target against: it resolved nothing, applied no confidence floor, and left resolving the element to the output's adapter. That status carries no `minimumConfidence`, because a number there reads as a floor that was enforced. |
| `AutomationNodeValueType` | Type | `packages/fluxiq/src/programs/automation-studio/nodes/contracts.ts` | - |
| `AutomationPipelineArtifacts` | Type | `packages/fluxiq/src/programs/automation-studio/runtime/service/recordings/types.ts` | - |
| `AutomationRecording` | Type | `packages/fluxiq/src/programs/automation-studio/types.ts` | - |
| `AutomationStage` | Type | `packages/fluxiq/src/programs/automation-studio/types.ts` | - |
| `AutomationStateStore` | Type | `packages/fluxiq/src/programs/automation-studio/model/state-store.ts` | - |
| `automationStudioAbsentStepSkip` | Value | `packages/fluxiq/src/programs/automation-studio/runtime/executor/step-skip/absent-step.ts` | - |
| `AutomationStudioAcceptedProjectSnapshot` | Type | `packages/fluxiq/src/programs/automation-studio/storage/project/accepted-state/contracts.ts` | Explicit captured data. It is never an adopted authority over existing project data. |
| `AutomationStudioAcceptedStateBinding` | Type | `packages/fluxiq/src/programs/automation-studio/storage/project/accepted-state/contracts.ts` | - |
| `AutomationStudioAcceptedStateCurrent` | Type | `packages/fluxiq/src/programs/automation-studio/storage/project/accepted-state/contracts.ts` | - |
| `automationStudioAcceptedStateDigest` | Value | `packages/fluxiq/src/programs/automation-studio/storage/project/accepted-state/digest.ts` | - |
| `AutomationStudioAcceptedStateMutationResult` | Type | `packages/fluxiq/src/programs/automation-studio/storage/project/accepted-state/contracts.ts` | - |
| `AutomationStudioAcceptedStateReconciliation` | Type | `packages/fluxiq/src/programs/automation-studio/storage/project/accepted-state/contracts.ts` | - |
| `AutomationStudioAcceptedStateRequest` | Type | `packages/fluxiq/src/programs/automation-studio/storage/project/accepted-state/contracts.ts` | - |
| `AutomationStudioAcceptedStateTombstone` | Type | `packages/fluxiq/src/programs/automation-studio/storage/project/accepted-state/contracts.ts` | - |
| `AutomationStudioAcceptedStateValidation` | Class | `packages/fluxiq/src/programs/automation-studio/storage/project/accepted-state/validation.ts` | Structural storage checks only. Native dependency interpretation and capture completeness are not certified. |
| `AutomationStudioAcceptedStateVectorEntry` | Type | `packages/fluxiq/src/programs/automation-studio/storage/project/accepted-state/contracts.ts` | - |
| `AutomationStudioActionConsequence` | Type | `packages/fluxiq/src/programs/automation-studio/runtime/action-permissions/consequences.ts` | - |
| `AutomationStudioActionDeclaration` | Type | `packages/fluxiq/src/programs/automation-studio/runtime/action-permissions/declaration.ts` | One action, as the domain describes it before taking it. `control.name` is how a person would recognise the thing acted on -- the words on it, as they appeared in evidence the model has already been shown. It is never a locator, a fragment of markup or an internal id: Core carries it to a person, and a name it cannot find in evidence already shown is withheld rather than carried (see `gate.ts`). `control.kind` is one plain word or two for what sort of thing it is, in the domain's own vocabulary. `verb` is what the action does to it, as plainly: "press", "submit". `effect` is what the domain knows about the action itself rather than about this page: `observe` for one that reads, waits or asserts, `mutate` for one that acts. Absent is `mutate`, which gates as before. |
| `automationStudioActionDeclarationCrossCheck` | Value | `packages/fluxiq/src/programs/automation-studio/runtime/action-permissions/cross-check.ts` | - |
| `AutomationStudioActionDeclarationCrossCheck` | Type | `packages/fluxiq/src/programs/automation-studio/runtime/action-permissions/cross-check.ts` | - |
| `AutomationStudioActionDeclarationCrossCheckVerdict` | Type | `packages/fluxiq/src/programs/automation-studio/runtime/action-permissions/cross-check.ts` | Core's reading of the two answers together. `not_comparable` is the honest ending when no action was ever put to the gate: a build that only read a page declared nothing because it did nothing, and calling that a contradiction would make every extraction Flow suspect. |
| `AutomationStudioActionDeclarationError` | Class | `packages/fluxiq/src/programs/automation-studio/runtime/action-permissions/declaration.ts` | A declaration Core could not read. The action must not proceed. |
| `AutomationStudioActionDeclarationRecord` | Type | `packages/fluxiq/src/programs/automation-studio/runtime/action-permissions/declared.ts` | One action, as the domain declared it and as Core answered it. |
| `AutomationStudioActionEffect` | Type | `packages/fluxiq/src/programs/automation-studio/runtime/action-permissions/declaration.ts` | Whether taking the action changes anything, in the same two words the node registry, the harness options and the evidence loop already use. `observe` is a promise the domain makes about its own action -- it reads, waits or asserts, and the page and everything behind it is as it was afterwards. `mutate` is everything else, and is what an unstated effect means. |
| `AutomationStudioActionPermissionAction` | Type | `packages/fluxiq/src/programs/automation-studio/runtime/action-permissions/request.ts` | The action a request is about, as Core names it. |
| `AutomationStudioActionPermissionActionKind` | Type | `packages/fluxiq/src/programs/automation-studio/runtime/action-permissions/request.ts` | When the action would happen, which is the difference a person most needs: - `exploration_step` -- the run wanted to take it now, while finding out how to do the job. `id` is the option it called, `ref` the call. - `flow_step` -- the Flow would take it every time it runs: the Flow being built, or, at `recovery`, the Flow a repair would change. `id` is the step's node definition, `ref` the step's key in the plan or, for a repair, the node that failed. |
| `AutomationStudioActionPermissionCheck` | Type | `packages/fluxiq/src/programs/automation-studio/runtime/action-permissions/declaration.ts` | The check a domain calls before an action with a lasting consequence. Awaited immediately before acting: the first action in a build that has a lasting consequence may make Core read the person's instruction for what it already asks for (`instructed.ts`), once. It rejects with `AutomationStudioActionDeclarationError` when the declaration itself is malformed, which fails the action loudly: an action Core could not read is an action Core did not permit. |
| `automationStudioActionPermissionDenied` | Object | `packages/fluxiq/src/programs/automation-studio/runtime/action-permissions/gate.ts` | The check for an action run where no run stands behind it, so there is nobody to ask: a caller that drove a domain's option directly. It reads the declaration like any other and permits nothing that has a consequence. |
| `AutomationStudioActionPermissionGate` | Class | `packages/fluxiq/src/programs/automation-studio/runtime/action-permissions/gate.ts` | - |
| `AutomationStudioActionPermissionGateInput` | Type | `packages/fluxiq/src/programs/automation-studio/runtime/action-permissions/gate.ts` | - |
| `AutomationStudioActionPermissionRequest` | Type | `packages/fluxiq/src/programs/automation-studio/runtime/action-permissions/request.ts` | - |
| `automationStudioActionPermissionSentence` | Value | `packages/fluxiq/src/programs/automation-studio/runtime/action-permissions/request.ts` | - |
| `AutomationStudioActionPermissionStage` | Type | `packages/fluxiq/src/programs/automation-studio/runtime/action-permissions/request.ts` | Where in the improvement loop the run was when it needed permission. |
| `AutomationStudioActionPermissionVerdict` | Type | `packages/fluxiq/src/programs/automation-studio/runtime/action-permissions/declaration.ts` | Core's answer. `permitted: false` always means: do not take the action. `requestId` names the request that was raised for the person, and is `null` only where there is nobody to ask -- a caller that ran the domain's action without a run behind it. Either way the action does not happen. `declined` is present, and `true`, only when the refusal is a person's explicit no to this very question: the same control, asked about the same classes. The request it names has been answered and is not in front of anybody, so a domain tells its model not to make the action again rather than that a person is being asked. Absent means the request is still open, or nobody answered it, or there was nobody to ask. Optional, so a domain that never reads it is answered exactly as before. |
| `AutomationStudioActionTargetNode` | Type | `packages/fluxiq/src/programs/automation-studio/runtime/flow-change/action-target-parameters.ts` | The node a target repair re-points: its id, its definition, and the parameter values it holds now. |
| `automationStudioActivityAction` | Value | `packages/fluxiq/src/programs/automation-studio/runtime/activity/wording/action.ts` | - |
| `automationStudioActivityAskPort` | Value | `packages/fluxiq/src/programs/automation-studio/runtime/activity/ask/port.ts` | - |
| `automationStudioActivityAskResolution` | Value | `packages/fluxiq/src/programs/automation-studio/runtime/activity/ask/resolution.ts` | - |
| `automationStudioActivityCompletionRefusal` | Value | `packages/fluxiq/src/programs/automation-studio/runtime/activity/wording/completion-refusal.ts` | - |
| `automationStudioActivityDecision` | Value | `packages/fluxiq/src/programs/automation-studio/runtime/activity/wording/decision.ts` | - |
| `automationStudioActivityDecisionReason` | Object | `packages/fluxiq/src/programs/automation-studio/runtime/activity/decision-reason.ts` | - |
| `automationStudioActivityDraftEditCard` | Value | `packages/fluxiq/src/programs/automation-studio/runtime/activity/wording/draft-edit-card.ts` | - |
| `AutomationStudioActivityEmission` | Type | `packages/fluxiq/src/programs/automation-studio/runtime/activity/contracts.ts` | What an emission site says; the scope it runs under supplies the rest. |
| `AutomationStudioActivityFrame` | Type | `packages/fluxiq/src/programs/automation-studio/runtime/activity/contracts.ts` | What the scope storage holds for one unit of work. A run's id is known only once its session is admitted, so a run frame starts `pending` and emits nothing until it is bound. |
| `automationStudioActivityHub` | Object | `packages/fluxiq/src/programs/automation-studio/runtime/activity/default-hub.ts` | The one hub every emission in this process publishes to. |
| `AutomationStudioActivityHub` | Class | `packages/fluxiq/src/programs/automation-studio/runtime/activity/hub.ts` | The process's activity stream: numbers and stamps each event, bounds it, keeps the last few per project, and hands it to every subscriber. Activity is ephemeral (D2): nothing here is persisted, and a subscriber that throws loses its own copy of the event, never the work that emitted it. |
| `automationStudioActivityHumanLabel` | Value | `packages/fluxiq/src/programs/automation-studio/runtime/activity/wording/human-label.ts` | - |
| `automationStudioActivityInBuild` | Value | `packages/fluxiq/src/programs/automation-studio/runtime/activity/in-build.ts` | - |
| `AutomationStudioActivityInput` | Type | `packages/fluxiq/src/programs/automation-studio/runtime/activity/contracts.ts` | What the hub is handed: an event before it is numbered and stamped. |
| `AutomationStudioActivityListener` | Type | `packages/fluxiq/src/programs/automation-studio/runtime/activity/contracts.ts` | - |
| `AutomationStudioActivityLoopPass` | Type | `packages/fluxiq/src/programs/automation-studio/runtime/activity/loop/types.ts` | Which pass of which loop a step runs as. |
| `automationStudioActivityLoopWords` | Value | `packages/fluxiq/src/programs/automation-studio/runtime/activity/loop/words.ts` | - |
| `automationStudioActivityPersonWords` | Value | `packages/fluxiq/src/programs/automation-studio/runtime/activity/wording/person-words.ts` | - |
| `automationStudioActivityReasonText` | Value | `packages/fluxiq/src/programs/automation-studio/runtime/activity/wording/reason-text.ts` | - |
| `automationStudioActivityRecoveryChoice` | Value | `packages/fluxiq/src/programs/automation-studio/runtime/activity/wording/recovery-choice.ts` | - |
| `AutomationStudioActivityScope` | Type | `packages/fluxiq/src/programs/automation-studio/runtime/activity/contracts.ts` | One unit of work the activity belongs to: a build or a run. |
| `AutomationStudioActivitySnapshot` | Type | `packages/fluxiq/src/programs/automation-studio/runtime/activity/contracts.ts` | The latest event of one project, and the events before it, oldest first. |
| `automationStudioActivityStepNumbers` | Value | `packages/fluxiq/src/programs/automation-studio/runtime/activity/step/numbers.ts` | - |
| `automationStudioActivityToolCall` | Value | `packages/fluxiq/src/programs/automation-studio/runtime/activity/wording/tool-call.ts` | - |
| `AutomationStudioActualTransition` | Type | `packages/fluxiq/src/programs/automation-studio/runtime/executor/contracts.ts` | - |
| `AutomationStudioAdaptationApprovalMode` | Type | `packages/fluxiq/src/programs/automation-studio/storage/project/adaptation-store.ts` | - |
| `AutomationStudioAdaptationArtifactRecord` | Type | `packages/fluxiq/src/programs/automation-studio/storage/project/adaptation-store.ts` | - |
| `AutomationStudioAdaptationAuditEvent` | Type | `packages/fluxiq/src/programs/automation-studio/storage/project/adaptation-store.ts` | - |
| `AutomationStudioAdaptationAuditEventType` | Type | `packages/fluxiq/src/programs/automation-studio/storage/project/adaptation-store.ts` | - |
| `AutomationStudioAdaptationDetailSection` | Type | `packages/fluxiq/src/programs/automation-studio/storage/project/adaptation-store.ts` | - |
| `automationStudioAdaptationDigest` | Value | `packages/fluxiq/src/programs/automation-studio/storage/project/adaptation-store.ts` | - |
| `AutomationStudioAdaptationPolicy` | Type | `packages/fluxiq/src/programs/automation-studio/model/flow-adaptation.ts` | - |
| `AutomationStudioAdaptationPolicyPreset` | Type | `packages/fluxiq/src/programs/automation-studio/model/flow-adaptation.ts` | - |
| `AutomationStudioAdaptationPolicySummary` | Type | `packages/fluxiq/src/programs/automation-studio/runtime/service/indexes/types.ts` | - |
| `AutomationStudioAdaptationPromotionGateDecision` | Type | `packages/fluxiq/src/programs/automation-studio/runtime/training-modes.ts` | - |
| `AutomationStudioAdaptationPromotionGateInput` | Type | `packages/fluxiq/src/programs/automation-studio/runtime/training-modes.ts` | `confidence` is the tier the change's saved trials and replays earn (`adaptationConfidence`). `awaitsJudgedRun` says the change's trial proved nothing either way and its evidence is the judged whole run instead (t267; the runtime patch's `verification.awaitsJudgedRun`). With no failure on record, the trial-evidence rule then gives way and nothing else does: the apply itself still waits for that run to be judged to answer. |
| `AutomationStudioAdaptationPromotionGates` | Type | `packages/fluxiq/src/programs/automation-studio/storage/project/adaptation-store.ts` | The promotion gates every apply path runs: whether a change may be applied, and why not. The caller passes `evaluateFlowAdaptationPromotionGates`. The store cannot import it: it lives in `runtime/recovery`, whose imports reach `runtime/service` and, through it, this store, so an import here would close a module cycle. The store refuses to apply without it. |
| `AutomationStudioAdaptationReplayInput` | Type | `packages/fluxiq/src/programs/automation-studio/runtime/adaptation-confidence/replay.ts` | - |
| `AutomationStudioAdaptationReplayOutcome` | Type | `packages/fluxiq/src/programs/automation-studio/runtime/adaptation-confidence/replay.ts` | - |
| `AutomationStudioAdaptationReplaySkipCode` | Type | `packages/fluxiq/src/programs/automation-studio/runtime/adaptation-confidence/replay.ts` | Why a run recorded nothing for a change. Codes only; each is a fact about the run, never a judgement of the change. |
| `AutomationStudioAdaptationReplaySubject` | Type | `packages/fluxiq/src/programs/automation-studio/runtime/adaptation-confidence/replay.ts` | A saved change a run may have replayed, as this module reads one. |
| `AutomationStudioAdaptationRevisionBindings` | Type | `packages/fluxiq/src/programs/automation-studio/storage/project/adaptation-store.ts` | - |
| `AutomationStudioAdaptationRiskLevel` | Type | `packages/fluxiq/src/programs/automation-studio/model/flow-adaptation.ts` | - |
| `AutomationStudioAdaptationSummary` | Type | `packages/fluxiq/src/programs/automation-studio/runtime/service/indexes/types.ts` | - |
| `AutomationStudioAdaptationSummaryPage` | Type | `packages/fluxiq/src/programs/automation-studio/runtime/service/summaries/store.ts` | - |
| `AutomationStudioAdaptationSummaryRecord` | Type | `packages/fluxiq/src/programs/automation-studio/storage/project/adaptation-store.ts` | - |
| `AutomationStudioAdapterActionRequest` | Type | `packages/fluxiq/src/programs/automation-studio/runtime/adapters.ts` | - |
| `AutomationStudioAdapterRegistry` | Class | `packages/fluxiq/src/programs/automation-studio/runtime/adapters.ts` | - |
| `AutomationStudioAdaptiveCandidateKind` | Type | `packages/fluxiq/src/programs/automation-studio/runtime/adaptive-orchestrator.ts` | - |
| `AutomationStudioAdaptiveFailure` | Type | `packages/fluxiq/src/programs/automation-studio/runtime/adaptive-orchestrator.ts` | - |
| `AutomationStudioAdaptiveFailureClass` | Type | `packages/contracts/src/failure/adaptive-class.ts` | - |
| `AutomationStudioAdaptiveFailureInput` | Type | `packages/fluxiq/src/programs/automation-studio/runtime/adaptive-orchestrator.ts` | - |
| `AutomationStudioAesGcmProjectContentProtection` | Class | `packages/fluxiq/src/programs/automation-studio/storage/project/content-protection.ts` | AES-256-GCM adapter whose host-owned resolver controls key creation, persistence, rotation, and retirement. |
| `AutomationStudioAppliedAdaptationResult` | Type | `packages/fluxiq/src/programs/automation-studio/storage/project/adaptation-store.ts` | - |
| `AutomationStudioArchivedChunk` | Type | `packages/fluxiq/src/programs/automation-studio/storage/project/retention-store.ts` | - |
| `AutomationStudioAsk` | Type | `packages/fluxiq/src/programs/automation-studio/runtime/parking/ask.ts` | A question Core puts to a person, raised from anywhere a run, a build or a repair needs one. `parks` is the whole of the difference between a question and a dead end. A parking ask stops the work where it stands and keeps everything it has done, so an answer resumes it; one that does not park is said and the work carries on. Nothing here opens a thread: the ask is what the runtime raises, and the port that carries it is what puts it in front of a person. |
| `AutomationStudioAskAnswer` | Type Alias | `packages/fluxiq/src/programs/automation-studio/runtime/parking/index.ts` | - |
| `AutomationStudioAskControl` | Type | `packages/fluxiq/src/programs/automation-studio/runtime/parking/ask.ts` | What the ask acts on, as the person would recognise it. |
| `AutomationStudioAskDraft` | Type | `packages/fluxiq/src/programs/automation-studio/runtime/parking/ask.ts` | An ask as whoever raises it writes it: no status and no account of where it came from, because the runtime knows both and the raiser does not. Keeping them off the draft is what lets a node -- or a gate, or a domain adapter -- raise an ask in one object literal. `askId` is optional rather than absent, because something that already keys its question under an id of its own keeps it. The action-permission request is the case that matters: its `requestId` is "the key a store would hold it under", which is an ask id by another name, and a gate must be able to raise an ask under the id its payload already carries. Anything else leaves it out and the runtime names the ask after the attempt that raised it. |
| `automationStudioAskedAndGranted` | Value | `packages/fluxiq/src/programs/automation-studio/runtime/parking/permission-ask.ts` | - |
| `automationStudioAskedPersonNeeded` | Value | `packages/fluxiq/src/programs/automation-studio/runtime/parking/person-needed-ask.ts` | - |
| `automationStudioAskEffect` | Value | `packages/fluxiq/src/programs/automation-studio/runtime/parking/ask-effect.ts` | - |
| `automationStudioAskInEffects` | Value | `packages/fluxiq/src/programs/automation-studio/runtime/parking/ask-effect.ts` | - |
| `AutomationStudioAskKind` | Type | `packages/fluxiq/src/programs/automation-studio/runtime/parking/ask.ts` | What an ask wants back from the person. |
| `AutomationStudioAskOption` | Type | `packages/fluxiq/src/programs/automation-studio/runtime/parking/ask.ts` | One answer a `choice` ask offers, and the route taking it resumes the run down. |
| `AutomationStudioAskOptionDraft` | Type | `packages/fluxiq/src/programs/automation-studio/runtime/parking/ask.ts` | One option as whoever raises the ask writes it: an id, and the rest filled in. The stored option names its label and its route outright, because a thread read back a week later cannot infer either. |
| `AutomationStudioAskRoutes` | Type | `packages/fluxiq/src/programs/automation-studio/runtime/parking/ask.ts` | Where each way of settling an ask resumes the run: `granted` for a grant, a free-text answer or a chosen option with no route of its own, `denied` for a refusal, `timedOut` for nobody answering. A null route is one the ask did not name. |
| `automationStudioAskSettlement` | Value | `packages/fluxiq/src/programs/automation-studio/runtime/parking/settlement.ts` | - |
| `AutomationStudioAskSettlement` | Type | `packages/fluxiq/src/programs/automation-studio/runtime/parking/settlement.ts` | What became of an ask, and where the run goes because of it. A refusal moves nothing: the run stays parked exactly as it was, so the answer can be put right and offered again. |
| `AutomationStudioAskStage` | Type | `packages/fluxiq/src/programs/automation-studio/runtime/parking/ask.ts` | Where in the product's work the ask was raised, so a surface can say what is waiting. |
| `AutomationStudioAskStatus` | Type | `packages/fluxiq/src/programs/automation-studio/runtime/parking/ask.ts` | Pending until it is answered or runs out of time. |
| `AutomationStudioAskTimeoutAction` | Type | `packages/fluxiq/src/programs/automation-studio/runtime/parking/ask.ts` | What happens to a parked ask nobody answered. |
| `automationStudioAssessAttemptFault` | Value | `packages/fluxiq/src/programs/automation-studio/runtime/executor/defensive/assess.ts` | - |
| `automationStudioAttemptCapturedRecords` | Value | `packages/fluxiq/src/programs/automation-studio/runtime/flow-change/attempt-projection.ts` | - |
| `automationStudioAttemptFaultIsAbsorbed` | Value | `packages/fluxiq/src/programs/automation-studio/runtime/executor/defensive/assess.ts` | - |
| `automationStudioAttemptIsRetryable` | Value | `packages/fluxiq/src/programs/automation-studio/runtime/executor/retry-policy.ts` | - |
| `automationStudioAttemptNeedsPerson` | Value | `packages/fluxiq/src/programs/automation-studio/runtime/executor/person-needed.ts` | - |
| `automationStudioAttemptVerifiesState` | Value | `packages/fluxiq/src/programs/automation-studio/runtime/flow-change/attempt-projection.ts` | - |
| `AutomationStudioAuthoringMode` | Type | `packages/fluxiq/src/programs/automation-studio/model/authoring-mode/authoring-mode.ts` | - |
| `AutomationStudioAuthorityGuardRecords` | Class | `packages/fluxiq/src/programs/automation-studio/storage/project/authority-guard/records.ts` | Validates historical records and their durable mutation joins; never grants IO. |
| `AutomationStudioAuthorityGuardValidation` | Object | `packages/fluxiq/src/programs/automation-studio/storage/project/authority-guard/validation.ts` | - |
| `automationStudioAwaitNodeReadiness` | Value | `packages/fluxiq/src/programs/automation-studio/runtime/executor/ladder-run.ts` | - |
| `AutomationStudioBackgroundJob` | Type | `packages/fluxiq/src/programs/automation-studio/storage/project/administration.ts` | - |
| `AutomationStudioBackgroundJobRepository` | Class | `packages/fluxiq/src/programs/automation-studio/storage/project/administration.ts` | - |
| `AutomationStudioBackgroundJobStatus` | Type | `packages/fluxiq/src/programs/automation-studio/storage/project/administration.ts` | - |
| `AutomationStudioBackupReplayEvidence` | Type | `packages/fluxiq/src/programs/automation-studio/testing/scale-certification.ts` | - |
| `AutomationStudioBaselineOperation` | Type | `packages/fluxiq/src/programs/automation-studio/testing/scale-baseline.ts` | - |
| `AutomationStudioBootstrapAccounting` | Type | `packages/fluxiq/src/programs/automation-studio/runtime/flow-bootstrap/adaptation.ts` | - |
| `AutomationStudioBootstrapAdaptation` | Type | `packages/fluxiq/src/programs/automation-studio/runtime/flow-bootstrap/adaptation.ts` | - |
| `AutomationStudioBootstrapAdaptationMode` | Type | `packages/fluxiq/src/programs/automation-studio/runtime/flow-bootstrap/adaptation.ts` | `create` builds a whole topology on a blank Flow; `extend` only adds to an existing one. A record written before modes existed has none: read it as `create`. |
| `AutomationStudioBootstrapAdaptationOrigin` | Type | `packages/fluxiq/src/programs/automation-studio/runtime/flow-bootstrap/adaptation.ts` | A bootstrap change comes from an instruction, or from an edge case an existing Flow does not handle. |
| `AutomationStudioBootstrapAdaptationStatus` | Type | `packages/fluxiq/src/programs/automation-studio/runtime/flow-bootstrap/adaptation.ts` | - |
| `AutomationStudioBootstrapApplication` | Type | `packages/fluxiq/src/programs/automation-studio/runtime/flow-bootstrap/adaptation.ts` | - |
| `AutomationStudioBootstrapApplyGateInput` | Type | `packages/fluxiq/src/programs/automation-studio/runtime/training-modes.ts` | `mode` is `create` for a blank Flow and `extend` for one that already runs; upgrade a record saved without one first. |
| `AutomationStudioBootstrapAuditEvent` | Type | `packages/fluxiq/src/programs/automation-studio/runtime/flow-bootstrap/adaptation.ts` | - |
| `AutomationStudioBootstrapExistingTopology` | Type | `packages/fluxiq/src/programs/automation-studio/runtime/flow-bootstrap/extend.ts` | The ids an extend keeps, so the Flow is edited rather than replaced. Stored on the adaptation, because apply re-normalises the plan and compares the result with the topology that was proposed: a normalisation that could not see these ids would mint new ones and the comparison would refuse the record it was checking. |
| `automationStudioBootstrapExtendSubflow` | Value | `packages/fluxiq/src/programs/automation-studio/runtime/flow-bootstrap/extend.ts` | - |
| `AutomationStudioBootstrapParentState` | Type | `packages/fluxiq/src/programs/automation-studio/runtime/flow-bootstrap/adaptation.ts` | - |
| `automationStudioBootstrapTargetRefusal` | Value | `packages/fluxiq/src/programs/automation-studio/runtime/flow-bootstrap/extend.ts` | - |
| `AutomationStudioBootstrapTopology` | Type | `packages/fluxiq/src/programs/automation-studio/runtime/flow-bootstrap/adaptation.ts` | - |
| `automationStudioBoundedRetryWaitMs` | Value | `packages/fluxiq/src/programs/automation-studio/runtime/executor/defensive/retry-wait.ts` | - |
| `AutomationStudioBuildTestAccount` | Type | `packages/fluxiq/src/programs/automation-studio/runtime/result-verification/contracts.ts` | A build's test, as its judge reads it: every proposed step in order, and the build's own reading of the instruction's acts. |
| `automationStudioBuildTestChangeLines` | Value | `packages/fluxiq/src/programs/automation-studio/runtime/result-verification/build-test/change-lines.ts` | - |
| `AutomationStudioBuildTestInput` | Type | `packages/fluxiq/src/programs/automation-studio/runtime/result-verification/contracts.ts` | One input the Flow takes, at the value its test used (t252 D4): the Flow's parameter, declared by its first binding, and the steps that use it. |
| `automationStudioBuildTestInputs` | Value | `packages/fluxiq/src/programs/automation-studio/runtime/result-verification/build-test/test-inputs.ts` | - |
| `automationStudioBuildTestJudge` | Value | `packages/fluxiq/src/programs/automation-studio/runtime/result-verification/build-test/judge.ts` | - |
| `AutomationStudioBuildTestJudgeInput` | Type | `packages/fluxiq/src/programs/automation-studio/runtime/result-verification/build-test/judge.ts` | One question to the judge: the test's summary, and what the build has left to spend. |
| `AutomationStudioBuildTestJudgeSpend` | Type | `packages/fluxiq/src/programs/automation-studio/runtime/result-verification/build-test/judge.ts` | What the judge's calls cost. |
| `AutomationStudioBuildTestNote` | Type | `packages/fluxiq/src/programs/automation-studio/runtime/result-verification/contracts.ts` | One thing a capability check found of the Flow a build proposes, carried to the judge of its test as information (t195-w28a). The completion check used to refuse a Flow for it -- no step producing the records the instruction asks for, no step going to where the Flow starts -- and send the model back to explore. Under the no-restrictions rule only the permission gates refuse, so the Flow goes to its test and its judge, and this is what the check found, for the judge to confirm against the steps and for the repair to be told through the judge's reasons. Core's words and the instruction's only: the check's issue code and sentence, the columns the instruction named, where the build was told to start. |
| `automationStudioBuildTestObservationReader` | Value | `packages/fluxiq/src/programs/automation-studio/runtime/result-verification/build-test/observation.ts` | - |
| `AutomationStudioBuildTestObservationReader` | Type | `packages/fluxiq/src/programs/automation-studio/runtime/result-verification/build-test/observation.ts` | One step's observations made sendable: `withheld` when screening took anything out. |
| `AutomationStudioBuildTestPass` | Type | `packages/fluxiq/src/programs/automation-studio/runtime/result-verification/contracts.ts` | One pass of a repeated step as the judge of its test reads it (t252 D6). The row is named by its label only, the label the list read's `readRows` gave it, screened as those are (`build-test/read-rows.ts`); a row's values never travel here. |
| `automationStudioBuildTestPassLines` | Value | `packages/fluxiq/src/programs/automation-studio/runtime/result-verification/build-test/pass-lines.ts` | - |
| `automationStudioBuildTestReadRows` | Value | `packages/fluxiq/src/programs/automation-studio/runtime/result-verification/build-test/read-rows.ts` | - |
| `AutomationStudioBuildTestRecordCounts` | Type | `packages/fluxiq/src/programs/automation-studio/runtime/result-verification/build-test/judge.ts` | What a judged test stored, from the summary it was judged on: rows stored, rows refused, and stored rows missing a required value, across every record set (`AutomationStudioRunResultSummary`). A build measures a repair's progress by them (t240): fewer refused or incomplete rows, or rows where none were. |
| `AutomationStudioBuildTestReportInput` | Type | `packages/fluxiq/src/programs/automation-studio/runtime/result-verification/build-test/summary.ts` | The test a build ran, as this builder reads it. Structurally the report the dry-run gate hands `observeTest` (W1's `AutomationStudioFlowDraftTestReport` in `llm/node-tools/dry-run-gate.ts`), declared here so the two could be written at once. Only what is read is named. |
| `automationStudioBuildTestResultSummary` | Value | `packages/fluxiq/src/programs/automation-studio/runtime/result-verification/build-test/summary.ts` | - |
| `automationStudioBuildTestSpanRows` | Value | `packages/fluxiq/src/programs/automation-studio/runtime/result-verification/build-test/span-rows.ts` | - |
| `AutomationStudioBuildTestStep` | Type | `packages/fluxiq/src/programs/automation-studio/runtime/result-verification/contracts.ts` | One step of the Flow a build proposes, as the judge of its test reads it. `target` and `observed` are the domain's words and evidence, screened by the builder (`build-test/summary.ts`) and checked again before sending (`llm/harness/request-evidence-check.ts`). `claims` are the model's own and prove nothing. |
| `AutomationStudioBuildTestStore` | Type | `packages/fluxiq/src/programs/automation-studio/runtime/result-verification/contracts.ts` | One dataset the Flow a build proposes would write, as its test's reads filled it (t274-c3). Live run `run-muw60j7c-bb7c9a62` (C-3): two reads appended 20 unfiltered rows and then 10 filtered ones into one dataset, 3 of them twice, and both judges of the test, told it stored nothing, said yes. |
| `AutomationStudioBuildTestStoreAnswer` | Type | `packages/fluxiq/src/programs/automation-studio/runtime/result-verification/build-test/stores.ts` | One answer the test observed of a step: `at`, its place among every answer of the test; `records`, the rows its read stored. |
| `automationStudioBuildTestStores` | Value | `packages/fluxiq/src/programs/automation-studio/runtime/result-verification/build-test/stores.ts` | - |
| `automationStudioBuildTestUntestedCarried` | Value | `packages/fluxiq/src/programs/automation-studio/runtime/result-verification/build-test/summary.ts` | - |
| `AutomationStudioBuildTestVerdict` | Type | `packages/fluxiq/src/programs/automation-studio/runtime/result-verification/build-test/judge.ts` | The judge's verdict on a build's test. Structurally `AutomationStudioFlowBootstrapTestVerdict` (`flow-bootstrap/unfinished-build/contracts.ts`, t195-w25 section 4.1), declared here so the two could be written at once. TODO(t195 lead): unify with that type at integration. |
| `automationStudioBuiltinNodeRoots` | Object | `packages/fluxiq/src/programs/automation-studio/nodes/layout.ts` | - |
| `AutomationStudioCallFlowBinding` | Type | `packages/fluxiq/src/programs/automation-studio/model/composites.ts` | - |
| `AutomationStudioCallFlowConfiguration` | Type | `packages/fluxiq/src/programs/automation-studio/model/composites.ts` | - |
| `AutomationStudioCallFlowTarget` | Type | `packages/fluxiq/src/programs/automation-studio/model/composites.ts` | - |
| `AutomationStudioCandidateAuthoringBinding` | Type | `packages/fluxiq/src/programs/automation-studio/runtime/flow-bootstrap/authoring-result/contracts.ts` | - |
| `AutomationStudioCandidateAuthoringResult` | Type | `packages/fluxiq/src/programs/automation-studio/runtime/flow-bootstrap/authoring-result/contracts.ts` | A saved authoring result. This carries no execution or promotion authority. |
| `AutomationStudioCandidateDraftTrial` | Type | `packages/fluxiq/src/programs/automation-studio/runtime/service/flow-bootstrap-commands/contracts.ts` | Why a candidate stayed a draft: the standing trial verdict for its latest revision (`not_tested` when none ran), the trial run behind it, and Core's codes (`candidate.trial_judged_no`, `FLOW_BOOTSTRAP_STALE`, ...). |
| `AutomationStudioCandidateDraftTrialBlock` | Type | `packages/fluxiq/src/programs/automation-studio/runtime/flow-bootstrap/authoring-result/contracts.ts` | Why a candidate stayed a draft (t340): the standing verdict, the trial run behind it, and Core's codes. |
| `AutomationStudioCandidateDurableBinding` | Type | `packages/fluxiq/src/programs/automation-studio/storage/project/candidate-verification/contracts.ts` | Immutable trusted association; no builder/API acceptance fields. |
| `AutomationStudioCandidateDurableSession` | Class | `packages/fluxiq/src/programs/automation-studio/runtime/flow-bootstrap/verification/durable-session.ts` | Internal trusted-port orchestration; production promotion is deliberately closed. |
| `AutomationStudioCandidateExecutionReceipt` | Type | `packages/fluxiq/src/programs/automation-studio/runtime/flow-bootstrap/verification/contracts.ts` | - |
| `automationStudioCandidateFingerprint` | Object | `packages/fluxiq/src/programs/automation-studio/runtime/flow-bootstrap/candidate/digest.ts` | One fingerprint owner: byte-compatible legacy graph and source-bound v2. |
| `AutomationStudioCandidateLedgerRecord` | Type | `packages/fluxiq/src/programs/automation-studio/storage/project/candidate-verification/contracts.ts` | - |
| `AutomationStudioCandidateLedgerRequest` | Type | `packages/fluxiq/src/programs/automation-studio/storage/project/candidate-verification/contracts.ts` | - |
| `AutomationStudioCandidateLedgerStage` | Type | `packages/fluxiq/src/programs/automation-studio/storage/project/candidate-verification/contracts.ts` | - |
| `AutomationStudioCandidateObservedEvidence` | Type | `packages/fluxiq/src/programs/automation-studio/runtime/flow-bootstrap/verification/contracts.ts` | Only the independent observer port may produce this packet. |
| `AutomationStudioCandidateOriginalSourceBinding` | Type | `packages/fluxiq/src/programs/automation-studio/runtime/flow-bootstrap/candidate/contracts.ts` | - |
| `AutomationStudioCandidateOriginalSources` | Type | `packages/fluxiq/src/programs/automation-studio/runtime/flow-bootstrap/candidate/contracts.ts` | Historical owner-enumerated bytes, never pinned-read or execution authority. |
| `AutomationStudioCandidateProposalResult` | Type | `packages/fluxiq/src/programs/automation-studio/runtime/flow-bootstrap/authoring-result/contracts.ts` | A candidate whose trial run was judged yes twice and was proposed (t340): an ordinary proposed adaptation, approved and applied like a legacy one, that names the candidate and trial it came from. A proposal without that block is not a candidate's and is refused. |
| `AutomationStudioCandidateRequirementBrief` | Type | `packages/fluxiq/src/programs/automation-studio/runtime/flow-bootstrap/verification/contracts.ts` | Trusted interpretation of original instructions, never a builder annotation. |
| `AutomationStudioCandidateRequirementPredicate` | Type | `packages/fluxiq/src/programs/automation-studio/runtime/flow-bootstrap/verification/contracts.ts` | - |
| `AutomationStudioCandidateRequirementResult` | Type | `packages/fluxiq/src/programs/automation-studio/runtime/flow-bootstrap/verification/contracts.ts` | - |
| `automationStudioCandidateRequirementsDigest` | Value | `packages/fluxiq/src/programs/automation-studio/runtime/flow-bootstrap/verification/identity.ts` | - |
| `automationStudioCandidateStartHookFromEnvironment` | Value | `packages/fluxiq/src/programs/automation-studio/runtime/candidate-start-hook/from-environment.ts` | - |
| `AutomationStudioCandidateStartReceipt` | Type | `packages/fluxiq/src/programs/automation-studio/runtime/flow-bootstrap/verification/contracts.ts` | Prepared by the trusted reset/start adapter, not inferred from navigation. |
| `automationStudioCandidateSubmissionRefusal` | Value | `packages/fluxiq/src/programs/automation-studio/runtime/flow-bootstrap/candidate/submission-refusal.ts` | - |
| `AutomationStudioCandidateTrialOutcomeVerdict` | Type | `packages/fluxiq/src/programs/automation-studio/runtime/flow-bootstrap/authoring-result/contracts.ts` | What a candidate trial's standing verdict was: the trial gate's verdicts, or `not_tested` when none ran. |
| `AutomationStudioCandidateTrialPort` | Type | `packages/fluxiq/src/programs/automation-studio/runtime/flow-bootstrap/candidate/contracts.ts` | - |
| `AutomationStudioCandidateTrialRequest` | Type | `packages/fluxiq/src/programs/automation-studio/runtime/flow-bootstrap/candidate/contracts.ts` | One trial of a submitted candidate: Core runs that exact candidate once from its declared start and judges only what the trial did. The port is injected by the service that owns execution and judging; the authoring loop only asks and records the answer. `candidate` is the exact submission `revision` and `digest` name, so the port runs the bytes the verdict is bound to. |
| `AutomationStudioCandidateTrialResult` | Type | `packages/fluxiq/src/programs/automation-studio/runtime/flow-bootstrap/candidate/contracts.ts` | What the trial port answers. Only `yes` for the exact latest revision and digest lets the model complete. |
| `AutomationStudioCandidateTrialVerdict` | Type | `packages/fluxiq/src/programs/automation-studio/runtime/flow-bootstrap/candidate/contracts.ts` | - |
| `AutomationStudioCandidateVerificationController` | Class | `packages/fluxiq/src/programs/automation-studio/runtime/flow-bootstrap/verification/controller.ts` | One candidate attempt; durable promotion/CAS remains the project store's duty. |
| `AutomationStudioCandidateVerificationIdentity` | Type | `packages/fluxiq/src/programs/automation-studio/runtime/flow-bootstrap/verification/contracts.ts` | - |
| `AutomationStudioCandidateVerificationOutcome` | Type | `packages/fluxiq/src/programs/automation-studio/runtime/flow-bootstrap/verification/contracts.ts` | - |
| `AutomationStudioCandidateVerificationPorts` | Type | `packages/fluxiq/src/programs/automation-studio/runtime/flow-bootstrap/verification/contracts.ts` | - |
| `AutomationStudioCandidateVerificationReceipt` | Type | `packages/fluxiq/src/programs/automation-studio/runtime/flow-bootstrap/verification/contracts.ts` | - |
| `AutomationStudioCandidateVerificationStore` | Class | `packages/fluxiq/src/programs/automation-studio/storage/project/candidate-verification/store.ts` | Internal trusted adapter ledger. It never writes or authorizes accepted graphs. |
| `AutomationStudioCarriedIteration` | Type | `packages/fluxiq/src/programs/automation-studio/runtime/parking/parked-run.ts` | One node's place in a list it was iterating, carried across a park. Declared structurally rather than imported from the node catalog. Parking is reached from a node definition, so importing the catalog here would close a module cycle; the shape is `AutomationNodeIterationState`, and the executor, where both are in scope, is where the compiler checks that it still is. |
| `AutomationStudioCatalog` | Class | `packages/fluxiq/src/programs/automation-studio/storage/catalog.ts` | - |
| `AutomationStudioCatalogCategory` | Type | `packages/fluxiq/src/programs/automation-studio/storage/catalog.ts` | - |
| `AutomationStudioCatalogProject` | Type | `packages/fluxiq/src/programs/automation-studio/storage/catalog.ts` | - |
| `AutomationStudioCategoryCatalogRepository` | Class | `packages/fluxiq/src/programs/automation-studio/storage/catalog.ts` | - |
| `AutomationStudioChangeConfidence` | Type | `packages/fluxiq/src/programs/automation-studio/runtime/flow-change/contracts.ts` | High, Medium and Low confidence in the MVP's words are `established`, `provisional` and `unverified`. |
| `AutomationStudioChangeConfidenceDecision` | Type | `packages/fluxiq/src/programs/automation-studio/runtime/flow-change/contracts.ts` | - |
| `AutomationStudioChangeConfidenceInput` | Type | `packages/fluxiq/src/programs/automation-studio/runtime/flow-change/contracts.ts` | - |
| `AutomationStudioChangeFeedEntityKind` | Type | `packages/fluxiq/src/programs/automation-studio/api/contracts/change-feed.ts` | - |
| `AutomationStudioChangeFeedHierarchyScope` | Type | `packages/fluxiq/src/programs/automation-studio/api/contracts/change-feed.ts` | - |
| `AutomationStudioChangeFeedOperation` | Type | `packages/fluxiq/src/programs/automation-studio/api/contracts/change-feed.ts` | - |
| `AutomationStudioChangeFeedRepository` | Class | `packages/fluxiq/src/programs/automation-studio/storage/project/administration.ts` | - |
| `AutomationStudioChangeProposalKind` | Type | `packages/fluxiq/src/programs/automation-studio/model/flow-adaptation.ts` | - |
| `AutomationStudioChangeProposalMode` | Type | `packages/fluxiq/src/programs/automation-studio/model/flow-adaptation.ts` | - |
| `AutomationStudioChangeProposalPatch` | Type | `packages/fluxiq/src/programs/automation-studio/model/flow-adaptation.ts` | - |
| `AutomationStudioChangeProposalStatus` | Type | `packages/fluxiq/src/programs/automation-studio/model/flow-adaptation.ts` | - |
| `AutomationStudioChangeProposalSummary` | Type | `packages/fluxiq/src/programs/automation-studio/runtime/service/indexes/types.ts` | - |
| `AutomationStudioChangeProposalSummaryPage` | Type | `packages/fluxiq/src/programs/automation-studio/runtime/service/adaptation-projections/contracts.ts` | - |
| `AutomationStudioChangeResumeDecision` | Type | `packages/fluxiq/src/programs/automation-studio/runtime/flow-change/contracts.ts` | Whether normal deterministic execution may continue, decided from the checks a trial made rather than from what it proved. `code` names why not, and is present exactly when `resumable` is false: - `no_checks`: the trial judged nothing, so there is nothing to continue from. - `check_failed`: a check contradicted the change. - `check_unknown`: a check the trial made could not be evaluated. Unknown is never a pass here either, so an unevaluated check ends the continuation. - `no_resume_point`: the continuation is not well defined, so there is no node to resume at. - `no_evidence`: nothing observed proves the change. Success alone is not evidence, so a run that merely did not fail is not resumable. |
| `AutomationStudioChangeResumePoint` | Type | `packages/fluxiq/src/programs/automation-studio/runtime/flow-change/contracts.ts` | Where a run continues after a change: the node the changed path led to and the route that led there, or a finished run. `subflowId` names the Subflow whose graph those node ids belong to, when the trial ran inside one, so a continuation inside a Subflow can be expressed rather than read as a node of the parent graph. A resume point is a fact about where the trial got to, not permission to go there. `AutomationStudioChangeVerdict.resumable` is the permission. |
| `AutomationStudioChangeTrialInput` | Type | `packages/fluxiq/src/programs/automation-studio/runtime/flow-change/contracts.ts` | - |
| `AutomationStudioChangeTrialResult` | Type | `packages/fluxiq/src/programs/automation-studio/runtime/flow-change/contracts.ts` | - |
| `automationStudioChangeValidationResult` | Value | `packages/fluxiq/src/programs/automation-studio/runtime/flow-change/verdict.ts` | - |
| `AutomationStudioChangeVerdict` | Type | `packages/fluxiq/src/programs/automation-studio/runtime/flow-change/contracts.ts` | - |
| `AutomationStudioChangeVerdictAttempt` | Type | `packages/fluxiq/src/programs/automation-studio/runtime/flow-change/contracts.ts` | One trial attempt, as the verdict reads it. The trial projects each executor attempt into this shape; every field is a fact the trial observed, and an absent optional field means the node declared nothing of that kind. |
| `AutomationStudioChangeVerdictCheck` | Type | `packages/fluxiq/src/programs/automation-studio/runtime/flow-change/contracts.ts` | - |
| `AutomationStudioChangeVerdictCheckKind` | Type | `packages/fluxiq/src/programs/automation-studio/runtime/flow-change/contracts.ts` | What one verdict check looked at. - `changed_node_succeeded`: every attempt of a node the change wrote, where the trial reached it. - `expected_state`: the host's evaluation of a changed node's declared `expectedState`. - `expected_route`: a changed node took the route it declares. Never the route the failure being repaired took. - `expected_outputs`: a changed node produced every output id it declares. - `records`: a changed node that saves records captured at least its minimum. With no minimum declared it passes on rows alone and carries the code `records_minimum_undeclared`, which the resume decision reads as unknown: nothing said how many rows the extraction owed. - `downstream_assertion`: a node whose definition declares `metadata.verifiesState`, run after the first changed attempt, succeeded. - `continuation`: the route the last changed node took led to a node that started, or to a successful end. |
| `AutomationStudioChangeVerdictCheckStatus` | Type | `packages/fluxiq/src/programs/automation-studio/runtime/flow-change/contracts.ts` | `unknown` is never a pass: a check that could not be evaluated proves nothing. |
| `AutomationStudioChangeVerdictEvidenceKind` | Type | `packages/fluxiq/src/programs/automation-studio/runtime/flow-change/contracts.ts` | The check kinds that count as evidence. Success alone and continuation never do. |
| `AutomationStudioChangeVerdictInput` | Type | `packages/fluxiq/src/programs/automation-studio/runtime/flow-change/contracts.ts` | - |
| `AutomationStudioChangeVerdictOutcome` | Type | `packages/fluxiq/src/programs/automation-studio/runtime/flow-change/contracts.ts` | - `verified`: every changed node the trial reached succeeded, no check failed, and at least one evidence check passed. - `contradicted`: a check failed. - `unverifiable`: nothing failed, but nothing proved the change either. - `not_executed`: the trial never ran a changed node. |
| `AutomationStudioChunkEvent` | Type | `packages/fluxiq/src/programs/automation-studio/storage/project/event-chunk-store.ts` | - |
| `AutomationStudioClearReusableLlmContextScopeRequest` | Type | `packages/fluxiq/src/programs/automation-studio/api/contracts/llm.ts` | - |
| `AutomationStudioClientGatewayBridge` | Class | `packages/fluxiq/src/programs/automation-studio/client-gateway/bridge.ts` | - |
| `AutomationStudioClientGatewayBridgeOptions` | Type | `packages/fluxiq/src/programs/automation-studio/client-gateway/bridge.ts` | - |
| `automationStudioClosestName` | Value | `packages/fluxiq/src/programs/automation-studio/runtime/conversations/instructions/closest.ts` | - |
| `AutomationStudioClosestNameMatch` | Type | `packages/fluxiq/src/programs/automation-studio/runtime/conversations/instructions/closest.ts` | - |
| `AutomationStudioCommandConsumptionOwner` | Type | `packages/fluxiq/src/programs/automation-studio/storage/project/command-ledger/contracts.ts` | Injected trusted owner resolves only privately registered, same-incarnation tickets. |
| `AutomationStudioCommandLedgerMutationProof` | Type | `packages/fluxiq/src/programs/automation-studio/storage/project/command-ledger/contracts.ts` | - |
| `AutomationStudioCommandLedgerOperation` | Type | `packages/fluxiq/src/programs/automation-studio/storage/project/command-ledger/contracts.ts` | - |
| `AutomationStudioCommandRunAdmission` | Class | `packages/fluxiq/src/programs/automation-studio/storage/project/command-ledger/admission.ts` | Nominal handle only. Authority requires registration in the exact issuing store. |
| `AutomationStudioCommandRunObservation` | Type | `packages/fluxiq/src/programs/automation-studio/storage/project/command-ledger/contracts.ts` | Informational observations cannot grant admission or consumed-result clearance. |
| `automationStudioComparableInstructionText` | Value | `packages/fluxiq/src/programs/automation-studio/runtime/action-permissions/instruction-quote/comparable.ts` | - |
| `AutomationStudioComparatorDefinition` | Type | `packages/fluxiq/src/programs/automation-studio/nodes/importer-sdk.ts` | - |
| `AutomationStudioComparatorImplementation` | Type | `packages/fluxiq/src/programs/automation-studio/nodes/importer-sdk.ts` | - |
| `AutomationStudioCompiledArtifactManifest` | Type | `packages/fluxiq/src/programs/automation-studio/storage/project/compiled-plan-store.ts` | - |
| `AutomationStudioCompiledFlowPlan` | Type | `packages/fluxiq/src/programs/automation-studio/dsl/contracts.ts` | - |
| `AutomationStudioCompiledPlan` | Type | `packages/fluxiq/src/programs/automation-studio/runtime/compiled-plan.ts` | - |
| `AutomationStudioCompiledPlanEdge` | Type | `packages/fluxiq/src/programs/automation-studio/runtime/compiled-plan.ts` | - |
| `AutomationStudioCompiledPlanInstruction` | Type | `packages/fluxiq/src/programs/automation-studio/runtime/compiled-plan.ts` | - |
| `AutomationStudioCompiledPlanNode` | Type | `packages/fluxiq/src/programs/automation-studio/runtime/compiled-plan.ts` | - |
| `AutomationStudioCompiledPlanStoreOptions` | Type | `packages/fluxiq/src/programs/automation-studio/storage/project/compiled-plan-store.ts` | - |
| `AutomationStudioCompiledRouteRule` | Type | `packages/fluxiq/src/programs/automation-studio/runtime/router-runtime.ts` | - |
| `AutomationStudioConfigArtifact` | Type | `packages/fluxiq/src/programs/automation-studio/model/artifacts.ts` | - |
| `automationStudioConsequencesInOrder` | Value | `packages/fluxiq/src/programs/automation-studio/runtime/action-permissions/consequences.ts` | - |
| `automationStudioContinuationAfterFailure` | Value | `packages/fluxiq/src/programs/automation-studio/runtime/executor/defensive/continuation.ts` | - |
| `AutomationStudioConversation` | Type | `packages/fluxiq/src/programs/automation-studio/runtime/conversations/thread.ts` | One thread. `revision` rises on every turn and every answer, and is what the project change feed carries, so a reader that saw revision N knows it has not seen what produced N+1. |
| `AutomationStudioConversationAmbient` | Type | `packages/fluxiq/src/programs/automation-studio/runtime/conversations/context/storage.ts` | The chat thread a unit of work was started from. |
| `AutomationStudioConversationAnswer` | Type | `packages/fluxiq/src/programs/automation-studio/runtime/conversations/ask.ts` | - |
| `automationStudioConversationAnswerFits` | Value | `packages/fluxiq/src/programs/automation-studio/runtime/conversations/ask.ts` | - |
| `automationStudioConversationAnswerFromWords` | Value | `packages/fluxiq/src/programs/automation-studio/runtime/conversations/commands/answer-words.ts` | - |
| `AutomationStudioConversationAnswerInput` | Type | `packages/fluxiq/src/programs/automation-studio/runtime/conversations/inputs.ts` | - |
| `AutomationStudioConversationAnswerKind` | Type | `packages/fluxiq/src/programs/automation-studio/runtime/conversations/ask.ts` | - |
| `AutomationStudioConversationAnswerRequest` | Type | `packages/fluxiq/src/programs/automation-studio/runtime/conversations/conversations.ts` | - |
| `AutomationStudioConversationApplyResult` | Type | `packages/fluxiq/src/programs/automation-studio/runtime/conversations/commands/apply.ts` | - |
| `AutomationStudioConversationAsk` | Type | `packages/fluxiq/src/programs/automation-studio/runtime/conversations/ask.ts` | - |
| `AutomationStudioConversationAskControl` | Type | `packages/fluxiq/src/programs/automation-studio/runtime/conversations/ask.ts` | What the ask acts on, as the person would recognise it. Both may be null, as on a permission request. |
| `automationStudioConversationAskFromRow` | Value | `packages/fluxiq/src/programs/automation-studio/runtime/conversations/rows.ts` | - |
| `automationStudioConversationAskInput` | Value | `packages/fluxiq/src/programs/automation-studio/runtime/parking/conversation-port.ts` | - |
| `AutomationStudioConversationAskInput` | Type | `packages/fluxiq/src/programs/automation-studio/runtime/conversations/ask.ts` | What a caller hands the store to raise an ask on a turn. For a permission ask, `askId` is the request's own `requestId` and `permissionRequest` is the request verbatim, so nothing has to be rebuilt to show the person what the gate already said. |
| `automationStudioConversationAskIsConsequential` | Value | `packages/fluxiq/src/programs/automation-studio/runtime/conversations/ask.ts` | - |
| `AutomationStudioConversationAskKind` | Type | `packages/fluxiq/src/programs/automation-studio/runtime/conversations/ask.ts` | - |
| `AutomationStudioConversationAskOption` | Type | `packages/fluxiq/src/programs/automation-studio/runtime/conversations/ask.ts` | One option of a `choice` ask. `id` is what an answer carries back; `label` is what the person reads; `route` is where a parked run goes if this option is the one chosen, overriding the ask's `granted` route for this branch alone. |
| `automationStudioConversationAskOrRefuse` | Value | `packages/fluxiq/src/programs/automation-studio/runtime/conversations/inputs.ts` | - |
| `automationStudioConversationAskRoute` | Value | `packages/fluxiq/src/programs/automation-studio/runtime/conversations/ask.ts` | - |
| `AutomationStudioConversationAskRoutes` | Type | `packages/fluxiq/src/programs/automation-studio/runtime/conversations/ask.ts` | Where a parked run resumes, per answer. Without this an ask can stop a run and not say what stopping meant: "approved" and "rejected" have to name branches at the moment the question is asked, not at the moment it is answered, or the same answer could mean different things to different resumers. `builtin.routine.approval` already carries exactly this shape -- a prompt, a timeout and a route for nobody responding -- and `timeoutMs` and `onTimeout` above are the timeout half of it. A null route means "none named": the run resumes where it parked. Core does not interpret a route id; it carries it for whatever consumes the answer. |
| `AutomationStudioConversationAskRow` | Type | `packages/fluxiq/src/programs/automation-studio/runtime/conversations/rows.ts` | - |
| `AutomationStudioConversationAskStatus` | Type | `packages/fluxiq/src/programs/automation-studio/runtime/conversations/ask.ts` | - |
| `AutomationStudioConversationAskTimeoutAction` | Type | `packages/fluxiq/src/programs/automation-studio/runtime/conversations/ask.ts` | - |
| `AutomationStudioConversationAttachment` | Type | `packages/fluxiq/src/programs/automation-studio/runtime/conversations/turn.ts` | What a turn shows beside its words. `kind` names the renderer; `ref` is what it renders. |
| `AutomationStudioConversationAttachmentAnswer` | Type | `packages/fluxiq/src/programs/automation-studio/runtime/conversations/conversations.ts` | A turn's attachment and, when a resolver is configured, what it refers to. |
| `automationStudioConversationAttachmentOrRefuse` | Value | `packages/fluxiq/src/programs/automation-studio/runtime/conversations/inputs.ts` | - |
| `AutomationStudioConversationAttachmentRequest` | Type | `packages/fluxiq/src/programs/automation-studio/runtime/conversations/conversations.ts` | - |
| `AutomationStudioConversationAttachmentResolver` | Type | `packages/fluxiq/src/programs/automation-studio/runtime/conversations/conversations.ts` | What a turn's attachment actually is, when something can serve it. The thread stores a `kind` and a `ref` and renders nothing, so resolving the reference into a payload belongs to whatever owns the thing referred to -- a dataset page, a stored object, a run's detail. Core wires one of these in; without one, asking for an attachment's payload says so rather than answering with nothing. |
| `AutomationStudioConversationAuthor` | Type | `packages/fluxiq/src/programs/automation-studio/runtime/conversations/turn.ts` | - |
| `automationStudioConversationAuthorsCandidates` | Value | `packages/fluxiq/src/programs/automation-studio/runtime/conversations/commands/build.ts` | - |
| `AutomationStudioConversationAutomationTurnRequest` | Type | `packages/fluxiq/src/programs/automation-studio/runtime/conversations/writer.ts` | One turn Core itself writes, with the ask it carries and the thing it shows. |
| `AutomationStudioConversationBuildResult` | Type | `packages/fluxiq/src/programs/automation-studio/runtime/conversations/commands/build.ts` | - |
| `automationStudioConversationCallCause` | Value | `packages/fluxiq/src/programs/automation-studio/runtime/conversations/commands/progress.ts` | - |
| `AutomationStudioConversationCaller` | Type | `packages/fluxiq/src/programs/automation-studio/runtime/conversations/instructions/model.ts` | Who sent the message: the person's user and the session they sent it from. A model whose key is the person's own releases it against this -- Secret Keys hands a key out only to the live, unlocked session of the user who unlocked it -- so the caller travels with every attempt rather than being assumed. |
| `automationStudioConversationCandidateDraftSaid` | Value | `packages/fluxiq/src/programs/automation-studio/runtime/conversations/commands/build.ts` | - |
| `automationStudioConversationCandidateKeptSaid` | Value | `packages/fluxiq/src/programs/automation-studio/runtime/conversations/commands/build.ts` | - |
| `automationStudioConversationChangedAt` | Value | `packages/fluxiq/src/programs/automation-studio/runtime/conversations/inputs.ts` | - |
| `AutomationStudioConversationCommand` | Type | `packages/fluxiq/src/programs/automation-studio/runtime/conversations/commands/command.ts` | A capability Core runs itself. |
| `AutomationStudioConversationCommandAnnouncementView` | Type | `packages/fluxiq/src/programs/automation-studio/runtime/conversations/commands/command.ts` | What a command's first reply is written from: what was asked, and names the person would use. |
| `AutomationStudioConversationCommandCallResult` | Type | `packages/fluxiq/src/programs/automation-studio/runtime/conversations/commands/command.ts` | What one registry call came back with, in the registry's own shape. |
| `AutomationStudioConversationCommandConfirmation` | Type | `packages/fluxiq/src/programs/automation-studio/runtime/conversations/commands/command.ts` | A question a command leaves in the thread after its result: "apply this?". Granting it runs `capabilityId` with `arguments` through the executor. |
| `AutomationStudioConversationCommandContext` | Type | `packages/fluxiq/src/programs/automation-studio/runtime/conversations/commands/command.ts` | Everything one run of a command works with. |
| `AutomationStudioConversationCommandExecution` | Type | `packages/fluxiq/src/programs/automation-studio/runtime/conversations/commands/command.ts` | `append-turn`'s `response.execution`: what Core did with the capability it chose. `started` means the work is running and its result will arrive in the thread as an automation turn with a `panel-capability-result` attachment. |
| `AutomationStudioConversationCommandHost` | Type | `packages/fluxiq/src/programs/automation-studio/runtime/conversations/commands/command.ts` | What a command needs from the thread: to say something, to find the ask it answers, and to read what the person said. |
| `automationStudioConversationCommandInstruction` | Value | `packages/fluxiq/src/programs/automation-studio/runtime/conversations/commands/argument.ts` | - |
| `AutomationStudioConversationCommandInstruction` | Type | `packages/fluxiq/src/programs/automation-studio/runtime/conversations/commands/argument.ts` | What a command saves as its instruction, and whose words they are. |
| `AutomationStudioConversationCommandOutcome` | Type | `packages/fluxiq/src/programs/automation-studio/runtime/conversations/commands/command.ts` | What one command came to. `summary` is what the thread says. |
| `automationStudioConversationCommandPort` | Value | `packages/fluxiq/src/programs/automation-studio/runtime/conversations/commands/port.ts` | - |
| `AutomationStudioConversationCommandPort` | Type | `packages/fluxiq/src/programs/automation-studio/runtime/conversations/commands/command.ts` | How a command reaches Core: one registry endpoint and its payload. The binding (`port.ts`) supplies the caller's actor and scope and refuses any endpoint that deletes or pays, so a command cannot do what the person could not have done by pressing the control. |
| `automationStudioConversationCommandProgress` | Value | `packages/fluxiq/src/programs/automation-studio/runtime/conversations/commands/progress.ts` | - |
| `AutomationStudioConversationCommandProgress` | Type | `packages/fluxiq/src/programs/automation-studio/runtime/conversations/commands/progress.ts` | - |
| `automationStudioConversationCommandText` | Value | `packages/fluxiq/src/programs/automation-studio/runtime/conversations/commands/argument.ts` | - |
| `automationStudioConversationCommandVocabulary` | Value | `packages/fluxiq/src/programs/automation-studio/runtime/conversations/commands/vocabulary.ts` | - |
| `automationStudioConversationCommandWork` | Object | `packages/fluxiq/src/programs/automation-studio/runtime/conversations/commands/work.ts` | - |
| `AutomationStudioConversationDecision` | Type | `packages/fluxiq/src/programs/automation-studio/runtime/conversations/instructions/decision.ts` | - |
| `AutomationStudioConversationDecisionContext` | Type | `packages/fluxiq/src/programs/automation-studio/runtime/conversations/instructions/invocation.ts` | What Core knows while deciding: the panel's vocabulary, the project's Flows, and what is on screen. |
| `AutomationStudioConversationDecisionSource` | Type | `packages/fluxiq/src/programs/automation-studio/runtime/conversations/instructions/decision.ts` | Who decided: the model, or Core matching the words itself because the model could not be used. |
| `automationStudioConversationEffectiveCaller` | Value | `packages/fluxiq/src/programs/automation-studio/runtime/conversations/commands/caller.ts` | - |
| `AutomationStudioConversationEffectiveCaller` | Type | `packages/fluxiq/src/programs/automation-studio/runtime/conversations/commands/caller.ts` | - |
| `automationStudioConversationFallbackDecision` | Value | `packages/fluxiq/src/programs/automation-studio/runtime/conversations/instructions/fallback.ts` | - |
| `automationStudioConversationFlowMentioned` | Value | `packages/fluxiq/src/programs/automation-studio/runtime/conversations/instructions/flows.ts` | - |
| `automationStudioConversationFlowNamed` | Value | `packages/fluxiq/src/programs/automation-studio/runtime/conversations/instructions/flows.ts` | - |
| `AutomationStudioConversationFlowReference` | Type | `packages/fluxiq/src/programs/automation-studio/runtime/conversations/instructions/decision.ts` | A Flow in the project, as a person or a model would name it. |
| `automationStudioConversationFlowWords` | Value | `packages/fluxiq/src/programs/automation-studio/runtime/conversations/instructions/flows.ts` | - |
| `automationStudioConversationFromRow` | Value | `packages/fluxiq/src/programs/automation-studio/runtime/conversations/rows.ts` | - |
| `automationStudioConversationIdOrRefuse` | Value | `packages/fluxiq/src/programs/automation-studio/runtime/conversations/inputs.ts` | - |
| `AutomationStudioConversationInstructionAnswer` | Type | `packages/fluxiq/src/programs/automation-studio/runtime/conversations/instructions/request.ts` | The person's turn, stored first, and what it became. `response` is null only when the answer could not be written into the thread; `problem` then says why in words, and the person's own turn is still there. |
| `AutomationStudioConversationInstructionRequest` | Type | `packages/fluxiq/src/programs/automation-studio/runtime/conversations/instructions/request.ts` | A person's turn that is also read as an instruction: the panel's vocabulary, the project's Flows and what is on screen travel with it. |
| `automationStudioConversationInstructions` | Value | `packages/fluxiq/src/programs/automation-studio/runtime/conversations/instructions/prompt.ts` | - |
| `AutomationStudioConversationInterpretation` | Type | `packages/fluxiq/src/programs/automation-studio/runtime/conversations/instructions/decision.ts` | A decision, how it was reached, and why the model was not the one to reach it when it was not. |
| `AutomationStudioConversationInterpretInput` | Type | `packages/fluxiq/src/programs/automation-studio/runtime/conversations/instructions/interpret.ts` | - |
| `AutomationStudioConversationInterpretLimits` | Type | `packages/fluxiq/src/programs/automation-studio/runtime/conversations/instructions/interpret.ts` | - |
| `AutomationStudioConversationInvocation` | Type | `packages/fluxiq/src/programs/automation-studio/runtime/conversations/instructions/decision.ts` | A capability to run, with everything Core could fill in already filled. |
| `automationStudioConversationInvocationDecision` | Value | `packages/fluxiq/src/programs/automation-studio/runtime/conversations/instructions/invocation.ts` | - |
| `AutomationStudioConversationListInput` | Type | `packages/fluxiq/src/programs/automation-studio/runtime/conversations/inputs.ts` | - |
| `AutomationStudioConversationListRequest` | Type | `packages/fluxiq/src/programs/automation-studio/runtime/conversations/conversations.ts` | - |
| `AutomationStudioConversationModel` | Type | `packages/fluxiq/src/programs/automation-studio/runtime/conversations/instructions/model.ts` | - |
| `AutomationStudioConversationModelExecution` | Type | `packages/fluxiq/src/programs/automation-studio/runtime/conversations/instructions/model.ts` | - |
| `automationStudioConversationModelProblem` | Value | `packages/fluxiq/src/programs/automation-studio/runtime/conversations/instructions/interpret.ts` | - |
| `AutomationStudioConversationModelRequest` | Type | `packages/fluxiq/src/programs/automation-studio/runtime/conversations/instructions/model.ts` | - |
| `automationStudioConversationModelTranscript` | Value | `packages/fluxiq/src/programs/automation-studio/runtime/conversations/instructions/request.ts` | - |
| `AutomationStudioConversationModelTurn` | Type | `packages/fluxiq/src/programs/automation-studio/runtime/conversations/instructions/model.ts` | One turn of the thread as the model reads it. `panel` is a record of what the panel did, written on the person's behalf. |
| `AutomationStudioConversationOnScreen` | Type | `packages/fluxiq/src/programs/automation-studio/runtime/conversations/instructions/decision.ts` | What the panel has open while the person writes. Every field may be absent. |
| `AutomationStudioConversationOpenInput` | Type | `packages/fluxiq/src/programs/automation-studio/runtime/conversations/inputs.ts` | - |
| `AutomationStudioConversationOpenRequest` | Type | `packages/fluxiq/src/programs/automation-studio/runtime/conversations/writer.ts` | Opening a subject's thread. Without `conversationId` the holder mints one. |
| `automationStudioConversationPageShown` | Value | `packages/fluxiq/src/programs/automation-studio/runtime/conversations/commands/page.ts` | - |
| `AutomationStudioConversationParkingHost` | Type | `packages/fluxiq/src/programs/automation-studio/runtime/parking/conversation-port.ts` | What carrying a question to a person takes: a thread to write in, and the ask read back as it now stands. |
| `automationStudioConversationParkingPort` | Value | `packages/fluxiq/src/programs/automation-studio/runtime/parking/conversation-port.ts` | - |
| `AutomationStudioConversationParkingPortInput` | Type | `packages/fluxiq/src/programs/automation-studio/runtime/parking/conversation-port.ts` | - |
| `AutomationStudioConversationParkingRequest` | Type | `packages/fluxiq/src/programs/automation-studio/runtime/conversations/conversations.ts` | A parking port bound to one subject's thread: where a run's questions go and where their answers come back from. |
| `automationStudioConversationPermissionAsk` | Value | `packages/fluxiq/src/programs/automation-studio/runtime/conversations/writer.ts` | - |
| `AutomationStudioConversationPermissionAskOptions` | Type | `packages/fluxiq/src/programs/automation-studio/runtime/conversations/writer.ts` | How a permission ask behaves while it waits. `parks` defaults to true: a question that ends the run is what this replaces. |
| `AutomationStudioConversationPersonTurnRequest` | Type | `packages/fluxiq/src/programs/automation-studio/runtime/conversations/conversations.ts` | A person's own turn, written through the API. |
| `automationStudioConversationPersonWords` | Value | `packages/fluxiq/src/programs/automation-studio/runtime/conversations/person-words.ts` | - |
| `automationStudioConversationPlainCause` | Value | `packages/fluxiq/src/programs/automation-studio/runtime/conversations/commands/progress.ts` | - |
| `AutomationStudioConversationReadInput` | Type | `packages/fluxiq/src/programs/automation-studio/runtime/conversations/inputs.ts` | - |
| `AutomationStudioConversationReadRequest` | Type | `packages/fluxiq/src/programs/automation-studio/runtime/conversations/conversations.ts` | - |
| `AutomationStudioConversationResponse` | Type | `packages/fluxiq/src/programs/automation-studio/runtime/conversations/instructions/decision.ts` | What the endpoint answers with after a person's turn, beside the turn itself. |
| `AutomationStudioConversationResponseWrite` | Type | `packages/fluxiq/src/programs/automation-studio/runtime/conversations/instructions/respond.ts` | - |
| `AutomationStudioConversationResponseWritten` | Type | `packages/fluxiq/src/programs/automation-studio/runtime/conversations/instructions/respond.ts` | - |
| `AutomationStudioConversationRow` | Type | `packages/fluxiq/src/programs/automation-studio/runtime/conversations/rows.ts` | - |
| `AutomationStudioConversations` | Class | `packages/fluxiq/src/programs/automation-studio/runtime/conversations/conversations.ts` | - |
| `automationStudioConversationSaysWhatToDo` | Value | `packages/fluxiq/src/programs/automation-studio/runtime/conversations/instructions/says-what-to-do.ts` | - |
| `automationStudioConversationShortTextOrRefuse` | Value | `packages/fluxiq/src/programs/automation-studio/runtime/conversations/inputs.ts` | - |
| `AutomationStudioConversationStatus` | Type | `packages/fluxiq/src/programs/automation-studio/runtime/conversations/thread.ts` | - |
| `AutomationStudioConversationSubject` | Type | `packages/fluxiq/src/programs/automation-studio/runtime/conversations/thread.ts` | What the thread is about. For `project` the id is the project's own id. |
| `AutomationStudioConversationSubjectKind` | Type | `packages/fluxiq/src/programs/automation-studio/runtime/conversations/thread.ts` | - |
| `automationStudioConversationTextOrRefuse` | Value | `packages/fluxiq/src/programs/automation-studio/runtime/conversations/inputs.ts` | - |
| `AutomationStudioConversationThread` | Type | `packages/fluxiq/src/programs/automation-studio/runtime/conversations/thread.ts` | A thread and the turns a reader asked for: everything, or everything after `sinceTurnId`. |
| `AutomationStudioConversationThreadPage` | Type | `packages/fluxiq/src/programs/automation-studio/runtime/conversations/whole-thread.ts` | One page of a thread, as `AutomationStudioConversationStore.getConversation` and the service's own reader return it. |
| `AutomationStudioConversationTurn` | Type | `packages/fluxiq/src/programs/automation-studio/runtime/conversations/turn.ts` | - |
| `automationStudioConversationTurnFromRow` | Value | `packages/fluxiq/src/programs/automation-studio/runtime/conversations/rows.ts` | - |
| `AutomationStudioConversationTurnInput` | Type | `packages/fluxiq/src/programs/automation-studio/runtime/conversations/inputs.ts` | - |
| `AutomationStudioConversationTurnRow` | Type | `packages/fluxiq/src/programs/automation-studio/runtime/conversations/rows.ts` | - |
| `AutomationStudioConversationUnlockedSessionResolver` | Type | `packages/fluxiq/src/programs/automation-studio/runtime/conversations/commands/caller.ts` | The person's live unlocked session, or null. Bound to Secret Keys in production. |
| `automationStudioConversationWholeThread` | Value | `packages/fluxiq/src/programs/automation-studio/runtime/conversations/whole-thread.ts` | - |
| `AutomationStudioConversationWordsAnswer` | Type | `packages/fluxiq/src/programs/automation-studio/runtime/conversations/commands/answer-words.ts` | - |
| `automationStudioConversationWriter` | Value | `packages/fluxiq/src/programs/automation-studio/runtime/conversations/writer.ts` | - |
| `AutomationStudioConversationWriter` | Type | `packages/fluxiq/src/programs/automation-studio/runtime/conversations/writer.ts` | One subject's thread, bound. Core posts turns and raises asks through this and nothing else. |
| `AutomationStudioConversationWriterHost` | Type | `packages/fluxiq/src/programs/automation-studio/runtime/conversations/writer.ts` | What a writer needs from whatever holds the store. The conversations collaborator satisfies it. |
| `AutomationStudioConversationWriterRequest` | Type | `packages/fluxiq/src/programs/automation-studio/runtime/conversations/conversations.ts` | - |
| `automationStudioCoreLoopStageInstructionId` | Value | `packages/fluxiq/src/programs/automation-studio/runtime/llm/stages/instructions.ts` | - |
| `automationStudioCouldNotRun` | Value | `packages/fluxiq/src/programs/automation-studio/runtime/executor/state-routing/could-not-run.ts` | - |
| `AutomationStudioCrashInjectionEvidence` | Type | `packages/fluxiq/src/programs/automation-studio/testing/scale-certification.ts` | - |
| `AutomationStudioCriticalQueryEvidence` | Type | `packages/fluxiq/src/programs/automation-studio/testing/scale-certification.ts` | - |
| `AutomationStudioCursorPage` | Type | `packages/fluxiq/src/programs/automation-studio/storage/catalog.ts` | - |
| `automationStudioCustomNodeFolders` | Object | `packages/fluxiq/src/programs/automation-studio/nodes/layout.ts` | - |
| `automationStudioCustomNodeRoot` | Object | `packages/fluxiq/src/programs/automation-studio/nodes/layout.ts` | - |
| `automationStudioDecisionAppliedAutomatically` | Value | `packages/fluxiq/src/programs/automation-studio/runtime/durable-behavior/durable-behavior-changed.ts` | - |
| `automationStudioDecisionAwaitsJudgedRun` | Value | `packages/fluxiq/src/programs/automation-studio/runtime/durable-behavior/judged-decision.ts` | - |
| `automationStudioDeclaredConsequences` | Value | `packages/fluxiq/src/programs/automation-studio/runtime/action-permissions/declared.ts` | - |
| `automationStudioDeclaredNothingLasting` | Value | `packages/fluxiq/src/programs/automation-studio/runtime/action-permissions/declared.ts` | - |
| `automationStudioDeclinedRepairAttempt` | Value | `packages/fluxiq/src/programs/automation-studio/runtime/recovery/annotation/patches.ts` | - |
| `AutomationStudioDeepSeekModel` | Type | `packages/fluxiq/src/programs/automation-studio/runtime/llm/deepseek/models.ts` | - |
| `automationStudioDeepSeekModelRefusal` | Value | `packages/fluxiq/src/programs/automation-studio/runtime/llm/deepseek/models.ts` | - |
| `AutomationStudioDeepSeekPanelCommandOptions` | Type | `packages/fluxiq/src/programs/automation-studio/runtime/llm/deepseek/panel-command.ts` | - |
| `AutomationStudioDeepSeekProviderOptions` | Type | `packages/fluxiq/src/programs/automation-studio/runtime/llm/deepseek/provider.ts` | - |
| `AutomationStudioDefenceEntry` | Type | `packages/fluxiq/src/programs/automation-studio/runtime/executor/defensive/ledger.ts` | One fault the run met, and what became of it. |
| `automationStudioDefenceLedger` | Value | `packages/fluxiq/src/programs/automation-studio/runtime/executor/defensive/ledger.ts` | - |
| `AutomationStudioDefenceLedger` | Type | `packages/fluxiq/src/programs/automation-studio/runtime/executor/defensive/ledger.ts` | The run-scoped record of every fault met, and the waiting allowance spent on them. |
| `AutomationStudioDefenceOutcome` | Type | `packages/fluxiq/src/programs/automation-studio/runtime/executor/defensive/ledger.ts` | What the run did about one fault. |
| `AutomationStudioDefenceSummary` | Type | `packages/fluxiq/src/programs/automation-studio/runtime/executor/defensive/ledger.ts` | What one run survived, carried on its trace. A fault that was absorbed and left no mark is the failure mode this repository keeps meeting: a reason computed and discarded, a run that looks clean and a person who cannot tell a first-attempt success from a third. Every assessment lands here, absorbed or not. |
| `automationStudioDefinitionVerifiesState` | Value | `packages/fluxiq/src/programs/automation-studio/runtime/flow-change/contracts.ts` | - |
| `AutomationStudioDeleteProjectUiCacheRequest` | Type | `packages/fluxiq/src/programs/automation-studio/api/contracts/ui-cache.ts` | - |
| `AutomationStudioDeleteProjectUiCacheResponse` | Type | `packages/fluxiq/src/programs/automation-studio/api/contracts/ui-cache.ts` | - |
| `AutomationStudioDeleteReusableLlmContextRequest` | Type | `packages/fluxiq/src/programs/automation-studio/api/contracts/llm.ts` | - |
| `automationStudioDestructiveConsequences` | Value | `packages/fluxiq/src/programs/automation-studio/runtime/action-permissions/destructive.ts` | - |
| `AutomationStudioDeterministicPath` | Type | `packages/fluxiq/src/programs/automation-studio/model/flow-adaptation.ts` | The `after` value of an `insert_deterministic_path` patch: the nodes to insert, and optionally the node the path rejoins once they succeed. The patch's `targetId` is the node that failed. Applying it wires that node's `failed` port into `nodes[0]`, chains each node's `success` port into the next and, when `returnToNodeId` is set, chains the last node's `success` port back into that node. Every inserted node is therefore reachable from the failure it recovers, and only from it, so the recovery ladder's existing `deterministic_path` candidate picks the new failed edge up with no executor change at all. |
| `AutomationStudioDeterministicPathNode` | Type | `packages/fluxiq/src/programs/automation-studio/model/flow-adaptation.ts` | One action node a deterministic recovery path inserts into the graph it repairs. It is a whole node, not a hint: a definition the node runtime can dispatch, the parameters it runs with, the target it acts on, and the expectation its transition is compared against. `edit_recovery` carried only `actionDefinitionIds`, which named definitions but said nothing about what to run them on, so no applier could build a node from it. `target` is written through `actionTargetParameterValues`, so a policy action is re-pointed inside its output payload exactly as an `edit_action_target` patch re-points one, and `expectation` merges over the parameters. |
| `automationStudioDispatchWithNodeRetries` | Value | `packages/fluxiq/src/programs/automation-studio/runtime/executor/outside-graph/retries.ts` | - |
| `AutomationStudioDocumentationEvidence` | Type | `packages/fluxiq/src/programs/automation-studio/testing/scale-certification.ts` | - |
| `AutomationStudioDocumentIdentity` | Type | `packages/fluxiq/src/programs/automation-studio/storage/ids.ts` | - |
| `AutomationStudioEffectiveInstructionSet` | Type | `packages/fluxiq/src/programs/automation-studio/storage/project/flow-resource-repository.ts` | - |
| `AutomationStudioElementMatcher` | Type | `packages/fluxiq/src/programs/automation-studio/fingerprinting/element-fingerprint.ts` | - |
| `AutomationStudioElementTarget` | Type | `packages/fluxiq/src/programs/automation-studio/model/action-element-target.ts` | - |
| `AutomationStudioElementTargetCandidate` | Type | `packages/fluxiq/src/programs/automation-studio/model/action-element-target.ts` | - |
| `AutomationStudioElementTargetFingerprint` | Type | `packages/fluxiq/src/programs/automation-studio/model/action-element-target.ts` | - |
| `AutomationStudioElementTargetSelection` | Type | `packages/fluxiq/src/programs/automation-studio/model/action-element-target.ts` | - |
| `AutomationStudioElementTargetSource` | Type | `packages/fluxiq/src/programs/automation-studio/model/action-element-target.ts` | - |
| `AutomationStudioElementTargetValidationIssue` | Type | `packages/fluxiq/src/programs/automation-studio/model/action-element-target.ts` | - |
| `AutomationStudioElementTargetValidationResult` | Type | `packages/fluxiq/src/programs/automation-studio/model/action-element-target.ts` | - |
| `AutomationStudioEventChunkDocument` | Type | `packages/fluxiq/src/programs/automation-studio/storage/project/event-chunk-store.ts` | - |
| `AutomationStudioEventChunkRecord` | Type | `packages/fluxiq/src/programs/automation-studio/storage/project/event-chunk-store.ts` | - |
| `AutomationStudioEventCursorPage` | Type | `packages/fluxiq/src/programs/automation-studio/storage/project/event-chunk-store.ts` | - |
| `AutomationStudioEventStreamKind` | Type | `packages/fluxiq/src/programs/automation-studio/storage/project/event-chunk-store.ts` | - |
| `AutomationStudioEventStreamWriter` | Type | `packages/fluxiq/src/programs/automation-studio/storage/project/event-stream-writer.ts` | - |
| `automationStudioEvidenceFlowBootstrapCompletionSchema` | Value | `packages/fluxiq/src/programs/automation-studio/runtime/flow-bootstrap/plan/evidence-schema.ts` | - |
| `automationStudioEvidenceFlowBootstrapDraftCompletionSchema` | Value | `packages/fluxiq/src/programs/automation-studio/runtime/flow-bootstrap/plan/evidence-schema.ts` | - |
| `automationStudioEvidenceFlowBootstrapLimitsExceeded` | Value | `packages/fluxiq/src/programs/automation-studio/runtime/flow-bootstrap/plan/profile-limits.ts` | - |
| `automationStudioEvidenceKey` | Value | `packages/fluxiq/src/programs/automation-studio/runtime/llm/harness/failure-evidence.ts` | - |
| `automationStudioExecutableTargetKey` | Value | `packages/fluxiq/src/programs/automation-studio/runtime/llm/harness/evidence-screen.ts` | - |
| `AutomationStudioExecutionMode` | Type | `packages/fluxiq/src/programs/automation-studio/runtime/training-modes.ts` | - |
| `automationStudioExpectationSatisfiedAfterFailure` | Value | `packages/fluxiq/src/programs/automation-studio/runtime/executor/transition-comparison.ts` | - |
| `AutomationStudioExpectedTransition` | Type | `packages/fluxiq/src/programs/automation-studio/runtime/executor/contracts.ts` | - |
| `AutomationStudioExplorationBudget` | Type | `packages/fluxiq/src/programs/automation-studio/runtime/recovery/exploration-budget.ts` | - |
| `AutomationStudioExplorationBudgetLedger` | Class | `packages/fluxiq/src/programs/automation-studio/runtime/recovery/exploration-budget.ts` | One exploration's spending, and the signal that ends it. The ledger is the only thing that knows *why* the loop was stopped. The loop reports `cancelled` for every abort there is, so if the reason were not recorded here at the moment of the refusal, a wall clock, an action cap and a refused action would all arrive downstream as the same word -- which is precisely the collapse this phase exists to prevent. |
| `automationStudioExplorationCompletionOutcome` | Value | `packages/fluxiq/src/programs/automation-studio/runtime/recovery/exploration-outcome.ts` | - |
| `AutomationStudioExplorationDroppedStep` | Type | `packages/fluxiq/src/programs/automation-studio/runtime/exploration-reduction/reduction.ts` | - |
| `AutomationStudioExplorationDropReason` | Type | `packages/fluxiq/src/programs/automation-studio/runtime/exploration-reduction/reduction.ts` | - |
| `automationStudioExplorationEvidenceDigest` | Value | `packages/fluxiq/src/programs/automation-studio/runtime/recovery/progress-guard.ts` | - |
| `AutomationStudioExplorationNoProgressReason` | Type | `packages/fluxiq/src/programs/automation-studio/runtime/recovery/progress-guard.ts` | - |
| `AutomationStudioExplorationOutcome` | Type | `packages/fluxiq/src/programs/automation-studio/runtime/recovery/exploration-outcome.ts` | - |
| `AutomationStudioExplorationProgressGuard` | Class | `packages/fluxiq/src/programs/automation-studio/runtime/recovery/progress-guard.ts` | One exploration's progress, and the verdict on each step it takes. Deliberately knows nothing about aborting, budgets or outcomes. It is handed a step and answers whether that step advanced anything; the budget ledger owns what to do about the answer, because the ledger is the one place that records why an exploration stopped. |
| `AutomationStudioExplorationProgressStep` | Type | `packages/fluxiq/src/programs/automation-studio/runtime/recovery/progress-guard.ts` | - |
| `AutomationStudioExplorationProgressVerdict` | Type | `packages/fluxiq/src/programs/automation-studio/runtime/recovery/progress-guard.ts` | - |
| `AutomationStudioExplorationRecordedCall` | Type | `packages/fluxiq/src/programs/automation-studio/runtime/recovery/exploration-state/recorder.ts` | The part of one action's call this recorder reads. |
| `AutomationStudioExplorationReducedStep` | Type | `packages/fluxiq/src/programs/automation-studio/runtime/exploration-reduction/reduction.ts` | - |
| `AutomationStudioExplorationReduction` | Type | `packages/fluxiq/src/programs/automation-studio/runtime/exploration-reduction/reduction.ts` | - |
| `AutomationStudioExplorationReductionInput` | Type | `packages/fluxiq/src/programs/automation-studio/runtime/exploration-reduction/backward-slice.ts` | - |
| `AutomationStudioExplorationReductionReview` | Type | `packages/fluxiq/src/programs/automation-studio/runtime/recovery/exploration-state/reduction-review.ts` | - |
| `AutomationStudioExplorationReductionReviewInput` | Type | `packages/fluxiq/src/programs/automation-studio/runtime/recovery/exploration-state/reduction-review.ts` | - |
| `AutomationStudioExplorationRefusalClassifier` | Type | `packages/fluxiq/src/programs/automation-studio/runtime/recovery/runtime-exploration.ts` | How a domain translates its own refusal codes into Core's stop reasons. Core cannot read `web.action.rejected.target_unsafe`, and must not learn to: the refusal is semantic and the meaning belongs to whoever owns the medium (decision L3). So the domain is handed an opaque string and answers in Core's closed vocabulary, or answers nothing -- and nothing means ordinary feedback, which the loop already knows how to give back to the model. |
| `automationStudioExplorationScopeAllows` | Value | `packages/fluxiq/src/programs/automation-studio/runtime/recovery/exploration-budget.ts` | - |
| `AutomationStudioExplorationScopePolicy` | Type | `packages/fluxiq/src/programs/automation-studio/runtime/recovery/exploration-budget.ts` | Where an exploration may go. `same_scope` keeps it where the run already is. `allowlist` names the places it may also reach. Both sides are opaque to Core: the domain supplies the strings and calls `automationStudioExplorationScopeAllows` to compare them, so a domain with no pages and no origins expresses its own idea of "where" in exactly this policy. |
| `automationStudioExplorationStateDigestEquals` | Value | `packages/fluxiq/src/programs/automation-studio/runtime/exploration-reduction/state-predicate.ts` | - |
| `AutomationStudioExplorationStateDigestFailure` | Type | `packages/fluxiq/src/programs/automation-studio/runtime/recovery/exploration-state/digest-source.ts` | One moment whose digest was asked for and came back as a thrown error. |
| `AutomationStudioExplorationStateDigestPhase` | Type | `packages/fluxiq/src/programs/automation-studio/runtime/recovery/exploration-state/digest-source.ts` | Which side of a step a digest describes. |
| `AutomationStudioExplorationStateDigestRequest` | Type | `packages/fluxiq/src/programs/automation-studio/runtime/recovery/exploration-state/digest-source.ts` | The moment a digest is being asked for, named by the step it brackets. |
| `AutomationStudioExplorationStateDigestSource` | Type | `packages/fluxiq/src/programs/automation-studio/runtime/recovery/exploration-state/digest-source.ts` | How the caller answers what the state was at one moment. Returning nothing is the honest answer for a moment the caller could not observe: the step is then recorded without digests, the reduction reports it as a gap, and nothing is guessed at. Throwing is also allowed and is recorded as a failure against that moment; it never fails the step, because a step that ran and did something is a fact whether or not the bookkeeping around it worked. |
| `AutomationStudioExplorationStatePredicate` | Type | `packages/fluxiq/src/programs/automation-studio/runtime/exploration-reduction/state-predicate.ts` | A condition on one state, in the only vocabulary an opaque digest supports. `any_state` is not a weaker equality: it is what a reduction with nothing to replay carries, and it says the sequence needs no particular state because it does nothing. |
| `AutomationStudioExplorationStateRecorder` | Class | `packages/fluxiq/src/programs/automation-studio/runtime/recovery/exploration-state/recorder.ts` | One exploration's step record: every action that ran, in order, with the argument it was given and the state either side of it. Bound to one exploration and never reused across two. It holds no state of its own beyond what it recorded, so a caller that binds no digest source still gets the arguments -- which is the half of the record Core can always supply. |
| `automationStudioExplorationStateSatisfies` | Value | `packages/fluxiq/src/programs/automation-studio/runtime/exploration-reduction/state-predicate.ts` | - |
| `AutomationStudioExplorationStateSource` | Type | `packages/fluxiq/src/programs/automation-studio/runtime/exploration-reduction/evidence-loop-trace.ts` | How the caller answers, for one trace entry, what the trace left out. Keyed on the iteration rather than the call id, because an entry the loop answered from what it already held carries no call id and is still a step the receipt should account for. |
| `AutomationStudioExplorationStep` | Type | `packages/fluxiq/src/programs/automation-studio/runtime/exploration-reduction/step.ts` | - |
| `AutomationStudioExplorationStepEffect` | Type | `packages/fluxiq/src/programs/automation-studio/runtime/exploration-reduction/step.ts` | Whether a step only read the state or changed it. The same two words the evidence loop's tool table uses, deliberately: a second vocabulary for the same distinction is how the two come to disagree about one tool. |
| `AutomationStudioExplorationStepOutcome` | Type | `packages/fluxiq/src/programs/automation-studio/runtime/exploration-reduction/step.ts` | - |
| `AutomationStudioExplorationStepRecord` | Type | `packages/fluxiq/src/programs/automation-studio/runtime/recovery/exploration-state/step-record.ts` | - |
| `automationStudioExplorationStepsFromTrace` | Value | `packages/fluxiq/src/programs/automation-studio/runtime/exploration-reduction/evidence-loop-trace.ts` | - |
| `AutomationStudioExplorationStepsFromTraceInput` | Type | `packages/fluxiq/src/programs/automation-studio/runtime/exploration-reduction/evidence-loop-trace.ts` | - |
| `AutomationStudioExplorationStepState` | Type | `packages/fluxiq/src/programs/automation-studio/runtime/exploration-reduction/evidence-loop-trace.ts` | What the caller knows about a step that the exploration trace does not record. |
| `AutomationStudioExplorationStopReason` | Type | `packages/fluxiq/src/programs/automation-studio/runtime/recovery/exploration-outcome.ts` | - |
| `automationStudioExplorationTraceEvent` | Value | `packages/fluxiq/src/programs/automation-studio/runtime/recovery/runtime-exploration.ts` | - |
| `AutomationStudioExplorationTraceGap` | Type | `packages/fluxiq/src/programs/automation-studio/runtime/exploration-reduction/evidence-loop-trace.ts` | - |
| `AutomationStudioExplorationTraceGapEntry` | Type | `packages/fluxiq/src/programs/automation-studio/runtime/exploration-reduction/evidence-loop-trace.ts` | - |
| `AutomationStudioExplorationUnusableDecisionError` | Class | `packages/fluxiq/src/programs/automation-studio/runtime/recovery/unusable-decision.ts` | - |
| `automationStudioExploredEvidenceHandle` | Value | `packages/fluxiq/src/programs/automation-studio/runtime/llm/harness/explored-evidence-label.ts` | - |
| `automationStudioExploredEvidenceLabel` | Value | `packages/fluxiq/src/programs/automation-studio/runtime/llm/harness/explored-evidence-label.ts` | - |
| `AutomationStudioFailedStepRepairPort` | Type | `packages/fluxiq/src/programs/automation-studio/runtime/recovery/refuted-result/step-failure-decision.ts` | The port the verification calls for a run that failed at a step. It answers the run with the attempt recorded and whether the Flow was changed, or nothing when the run was not routed -- in which case nothing was written and the failed run stands exactly as the ladder left it. |
| `AutomationStudioFailureContinuation` | Type | `packages/fluxiq/src/programs/automation-studio/runtime/executor/defensive/continuation.ts` | Whether the Flow carries on past a node that failed for good, and the reason either way. |
| `AutomationStudioFailureRecord` | Type | `packages/contracts/src/failure/record.ts` | A structured failure. Core owns the category names; the producer owns `code`. Carried as `failure` on client-gateway action results, runtime command results, output dispatch results, node execution results, attempt traces, and run action records. Validate any value that crossed a process or storage boundary with `parseAutomationStudioFailureRecord`. |
| `AutomationStudioFailureStage` | Type | `packages/contracts/src/failure/record.ts` | - |
| `AutomationStudioFaultAssessment` | Type | `packages/fluxiq/src/programs/automation-studio/runtime/executor/defensive/contracts.ts` | One fault, classified: what it was, whether the runtime absorbs it, and why. `reason` exists because this repository has been bitten repeatedly by a reason that was computed and thrown away. Every assessment is recorded on the run's defence ledger whether it was absorbed or refused, so a debug can see what the run survived and what it declined to survive. |
| `AutomationStudioFaultDisposition` | Type | `packages/fluxiq/src/programs/automation-studio/runtime/executor/defensive/contracts.ts` | What the default runtime does about one fault. `retry` is the answer the product wants wherever it is honest: a fault the runtime can absorb is absorbed rather than ending a run. `refuse` is reserved for a fault where attempting the same thing again cannot change the outcome, or where attempting it again could act on the world twice. |
| `AutomationStudioFaultEffect` | Type | `packages/fluxiq/src/programs/automation-studio/runtime/executor/defensive/contracts.ts` | Whether the action behind this fault could already have taken effect. `unacted` means the request demonstrably never reached whatever would carry it out -- nothing accepted it, nothing answered it, or the answer says plainly it was not processed. `ambiguous` means it may have been carried out and the answer was lost, which is the case a mutating node must not repeat blindly. |
| `automationStudioFaultFromResultMessage` | Value | `packages/fluxiq/src/programs/automation-studio/runtime/executor/defensive/result-message.ts` | - |
| `automationStudioFaultFromThrownError` | Value | `packages/fluxiq/src/programs/automation-studio/runtime/executor/defensive/thrown-error.ts` | - |
| `AutomationStudioFaultSource` | Type | `packages/fluxiq/src/programs/automation-studio/runtime/executor/defensive/contracts.ts` | Where the classification came from, so a trace never has to be guessed at. |
| `AutomationStudioFeatureFlagEvidence` | Type | `packages/fluxiq/src/programs/automation-studio/testing/scale-certification.ts` | - |
| `AutomationStudioFileStorePaths` | Type | `packages/fluxiq/src/programs/automation-studio/storage/file-store.ts` | - |
| `automationStudioFilterHash` | Value | `packages/fluxiq/src/programs/automation-studio/storage/paging.ts` | - |
| `AutomationStudioFixture` | Type | `packages/fluxiq/src/programs/automation-studio/model/fixtures/recorded-task.ts` | - |
| `AutomationStudioFlowAdaptation` | Type | `packages/fluxiq/src/programs/automation-studio/model/flow-adaptation.ts` | - |
| `AutomationStudioFlowAdaptationStatus` | Type | `packages/fluxiq/src/programs/automation-studio/model/flow-adaptation.ts` | - |
| `AutomationStudioFlowAdaptationValidationResult` | Type | `packages/fluxiq/src/programs/automation-studio/model/flow-adaptation.ts` | One observed run of a change. |
| `AutomationStudioFlowArtifact` | Type | `packages/fluxiq/src/programs/automation-studio/model/flows.ts` | Canonical, owner-independent Flow artifact for new authoring surfaces. It deliberately coexists with AutomationStudioFlowDocument while legacy task/routine compatibility is implemented in the next migration slice. |
| `AutomationStudioFlowBootstrapAcceptance` | Type | `packages/fluxiq/src/programs/automation-studio/runtime/flow-bootstrap/authoring/contracts.ts` | A result the acceptor could read, or the issues that refused it. `script` is what the reply was read from, when it arrived as a Flow script, exactly as the model wrote it. It is carried on both answers because the checks that refuse a plan run after it was accepted, and each of them has to be able to hand the model back its own draft to correct. Every decision is a fresh request with no conversation history, so without this the model is asked to try again with its previous answer absent from the question, and the only thing it can do is write a new one from memory -- which is how a live build "completed again with those steps deleted and the wrong answer in their place". It is the model's own writing and never page content, so handing it back tells the model nothing its own tools had not already told it. A refusal may carry `refusedPlan`: the plan the script got as far as, so a refusal's feedback can read each node's definition out of it and answer with the parameters that node does declare. Nothing builds, validates or persists from it -- it holds at least one refused node by construction -- and it is deliberately not called `plan`, so no caller reaches it by widening a check. |
| `automationStudioFlowBootstrapActionPermissions` | Value | `packages/fluxiq/src/programs/automation-studio/runtime/flow-bootstrap/action-permissions.ts` | - |
| `AutomationStudioFlowBootstrapActionPermissions` | Type | `packages/fluxiq/src/programs/automation-studio/runtime/flow-bootstrap/action-permissions.ts` | - |
| `AutomationStudioFlowBootstrapAnswerability` | Type | `packages/fluxiq/src/programs/automation-studio/runtime/flow-bootstrap/answerability/contracts.ts` | Whether the plan may be proposed, or what the model is told instead. A refusal is not the end of a build. It is fed back exactly as a refused parameter is, and the exploration asks again on the same budget, cost and no-progress guards -- so nothing here can spin. |
| `AutomationStudioFlowBootstrapAnswerabilitySnapshot` | Type | `packages/fluxiq/src/programs/automation-studio/runtime/flow-bootstrap/answerability/contracts.ts` | Content-free capability facts observed when a completed plan is checked. |
| `automationStudioFlowBootstrapAssembledRecordOutput` | Value | `packages/fluxiq/src/programs/automation-studio/runtime/flow-bootstrap/authoring/assembled-record-output.ts` | - |
| `automationStudioFlowBootstrapBlockedSaid` | Value | `packages/fluxiq/src/programs/automation-studio/runtime/flow-bootstrap/unfinished-build/not-done.ts` | - |
| `AutomationStudioFlowBootstrapBudgetBound` | Type | `packages/fluxiq/src/programs/automation-studio/runtime/flow-bootstrap/generation-failure/build-ending.ts` | Which budget ran out. |
| `automationStudioFlowBootstrapBudgetExhausted` | Value | `packages/fluxiq/src/programs/automation-studio/runtime/flow-bootstrap/unfinished-build/budget-exhausted.ts` | - |
| `AutomationStudioFlowBootstrapBudgetSizes` | Type | `packages/fluxiq/src/programs/automation-studio/runtime/flow-bootstrap/unfinished-build/budget-exhausted.ts` | The size of each budget, as the person is told it. |
| `AutomationStudioFlowBootstrapBuildEnding` | Type | `packages/fluxiq/src/programs/automation-studio/runtime/flow-bootstrap/generation-failure/build-ending.ts` | What a build that could not finish says about itself. |
| `AutomationStudioFlowBootstrapBuildPhasesInput` | Type | `packages/fluxiq/src/programs/automation-studio/runtime/flow-bootstrap/unfinished-build/phases.ts` | - |
| `AutomationStudioFlowBootstrapBuildPhasesOutcome` | Type | `packages/fluxiq/src/programs/automation-studio/runtime/flow-bootstrap/unfinished-build/phases.ts` | - |
| `automationStudioFlowBootstrapCandidateKept` | Value | `packages/fluxiq/src/programs/automation-studio/runtime/flow-bootstrap/generation-failure/candidate-kept.ts` | - |
| `AutomationStudioFlowBootstrapCandidateKept` | Type | `packages/fluxiq/src/programs/automation-studio/runtime/flow-bootstrap/generation-failure/candidate-kept.ts` | The candidate behind a failed candidate-mode build. - `draft`: `saved` when the latest revision Core accepted was kept as an unverified draft; `none` when no submission was ever accepted, or the accepted one could not be kept (the Flow or its settings changed, or the build was stopped). - `revision`, `digest`: that latest accepted revision; absent with no accepted submission. - `trials`: the first sixteen trials in the order they ran; `trialCount` counts them all. |
| `AutomationStudioFlowBootstrapCandidateKeptTrial` | Type | `packages/fluxiq/src/programs/automation-studio/runtime/flow-bootstrap/generation-failure/candidate-kept.ts` | One trial of the candidate: the revision it ran, its own run, and the verdict it was given. |
| `AutomationStudioFlowBootstrapCatalogEntry` | Type | `packages/fluxiq/src/programs/automation-studio/runtime/flow-bootstrap/plan/contracts.ts` | - |
| `automationStudioFlowBootstrapCatalogNames` | Value | `packages/fluxiq/src/programs/automation-studio/runtime/flow-bootstrap/plan/catalog-names.ts` | - |
| `AutomationStudioFlowBootstrapCatalogNames` | Type | `packages/fluxiq/src/programs/automation-studio/runtime/flow-bootstrap/plan/contracts.ts` | Every node of a catalog by id and what it does, by category (`./catalog-names.ts`): `{ "<category>": ["<id>: <description>", ...] }`. |
| `AutomationStudioFlowBootstrapCompletionFailureCode` | Type | `packages/fluxiq/src/programs/automation-studio/runtime/llm/harness-options/bootstrap-completion.ts` | - |
| `AutomationStudioFlowBootstrapCompletionVerdict` | Type | `packages/fluxiq/src/programs/automation-studio/runtime/llm/harness-options/bootstrap-completion.ts` | - |
| `AutomationStudioFlowBootstrapContext` | Type | `packages/fluxiq/src/programs/automation-studio/runtime/flow-bootstrap/plan/contracts.ts` | - |
| `AutomationStudioFlowBootstrapCostSpending` | Type | `packages/fluxiq/src/programs/automation-studio/runtime/flow-bootstrap/unfinished-build/budget-exhausted.ts` | What a cost ending knows was spent: what the whole build had spent when its cost budget stopped it, what was held for calls still in flight, and the worst case of the call the purse refused (`../../llm/build-purse/`) -- absent where the provider does not price or no call was refused. The person is told only what was used of the ceiling (R2-U-2); the rest is the purse's record. |
| `AutomationStudioFlowBootstrapCreationSpend` | Type | `packages/fluxiq/src/programs/automation-studio/runtime/flow-bootstrap/creation-spend/record.ts` | - |
| `AutomationStudioFlowBootstrapCurrentRoute` | Type | `packages/fluxiq/src/programs/automation-studio/runtime/flow-bootstrap/plan/routing-context.ts` | - |
| `AutomationStudioFlowBootstrapCurrentStructure` | Type | `packages/fluxiq/src/programs/automation-studio/runtime/flow-bootstrap/plan/routing-context.ts` | - |
| `automationStudioFlowBootstrapDeclaredRecordsPath` | Value | `packages/fluxiq/src/programs/automation-studio/runtime/flow-bootstrap/plan/record-output-contract.ts` | - |
| `automationStudioFlowBootstrapDraftActs` | Value | `packages/fluxiq/src/programs/automation-studio/runtime/llm/harness-options/draft-acts.ts` | - |
| `AutomationStudioFlowBootstrapDraftBasis` | Type | `packages/fluxiq/src/programs/automation-studio/runtime/flow-bootstrap/draft-reduction.ts` | Where a reduced draft's steps came from. |
| `automationStudioFlowBootstrapDraftNodeStep` | Value | `packages/fluxiq/src/programs/automation-studio/runtime/llm/node-tools/draft-step.ts` | - |
| `AutomationStudioFlowBootstrapDraftReduction` | Type | `packages/fluxiq/src/programs/automation-studio/runtime/flow-bootstrap/draft-reduction.ts` | - |
| `automationStudioFlowBootstrapDraftStepGoesToLocation` | Value | `packages/fluxiq/src/programs/automation-studio/runtime/flow-bootstrap/reachability/step-goes-to-location.ts` | - |
| `automationStudioFlowBootstrapDraftStepIsWritable` | Value | `packages/fluxiq/src/programs/automation-studio/runtime/llm/node-tools/draft-step.ts` | - |
| `automationStudioFlowBootstrapDraftUnreadColumnsSentence` | Value | `packages/fluxiq/src/programs/automation-studio/runtime/flow-bootstrap/authoring/instruction-record-columns.ts` | - |
| `automationStudioFlowBootstrapDraftWithStartStep` | Value | `packages/fluxiq/src/programs/automation-studio/runtime/flow-bootstrap/reachability/start-step.ts` | - |
| `AutomationStudioFlowBootstrapDraftWithStartStep` | Type | `packages/fluxiq/src/programs/automation-studio/runtime/flow-bootstrap/reachability/start-step.ts` | A draft as completion should build it, and the step it had to keep, if any. |
| `AutomationStudioFlowBootstrapEdge` | Type | `packages/fluxiq/src/programs/automation-studio/runtime/flow-bootstrap/plan/contracts.ts` | - |
| `automationStudioFlowBootstrapEndingFitted` | Value | `packages/fluxiq/src/programs/automation-studio/runtime/flow-bootstrap/unfinished-build/ending-fit.ts` | - |
| `AutomationStudioFlowBootstrapEndingRoom` | Type | `packages/fluxiq/src/programs/automation-studio/runtime/flow-bootstrap/unfinished-build/ending-fit.ts` | How much room the growing parts of an ending are given: how many acts and choices still to do are quoted (the rest said as "and N more"), how long each quote may be, and how long the judge's words may be. |
| `AutomationStudioFlowBootstrapEndingRoute` | Type | `packages/fluxiq/src/programs/automation-studio/runtime/flow-bootstrap/generation-failure/build-ending.ts` | Which case ended a build, on `not_doable` and `not_finished` (`tried.noRoute`). |
| `AutomationStudioFlowBootstrapEvidenceStep` | Type | `packages/fluxiq/src/programs/automation-studio/runtime/flow-bootstrap/evidence-loop-steps.ts` | One decision as a step: identifiers, counts, a boolean and a code, and nothing else. |
| `automationStudioFlowBootstrapEvidenceSteps` | Value | `packages/fluxiq/src/programs/automation-studio/runtime/flow-bootstrap/evidence-loop-steps.ts` | - |
| `AutomationStudioFlowBootstrapEvidenceTraceRow` | Type | `packages/fluxiq/src/programs/automation-studio/runtime/flow-bootstrap/evidence-loop-steps.ts` | A trace row as a reader of the loop's record sees one. `at` -- the moment the row was recorded, in epoch milliseconds -- was first declared here rather than on the loop's trace type, on the reasoning that a timestamp is a diagnostic and the loop's type is the contract its callers build against. **That is exactly why nothing ever wrote one.** The loop is the only thing that knows when a row happened, and a field the loop's own type does not have is a field the loop cannot push: `run-mug776kx-0214b287` published 41 rows and 0 of them carried a moment, so its 695 seconds stayed one undivided gap in which a ten-minute stall and forty seventeen-second steps look identical. It now lives on `AutomationStudioLlmEvidenceLoopTrace` and the loop stamps every row it pushes. The intersection is kept because it is what every reader of a *stored* row names, and because it still says the true thing: a row from before the loop stamped them carries none, and a reader without one falls back to ordering by `iteration`. |
| `automationStudioFlowBootstrapFailedBuilds` | Value | `packages/fluxiq/src/programs/automation-studio/runtime/flow-bootstrap/generation-failure/failed-builds.ts` | - |
| `AutomationStudioFlowBootstrapFailedBuilds` | Type | `packages/fluxiq/src/programs/automation-studio/runtime/flow-bootstrap/generation-failure/failed-builds.ts` | The latest failed build of each recent Flow. |
| `AutomationStudioFlowBootstrapFailureDiagnostic` | Type | `packages/fluxiq/src/programs/automation-studio/runtime/flow-bootstrap/generation-failure/diagnostic.ts` | - |
| `automationStudioFlowBootstrapFailureDiagnosticOf` | Value | `packages/fluxiq/src/programs/automation-studio/runtime/flow-bootstrap/generation-failure/phase-failure.ts` | - |
| `AutomationStudioFlowBootstrapFailureStage` | Type | `packages/fluxiq/src/programs/automation-studio/runtime/flow-bootstrap/generation-failure/codes.ts` | - |
| `automationStudioFlowBootstrapFailureState` | Value | `packages/fluxiq/src/programs/automation-studio/runtime/flow-bootstrap/generation-failure/failure-state.ts` | - |
| `AutomationStudioFlowBootstrapFailureState` | Type | `packages/fluxiq/src/programs/automation-studio/runtime/flow-bootstrap/generation-failure/failure-state.ts` | The state a diagnostic with a given code and stage carries. `accounting` is what the record may hold rather than what it does: `required` for the harness refusals whose only trace of the call is its accounting, `absent` where naming a cost would claim a call that was not costed, and `optional` everywhere the harness may attach it and a phase failure may not. |
| `automationStudioFlowBootstrapFailureWithTotalProviderCalls` | Value | `packages/fluxiq/src/programs/automation-studio/runtime/flow-bootstrap/generation-failure/with-total-provider-calls.ts` | - |
| `automationStudioFlowBootstrapFinishingVerdict` | Value | `packages/fluxiq/src/programs/automation-studio/runtime/flow-bootstrap/unfinished-build/finishing-verdict.ts` | - |
| `AutomationStudioFlowBootstrapFinishingVerdict` | Type | `packages/fluxiq/src/programs/automation-studio/runtime/flow-bootstrap/unfinished-build/finishing-verdict.ts` | The judged `yes` a build finished on. - `round`: the round whose Flow was judged (0 for the exploration). - `judgedAt`: `finished_round` when the model said the Flow was ready and the loop's own test was judged; `judging_reserve` when a round the judging reserve stopped -- on money or on calls -- had its Flow tested and judged with that reserve; `stopped_short` when a round that stopped short of a completion had its changed Flow tested and judged (t195-w42). - `flowSignature`: a digest (`sha256:` and hex) of the Flow signature of the test the judge read, `null` when it named none. A digest, because the signature itself holds every step's input and target. - `standingFlowSignature`: the same digest of the Flow the build finished with. - `matchesStandingFlow`: whether the two are the same Flow; always `true` on a finished build, recorded so a reader need not take that on trust. - `confidence`: the judge's, where it gave one. - `unconfirmed`: the advice and `patchNeeded` the judge gave beside its yes, where it gave any. Unconfirmed, never a repair directive. |
| `automationStudioFlowBootstrapFinishingVerdictDetail` | Value | `packages/fluxiq/src/programs/automation-studio/runtime/flow-bootstrap/unfinished-build/finishing-verdict.ts` | - |
| `automationStudioFlowBootstrapGenerationCatch` | Value | `packages/fluxiq/src/programs/automation-studio/runtime/flow-bootstrap/generation-failure/generation-catch.ts` | - |
| `AutomationStudioFlowBootstrapGenerationError` | Class | `packages/fluxiq/src/programs/automation-studio/runtime/flow-bootstrap/generation-failure/error.ts` | - |
| `AutomationStudioFlowBootstrapGenerationReadiness` | Type | `packages/fluxiq/src/programs/automation-studio/api/contracts/adaptation.ts` | - |
| `AutomationStudioFlowBootstrapIncompleteDraft` | Type | `packages/fluxiq/src/programs/automation-studio/runtime/flow-bootstrap/incomplete-draft/record.ts` | - |
| `automationStudioFlowBootstrapIncompleteDraftContinuation` | Value | `packages/fluxiq/src/programs/automation-studio/runtime/flow-bootstrap/incomplete-draft/continuation.ts` | - |
| `AutomationStudioFlowBootstrapIncompleteDraftContinuation` | Type | `packages/fluxiq/src/programs/automation-studio/runtime/flow-bootstrap/incomplete-draft/continuation.ts` | What the evidence loop's `draft` is given to continue a stopped build. |
| `automationStudioFlowBootstrapIncompleteDraftKeeper` | Value | `packages/fluxiq/src/programs/automation-studio/runtime/flow-bootstrap/incomplete-draft/keeper.ts` | - |
| `AutomationStudioFlowBootstrapIncompleteDraftKeeper` | Type | `packages/fluxiq/src/programs/automation-studio/runtime/flow-bootstrap/incomplete-draft/keeper.ts` | - |
| `automationStudioFlowBootstrapIncompleteDraftKept` | Value | `packages/fluxiq/src/programs/automation-studio/runtime/flow-bootstrap/incomplete-draft/kept.ts` | - |
| `AutomationStudioFlowBootstrapIncompleteDraftPointer` | Type | `packages/fluxiq/src/programs/automation-studio/runtime/flow-bootstrap/incomplete-draft/keeper.ts` | What a failure says about the draft it kept (`generation-failure/diagnostic.ts`). |
| `AutomationStudioFlowBootstrapInstructionAsk` | Type | `packages/fluxiq/src/programs/automation-studio/runtime/flow-bootstrap/answerability/contracts.ts` | What the instruction plainly asks to be given back, read from its own words. |
| `automationStudioFlowBootstrapInstructionColumns` | Value | `packages/fluxiq/src/programs/automation-studio/runtime/flow-bootstrap/answerability/instruction-columns.ts` | - |
| `AutomationStudioFlowBootstrapIssue` | Type | `packages/fluxiq/src/programs/automation-studio/runtime/flow-bootstrap/plan/contracts.ts` | - |
| `automationStudioFlowBootstrapIssueFeedback` | Value | `packages/fluxiq/src/programs/automation-studio/runtime/flow-bootstrap/plan/issue-feedback.ts` | - |
| `automationStudioFlowBootstrapJudgeAtReserve` | Value | `packages/fluxiq/src/programs/automation-studio/runtime/flow-bootstrap/unfinished-build/reserve-judging.ts` | - |
| `AutomationStudioFlowBootstrapJudgedRecords` | Type | `packages/fluxiq/src/programs/automation-studio/runtime/flow-bootstrap/unfinished-build/contracts.ts` | What the judged test stored, from the summary the judge read (t240): rows stored, rows refused, and stored rows missing a required value. What a repair's progress is measured by (`./progress.ts`). Absent where the judge reported none. |
| `AutomationStudioFlowBootstrapJudgedWrong` | Type | `packages/fluxiq/src/programs/automation-studio/runtime/flow-bootstrap/unfinished-build/contracts.ts` | The judge's account of a Flow it sent back to repair, as the repair is told it. `no` with what it did not do; `unknown` or `not_judged` for a Flow not judged to do it -- the judge unsure, not run, or its yes about a test of another version of the Flow or of none -- with `findings` holding why, and `untestedCarried` naming steps carried from an earlier Flow that its test did not run. |
| `automationStudioFlowBootstrapJudgeFinished` | Value | `packages/fluxiq/src/programs/automation-studio/runtime/flow-bootstrap/unfinished-build/judgement.ts` | - |
| `automationStudioFlowBootstrapJudgeInSeedNumbers` | Value | `packages/fluxiq/src/programs/automation-studio/runtime/flow-bootstrap/unfinished-build/test-step-numbers.ts` | - |
| `AutomationStudioFlowBootstrapJudgement` | Type | `packages/fluxiq/src/programs/automation-studio/runtime/flow-bootstrap/unfinished-build/contracts.ts` | The judgement of a Flow (phase 2), for a round that stopped short or one that finished and was judged wrong: what the test did, how much of the checklist the Flow does, and, after a judge, what it found. Codes, counts, ids and the judge's screened words: what the repair is told, and what an ending is written from. |
| `automationStudioFlowBootstrapJudgementProgress` | Value | `packages/fluxiq/src/programs/automation-studio/runtime/flow-bootstrap/unfinished-build/progress.ts` | - |
| `automationStudioFlowBootstrapJudgementUnmeasured` | Value | `packages/fluxiq/src/programs/automation-studio/runtime/flow-bootstrap/unfinished-build/progress.ts` | - |
| `automationStudioFlowBootstrapJudgementValue` | Value | `packages/fluxiq/src/programs/automation-studio/runtime/flow-bootstrap/unfinished-build/judgement.ts` | - |
| `AutomationStudioFlowBootstrapJudgeReading` | Type | `packages/fluxiq/src/programs/automation-studio/runtime/flow-bootstrap/unfinished-build/contracts.ts` | What one judge call said of a test: what was asked, what the test did, and what to change. Every part optional. |
| `AutomationStudioFlowBootstrapJudgeSpend` | Type | `packages/fluxiq/src/programs/automation-studio/runtime/flow-bootstrap/unfinished-build/contracts.ts` | What one judge of a Flow's test spent, counted against the build's budget. |
| `automationStudioFlowBootstrapJudgeUnfinished` | Value | `packages/fluxiq/src/programs/automation-studio/runtime/flow-bootstrap/unfinished-build/judgement.ts` | - |
| `automationStudioFlowBootstrapJudgeWordsSaid` | Value | `packages/fluxiq/src/programs/automation-studio/runtime/flow-bootstrap/unfinished-build/judge-words.ts` | - |
| `automationStudioFlowBootstrapKeptSaid` | Value | `packages/fluxiq/src/programs/automation-studio/runtime/flow-bootstrap/unfinished-build/kept-said.ts` | - |
| `automationStudioFlowBootstrapLargestSizeLimits` | Value | `packages/fluxiq/src/programs/automation-studio/runtime/flow-bootstrap/plan/size-limits.ts` | - |
| `AutomationStudioFlowBootstrapLastRoute` | Type | `packages/fluxiq/src/programs/automation-studio/runtime/flow-bootstrap/plan/routing-context.ts` | - |
| `AutomationStudioFlowBootstrapLimitExceeded` | Type | `packages/fluxiq/src/programs/automation-studio/runtime/flow-bootstrap/plan/profile-limits.ts` | One limit a completed result exceeded: which, its maximum, what it measured, where, and the setting it comes from when it does. |
| `AutomationStudioFlowBootstrapNameAssumption` | Type | `packages/fluxiq/src/programs/automation-studio/runtime/flow-bootstrap/plan/name-correction-assumption.ts` | - |
| `AutomationStudioFlowBootstrapNextRoundHold` | Type | `packages/fluxiq/src/programs/automation-studio/runtime/flow-bootstrap/unfinished-build/budget-exhausted.ts` | What one more round needs at least under the purse (t240, t254; `./round-funding.ts`): where `judged`, the judging of its Flow -- two judge calls, each at its capped hold (`judgingUsd`) -- and the least its first decision can be held at, its reply reserve alone (`decisionUsd`). `usd` is their sum. The first decision itself is priced from its own request when it is sent. A round is not opened that the purse cannot fund for this. |
| `AutomationStudioFlowBootstrapNode` | Type | `packages/fluxiq/src/programs/automation-studio/runtime/flow-bootstrap/plan/contracts.ts` | - |
| `AutomationStudioFlowBootstrapNoRouteLeft` | Type | `packages/fluxiq/src/programs/automation-studio/runtime/flow-bootstrap/unfinished-build/contracts.ts` | Why no route is left, as the not-doable ending says it: the judge said what was asked can no longer be had (`stillAchievable: "no"`), about a round that was run from its start. The only case since t195-w37 -- a round that got no further is not one (live run `run-murwcaj0-40e56557`, whose judge said "still achievable" and named the fix, and whose build ended "I found no way to"), and nothing is concluded from a round whose Flow holds steps carried from an earlier Flow that never ran in this build, which has no measurement (t194-w70, `./phases.ts`). |
| `automationStudioFlowBootstrapNotDoable` | Value | `packages/fluxiq/src/programs/automation-studio/runtime/flow-bootstrap/unfinished-build/not-doable.ts` | - |
| `automationStudioFlowBootstrapNotDone` | Value | `packages/fluxiq/src/programs/automation-studio/runtime/flow-bootstrap/unfinished-build/not-done.ts` | - |
| `automationStudioFlowBootstrapNotDoneSaid` | Value | `packages/fluxiq/src/programs/automation-studio/runtime/flow-bootstrap/unfinished-build/not-done.ts` | - |
| `automationStudioFlowBootstrapNotFinished` | Value | `packages/fluxiq/src/programs/automation-studio/runtime/flow-bootstrap/unfinished-build/not-finished.ts` | - |
| `automationStudioFlowBootstrapOutputSchema` | Value | `packages/fluxiq/src/programs/automation-studio/runtime/flow-bootstrap/plan/output-schema.ts` | - |
| `AutomationStudioFlowBootstrapPermissionAsk` | Type | `packages/fluxiq/src/programs/automation-studio/runtime/flow-bootstrap/action-permissions.ts` | Where a build's permission question goes, and where its answer comes back from. |
| `automationStudioFlowBootstrapPersonNeeded` | Value | `packages/fluxiq/src/programs/automation-studio/runtime/flow-bootstrap/person-needed.ts` | - |
| `AutomationStudioFlowBootstrapPersonNeeded` | Type | `packages/fluxiq/src/programs/automation-studio/runtime/flow-bootstrap/person-needed.ts` | - |
| `AutomationStudioFlowBootstrapPhaseFailureCode` | Type | `packages/fluxiq/src/programs/automation-studio/runtime/flow-bootstrap/generation-failure/codes.ts` | - |
| `AutomationStudioFlowBootstrapPlan` | Type | `packages/fluxiq/src/programs/automation-studio/runtime/flow-bootstrap/plan/contracts.ts` | - |
| `AutomationStudioFlowBootstrapPlanHandleView` | Type | `packages/fluxiq/src/programs/automation-studio/runtime/llm/harness-options/plan-parameter-resolution.ts` | The view one handle of a plan node came from (header), with the node named `<subflow key>.<node key>`. |
| `AutomationStudioFlowBootstrapPlanLocations` | Type | `packages/fluxiq/src/programs/automation-studio/runtime/flow-bootstrap/reachability/contracts.ts` | What the Flow a build wrote does about where it starts, read off the plan. |
| `AutomationStudioFlowBootstrapPlanParameterResolution` | Type | `packages/fluxiq/src/programs/automation-studio/runtime/llm/harness-options/plan-parameter-resolution.ts` | - |
| `AutomationStudioFlowBootstrapPlanRecordSets` | Type | `packages/fluxiq/src/programs/automation-studio/runtime/flow-bootstrap/answerability/contracts.ts` | What the Flow a build wrote can do with a set of records, read off the plan. |
| `AutomationStudioFlowBootstrapPlanSource` | Type | `packages/fluxiq/src/programs/automation-studio/runtime/flow-bootstrap/plan/profile-limits.ts` | Where the plan came from. `reply`: the model wrote it, and the one-reply limits apply. `draft`: Core assembled it from the steps the build ran, and the Flow's own limits apply. |
| `automationStudioFlowBootstrapProgressAndTestSaid` | Value | `packages/fluxiq/src/programs/automation-studio/runtime/flow-bootstrap/unfinished-build/not-done.ts` | - |
| `AutomationStudioFlowBootstrapProgressMeasure` | Type | `packages/fluxiq/src/programs/automation-studio/runtime/flow-bootstrap/unfinished-build/contracts.ts` | What one round measurably did better than the judged round before it, read only from what the build's test and the judge report (`./progress.ts`): - `acts_done`: more of the checklist's acts and choices have a step; - `acts_proven`: more of those steps worked when the Flow ran from its start; - `test_passes`: the Flow now runs clean from its start where it did not; - `fewer_failed_steps`: it still fails, but at fewer steps; - `more_working_steps`: with no judge on either side, more steps worked when it ran; - `finished_and_judged`: the model said it was ready and its test passed, where the round before stopped short; - `judged_after_unjudged`: the Flow before was not judged to do what was asked or not to (the judge unsure, not run, its yes about another version or no test, steps carried and never run), and this one was judged: a `no` (a `yes` about this Flow finishes the build and never reaches a measure); - `judge_no_longer_refutes`: the Flow before was judged not to do what was asked by two agreeing judge calls (`no`), and this one was not: of its two calls one said it does (`unknown` with `oneCallSaidYes`, `model_disagreed`). A `no` and a call that said nothing (`model_unconfirmed`) is not this measure; - `judge_findings_resolved`: a finding the judge reported before is no longer reported; - `records_stored`: the test stored rows where it stored none; - `fewer_records_refused`: fewer rows were refused, with no fewer stored; - `fewer_records_missing_required`: fewer stored rows lack a required value, with no fewer stored; - `fewer_steps_not_run`: fewer of the Flow's steps are carried from an earlier Flow and never run in this build (`notRunInThisBuild`); - `flow_changed_unmeasured`: the round could not be measured -- steps carried into its Flow never ran in this build, so the Flow could not be run from its start -- and its Flow differs from the one before. Never progress between two rounds that were measured: a Flow merely different is not further. |
| `automationStudioFlowBootstrapProgressSaid` | Value | `packages/fluxiq/src/programs/automation-studio/runtime/flow-bootstrap/unfinished-build/not-done.ts` | - |
| `automationStudioFlowBootstrapProviderStatus` | Value | `packages/fluxiq/src/programs/automation-studio/runtime/flow-bootstrap/generation-failure/failure-state.ts` | - |
| `automationStudioFlowBootstrapProviderUnavailable` | Value | `packages/fluxiq/src/programs/automation-studio/runtime/flow-bootstrap/unfinished-build/provider-unavailable.ts` | - |
| `AutomationStudioFlowBootstrapReachability` | Type | `packages/fluxiq/src/programs/automation-studio/runtime/flow-bootstrap/reachability/contracts.ts` | Whether the plan may be proposed, or what the model is told instead. A refusal is not the end of a build. It is fed back exactly as a refused parameter is, and the exploration asks again on the same budget, cost and no-progress guards -- so nothing here can spin. |
| `automationStudioFlowBootstrapRecordOutputContract` | Value | `packages/fluxiq/src/programs/automation-studio/runtime/flow-bootstrap/plan/record-output-contract.ts` | - |
| `AutomationStudioFlowBootstrapRecordOutputContract` | Type | `packages/fluxiq/src/programs/automation-studio/runtime/flow-bootstrap/plan/record-output-contract.ts` | - |
| `automationStudioFlowBootstrapRecordOutputIssues` | Value | `packages/fluxiq/src/programs/automation-studio/runtime/flow-bootstrap/plan/record-output-contract.ts` | - |
| `automationStudioFlowBootstrapRepairingJudgedSaid` | Value | `packages/fluxiq/src/programs/automation-studio/runtime/flow-bootstrap/unfinished-build/not-done.ts` | - |
| `automationStudioFlowBootstrapRepairingNotRunSaid` | Value | `packages/fluxiq/src/programs/automation-studio/runtime/flow-bootstrap/unfinished-build/not-done.ts` | - |
| `automationStudioFlowBootstrapRepairSeed` | Value | `packages/fluxiq/src/programs/automation-studio/runtime/flow-bootstrap/unfinished-build/judgement.ts` | - |
| `automationStudioFlowBootstrapRepliesUnreadable` | Value | `packages/fluxiq/src/programs/automation-studio/runtime/flow-bootstrap/unfinished-build/replies-unreadable.ts` | - |
| `AutomationStudioFlowBootstrapReserveJudging` | Type | `packages/fluxiq/src/programs/automation-studio/runtime/flow-bootstrap/unfinished-build/reserve-judging.ts` | How judging the Flow a stopped round left went. |
| `AutomationStudioFlowBootstrapRisk` | Type | `packages/fluxiq/src/programs/automation-studio/runtime/flow-bootstrap/plan/contracts.ts` | - |
| `automationStudioFlowBootstrapRoundEnding` | Value | `packages/fluxiq/src/programs/automation-studio/runtime/flow-bootstrap/unfinished-build/round-ending.ts` | - |
| `AutomationStudioFlowBootstrapRoundEnding` | Type | `packages/fluxiq/src/programs/automation-studio/runtime/flow-bootstrap/unfinished-build/contracts.ts` | How one live round ended, read for what the build does next. |
| `AutomationStudioFlowBootstrapRoundProgress` | Type | `packages/fluxiq/src/programs/automation-studio/runtime/flow-bootstrap/unfinished-build/contracts.ts` | What a stopped round had recorded: its rows and what it spent. |
| `AutomationStudioFlowBootstrapRoundRequest` | Type | `packages/fluxiq/src/programs/automation-studio/runtime/flow-bootstrap/unfinished-build/phases.ts` | What one live round is given. |
| `AutomationStudioFlowBootstrapRoundStopped` | Type | `packages/fluxiq/src/programs/automation-studio/runtime/flow-bootstrap/generation-failure/build-ending.ts` | Why one live round stopped: the round's own stop (`../unfinished-build/contracts.ts`, `AutomationStudioFlowBootstrapUnfinishedStop`), or `budget` where a budget stopped it. |
| `AutomationStudioFlowBootstrapRouteCondition` | Type | `packages/fluxiq/src/programs/automation-studio/runtime/flow-bootstrap/plan/route-condition.ts` | A route's condition: Core's `AutomationConditionExpression`, narrowed to the operators the router evaluates, JSON values, and the three plain groups. Every value of it is an `AutomationConditionExpression`. |
| `automationStudioFlowBootstrapRouteIssues` | Value | `packages/fluxiq/src/programs/automation-studio/runtime/flow-bootstrap/plan/route-validation.ts` | - |
| `AutomationStudioFlowBootstrapRoutePath` | Type | `packages/fluxiq/src/programs/automation-studio/runtime/flow-bootstrap/plan/routing-context.ts` | - |
| `AutomationStudioFlowBootstrapRouter` | Type | `packages/fluxiq/src/programs/automation-studio/runtime/flow-bootstrap/plan/contracts.ts` | - |
| `AutomationStudioFlowBootstrapRouteSituation` | Type | `packages/fluxiq/src/programs/automation-studio/runtime/flow-bootstrap/plan/routing-context.ts` | - |
| `AutomationStudioFlowBootstrapRouteTest` | Type | `packages/fluxiq/src/programs/automation-studio/runtime/flow-bootstrap/plan/route-condition.ts` | One test a route makes: a path, an operator, and the value it is tested against. |
| `AutomationStudioFlowBootstrapRoutingContext` | Type | `packages/fluxiq/src/programs/automation-studio/runtime/flow-bootstrap/plan/routing-context.ts` | - |
| `automationStudioFlowBootstrapSeedSignature` | Value | `packages/fluxiq/src/programs/automation-studio/runtime/flow-bootstrap/unfinished-build/seed-signature.ts` | - |
| `automationStudioFlowBootstrapSizeLimits` | Value | `packages/fluxiq/src/programs/automation-studio/runtime/flow-bootstrap/plan/size-limits.ts` | - |
| `AutomationStudioFlowBootstrapSizeLimits` | Type | `packages/fluxiq/src/programs/automation-studio/runtime/flow-bootstrap/plan/size-limits.ts` | Every size bound on one Flow, from its setting. |
| `automationStudioFlowBootstrapSizeLimitsOf` | Value | `packages/fluxiq/src/programs/automation-studio/runtime/flow-bootstrap/plan/size-limits.ts` | - |
| `automationStudioFlowBootstrapSizeLimitsOfContext` | Value | `packages/fluxiq/src/programs/automation-studio/runtime/flow-bootstrap/plan/size-limits.ts` | - |
| `automationStudioFlowBootstrapSizeRefusal` | Value | `packages/fluxiq/src/programs/automation-studio/runtime/flow-bootstrap/plan/size-limits.ts` | - |
| `automationStudioFlowBootstrapSizeSetting` | Value | `packages/fluxiq/src/programs/automation-studio/runtime/flow-bootstrap/plan/size-limits.ts` | - |
| `AutomationStudioFlowBootstrapSizeSetting` | Type | `packages/fluxiq/src/programs/automation-studio/runtime/flow-bootstrap/plan/size-limits.ts` | The setting a size bound comes from, as a refusal names it: where it is stored, where a person changes it, and its value. |
| `automationStudioFlowBootstrapStepsNotRunInThisBuild` | Value | `packages/fluxiq/src/programs/automation-studio/runtime/flow-bootstrap/unfinished-build/not-run.ts` | - |
| `AutomationStudioFlowBootstrapStillAchievable` | Type | `packages/fluxiq/src/programs/automation-studio/runtime/flow-bootstrap/unfinished-build/contracts.ts` | Whether the judge said what was asked can still be had (its diagnosis's `stillAchievable`). Only a `no` ends a build "not doable" (t195-w37: the user's rule, "only if there is absolutely no way"); absent is `unknown`. |
| `AutomationStudioFlowBootstrapStoodStill` | Type | `packages/fluxiq/src/programs/automation-studio/runtime/flow-bootstrap/unfinished-build/contracts.ts` | Why a build with a route still open stopped, as the not-finished ending says it (t240; t195-w37): `no_progress` -- the last round, and `rounds` in a row, measurably did no better than the judged round before (`before`, the judgement before the last); `repeated_unchanged` -- the round ended on refused repeats of the same calls and handed back the Flow it started from, so a second round would only repeat it (run 38, cause C8). |
| `automationStudioFlowBootstrapStopSaid` | Value | `packages/fluxiq/src/programs/automation-studio/runtime/flow-bootstrap/unfinished-build/not-done.ts` | - |
| `AutomationStudioFlowBootstrapSubflow` | Type | `packages/fluxiq/src/programs/automation-studio/runtime/flow-bootstrap/plan/contracts.ts` | - |
| `automationStudioFlowBootstrapSuppliedRecordsPath` | Value | `packages/fluxiq/src/programs/automation-studio/runtime/flow-bootstrap/plan/record-output-contract.ts` | - |
| `AutomationStudioFlowBootstrapTested` | Type | `packages/fluxiq/src/programs/automation-studio/runtime/flow-bootstrap/unfinished-build/contracts.ts` | What the test of the Flow so far found. |
| `automationStudioFlowBootstrapTestReachSaid` | Value | `packages/fluxiq/src/programs/automation-studio/runtime/flow-bootstrap/unfinished-build/not-done.ts` | - |
| `automationStudioFlowBootstrapTestSaid` | Value | `packages/fluxiq/src/programs/automation-studio/runtime/flow-bootstrap/unfinished-build/not-done.ts` | - |
| `AutomationStudioFlowBootstrapTestVerdict` | Type | `packages/fluxiq/src/programs/automation-studio/runtime/flow-bootstrap/unfinished-build/contracts.ts` | The judge's verdict on a finished round: whether what the Flow's test from its start actually did is what the instruction asks. `not_judged` is a judge that could not run -- no cost left, the deadline passed, or it was stopped. `untestedCarried` is the positions of steps carried from an earlier Flow that this test did not run, whose acts it therefore has no evidence of. `flowSignature` is the Flow signature (`automationStudioFlowDraftFlowSignature`) of the test the verdict judged, stamped by the build's judge from the round's observed test; absent when no test was judged. A yes finishes a build only when it equals the signature of the Flow the round finished with (user, 2026-10-02; `./phases.ts`). `unconfirmedReading` is set only on an `unknown` two checks of the test did not settle, where one call judged it not to do what was asked: that call's expected, observed and advice. One judge's reading the other call did not confirm, kept apart from a `no`'s own fields so nothing reads it as one. `oneCallSaidYes` is set only on an `unknown` whose two checks disagreed because one of them said the test does what was asked (`model_disagreed`, `../../result-verification/agreement.ts`): which pair it was, never what either call said. A `no` then nothing said (`model_unconfirmed`) never sets it. What `./progress.ts` measures a judge that stopped refuting by. A `yes` may carry the judge's `confidence` and, under `unconfirmedAdvice`, the advice and `patchNeeded` it gave beside its yes. Both are kept for the record only (`./finishing-verdict.ts`): the build decides from `verdict` and `flowSignature` alone, and a yes's advice is never a repair directive -- it is never put on a judgement, a resume or a re-author's seed (live run `run-murwd8le-79e735a8`, cause 10: a yes with `patchNeeded: true` advised "Remove or reorder step 11", and removing it would have broken the Flow). |
| `automationStudioFlowBootstrapTried` | Value | `packages/fluxiq/src/programs/automation-studio/runtime/flow-bootstrap/unfinished-build/tried.ts` | - |
| `automationStudioFlowBootstrapUnansweredSaid` | Value | `packages/fluxiq/src/programs/automation-studio/runtime/flow-bootstrap/action-permissions.ts` | - |
| `automationStudioFlowBootstrapUnchangedCompleteRefusal` | Value | `packages/fluxiq/src/programs/automation-studio/runtime/flow-bootstrap/unfinished-build/unchanged-complete.ts` | - |
| `AutomationStudioFlowBootstrapUnfinishedStall` | Class | `packages/fluxiq/src/programs/automation-studio/runtime/flow-bootstrap/unfinished-build/unfinished-stall.ts` | - |
| `AutomationStudioFlowBootstrapUnfinishedStop` | Type | `packages/fluxiq/src/programs/automation-studio/runtime/flow-bootstrap/unfinished-build/contracts.ts` | Why a live round stopped without the model saying the Flow was ready, where no budget was the reason. |
| `AutomationStudioFlowBootstrapUnfinishedTest` | Type | `packages/fluxiq/src/programs/automation-studio/runtime/flow-bootstrap/unfinished-build/judgement.ts` | What the caller's test answers: the loop's dry-run gate, over the steps it is given. `judged` is set for a test the build's judge will read next -- the Flow a round left when the judging reserve stopped it, or when it stopped short of a completion (`./reserve-judging.ts`) -- so the caller hands what the test observed to its judge; absent, it is the checklist's test alone. |
| `automationStudioFlowBootstrapUnreadColumnsSentence` | Value | `packages/fluxiq/src/programs/automation-studio/runtime/flow-bootstrap/authoring/instruction-record-columns.ts` | - |
| `automationStudioFlowBootstrapUnsettledForBuild` | Value | `packages/fluxiq/src/programs/automation-studio/runtime/flow-bootstrap/unfinished-build/not-done.ts` | - |
| `automationStudioFlowBootstrapWithJudgeAccount` | Value | `packages/fluxiq/src/programs/automation-studio/runtime/flow-bootstrap/unfinished-build/judgement.ts` | - |
| `automationStudioFlowBootstrapWorkedLiveSaid` | Value | `packages/fluxiq/src/programs/automation-studio/runtime/flow-bootstrap/unfinished-build/not-done.ts` | - |
| `automationStudioFlowBootstrapWrittenPlanBindingIssues` | Value | `packages/fluxiq/src/programs/automation-studio/runtime/flow-bootstrap/authoring/assemble-draft.ts` | - |
| `AutomationStudioFlowBootstrapYesAdvice` | Type | `packages/fluxiq/src/programs/automation-studio/runtime/flow-bootstrap/unfinished-build/contracts.ts` | What a judge that said `yes` also advised: its advice and whether it said a patch was needed. Unconfirmed by construction -- the verdict it came with did not act on it, and nothing checked its premise -- so it is information on the record, never a directive (cause 10, `run-murwd8le-79e735a8`). |
| `automationStudioFlowBootstrapYesNotAboutThisFlow` | Value | `packages/fluxiq/src/programs/automation-studio/runtime/flow-bootstrap/unfinished-build/judgement.ts` | - |
| `AutomationStudioFlowBuildPlan` | Type | `packages/fluxiq/src/programs/automation-studio/runtime/flow-bootstrap/plan/contracts.ts` | Registry-validated, Core-risked and deterministically laid-out plan accepted by Bootstrap Adaptations. |
| `AutomationStudioFlowCandidate` | Type | `packages/fluxiq/src/programs/automation-studio/runtime/flow-bootstrap/candidate/contracts.ts` | Static submission receipt. It grants neither execution nor promotion. |
| `AutomationStudioFlowCandidateSubmission` | Type | `packages/fluxiq/src/programs/automation-studio/runtime/flow-bootstrap/candidate/contracts.ts` | - |
| `AutomationStudioFlowCandidateSubmissionController` | Class | `packages/fluxiq/src/programs/automation-studio/runtime/flow-bootstrap/candidate/submission.ts` | Session-local candidates, separate from discovery and the accepted Flow store. |
| `AutomationStudioFlowCandidateTrialGate` | Class | `packages/fluxiq/src/programs/automation-studio/runtime/flow-bootstrap/candidate/trial-gate.ts` | The model-facing test tool and the completion rule bound to its verdicts. |
| `AutomationStudioFlowCatalogEntry` | Type | `packages/fluxiq/src/programs/automation-studio/model/flow-compatibility.ts` | - |
| `AutomationStudioFlowChangeEntryPoint` | Type | `packages/fluxiq/src/programs/automation-studio/model/flow-adaptation.ts` | Which of the three ways into the flow-improvement loop produced a change. |
| `automationStudioFlowChangeFailureState` | Value | `packages/fluxiq/src/programs/automation-studio/runtime/flow-change/trial.ts` | - |
| `AutomationStudioFlowChangeOrigin` | Type | `packages/fluxiq/src/programs/automation-studio/model/flow-adaptation.ts` | Where a change came from, whichever entry point produced it. A Flow adaptation keeps it at `metadata.origin`, which the typed store saves whole, so it needs no migration; a Flow Bootstrap adaptation keeps it at `origin`. Ids and Core failure signatures only, never page text or values. `parseAutomationStudioFlowChangeOrigin` is the only reader of a stored one. |
| `AutomationStudioFlowChangeProposal` | Type | `packages/fluxiq/src/programs/automation-studio/model/flow-adaptation.ts` | - |
| `AutomationStudioFlowChangeTrialReport` | Type | `packages/fluxiq/src/programs/automation-studio/runtime/flow-change/trial.ts` | - |
| `AutomationStudioFlowChangeTrialRequest` | Type | `packages/fluxiq/src/programs/automation-studio/runtime/flow-change/trial.ts` | - |
| `AutomationStudioFlowChangeValidationKind` | Type | `packages/fluxiq/src/programs/automation-studio/model/flow-adaptation.ts` | How a validation result was observed: a `trial` of the candidate on the live page before it was saved, or a `replay`, a later run that exercised the applied change with no model call. A result written before kinds existed has none and reads as `trial`. A structural check is never a validation result; it stays in `metadata.structuralChecks`. |
| `AutomationStudioFlowCompilation` | Type | `packages/fluxiq/src/programs/automation-studio/dsl/contracts.ts` | - |
| `AutomationStudioFlowCompilerDiagnostic` | Type | `packages/fluxiq/src/programs/automation-studio/dsl/contracts.ts` | - |
| `AutomationStudioFlowDefinition` | Type | `packages/fluxiq/src/programs/automation-studio/dsl/contracts.ts` | Declarative input accepted by defineFlow. It contains data, never callbacks. |
| `AutomationStudioFlowDefinitionMetadata` | Type | `packages/fluxiq/src/programs/automation-studio/dsl/contracts.ts` | Framework-owned identity fields that must survive the generated-source round trip. |
| `AutomationStudioFlowDependency` | Type | `packages/fluxiq/src/programs/automation-studio/dsl/contracts.ts` | - |
| `AutomationStudioFlowDocument` | Type | `packages/fluxiq/src/programs/automation-studio/model/artifacts.ts` | - |
| `automationStudioFlowDraft` | Value | `packages/fluxiq/src/programs/automation-studio/runtime/flow-draft/draft.ts` | - |
| `AutomationStudioFlowDraft` | Type | `packages/fluxiq/src/programs/automation-studio/runtime/flow-draft/draft.ts` | - |
| `AutomationStudioFlowDraftAmendment` | Type | `packages/fluxiq/src/programs/automation-studio/runtime/flow-draft/amendment/types.ts` | One edit to one step of the draft. |
| `AutomationStudioFlowDraftAmendmentChange` | Type | `packages/fluxiq/src/programs/automation-studio/runtime/flow-draft/amendment/changes.ts` | - |
| `AutomationStudioFlowDraftAmendmentRefusal` | Type | `packages/fluxiq/src/programs/automation-studio/runtime/flow-draft/amendment/types.ts` | Why one amendment changed nothing -- or, for `act_on_a_read` and `act_not_done_there`, the one part of it that was not done: the act a read cannot do, or the act the judge says the step does not do, beside the rest, which was; or, for `repeat_taken_off`, a repeat the decision's moves left unable to run. |
| `automationStudioFlowDraftBindablePaths` | Value | `packages/fluxiq/src/programs/automation-studio/runtime/flow-draft/bindable/paths.ts` | - |
| `AutomationStudioFlowDraftBindingContext` | Type | `packages/fluxiq/src/programs/automation-studio/runtime/flow-draft/binding-forms.ts` | The draft an earlier step's output is read against: its steps as they stand now, and the position of the step the form is written into -- absent, a step about to be appended after all of them. `nodeOf` says which outputs a node declares; absent, or for a node it does not know, the assembler checks the output against the registry instead. `stepAt` finds the step at n where the numbers are not the steps' own positions: an amendment's, read against the draft as shown before the decision moved anything (`./amendment/shown-numbering.ts`). |
| `AutomationStudioFlowDraftBindingRefusal` | Type | `packages/fluxiq/src/programs/automation-studio/runtime/flow-draft/binding-forms.ts` | Why a form was not translated, at the dotted path it sits at. For an earlier step's output: no draft to read it against (`step_binding_not_yet`), no step at that position (`step_missing`), that step or one after it (`step_not_earlier`), a step withdrawn, only looked or failed (`step_not_usable`), an output its node does not declare (`step_output_unknown`). |
| `automationStudioFlowDraftClaimAct` | Value | `packages/fluxiq/src/programs/automation-studio/runtime/flow-draft/act-claim.ts` | - |
| `AutomationStudioFlowDraftClaimRefusal` | Type | `packages/fluxiq/src/programs/automation-studio/runtime/flow-draft/amendment/types.ts` | A claim of an act refused as it is made: the act, the judge's sentence, and the step that names the act, when there is one. |
| `AutomationStudioFlowDraftClaimRefused` | Type | `packages/fluxiq/src/programs/automation-studio/runtime/flow-draft/amendment/types.ts` | Asked before an act is claimed on a step: the refusal when the act judge would reject the claim, or nothing when it stands (`../../llm/harness-options/draft-acts.ts`, built on `../../flow-bootstrap/instructed-acts/claim-verdict.ts`). Week report W1: live run `run-mux74k5q-1c3c2127` put a1 on the press of "Spain", one of a1's own options, and was answered "applied". `instead` is a position in `steps` as they stand when it is asked. |
| `AutomationStudioFlowDraftConditionalReason` | Type | `packages/fluxiq/src/programs/automation-studio/runtime/flow-draft/routing.ts` | Why the Flow would not always run a step, one word per kind above: `interruption` (the host says it answered one), `optional`, `only_if`, `check` (the step an `only_if` runs on), `fallback` (the step an `on_failed` falls back to) and `repeat` (a member of a repeating span). |
| `automationStudioFlowDraftConditionalStepIds` | Value | `packages/fluxiq/src/programs/automation-studio/runtime/flow-draft/routing.ts` | - |
| `automationStudioFlowDraftConditionalStepReasons` | Value | `packages/fluxiq/src/programs/automation-studio/runtime/flow-draft/routing.ts` | - |
| `automationStudioFlowDraftControlWords` | Value | `packages/fluxiq/src/programs/automation-studio/runtime/flow-draft/control-words.ts` | - |
| `automationStudioFlowDraftDeclaresLasting` | Value | `packages/fluxiq/src/programs/automation-studio/runtime/flow-draft/verify-only.ts` | - |
| `automationStudioFlowDraftDropReversals` | Value | `packages/fluxiq/src/programs/automation-studio/runtime/flow-draft/reversal.ts` | - |
| `AutomationStudioFlowDraftDryRun` | Type | `packages/fluxiq/src/programs/automation-studio/runtime/flow-draft/dry-run.ts` | One whole replay of the draft. |
| `automationStudioFlowDraftDryRunFeedback` | Value | `packages/fluxiq/src/programs/automation-studio/runtime/flow-draft/dry-run.ts` | - |
| `automationStudioFlowDraftDryRunGate` | Value | `packages/fluxiq/src/programs/automation-studio/runtime/llm/node-tools/dry-run-gate.ts` | - |
| `AutomationStudioFlowDraftDryRunGateInput` | Type | `packages/fluxiq/src/programs/automation-studio/runtime/llm/node-tools/dry-run-gate.ts` | - |
| `automationStudioFlowDraftDryRunIssueCodes` | Value | `packages/fluxiq/src/programs/automation-studio/runtime/flow-draft/dry-run.ts` | - |
| `AutomationStudioFlowDraftDryRunRefusal` | Type | `packages/fluxiq/src/programs/automation-studio/runtime/llm/node-tools/dry-run-gate.ts` | What a gate answers. `undefined` is the only way past it: either the draft replayed clean, or it is not a draft this gate applies to. The other two each end or interrupt the completion the loop was about to accept. A refusal also carries `steps`, the positions it names, beside its codes and not among them (not enumerable), so the build trace and the chat can say which steps stood in the way (`../evidence-loop/completion-attempt.ts`) while a caller comparing refusals by their codes reads them as before. Live run `run-musp39u8-9ac026ab` (R3c) was refused `full_run_required` three times and neither core.log nor the chat said so. |
| `automationStudioFlowDraftDryRunVerdict` | Value | `packages/fluxiq/src/programs/automation-studio/runtime/flow-draft/dry-run.ts` | - |
| `automationStudioFlowDraftEntry` | Value | `packages/fluxiq/src/programs/automation-studio/runtime/flow-draft/entry.ts` | - |
| `AutomationStudioFlowDraftExcusedReason` | Type | `packages/fluxiq/src/programs/automation-studio/runtime/flow-draft/excused.ts` | Why a test passed over a step that did not hold: why the Flow does not always run it, or `withheld`. |
| `automationStudioFlowDraftExcusedWords` | Value | `packages/fluxiq/src/programs/automation-studio/runtime/flow-draft/excused.ts` | - |
| `automationStudioFlowDraftExemptStepIds` | Value | `packages/fluxiq/src/programs/automation-studio/runtime/flow-draft/excused.ts` | - |
| `AutomationStudioFlowDraftFlowSeed` | Type | `packages/fluxiq/src/programs/automation-studio/runtime/llm/node-tools/draft-from-flow.ts` | A Flow read back as a draft: the steps, and which node each one stands for. The map is the half that makes this an edit rather than a replacement. A draft step carries no node id -- it is a record of an action, and an action has no id in a graph -- so the correspondence is kept beside the steps and travels with them to whoever materialises the amended draft (`automationStudioFlowDraftPlanNodeIds`). |
| `automationStudioFlowDraftFlowSignature` | Value | `packages/fluxiq/src/programs/automation-studio/runtime/flow-draft/flow-signature.ts` | - |
| `automationStudioFlowDraftFullRunRequiredFeedback` | Value | `packages/fluxiq/src/programs/automation-studio/runtime/flow-draft/full-run-required.ts` | - |
| `automationStudioFlowDraftHoldsBinding` | Value | `packages/fluxiq/src/programs/automation-studio/runtime/flow-draft/binding-forms.ts` | - |
| `AutomationStudioFlowDraftInput` | Type | `packages/fluxiq/src/programs/automation-studio/runtime/flow-draft/flow-inputs.ts` | One input the draft's Flow takes: its name, the value it is tested with, and the steps using it. |
| `AutomationStudioFlowDraftInputConflict` | Type | `packages/fluxiq/src/programs/automation-studio/runtime/flow-draft/flow-inputs.ts` | One input named with more than one test value: each distinct value, and every step using the name. |
| `automationStudioFlowDraftInputs` | Value | `packages/fluxiq/src/programs/automation-studio/runtime/flow-draft/flow-inputs.ts` | - |
| `automationStudioFlowDraftInterruptionStepIds` | Value | `packages/fluxiq/src/programs/automation-studio/runtime/flow-draft/sometimes-present.ts` | - |
| `automationStudioFlowDraftIsBindingForm` | Value | `packages/fluxiq/src/programs/automation-studio/runtime/flow-draft/binding-forms.ts` | - |
| `automationStudioFlowDraftKeepOpeners` | Value | `packages/fluxiq/src/programs/automation-studio/runtime/flow-draft/opener.ts` | - |
| `AutomationStudioFlowDraftPartRunInput` | Type | `packages/fluxiq/src/programs/automation-studio/runtime/llm/node-tools/run-flow-part.ts` | What a part run needs: the draft, the model's argument, its call id and the loop's executor. |
| `automationStudioFlowDraftPlanNodeIds` | Value | `packages/fluxiq/src/programs/automation-studio/runtime/llm/node-tools/draft-from-flow.ts` | - |
| `automationStudioFlowDraftPrecedingProposedStep` | Value | `packages/fluxiq/src/programs/automation-studio/runtime/flow-draft/routing.ts` | - |
| `automationStudioFlowDraftProposedSteps` | Value | `packages/fluxiq/src/programs/automation-studio/runtime/flow-draft/draft.ts` | - |
| `automationStudioFlowDraftRenderBindings` | Value | `packages/fluxiq/src/programs/automation-studio/runtime/flow-draft/binding-render.ts` | - |
| `automationStudioFlowDraftRepeatIsWhile` | Value | `packages/fluxiq/src/programs/automation-studio/runtime/flow-draft/routing.ts` | - |
| `automationStudioFlowDraftRepeatOrderProblem` | Value | `packages/fluxiq/src/programs/automation-studio/runtime/flow-draft/routing.ts` | - |
| `AutomationStudioFlowDraftRepeatOverRouting` | Type | `packages/fluxiq/src/programs/automation-studio/runtime/flow-draft/routing.ts` | A repeat over a list or a check before the span. |
| `AutomationStudioFlowDraftRepeatWhileRouting` | Type | `packages/fluxiq/src/programs/automation-studio/runtime/flow-draft/routing.ts` | A repeat that runs its span, then again while the span's last step succeeds. |
| `automationStudioFlowDraftReplacingStep` | Value | `packages/fluxiq/src/programs/automation-studio/runtime/flow-draft/amendment/replaced-attempt.ts` | - |
| `automationStudioFlowDraftReplayable` | Value | `packages/fluxiq/src/programs/automation-studio/runtime/flow-draft/dry-run.ts` | - |
| `automationStudioFlowDraftReplayClearedCode` | Value | `packages/fluxiq/src/programs/automation-studio/runtime/llm/node-tools/replay-draft.ts` | - |
| `automationStudioFlowDraftReplayFrom` | Value | `packages/fluxiq/src/programs/automation-studio/runtime/flow-draft/dry-run.ts` | - |
| `AutomationStudioFlowDraftReplayInput` | Type | `packages/fluxiq/src/programs/automation-studio/runtime/llm/node-tools/replay-draft.ts` | What the caller has to lend a replay: the executor. |
| `AutomationStudioFlowDraftReplayMode` | Type | `packages/fluxiq/src/programs/automation-studio/runtime/flow-draft/verify-only.ts` | Whether a replay runs a step again or only checks it. |
| `AutomationStudioFlowDraftReplayOutcome` | Type | `packages/fluxiq/src/programs/automation-studio/runtime/flow-draft/dry-run.ts` | One step's answer to being run again. |
| `automationStudioFlowDraftReplayOutcomeBlocks` | Value | `packages/fluxiq/src/programs/automation-studio/runtime/flow-draft/dry-run.ts` | - |
| `automationStudioFlowDraftReplayOutcomeKey` | Value | `packages/fluxiq/src/programs/automation-studio/runtime/flow-draft/dry-run.ts` | - |
| `automationStudioFlowDraftReplayOutcomeVerified` | Value | `packages/fluxiq/src/programs/automation-studio/runtime/flow-draft/verify-only.ts` | - |
| `automationStudioFlowDraftReplayOutcomeWord` | Value | `packages/fluxiq/src/programs/automation-studio/runtime/flow-draft/verify-only.ts` | - |
| `AutomationStudioFlowDraftReplayPass` | Type | `packages/fluxiq/src/programs/automation-studio/runtime/flow-draft/dry-run.ts` | One pass of a repeated step in a test: which pass, how it answered, and the caller's code. |
| `automationStudioFlowDraftReplayPassWords` | Value | `packages/fluxiq/src/programs/automation-studio/runtime/flow-draft/dry-run.ts` | - |
| `AutomationStudioFlowDraftReplayResult` | Type | `packages/fluxiq/src/programs/automation-studio/runtime/llm/node-tools/replay-draft.ts` | A replay, and the one piece of evidence worth showing the model afterwards. |
| `automationStudioFlowDraftReplaySignature` | Value | `packages/fluxiq/src/programs/automation-studio/runtime/flow-draft/dry-run.ts` | - |
| `AutomationStudioFlowDraftReplayStatus` | Type | `packages/fluxiq/src/programs/automation-studio/runtime/flow-draft/dry-run.ts` | - |
| `automationStudioFlowDraftReplaySteps` | Value | `packages/fluxiq/src/programs/automation-studio/runtime/llm/node-tools/replay-draft.ts` | - |
| `AutomationStudioFlowDraftReplayStepsInput` | Type | `packages/fluxiq/src/programs/automation-studio/runtime/llm/node-tools/replay-draft.ts` | What a run of steps done again needs: the executor, the draft, and the steps. |
| `AutomationStudioFlowDraftReplayStepsResult` | Type | `packages/fluxiq/src/programs/automation-studio/runtime/llm/node-tools/replay-draft.ts` | What a run of steps done again answered: one outcome per step, in order, and what the first that did not replay left. |
| `AutomationStudioFlowDraftRoute` | Type | `packages/fluxiq/src/programs/automation-studio/runtime/flow-draft/route-places/route.ts` | The route the draft shows (D phase 2), from the build's one grounded read of the person's instructions (`../../action-permissions/instruction-route/`), once that read has settled and still matches the instructions: the route they named, in their words, with the words of each place on it in order (`places[0]` is `r1`); or that they named none, so the Flow may start where the work begins. Nothing while the route is unread or could not be read. |
| `automationStudioFlowDraftRouteCoverage` | Value | `packages/fluxiq/src/programs/automation-studio/runtime/flow-draft/route-places/coverage.ts` | - |
| `automationStudioFlowDraftRoutingReferences` | Value | `packages/fluxiq/src/programs/automation-studio/runtime/flow-draft/routing.ts` | - |
| `automationStudioFlowDraftSaidInNumbers` | Value | `packages/fluxiq/src/programs/automation-studio/runtime/flow-draft/amendment/said-numbers.ts` | - |
| `automationStudioFlowDraftSecondCopy` | Value | `packages/fluxiq/src/programs/automation-studio/runtime/flow-draft/second-copy.ts` | - |
| `automationStudioFlowDraftSeedFromFlow` | Value | `packages/fluxiq/src/programs/automation-studio/runtime/llm/node-tools/draft-from-flow.ts` | - |
| `automationStudioFlowDraftSetRoutePlaces` | Value | `packages/fluxiq/src/programs/automation-studio/runtime/flow-draft/route-places/set.ts` | - |
| `automationStudioFlowDraftSettingsRewriteRun` | Value | `packages/fluxiq/src/programs/automation-studio/runtime/flow-draft/amendment/settings-rewrite-run.ts` | - |
| `automationStudioFlowDraftSometimesPresentStepIds` | Value | `packages/fluxiq/src/programs/automation-studio/runtime/flow-draft/sometimes-present.ts` | - |
| `AutomationStudioFlowDraftStep` | Type | `packages/fluxiq/src/programs/automation-studio/runtime/flow-draft/step.ts` | - |
| `automationStudioFlowDraftStepActDone` | Value | `packages/fluxiq/src/programs/automation-studio/runtime/flow-draft/verify-only.ts` | - |
| `automationStudioFlowDraftStepAnsweredInterruption` | Value | `packages/fluxiq/src/programs/automation-studio/runtime/flow-draft/interruption.ts` | - |
| `automationStudioFlowDraftStepById` | Value | `packages/fluxiq/src/programs/automation-studio/runtime/flow-draft/routing.ts` | - |
| `automationStudioFlowDraftStepCarried` | Value | `packages/fluxiq/src/programs/automation-studio/runtime/flow-draft/carried-step/carried-step.ts` | - |
| `AutomationStudioFlowDraftStepChange` | Type | `packages/fluxiq/src/programs/automation-studio/runtime/flow-draft/step.ts` | One line a step changed on the page it stayed on, in the host's words, as the call's own result showed it: a line of text that `appeared` or `went`, one that now `reads` otherwise, or one whose words differ only in a number that `rose` ("Cart (3)" after "Cart (2)"). Page text, screened as a control's words are (`./control-words.ts`); Core reads the words for the person's acts (`../flow-bootstrap/instructed-acts/act-evidence.ts`) and nothing else. |
| `AutomationStudioFlowDraftStepDisposition` | Type | `packages/fluxiq/src/programs/automation-studio/runtime/flow-draft/step.ts` | What the model has since said about a step it took. `taken` is where every step the model runs starts when the model authors the draft (user, 2026-09-30: "IT SHOULD NOT JUST BLINDLY ADD EACH STEP THAT IT TOOK ONE BY ONE IN ORDER"): the step ran and is evidence, and it is not in the Flow until the model adds it -- `add` on the call itself, or an `add` amendment naming it (`./amendment/`). `kept` is a step the model put in the Flow; it is also where every step started under the older transcript rule, which a loop can still be run under to replay a build recorded before (`../llm/loop-configuration.ts`, `draftAuthoring`). The other two are the model's own withdrawals: `dropped` is "this should not be in the result at all", and `exploratory` is "I did this to look around". They are held apart because they are different statements about one step, and a reader of the draft can tell a step that was a mistake from one that was a detour, and both from one the model has simply not added. |
| `AutomationStudioFlowDraftStepEffect` | Type | `packages/fluxiq/src/programs/automation-studio/runtime/flow-draft/step.ts` | Whether a step only read the state or changed it. The same two words the evidence loop's tool table and the exploration reducer use, deliberately: a second vocabulary for the same distinction is how the two come to disagree about one action. |
| `automationStudioFlowDraftStepId` | Value | `packages/fluxiq/src/programs/automation-studio/runtime/flow-draft/routing.ts` | - |
| `automationStudioFlowDraftStepIsAction` | Value | `packages/fluxiq/src/programs/automation-studio/runtime/flow-draft/step.ts` | - |
| `automationStudioFlowDraftStepIsProposable` | Value | `packages/fluxiq/src/programs/automation-studio/runtime/flow-draft/step.ts` | - |
| `automationStudioFlowDraftStepIsProposed` | Value | `packages/fluxiq/src/programs/automation-studio/runtime/flow-draft/step.ts` | - |
| `automationStudioFlowDraftStepMovedTarget` | Value | `packages/fluxiq/src/programs/automation-studio/runtime/flow-draft/verify-only.ts` | - |
| `automationStudioFlowDraftStepOutputsState` | Value | `packages/fluxiq/src/programs/automation-studio/runtime/flow-draft/binding-forms.ts` | - |
| `AutomationStudioFlowDraftStepReplay` | Type | `packages/fluxiq/src/programs/automation-studio/runtime/flow-draft/dry-run.ts` | What a step carries so it can be run again. Both fields are the caller's own and Core reads neither. `from` is how to put the target back the way this step found it; only the first proposed step's is ever used, because that is where a replay starts. `produced` is what the step produced, handed back to the caller on the replay so it -- not Core -- can say whether the replay reproduced it. |
| `automationStudioFlowDraftStepReplayMode` | Value | `packages/fluxiq/src/programs/automation-studio/runtime/flow-draft/verify-only.ts` | - |
| `AutomationStudioFlowDraftStepRouting` | Type | `packages/fluxiq/src/programs/automation-studio/runtime/flow-draft/routing.ts` | What one step says about when it runs, and what runs with it. Each id names another step of the same draft. An id that names no proposed step makes the statement unusable, which the assembler reports rather than silently ignoring: a Flow that quietly lost its recovery edge looks exactly like a Flow that never had one. |
| `AutomationStudioFlowDraftStepRoutingKind` | Type | `packages/fluxiq/src/programs/automation-studio/runtime/flow-draft/routing.ts` | - |
| `AutomationStudioFlowDraftStepToggle` | Type | `packages/fluxiq/src/programs/automation-studio/runtime/flow-draft/step.ts` | The host's word that a step flipped whether the control it acted on is chosen: `key` names the control, as an opaque code the host keeps for one control for the whole build, and `to` says which way it went (`./reversal.ts`). Core compares keys for equality and reads nothing else. |
| `automationStudioFlowDraftStepWithholdsLater` | Value | `packages/fluxiq/src/programs/automation-studio/runtime/flow-draft/verify-only.ts` | - |
| `AutomationStudioFlowDraftStepWords` | Type | `packages/fluxiq/src/programs/automation-studio/runtime/flow-draft/step.ts` | What a step's call names, in the bound domain's own words: the control its argument names by a token, and the words it types or looks for -- the same answer the chat shows (`../llm/loop-configuration.ts`, `describeCall`). |
| `automationStudioFlowDraftStepWordsOf` | Value | `packages/fluxiq/src/programs/automation-studio/runtime/flow-draft/step-words.ts` | - |
| `AutomationStudioFlowDraftStoredBinding` | Type | `packages/fluxiq/src/programs/automation-studio/runtime/flow-draft/binding-forms.ts` | What a stored state binding stands for, when it is one of the forms a model writes. |
| `automationStudioFlowDraftStoredBindingKind` | Value | `packages/fluxiq/src/programs/automation-studio/runtime/flow-draft/binding-forms.ts` | - |
| `automationStudioFlowDraftStoredBindings` | Value | `packages/fluxiq/src/programs/automation-studio/runtime/flow-draft/binding-forms.ts` | - |
| `AutomationStudioFlowDraftTestEndView` | Type | `packages/fluxiq/src/programs/automation-studio/runtime/llm/node-tools/dry-run-gate.ts` | The page a passing test ended on, as the domain's view of it, and the step it was taken after. Structurally the result verification's `AutomationStudioResultEndView`, declared here so the loop does not import it. |
| `AutomationStudioFlowDraftTestObservation` | Type | `packages/fluxiq/src/programs/automation-studio/runtime/llm/node-tools/dry-run-gate.ts` | What one step's replay answered: its evidence, as the domain gave it; a pass of a repeat says which, of how many. |
| `AutomationStudioFlowDraftTestReport` | Type | `packages/fluxiq/src/programs/automation-studio/runtime/llm/node-tools/dry-run-gate.ts` | What a passing test observed, for a judge of what the build actually did. `verdict` is the replay it passed on; `observations` what that replay's steps answered; `reused` that the answer came from an earlier replay of the same Flow rather than a new one; `signature` the Flow signature of the draft that test ran (`../../flow-draft/flow-signature.ts`) -- for a pass where the replay itself made a sometimes-present step optional, the Flow with that step optional, because the run that proved it is a run of that Flow. A verdict on the test is a verdict on that Flow version and no other. |
| `automationStudioFlowDraftTranslateBindings` | Value | `packages/fluxiq/src/programs/automation-studio/runtime/flow-draft/binding-forms.ts` | - |
| `AutomationStudioFlowDraftUnreachedStep` | Type | `packages/fluxiq/src/programs/automation-studio/runtime/flow-draft/amendment/types.ts` | Not a refusal: a step of the Flow an applied decision newly left after a step that does not leave the target on the page it acted on, so when the Flow runs it runs on another page (`./strand-check.ts`, live run `run-muwao5n4-44977b2a`, D2-1). Returned beside `refused`, never in it, so nothing that counts refusals counts it. `step` is the step, `after` the step before it in the Flow now, and `reachedBy` the steps that moved the target to its page while exploring (possibly none), all in the draft's shown numbers. |
| `AutomationStudioFlowDraftUnrunnableWord` | Type | `packages/fluxiq/src/programs/automation-studio/runtime/flow-draft/full-run-required.ts` | Why the test cannot run a step: the word it is shown with, beside a dry run's own words. |
| `automationStudioFlowDraftWithheldStepIds` | Value | `packages/fluxiq/src/programs/automation-studio/runtime/flow-draft/verify-only.ts` | - |
| `AutomationStudioFlowDraftWrittenStep` | Type | `packages/fluxiq/src/programs/automation-studio/runtime/flow-bootstrap/authoring/assemble-draft.ts` | One draft step as a written step, in the caller's own vocabulary. |
| `AutomationStudioFlowEdge` | Type | `packages/fluxiq/src/programs/automation-studio/model/artifacts.ts` | - |
| `AutomationStudioFlowErrorDefinition` | Type | `packages/fluxiq/src/programs/automation-studio/model/flows.ts` | - |
| `AutomationStudioFlowExecutionDefaults` | Type | `packages/fluxiq/src/programs/automation-studio/model/flows.ts` | - |
| `AutomationStudioFlowExpansionFixture` | Type | `packages/fluxiq/src/programs/automation-studio/model/fixtures/flow-expansion.ts` | - |
| `AutomationStudioFlowExpansionInventory` | Type | `packages/fluxiq/src/programs/automation-studio/model/flow-adaptation.ts` | - |
| `AutomationStudioFlowExpansionReferences` | Type | `packages/fluxiq/src/programs/automation-studio/model/flow-adaptation.ts` | - |
| `AutomationStudioFlowExpansionStatus` | Type | `packages/fluxiq/src/programs/automation-studio/model/flow-adaptation.ts` | - |
| `AutomationStudioFlowGraphJudgement` | Type | `packages/fluxiq/src/programs/automation-studio/runtime/flow-version/contracts.ts` | A verdict, bound to the versions it judged. `status` is exactly `automationStudioResultVerificationStatus`'s four words and `code` the verdict's own code, so a reader of a row sees the same judgement the run's record shows. `instructionDigest` is `null` where the request was never read -- a verdict Core settled from its own arithmetic asks no model and reads no instruction -- and a null digest matches nothing, which keeps an unknown question from being compared against a known one. |
| `AutomationStudioFlowGraphJudgementRecord` | Type | `packages/fluxiq/src/programs/automation-studio/storage/project/graph-judgement-store.ts` | One verdict, about one graph Flow at one revision, reached by one run. |
| `AutomationStudioFlowGraphJudgementStatus` | Type | `packages/fluxiq/src/programs/automation-studio/storage/project/graph-judgement-store.ts` | - |
| `AutomationStudioFlowGraphJudgementWrite` | Type | `packages/fluxiq/src/programs/automation-studio/storage/project/graph-judgement-store.ts` | What one run's verdict is written as: the verdict once, against every version it judged. |
| `automationStudioFlowGraphSection` | Value | `packages/fluxiq/src/programs/automation-studio/runtime/recovery/repair-context/flow-graph.ts` | - |
| `automationStudioFlowGraphVersion` | Value | `packages/fluxiq/src/programs/automation-studio/runtime/flow-version/flow-graph-version.ts` | - |
| `AutomationStudioFlowGraphVersion` | Type | `packages/fluxiq/src/programs/automation-studio/runtime/flow-version/contracts.ts` | One graph Flow, at the revision a run executed it at. `graphFlowId` is the `flows` row whose `graph_revisions` chain this names -- the orchestration Flow for the parent entry, and the Subflow's own graph Flow for a Subflow the router entered. They are siblings, not parent and child: each has its own revision counter, so a repair that rewrites one Subflow's graph moves that graph's number and moves nothing else. |
| `AutomationStudioFlowHierarchyCategorySummary` | Type | `packages/fluxiq/src/programs/automation-studio/storage/file-store.ts` | - |
| `AutomationStudioFlowHierarchySubflowSummary` | Type | `packages/fluxiq/src/programs/automation-studio/storage/file-store.ts` | - |
| `AutomationStudioFlowInstruction` | Type | `packages/fluxiq/src/programs/automation-studio/model/flow-adaptation.ts` | - |
| `automationStudioFlowInstructionDigest` | Value | `packages/fluxiq/src/programs/automation-studio/runtime/flow-version/instruction-digest.ts` | - |
| `AutomationStudioFlowInterface` | Type | `packages/fluxiq/src/programs/automation-studio/model/flows.ts` | - |
| `AutomationStudioFlowIntervention` | Type | `packages/fluxiq/src/programs/automation-studio/model/flow-adaptation.ts` | - |
| `AutomationStudioFlowInterventionSummary` | Type | `packages/fluxiq/src/programs/automation-studio/model/flow-adaptation.ts` | - |
| `AutomationStudioFlowLegacyProvenance` | Type | `packages/fluxiq/src/programs/automation-studio/model/flows.ts` | Retains source identity when a legacy task or routine is later adapted/migrated. |
| `automationStudioFlowMaxNodesPerSubflow` | Value | `packages/fluxiq/src/programs/automation-studio/model/flow-size/flow-size-settings.ts` | - |
| `AutomationStudioFlowMigrationInspection` | Type | `packages/fluxiq/src/programs/automation-studio/runtime/service/legacy/migration-inspection.ts` | - |
| `AutomationStudioFlowMigrationLedger` | Type | `packages/fluxiq/src/programs/automation-studio/model/flows.ts` | Durable audit record for an explicit, non-destructive legacy Flow migration. |
| `AutomationStudioFlowMigrationOutcome` | Type | `packages/fluxiq/src/programs/automation-studio/model/flows.ts` | - |
| `AutomationStudioFlowMigrationRollbackPlan` | Type | `packages/fluxiq/src/programs/automation-studio/model/legacy-retirement.ts` | - |
| `AutomationStudioFlowNode` | Type | `packages/fluxiq/src/programs/automation-studio/model/artifacts.ts` | - |
| `AutomationStudioFlowOrigin` | Type | `packages/fluxiq/src/programs/automation-studio/model/flows.ts` | - |
| `AutomationStudioFlowOwnerKind` | Type | `packages/fluxiq/src/programs/automation-studio/model/artifacts.ts` | - |
| `AutomationStudioFlowPort` | Type | `packages/fluxiq/src/programs/automation-studio/model/flows.ts` | - |
| `AutomationStudioFlowPublication` | Type | `packages/fluxiq/src/programs/automation-studio/model/flows.ts` | - |
| `AutomationStudioFlowPublicationRecord` | Type | `packages/fluxiq/src/programs/automation-studio/model/composites.ts` | Mutable lifecycle metadata around an immutable published snapshot. |
| `AutomationStudioFlowRegion` | Type | `packages/fluxiq/src/programs/automation-studio/model/regions.ts` | - |
| `AutomationStudioFlowRegionHandoff` | Type | `packages/fluxiq/src/programs/automation-studio/model/regions.ts` | - |
| `AutomationStudioFlowRegionKind` | Type | `packages/fluxiq/src/programs/automation-studio/model/regions.ts` | - |
| `AutomationStudioFlowRegionPort` | Type | `packages/fluxiq/src/programs/automation-studio/model/regions.ts` | - |
| `automationStudioFlowRepresentationKind` | Value | `packages/fluxiq/src/programs/automation-studio/model/flows.ts` | - |
| `AutomationStudioFlowRepresentationKind` | Type | `packages/fluxiq/src/programs/automation-studio/model/flows.ts` | - |
| `AutomationStudioFlowResourceOffsetPage` | Type | `packages/fluxiq/src/programs/automation-studio/storage/project/flow-resource-repository.ts` | - |
| `AutomationStudioFlowResourcePage` | Type | `packages/fluxiq/src/programs/automation-studio/storage/project/flow-resource-repository.ts` | - |
| `AutomationStudioFlowRouteGroup` | Type | `packages/fluxiq/src/programs/automation-studio/model/flow-adaptation.ts` | - |
| `AutomationStudioFlowRouter` | Type | `packages/fluxiq/src/programs/automation-studio/model/flow-adaptation.ts` | - |
| `AutomationStudioFlowRouteRule` | Type | `packages/fluxiq/src/programs/automation-studio/model/flow-adaptation.ts` | - |
| `AutomationStudioFlowRunActionAttemptRecord` | Type | `packages/fluxiq/src/programs/automation-studio/model/flow-adaptation.ts` | - |
| `AutomationStudioFlowRunActionPage` | Type | `packages/fluxiq/src/programs/automation-studio/runtime/service.ts` | - |
| `AutomationStudioFlowRunDetail` | Type | `packages/fluxiq/src/programs/automation-studio/model/flow-adaptation.ts` | - |
| `AutomationStudioFlowRunRecoveryRecord` | Type | `packages/fluxiq/src/programs/automation-studio/model/flow-adaptation.ts` | - |
| `AutomationStudioFlowRunStatus` | Type | `packages/fluxiq/src/programs/automation-studio/model/flow-adaptation.ts` | - |
| `AutomationStudioFlowRunSummary` | Type | `packages/fluxiq/src/programs/automation-studio/model/flow-adaptation.ts` | - |
| `AutomationStudioFlowRunSummaryPage` | Type | `packages/fluxiq/src/programs/automation-studio/runtime/service/summaries/store.ts` | - |
| `AutomationStudioFlowScope` | Type | `packages/fluxiq/src/programs/automation-studio/model/flows.ts` | The workspace in which a canonical Flow is authored and may execute. |
| `AutomationStudioFlowScript` | Type | `packages/fluxiq/src/programs/automation-studio/runtime/flow-bootstrap/authoring/contracts.ts` | - |
| `AutomationStudioFlowScriptBlock` | Type | `packages/fluxiq/src/programs/automation-studio/runtime/flow-bootstrap/authoring/contracts.ts` | A block of steps: the main sequence, or a named subflow. |
| `AutomationStudioFlowScriptBranch` | Type | `packages/fluxiq/src/programs/automation-studio/runtime/flow-bootstrap/authoring/contracts.ts` | A branch from one of a step's output ports to a labelled step. |
| `AutomationStudioFlowScriptCondition` | Type | `packages/fluxiq/src/programs/automation-studio/runtime/flow-bootstrap/authoring/contracts.ts` | A `when:` or `unless:` line: when the router runs the block it sits in. |
| `AutomationStudioFlowScriptEntry` | Type | `packages/fluxiq/src/programs/automation-studio/runtime/flow-bootstrap/authoring/contracts.ts` | One `key: value` line inside a step, with its value already joined. |
| `AutomationStudioFlowScriptOptional` | Type | `packages/fluxiq/src/programs/automation-studio/runtime/flow-bootstrap/authoring/contracts.ts` | A step's `optional:` line: its value as written, and where it was written. |
| `AutomationStudioFlowScriptRepeat` | Type | `packages/fluxiq/src/programs/automation-studio/runtime/flow-bootstrap/authoring/contracts.ts` | What a step's `repeat ...:` lines said, as written: each label already reduced the way a branch target is (`./keys.ts`), `most` as its text. Which combinations mean something is the router's question, not the parser's. |
| `AutomationStudioFlowScriptStep` | Type | `packages/fluxiq/src/programs/automation-studio/runtime/flow-bootstrap/authoring/contracts.ts` | - |
| `automationStudioFlowSizeSettingIssue` | Value | `packages/fluxiq/src/programs/automation-studio/model/flow-size/flow-size-settings.ts` | - |
| `AutomationStudioFlowSource` | Type | `packages/fluxiq/src/programs/automation-studio/model/flows.ts` | Controls which authoring surface owns the canonical Flow definition. |
| `AutomationStudioFlowSourceLocation` | Type | `packages/fluxiq/src/programs/automation-studio/dsl/contracts.ts` | - |
| `automationStudioFlowStartLocation` | Value | `packages/fluxiq/src/programs/automation-studio/runtime/flow-bootstrap/start-location.ts` | - |
| `AutomationStudioFlowSubflow` | Type | `packages/fluxiq/src/programs/automation-studio/model/flow-adaptation.ts` | - |
| `AutomationStudioFlowSummary` | Type | `packages/fluxiq/src/programs/automation-studio/storage/file-store.ts` | - |
| `AutomationStudioFlowSummaryIndex` | Type | `packages/fluxiq/src/programs/automation-studio/storage/file-store.ts` | - |
| `AutomationStudioFlowValueType` | Type | `packages/fluxiq/src/programs/automation-studio/model/flows.ts` | - |
| `AutomationStudioFlowVariable` | Type | `packages/fluxiq/src/programs/automation-studio/model/flows.ts` | - |
| `automationStudioFlowVersionsFromMetadata` | Value | `packages/fluxiq/src/programs/automation-studio/runtime/flow-version/stored-flow-versions.ts` | - |
| `AutomationStudioFlowVisibility` | Type | `packages/fluxiq/src/programs/automation-studio/model/flows.ts` | Public Flows are reusable composite-node candidates within their scope. |
| `AutomationStudioFrozenScope` | Type | `packages/fluxiq/src/programs/automation-studio/runtime/training-modes.ts` | - |
| `AutomationStudioGeneratedCandidateTrial` | Type | `packages/fluxiq/src/programs/automation-studio/runtime/service/flow-bootstrap-commands/contracts.ts` | Which candidate, at which revision and digest, and which trial run's confirmed yes produced a proposal. |
| `AutomationStudioGenerateFlowBootstrapAdaptationInput` | Type | `packages/fluxiq/src/programs/automation-studio/runtime/service/flow-bootstrap-commands/contracts.ts` | - |
| `AutomationStudioGenerateFlowBootstrapAdaptationResult` | Type | `packages/fluxiq/src/programs/automation-studio/runtime/service/flow-bootstrap-commands/contracts.ts` | - |
| `AutomationStudioGetProjectUiCacheRequest` | Type | `packages/fluxiq/src/programs/automation-studio/api/contracts/ui-cache.ts` | - |
| `AutomationStudioGetProjectUiCacheResponse` | Type | `packages/fluxiq/src/programs/automation-studio/api/contracts/ui-cache.ts` | - |
| `AutomationStudioGetReusableLlmContextRequest` | Type | `packages/fluxiq/src/programs/automation-studio/api/contracts/llm.ts` | - |
| `AutomationStudioGraphBoundaryEdge` | Type | `packages/fluxiq/src/programs/automation-studio/storage/project/graph-store.ts` | - |
| `AutomationStudioGraphBounds` | Type | `packages/fluxiq/src/programs/automation-studio/storage/project/graph-store.ts` | - |
| `AutomationStudioGraphCursorPage` | Type | `packages/fluxiq/src/programs/automation-studio/storage/project/graph-store.ts` | - |
| `AutomationStudioGraphEdgeRecord` | Type | `packages/fluxiq/src/programs/automation-studio/storage/project/graph-store.ts` | - |
| `AutomationStudioGraphExecutionOptions` | Type | `packages/fluxiq/src/programs/automation-studio/runtime/executor/contracts.ts` | - |
| `AutomationStudioGraphExecutionTrace` | Type | `packages/fluxiq/src/programs/automation-studio/runtime/executor/contracts.ts` | - |
| `AutomationStudioGraphNodeRecord` | Type | `packages/fluxiq/src/programs/automation-studio/storage/project/graph-store.ts` | - |
| `AutomationStudioGraphOperationRecord` | Type | `packages/fluxiq/src/programs/automation-studio/storage/project/graph-store.ts` | - |
| `AutomationStudioGraphPartitionRecord` | Type | `packages/fluxiq/src/programs/automation-studio/storage/project/graph-store.ts` | - |
| `AutomationStudioGraphPatchApplied` | Type | `packages/fluxiq/src/programs/automation-studio/storage/project/graph-store.ts` | - |
| `AutomationStudioGraphPatchConflict` | Type | `packages/fluxiq/src/programs/automation-studio/storage/project/graph-store.ts` | - |
| `AutomationStudioGraphPatchOperation` | Type | `packages/fluxiq/src/programs/automation-studio/storage/project/graph-store.ts` | - |
| `automationStudioGraphPatchRequestDigest` | Value | `packages/fluxiq/src/programs/automation-studio/storage/project/graph-store.ts` | - |
| `AutomationStudioGraphPatchResult` | Type | `packages/fluxiq/src/programs/automation-studio/storage/project/graph-store.ts` | - |
| `AutomationStudioGraphRevisionRecord` | Type | `packages/fluxiq/src/programs/automation-studio/storage/project/graph-store.ts` | - |
| `AutomationStudioGraphRunSeed` | Type | `packages/fluxiq/src/programs/automation-studio/runtime/executor/graph-run.ts` | What a run that parked on a question had, beyond what its trace holds, so the run that continues it is the same run rather than a second one. `route` is the way out of the parked node the answer chose. The node is not executed again: whatever it already did -- a dispatch, a record capture, a charge -- happened once, and repeating it is the difference between a gate and a dead end. |
| `AutomationStudioGraphRunStatus` | Type | `packages/fluxiq/src/programs/automation-studio/runtime/executor/contracts.ts` | - |
| `AutomationStudioGraphRunStopReason` | Type | `packages/fluxiq/src/programs/automation-studio/runtime/executor/contracts.ts` | Why a run that ended `succeeded` stopped short of the Flow's end. `stopped_at_node`: it was a partial run (`stopAfterNodeId`) and reached its stop node, or a state route would have taken it past that node. |
| `AutomationStudioGraphStoreBenchmark` | Type | `packages/fluxiq/src/programs/automation-studio/testing/scale-graph-store.ts` | - |
| `AutomationStudioGraphViewportPage` | Type | `packages/fluxiq/src/programs/automation-studio/storage/project/graph-store.ts` | - |
| `automationStudioHarnessInputWithDeniedEvidenceKeys` | Value | `packages/fluxiq/src/programs/automation-studio/runtime/llm/harness-options/binding.ts` | - |
| `AutomationStudioHarnessOption` | Type | `packages/fluxiq/src/programs/automation-studio/runtime/llm/harness-options/option.ts` | One registered action. The evidence-loop tool fields are the half the model ever sees; the rest is the gate, and is stripped before the option reaches a provider. |
| `AutomationStudioHarnessOptionBundle` | Type | `packages/fluxiq/src/programs/automation-studio/runtime/llm/harness-options/option.ts` | Declarations and implementations arrive together but are stored apart: the registry's browsing surface returns declarations only, so listing the options the loop may take never hands out host code. `domainId` absent means Core's own bundle. A domain bundle may only declare domain-scoped options and Core's may only declare unscoped ones, so a domain extends the set and can neither replace nor widen Core's half. |
| `automationStudioHarnessOptionBundleFromBinding` | Value | `packages/fluxiq/src/programs/automation-studio/runtime/llm/harness-options/binding.ts` | - |
| `AutomationStudioHarnessOptionExecution` | Type | `packages/fluxiq/src/programs/automation-studio/runtime/llm/harness-options/option.ts` | - |
| `AutomationStudioHarnessOptionHost` | Type | `packages/fluxiq/src/programs/automation-studio/runtime/llm/harness-options/host.ts` | - |
| `AutomationStudioHarnessOptionHostContext` | Type | `packages/fluxiq/src/programs/automation-studio/runtime/llm/harness-options/host.ts` | - |
| `AutomationStudioHarnessOptionImplementation` | Type | `packages/fluxiq/src/programs/automation-studio/runtime/llm/harness-options/option.ts` | - |
| `automationStudioHarnessOptionIssues` | Value | `packages/fluxiq/src/programs/automation-studio/runtime/llm/harness-options/option.ts` | - |
| `AutomationStudioHarnessOptionLoopBinding` | Type | `packages/fluxiq/src/programs/automation-studio/runtime/llm/harness-options/registry.ts` | - |
| `automationStudioHarnessOptionRegistry` | Value | `packages/fluxiq/src/programs/automation-studio/runtime/llm/harness-options/binding.ts` | - |
| `AutomationStudioHarnessOptionRegistry` | Class | `packages/fluxiq/src/programs/automation-studio/runtime/llm/harness-options/registry.ts` | - |
| `AutomationStudioHarnessOptionResolution` | Type | `packages/fluxiq/src/programs/automation-studio/runtime/llm/harness-options/registry.ts` | Everything that decides which options this call may be offered. `scope`, `runtimeCapabilities` and `permissions` are the node registry's resolution unchanged; `stage`, `policy` and `approvedOptionIds` are the dimensions an exploration call adds. |
| `AutomationStudioHarnessOptionSafety` | Type | `packages/fluxiq/src/programs/automation-studio/runtime/llm/harness-options/option.ts` | - |
| `AutomationStudioHarnessOptionSideEffect` | Type | `packages/fluxiq/src/programs/automation-studio/runtime/llm/harness-options/option.ts` | What running the option does beyond producing evidence. `none` and `observe` read. `mutate` changes the state the Flow acts on in order to reveal evidence that is otherwise unreachable. `destructive` removes or irreversibly commits something; the registry never offers one, because gathering information never requires destroying anything. |
| `AutomationStudioHarnessOptionStage` | Type | `packages/fluxiq/src/programs/automation-studio/runtime/llm/harness-options/option.ts` | A stage of the loop's fixed order of work. Carried as an opaque identifier while the stage protocol was still to land; now it is the protocol's own closed vocabulary, so an option pinned to a stage nobody will ever be in is a registration error rather than an option that silently never appears. |
| `automationStudioHarnessOptionTool` | Value | `packages/fluxiq/src/programs/automation-studio/runtime/llm/harness-options/option.ts` | - |
| `AutomationStudioHeapSwitchEvidence` | Type | `packages/fluxiq/src/programs/automation-studio/testing/scale-certification.ts` | - |
| `AutomationStudioHierarchyCacheUpdate` | Type | `packages/fluxiq/src/programs/automation-studio/storage/project/hierarchy/feed.ts` | - |
| `AutomationStudioHierarchyCacheUpdatePage` | Type | `packages/fluxiq/src/programs/automation-studio/storage/project/hierarchy/feed.ts` | - |
| `AutomationStudioHierarchyChildrenPage` | Type | `packages/fluxiq/src/programs/automation-studio/api/contracts/hierarchy.ts` | - |
| `AutomationStudioHierarchyCursorPage` | Type | `packages/fluxiq/src/programs/automation-studio/storage/project/hierarchy/repository.ts` | - |
| `AutomationStudioHierarchyEntry` | Type | `packages/fluxiq/src/programs/automation-studio/storage/project/hierarchy/repository.ts` | - |
| `AutomationStudioHierarchyNode` | Type | `packages/fluxiq/src/programs/automation-studio/api/contracts/hierarchy.ts` | - |
| `AutomationStudioHierarchyPageEntry` | Type | `packages/fluxiq/src/programs/automation-studio/api/contracts/hierarchy.ts` | - |
| `AutomationStudioHostRouteStatePath` | Type | `packages/fluxiq/src/programs/automation-studio/runtime/host-runtime.ts` | One `state.*` path a Router condition may test, and what it holds, in the host's own words. |
| `AutomationStudioHostRuntimeActionContext` | Type | `packages/fluxiq/src/programs/automation-studio/runtime/host-runtime.ts` | - |
| `AutomationStudioHostRuntimeBoundary` | Type | `packages/fluxiq/src/programs/automation-studio/runtime/host-runtime.ts` | - |
| `AutomationStudioHostRuntimeCapability` | Type | `packages/fluxiq/src/programs/automation-studio/runtime/host-runtime.ts` | - |
| `AutomationStudioHostStateSnapshotRef` | Type | `packages/fluxiq/src/programs/automation-studio/runtime/host-runtime.ts` | - |
| `AutomationStudioHybridReadComparison` | Type | `packages/fluxiq/src/programs/automation-studio/storage/project/migration-cutover.ts` | - |
| `AutomationStudioIdempotentMutationResult` | Type | `packages/fluxiq/src/programs/automation-studio/storage/project/unit-of-work.ts` | - |
| `AutomationStudioImporterImplementationBundle` | Type | `packages/fluxiq/src/programs/automation-studio/nodes/importer-sdk.ts` | - |
| `AutomationStudioImporterNodeManifest` | Type | `packages/fluxiq/src/programs/automation-studio/nodes/definitions.ts` | Plain registration boundary importers can expose from their configured source root. |
| `AutomationStudioImporterSchema` | Type | `packages/fluxiq/src/programs/automation-studio/nodes/importer-sdk.ts` | - |
| `AutomationStudioImporterSdkManifest` | Type | `packages/fluxiq/src/programs/automation-studio/nodes/importer-sdk.ts` | - |
| `AutomationStudioImporterSdkRegistry` | Class | `packages/fluxiq/src/programs/automation-studio/nodes/importer-sdk.ts` | Explicit manifest registry. FluxIQ never scans or imports host modules from display metadata. |
| `AutomationStudioInstructedAct` | Type | `packages/fluxiq/src/programs/automation-studio/runtime/flow-bootstrap/instructed-acts/contracts.ts` | One lasting act the instruction asks for, in the person's own words. |
| `automationStudioInstructedActChangeShows` | Value | `packages/fluxiq/src/programs/automation-studio/runtime/flow-bootstrap/instructed-acts/act-evidence.ts` | - |
| `AutomationStudioInstructedActChecklistItem` | Type | `packages/fluxiq/src/programs/automation-studio/runtime/flow-bootstrap/instructed-acts/checklist.ts` | One act as the model is shown it. |
| `AutomationStudioInstructedActClaim` | Type | `packages/fluxiq/src/programs/automation-studio/runtime/flow-bootstrap/instructed-acts/contracts.ts` | A model's claim that a draft step does an act. Both strings are the model's, bounded before use. |
| `automationStudioInstructedActClaimDoubt` | Value | `packages/fluxiq/src/programs/automation-studio/runtime/flow-bootstrap/instructed-acts/claim-doubt.ts` | - |
| `automationStudioInstructedActClaimedStep` | Value | `packages/fluxiq/src/programs/automation-studio/runtime/flow-bootstrap/instructed-acts/check.ts` | - |
| `AutomationStudioInstructedActClaimRefusal` | Type | `packages/fluxiq/src/programs/automation-studio/runtime/flow-bootstrap/instructed-acts/claim-verdict.ts` | A claim refused as it is made: the act, what the step did instead and where to name the act, and the step whose words or change show it. |
| `automationStudioInstructedActClaims` | Value | `packages/fluxiq/src/programs/automation-studio/runtime/flow-bootstrap/instructed-acts/check.ts` | - |
| `automationStudioInstructedActClaimVerdict` | Value | `packages/fluxiq/src/programs/automation-studio/runtime/flow-bootstrap/instructed-acts/claim-verdict.ts` | - |
| `automationStudioInstructedActConsequenceUndeclared` | Value | `packages/fluxiq/src/programs/automation-studio/runtime/flow-bootstrap/instructed-acts/step-fault.ts` | - |
| `AutomationStudioInstructedActEvidenceFault` | Type | `packages/fluxiq/src/programs/automation-studio/runtime/flow-bootstrap/instructed-acts/act-evidence.ts` | The reasons whose sentence says what the step did and where the act is named (`automationStudioInstructedActEvidenceSaid`). |
| `automationStudioInstructedActEvidenceSaid` | Value | `packages/fluxiq/src/programs/automation-studio/runtime/flow-bootstrap/instructed-acts/act-evidence.ts` | - |
| `AutomationStudioInstructedActEvidenceTodo` | Type | `packages/fluxiq/src/programs/automation-studio/runtime/flow-bootstrap/instructed-acts/checklist.ts` | Why an act is not done, read from what the step claimed for it did instead (`./act-evidence.ts`): it made one of the act's own choices, only cleared a layer in front of the page, changed nothing that shows the act while another step's change does, or changed nothing anyone could see (run `run-muxkyfxz-446c3a4e`). Held apart from the two unions above, so a reader typed over those falls back safely. Information on the checklist; a claim is refused for it only as it is made (`./claim-verdict.ts`). |
| `automationStudioInstructedActIsEvidenceFault` | Value | `packages/fluxiq/src/programs/automation-studio/runtime/flow-bootstrap/instructed-acts/act-evidence.ts` | - |
| `AutomationStudioInstructedActKind` | Type | `packages/fluxiq/src/programs/automation-studio/runtime/flow-bootstrap/instructed-acts/contracts.ts` | The kinds of lasting act the reader recognises. Closed, so a refusal names a kind a model can read and a reader of the record can count. - `save`: save or bookmark something. - `add_to`: add or put something into a cart, basket, list or collection. - `claim`: collect, claim, clip, redeem or use a coupon, voucher or code. - `set`: switch or set a store, location, radius or other setting, or narrow, filter or sort results. - `move`: move something somewhere. - `open`: open a place the instruction reads from, such as saved items. - `submit`: book, buy, order, send, post, create, confirm, withdraw, place a bid, check out, or ask for a quote. |
| `AutomationStudioInstructedActMissing` | Type | `packages/fluxiq/src/programs/automation-studio/runtime/flow-bootstrap/instructed-acts/contracts.ts` | An act, or a choice of an act's item, with no step that does it, as the model is shown it. The two share `id`, `kind`, `quote` and `reason`. |
| `AutomationStudioInstructedActMissingReason` | Type | `packages/fluxiq/src/programs/automation-studio/runtime/flow-bootstrap/instructed-acts/contracts.ts` | Why an act has no step that does it. |
| `automationStudioInstructedActNamesWord` | Value | `packages/fluxiq/src/programs/automation-studio/runtime/flow-bootstrap/instructed-acts/kind-words.ts` | - |
| `AutomationStudioInstructedActObjectTodo` | Type | `packages/fluxiq/src/programs/automation-studio/runtime/flow-bootstrap/instructed-acts/checklist.ts` | Why an act or choice is not done, for the reasons read from what a step acted on and how many times (`./object-binding.ts`, `./quantity-fault.ts`). Held apart from `AutomationStudioInstructedActTodo`; a build's ending has a plain clause for each of these too (`../unfinished-build/not-done.ts`). Like every todo, they are information for the model and the judge, never a refusal. |
| `AutomationStudioInstructedActOptionalVerdict` | Type | `packages/fluxiq/src/programs/automation-studio/runtime/flow-bootstrap/instructed-acts/optional-only.ts` | Every act the draft does with an optional step alone, or what the model is told instead. |
| `AutomationStudioInstructedActPermissionVerdict` | Type | `packages/fluxiq/src/programs/automation-studio/runtime/flow-bootstrap/instructed-acts/permission.ts` | Every act a person is asked about has a declaring step, or what the model is told instead. |
| `AutomationStudioInstructedActRead` | Type | `packages/fluxiq/src/programs/automation-studio/runtime/action-permissions/instructed.ts` | What the read answered for one act: the classes it asks for, `[]` for an act that asks for nothing lasting, or `null` when the read gave it no answer. |
| `automationStudioInstructedActReads` | Value | `packages/fluxiq/src/programs/automation-studio/runtime/action-permissions/instructed.ts` | - |
| `AutomationStudioInstructedActRepeatSpan` | Type | `packages/fluxiq/src/programs/automation-studio/runtime/flow-bootstrap/instructed-acts/span.ts` | One kept repeat that runs a step: the step carrying it, and the positions it runs from and through. |
| `automationStudioInstructedActRepeatSpans` | Value | `packages/fluxiq/src/programs/automation-studio/runtime/flow-bootstrap/instructed-acts/span.ts` | - |
| `automationStudioInstructedActs` | Value | `packages/fluxiq/src/programs/automation-studio/runtime/flow-bootstrap/instructed-acts/instruction-acts.ts` | - |
| `automationStudioInstructedActsChecklist` | Value | `packages/fluxiq/src/programs/automation-studio/runtime/flow-bootstrap/instructed-acts/checklist.ts` | - |
| `automationStudioInstructedActsChecklistValue` | Value | `packages/fluxiq/src/programs/automation-studio/runtime/flow-bootstrap/instructed-acts/checklist.ts` | - |
| `automationStudioInstructedActsNotDone` | Value | `packages/fluxiq/src/programs/automation-studio/runtime/flow-bootstrap/instructed-acts/checklist.ts` | - |
| `automationStudioInstructedActSpanStopsShort` | Value | `packages/fluxiq/src/programs/automation-studio/runtime/flow-bootstrap/instructed-acts/span.ts` | - |
| `automationStudioInstructedActsStanding` | Value | `packages/fluxiq/src/programs/automation-studio/runtime/flow-bootstrap/instructed-acts/standing.ts` | - |
| `automationStudioInstructedActStepDidInstead` | Value | `packages/fluxiq/src/programs/automation-studio/runtime/flow-bootstrap/instructed-acts/act-evidence.ts` | - |
| `automationStudioInstructedActStepFault` | Value | `packages/fluxiq/src/programs/automation-studio/runtime/flow-bootstrap/instructed-acts/step-fault.ts` | - |
| `AutomationStudioInstructedActStepInstead` | Type | `packages/fluxiq/src/programs/automation-studio/runtime/flow-bootstrap/instructed-acts/act-evidence.ts` | What a step whose words do not name its act did instead, as its record shows. |
| `automationStudioInstructedActStepThatNamesIt` | Value | `packages/fluxiq/src/programs/automation-studio/runtime/flow-bootstrap/instructed-acts/act-evidence.ts` | - |
| `AutomationStudioInstructedActsVerdict` | Type | `packages/fluxiq/src/programs/automation-studio/runtime/flow-bootstrap/instructed-acts/contracts.ts` | Whether every act has a step, or what the model is told instead. Like the answerability check, a refusal is correctable: it is fed back and the build asks again on the same budget and guards. |
| `AutomationStudioInstructedActText` | Type | `packages/fluxiq/src/programs/automation-studio/runtime/action-permissions/instructed.ts` | One act of the instruction as the read is asked about it: its id (`a1`, `a2` ...), the person's own words for it, and, for an act split from a clause with several counted objects, that clause and this act's object as the person wrote them (`../flow-bootstrap/instructed-acts/contracts.ts`). |
| `AutomationStudioInstructedActTodo` | Type | `packages/fluxiq/src/programs/automation-studio/runtime/flow-bootstrap/instructed-acts/checklist.ts` | Why an act on the checklist is not done yet. |
| `AutomationStudioInstructedChoice` | Type | `packages/fluxiq/src/programs/automation-studio/runtime/flow-bootstrap/instructed-acts/contracts.ts` | A choice the instruction attaches to the item an act adds, as its own requirement: a setting (`kind: "set"`) that the act's own press does not make. Run 28 (`run-munvvc3z-3eadc185`) kept these as quote text only, and a Flow that chose no size and set no quantity passed. |
| `automationStudioInstructedChoiceAfterAct` | Value | `packages/fluxiq/src/programs/automation-studio/runtime/flow-bootstrap/instructed-acts/choice-order.ts` | - |
| `AutomationStudioInstructedChoiceAfterAct` | Type | `packages/fluxiq/src/programs/automation-studio/runtime/flow-bootstrap/instructed-acts/choice-order.ts` | A choice made on a step after its act's step: the choice's id, the two positions, and the sentence shown. |
| `AutomationStudioInstructedChoiceChecklistItem` | Type | `packages/fluxiq/src/programs/automation-studio/runtime/flow-bootstrap/instructed-acts/checklist.ts` | One choice of an act's item as the model is shown it: how many, or which size, colour or version. |
| `AutomationStudioInstructedChoiceKind` | Type | `packages/fluxiq/src/programs/automation-studio/runtime/flow-bootstrap/instructed-acts/contracts.ts` | What a choice of an item fixes. Closed, like the act kinds. - `quantity`: how many, where the instruction asks for more than one. - `variant`: which one of the item's sizes, colours, counts, packs, flavours or versions. |
| `AutomationStudioInstructedConsequence` | Type | `packages/fluxiq/src/programs/automation-studio/runtime/action-permissions/instructed.ts` | One class the person's instruction plainly asks for, and the words that ask. |
| `automationStudioInstructedConsequencesSchema` | Value | `packages/fluxiq/src/programs/automation-studio/runtime/action-permissions/instructed.ts` | - |
| `AutomationStudioInstructedRead` | Type | `packages/fluxiq/src/programs/automation-studio/runtime/action-permissions/instructed.ts` | The read as a build holds it: the grounded entries, with each act's own answer beside them as `acts`. A plain list of entries -- one stored with a Flow, or given by an older caller -- has no `acts`, and its acts are judged by their quotes alone. |
| `automationStudioInstructedReadUnanswered` | Value | `packages/fluxiq/src/programs/automation-studio/runtime/action-permissions/instructed.ts` | - |
| `AutomationStudioInstructedStanding` | Type | `packages/fluxiq/src/programs/automation-studio/runtime/flow-bootstrap/instructed-acts/standing.ts` | How one act or choice stands against the steps named for it: done by a step, or the fault of the step judged, with `after` for `span_stops_short` and `reads` -- the positions of every step named for it -- when each of them only reads the page; `actsOn` for `step_acts_on_another_object`, `presses` for `quantity_presses_differ`, `chooses` for `step_only_chooses`, and `instead` -- a step whose change shows the act or whose words name it -- for the faults `./act-evidence.ts` words, where the draft has one. |
| `automationStudioInstructionDigest` | Value | `packages/fluxiq/src/programs/automation-studio/runtime/action-permissions/instructed.ts` | - |
| `AutomationStudioInstructionReading` | Type | `packages/fluxiq/src/programs/automation-studio/runtime/action-permissions/instruction-reading/read.ts` | What one instruction read answered: the consequences as the permission gate holds them, and the route. |
| `automationStudioInstructionReadingSchema` | Value | `packages/fluxiq/src/programs/automation-studio/runtime/action-permissions/instruction-reading/schema.ts` | - |
| `AutomationStudioInstructionRequirement` | Type | `packages/fluxiq/src/programs/automation-studio/model/flow-adaptation.ts` | - |
| `AutomationStudioInstructionResolution` | Type | `packages/fluxiq/src/programs/automation-studio/runtime/llm/harness/instruction.ts` | - |
| `AutomationStudioInstructionResolutionInput` | Type | `packages/fluxiq/src/programs/automation-studio/runtime/llm/harness/instruction.ts` | - |
| `AutomationStudioInstructionRouteAccessor` | Type | `packages/fluxiq/src/programs/automation-studio/runtime/action-permissions/instruction-route/accessor.ts` | A build's route, from its one read of the person's instructions (`../../service/instruction-authority.ts` keeps the read; the draft and the completion read the route through this, `../../llm/harness-options/draft-route.ts`). |
| `AutomationStudioInstructionRouteReading` | Type | `packages/fluxiq/src/programs/automation-studio/runtime/action-permissions/instruction-route/reading.ts` | - |
| `AutomationStudioInstructionRouteUnavailableReason` | Type | `packages/fluxiq/src/programs/automation-studio/runtime/action-permissions/instruction-route/reading.ts` | Why no route can be relied on. |
| `AutomationStudioInstructionRouteWaypoint` | Type | `packages/fluxiq/src/programs/automation-studio/runtime/action-permissions/instruction-route/reading.ts` | One place on a named route, in the order the read gave. |
| `AutomationStudioInstructionScope` | Type | `packages/fluxiq/src/programs/automation-studio/model/flow-adaptation.ts` | - |
| `automationStudioInstructionSetDigest` | Value | `packages/fluxiq/src/programs/automation-studio/runtime/action-permissions/instruction-route/set-digest.ts` | - |
| `AutomationStudioInstructionSummary` | Type | `packages/fluxiq/src/programs/automation-studio/runtime/service/indexes/types.ts` | - |
| `AutomationStudioInstructionSummaryPage` | Type | `packages/fluxiq/src/programs/automation-studio/runtime/service/summaries/types.ts` | - |
| `AutomationStudioInstructionTag` | Type | `packages/fluxiq/src/programs/automation-studio/model/flow-adaptation.ts` | - |
| `AutomationStudioInstructionText` | Type | `packages/fluxiq/src/programs/automation-studio/runtime/action-permissions/instructed.ts` | An instruction as the derivation and the staleness check read it. |
| `AutomationStudioInstructionTextSpan` | Type | `packages/fluxiq/src/programs/automation-studio/runtime/action-permissions/instruction-quote/mapped.ts` | An interval of the original text: UTF-16 code units, `start` included, `end` not. |
| `automationStudioInterventionMode` | Value | `packages/fluxiq/src/programs/automation-studio/model/flows.ts` | - |
| `AutomationStudioInterventionMode` | Type | `packages/fluxiq/src/programs/automation-studio/model/flows.ts` | - |
| `AutomationStudioIoRecorder` | Class | `packages/fluxiq/src/programs/automation-studio/runtime/io-bridge.ts` | Converts importer-owned IO input events into recording evidence. Only action inputs with an explicit output binding become executable policy evidence. |
| `automationStudioIsPersonNeededAsk` | Value | `packages/fluxiq/src/programs/automation-studio/runtime/executor/person-needed.ts` | - |
| `automationStudioJudgedApplication` | Value | `packages/fluxiq/src/programs/automation-studio/runtime/durable-behavior/judged-application.ts` | - |
| `AutomationStudioJudgedApplication` | Type | `packages/fluxiq/src/programs/automation-studio/runtime/durable-behavior/judged-application.ts` | Whether a runtime patch was put into the Flow, as the settle after its judged run recorded it on the decision (`../service/runtime-adaptation/judged-promotion.ts`): `applied`, and `notAppliedReason` when it was held back. A listing row carries this so a person scanning adaptations can tell a patch that went into the Flow from one that was held back without opening each one. |
| `AutomationStudioJudgedFlowGraphVersion` | Type | `packages/fluxiq/src/programs/automation-studio/runtime/flow-version/contracts.ts` | A version whose revision is known, which is the only kind a judgement can be written against. |
| `AutomationStudioLadderOutcome` | Type | `packages/fluxiq/src/programs/automation-studio/runtime/executor/ladder-run.ts` | What the ladder decided, and the decision to record on the failed attempt. The decision handed back is the one taken **after** every rung that ran was consumed, so a run that reaches the end of the ladder leaves the model's rung as the only candidate still standing. Recording an earlier decision would leave a deterministic candidate on the attempt and suppress escalation for good. |
| `AutomationStudioLadderRungKind` | Type | `packages/fluxiq/src/programs/automation-studio/runtime/executor/contracts.ts` | - |
| `AutomationStudioLadderState` | Type | `packages/fluxiq/src/programs/automation-studio/runtime/executor/recovery-ladder.ts` | What the executor already knows about this failure, which decides which deterministic rungs are worth offering. `consumed` is the heart of it. Every candidate still on the list that is not `llm_diagnosis` tells the adaptive classifier a deterministic answer is available and stops the model being consulted at all, so a rung that has already run has to leave the list rather than sit on it. |
| `AutomationStudioLargeProjectFixture` | Type | `packages/fluxiq/src/programs/automation-studio/model/fixtures/large-project.ts` | - |
| `AutomationStudioLargeProjectFixtureOptions` | Type | `packages/fluxiq/src/programs/automation-studio/model/fixtures/large-project.ts` | - |
| `AutomationStudioLastingActCheck` | Type | `packages/fluxiq/src/programs/automation-studio/runtime/executor/outside-graph/retries.ts` | The caller's own check of whether a lasting act took effect, asked only after an attempt whose failure left that unknown: `landed`, `not_landed` (it did not happen, so making it again is not a second act) or `unknown`. |
| `AutomationStudioLazySqliteUiCacheStore` | Class | `packages/fluxiq/src/programs/automation-studio/storage/project/ui-cache-store.ts` | - |
| `AutomationStudioLegacyBackup` | Type | `packages/fluxiq/src/programs/automation-studio/model/legacy-retirement.ts` | - |
| `AutomationStudioLegacyBackupManifest` | Type | `packages/fluxiq/src/programs/automation-studio/storage/project/migration-cutover.ts` | - |
| `AutomationStudioLegacyBackupVerification` | Type | `packages/fluxiq/src/programs/automation-studio/storage/project/migration-cutover.ts` | - |
| `AutomationStudioLegacyDeferredArtifact` | Type | `packages/fluxiq/src/programs/automation-studio/model/legacy-retirement.ts` | - |
| `AutomationStudioLegacyImporterBatchResult` | Type | `packages/fluxiq/src/programs/automation-studio/storage/project/migration-cutover.ts` | - |
| `AutomationStudioLegacyImporterEvidence` | Type | `packages/fluxiq/src/programs/automation-studio/model/legacy-retirement.ts` | - |
| `AutomationStudioLegacyImportProgress` | Type | `packages/fluxiq/src/programs/automation-studio/storage/project/migration-cutover.ts` | - |
| `AutomationStudioLegacyInventoryManifest` | Type | `packages/fluxiq/src/programs/automation-studio/storage/project/migration-cutover.ts` | - |
| `AutomationStudioLegacyMigrationOperation` | Type | `packages/fluxiq/src/programs/automation-studio/storage/project/migration-cutover.ts` | - |
| `AutomationStudioLegacyMigrationOperationKind` | Type | `packages/fluxiq/src/programs/automation-studio/storage/project/migration-cutover.ts` | - |
| `AutomationStudioLegacyMigrationOrchestrationResult` | Type | `packages/fluxiq/src/programs/automation-studio/storage/project/migration-cutover.ts` | - |
| `AutomationStudioLegacyObjectIndexMigrationResult` | Type | `packages/fluxiq/src/programs/automation-studio/storage/project/object-index-migration.ts` | - |
| `AutomationStudioLegacyProjectCatalogIndex` | Type | `packages/fluxiq/src/programs/automation-studio/storage/catalog-index-migration.ts` | - |
| `AutomationStudioLegacyProjectCatalogMigrationResult` | Type | `packages/fluxiq/src/programs/automation-studio/storage/catalog-index-migration.ts` | - |
| `AutomationStudioLegacyResourceInventoryItem` | Type | `packages/fluxiq/src/programs/automation-studio/storage/project/migration-cutover.ts` | - |
| `AutomationStudioLegacyResourceKind` | Type | `packages/fluxiq/src/programs/automation-studio/storage/project/migration-cutover.ts` | - |
| `AutomationStudioLegacyRetirementAuditEvent` | Type | `packages/fluxiq/src/programs/automation-studio/model/legacy-retirement.ts` | - |
| `AutomationStudioLegacyRetirementCriterion` | Type | `packages/fluxiq/src/programs/automation-studio/model/legacy-retirement.ts` | - |
| `AutomationStudioLegacyRetirementDiagnostic` | Type | `packages/fluxiq/src/programs/automation-studio/model/legacy-retirement.ts` | - |
| `AutomationStudioLegacyRetirementPhase` | Type | `packages/fluxiq/src/programs/automation-studio/model/legacy-retirement.ts` | - |
| `AutomationStudioLegacyRetirementReport` | Type | `packages/fluxiq/src/programs/automation-studio/model/legacy-retirement.ts` | - |
| `AutomationStudioLegacyRetirementState` | Type | `packages/fluxiq/src/programs/automation-studio/model/legacy-retirement.ts` | - |
| `AutomationStudioLegacyWriteDisabledError` | Class | `packages/fluxiq/src/programs/automation-studio/model/legacy-retirement.ts` | Structured error retained across compatibility endpoints. |
| `AutomationStudioListHierarchyChildrenRequest` | Type | `packages/fluxiq/src/programs/automation-studio/api/contracts/hierarchy.ts` | - |
| `AutomationStudioListProjectUiCacheStatsRequest` | Type | `packages/fluxiq/src/programs/automation-studio/api/contracts/ui-cache.ts` | - |
| `AutomationStudioListProjectUiCacheStatsResponse` | Type | `packages/fluxiq/src/programs/automation-studio/api/contracts/ui-cache.ts` | - |
| `AutomationStudioListReusableLlmContextsRequest` | Type | `packages/fluxiq/src/programs/automation-studio/api/contracts/llm.ts` | - |
| `AutomationStudioLlmActionPermissions` | Type | `packages/fluxiq/src/programs/automation-studio/runtime/llm/harness/context-packet.ts` | What a run's permission gate lets its actions do, by consequence class. Given to a call whose actions the gate governs, it takes the place of the policy's side-effect flags in `policyGates`: the gate, not those flags, is what decides such an action, and a model told "no external side effects" would avoid the press a person's permission or instruction allowed. |
| `AutomationStudioLlmBuildCall` | Type | `packages/fluxiq/src/programs/automation-studio/runtime/llm/run-call-record.ts` | What a build knows about one of its own provider calls. A build is not a run: it holds no budget lease, so nothing reserves, counts or charges its calls one by one, and the per-call ledger above never saw them. What it does keep is the evidence loop's trace, which already records one row per decision with the usage the provider reported for it -- so a build's calls can be itemized after the fact from the record it already wrote, without changing anything about how a build runs. |
| `automationStudioLlmBuildCallRecord` | Value | `packages/fluxiq/src/programs/automation-studio/runtime/llm/run-call-record.ts` | - |
| `automationStudioLlmBuildTrace` | Object | `packages/fluxiq/src/programs/automation-studio/runtime/llm/evidence-progress/build-trace.ts` | - |
| `AutomationStudioLlmContextPacket` | Type | `packages/fluxiq/src/programs/automation-studio/runtime/llm/harness/context-packet.ts` | - |
| `AutomationStudioLlmConversationContext` | Type | `packages/fluxiq/src/programs/automation-studio/runtime/llm/harness/conversation.ts` | The thread, every turn of it. |
| `AutomationStudioLlmConversationTurn` | Type | `packages/fluxiq/src/programs/automation-studio/runtime/llm/harness/conversation.ts` | One turn, as a request carries it. |
| `AutomationStudioLlmDecisionContextAmendmentRefusal` | Type | `packages/fluxiq/src/programs/automation-studio/runtime/llm/decision-context/decision.ts` | One amendment the draft refused, and whether it had refused the same one before. |
| `AutomationStudioLlmDecisionContextChange` | Type | `packages/fluxiq/src/programs/automation-studio/runtime/llm/decision-context/decision.ts` | Whether a call changed what a later look would see. |
| `automationStudioLlmDecisionContextClosedCode` | Value | `packages/fluxiq/src/programs/automation-studio/runtime/llm/decision-context/closed-code.ts` | - |
| `automationStudioLlmDecisionContextClosedDetail` | Value | `packages/fluxiq/src/programs/automation-studio/runtime/llm/decision-context/closed-detail.ts` | - |
| `AutomationStudioLlmDecisionContextDecision` | Type | `packages/fluxiq/src/programs/automation-studio/runtime/llm/decision-context/decision.ts` | One decision and Core's answer, as the caller reports it. |
| `AutomationStudioLlmDecisionContextDryRun` | Type | `packages/fluxiq/src/programs/automation-studio/runtime/llm/decision-context/decision.ts` | What the replay of the draft said when a completion reached it: every step replayed (`clean`), the same draft had already replayed clean and was not replayed again (`reused_clean`), no replay applied to it (`not_run`: the dry run is off, or the draft does not say how to replay), or the steps it refused. |
| `AutomationStudioLlmDecisionContextDryRunRefusal` | Type | `packages/fluxiq/src/programs/automation-studio/runtime/llm/decision-context/decision.ts` | One step a dry run did not replay, and how it answered. |
| `automationStudioLlmDecisionContextEntry` | Value | `packages/fluxiq/src/programs/automation-studio/runtime/llm/decision-context/entry.ts` | - |
| `AutomationStudioLlmDecisionContextRecord` | Type | `packages/fluxiq/src/programs/automation-studio/runtime/llm/decision-context/decision.ts` | One row as the recorder holds it. `detail` is the completion feedback's closed codes; `firstSeenAt` is the first iteration the same decision was made, when that was earlier than this one. |
| `AutomationStudioLlmDecisionContextRecorder` | Class | `packages/fluxiq/src/programs/automation-studio/runtime/llm/decision-context/recorder.ts` | - |
| `AutomationStudioLlmDecisionContextRepeat` | Type | `packages/fluxiq/src/programs/automation-studio/runtime/llm/decision-context/decision.ts` | How often a decision has been made, this one included, and at which iterations, oldest first. For a completion "the same decision" is the same answer against the same draft revision. |
| `automationStudioLlmDecisionContextShown` | Value | `packages/fluxiq/src/programs/automation-studio/runtime/llm/decision-context/shown.ts` | - |
| `automationStudioLlmDecisionContextSignature` | Value | `packages/fluxiq/src/programs/automation-studio/runtime/llm/decision-context/signature.ts` | - |
| `AutomationStudioLlmDecisionContextSignatureInput` | Type | `packages/fluxiq/src/programs/automation-studio/runtime/llm/decision-context/signature.ts` | The part of a decision that identifies it. The loop's own decision type satisfies it. |
| `automationStudioLlmDecisionContextSupersede` | Value | `packages/fluxiq/src/programs/automation-studio/runtime/llm/decision-context/supersede.ts` | - |
| `automationStudioLlmDescribeNodesBundle` | Value | `packages/fluxiq/src/programs/automation-studio/runtime/llm/node-tools/describe-nodes.ts` | - |
| `AutomationStudioLlmDiagnosisFields` | Type | `packages/fluxiq/src/programs/automation-studio/runtime/llm/harness/structured-response.ts` | The one channel through which a model may contribute to a diagnosis. Every response's `metadata` is stripped on the way in, deliberately: it is an open field and an open field is a way to smuggle arbitrary JSON past the recognized-field allowlist. That left no channel at all, so the structured diagnosis the runtime builds was entirely Core's own verdicts and the model's answer was a sentence of prose nobody could act on. This is the narrow replacement: a named field, with a fixed set of keys, each bounded to a value Core can check without knowing anything about the medium the failure happened in. It is a channel, not an opening -- `metadata` is still stripped, and an unrecognized key inside `diagnosis` is still refused. |
| `AutomationStudioLlmDiagnostic` | Type | `packages/fluxiq/src/programs/automation-studio/runtime/llm/harness/diagnostic.ts` | - |
| `AutomationStudioLlmDomainSystemInstructions` | Type | `packages/fluxiq/src/programs/automation-studio/runtime/llm/domain-instructions/system-instructions.ts` | What a bound domain asks Core to tell the model on every request made for that domain's work, in the domain's own words (`../harness-options/binding.ts`). `version` names the text, so a step log or a cached prefix that changed can be traced to the edit that changed it; `text` is the instructions themselves. Both are checked when the runtime is bound (`./validate.ts`), never mid-build. |
| `automationStudioLlmDraftEntryWithoutDeniedKeys` | Value | `packages/fluxiq/src/programs/automation-studio/runtime/llm/harness/draft-screen.ts` | - |
| `AutomationStudioLlmEvidenceCompletionCheck` | Type | `packages/fluxiq/src/programs/automation-studio/runtime/llm/evidence-loop/completion-check.ts` | What a caller's check made of a completed result. A refusal names why, in issue codes, and carries the feedback the model is shown before it is asked again: bounded JSON the caller authored -- what was wrong and where -- never content the model has not already seen from its own tools. |
| `automationStudioLlmEvidenceDraftAmendmentFeedback` | Value | `packages/fluxiq/src/programs/automation-studio/runtime/llm/draft-amendment-feedback.ts` | - |
| `AutomationStudioLlmEvidenceLoopAccounting` | Type | `packages/fluxiq/src/programs/automation-studio/runtime/llm/evidence-loop/accounting.ts` | What the loop's contract is, declared one noun per file in `evidence-loop/` and republished here, because a dozen modules across the runtime import them from this path and the split is meant to be one none of them notices. |
| `AutomationStudioLlmEvidenceLoopAnswerability` | Type | `packages/fluxiq/src/programs/automation-studio/runtime/llm/evidence-loop/answerability.ts` | Content-free capability facts observed while checking a completed plan. |
| `AutomationStudioLlmEvidenceLoopBudget` | Type | `packages/fluxiq/src/programs/automation-studio/runtime/llm/loop-budget.ts` | The bounds a loop is given, each optional. |
| `AutomationStudioLlmEvidenceLoopDecision` | Type | `packages/fluxiq/src/programs/automation-studio/runtime/llm/evidence-loop/decision.ts` | What the loop's contract is, declared one noun per file in `evidence-loop/` and republished here, because a dozen modules across the runtime import them from this path and the split is meant to be one none of them notices. |
| `AutomationStudioLlmEvidenceLoopDraftChange` | Type | `packages/fluxiq/src/programs/automation-studio/runtime/llm/evidence-loop/draft-change.ts` | Stable build-local identities and counts for one draft amendment decision. |
| `AutomationStudioLlmEvidenceLoopDraftShown` | Type | `packages/fluxiq/src/programs/automation-studio/runtime/llm/evidence-loop/draft-shown.ts` | What one decision was shown of the draft. |
| `AutomationStudioLlmEvidenceLoopExhaustedBound` | Type | `packages/fluxiq/src/programs/automation-studio/runtime/llm/evidence-loop/exhaustion.ts` | Which allowance ran out. Each is a number a retry can raise. |
| `AutomationStudioLlmEvidenceLoopExhaustion` | Type | `packages/fluxiq/src/programs/automation-studio/runtime/llm/evidence-loop/exhaustion.ts` | What an exhausted loop has to say for itself. The first two answer "was this budget the problem?"; the rest answer "how close was it?" -- a build that stopped one proposable step short of a plan reads very differently from one that never appended an action, and before this record the two were the same sentence. |
| `AutomationStudioLlmEvidenceLoopFailureCode` | Type | `packages/fluxiq/src/programs/automation-studio/runtime/llm/evidence-loop/result.ts` | What the loop's contract is, declared one noun per file in `evidence-loop/` and republished here, because a dozen modules across the runtime import them from this path and the split is meant to be one none of them notices. |
| `AutomationStudioLlmEvidenceLoopInput` | Type | `packages/fluxiq/src/programs/automation-studio/runtime/llm/loop-configuration.ts` | What a loop may be configured with, in `loop-configuration.ts` with the arithmetic that reads it. |
| `AutomationStudioLlmEvidenceLoopProgress` | Type | `packages/fluxiq/src/programs/automation-studio/runtime/llm/evidence-progress/progress.ts` | Content-free state transition measured for one evidence-loop trace row. |
| `AutomationStudioLlmEvidenceLoopProviderUnavailable` | Type | `packages/fluxiq/src/programs/automation-studio/runtime/llm/unanswered-calls.ts` | How a loop the provider stopped answering ended. |
| `AutomationStudioLlmEvidenceLoopResult` | Type | `packages/fluxiq/src/programs/automation-studio/runtime/llm/evidence-loop/result.ts` | What the loop's contract is, declared one noun per file in `evidence-loop/` and republished here, because a dozen modules across the runtime import them from this path and the split is meant to be one none of them notices. |
| `automationStudioLlmEvidenceLoopRouteChecked` | Value | `packages/fluxiq/src/programs/automation-studio/runtime/llm/loop-configuration.ts` | - |
| `automationStudioLlmEvidenceLoopToolSet` | Value | `packages/fluxiq/src/programs/automation-studio/runtime/llm/node-tools/loop-tools.ts` | - |
| `AutomationStudioLlmEvidenceLoopToolSet` | Type | `packages/fluxiq/src/programs/automation-studio/runtime/llm/node-tools/loop-tools.ts` | - |
| `AutomationStudioLlmEvidenceLoopTrace` | Type | `packages/fluxiq/src/programs/automation-studio/runtime/llm/evidence-loop/trace.ts` | What the loop's contract is, declared one noun per file in `evidence-loop/` and republished here, because a dozen modules across the runtime import them from this path and the split is meant to be one none of them notices. |
| `AutomationStudioLlmEvidenceLoopUnreadable` | Type | `packages/fluxiq/src/programs/automation-studio/runtime/llm/unreadable-reply.ts` | How many unreadable replies a loop met, and which kinds. |
| `automationStudioLlmEvidenceRecallBinding` | Value | `packages/fluxiq/src/programs/automation-studio/runtime/llm/evidence-recall/binding.ts` | - |
| `automationStudioLlmEvidenceRecallTool` | Value | `packages/fluxiq/src/programs/automation-studio/runtime/llm/evidence-recall/tool.ts` | - |
| `automationStudioLlmEvidenceRerunCheckedRows` | Value | `packages/fluxiq/src/programs/automation-studio/runtime/llm/node-tools/rerun-checked-rows.ts` | - |
| `automationStudioLlmEvidenceRestored` | Value | `packages/fluxiq/src/programs/automation-studio/runtime/llm/evidence-recall/restored.ts` | - |
| `AutomationStudioLlmEvidenceRestoredStep` | Type | `packages/fluxiq/src/programs/automation-studio/runtime/llm/evidence-loop/completion-check.ts` | A withdrawn draft step the check put back before checking: which one, by the draft position it had, and how the model had withdrawn it. Content-free -- a position and a closed word -- so it may travel on every published record. Flow Bootstrap restores the step that reached the start location when the draft's amendments had withdrawn it (`../../flow-bootstrap/reachability/start-step.ts`), and that silently changed the Flow a completion was judged on: nothing in a run's record said the Flow had a step the model had taken out. |
| `AutomationStudioLlmEvidenceRuntimeBinding` | Type | `packages/fluxiq/src/programs/automation-studio/runtime/llm/harness-options/binding.ts` | What a host binds to give the loop its domain's actions. `domainId` is the field the slot never had, and everything the registry does about scoping follows from it. |
| `automationStudioLlmEvidenceRuntimeBindingChecked` | Value | `packages/fluxiq/src/programs/automation-studio/runtime/llm/domain-instructions/binding-check.ts` | - |
| `AutomationStudioLlmEvidenceScreenResult` | Type | `packages/fluxiq/src/programs/automation-studio/runtime/llm/harness/evidence-screen.ts` | What a screen found. Both are refusals; which one is for the caller's own record, never the value. |
| `AutomationStudioLlmEvidenceTool` | Type | `packages/fluxiq/src/programs/automation-studio/runtime/llm/evidence-loop/tool.ts` | What the loop's contract is, declared one noun per file in `evidence-loop/` and republished here, because a dozen modules across the runtime import them from this path and the split is meant to be one none of them notices. |
| `AutomationStudioLlmEvidenceToolExecutionResult` | Type | `packages/fluxiq/src/programs/automation-studio/runtime/llm/evidence-loop/tool-execution.ts` | What the loop's contract is, declared one noun per file in `evidence-loop/` and republished here, because a dozen modules across the runtime import them from this path and the split is meant to be one none of them notices. |
| `AutomationStudioLlmEvidenceToolFailureCode` | Type | `packages/fluxiq/src/programs/automation-studio/runtime/llm/tool-failure.ts` | The call threw, or it returned something that is not a tool result. A refused result's code names the check it failed, `llm_evidence_loop.tool_result_invalid.<check>`, and that one code is what the model, the trace row, the history and the draft step all carry. The bare `tool_result_invalid` stays for a caller that cannot say which. |
| `AutomationStudioLlmEvidenceViewGroup` | Type | `packages/fluxiq/src/programs/automation-studio/runtime/llm/decision-context/view-groups.ts` | One kind of view: its members, under `holder` or, without one, at the top of the result. |
| `automationStudioLlmEvidenceViewGroups` | Value | `packages/fluxiq/src/programs/automation-studio/runtime/llm/decision-context/view-groups.ts` | - |
| `AutomationStudioLlmExploredEvidenceSlot` | Type | `packages/fluxiq/src/programs/automation-studio/runtime/llm/harness/explored-evidence.ts` | - |
| `AutomationStudioLlmFailureEvidenceCaptureInput` | Type | `packages/fluxiq/src/programs/automation-studio/runtime/llm/harness/failure-evidence.ts` | - |
| `AutomationStudioLlmHarnessInput` | Type | `packages/fluxiq/src/programs/automation-studio/runtime/llm/harness/task-request.ts` | - |
| `AutomationStudioLlmInvocationGateDecision` | Type | `packages/fluxiq/src/programs/automation-studio/runtime/training-modes.ts` | - |
| `AutomationStudioLlmInvocationGateInput` | Type | `packages/fluxiq/src/programs/automation-studio/runtime/training-modes.ts` | - |
| `AutomationStudioLlmModelCaller` | Type | `packages/fluxiq/src/programs/automation-studio/runtime/llm/model-caller.ts` | The person a model call is made for: whose unlocked Secret Keys key pays. Not an authorization. A model call made while building, exploring, repairing, verifying, diagnosing or adapting a Flow needs no grant: nothing is issued, held, digest-checked, confirmed or revoked around it. What stays gated is a lasting real-world consequence of an *action* -- moving money, deleting, sending -- which the action permission gate asks the person about one act at a time. Spend is bounded by the run's own budget and the Flow's configured cost ceiling. |
| `automationStudioLlmNodeDescriptions` | Value | `packages/fluxiq/src/programs/automation-studio/runtime/llm/node-tools/node-descriptions.ts` | - |
| `AutomationStudioLlmNodeDescriptions` | Type | `packages/fluxiq/src/programs/automation-studio/runtime/llm/node-tools/node-descriptions.ts` | One build's described-node memory. |
| `AutomationStudioLlmOpaqueSecretResolver` | Type | `packages/fluxiq/src/programs/automation-studio/runtime/llm/provider-contract.ts` | - |
| `AutomationStudioLlmProvider` | Type | `packages/fluxiq/src/programs/automation-studio/runtime/llm/harness/provider.ts` | - |
| `automationStudioLlmProviderCall` | Value | `packages/fluxiq/src/programs/automation-studio/runtime/llm/provider-retry/call.ts` | - |
| `AutomationStudioLlmProviderCallOutcome` | Type | `packages/fluxiq/src/programs/automation-studio/runtime/llm/provider-retry/call.ts` | - |
| `AutomationStudioLlmProviderError` | Class | `packages/fluxiq/src/programs/automation-studio/runtime/llm/provider-contract.ts` | - |
| `AutomationStudioLlmProviderErrorCode` | Type | `packages/fluxiq/src/programs/automation-studio/runtime/llm/provider-contract.ts` | - |
| `automationStudioLlmProviderErrorSpendsCall` | Value | `packages/fluxiq/src/programs/automation-studio/runtime/llm/failure-disposition.ts` | - |
| `AutomationStudioLlmProviderFailureDisposition` | Type | `packages/fluxiq/src/programs/automation-studio/runtime/llm/failure-disposition.ts` | What a failed call does to the rest of the model's calls in the run. |
| `AutomationStudioLlmProviderFailureProvenance` | Type | `packages/fluxiq/src/programs/automation-studio/runtime/llm/provider-contract.ts` | - |
| `automationStudioLlmProviderFailureSpendsCall` | Value | `packages/fluxiq/src/programs/automation-studio/runtime/llm/failure-disposition.ts` | - |
| `AutomationStudioLlmProviderInputSize` | Type | `packages/fluxiq/src/programs/automation-studio/runtime/llm/provider-contract.ts` | The size of a request a provider refused as too large (`llm.provider_input_budget_exceeded`), in numbers only. A size is safe to record where the check's own sentence is not, so this is the one pre-flight refusal whose recorded message says more than that it happened: a request over the model's window fails loudly, with its size, wherever it is caught. |
| `AutomationStudioLlmProviderInvocationState` | Type | `packages/fluxiq/src/programs/automation-studio/runtime/llm/provider-contract.ts` | - |
| `AutomationStudioLlmProviderMetadata` | Type | `packages/fluxiq/src/programs/automation-studio/runtime/llm/harness/provider.ts` | - |
| `automationStudioLlmProviderPaidUsage` | Value | `packages/fluxiq/src/programs/automation-studio/runtime/llm/provider-contract.ts` | - |
| `AutomationStudioLlmProviderPreflightErrorCode` | Type | `packages/fluxiq/src/programs/automation-studio/runtime/llm/provider-contract.ts` | - |
| `AutomationStudioLlmProviderRefusal` | Type | `packages/fluxiq/src/programs/automation-studio/runtime/provider-refusal/record.ts` | A provider's refusal of one request. `withheld` names every omission, so a reader can tell "the provider said nothing" from "the provider said something this record would not carry". The vocabulary belongs to the producer -- Core's own adapter uses `body_unreadable`, `body_over_limit`, `body_empty`, `body_not_json`, `error_object_absent`, `error_fields_unnamed`, `message_truncated`, `message_locator_shaped` and `message_credential_shaped` -- and this module adds `request_unpublishable` when it drops a request shape of its own accord. |
| `AutomationStudioLlmProviderRefusalError` | Type | `packages/fluxiq/src/programs/automation-studio/runtime/provider-refusal/record.ts` | The provider's own error, read field by field out of a refusal body -- never the body itself. |
| `AutomationStudioLlmProviderResolution` | Type | `packages/fluxiq/src/programs/automation-studio/runtime/llm/resolver-contract.ts` | - |
| `AutomationStudioLlmProviderResolverInput` | Type | `packages/fluxiq/src/programs/automation-studio/runtime/llm/resolver-contract.ts` | - |
| `AutomationStudioLlmProviderResponseState` | Type | `packages/fluxiq/src/programs/automation-studio/runtime/llm/provider-contract.ts` | - |
| `AutomationStudioLlmProviderRetryAccount` | Type | `packages/fluxiq/src/programs/automation-studio/runtime/llm/provider-retry/account.ts` | The whole account of one provider call's attempts. |
| `AutomationStudioLlmProviderRetryAttempt` | Type | `packages/fluxiq/src/programs/automation-studio/runtime/llm/provider-retry/account.ts` | One provider request that failed, and what followed it. |
| `automationStudioLlmProviderRetryDecision` | Value | `packages/fluxiq/src/programs/automation-studio/runtime/llm/provider-retry/decision.ts` | - |
| `AutomationStudioLlmProviderRetryDecision` | Type | `packages/fluxiq/src/programs/automation-studio/runtime/llm/provider-retry/decision.ts` | - |
| `automationStudioLlmProviderRetryHintMs` | Value | `packages/fluxiq/src/programs/automation-studio/runtime/llm/provider-retry/hint.ts` | - |
| `AutomationStudioLlmProviderRetryLedger` | Class | `packages/fluxiq/src/programs/automation-studio/runtime/llm/provider-retry/ledger.ts` | - |
| `automationStudioLlmProviderRetryRunLedger` | Object | `packages/fluxiq/src/programs/automation-studio/runtime/llm/provider-retry/ledger.ts` | Core's own, used by every call whose caller names no other. |
| `AutomationStudioLlmProviderRetryStop` | Type | `packages/fluxiq/src/programs/automation-studio/runtime/llm/provider-retry/account.ts` | Why the loop stopped asking. `answered` is the ordinary end. `not_retryable` is the adapter's verdict -- a 400, an authentication failure, a malformed request of our own making -- and is the *correct* end for those: retrying one spends the run's money to be told the same thing. The three bounds are the ones `limits.ts` states. |
| `AutomationStudioLlmProviderThrow` | Type | `packages/fluxiq/src/programs/automation-studio/runtime/llm/throw-account/read.ts` | A bounded, screened account of an untyped provider throw, as a stored Flow Bootstrap failure publishes it. Every field is optional because a throw may carry any of them or none; a throw that yields none produces no record. |
| `automationStudioLlmProviderThrowRead` | Value | `packages/fluxiq/src/programs/automation-studio/runtime/llm/throw-account/read.ts` | - |
| `AutomationStudioLlmProviderThrowRead` | Type | `packages/fluxiq/src/programs/automation-studio/runtime/llm/throw-account/read.ts` | A throw as read, before its message is screened. `account` is publishable as it stands: codes and closed words only. `unscreenedMessage` is not, and nothing may publish it except through `../harness/throw-screen.ts`. |
| `AutomationStudioLlmProviderThrowWithheld` | Type | `packages/fluxiq/src/programs/automation-studio/runtime/llm/throw-account/read.ts` | Why part of a throw was not carried, one word per reason. |
| `automationStudioLlmProviderUnanswered` | Value | `packages/fluxiq/src/programs/automation-studio/runtime/llm/unanswered-calls.ts` | - |
| `automationStudioLlmProviderWithDomainInstructions` | Value | `packages/fluxiq/src/programs/automation-studio/runtime/llm/domain-instructions/provider.ts` | - |
| `AutomationStudioLlmRecentActionContext` | Type | `packages/fluxiq/src/programs/automation-studio/runtime/llm/harness/context-packet.ts` | - |
| `automationStudioLlmRequestEvidenceRefusal` | Value | `packages/fluxiq/src/programs/automation-studio/runtime/llm/harness/request-evidence-check.ts` | - |
| `AutomationStudioLlmRequestRefusalCode` | Type | `packages/fluxiq/src/programs/automation-studio/runtime/llm/harness/request-refusal.ts` | - |
| `AutomationStudioLlmRequestRefusedError` | Class | `packages/fluxiq/src/programs/automation-studio/runtime/llm/harness/request-refusal.ts` | The error a request guard throws. Recognised by `name` and `code` rather than by `instanceof`, so a reader in a directory that must not import this one as a value (the build's failure projection, which `runtime/llm` already imports from) can still name it. |
| `automationStudioLlmResolutionWithinFlowSettings` | Value | `packages/fluxiq/src/programs/automation-studio/runtime/llm/flow-execution-limits/resolution-within-flow-settings.ts` | - |
| `automationStudioLlmResolverWithDomainInstructions` | Value | `packages/fluxiq/src/programs/automation-studio/runtime/llm/domain-instructions/resolver.ts` | - |
| `AutomationStudioLlmRunBudgetAllowance` | Type | `packages/fluxiq/src/programs/automation-studio/runtime/llm/run-budget.ts` | Which kind of call a reservation is, for the run's accounting. `run` is the diagnosis, the patch, and anything else the loop's fixed stages spend on this run. `exploration` is a decision inside a bounded exploration. This is a label, not a second allowance. It used to be both: the exploration had its own call count because the run's ordinary count was two, the diagnosis and the patch spent both, and an exploration that borrowed from it was refused before it looked at anything. Once the run's call count stopped being the thing that bounds a run, a separate count for exploring had nothing left to protect, and two overlapping call ceilings is one more than a person can reason about. What survives is the reason the split was worth having in the first place: a run's receipt says how much of what it spent went on looking around, rather than mixing it into the diagnosis and the patch. An undeclared reservation is a `run` reservation. |
| `AutomationStudioLlmRunBudgetDiagnostic` | Type | `packages/fluxiq/src/programs/automation-studio/runtime/llm/run-budget.ts` | - |
| `AutomationStudioLlmRunBudgetLease` | Type | `packages/fluxiq/src/programs/automation-studio/runtime/llm/run-budget.ts` | - |
| `AutomationStudioLlmRunBudgetLedger` | Class | `packages/fluxiq/src/programs/automation-studio/runtime/llm/run-budget.ts` | - |
| `AutomationStudioLlmRunBudgetLimits` | Type | `packages/fluxiq/src/programs/automation-studio/runtime/llm/run-budget.ts` | - |
| `AutomationStudioLlmRunBudgetReservation` | Type | `packages/fluxiq/src/programs/automation-studio/runtime/llm/run-budget.ts` | - |
| `AutomationStudioLlmRunBudgetReservationInput` | Type | `packages/fluxiq/src/programs/automation-studio/runtime/llm/run-budget.ts` | - |
| `AutomationStudioLlmRunCallCharge` | Type | `packages/fluxiq/src/programs/automation-studio/runtime/llm/run-call-record.ts` | What the ledger charged the run for one call. |
| `AutomationStudioLlmRunCallChargeBasis` | Type | `packages/fluxiq/src/programs/automation-studio/runtime/llm/run-call-record.ts` | Which source a charged figure came from. |
| `AutomationStudioLlmRunCallDescription` | Type | `packages/fluxiq/src/programs/automation-studio/runtime/llm/run-call-record.ts` | What a call is, known before it is sent. |
| `AutomationStudioLlmRunCallOutcome` | Type | `packages/fluxiq/src/programs/automation-studio/runtime/llm/run-call-record.ts` | How a call ended, known once its answer was checked. |
| `AutomationStudioLlmRunCallRecord` | Type | `packages/fluxiq/src/programs/automation-studio/runtime/llm/run-call-record.ts` | - |
| `automationStudioLlmRunCostCeilingUsd` | Value | `packages/fluxiq/src/programs/automation-studio/runtime/llm/flow-execution-limits/run-cost-ceiling.ts` | - |
| `automationStudioLlmRunFlowBinding` | Value | `packages/fluxiq/src/programs/automation-studio/runtime/llm/node-tools/run-flow.ts` | - |
| `automationStudioLlmRunFlowTool` | Value | `packages/fluxiq/src/programs/automation-studio/runtime/llm/node-tools/run-flow.ts` | - |
| `automationStudioLlmRunNodeDescribingFailures` | Value | `packages/fluxiq/src/programs/automation-studio/runtime/llm/node-tools/describing-failures.ts` | - |
| `automationStudioLlmRunNodeTool` | Value | `packages/fluxiq/src/programs/automation-studio/runtime/llm/node-tools/run-node.ts` | - |
| `AutomationStudioLlmSecretReference` | Type | `packages/fluxiq/src/programs/automation-studio/runtime/llm/deepseek/provider.ts` | - |
| `automationStudioLlmSignalTimedOut` | Value | `packages/fluxiq/src/programs/automation-studio/runtime/llm/provider-contract.ts` | - |
| `automationStudioLlmStepLogAnswer` | Value | `packages/fluxiq/src/programs/automation-studio/runtime/llm/step-log/answer-step.ts` | - |
| `AutomationStudioLlmStepLogAnsweredRow` | Type | `packages/fluxiq/src/programs/automation-studio/runtime/llm/step-log/answer-step.ts` | The members of a loop row (`../evidence-loop/trace.ts`) an answer step reads, declared here so the step log takes no type from the loop that feeds it. |
| `AutomationStudioLlmStepLogAnswerStep` | Type | `packages/fluxiq/src/programs/automation-studio/runtime/llm/step-log/answer-step.ts` | An answer step already written, completed once the next decision is about to be asked. |
| `AutomationStudioLlmStepLogAnswerVerdict` | Type | `packages/fluxiq/src/programs/automation-studio/runtime/llm/step-log/answer-step.ts` | - |
| `AutomationStudioLlmStepLogContext` | Type | `packages/fluxiq/src/programs/automation-studio/runtime/llm/step-log/scope.ts` | The part, round and phase every step made inside a scope is written with, and the pass a test's call is on. |
| `AutomationStudioLlmStepLogCoreEntry` | Type | `packages/fluxiq/src/programs/automation-studio/runtime/llm/step-log/answer-step.ts` | One evidence entry Core itself showed the model about a decision -- the decision check, a completion's refusal, the dry run's verdict, the note on a request answered from memory, a stall redirect -- as the model was shown it. |
| `automationStudioLlmStepLogDirectory` | Value | `packages/fluxiq/src/programs/automation-studio/runtime/llm/step-log/directory.ts` | - |
| `AutomationStudioLlmStepLogModelCall` | Type | `packages/fluxiq/src/programs/automation-studio/runtime/llm/step-log/model-step.ts` | Everything a provider adapter knows of a call before it is sent. Never the credential, never a header. |
| `automationStudioLlmStepLogModelStep` | Value | `packages/fluxiq/src/programs/automation-studio/runtime/llm/step-log/model-step.ts` | - |
| `AutomationStudioLlmStepLogModelStep` | Type | `packages/fluxiq/src/programs/automation-studio/runtime/llm/step-log/model-step.ts` | One model exchange being written down. Every method is best-effort and returns nothing. |
| `AutomationStudioLlmStepLogPart` | Type | `packages/fluxiq/src/programs/automation-studio/runtime/llm/step-log/scope.ts` | Which build a step serves: the Flow's creation, or a re-author after a playback run refuted its result. Each has its own cost ceiling. No part means neither: a playback run, its result check and recovery, or the chat. |
| `AutomationStudioLlmStepLogPass` | Type | `packages/fluxiq/src/programs/automation-studio/runtime/llm/step-log/scope.ts` | Which pass of a repeat a test's call is (t195 w43): its number, the pass count where the walker knows it before the pass (a list's rows; a repeat while a check holds does not), and the label of the pass's row where the list read named its rows, already screened as the judge's are. Never a row's values. Live run `run-musp474o-e0ed7432` ran a repeated Confirm once per row and no pass folder said which row it was on. |
| `AutomationStudioLlmStepLogPhase` | Type | `packages/fluxiq/src/programs/automation-studio/runtime/llm/step-log/scope.ts` | Which part of a build a step belongs to, as the build's phases set it. `read` is the build's reading of its instructions, made outside any round. |
| `automationStudioLlmStepLogScope` | Object | `packages/fluxiq/src/programs/automation-studio/runtime/llm/step-log/scope.ts` | The build's part, round and phase, carried to the provider adapters and the tool wrapper without threading them through every call between. Core's provider call knows its task but not which build or round it serves: rounds and phases live in `flow-bootstrap/unfinished-build/phases.ts`, which sets a scope around each round and each test; the build's caller sets the part around the whole build with `within`. Both merge into the scope already current. The test's walker sets `pass` around each call of a repeat's pass, so the tool step writes which pass and row it was. With the step log off, each just calls `fn`. |
| `automationStudioLlmStepLogScreen` | Value | `packages/fluxiq/src/programs/automation-studio/runtime/llm/step-log/screen.ts` | - |
| `automationStudioLlmStepLogTool` | Value | `packages/fluxiq/src/programs/automation-studio/runtime/llm/step-log/tool-step.ts` | - |
| `AutomationStudioLlmStepLogUsage` | Type | `packages/fluxiq/src/programs/automation-studio/runtime/llm/step-log/model-step.ts` | What a model step's meta records of a call's token use. |
| `AutomationStudioLlmStructuredResponse` | Type | `packages/fluxiq/src/programs/automation-studio/runtime/llm/harness/structured-response.ts` | - |
| `AutomationStudioLlmTaskDomainInstructions` | Type | `packages/fluxiq/src/programs/automation-studio/runtime/llm/domain-instructions/task-domain-instructions.ts` | The bound domain's instructions as one request carries them: which domain they belong to, which version of them, and the text. Stamped on every request by the provider decorator (`./provider.ts`), never by a call site, so no path that reaches a provider can leave them out. A provider adapter puts the text in its system message; it is never part of the user payload. |
| `automationStudioLlmTaskExpectsDiagnosis` | Value | `packages/fluxiq/src/programs/automation-studio/runtime/llm/harness/task-kind.ts` | - |
| `AutomationStudioLlmTaskKind` | Type | `packages/fluxiq/src/programs/automation-studio/runtime/llm/harness/task-kind.ts` | - |
| `AutomationStudioLlmTaskRequest` | Type | `packages/fluxiq/src/programs/automation-studio/runtime/llm/harness/task-request.ts` | - |
| `AutomationStudioLlmTaskResult` | Type | `packages/fluxiq/src/programs/automation-studio/runtime/llm/harness/task-request.ts` | - |
| `automationStudioLlmTaskResultSpentWithoutDecision` | Value | `packages/fluxiq/src/programs/automation-studio/runtime/llm/unusable-decision.ts` | - |
| `AutomationStudioLlmTokenLimits` | Type | `packages/fluxiq/src/programs/automation-studio/runtime/llm/harness/token-limits.ts` | - |
| `automationStudioLlmUnreadableReplySaid` | Value | `packages/fluxiq/src/programs/automation-studio/runtime/llm/unreadable-reply.ts` | - |
| `automationStudioLlmUnusableDecisionError` | Value | `packages/fluxiq/src/programs/automation-studio/runtime/llm/unusable-decision.ts` | - |
| `AutomationStudioLlmUnusableDecisionError` | Class | `packages/fluxiq/src/programs/automation-studio/runtime/llm/unusable-decision.ts` | Thrown by a decision callback to say "the provider was asked and its answer cannot be acted on, for a reason another attempt could fix". It carries issue codes only, never a model's words. Where the provider's reply arrived and could not be read, it also carries the reply's account: which malformed case it was, its finish reason, its length and what it cost (`./reply-account.ts`). One code for seven cases is what left 14 refused decisions of `run-munw7ffn-fe1cecd2` unexplained; the loop writes this onto the decision's row. |
| `AutomationStudioLlmUsageSummary` | Type | `packages/fluxiq/src/programs/automation-studio/runtime/llm/harness/provider.ts` | - |
| `AutomationStudioLoadedCompiledPlan` | Type | `packages/fluxiq/src/programs/automation-studio/storage/project/compiled-plan-store.ts` | - |
| `automationStudioLocatorShapedText` | Value | `packages/fluxiq/src/programs/automation-studio/runtime/llm/harness/locator-text.ts` | - |
| `automationStudioLoopProtocolInstruction` | Value | `packages/fluxiq/src/programs/automation-studio/runtime/llm/stages/instructions.ts` | - |
| `AutomationStudioLoopStage` | Type | `packages/fluxiq/src/programs/automation-studio/runtime/llm/stages/protocol.ts` | - |
| `automationStudioLoopStageIndex` | Value | `packages/fluxiq/src/programs/automation-studio/runtime/llm/stages/protocol.ts` | - |
| `AutomationStudioLoopStageInstructionBundle` | Type | `packages/fluxiq/src/programs/automation-studio/runtime/llm/stages/registry.ts` | - |
| `AutomationStudioLoopStageInstructionContribution` | Type | `packages/fluxiq/src/programs/automation-studio/runtime/llm/stages/registry.ts` | One instruction a domain attaches to one stage. `mode` is the whole of L15's second power. `extend` leaves Core's default in place and adds beside it; `replace` takes its place. There is no third mode, and in particular none that reaches the ordering statement. |
| `AutomationStudioLoopStageInstructionRegistry` | Class | `packages/fluxiq/src/programs/automation-studio/runtime/llm/stages/registry.ts` | - |
| `automationStudioLoopStageInstructions` | Value | `packages/fluxiq/src/programs/automation-studio/runtime/llm/stages/registry.ts` | - |
| `AutomationStudioLoopStageRefusalCode` | Type | `packages/fluxiq/src/programs/automation-studio/runtime/llm/stages/protocol.ts` | Why a move between stages was refused. Each one names a distinct way of getting the order wrong, so a refusal is actionable and so a test can assert the specific rule rather than "it threw". |
| `automationStudioLoopStageTransition` | Value | `packages/fluxiq/src/programs/automation-studio/runtime/llm/stages/protocol.ts` | - |
| `AutomationStudioLoopStageTransition` | Type | `packages/fluxiq/src/programs/automation-studio/runtime/llm/stages/protocol.ts` | - |
| `automationStudioMappedInstructionText` | Value | `packages/fluxiq/src/programs/automation-studio/runtime/action-permissions/instruction-quote/mapped.ts` | - |
| `AutomationStudioMappedInstructionText` | Type | `packages/fluxiq/src/programs/automation-studio/runtime/action-permissions/instruction-quote/mapped.ts` | The comparison text, and where any range of it came from in the original. |
| `AutomationStudioMarketingDemo` | Type | `packages/fluxiq/src/programs/automation-studio/testing/marketing-demo.ts` | - |
| `automationStudioMarkRunAdapting` | Value | `packages/fluxiq/src/programs/automation-studio/runtime/run-control/mark-adapting.ts` | - |
| `automationStudioMatchName` | Value | `packages/fluxiq/src/programs/automation-studio/nodes/name-match/match-name.ts` | - |
| `automationStudioMatchWrittenParameterName` | Value | `packages/fluxiq/src/programs/automation-studio/runtime/flow-bootstrap/plan/name-correction.ts` | - |
| `AutomationStudioMemoryRepository` | Class | `packages/fluxiq/src/programs/automation-studio/storage/memory-repository.ts` | - |
| `AutomationStudioMemoryRepositoryOptions` | Type | `packages/fluxiq/src/programs/automation-studio/storage/memory-repository.ts` | - |
| `AutomationStudioMemoryUiCacheStore` | Class | `packages/fluxiq/src/programs/automation-studio/storage/project/ui-cache-store.ts` | - |
| `automationStudioMetadataWithFlowVersions` | Value | `packages/fluxiq/src/programs/automation-studio/runtime/flow-version/flow-versions-metadata.ts` | - |
| `automationStudioMigrationChecksum` | Value | `packages/fluxiq/src/programs/automation-studio/storage/schema-migrations.ts` | - |
| `AutomationStudioMigrationJob` | Type | `packages/fluxiq/src/programs/automation-studio/storage/project/administration.ts` | - |
| `AutomationStudioMigrationJobRepository` | Class | `packages/fluxiq/src/programs/automation-studio/storage/project/administration.ts` | - |
| `AutomationStudioMigrationJobStatus` | Type | `packages/fluxiq/src/programs/automation-studio/storage/project/administration.ts` | - |
| `AutomationStudioMigrationManifestKind` | Type | `packages/fluxiq/src/programs/automation-studio/storage/project/migration-cutover.ts` | - |
| `AutomationStudioMigrationManifestRecord` | Type | `packages/fluxiq/src/programs/automation-studio/storage/project/migration-cutover.ts` | - |
| `AutomationStudioMigrationVerificationReport` | Type | `packages/fluxiq/src/programs/automation-studio/storage/project/migration-cutover.ts` | - |
| `automationStudioMutationDigest` | Value | `packages/fluxiq/src/programs/automation-studio/storage/project/unit-of-work.ts` | - |
| `AutomationStudioMutationRecord` | Type | `packages/fluxiq/src/programs/automation-studio/storage/project/unit-of-work.ts` | - |
| `AutomationStudioMutationRecordStatus` | Type | `packages/fluxiq/src/programs/automation-studio/storage/project/unit-of-work.ts` | - |
| `AutomationStudioMutationTouchedEntity` | Type | `packages/fluxiq/src/programs/automation-studio/storage/project/unit-of-work.ts` | - |
| `AutomationStudioNameCandidate` | Type | `packages/fluxiq/src/programs/automation-studio/nodes/name-match/candidate.ts` | One name a written name may be resolved to: a node id, a parameter id, an output id. `accepts` is optional because a caller often knows the names without knowing what each one takes, and a caller that does know gets a better answer for the same call. `accepts` admits an explicit `undefined` so a caller can pass a shape it derived and may not have found, without building the object two ways. |
| `AutomationStudioNamedCandidate` | Type | `packages/fluxiq/src/programs/automation-studio/runtime/conversations/instructions/closest.ts` | A name to match against, and the other ways it is known: a title, phrases, a Flow's own name. |
| `automationStudioNameEditDistance` | Value | `packages/fluxiq/src/programs/automation-studio/nodes/name-match/edit-distance.ts` | - |
| `AutomationStudioNameMatch` | Type | `packages/fluxiq/src/programs/automation-studio/nodes/name-match/match.ts` | The name a written name resolved to, and how much of that resolution was a guess. A caller reports `how` back to the model and to the run record, so a corrected name is visible rather than silently substituted. |
| `automationStudioNameSimilarity` | Value | `packages/fluxiq/src/programs/automation-studio/nodes/name-match/similarity.ts` | - |
| `automationStudioNameSynonymCredit` | Value | `packages/fluxiq/src/programs/automation-studio/nodes/name-match/synonyms.ts` | - |
| `automationStudioNameTokenCredit` | Value | `packages/fluxiq/src/programs/automation-studio/nodes/name-match/token-credit.ts` | - |
| `automationStudioNameTokenOverlap` | Value | `packages/fluxiq/src/programs/automation-studio/nodes/name-match/token-overlap.ts` | - |
| `AutomationStudioNameTokenOverlapResult` | Type | `packages/fluxiq/src/programs/automation-studio/nodes/name-match/token-overlap.ts` | How much two normalised names share as tokens, from two angles. |
| `AutomationStudioNameValueShape` | Type | `packages/fluxiq/src/programs/automation-studio/nodes/name-match/value-shape.ts` | What a named thing accepts, at the coarseness a model's guess can be judged against. It is a tie-break signal, not a type system: `unknown` means the caller does not know, and carries no signal either way. |
| `automationStudioNameWords` | Value | `packages/fluxiq/src/programs/automation-studio/runtime/conversations/instructions/closest.ts` | - |
| `AutomationStudioNativeExecution` | Type | `packages/fluxiq/src/programs/automation-studio/runtime/native-node-runtime.ts` | What one native execution answered. `declaredOutputs` is the bound definition's output ports, given beside a result the implementation produced: the executor checks a route its dispatch answers against them (`executor/node-execution.ts`), and an importer definition lives only here, never in the builtin library the executor otherwise reads. |
| `AutomationStudioNativeLogEntry` | Type | `packages/fluxiq/src/programs/automation-studio/nodes/importer-sdk.ts` | - |
| `AutomationStudioNativeNodeContext` | Type | `packages/fluxiq/src/programs/automation-studio/nodes/importer-sdk.ts` | - |
| `AutomationStudioNativeNodeImplementation` | Type | `packages/fluxiq/src/programs/automation-studio/nodes/importer-sdk.ts` | - |
| `AutomationStudioNativeNodeRuntime` | Class | `packages/fluxiq/src/programs/automation-studio/runtime/native-node-runtime.ts` | Explicit trusted-local implementation binder. This is an authorization and tracing boundary, not a security sandbox or containment mechanism. |
| `AutomationStudioNativeRuntimeGrants` | Type | `packages/fluxiq/src/programs/automation-studio/runtime/native-node-runtime.ts` | - |
| `automationStudioNextResultCheckOrdinal` | Value | `packages/fluxiq/src/programs/automation-studio/runtime/result-check-schedule/ordinals.ts` | - |
| `automationStudioNodeActLasts` | Value | `packages/fluxiq/src/programs/automation-studio/runtime/executor/defensive/lasting-act.ts` | - |
| `automationStudioNodeAdaptationIds` | Value | `packages/fluxiq/src/programs/automation-studio/runtime/flow-change/node-adaptation/ids.ts` | - |
| `AutomationStudioNodeAttemptTrace` | Type | `packages/fluxiq/src/programs/automation-studio/runtime/executor/contracts.ts` | - |
| `AutomationStudioNodeAvailability` | Type | `packages/fluxiq/src/programs/automation-studio/nodes/definitions.ts` | - |
| `AutomationStudioNodeCapabilities` | Type | `packages/fluxiq/src/programs/automation-studio/nodes/definitions.ts` | - |
| `AutomationStudioNodeDefinition` | Type | `packages/fluxiq/src/programs/automation-studio/nodes/definitions.ts` | Canonical node contract used by new Flow authoring surfaces. Existing AutomationNodeDefinition remains the executable built-in contract until the runtime adopts this registry in a later slice. |
| `AutomationStudioNodeDefinitionMatch` | Type | `packages/fluxiq/src/programs/automation-studio/nodes/canonical-registry.ts` | A definition a written node id resolved to, with how much of it was a guess. |
| `AutomationStudioNodeEditorHints` | Type | `packages/fluxiq/src/programs/automation-studio/nodes/definitions.ts` | - |
| `automationStudioNodeMutates` | Value | `packages/fluxiq/src/programs/automation-studio/runtime/executor/defensive/node-side-effect.ts` | - |
| `AutomationStudioNodeOutputActionContract` | Type | `packages/fluxiq/src/programs/automation-studio/nodes/definitions.ts` | - |
| `AutomationStudioNodeParameterContract` | Type | `packages/fluxiq/src/programs/automation-studio/nodes/definitions.ts` | A domain's check of one parameter value on a node it registered, bound with `AutomationStudioNodeRegistry.bindParameterContract`. Flow Bootstrap calls it while it validates a generated plan, so a structured value the domain would refuse at dispatch is refused before the plan is accepted. - It is called only for a literal value that already has the parameter's declared type. A value that is itself a state binding is not checked; a value holding a nested binding is passed as it is, `{ $state: { path } }` included, and a contract that does not accept one there refuses it. - `value` is a copy: changing it changes nothing. - It must be synchronous, and return stable issue codes, empty when the value is acceptable. A code is lower-case and dot-separated, at most 120 characters, never starts with `bootstrap.`, and never carries the value. Any other code is reported as `bootstrap.parameter_contract_violation`, and at most 8 codes are kept for one value. A throw, or an answer that is not an array, is reported as `bootstrap.parameter_contract_failed`. |
| `automationStudioNodeReadinessState` | Value | `packages/fluxiq/src/programs/automation-studio/runtime/executor/recorded-state.ts` | - |
| `AutomationStudioNodeRegistry` | Class | `packages/fluxiq/src/programs/automation-studio/nodes/canonical-registry.ts` | Scope-aware definition registry for new Flow authoring paths. This registry intentionally registers declarative importer manifests only. Loading importer code and binding execution adapters remains a later runtime concern, so an editor cannot acquire arbitrary host code by browsing nodes. The one piece of host code it holds is a parameter contract: a check the host that registered a node binds to it explicitly, which plan validation calls and nothing executes. It is kept beside the definitions rather than on them, so a definition stays plain data. |
| `AutomationStudioNodeRegistryResolution` | Type | `packages/fluxiq/src/programs/automation-studio/nodes/definitions.ts` | - |
| `automationStudioNodeRepeatCannotAct` | Value | `packages/fluxiq/src/programs/automation-studio/runtime/executor/defensive/node-side-effect.ts` | - |
| `automationStudioNodeRepeatIsSafe` | Value | `packages/fluxiq/src/programs/automation-studio/runtime/executor/defensive/node-side-effect.ts` | - |
| `AutomationStudioNodeReplayKind` | Type | `packages/fluxiq/src/programs/automation-studio/runtime/llm/node-tools/replay.ts` | - |
| `AutomationStudioNodeReplayPass` | Type | `packages/fluxiq/src/programs/automation-studio/runtime/llm/node-tools/replay.ts` | One pass of a test over a repeat: the row the pass is on, and the step's parameters with their bindings resolved for it. Either may be absent. |
| `automationStudioNodeReplayResetCall` | Value | `packages/fluxiq/src/programs/automation-studio/runtime/llm/node-tools/replay.ts` | - |
| `automationStudioNodeReplayStatus` | Value | `packages/fluxiq/src/programs/automation-studio/runtime/llm/node-tools/replay.ts` | - |
| `automationStudioNodeReplayStepCall` | Value | `packages/fluxiq/src/programs/automation-studio/runtime/llm/node-tools/replay.ts` | - |
| `automationStudioNodeReplayToolId` | Value | `packages/fluxiq/src/programs/automation-studio/runtime/llm/node-tools/replay.ts` | - |
| `automationStudioNodeReplayVerifyCall` | Value | `packages/fluxiq/src/programs/automation-studio/runtime/llm/node-tools/replay.ts` | - |
| `automationStudioNodeRerunAnswer` | Value | `packages/fluxiq/src/programs/automation-studio/runtime/llm/node-tools/rerun-check.ts` | - |
| `AutomationStudioNodeRerunDoneAgain` | Type | `packages/fluxiq/src/programs/automation-studio/runtime/llm/node-tools/step-place.ts` | One step done again after the reset and before the rerun: which step, under which call, and the word its outcome reads under. |
| `automationStudioNodeRerunFromItsPlace` | Value | `packages/fluxiq/src/programs/automation-studio/runtime/llm/node-tools/step-place.ts` | - |
| `AutomationStudioNodeRerunNamed` | Type | `packages/fluxiq/src/programs/automation-studio/runtime/llm/node-tools/step-place.ts` | The step a rerun replaces, for the note on a refused rerun: its position, and what its new argument named in the domain's words, asked before the page was put back (`../../flow-draft/step-words.ts`). |
| `AutomationStudioNodeRerunPlace` | Type | `packages/fluxiq/src/programs/automation-studio/runtime/llm/node-tools/step-place.ts` | Where a rerun runs: as the target stands, after it was put back, or nowhere. `in_place` says why: the target was `already_there`, or no start page was known (`start_page_unknown`) and it ran wherever the last call left it. `put_back` says whose start page it went back to: the `step`'s own, or the one its node started on in the run the draft was seeded from (`seeded_run`); `doneAgain` is the steps done again after the reset, in order, empty when none before it started on its place. |
| `automationStudioNodeRerunPlaceNoted` | Value | `packages/fluxiq/src/programs/automation-studio/runtime/llm/node-tools/step-place.ts` | - |
| `AutomationStudioNodeRetryOutcome` | Type | `packages/fluxiq/src/programs/automation-studio/runtime/executor/outside-graph/retries.ts` | The node run with its retries, and the account of what the retries absorbed. |
| `automationStudioNodeRetryPolicy` | Value | `packages/fluxiq/src/programs/automation-studio/runtime/executor/retry-policy.ts` | - |
| `AutomationStudioNodeRetryPolicy` | Type | `packages/fluxiq/src/programs/automation-studio/runtime/executor/retry-policy.ts` | How many times one node may be attempted, and how long the run waits between those attempts. `maxAttempts` counts the first attempt, so the default of four means one attempt and three retries. `backoffMs` is read by attempt number: the wait before attempt two is `backoffMs[0]`, before attempt three `backoffMs[1]`, and a policy with fewer entries than attempts repeats its last one. |
| `AutomationStudioNodeRetryReading` | Type | `packages/fluxiq/src/programs/automation-studio/runtime/executor/outside-graph/retries.ts` | What one attempt answered: success, or a failure with the producer's record when it gave one. |
| `AutomationStudioNodeRuntimeRequirements` | Type | `packages/fluxiq/src/programs/automation-studio/nodes/definitions.ts` | - |
| `AutomationStudioNodeSafety` | Type | `packages/fluxiq/src/programs/automation-studio/nodes/definitions.ts` | - |
| `automationStudioNodeSideEffectClass` | Value | `packages/fluxiq/src/programs/automation-studio/runtime/executor/defensive/node-side-effect.ts` | - |
| `AutomationStudioNodeSideEffectClass` | Type | `packages/fluxiq/src/programs/automation-studio/runtime/executor/defensive/contracts.ts` | How consequential a node is, which decides whether an ambiguous fault may be attempted again and whether a Flow may walk past the node's failure. `none` and `internal` change nothing outside the run. `external` and `destructive` act on the world, so a second attempt is a second act unless the node says it is safe to repeat. |
| `AutomationStudioNodeSource` | Type | `packages/fluxiq/src/programs/automation-studio/nodes/definitions.ts` | - |
| `AutomationStudioNoRepairReason` | Type | `packages/fluxiq/src/programs/automation-studio/runtime/llm/harness/structured-response.ts` | - |
| `automationStudioObjectApiPath` | Value | `packages/fluxiq/src/programs/automation-studio/storage/object-store.ts` | - |
| `AutomationStudioObjectAsset` | Type | `packages/fluxiq/src/programs/automation-studio/storage/object-store.ts` | - |
| `automationStudioObjectContentRef` | Value | `packages/fluxiq/src/programs/automation-studio/storage/object-store.ts` | - |
| `AutomationStudioObjectCursorPage` | Type | `packages/fluxiq/src/programs/automation-studio/storage/project/object-repository.ts` | - |
| `AutomationStudioObjectIndex` | Type | `packages/fluxiq/src/programs/automation-studio/storage/file-store.ts` | - |
| `AutomationStudioObjectOwner` | Type | `packages/fluxiq/src/programs/automation-studio/storage/file-store.ts` | - |
| `AutomationStudioObjectReference` | Type | `packages/fluxiq/src/programs/automation-studio/storage/object-store.ts` | - |
| `AutomationStudioObjectStore` | Class | `packages/fluxiq/src/programs/automation-studio/storage/object-store.ts` | - |
| `AutomationStudioObjectSummary` | Type | `packages/fluxiq/src/programs/automation-studio/storage/file-store.ts` | - |
| `AutomationStudioObjectWriteOptions` | Type | `packages/fluxiq/src/programs/automation-studio/storage/object-store.ts` | - |
| `AutomationStudioObservation` | Type | `packages/fluxiq/src/programs/automation-studio/runtime/adapters.ts` | - |
| `AutomationStudioPackReusableLlmContextsRequest` | Type | `packages/fluxiq/src/programs/automation-studio/api/contracts/llm.ts` | - |
| `AutomationStudioPageCursor` | Type | `packages/fluxiq/src/programs/automation-studio/storage/paging.ts` | - |
| `automationStudioPageLimit` | Value | `packages/fluxiq/src/programs/automation-studio/storage/paging.ts` | - |
| `AutomationStudioPanel` | Type | `packages/fluxiq/src/programs/automation-studio/ui/contracts.ts` | - |
| `AutomationStudioPanelCapability` | Type | `packages/fluxiq/src/programs/automation-studio/runtime/panel-capabilities/capability.ts` | One capability, as the model is shown it. The fields are exactly what the panel's `panelCapabilityVocabulary()` produces, so the browser hands its own list straight across with no translation step to fall out of date. |
| `AutomationStudioPanelCapabilityArgument` | Type | `packages/fluxiq/src/programs/automation-studio/runtime/panel-capabilities/capability.ts` | A value a capability takes, described for whoever has to supply it. |
| `automationStudioPanelCapabilityIds` | Value | `packages/fluxiq/src/programs/automation-studio/runtime/panel-capabilities/vocabulary.ts` | - |
| `automationStudioPanelCapabilityVocabulary` | Value | `packages/fluxiq/src/programs/automation-studio/runtime/panel-capabilities/vocabulary.ts` | - |
| `automationStudioPanelCommandKeyFromSecretKeys` | Value | `packages/fluxiq/src/programs/automation-studio/runtime/llm/deepseek/panel-command-key.ts` | - |
| `AutomationStudioPanelCommandKeyPorts` | Type | `packages/fluxiq/src/programs/automation-studio/runtime/llm/deepseek/panel-command-key.ts` | - |
| `automationStudioPanelInvocationRef` | Value | `packages/fluxiq/src/programs/automation-studio/runtime/conversations/instructions/respond.ts` | - |
| `automationStudioParkedRun` | Value | `packages/fluxiq/src/programs/automation-studio/runtime/parking/parked-run.ts` | - |
| `AutomationStudioParkedRun` | Type | `packages/fluxiq/src/programs/automation-studio/runtime/parking/parked-run.ts` | A run stopped on a question, and everything needed to go on from it. It rides on the trace, which is what the runtime already persists, so a parked run survives wherever its run record survives and needs no store of its own. Resuming reads this beside the trace it sits on and carries on from the node named here -- it never runs the node again, so nothing the run already did happens twice. |
| `AutomationStudioParkedRunCarry` | Type | `packages/fluxiq/src/programs/automation-studio/runtime/parking/parked-run.ts` | What a parked run held that its trace does not already carry. Deliberately not a second copy of the run: `values`, `attempts`, `effects` and the region transitions are on the trace the parked run returned, and duplicating them here would double what is persisted and leave two records to disagree. What is here is what lives only in memory while a run executes -- its variables, its loop positions, and how much of its step budget it has spent -- and would otherwise be lost the moment the run returned. |
| `AutomationStudioParkingPort` | Type | `packages/fluxiq/src/programs/automation-studio/runtime/parking/port.ts` | Where an ask goes, and -- when the host can hold a run in place -- where its answer comes back from. The executor raises asks; it does not know what a conversation is. Binding a port is what turns "this run has a question" into a person being asked. A run with no port bound still parks and is still resumable: the port decides whether anybody hears about it, not whether the run can go on. |
| `AutomationStudioParkRefusalReason` | Type | `packages/fluxiq/src/programs/automation-studio/runtime/parking/settlement.ts` | Why an answer did not move a parked run on. |
| `AutomationStudioPermissionAsk` | Type | `packages/fluxiq/src/programs/automation-studio/runtime/parking/permission-ask.ts` | Where a permission question goes, and where its answer comes back from. |
| `automationStudioPermissionAskOutcome` | Value | `packages/fluxiq/src/programs/automation-studio/runtime/parking/permission-ask.ts` | - |
| `AutomationStudioPermissionAskOutcome` | Type | `packages/fluxiq/src/programs/automation-studio/runtime/parking/permission-ask.ts` | How one permission question came back. `granted` and `declined` are a person's own answer, `grant` and `deny` in the thread. `unanswered` is everything else: nobody answered before the wait ran out, the caller did not wait, the wait was cancelled, or the thread could not be written to or read. The difference matters to a caller that keeps going after a refusal. A person who said no to one control is still there to be asked about another; a person who never answered is not, and asking them again only costs another wait (t195-w18). |
| `automationStudioPermissionAskWaitMs` | Value | `packages/fluxiq/src/programs/automation-studio/runtime/parking/permission-ask.ts` | - |
| `automationStudioPersonNeededAnswerIsDone` | Value | `packages/fluxiq/src/programs/automation-studio/runtime/parking/person-needed-ask.ts` | - |
| `automationStudioPersonNeededAsk` | Value | `packages/fluxiq/src/programs/automation-studio/runtime/parking/person-needed-ask.ts` | - |
| `automationStudioPersonNeededAskDraft` | Value | `packages/fluxiq/src/programs/automation-studio/runtime/parking/person-needed-ask.ts` | - |
| `automationStudioPersonNeededEnding` | Value | `packages/fluxiq/src/programs/automation-studio/runtime/executor/person-needed.ts` | - |
| `AutomationStudioPersonNeededEnding` | Type | `packages/fluxiq/src/programs/automation-studio/runtime/parking/person-needed-tool-calls.ts` | Why work stopped for a person: how the last question came out, or the bound. |
| `automationStudioPersonNeededLookCallId` | Value | `packages/fluxiq/src/programs/automation-studio/runtime/parking/person-needed-tool-calls.ts` | - |
| `AutomationStudioPersonNeededOutcome` | Type | `packages/fluxiq/src/programs/automation-studio/runtime/parking/person-needed-ask.ts` | How one person-needed question came out, for a caller that waited on it. `done` is the only outcome the work goes on from. The others each end it with a person-needed code, and are told apart only so the ending can say which: the person pressed Stop (`stopped`), nobody answered in time (`timed_out`), the question could not be put or waited on at all (`unreachable`), or the caller's own work was cancelled while it waited (`cancelled`). |
| `automationStudioPersonNeededStep` | Value | `packages/fluxiq/src/programs/automation-studio/runtime/executor/person-needed.ts` | - |
| `AutomationStudioPersonNeededStep` | Type | `packages/fluxiq/src/programs/automation-studio/runtime/executor/person-needed.ts` | What the executor does about one failed attempt, as far as a person is concerned. |
| `automationStudioPersonNeededToolCalls` | Value | `packages/fluxiq/src/programs/automation-studio/runtime/parking/person-needed-tool-calls.ts` | - |
| `AutomationStudioPersonNeededToolCalls` | Type | `packages/fluxiq/src/programs/automation-studio/runtime/parking/person-needed-tool-calls.ts` | - |
| `automationStudioPlanDetails` | Value | `packages/fluxiq/src/programs/automation-studio/storage/query-plan.ts` | - |
| `AutomationStudioPlanHandleReach` | Type | `packages/fluxiq/src/programs/automation-studio/runtime/llm/harness-options/binding.ts` | Which views a plan node's handles may resolve from (`resolvePlanNodeParameters`, `handleReach`). |
| `AutomationStudioPlanHandleView` | Type | `packages/fluxiq/src/programs/automation-studio/runtime/llm/harness-options/binding.ts` | The view one handle of a resolved node came from, as the domain numbers its captures (from 1, in the order exploration took them), and the location that view reported. A record of where a candidate's target was learned, never authority to act. |
| `AutomationStudioPlanNodeHandleSite` | Type | `packages/fluxiq/src/programs/automation-studio/runtime/llm/harness-options/plan-node-handles.ts` | Where a handle is named inside a node's parameters, and which one. |
| `automationStudioPlanNodeHandleSites` | Value | `packages/fluxiq/src/programs/automation-studio/runtime/llm/harness-options/plan-node-handles.ts` | - |
| `automationStudioPlanNodeParametersNameHandle` | Value | `packages/fluxiq/src/programs/automation-studio/runtime/llm/harness-options/plan-node-handles.ts` | - |
| `automationStudioPlanStepConsequences` | Value | `packages/fluxiq/src/programs/automation-studio/runtime/llm/harness-options/plan-step-consequences.ts` | - |
| `AutomationStudioPlanStepConsequences` | Type | `packages/fluxiq/src/programs/automation-studio/runtime/llm/harness-options/plan-step-consequences.ts` | A step's declaration, read out of its parameters. - `declared` absent: the step said nothing. The domain decides whether a step of its kind may leave it unsaid. - `declared` empty: the step said, in so many words, that it causes nothing lasting. Nothing is asked of anybody. - `malformed`: something was written and Core could not read it as its own classes. The step is refused. |
| `AutomationStudioProblem` | Type | `packages/fluxiq/src/programs/automation-studio/api/contracts/project.ts` | - |
| `AutomationStudioProblemPage` | Type | `packages/fluxiq/src/programs/automation-studio/runtime/service/problems/contracts.ts` | - |
| `AutomationStudioProject` | Type | `packages/fluxiq/src/programs/automation-studio/api/contracts/project.ts` | - |
| `AutomationStudioProjectAcceptedStateStore` | Class | `packages/fluxiq/src/programs/automation-studio/storage/project/accepted-state/store.ts` | Internal staged foundation. No reader, adoption, ordinary writer or promoter uses this store. |
| `AutomationStudioProjectAdaptationStore` | Class | `packages/fluxiq/src/programs/automation-studio/storage/project/adaptation-store.ts` | - |
| `AutomationStudioProjectAdministration` | Class | `packages/fluxiq/src/programs/automation-studio/storage/project/administration.ts` | - |
| `AutomationStudioProjectArtifactKind` | Type | `packages/fluxiq/src/programs/automation-studio/model/artifacts.ts` | `task`, `routine`, and owner-bound `flow` are legacy compatibility kinds. New executable work uses canonical Flow APIs. |
| `AutomationStudioProjectArtifacts` | Type | `packages/fluxiq/src/programs/automation-studio/model/artifacts.ts` | - |
| `AutomationStudioProjectAuthorityGuardStore` | Class | `packages/fluxiq/src/programs/automation-studio/storage/project/authority-guard/store.ts` | Coordination infrastructure; opening creates/migrates SQL, not project authority. |
| `AutomationStudioProjectCatalogRepository` | Class | `packages/fluxiq/src/programs/automation-studio/storage/catalog.ts` | - |
| `AutomationStudioProjectCategory` | Type | `packages/fluxiq/src/programs/automation-studio/api/contracts/project.ts` | - |
| `AutomationStudioProjectChangeFeedEvent` | Type | `packages/fluxiq/src/programs/automation-studio/api/contracts/change-feed.ts` | - |
| `AutomationStudioProjectChangeFeedPage` | Type | `packages/fluxiq/src/programs/automation-studio/api/contracts/change-feed.ts` | - |
| `AutomationStudioProjectChangeFeedRequest` | Type | `packages/fluxiq/src/programs/automation-studio/api/contracts/change-feed.ts` | - |
| `AutomationStudioProjectCommandLedgerStore` | Class | `packages/fluxiq/src/programs/automation-studio/storage/project/command-ledger/store.ts` | Receipt-only project storage; closed run admission is not wired to Flow execution. |
| `AutomationStudioProjectCompiledPlanStore` | Class | `packages/fluxiq/src/programs/automation-studio/storage/project/compiled-plan-store.ts` | - |
| `AutomationStudioProjectContentAsset` | Type | `packages/fluxiq/src/programs/automation-studio/storage/project/content-store.ts` | - |
| `AutomationStudioProjectContentProtection` | Interface | `packages/fluxiq/src/programs/automation-studio/storage/project/content-protection.ts` | Generic project-content protection boundary. Implementations must authenticate project and media-type context. |
| `AutomationStudioProjectContentProtectionKey` | Type | `packages/fluxiq/src/programs/automation-studio/storage/project/content-protection.ts` | - |
| `AutomationStudioProjectContentProtectionKeyResolver` | Type | `packages/fluxiq/src/programs/automation-studio/storage/project/content-protection.ts` | - |
| `AutomationStudioProjectContentStore` | Class | `packages/fluxiq/src/programs/automation-studio/storage/project/content-store.ts` | - |
| `AutomationStudioProjectContentWrite` | Type | `packages/fluxiq/src/programs/automation-studio/storage/project/content-store.ts` | - |
| `AutomationStudioProjectConversationStore` | Class | `packages/fluxiq/src/programs/automation-studio/runtime/conversations/store.ts` | - |
| `automationStudioProjectCustomNodeRoot` | Object | `packages/fluxiq/src/programs/automation-studio/nodes/layout.ts` | - |
| `AutomationStudioProjectDatabase` | Class | `packages/fluxiq/src/programs/automation-studio/storage/project/database.ts` | - |
| `AutomationStudioProjectDatabaseLease` | Type | `packages/fluxiq/src/programs/automation-studio/storage/project/database.ts` | - |
| `AutomationStudioProjectDatabasePool` | Class | `packages/fluxiq/src/programs/automation-studio/storage/project/database.ts` | One open connection per project, shared by every lease on it. With `idleCloseMs` 0 the connection closes on its last release. With a grace period it stays open that long, and a lease taken in the meantime reuses it. A service runs its operations back to back, each releasing before the next acquires, so closing on every release reopened the database once per operation: measured 2026-10-02 (t246), 18 opens for the four calls that install a Flow's primary router and 25-37 per runtime-run test case, each paying an open that creates the WAL and runs its pragmas, the full migration check of every store set (the ready memo is per connection), and a close that checkpoints the WAL to disk and deletes it. Nothing stays open once the project has been idle for the grace period; `closeAll` and `closeIdleProject` close at once, so a caller about to remove a project's files does not wait for it. Every close the pool starts is tracked until it finishes. `closeAll` and `closeIdleProject` wait for those already in flight, an idle close the timer started among them, so neither returns while a connection still holds the files; and a project is not opened again until its previous connection has closed, so one project never has two connections. |
| `AutomationStudioProjectDatabasePoolOptions` | Type | `packages/fluxiq/src/programs/automation-studio/storage/project/database.ts` | - |
| `AutomationStudioProjectEventChunkStore` | Class | `packages/fluxiq/src/programs/automation-studio/storage/project/event-chunk-store.ts` | - |
| `AutomationStudioProjectEventStreamStore` | Class | `packages/fluxiq/src/programs/automation-studio/storage/project/event-stream-writer.ts` | - |
| `AutomationStudioProjectFlowGraphJudgementStore` | Class | `packages/fluxiq/src/programs/automation-studio/storage/project/graph-judgement-store.ts` | - |
| `AutomationStudioProjectFlowResourceMutations` | Class | `packages/fluxiq/src/programs/automation-studio/storage/project/flow-resource-mutations.ts` | - |
| `AutomationStudioProjectFlowResourceRepository` | Class | `packages/fluxiq/src/programs/automation-studio/storage/project/flow-resource-repository.ts` | - |
| `AutomationStudioProjectFlowRunActionPage` | Type | `packages/fluxiq/src/programs/automation-studio/storage/project/runtime-stream-store.ts` | - |
| `AutomationStudioProjectGraphRepository` | Class | `packages/fluxiq/src/programs/automation-studio/storage/project/graph-store.ts` | - |
| `AutomationStudioProjectHierarchy` | Type | `packages/fluxiq/src/programs/automation-studio/api/contracts/hierarchy.ts` | - |
| `AutomationStudioProjectHierarchyFeed` | Class | `packages/fluxiq/src/programs/automation-studio/storage/project/hierarchy/feed.ts` | - |
| `AutomationStudioProjectHierarchyMutations` | Class | `packages/fluxiq/src/programs/automation-studio/storage/project/hierarchy/mutations.ts` | - |
| `AutomationStudioProjectHierarchyRepository` | Class | `packages/fluxiq/src/programs/automation-studio/storage/project/hierarchy/repository.ts` | - |
| `AutomationStudioProjectMeta` | Type | `packages/fluxiq/src/programs/automation-studio/storage/project/administration.ts` | - |
| `AutomationStudioProjectMetaRepository` | Class | `packages/fluxiq/src/programs/automation-studio/storage/project/administration.ts` | - |
| `AutomationStudioProjectMigrationCutoverStore` | Class | `packages/fluxiq/src/programs/automation-studio/storage/project/migration-cutover.ts` | - |
| `AutomationStudioProjectMutationContext` | Type | `packages/fluxiq/src/programs/automation-studio/storage/project/unit-of-work.ts` | - |
| `AutomationStudioProjectObjectRecord` | Type | `packages/fluxiq/src/programs/automation-studio/storage/project/object-repository.ts` | - |
| `AutomationStudioProjectObjectReferenceRecord` | Type | `packages/fluxiq/src/programs/automation-studio/storage/project/object-repository.ts` | - |
| `AutomationStudioProjectObjectRepository` | Class | `packages/fluxiq/src/programs/automation-studio/storage/project/object-repository.ts` | - |
| `AutomationStudioProjectRetentionStore` | Class | `packages/fluxiq/src/programs/automation-studio/storage/project/retention-store.ts` | - |
| `AutomationStudioProjectReusableLlmContextStore` | Class | `packages/fluxiq/src/programs/automation-studio/storage/project/reusable-llm-context-store.ts` | Project-isolated durable storage for domain-sanitized, prompt-safe reusable LLM context. Disabled unless explicitly enabled. |
| `AutomationStudioProjectRunDatasetStore` | Class | `packages/fluxiq/src/programs/automation-studio/storage/project/run-dataset-store.ts` | The rows runs capture per dataset, stored raw in `project.sqlite` (CD16) and kept as long as the project unless deleted (CD17), with the project catalog of tables per Flow (CD21) and typed audit events (CD20). |
| `AutomationStudioProjectRuntimeRunSummaryPage` | Type | `packages/fluxiq/src/programs/automation-studio/storage/project/runtime-stream-store.ts` | - |
| `AutomationStudioProjectRuntimeStreamStore` | Class | `packages/fluxiq/src/programs/automation-studio/storage/project/runtime-stream-store.ts` | - |
| `AutomationStudioProjectStoreUnavailableError` | Class | `packages/fluxiq/src/programs/automation-studio/storage/project/store-unavailable-error.ts` | The project store cannot be reached at all: its database pool is closing, so every acquire is refused (`./database.ts`). Its message is what the pool always said; the type and `code` exist so a caller can tell "the store is gone" from a store that answered with an error. A run reads it at its end (t258): a run whose store went away records what it still can -- its session lives outside the store -- and ends failed with its own reason, rather than throwing the store's absence at its caller. |
| `AutomationStudioProjectSummary` | Type | `packages/fluxiq/src/programs/automation-studio/storage/file-store.ts` | - |
| `AutomationStudioProjectUiCacheEntry` | Type | `packages/fluxiq/src/programs/automation-studio/api/contracts/ui-cache.ts` | - |
| `AutomationStudioProjectUiCachePutEntry` | Type | `packages/fluxiq/src/programs/automation-studio/api/contracts/ui-cache.ts` | - |
| `AutomationStudioProjectUiCacheStats` | Type | `packages/fluxiq/src/programs/automation-studio/api/contracts/ui-cache.ts` | - |
| `AutomationStudioProjectUnitOfWork` | Class | `packages/fluxiq/src/programs/automation-studio/storage/project/unit-of-work.ts` | - |
| `AutomationStudioProposalApprovalGateDecision` | Type | `packages/fluxiq/src/programs/automation-studio/runtime/training-modes.ts` | - |
| `AutomationStudioProposalApprovalGateInput` | Type | `packages/fluxiq/src/programs/automation-studio/runtime/training-modes.ts` | - |
| `AutomationStudioProposalSummary` | Type | `packages/fluxiq/src/programs/automation-studio/storage/file-store.ts` | - |
| `AutomationStudioProposalSummaryIndex` | Type | `packages/fluxiq/src/programs/automation-studio/storage/file-store.ts` | - |
| `AutomationStudioProtectedProjectContent` | Type | `packages/fluxiq/src/programs/automation-studio/storage/project/content-protection.ts` | - |
| `AutomationStudioPublishedFlowSnapshot` | Type | `packages/fluxiq/src/programs/automation-studio/model/composites.ts` | - |
| `AutomationStudioPurgeExpiredReusableLlmContextsRequest` | Type | `packages/fluxiq/src/programs/automation-studio/api/contracts/llm.ts` | - |
| `AutomationStudioPutReusableLlmContextRequest` | Type | `packages/fluxiq/src/programs/automation-studio/api/contracts/llm.ts` | - |
| `AutomationStudioQueryPlanRow` | Type | `packages/fluxiq/src/programs/automation-studio/storage/query-plan.ts` | - |
| `AutomationStudioReadActionDeclaration` | Type | `packages/fluxiq/src/programs/automation-studio/runtime/action-permissions/declaration.ts` | A declaration after Core has read it: consequences deduplicated, text trimmed. |
| `automationStudioReadinessCeilingMs` | Value | `packages/fluxiq/src/programs/automation-studio/runtime/executor/recorded-state.ts` | - |
| `AutomationStudioReadinessOutcome` | Type | `packages/fluxiq/src/programs/automation-studio/runtime/executor/ladder-run.ts` | What a readiness wait observed, or nothing when the node names no state to wait for. |
| `automationStudioReauthorBrief` | Value | `packages/fluxiq/src/programs/automation-studio/runtime/recovery/refuted-result/brief.ts` | - |
| `automationStudioReauthorEndingWatch` | Value | `packages/fluxiq/src/programs/automation-studio/runtime/recovery/refuted-result/nothing-to-change.ts` | - |
| `AutomationStudioReauthorEndingWatch` | Type | `packages/fluxiq/src/programs/automation-studio/runtime/recovery/refuted-result/nothing-to-change.ts` | One re-author build's watch for the ending. |
| `AutomationStudioReauthorNothingToChange` | Type | `packages/fluxiq/src/programs/automation-studio/runtime/recovery/refuted-result/nothing-to-change.ts` | What the re-author said: its reason, screened, and whether anything of it was withheld. |
| `automationStudioReauthorRefutedResult` | Value | `packages/fluxiq/src/programs/automation-studio/runtime/recovery/refuted-result/reauthor.ts` | - |
| `AutomationStudioRecordBatch` | Type | `packages/fluxiq/src/programs/automation-studio/runtime/executor/contracts.ts` | The rows one record output captured from one successful dispatch, handed to `onRecordBatch`. `rows` is the array the node's `records` output holds and the one put back at `recordsPath` inside its `result`: validated by allowlist copy, so it holds `include` fields only, in schema order. |
| `automationStudioRecordedResultRepair` | Value | `packages/fluxiq/src/programs/automation-studio/runtime/result-verification/repair-directive.ts` | - |
| `automationStudioRecordedState` | Value | `packages/fluxiq/src/programs/automation-studio/runtime/executor/recorded-state.ts` | - |
| `AutomationStudioRecordedState` | Type | `packages/fluxiq/src/programs/automation-studio/runtime/executor/recorded-state.ts` | What a recorded node knows about the state it was taken in. Every node a recording proposal produces carries `stateLink`, `stateSnapshotId`, `stateRef` and `screenshotRef` in its metadata, written by `recordingCandidateStateLinkMetadata`. Until now no execution path read any of them: the recorded state was captured, stored, indexed -- and never consulted while the Flow ran. This is the reader. |
| `AutomationStudioRecorder` | Type | `packages/fluxiq/src/programs/automation-studio/runtime/contracts.ts` | - |
| `AutomationStudioRecordField` | Type | `packages/contracts/src/record-sets/schema.ts` | - |
| `AutomationStudioRecordFieldHandling` | Type | `packages/contracts/src/record-sets/schema.ts` | - |
| `AutomationStudioRecordingController` | Class | `packages/fluxiq/src/programs/automation-studio/runtime/recording-controller.ts` | - |
| `AutomationStudioRecordingControllerOptions` | Type | `packages/fluxiq/src/programs/automation-studio/runtime/recording-controller.ts` | - |
| `AutomationStudioRecordingMapperCandidate` | Type | `packages/fluxiq/src/programs/automation-studio/nodes/importer-sdk.ts` | - |
| `AutomationStudioRecordingMapperContext` | Type | `packages/fluxiq/src/programs/automation-studio/nodes/importer-sdk.ts` | - |
| `AutomationStudioRecordingMapperDefinition` | Type | `packages/fluxiq/src/programs/automation-studio/nodes/importer-sdk.ts` | - |
| `AutomationStudioRecordingMapperImplementation` | Type | `packages/fluxiq/src/programs/automation-studio/nodes/importer-sdk.ts` | - |
| `AutomationStudioRecordingMapperObservation` | Type | `packages/fluxiq/src/programs/automation-studio/nodes/importer-sdk.ts` | - |
| `AutomationStudioRecordingMapperResult` | Type | `packages/fluxiq/src/programs/automation-studio/nodes/importer-sdk.ts` | - |
| `AutomationStudioRecordingSummary` | Type | `packages/fluxiq/src/programs/automation-studio/storage/file-store.ts` | - |
| `AutomationStudioRecordingSummaryIndex` | Type | `packages/fluxiq/src/programs/automation-studio/storage/file-store.ts` | - |
| `AutomationStudioRecordingSummaryPage` | Type | `packages/fluxiq/src/programs/automation-studio/storage/project/runtime-stream-store.ts` | - |
| `AutomationStudioRecordOutput` | Type | `packages/contracts/src/record-sets/output.ts` | Declares that a node's output carries rows to store as a dataset. Validate any value that crossed a process or storage boundary with `parseAutomationStudioRecordOutput`. |
| `AutomationStudioRecordOutputParseResult` | Type | `packages/contracts/src/record-sets/parse-output.ts` | - |
| `AutomationStudioRecordParseOptions` | Type | `packages/contracts/src/record-sets/parse-schema.ts` | - |
| `AutomationStudioRecordSchema` | Type | `packages/contracts/src/record-sets/schema.ts` | The shape of every row in one dataset. Validate any value that crossed a process or storage boundary with `parseAutomationStudioRecordSchema`. |
| `AutomationStudioRecordValidationOptions` | Type | `packages/contracts/src/record-sets/validate-records.ts` | - |
| `AutomationStudioRecordValidationResult` | Type | `packages/contracts/src/record-sets/validate-records.ts` | - |
| `AutomationStudioRecordValueType` | Type | `packages/contracts/src/record-sets/schema.ts` | - |
| `AutomationStudioRecordWriteMode` | Type | `packages/contracts/src/record-sets/output.ts` | - |
| `AutomationStudioRecoveryBudget` | Type | `packages/fluxiq/src/programs/automation-studio/runtime/executor/contracts.ts` | - |
| `AutomationStudioRecoveryCandidate` | Type | `packages/fluxiq/src/programs/automation-studio/runtime/executor/contracts.ts` | - |
| `AutomationStudioRecoveryCandidateKind` | Type | `packages/fluxiq/src/programs/automation-studio/runtime/executor/contracts.ts` | The rungs of the recovery ladder, cheapest first, with the model last. The four in `AUTOMATION_STUDIO_LADDER_RUNG_KINDS` are the deterministic ones the executor runs itself. Each is **consumed** once it has run and is not offered again for the same arrival at the node, because any non-`llm_diagnosis` candidate still on offer tells `classifyAutomationStudioAdaptiveFailure` that a deterministic answer exists and permanently suppresses escalation to the model. |
| `AutomationStudioRecoveryContextOmission` | Type | `packages/fluxiq/src/programs/automation-studio/runtime/recovery/context.ts` | - |
| `AutomationStudioRecoveryContextOmissionReason` | Type | `packages/fluxiq/src/programs/automation-studio/runtime/recovery/context.ts` | Why a section is not in the context. `absent` means the run never produced it -- no state diff was captured, the failure was not inside a subflow, no adaptation matched. `withheld` means it existed and carried a secret-shaped value or a raw-payload key, so Core refused to carry it. There is no size reason: no section is dropped to fit. Two reasons rather than one flag, because collapsing them makes a context that lost its evidence indistinguishable from one that never had any -- which is the failure this whole record exists to prevent. In particular a refusal must never read as an absence: "the host captured no state diff" and "the state diff carried something Core will not pass on" are different problems with different answers. |
| `AutomationStudioRecoveryContextSection` | Type | `packages/fluxiq/src/programs/automation-studio/runtime/recovery/context.ts` | - |
| `AutomationStudioRecoveryContextSummary` | Type | `packages/fluxiq/src/programs/automation-studio/runtime/recovery/context-summary.ts` | - |
| `AutomationStudioRecoveryConversationReader` | Type | `packages/fluxiq/src/programs/automation-studio/runtime/recovery/refuted-result/conversation.ts` | The narrow slice of the conversations collaborator this reads. |
| `automationStudioRecoveryConversationTurns` | Value | `packages/fluxiq/src/programs/automation-studio/runtime/recovery/refuted-result/conversation.ts` | - |
| `AutomationStudioRecoveryDeadline` | Type | `packages/fluxiq/src/programs/automation-studio/runtime/recovery/recovery-deadline.ts` | - |
| `automationStudioRecoveryDeadlineExpired` | Value | `packages/fluxiq/src/programs/automation-studio/runtime/recovery/recovery-deadline.ts` | - |
| `automationStudioRecoveryDeadlineRemainingMs` | Value | `packages/fluxiq/src/programs/automation-studio/runtime/recovery/recovery-deadline.ts` | - |
| `AutomationStudioRecoveryDecision` | Type | `packages/fluxiq/src/programs/automation-studio/runtime/executor/contracts.ts` | - |
| `AutomationStudioRecoveryExplorationInput` | Type | `packages/fluxiq/src/programs/automation-studio/runtime/recovery/annotation/exploration.ts` | - |
| `AutomationStudioRecoveryExplorationResult` | Type | `packages/fluxiq/src/programs/automation-studio/runtime/recovery/annotation/exploration.ts` | - |
| `AutomationStudioRecoveryExploredPacket` | Type | `packages/fluxiq/src/programs/automation-studio/runtime/recovery/annotation/exploration.ts` | One packet an exploration returned, labelled for the runtime patch request. |
| `AutomationStudioRecoveryLookupInput` | Type | `packages/fluxiq/src/programs/automation-studio/runtime/executor/contracts.ts` | - |
| `AutomationStudioRecoveryPatchReserve` | Type | `packages/fluxiq/src/programs/automation-studio/runtime/recovery/annotation/patch-reserve.ts` | - |
| `automationStudioRecoveryPermissionGate` | Value | `packages/fluxiq/src/programs/automation-studio/runtime/recovery/annotation/permissions.ts` | - |
| `AutomationStudioRecoveryPermissions` | Type | `packages/fluxiq/src/programs/automation-studio/runtime/recovery/annotation/permissions.ts` | - |
| `AutomationStudioRecoveryPermissionSummary` | Type | `packages/fluxiq/src/programs/automation-studio/runtime/recovery/annotation/permissions.ts` | The recovery's authority, as classes only: what a run detail records and a reader compares. |
| `AutomationStudioRecoveryReplan` | Type | `packages/fluxiq/src/programs/automation-studio/runtime/recovery/annotation/replan.ts` | What re-planning after a look produced, and whether the look changed anything. |
| `AutomationStudioRecoveryReplanInput` | Type | `packages/fluxiq/src/programs/automation-studio/runtime/recovery/annotation/replan.ts` | - |
| `AutomationStudioRecoveryRunBudget` | Type | `packages/fluxiq/src/programs/automation-studio/runtime/recovery/annotation/run-budget.ts` | - |
| `AutomationStudioRecoveryRunBudgetInput` | Type | `packages/fluxiq/src/programs/automation-studio/runtime/recovery/annotation/run-budget.ts` | - |
| `AutomationStudioRecoveryTrace` | Type | `packages/fluxiq/src/programs/automation-studio/runtime/recovery/trace.ts` | - |
| `AutomationStudioRecoveryTraceEvent` | Type | `packages/fluxiq/src/programs/automation-studio/runtime/recovery/trace.ts` | - |
| `AutomationStudioRecoveryTraceRefusal` | Type | `packages/fluxiq/src/programs/automation-studio/runtime/recovery/trace.ts` | - |
| `AutomationStudioRecoveryTraceStage` | Type | `packages/fluxiq/src/programs/automation-studio/runtime/recovery/trace.ts` | - |
| `AutomationStudioRecoveryTraceStatus` | Type | `packages/fluxiq/src/programs/automation-studio/runtime/recovery/trace.ts` | How a stage ended. `completed` means the stage ran and produced its answer, not that the answer was good news. `skipped` means it did not need to run; `refused` means something declined to let it; `failed` means it ran and did not produce an answer. |
| `automationStudioRefutedResultAttempt` | Value | `packages/fluxiq/src/programs/automation-studio/runtime/recovery/refuted-result/attempt.ts` | - |
| `AutomationStudioRefutedResultAttempt` | Type | `packages/fluxiq/src/programs/automation-studio/runtime/recovery/refuted-result/attempt.ts` | The failure entry point's two shapes of the same attempt: the live trace the ladder classifies and patches from, and the run record the recovery context and the request's recent actions are read out of. |
| `AutomationStudioRefutedResultAttemptInput` | Type | `packages/fluxiq/src/programs/automation-studio/runtime/recovery/refuted-result/attempt.ts` | - |
| `automationStudioRefutedResultAttemptNamesNode` | Value | `packages/fluxiq/src/programs/automation-studio/runtime/recovery/refuted-result/attempt.ts` | - |
| `automationStudioRefutedResultDegraded` | Value | `packages/fluxiq/src/programs/automation-studio/runtime/recovery/refuted-result/reauthor.ts` | - |
| `AutomationStudioRefutedResultFailure` | Type | `packages/fluxiq/src/programs/automation-studio/runtime/recovery/refuted-result/reauthor.ts` | What a reader is told about a step of this route that failed: the code, and the closed facts around it that say which kind of failure it was. Codes, flags, counts and a status number, because this is written onto the run and published from there. `accounting` and `evidenceLoop` are the failed build's own diagnostic sections, already bounded and screened by the build (`flow-bootstrap/generation-failure/diagnostic.ts`), so a build that failed part way can be walked decision by decision. |
| `automationStudioRefutedResultFlowWasReauthored` | Value | `packages/fluxiq/src/programs/automation-studio/runtime/recovery/refuted-result/reauthor.ts` | - |
| `AutomationStudioRefutedResultFoundNothing` | Type | `packages/fluxiq/src/programs/automation-studio/runtime/recovery/refuted-result/reauthor.ts` | What a re-author build that found the Flow needs no change answers: what it said, and what it spent where that was reported. |
| `AutomationStudioRefutedResultGenerated` | Type | `packages/fluxiq/src/programs/automation-studio/runtime/recovery/refuted-result/reauthor.ts` | What a successful re-author build answers: its adaptation, and what it spent (`generateFlowBootstrapAdaptation`'s accounting). |
| `automationStudioRefutedResultHeldReauthor` | Value | `packages/fluxiq/src/programs/automation-studio/runtime/recovery/refuted-result/held-reauthor.ts` | - |
| `AutomationStudioRefutedResultLadderSkip` | Type | `packages/fluxiq/src/programs/automation-studio/runtime/recovery/refuted-result/ladder-skip.ts` | Why the patch ladder was not run for a refuted result, in codes a reader can key on. |
| `automationStudioRefutedResultLadderSkipped` | Value | `packages/fluxiq/src/programs/automation-studio/runtime/recovery/refuted-result/ladder-skip.ts` | - |
| `automationStudioRefutedResultReauthorDecision` | Value | `packages/fluxiq/src/programs/automation-studio/runtime/recovery/refuted-result/reauthor.ts` | - |
| `AutomationStudioRefutedResultReauthorDecision` | Type | `packages/fluxiq/src/programs/automation-studio/runtime/recovery/refuted-result/reauthor.ts` | - |
| `automationStudioRefutedResultReauthored` | Value | `packages/fluxiq/src/programs/automation-studio/runtime/recovery/refuted-result/reauthor.ts` | - |
| `automationStudioRefutedResultReauthorMarked` | Value | `packages/fluxiq/src/programs/automation-studio/runtime/recovery/refuted-result/held-reauthor.ts` | - |
| `AutomationStudioRefutedResultReauthorRefusal` | Type | `packages/fluxiq/src/programs/automation-studio/runtime/recovery/refuted-result/reauthor.ts` | Why a refuted run was not re-authored, in codes a reader can key on. |
| `AutomationStudioRefutedResultRepairInput` | Type | `packages/fluxiq/src/programs/automation-studio/runtime/recovery/refuted-result/repair.ts` | - |
| `AutomationStudioRefutedResultRepairPort` | Type | `packages/fluxiq/src/programs/automation-studio/runtime/recovery/refuted-result/repair.ts` | The recovery, as the verification reaches it. A port rather than a direct call, for the reason `annotation/ports.ts` states: the recovery needs a provider resolution, a graph binding and an adaptation context, all of which the run service holds and none of which belongs in the verification. It answers the annotated run detail, or nothing when it declined to annotate at all. |
| `AutomationStudioRefutedResultRepairResult` | Type | `packages/fluxiq/src/programs/automation-studio/runtime/recovery/refuted-result/repair.ts` | What the entry point did with one refutation. |
| `automationStudioRefutedResultRerunsFlow` | Value | `packages/fluxiq/src/programs/automation-studio/runtime/recovery/refuted-result/reauthor.ts` | - |
| `automationStudioRefutedResultWaitingReauthors` | Value | `packages/fluxiq/src/programs/automation-studio/runtime/recovery/refuted-result/held-reauthor.ts` | - |
| `AutomationStudioRegionExecutionPlan` | Type | `packages/fluxiq/src/programs/automation-studio/runtime/region-compiler.ts` | - |
| `automationStudioRepeatSuggestion` | Value | `packages/fluxiq/src/programs/automation-studio/runtime/llm/harness-options/repeat-suggestion.ts` | - |
| `AutomationStudioRepeatSuggestion` | Type | `packages/fluxiq/src/programs/automation-studio/runtime/llm/harness-options/repeat-suggestion.ts` | The sentence that goes with a suggestion, in the draft's numbers. |
| `AutomationStudioRepositories` | Type | `packages/fluxiq/src/programs/automation-studio/storage/contracts.ts` | - |
| `AutomationStudioRepository` | Type | `packages/fluxiq/src/programs/automation-studio/storage/contracts.ts` | - |
| `AutomationStudioRequestPhrase` | Type | `packages/fluxiq/src/programs/automation-studio/runtime/result-verification/request-rows/request-phrases.ts` | A phrase a label names: where it starts in the label's words, and its words as compared. |
| `automationStudioRequestPhrases` | Value | `packages/fluxiq/src/programs/automation-studio/runtime/result-verification/request-rows/request-phrases.ts` | - |
| `AutomationStudioRequestPhrases` | Type | `packages/fluxiq/src/programs/automation-studio/runtime/result-verification/request-rows/request-phrases.ts` | A request read into its phrases. |
| `automationStudioRequestRowIds` | Value | `packages/fluxiq/src/programs/automation-studio/runtime/result-verification/request-rows/words.ts` | - |
| `automationStudioRequestRowLabel` | Value | `packages/fluxiq/src/programs/automation-studio/runtime/result-verification/request-rows/summary-reads.ts` | - |
| `automationStudioRequestRowNaming` | Value | `packages/fluxiq/src/programs/automation-studio/runtime/result-verification/request-rows/row-naming.ts` | - |
| `AutomationStudioRequestRowNaming` | Type | `packages/fluxiq/src/programs/automation-studio/runtime/result-verification/request-rows/row-naming.ts` | The ways a row may be named: the words of its distinguishing prefix, and its own ids. |
| `automationStudioRequestRowsAfterRerun` | Value | `packages/fluxiq/src/programs/automation-studio/runtime/result-verification/request-rows/rerun-rows.ts` | - |
| `AutomationStudioRequestRowsAfterRerun` | Type | `packages/fluxiq/src/programs/automation-studio/runtime/result-verification/request-rows/types.ts` | What a rerun of a read did to the rows Core's check named (`rerun-rows.ts`): the ones it keeps, the ones still left out, and Core's sentence saying so. |
| `AutomationStudioRequestRowsCondition` | Type | `packages/fluxiq/src/programs/automation-studio/runtime/result-verification/request-rows/types.ts` | One condition of a read, with the rows it alone left out. |
| `AutomationStudioRequestRowsNamed` | Type | `packages/fluxiq/src/programs/automation-studio/runtime/result-verification/request-rows/types.ts` | The rows Core's check of a judgement named as left out by one condition of one read (`checked-rows-named.ts`), read from Core's own `checked` lines: what a repair compares a rerun of that read against (`rerun-rows.ts`, live run `run-mux6naez-6c20f26e`, R3-3). Labels as the read gave them, and the ids the line named each row by. |
| `automationStudioRequestRowsNamedOf` | Value | `packages/fluxiq/src/programs/automation-studio/runtime/result-verification/request-rows/named-of.ts` | - |
| `AutomationStudioRequestRowsRead` | Type | `packages/fluxiq/src/programs/automation-studio/runtime/result-verification/request-rows/types.ts` | One list read, as the rows a summary holds for it. |
| `automationStudioRequestRowsReads` | Value | `packages/fluxiq/src/programs/automation-studio/runtime/result-verification/request-rows/summary-reads.ts` | - |
| `AutomationStudioRequestRowsStored` | Type | `packages/fluxiq/src/programs/automation-studio/runtime/result-verification/request-rows/types.ts` | A finished run's stored row: its label and every text cell, for an id a judgement names. |
| `AutomationStudioRequestRowWord` | Type | `packages/fluxiq/src/programs/automation-studio/runtime/result-verification/request-rows/words.ts` | One word: as compared, as written, and the segment it sits in. |
| `automationStudioRequestRowWords` | Value | `packages/fluxiq/src/programs/automation-studio/runtime/result-verification/request-rows/words.ts` | - |
| `automationStudioRequestTextNamesRow` | Value | `packages/fluxiq/src/programs/automation-studio/runtime/result-verification/request-rows/row-naming.ts` | - |
| `AutomationStudioResolvedAskRoutes` | Type | `packages/fluxiq/src/programs/automation-studio/runtime/parking/ask.ts` | The same three routes with every gap filled in, which is what a parked run holds. Derived from the ask's own routes rather than written out again, so a route added to the ask is a route a parked run must resolve. |
| `AutomationStudioResolvedInstruction` | Type | `packages/fluxiq/src/programs/automation-studio/runtime/llm/harness/instruction.ts` | - |
| `automationStudioResultCheckActivity` | Value | `packages/fluxiq/src/programs/automation-studio/runtime/result-verification/check-activity.ts` | - |
| `automationStudioResultCheckAskId` | Value | `packages/fluxiq/src/programs/automation-studio/runtime/result-check-schedule/conversation.ts` | - |
| `AutomationStudioResultCheckAuthorization` | Type | `packages/fluxiq/src/programs/automation-studio/runtime/result-check-authorization/contracts.ts` | - |
| `AutomationStudioResultCheckConfiguration` | Type | `packages/fluxiq/src/programs/automation-studio/runtime/result-check-schedule/configuration.ts` | - |
| `AutomationStudioResultCheckDecision` | Type | `packages/fluxiq/src/programs/automation-studio/runtime/result-check-schedule/contracts.ts` | Whether this run is checked, why, and when the next one falls due. `reason` and `code` are recorded on every run, checked or not, so a run that was not put to the question says so rather than being silent about it. |
| `automationStudioResultCheckedRows` | Value | `packages/fluxiq/src/programs/automation-studio/runtime/result-verification/request-rows/checked-rows.ts` | - |
| `automationStudioResultCheckedRowsNamed` | Value | `packages/fluxiq/src/programs/automation-studio/runtime/result-verification/request-rows/checked-rows-named.ts` | - |
| `automationStudioResultCheckOrdinals` | Value | `packages/fluxiq/src/programs/automation-studio/runtime/result-check-schedule/ordinals.ts` | - |
| `AutomationStudioResultCheckProviderPorts` | Type | `packages/fluxiq/src/programs/automation-studio/runtime/result-check-authorization/provider-contract.ts` | The Secret Keys operations a standing check needs, and no others. |
| `AutomationStudioResultCheckProviderResolution` | Type | `packages/fluxiq/src/programs/automation-studio/runtime/result-check-authorization/provider-contract.ts` | The model a standing check resolved to, with the ceiling the redemption worked out. |
| `AutomationStudioResultCheckProviderScope` | Type | `packages/fluxiq/src/programs/automation-studio/runtime/result-check-authorization/provider-contract.ts` | The one Flow, one key and one call ceiling this resolution is bound to. |
| `AutomationStudioResultCheckRedemption` | Type | `packages/fluxiq/src/programs/automation-studio/runtime/result-check-authorization/contracts.ts` | What redeeming a standing authorization produced: a bounded provider request, or the stated reason there is none. |
| `AutomationStudioResultCheckSchedule` | Type | `packages/fluxiq/src/programs/automation-studio/runtime/result-check-schedule/policy.ts` | - |
| `AutomationStudioResultCheckSettings` | Type | `packages/fluxiq/src/programs/automation-studio/runtime/result-check-schedule/settings.ts` | - |
| `AutomationStudioResultCheckShape` | Type | `packages/fluxiq/src/programs/automation-studio/runtime/result-check-schedule/settings.ts` | How the interval between checks changes as a Flow keeps working. `initial_then_exponential` is the default and is the user's stated schedule. The other four exist so the policy is genuinely replaceable rather than one curve with knobs: a Flow run twice a year wants `every_run`, a Flow whose result is checked by something else wants `never`, and a regulated one wants a `fixed_interval` that never widens. |
| `automationStudioResultCheckShapeValue` | Value | `packages/fluxiq/src/programs/automation-studio/runtime/result-check-schedule/settings.ts` | - |
| `AutomationStudioResultCheckState` | Type | `packages/fluxiq/src/programs/automation-studio/runtime/result-check-schedule/contracts.ts` | - |
| `AutomationStudioResultCheckThread` | Type | `packages/fluxiq/src/programs/automation-studio/runtime/result-check-schedule/conversation.ts` | The two methods posting a result check needs. `AutomationStudioConversationWriter` satisfies it. |
| `automationStudioResultCheckTurn` | Value | `packages/fluxiq/src/programs/automation-studio/runtime/result-check-schedule/conversation.ts` | - |
| `AutomationStudioResultCheckTurn` | Type | `packages/fluxiq/src/programs/automation-studio/runtime/result-check-schedule/conversation.ts` | One turn, or nothing. `attachment` names the dataset that was judged, where the run stored one. |
| `automationStudioResultCoreObservation` | Value | `packages/fluxiq/src/programs/automation-studio/runtime/result-verification/core-observation.ts` | - |
| `automationStudioResultEndView` | Value | `packages/fluxiq/src/programs/automation-studio/runtime/result-verification/result-summary.ts` | - |
| `AutomationStudioResultEndView` | Type | `packages/fluxiq/src/programs/automation-studio/runtime/result-verification/contracts.ts` | The view of its target -- for the web domain, the page -- a run or a test ended on, as the domain produced it (t174-w87). Run `run-murwd8le-79e735a8`'s judges never saw `Cart (3)`, the coupon's "Collected" or the quantity field, and one of them invented a quantity that was never committed. |
| `automationStudioResultEndViewRead` | Value | `packages/fluxiq/src/programs/automation-studio/runtime/result-verification/result-summary.ts` | - |
| `automationStudioResultFailureRecord` | Value | `packages/fluxiq/src/programs/automation-studio/runtime/result-verification/core-observation.ts` | - |
| `AutomationStudioResultFlowStepSummary` | Type | `packages/fluxiq/src/programs/automation-studio/runtime/result-verification/contracts.ts` | One step of the Flow that produced the result, as the judgement reads it. It carried a node id and a definition id and nothing else, and that is not enough to answer the question the judgement is asked. The instruction tells the judge to answer `no` for "a Flow with no step that could have narrowed or filtered what the request asked to narrow" -- and two definition ids apart, a Flow that filters on the right field and a Flow that filters on the wrong one are the same list of names. Five consecutive live runs were refuted with that list in front of the judge, correctly, and with nothing in the refutation that said which step was wrong. So the step now carries what the Flow authored it with, screened by `repair-context/parameter-screen.ts` -- the same projection, the same screens and the same dotted-path notation the *repair* has been shown since t139. A judgement poorer than the repair that follows it is the parity gap this closes. |
| `AutomationStudioResultJudgementText` | Type | `packages/fluxiq/src/programs/automation-studio/runtime/result-verification/repair-directive.ts` | What the model said, as the verdict reader hands it over: read forgivingly, never required. |
| `automationStudioResultLeftOutNamingTheItem` | Value | `packages/fluxiq/src/programs/automation-studio/runtime/result-verification/request-rows/left-out-naming-the-item.ts` | - |
| `AutomationStudioResultLeftOutNamingTheItem` | Type | `packages/fluxiq/src/programs/automation-studio/runtime/result-verification/contracts.ts` | One condition's left-out rows that name the asked item (`AutomationStudioRunResultSummary.leftOutNamingTheItem`). `step` is the build test's step number, `nodeId` a finished run's read node; `condition` the condition as the read names it; `item` the request's phrase every kept row names first; `also` the request's phrases each row names only after it; `rows` the rows, by label, as the read gave them. |
| `automationStudioResultLeftOutRowsUnaccounted` | Value | `packages/fluxiq/src/programs/automation-studio/runtime/result-verification/request-rows/unaccounted-rows.ts` | - |
| `automationStudioResultObservation` | Value | `packages/fluxiq/src/programs/automation-studio/runtime/result-verification/verdict.ts` | - |
| `AutomationStudioResultReadAccount` | Type | `packages/fluxiq/src/programs/automation-studio/runtime/result-verification/contracts.ts` | How one read of a list went, as the judgement and the repair read it. **Why it exists.** `run-munq5s8x-6d620cdf`: the Flow's extraction followed five pages, filtered on four conditions and kept one row per link, and the check refuted its eight rows -- correctly -- then advised "add a pagination loop ... and a filter/dedup step", every part of which the step already had. It had been told "8 records stored" and a list of definition ids; the step's parameters had been cut to fit the call. The re-author was told the same. So neither could see that the read already paged, nor which of its conditions rejected the rows the request wanted. Two sources, joined by node id. The counts are the read's own account of itself, which the run record already holds (`service/summaries/ extraction-summary.ts` admits it on the attempt as `metadata.extraction`); the conditions, the paging and the dedupe key are what the Flow authored the step with. Counts, closed words, column ids and the model's own condition wording -- no locator, and no page value but a condition's `leftOutOnlyByThis` row labels with the value it tested on each, and the value its own read found, each screened. |
| `automationStudioResultReadAccounts` | Value | `packages/fluxiq/src/programs/automation-studio/runtime/result-verification/read-account/accounts.ts` | - |
| `AutomationStudioResultReadAccountsInput` | Type | `packages/fluxiq/src/programs/automation-studio/runtime/result-verification/read-account/accounts.ts` | - |
| `automationStudioResultReadAloneRows` | Value | `packages/fluxiq/src/programs/automation-studio/runtime/result-verification/read-account/alone-rows.ts` | - |
| `automationStudioResultReadConditionColumn` | Value | `packages/fluxiq/src/programs/automation-studio/runtime/result-verification/read-account/condition.ts` | - |
| `automationStudioResultReadConditionText` | Value | `packages/fluxiq/src/programs/automation-studio/runtime/result-verification/read-account/condition.ts` | - |
| `automationStudioResultReadDedupe` | Value | `packages/fluxiq/src/programs/automation-studio/runtime/result-verification/read-account/dedupe.ts` | - |
| `automationStudioResultReadEmptiedColumns` | Value | `packages/fluxiq/src/programs/automation-studio/runtime/result-verification/read-account/emptied-columns.ts` | - |
| `automationStudioResultReadLoopedAccount` | Value | `packages/fluxiq/src/programs/automation-studio/runtime/result-verification/read-account/looped-account.ts` | - |
| `AutomationStudioResultReadLoopedAccountInput` | Type | `packages/fluxiq/src/programs/automation-studio/runtime/result-verification/read-account/looped-account.ts` | - |
| `automationStudioResultReadLoopPasses` | Value | `packages/fluxiq/src/programs/automation-studio/runtime/result-verification/read-account/loop-passes.ts` | - |
| `AutomationStudioResultReadLoopPasses` | Type | `packages/fluxiq/src/programs/automation-studio/runtime/result-verification/read-account/loop-passes.ts` | A read step's passes of one loop: the Repeat that counts them, each pass's attempts, and how the loop ended. |
| `automationStudioResultReadPageBoundSentence` | Value | `packages/fluxiq/src/programs/automation-studio/runtime/result-verification/read-account/page-bound-sentence.ts` | - |
| `automationStudioResultReadPagesClause` | Value | `packages/fluxiq/src/programs/automation-studio/runtime/result-verification/read-account/pages-clause.ts` | - |
| `automationStudioResultReadSentence` | Value | `packages/fluxiq/src/programs/automation-studio/runtime/result-verification/read-account/sentence.ts` | - |
| `automationStudioResultReadStop` | Value | `packages/fluxiq/src/programs/automation-studio/runtime/result-verification/read-account/stop.ts` | - |
| `AutomationStudioResultReadStopMeaning` | Type | `packages/fluxiq/src/programs/automation-studio/runtime/result-verification/read-account/stop.ts` | Why a read's paging stopped, as what a reader does about it. |
| `AutomationStudioResultRecordSetInput` | Type | `packages/fluxiq/src/programs/automation-studio/runtime/result-verification/result-summary.ts` | One record set as the caller reads it out of the store. |
| `AutomationStudioResultRecordSetSummary` | Type | `packages/fluxiq/src/programs/automation-studio/runtime/result-verification/contracts.ts` | One record set the run stored, as the verification reads it. |
| `automationStudioResultRepairContinuation` | Value | `packages/fluxiq/src/programs/automation-studio/runtime/recovery/refuted-result/history.ts` | - |
| `automationStudioResultRepairDirective` | Value | `packages/fluxiq/src/programs/automation-studio/runtime/result-verification/repair-directive.ts` | - |
| `AutomationStudioResultRepairDirective` | Type | `packages/fluxiq/src/programs/automation-studio/runtime/result-verification/contracts.ts` | What to fix, and what the check itself said about it. The user's instruction of 2026-09-26: "judging answers: it should give explicit instructions on what to fix regarding the data + possible suggestions." Before this, a refutation was a verdict and a code. Five consecutive live runs were refuted as `core.result.does_not_answer_request`, correctly, and that string was the whole of what the repair was told -- so the repair had to rediscover the defect from scratch, at the cost of a second full exploration, and on the one run where it reached the model it produced no correction at all. **The two halves are kept apart because their provenance differs.** `findings` and `fix` are Core's: arithmetic over the summary it already holds, and a sentence per finding that Core wrote. `judgement` is the model's own reading, screened. A run record carries only the first two (`run-outcome.ts`); the second reaches the repair through the failure record's `expected` and `actual`, which is where a sentence written outside Core has always travelled (`llm/harness/locator-text.ts`). **Nothing here is demanded of the model.** No new response field, no new schema key, nothing a malformed answer can fail: `judgement` is read off the `expected`, `observed` and `changed` the diagnosis channel already carries, and a field that is missing, oversized, wrongly typed or refused by a screen is simply absent from the directive. A judgement that says nothing beyond `no` still produces a valid refutation with Core's own findings in it. |
| `AutomationStudioResultRepairDirectiveInput` | Type | `packages/fluxiq/src/programs/automation-studio/runtime/result-verification/repair-directive.ts` | - |
| `AutomationStudioResultRepairFinding` | Type | `packages/fluxiq/src/programs/automation-studio/runtime/result-verification/contracts.ts` | One thing wrong with what a run produced, as Core's own arithmetic found it. Coded, so a repair can act on it without reading prose, and ids only -- a column id, a record set id -- because a value belongs to the person and a count belongs to Core. `detail` is Core's sentence for a reader, never a model's. |
| `automationStudioResultRepairFindings` | Value | `packages/fluxiq/src/programs/automation-studio/runtime/result-verification/repair-directive.ts` | - |
| `automationStudioResultRepairHistoryEntry` | Value | `packages/fluxiq/src/programs/automation-studio/runtime/recovery/refuted-result/history.ts` | - |
| `AutomationStudioResultRepairHistoryEntry` | Type | `packages/fluxiq/src/programs/automation-studio/runtime/recovery/refuted-result/history.ts` | One refuted answer, as the next repair is shown it. `attempt` is the repair this refutation opened: 1 for the Flow as first built, 2 for the Flow the first repair produced, and so on. |
| `automationStudioResultRepairHistoryRecord` | Value | `packages/fluxiq/src/programs/automation-studio/runtime/recovery/refuted-result/history.ts` | - |
| `AutomationStudioResultRepairOutcome` | Type | `packages/fluxiq/src/programs/automation-studio/runtime/recovery/refuted-result/repair.ts` | How a repair that is not going any further ended, in words a reader can key on. - `answered`: the repaired Flow's answer was judged to answer the request. - `unverified`: its answer was put to the check and nothing was settled. - `stopped`: refuted again, and not repaired again (the marker's `stopped` says why). - `not_rerun`: the repair produced no applied edit, or the edit could not be run. - `rerun_failed`: the repaired Flow was run and did not finish with a result to judge. |
| `AutomationStudioResultRepairPart` | Type | `packages/fluxiq/src/programs/automation-studio/runtime/recovery/refuted-result/purse.ts` | A part of the repair the purse can refuse. |
| `automationStudioResultRepairPurse` | Value | `packages/fluxiq/src/programs/automation-studio/runtime/recovery/refuted-result/purse.ts` | - |
| `AutomationStudioResultRepairPurse` | Type | `packages/fluxiq/src/programs/automation-studio/runtime/recovery/refuted-result/purse.ts` | The repair's purse, as the run records it. |
| `automationStudioResultRepairPurseAllowsPart` | Value | `packages/fluxiq/src/programs/automation-studio/runtime/recovery/refuted-result/purse.ts` | - |
| `automationStudioResultRepairPurseCharged` | Value | `packages/fluxiq/src/programs/automation-studio/runtime/recovery/refuted-result/purse.ts` | - |
| `automationStudioResultRepairPurseLeftUsd` | Value | `packages/fluxiq/src/programs/automation-studio/runtime/recovery/refuted-result/purse.ts` | - |
| `automationStudioResultRepairPurseRefused` | Value | `packages/fluxiq/src/programs/automation-studio/runtime/recovery/refuted-result/purse.ts` | - |
| `automationStudioResultRepairSettled` | Value | `packages/fluxiq/src/programs/automation-studio/runtime/recovery/refuted-result/repair.ts` | - |
| `AutomationStudioResultRepairStop` | Type | `packages/fluxiq/src/programs/automation-studio/runtime/recovery/refuted-result/history.ts` | Why a refuted run was not re-authored again, in codes a reader can key on. |
| `automationStudioResultRepairUnchangedInARow` | Value | `packages/fluxiq/src/programs/automation-studio/runtime/recovery/refuted-result/history.ts` | - |
| `automationStudioResultRepairWithPurse` | Value | `packages/fluxiq/src/programs/automation-studio/runtime/recovery/refuted-result/purse.ts` | - |
| `automationStudioResultStepChanges` | Value | `packages/fluxiq/src/programs/automation-studio/runtime/result-verification/step-changes.ts` | - |
| `automationStudioResultSummaryWithLeftOutNamingTheItem` | Value | `packages/fluxiq/src/programs/automation-studio/runtime/result-verification/request-rows/summary-with-left-out-naming-the-item.ts` | - |
| `automationStudioResultSummaryWithoutTestedLabel` | Value | `packages/fluxiq/src/programs/automation-studio/runtime/result-verification/read-account/without-tested-label.ts` | - |
| `automationStudioResultSummaryWithPagingWords` | Value | `packages/fluxiq/src/programs/automation-studio/runtime/result-verification/read-account/judge-paging.ts` | - |
| `automationStudioResultSummaryWithUnreadColumns` | Value | `packages/fluxiq/src/programs/automation-studio/runtime/result-verification/read-account/unread-columns.ts` | - |
| `automationStudioResultVerdict` | Value | `packages/fluxiq/src/programs/automation-studio/runtime/result-verification/verdict.ts` | - |
| `AutomationStudioResultVerdict` | Type | `packages/fluxiq/src/programs/automation-studio/runtime/result-verification/contracts.ts` | The verdict on whether a finished run's result answers the request. Three words, because two would force a model with no view to guess. `unsure` exists so that "I cannot tell" is sayable, and it is emphatically not a pass: `automationStudioResultVerificationAnswers` is the one reader of these values, and only `answers` passes. What any other verdict does to the run is `automationStudioResultVerificationFailsRun`'s to say: it fails the run unless two checks of the same result did not settle it. |
| `AutomationStudioResultVerdictBasis` | Type | `packages/fluxiq/src/programs/automation-studio/runtime/result-verification/contracts.ts` | How a verdict was reached. Recorded so a reader can tell a judgement from an unanswered question. |
| `automationStudioResultVerdictFromDiagnosis` | Value | `packages/fluxiq/src/programs/automation-studio/runtime/result-verification/verdict.ts` | - |
| `AutomationStudioResultVerdictInput` | Type | `packages/fluxiq/src/programs/automation-studio/runtime/result-verification/verdict.ts` | - |
| `AutomationStudioResultVerification` | Type | `packages/fluxiq/src/programs/automation-studio/runtime/result-verification/contracts.ts` | The verdict, the reason a person reads, and the observation behind it. |
| `automationStudioResultVerificationAnswers` | Value | `packages/fluxiq/src/programs/automation-studio/runtime/result-verification/contracts.ts` | - |
| `AutomationStudioResultVerificationBounded` | Type | `packages/fluxiq/src/programs/automation-studio/runtime/result-verification/deadline.ts` | What a bounded verification came to: its value, or why there is none. |
| `automationStudioResultVerificationFailsRun` | Value | `packages/fluxiq/src/programs/automation-studio/runtime/result-verification/contracts.ts` | - |
| `AutomationStudioResultVerificationOutcome` | Type | `packages/fluxiq/src/programs/automation-studio/runtime/result-verification/contracts.ts` | What a finished run's verification produced: a verdict, or a stated reason there is none. |
| `AutomationStudioResultVerificationPorts` | Type | `packages/fluxiq/src/programs/automation-studio/runtime/result-verification/run-outcome.ts` | Everything the verification reaches outside itself. |
| `automationStudioResultVerificationProvider` | Value | `packages/fluxiq/src/programs/automation-studio/runtime/result-verification/run-outcome.ts` | - |
| `AutomationStudioResultVerificationProvider` | Type | `packages/fluxiq/src/programs/automation-studio/runtime/result-verification/run-outcome.ts` | The model that judges a result, with whatever the resolution bounds it to. |
| `AutomationStudioResultVerificationReport` | Type | `packages/fluxiq/src/programs/automation-studio/runtime/result-verification/verify.ts` | The outcome, and the intervention record of each call made: none, one, or two. |
| `AutomationStudioResultVerificationRequest` | Type | `packages/fluxiq/src/programs/automation-studio/runtime/result-verification/verify.ts` | - |
| `AutomationStudioResultVerificationSkipped` | Type | `packages/fluxiq/src/programs/automation-studio/runtime/result-verification/contracts.ts` | Why a run was not verified at all. This is not a verdict and must never be read as one. A run that produces no records has no result to judge, and a deployment with no model configured cannot ask for a judgement -- neither is the model saying "it looks fine". Recording the reason is what keeps the two apart on a run's record. |
| `automationStudioResultVerificationStatus` | Value | `packages/fluxiq/src/programs/automation-studio/runtime/result-verification/verification-status.ts` | - |
| `AutomationStudioResultVerificationStatus` | Type | `packages/fluxiq/src/programs/automation-studio/runtime/result-verification/verification-status.ts` | - |
| `automationStudioResultVerificationWithinDeadline` | Value | `packages/fluxiq/src/programs/automation-studio/runtime/result-verification/deadline.ts` | - |
| `AutomationStudioResumeOutcome` | Type | `packages/fluxiq/src/programs/automation-studio/runtime/executor/resume.ts` | A resume either produces the continued run or moves nothing at all. A refusal leaves the run parked exactly as it was, so a mistaken answer costs nothing and the right one still works. |
| `automationStudioRetryBackoffMs` | Value | `packages/fluxiq/src/programs/automation-studio/runtime/executor/retry-policy.ts` | - |
| `automationStudioRetryHintMs` | Value | `packages/fluxiq/src/programs/automation-studio/runtime/executor/defensive/retry-hint.ts` | - |
| `AutomationStudioRetryWait` | Type | `packages/fluxiq/src/programs/automation-studio/runtime/executor/defensive/retry-wait.ts` | What one wait costs, and whether a bound shortened it. |
| `AutomationStudioReusableLlmContextAuditEvent` | Type | `packages/fluxiq/src/programs/automation-studio/storage/project/reusable-llm-context-store.ts` | - |
| `AutomationStudioReusableLlmContextFeatureStatus` | Type | `packages/fluxiq/src/programs/automation-studio/runtime/service/reusable-context/contracts.ts` | - |
| `AutomationStudioReusableLlmContextFreshEvidenceInput` | Type | `packages/fluxiq/src/programs/automation-studio/runtime/service/reusable-context/contracts.ts` | - |
| `AutomationStudioReusableLlmContextHostConfiguration` | Type | `packages/fluxiq/src/programs/automation-studio/runtime/service/reusable-context/contracts.ts` | - |
| `AutomationStudioReusableLlmContextList` | Type | `packages/fluxiq/src/programs/automation-studio/storage/project/reusable-llm-context-store.ts` | - |
| `AutomationStudioReusableLlmContextOption` | Type | `packages/fluxiq/src/programs/automation-studio/runtime/service/reusable-context/contracts.ts` | - |
| `AutomationStudioReusableLlmContextOutcome` | Type | `packages/fluxiq/src/programs/automation-studio/storage/project/reusable-llm-context-store.ts` | - |
| `AutomationStudioReusableLlmContextPacket` | Type | `packages/fluxiq/src/programs/automation-studio/runtime/reusable-llm-context.ts` | - |
| `AutomationStudioReusableLlmContextPackingResult` | Type | `packages/fluxiq/src/programs/automation-studio/runtime/reusable-llm-context.ts` | - |
| `AutomationStudioReusableLlmContextRecord` | Type | `packages/fluxiq/src/programs/automation-studio/storage/project/reusable-llm-context-store.ts` | - |
| `AutomationStudioReusableLlmContextReviewerState` | Type | `packages/fluxiq/src/programs/automation-studio/storage/project/reusable-llm-context-store.ts` | - |
| `AutomationStudioReusableLlmContextSelection` | Type | `packages/fluxiq/src/programs/automation-studio/runtime/service/reusable-context/contracts.ts` | - |
| `AutomationStudioReusableLlmContextSummary` | Type | `packages/fluxiq/src/programs/automation-studio/runtime/service/reusable-context/contracts.ts` | - |
| `AutomationStudioReusableLlmContextTag` | Type | `packages/fluxiq/src/programs/automation-studio/storage/project/reusable-llm-context-store.ts` | - |
| `AutomationStudioReusableLlmContextValidationState` | Type | `packages/fluxiq/src/programs/automation-studio/storage/project/reusable-llm-context-store.ts` | - |
| `AutomationStudioReusableLlmContextWrite` | Type | `packages/fluxiq/src/programs/automation-studio/storage/project/reusable-llm-context-store.ts` | - |
| `AutomationStudioRootIndex` | Type | `packages/fluxiq/src/programs/automation-studio/storage/file-store.ts` | - |
| `automationStudioRouteConditionIssues` | Value | `packages/fluxiq/src/programs/automation-studio/runtime/flow-bootstrap/plan/route-condition.ts` | - |
| `automationStudioRouteConditionKey` | Value | `packages/fluxiq/src/programs/automation-studio/runtime/flow-bootstrap/plan/route-condition.ts` | - |
| `automationStudioRouteConditionPaths` | Value | `packages/fluxiq/src/programs/automation-studio/runtime/flow-bootstrap/plan/route-condition.ts` | - |
| `AutomationStudioRouteDecisionRecord` | Type | `packages/fluxiq/src/programs/automation-studio/model/flow-adaptation.ts` | - |
| `AutomationStudioRoutePlanDiagnostic` | Type | `packages/fluxiq/src/programs/automation-studio/runtime/router-runtime.ts` | - |
| `AutomationStudioRouterExecutionInput` | Type | `packages/fluxiq/src/programs/automation-studio/runtime/router-runtime.ts` | - |
| `AutomationStudioRouterExecutionPlan` | Type | `packages/fluxiq/src/programs/automation-studio/runtime/router-runtime.ts` | - |
| `AutomationStudioRouterExecutionResult` | Type | `packages/fluxiq/src/programs/automation-studio/runtime/router-runtime.ts` | - |
| `AutomationStudioRouterRouteCounts` | Type | `packages/fluxiq/src/programs/automation-studio/storage/project/flow-resource-repository.ts` | - |
| `AutomationStudioRouterRoutePage` | Type | `packages/fluxiq/src/programs/automation-studio/runtime/service/flow-map-routes/contracts.ts` | - |
| `AutomationStudioRouterSummary` | Type | `packages/fluxiq/src/programs/automation-studio/runtime/service/indexes/types.ts` | - |
| `AutomationStudioRouterTargetReferenceBatch` | Type | `packages/fluxiq/src/programs/automation-studio/runtime/service/flow-map-routes/contracts.ts` | - |
| `AutomationStudioRouteRuleEvaluation` | Type | `packages/fluxiq/src/programs/automation-studio/runtime/router-runtime.ts` | - |
| `AutomationStudioRouteTarget` | Type | `packages/fluxiq/src/programs/automation-studio/model/flow-adaptation.ts` | - |
| `AutomationStudioRoutineArtifact` | Type | `packages/fluxiq/src/programs/automation-studio/model/artifacts.ts` | - |
| `automationStudioRunCandidateAdaptationIds` | Value | `packages/fluxiq/src/programs/automation-studio/runtime/durable-behavior/judged-decision.ts` | - |
| `automationStudioRunChangedDurableBehavior` | Value | `packages/fluxiq/src/programs/automation-studio/runtime/durable-behavior/durable-behavior-changed.ts` | - |
| `AutomationStudioRunCheckpoint` | Type | `packages/fluxiq/src/programs/automation-studio/runtime/run-control/types.ts` | Where the executor is when it asks whether it may go on. |
| `AutomationStudioRunCheckpointOutcome` | Type | `packages/fluxiq/src/programs/automation-studio/runtime/run-control/types.ts` | How a held run was let go. `resume` goes on from the node it held before; `stop` ends the run as cancelled with `message` -- a run stopped while held, or one held past its limit. |
| `AutomationStudioRunControlEvent` | Type | `packages/fluxiq/src/programs/automation-studio/runtime/run-control/types.ts` | One thing that happened to a run's control, in order. Kept for the run's record. |
| `AutomationStudioRunControlGate` | Type | `packages/fluxiq/src/programs/automation-studio/runtime/run-control/types.ts` | The seam the executor waits at, once per step, before it executes a node. `checkpoint` returns `null` synchronously when the run may go straight on, so an unpaused run pays no await and no scheduling change. Otherwise it returns a promise that settles when the run is let go, and never rejects. |
| `AutomationStudioRunControlHolder` | Type | `packages/fluxiq/src/programs/automation-studio/runtime/run-control/types.ts` | Who has the page while a run is held. `fluxiq` is a plain pause: the person asked the run to wait. `person` is a takeover: the person is acting on the page, and FluxIQ must not touch it until control is returned. |
| `AutomationStudioRunController` | Class | `packages/fluxiq/src/programs/automation-studio/runtime/run-control/run-controller.ts` | - |
| `AutomationStudioRunControllerInput` | Type | `packages/fluxiq/src/programs/automation-studio/runtime/run-control/run-controller.ts` | - |
| `automationStudioRunControlOf` | Value | `packages/fluxiq/src/programs/automation-studio/runtime/run-control/host-registry.ts` | - |
| `AutomationStudioRunControlPhase` | Type | `packages/fluxiq/src/programs/automation-studio/runtime/run-control/types.ts` | What the run is doing while it runs, as far as a person needs to know. |
| `AutomationStudioRunControlRegistry` | Class | `packages/fluxiq/src/programs/automation-studio/runtime/run-control/registry.ts` | - |
| `AutomationStudioRunControlRegistryOptions` | Type | `packages/fluxiq/src/programs/automation-studio/runtime/run-control/registry.ts` | - |
| `AutomationStudioRunControlSnapshot` | Type | `packages/fluxiq/src/programs/automation-studio/runtime/run-control/types.ts` | A live run's control, as any surface reads it. `nodeId` and `step` name the node the run is held *before*: it has not executed on this arrival, and it is the first thing the run does when it resumes. |
| `AutomationStudioRunControlState` | Type | `packages/fluxiq/src/programs/automation-studio/runtime/run-control/types.ts` | Where a live run stands with respect to a person. - `running`: FluxIQ is driving and nothing is asked of it. - `pause_requested`: a pause was asked while a step was in flight. The step finishes -- a click is never cut in half -- and the run holds at the next checkpoint. - `paused`: the run is held between two steps. Nothing is dispatched to the page until it is resumed or stopped. |
| `AutomationStudioRunDatasetAuditEvent` | Type | `packages/fluxiq/src/programs/automation-studio/storage/project/run-dataset-store.ts` | A typed audit event. It carries ids and counts only, so no row value can reach it. |
| `AutomationStudioRunDatasetAuditEventInput` | Type | `packages/fluxiq/src/programs/automation-studio/storage/project/run-dataset-store.ts` | - |
| `AutomationStudioRunDatasetAuditEventType` | Type | `packages/fluxiq/src/programs/automation-studio/storage/project/run-dataset-store.ts` | - |
| `AutomationStudioRunDatasetBatch` | Type | `packages/fluxiq/src/programs/automation-studio/storage/project/run-dataset-store.ts` | One capture's rows for one dataset, already validated against `schema` by the caller. |
| `AutomationStudioRunDatasetDeletion` | Type | `packages/fluxiq/src/programs/automation-studio/storage/project/run-dataset-store.ts` | - |
| `AutomationStudioRunDatasetRow` | Type | `packages/fluxiq/src/programs/automation-studio/storage/project/run-dataset-store.ts` | One stored row: a JSON object keyed by the stored schema's field ids. |
| `AutomationStudioRunDatasetRowBatch` | Type | `packages/fluxiq/src/programs/automation-studio/storage/project/run-dataset-store.ts` | Rows read for streaming, with the ordinal to continue after. |
| `automationStudioRunFlowVersions` | Value | `packages/fluxiq/src/programs/automation-studio/runtime/flow-version/run-flow-versions.ts` | - |
| `automationStudioRunHasUntriedPatch` | Value | `packages/fluxiq/src/programs/automation-studio/runtime/durable-behavior/judged-decision.ts` | - |
| `automationStudioRunMayStillAbsorb` | Value | `packages/fluxiq/src/programs/automation-studio/runtime/executor/defensive/retry-wait.ts` | - |
| `automationStudioRunNodeStartPages` | Value | `packages/fluxiq/src/programs/automation-studio/runtime/llm/node-tools/run-start-pages.ts` | - |
| `automationStudioRunProgress` | Value | `packages/fluxiq/src/programs/automation-studio/runtime/run-control/progress-status.ts` | - |
| `AutomationStudioRunProgress` | Type | `packages/fluxiq/src/programs/automation-studio/runtime/run-control/progress-status.ts` | - |
| `AutomationStudioRunProgressStatus` | Type | `packages/fluxiq/src/programs/automation-studio/runtime/run-control/progress-status.ts` | - |
| `automationStudioRunResultAlreadyRepaired` | Value | `packages/fluxiq/src/programs/automation-studio/runtime/recovery/refuted-result/repair.ts` | - |
| `automationStudioRunResultRepairAttempts` | Value | `packages/fluxiq/src/programs/automation-studio/runtime/recovery/refuted-result/repair.ts` | - |
| `AutomationStudioRunResultSummary` | Type | `packages/fluxiq/src/programs/automation-studio/runtime/result-verification/contracts.ts` | The bounded account of what a run produced, and of the shape of the Flow that produced it. The Flow's shape is here because one of the four measured failures is only visible in it: a request for the records matching a description produced a Flow that navigated, extracted and ended, with no step that narrows anything, so returning every record was the only thing it could ever do. Definition ids and node ids are the same identifiers a run's recent actions already carry. |
| `AutomationStudioRunResultSummaryInput` | Type | `packages/fluxiq/src/programs/automation-studio/runtime/result-verification/result-summary.ts` | - |
| `AutomationStudioRunResultSummaryWithEndView` | Type | `packages/fluxiq/src/programs/automation-studio/runtime/result-verification/result-summary.ts` | - |
| `AutomationStudioRunResumption` | Type | `packages/fluxiq/src/programs/automation-studio/runtime/executor/resume.ts` | How a parked run is being settled: somebody answered, or nobody did. |
| `AutomationStudioRuntimeAdaptationContext` | Type | `packages/fluxiq/src/programs/automation-studio/runtime/service/runtime-adaptation/contracts.ts` | - |
| `automationStudioRuntimeAdaptationContextForLlmRun` | Value | `packages/fluxiq/src/programs/automation-studio/runtime/llm/runtime-session-llm.ts` | - |
| `AutomationStudioRuntimeAdapter` | Type | `packages/fluxiq/src/programs/automation-studio/runtime/adapters.ts` | - |
| `AutomationStudioRuntimeContext` | Type | `packages/fluxiq/src/programs/automation-studio/runtime/contracts.ts` | - |
| `AutomationStudioRuntimeDeterministicDiagnosis` | Type | `packages/fluxiq/src/programs/automation-studio/runtime/recovery/deterministic-diagnosis.ts` | - |
| `AutomationStudioRuntimeDeterministicDiagnosisInput` | Type | `packages/fluxiq/src/programs/automation-studio/runtime/recovery/deterministic-diagnosis.ts` | - |
| `AutomationStudioRuntimeDiagnosisAchievability` | Type | `packages/fluxiq/src/programs/automation-studio/runtime/recovery/deterministic-diagnosis.ts` | Whether the run's goal is still reachable at all. Three values rather than a boolean, because "we do not know" is the common case and is not the same claim as "no". `no` is reserved for the two classes where Core knows a person must act first; everything else is `unknown` until something observes otherwise. Nothing here ever returns `yes` from the absence of a contradiction. |
| `AutomationStudioRuntimeDiagnosisPriorAction` | Type | `packages/fluxiq/src/programs/automation-studio/runtime/recovery/deterministic-diagnosis.ts` | What must happen before the model may be asked, when something must. |
| `automationStudioRuntimeDiagnosisResolution` | Value | `packages/fluxiq/src/programs/automation-studio/runtime/recovery/deterministic-diagnosis.ts` | - |
| `AutomationStudioRuntimeDiagnosisResolution` | Type | `packages/fluxiq/src/programs/automation-studio/runtime/recovery/deterministic-diagnosis.ts` | What answers this failure, decided before any provider exists. Four outcomes, and only the last one reaches a model. The first two name work that is already known and must run first; the third names a failure the loop cannot resolve at all, whoever is asked. |
| `AutomationStudioRuntimeEventKind` | Type | `packages/fluxiq/src/programs/automation-studio/storage/project/runtime-stream-store.ts` | - |
| `AutomationStudioRuntimeEventPage` | Type | `packages/fluxiq/src/programs/automation-studio/storage/project/runtime-stream-store.ts` | - |
| `AutomationStudioRuntimeExploration` | Type | `packages/fluxiq/src/programs/automation-studio/runtime/recovery/runtime-exploration.ts` | - |
| `AutomationStudioRuntimeExplorationInput` | Type | `packages/fluxiq/src/programs/automation-studio/runtime/recovery/runtime-exploration.ts` | - |
| `AutomationStudioRuntimeInterventionKind` | Type | `packages/fluxiq/src/programs/automation-studio/model/flow-adaptation.ts` | - |
| `AutomationStudioRuntimeLlmInvocationDecision` | Type | `packages/fluxiq/src/programs/automation-studio/runtime/recovery/llm-invocation.ts` | - |
| `AutomationStudioRuntimeLlmInvocationInput` | Type | `packages/fluxiq/src/programs/automation-studio/runtime/recovery/llm-invocation.ts` | - |
| `AutomationStudioRuntimePatch` | Type | `packages/fluxiq/src/programs/automation-studio/runtime/llm/harness/structured-response.ts` | A runtime patch as a model writes it. `consequences` is what an acting patch says it would lastingly do each time the Flow runs, in Core's classes, `[]` when it only opens, shows or chooses. The schema a model is shown requires it wherever the patch may run, and the recovery's permission gate is asked about it before the patch does. It is optional here because it is read forgivingly: a patch that left it out is recorded as undeclared and does not run, rather than the whole answer being refused, and a proposal-only patch never carries it. |
| `AutomationStudioRuntimePatchExecutionInput` | Type | `packages/fluxiq/src/programs/automation-studio/runtime/live-patch.ts` | - |
| `AutomationStudioRuntimePatchExecutionResult` | Type | `packages/fluxiq/src/programs/automation-studio/runtime/live-patch.ts` | - |
| `AutomationStudioRuntimePatchKind` | Type | `packages/fluxiq/src/programs/automation-studio/runtime/recovery/plan.ts` | - |
| `automationStudioRuntimePatchKindPolicyRefusal` | Value | `packages/fluxiq/src/programs/automation-studio/runtime/recovery/plan.ts` | - |
| `automationStudioRuntimePatchOutputSchema` | Value | `packages/fluxiq/src/programs/automation-studio/runtime/llm/harness/runtime-patch-schema.ts` | - |
| `AutomationStudioRuntimePatchPreflight` | Type | `packages/fluxiq/src/programs/automation-studio/runtime/live-patch.ts` | - |
| `automationStudioRuntimePatchRefusalIsCheckableByExploration` | Value | `packages/fluxiq/src/programs/automation-studio/runtime/recovery/diagnosis-chain.ts` | - |
| `AutomationStudioRuntimePatchRequestDecision` | Type | `packages/fluxiq/src/programs/automation-studio/runtime/recovery/diagnosis-chain.ts` | Whether the second, billed `runtime_patch` call should happen, and -- when it should not -- which rung said so and under which code. |
| `AutomationStudioRuntimePatchSkipCode` | Type | `packages/fluxiq/src/programs/automation-studio/runtime/recovery/diagnosis-chain.ts` | - |
| `AutomationStudioRuntimePatchVerification` | Type | `packages/fluxiq/src/programs/automation-studio/runtime/live-patch.ts` | What a runtime patch's trial proved, as a receipt reads it: a projection of the trial's flow-change verdict (`result.verdict`), which alone decides it. - `verified`: the verdict's first basis, in its canonical order. - `contradicted`: the codes of the checks that failed, comma-separated. - `unverifiable`: why nothing was proved. A changed node that did not finish, evidence nobody could evaluate, a comparison that declared nothing, or no comparison at all. Success is never inferred from the absence of contradicting evidence, and no validation is recorded. - `not_executed`: why the trial did not run the change. `awaitsJudgedRun` (t267) marks the one `unverifiable` case whose evidence is the judged whole run instead: a target override whose trial's verdict is `no_evidence` -- its changed node succeeded, no check failed or was unknown, the trial named where to carry on, and the Flow declared nothing that could prove it, as a Flow built from an instruction declares nothing. The trial still proved nothing, so nothing is recorded for it here; the run carries on through the change, and the judgement of that whole run is what promotes it or not (`service/runtime-adaptation/judged-promotion.ts`). |
| `AutomationStudioRuntimeRecoveryAnnotationInput` | Type | `packages/fluxiq/src/programs/automation-studio/runtime/recovery/annotation/annotate.ts` | - |
| `AutomationStudioRuntimeRecoveryContext` | Type | `packages/fluxiq/src/programs/automation-studio/runtime/recovery/context.ts` | - |
| `AutomationStudioRuntimeRecoveryContextInput` | Type | `packages/fluxiq/src/programs/automation-studio/runtime/recovery/context.ts` | - |
| `AutomationStudioRuntimeRecoveryPatchInput` | Type | `packages/fluxiq/src/programs/automation-studio/runtime/recovery/annotation/patches.ts` | - |
| `AutomationStudioRuntimeRecoveryPatchOutcome` | Type | `packages/fluxiq/src/programs/automation-studio/runtime/recovery/annotation/patches.ts` | - |
| `AutomationStudioRuntimeRecoveryPlan` | Type | `packages/fluxiq/src/programs/automation-studio/runtime/recovery/plan.ts` | - |
| `AutomationStudioRuntimeRecoveryPlanInput` | Type | `packages/fluxiq/src/programs/automation-studio/runtime/recovery/plan.ts` | - |
| `AutomationStudioRuntimeRecoveryPlanStep` | Type | `packages/fluxiq/src/programs/automation-studio/runtime/recovery/plan.ts` | One thing the plan intends, in the order the plan intends it. |
| `AutomationStudioRuntimeRecoveryPorts` | Type | `packages/fluxiq/src/programs/automation-studio/runtime/recovery/annotation/ports.ts` | Everything the runtime recovery path reaches outside itself for. Optional members are written `?: T \| undefined` deliberately: the service holds them as optional fields, and under `exactOptionalPropertyTypes` a bare `?: T` would refuse the field it already has. |
| `automationStudioRuntimeRecoveryRefusedTrace` | Value | `packages/fluxiq/src/programs/automation-studio/runtime/recovery/stages.ts` | - |
| `AutomationStudioRuntimeRecoveryRung` | Type | `packages/fluxiq/src/programs/automation-studio/runtime/recovery/diagnosis-chain.ts` | Which rung of the recovery loop declined, when one did. A code says *why* nothing was repaired; this says *who* decided it, in the loop's own four-stage vocabulary (`stages.ts`). The two together are what a run needs to say instead of falling silent: `plan` + `goal_unachievable` reads as "the plan stopped, because the diagnosis said the step's result can no longer be reached", which is a different thing to answer than `resolution` + `permission_required`. |
| `automationStudioRuntimeRecoveryTrace` | Value | `packages/fluxiq/src/programs/automation-studio/runtime/recovery/stages.ts` | - |
| `AutomationStudioRuntimeRecoveryTraceInput` | Type | `packages/fluxiq/src/programs/automation-studio/runtime/recovery/stages.ts` | - |
| `AutomationStudioRuntimeRunSummary` | Type | `packages/fluxiq/src/programs/automation-studio/storage/file-store.ts` | - |
| `AutomationStudioRuntimeRunSummaryPage` | Type | `packages/fluxiq/src/programs/automation-studio/storage/file-store.ts` | - |
| `AutomationStudioRuntimeSession` | Type | `packages/fluxiq/src/programs/automation-studio/model/runtime.ts` | - |
| `AutomationStudioRuntimeSessionLlm` | Type | `packages/fluxiq/src/programs/automation-studio/runtime/llm/runtime-session-llm.ts` | A run a person asked the model to take part in. |
| `AutomationStudioRuntimeSessionLlmIntent` | Type | `packages/fluxiq/src/programs/automation-studio/runtime/llm/runtime-session-llm.ts` | - |
| `AutomationStudioRuntimeSessionStatus` | Type | `packages/fluxiq/src/programs/automation-studio/model/runtime.ts` | - |
| `AutomationStudioRuntimeSessionVerificationInput` | Type | `packages/fluxiq/src/programs/automation-studio/runtime/result-verification/run-outcome.ts` | - |
| `AutomationStudioRuntimeStartFromCompiledPlan` | Type | `packages/fluxiq/src/programs/automation-studio/storage/project/compiled-plan-store.ts` | - |
| `AutomationStudioRuntimeStreamEvent` | Type | `packages/fluxiq/src/programs/automation-studio/storage/project/runtime-stream-store.ts` | - |
| `AutomationStudioRuntimeStructuredDiagnosis` | Type | `packages/fluxiq/src/programs/automation-studio/runtime/recovery/structured-diagnosis.ts` | - |
| `AutomationStudioRuntimeStructuredDiagnosisInput` | Type | `packages/fluxiq/src/programs/automation-studio/runtime/recovery/structured-diagnosis.ts` | - |
| `AutomationStudioRuntimeSummaryIndex` | Type | `packages/fluxiq/src/programs/automation-studio/storage/file-store.ts` | - |
| `AutomationStudioRuntimeTargetOverrideControl` | Type | `packages/fluxiq/src/programs/automation-studio/runtime/live-patch/refusal-reasons.ts` | The thing an accepted target names, as a person would recognise it: its name exactly as the evidence the model was shown printed it, and one plain word or two for what sort of thing it is, in the domain's own vocabulary. A domain supplies it with an accepted target so a repair that needs permission can say what it would act on. Core carries it only to the permission gate, which withholds a name that never appeared in evidence already shown. |
| `AutomationStudioRuntimeTargetOverrideEvidenceValidation` | Type | `packages/fluxiq/src/programs/automation-studio/runtime/live-patch/refusal-reasons.ts` | - |
| `AutomationStudioRuntimeTargetOverrideFailedAction` | Type | `packages/fluxiq/src/programs/automation-studio/runtime/live-patch/refusal-reasons.ts` | Bounded, domain-neutral identity of the action whose target failed. |
| `AutomationStudioRuntimeTargetOverrideRefusal` | Type | `packages/fluxiq/src/programs/automation-studio/runtime/live-patch/refusal-reasons.ts` | A domain's refusal as Core records it: the status, and the reason only where it is one of Core's. |
| `AutomationStudioRuntimeTargetOverrideRefusalReason` | Type | `packages/fluxiq/src/programs/automation-studio/runtime/live-patch/refusal-reasons.ts` | - |
| `AutomationStudioRuntimeTargetOverrideTarget` | Type | `packages/fluxiq/src/programs/automation-studio/runtime/llm/harness/structured-response.ts` | A repair target, opaque to Core. `handles` is the only part of it Core and a domain agree on: a map from a repairable parameter the domain declared -- one control to re-point, or a list row and its fields for an extraction -- to an opaque handle the domain minted and named in the evidence it issued. Core bounds both sides of that map and reads neither. What a handle points at is the domain's business. Every other key is the domain's own resolution of those handles, in the domain's own vocabulary, written only after the domain has checked the handle against evidence it actually issued. Core carries it and never looks inside, which is what makes this type domain-neutral rather than a browser concept wearing a neutral name: it was `{ selector: string }`, and a non-browser domain had no way to answer it. A model-authored target carries `handles` and nothing else. That is not a convention, it is enforced twice -- `isAutomationStudioModelAuthoredTargetOverrideTarget` at the provider and at output validation, and `additionalProperties: false` in the response schema -- so a locator can never enter through the model, only through a domain that resolved one from its own evidence. |
| `AutomationStudioSafePointAdoption` | Type | `packages/fluxiq/src/programs/automation-studio/storage/project/compiled-plan-store.ts` | - |
| `AutomationStudioSaveProjectUiCacheRequest` | Type | `packages/fluxiq/src/programs/automation-studio/api/contracts/ui-cache.ts` | - |
| `AutomationStudioSaveProjectUiCacheResponse` | Type | `packages/fluxiq/src/programs/automation-studio/api/contracts/ui-cache.ts` | - |
| `automationStudioScaleAssetBatch` | Value | `packages/fluxiq/src/programs/automation-studio/testing/scale-fixtures.ts` | - |
| `AutomationStudioScaleBaseline` | Type | `packages/fluxiq/src/programs/automation-studio/testing/scale-baseline.ts` | - |
| `AutomationStudioScaleBatchOptions` | Type | `packages/fluxiq/src/programs/automation-studio/testing/scale-fixtures.ts` | - |
| `AutomationStudioScaleCertificationEvidence` | Type | `packages/fluxiq/src/programs/automation-studio/testing/scale-certification.ts` | - |
| `AutomationStudioScaleCertificationGate` | Type | `packages/fluxiq/src/programs/automation-studio/testing/scale-certification.ts` | - |
| `AutomationStudioScaleCertificationGateId` | Type | `packages/fluxiq/src/programs/automation-studio/testing/scale-certification.ts` | - |
| `AutomationStudioScaleCertificationInput` | Type | `packages/fluxiq/src/programs/automation-studio/testing/scale-certification.ts` | - |
| `AutomationStudioScaleCertificationMeasurement` | Type | `packages/fluxiq/src/programs/automation-studio/testing/scale-certification.ts` | - |
| `AutomationStudioScaleCertificationReport` | Type | `packages/fluxiq/src/programs/automation-studio/testing/scale-certification.ts` | - |
| `AutomationStudioScaleCertificationStatus` | Type | `packages/fluxiq/src/programs/automation-studio/testing/scale-certification.ts` | - |
| `automationStudioScaleFlowBatch` | Value | `packages/fluxiq/src/programs/automation-studio/testing/scale-fixtures.ts` | - |
| `automationStudioScaleGraphEdgeBatch` | Value | `packages/fluxiq/src/programs/automation-studio/testing/scale-fixtures.ts` | - |
| `automationStudioScaleGraphNodeBatch` | Value | `packages/fluxiq/src/programs/automation-studio/testing/scale-fixtures.ts` | - |
| `automationStudioScaleInstructionBatch` | Value | `packages/fluxiq/src/programs/automation-studio/testing/scale-fixtures.ts` | - |
| `AutomationStudioScaleManifest` | Type | `packages/fluxiq/src/programs/automation-studio/testing/scale-fixtures.ts` | - |
| `AutomationStudioScaleMatrixRun` | Type | `packages/fluxiq/src/programs/automation-studio/testing/scale-certification.ts` | - |
| `AutomationStudioScaleProfile` | Type | `packages/fluxiq/src/programs/automation-studio/testing/scale-fixtures.ts` | - |
| `automationStudioScaleProjectBatch` | Value | `packages/fluxiq/src/programs/automation-studio/testing/scale-fixtures.ts` | - |
| `automationStudioScaleRecordingBatch` | Value | `packages/fluxiq/src/programs/automation-studio/testing/scale-fixtures.ts` | - |
| `automationStudioScaleRecordingEventBatch` | Value | `packages/fluxiq/src/programs/automation-studio/testing/scale-fixtures.ts` | - |
| `automationStudioScaleRunBatch` | Value | `packages/fluxiq/src/programs/automation-studio/testing/scale-fixtures.ts` | - |
| `automationStudioScaleRuntimeEventBatch` | Value | `packages/fluxiq/src/programs/automation-studio/testing/scale-fixtures.ts` | - |
| `automationStudioScaleSubflowBatch` | Value | `packages/fluxiq/src/programs/automation-studio/testing/scale-fixtures.ts` | - |
| `AutomationStudioSchemaBackupContext` | Type | `packages/fluxiq/src/programs/automation-studio/storage/schema-migrations.ts` | - |
| `AutomationStudioSchemaMigration` | Type | `packages/fluxiq/src/programs/automation-studio/storage/schema-migrations.ts` | - |
| `AutomationStudioSchemaMigrationResult` | Type | `packages/fluxiq/src/programs/automation-studio/storage/schema-migrations.ts` | - |
| `AutomationStudioSchemaMigrationRunner` | Class | `packages/fluxiq/src/programs/automation-studio/storage/schema-migrations.ts` | - |
| `AutomationStudioSchemaMigrationRunnerOptions` | Type | `packages/fluxiq/src/programs/automation-studio/storage/schema-migrations.ts` | - |
| `AutomationStudioSchemaState` | Type | `packages/fluxiq/src/programs/automation-studio/storage/schema-migrations.ts` | - |
| `AutomationStudioSchemaVersion` | Type | `packages/fluxiq/src/programs/automation-studio/model/evidence.ts` | - |
| `automationStudioScopeIsFrozen` | Value | `packages/fluxiq/src/programs/automation-studio/runtime/training-modes.ts` | - |
| `automationStudioScreenedAuthoredState` | Value | `packages/fluxiq/src/programs/automation-studio/runtime/recovery/repair-context/authored-state-screen.ts` | - |
| `AutomationStudioScreenedAuthoredState` | Type | `packages/fluxiq/src/programs/automation-studio/runtime/recovery/repair-context/authored-state-screen.ts` | An authored document value as the repair is shown it, with what did not survive named. |
| `automationStudioScreenedNodeParameters` | Value | `packages/fluxiq/src/programs/automation-studio/runtime/recovery/repair-context/parameter-screen.ts` | - |
| `AutomationStudioScreenedParameters` | Type | `packages/fluxiq/src/programs/automation-studio/runtime/recovery/repair-context/parameter-screen.ts` | The parameters a step ran with, as the repair is shown them. |
| `automationStudioSecretNamedKey` | Value | `packages/fluxiq/src/programs/automation-studio/runtime/loop-limits/secret-named-key.ts` | - |
| `AutomationStudioService` | Class | `packages/fluxiq/src/programs/automation-studio/runtime/service.ts` | - |
| `AutomationStudioServiceOptions` | Type | `packages/fluxiq/src/programs/automation-studio/runtime/service.ts` | - |
| `AutomationStudioSessionKeyPorts` | Type | `packages/fluxiq/src/programs/automation-studio/runtime/llm/deepseek/session-key.ts` | The Secret Keys operations releasing a person's key needs. |
| `AutomationStudioSnapshot` | Type | `packages/fluxiq/src/programs/automation-studio/api/contracts/project.ts` | - |
| `AutomationStudioSoakEvidence` | Type | `packages/fluxiq/src/programs/automation-studio/testing/scale-certification.ts` | - |
| `automationStudioSourceNodeRoot` | Object | `packages/fluxiq/src/programs/automation-studio/nodes/layout.ts` | - |
| `AutomationStudioSqlAdaptationPolicy` | Type | `packages/fluxiq/src/programs/automation-studio/storage/project/flow-resource-repository.ts` | - |
| `AutomationStudioSqlExecutor` | Type | `packages/fluxiq/src/programs/automation-studio/storage/project/database.ts` | - |
| `AutomationStudioSqlFlowDetail` | Type | `packages/fluxiq/src/programs/automation-studio/storage/project/flow-resource-repository.ts` | - |
| `AutomationStudioSqlFlowError` | Type | `packages/fluxiq/src/programs/automation-studio/storage/project/flow-resource-repository.ts` | - |
| `AutomationStudioSqlFlowPort` | Type | `packages/fluxiq/src/programs/automation-studio/storage/project/flow-resource-repository.ts` | - |
| `AutomationStudioSqlFlowRecord` | Type | `packages/fluxiq/src/programs/automation-studio/storage/project/flow-resource-repository.ts` | - |
| `AutomationStudioSqlFlowSettings` | Type | `packages/fluxiq/src/programs/automation-studio/storage/project/flow-resource-repository.ts` | - |
| `AutomationStudioSqlFlowVariable` | Type | `packages/fluxiq/src/programs/automation-studio/storage/project/flow-resource-repository.ts` | - |
| `AutomationStudioSqlInstruction` | Type | `packages/fluxiq/src/programs/automation-studio/storage/project/flow-resource-repository.ts` | - |
| `AutomationStudioSqlInstructionBinding` | Type | `packages/fluxiq/src/programs/automation-studio/storage/project/flow-resource-repository.ts` | - |
| `AutomationStudioSqlInstructionScope` | Type | `packages/fluxiq/src/programs/automation-studio/storage/project/flow-resource-repository.ts` | - |
| `AutomationStudioSqlInstructionSummary` | Type | `packages/fluxiq/src/programs/automation-studio/storage/project/flow-resource-repository.ts` | - |
| `AutomationStudioSqliteUiCacheStore` | Class | `packages/fluxiq/src/programs/automation-studio/storage/project/ui-cache-store.ts` | - |
| `AutomationStudioSqlRouter` | Type | `packages/fluxiq/src/programs/automation-studio/storage/project/flow-resource-repository.ts` | - |
| `AutomationStudioSqlRouterGroup` | Type | `packages/fluxiq/src/programs/automation-studio/storage/project/flow-resource-repository.ts` | - |
| `AutomationStudioSqlRouterRoute` | Type | `packages/fluxiq/src/programs/automation-studio/storage/project/flow-resource-repository.ts` | - |
| `AutomationStudioSqlRouterRoutePage` | Type | `packages/fluxiq/src/programs/automation-studio/storage/project/flow-resource-repository.ts` | - |
| `AutomationStudioSqlRouterSummary` | Type | `packages/fluxiq/src/programs/automation-studio/storage/project/flow-resource-repository.ts` | - |
| `AutomationStudioSqlRouterTargetReference` | Type | `packages/fluxiq/src/programs/automation-studio/storage/project/flow-resource-repository.ts` | - |
| `AutomationStudioSqlRouterTargetReferenceBatch` | Type | `packages/fluxiq/src/programs/automation-studio/storage/project/flow-resource-repository.ts` | - |
| `AutomationStudioSqlRunResult` | Type | `packages/fluxiq/src/programs/automation-studio/storage/project/database.ts` | - |
| `AutomationStudioSqlSubflow` | Type | `packages/fluxiq/src/programs/automation-studio/storage/project/flow-resource-repository.ts` | - |
| `AutomationStudioSqlSubflowCategory` | Type | `packages/fluxiq/src/programs/automation-studio/storage/project/flow-resource-repository.ts` | - |
| `AutomationStudioSqlSubflowTargetPage` | Type | `packages/fluxiq/src/programs/automation-studio/storage/project/flow-resource-repository.ts` | - |
| `AutomationStudioStabilityMetrics` | Type | `packages/fluxiq/src/programs/automation-studio/runtime/training-modes.ts` | - |
| `AutomationStudioStartNodeChoice` | Type | `packages/fluxiq/src/programs/automation-studio/runtime/executor/start-node.ts` | Where a run of a graph begins when its caller names no node, or why it cannot begin. `declared` and `root` carry the node. Every other status carries the message a run fails with, and no node. |
| `AutomationStudioStatePathRecord` | Type | `packages/fluxiq/src/programs/automation-studio/storage/project/runtime-stream-store.ts` | - |
| `AutomationStudioStateRouteDecision` | Type | `packages/fluxiq/src/programs/automation-studio/runtime/executor/state-routing/decision.ts` | What a run does with a step that cannot run. - `declared`: the Flow itself says where the page is -- a sometimes-present step's way on (`step-skip/absent-step.ts`), taken with no observation. - `routed`: the page already shows the failing step's own effect, and the run goes on along its success `edge` to `node` (record outcome `effect_holds`); or the page matched `node`'s recorded pre-state, and the run goes on there (record outcome `routed`, with its `closeness`). - `stopped`: the match was one return too many to the same node without progress; the run ends failed with `message`. - `none`: no way on was found; the recovery ladder runs exactly as before. |
| `AutomationStudioStateRouteDirection` | Type | `packages/fluxiq/src/programs/automation-studio/runtime/executor/contracts.ts` | Which way a state route went from the step that could not run: ahead of it in the graph, or only behind it. |
| `AutomationStudioStateRoutingRecord` | Type | `packages/fluxiq/src/programs/automation-studio/runtime/executor/contracts.ts` | What state routing decided for one step that could not run. - `effect_holds`: the page already shows what the step itself does (its recorded effect, per the host), so the run went on along the step's own success edge to `toNodeId`, forward. `matched` is 0: no pre-state was compared. - `routed`: the page matched `toNodeId`'s recorded pre-state and the run went on there. - `no_match`: the page was read and matched no eligible node. - `unobserved`: the host could not read or sign the page. - `no_pre_states`: no other node recorded a pre-state, so nothing was read. - `guard_stopped`: the match was a return to a node without progress past the limit. `candidates` counts the other nodes with a recorded pre-state; `matched` the ones whose pre-state held and that were eligible to run. |
| `AutomationStudioStateSnapshotRecord` | Type | `packages/fluxiq/src/programs/automation-studio/storage/project/runtime-stream-store.ts` | - |
| `AutomationStudioStateVisualizerDefinition` | Type | `packages/fluxiq/src/programs/automation-studio/nodes/importer-sdk.ts` | - |
| `automationStudioStepFailureReauthorBrief` | Value | `packages/fluxiq/src/programs/automation-studio/runtime/recovery/refuted-result/step-failure-brief.ts` | - |
| `automationStudioStepFailureReauthorDecision` | Value | `packages/fluxiq/src/programs/automation-studio/runtime/recovery/refuted-result/step-failure-decision.ts` | - |
| `AutomationStudioStepFailureReauthorDecision` | Type | `packages/fluxiq/src/programs/automation-studio/runtime/recovery/refuted-result/step-failure-decision.ts` | - |
| `AutomationStudioStepFailureReauthorRefusal` | Type | `packages/fluxiq/src/programs/automation-studio/runtime/recovery/refuted-result/step-failure-decision.ts` | Why a failed run was not re-authored, in codes a reader can key on. |
| `automationStudioStepFailureTarget` | Value | `packages/fluxiq/src/programs/automation-studio/runtime/recovery/refuted-result/step-failure-target.ts` | - |
| `automationStudioStepParametersSection` | Value | `packages/fluxiq/src/programs/automation-studio/runtime/recovery/repair-context/step-parameters.ts` | - |
| `automationStudioStopMessage` | Value | `packages/fluxiq/src/programs/automation-studio/runtime/executor/defensive/lasting-act.ts` | - |
| `AutomationStudioStorageOutboxEntry` | Type | `packages/fluxiq/src/programs/automation-studio/storage/project/administration.ts` | - |
| `AutomationStudioStorageOutboxRepository` | Class | `packages/fluxiq/src/programs/automation-studio/storage/project/administration.ts` | - |
| `AutomationStudioStorageOutboxStatus` | Type | `packages/fluxiq/src/programs/automation-studio/storage/project/administration.ts` | - |
| `AutomationStudioStoredAdaptationArtifactKind` | Type | `packages/fluxiq/src/programs/automation-studio/storage/project/adaptation-store.ts` | - |
| `AutomationStudioStoredAdaptationDetail` | Type | `packages/fluxiq/src/programs/automation-studio/storage/project/adaptation-store.ts` | - |
| `AutomationStudioStoredAdaptationStatus` | Type | `packages/fluxiq/src/programs/automation-studio/storage/project/adaptation-store.ts` | - |
| `AutomationStudioStructuredDiagnosisModelField` | Type | `packages/fluxiq/src/programs/automation-studio/runtime/recovery/structured-diagnosis.ts` | - |
| `AutomationStudioStructuredDiagnosisSummary` | Type | `packages/fluxiq/src/programs/automation-studio/runtime/recovery/structured-diagnosis.ts` | The counts-and-verdicts record written onto a run. Carries no model prose. |
| `AutomationStudioSubflowExecutionRecord` | Type | `packages/fluxiq/src/programs/automation-studio/model/flow-adaptation.ts` | - |
| `AutomationStudioSubflowRole` | Type | `packages/fluxiq/src/programs/automation-studio/model/flow-adaptation.ts` | - |
| `AutomationStudioSubflowSummary` | Type | `packages/fluxiq/src/programs/automation-studio/runtime/service/indexes/types.ts` | - |
| `AutomationStudioSubflowSummaryPage` | Type | `packages/fluxiq/src/programs/automation-studio/runtime/service/summaries/types.ts` | - |
| `AutomationStudioSubflowTargetPage` | Type | `packages/fluxiq/src/programs/automation-studio/runtime/service/flow-map-routes/contracts.ts` | - |
| `AutomationStudioTargetResolverDefinition` | Type | `packages/fluxiq/src/programs/automation-studio/nodes/importer-sdk.ts` | - |
| `AutomationStudioTargetResolverImplementation` | Type | `packages/fluxiq/src/programs/automation-studio/nodes/importer-sdk.ts` | - |
| `AutomationStudioTaskArtifact` | Type | `packages/fluxiq/src/programs/automation-studio/model/artifacts.ts` | - |
| `automationStudioThrownErrorText` | Value | `packages/fluxiq/src/programs/automation-studio/runtime/executor/defensive/thrown-error.ts` | - |
| `automationStudioToolResultNeedsPerson` | Value | `packages/fluxiq/src/programs/automation-studio/runtime/parking/person-needed-tool-calls.ts` | - |
| `automationStudioTraceSummary` | Value | `packages/fluxiq/src/programs/automation-studio/runtime/executor/trace-summary.ts` | - |
| `AutomationStudioTrainingAdaptationSummary` | Type | `packages/fluxiq/src/programs/automation-studio/runtime/training-modes.ts` | - |
| `AutomationStudioTrainingBudgetControls` | Type | `packages/fluxiq/src/programs/automation-studio/runtime/training-modes.ts` | - |
| `AutomationStudioTrainingBudgetDecision` | Type | `packages/fluxiq/src/programs/automation-studio/runtime/training-modes.ts` | - |
| `AutomationStudioTrainingBudgetState` | Type | `packages/fluxiq/src/programs/automation-studio/runtime/training-modes.ts` | - |
| `AutomationStudioTrainingModeBehavior` | Type | `packages/fluxiq/src/programs/automation-studio/runtime/training-modes.ts` | - |
| `AutomationStudioTrainingModeSettings` | Type | `packages/fluxiq/src/programs/automation-studio/runtime/training-modes.ts` | - |
| `AutomationStudioTrainingStatus` | Type | `packages/fluxiq/src/programs/automation-studio/runtime/training-modes.ts` | - |
| `automationStudioTransientStatusEffect` | Value | `packages/fluxiq/src/programs/automation-studio/runtime/executor/defensive/transient-status.ts` | - |
| `AutomationStudioTransitionComparison` | Type | `packages/fluxiq/src/programs/automation-studio/runtime/executor/contracts.ts` | - |
| `AutomationStudioTransitionComparisonStatus` | Type | `packages/fluxiq/src/programs/automation-studio/runtime/executor/contracts.ts` | - |
| `AutomationStudioUiCacheCompactResult` | Type | `packages/fluxiq/src/programs/automation-studio/storage/project/ui-cache-store.ts` | - |
| `AutomationStudioUiCacheDeleteInput` | Type | `packages/fluxiq/src/programs/automation-studio/storage/project/ui-cache-store.ts` | - |
| `AutomationStudioUiCacheEntry` | Type | `packages/fluxiq/src/programs/automation-studio/storage/project/ui-cache-store.ts` | - |
| `AutomationStudioUiCachePutEntry` | Type | `packages/fluxiq/src/programs/automation-studio/storage/project/ui-cache-store.ts` | - |
| `AutomationStudioUiCacheStats` | Type | `packages/fluxiq/src/programs/automation-studio/storage/project/ui-cache-store.ts` | - |
| `AutomationStudioUiCacheStore` | Interface | `packages/fluxiq/src/programs/automation-studio/storage/project/ui-cache-store.ts` | - |
| `AutomationStudioUiCacheStoreOptions` | Type | `packages/fluxiq/src/programs/automation-studio/storage/project/ui-cache-store.ts` | - |
| `AutomationStudioUiCacheValue` | Type | `packages/fluxiq/src/programs/automation-studio/storage/project/ui-cache-store.ts` | - |
| `AutomationStudioUnattendedRepairClause` | Type | `packages/fluxiq/src/programs/automation-studio/runtime/result-check-authorization/contracts.ts` | What the person authorized an unattended *repair* to do, when they authorized one at all. Absent means checking only, which is what every authorization written before this existed meant and what every stored one still reads back as. A permission to spend never defaults, so this is opt-in exactly as the authorization itself is. |
| `AutomationStudioUnattendedRepairRedemption` | Type | `packages/fluxiq/src/programs/automation-studio/runtime/result-check-authorization/repair.ts` | What redeeming the repair clause produced: a bounded provider request, or the stated reason there is none. |
| `AutomationStudioUncertaintySummary` | Type | `packages/fluxiq/src/programs/automation-studio/runtime/training-modes.ts` | - |
| `automationStudioUnresolvedFailedAttempt` | Value | `packages/fluxiq/src/programs/automation-studio/runtime/recovery/unresolved-failed-attempt.ts` | - |
| `AutomationStudioV2CutoverState` | Type | `packages/fluxiq/src/programs/automation-studio/storage/project/migration-cutover.ts` | - |
| `AutomationStudioV2FeatureState` | Type | `packages/fluxiq/src/programs/automation-studio/storage/project/migration-cutover.ts` | - |
| `AutomationStudioValidatedFlowBootstrapPlan` | Type | `packages/fluxiq/src/programs/automation-studio/runtime/flow-bootstrap/plan/contracts.ts` | - |
| `AutomationStudioValidationIssue` | Type | `packages/fluxiq/src/programs/automation-studio/model/validation/issue.ts` | - |
| `AutomationStudioValidationResult` | Type | `packages/fluxiq/src/programs/automation-studio/model/validation/issue.ts` | - |
| `automationStudioValidationResultKind` | Value | `packages/fluxiq/src/programs/automation-studio/runtime/flow-change/confidence.ts` | - |
| `AutomationStudioValidationSeverity` | Type | `packages/fluxiq/src/programs/automation-studio/model/validation/issue.ts` | - |
| `AutomationStudioVersionedFlowDocument` | Type | `packages/fluxiq/src/programs/automation-studio/runtime/flow-version/contracts.ts` | The shape this module reads a version off: any Flow document or artifact. |
| `AutomationStudioViewState` | Type | `packages/fluxiq/src/programs/automation-studio/ui/contracts.ts` | - |
| `AutomationStudioWalCheckpointMode` | Type | `packages/fluxiq/src/programs/automation-studio/storage/project/database.ts` | - |
| `AutomationStudioWalCheckpointResult` | Type | `packages/fluxiq/src/programs/automation-studio/storage/project/database.ts` | - |
| `automationStudioWithoutLocators` | Value | `packages/fluxiq/src/programs/automation-studio/runtime/llm/harness/locator-text.ts` | - |
| `AutomationStudioWorkspacePreference` | Type | `packages/fluxiq/src/programs/automation-studio/storage/project/hierarchy/repository.ts` | - |
| `AutomationStudioWorkspaceSummary` | Type | `packages/fluxiq/src/programs/automation-studio/storage/file-store.ts` | - |
| `AutomationStudioWriteProjectObjectAssetInput` | Type | `packages/fluxiq/src/programs/automation-studio/runtime/service/object-documents.ts` | - |
| `AutomationStudioWriteProjectObjectAssetResult` | Type | `packages/fluxiq/src/programs/automation-studio/runtime/service/object-documents.ts` | - |
| `automationStudioZeroProviderGate` | Value | `packages/fluxiq/src/programs/automation-studio/runtime/result-verification/zero-provider-run.ts` | - |
| `AutomationTask` | Type | `packages/fluxiq/src/programs/automation-studio/types.ts` | - |
| `BACKGROUND_TASKS_ENDPOINTS` | Object | `packages/fluxiq/src/programs/background-tasks/api/contracts.ts` | - |
| `BACKGROUND_TASKS_PROGRAM` | Object | `packages/fluxiq/src/programs/background-tasks/metadata.ts` | - |
| `BackgroundTaskDefinition` | Type | `packages/fluxiq/src/programs/background-tasks/types.ts` | - |
| `BackgroundTaskDetailRequest` | Type | `packages/fluxiq/src/programs/background-tasks/api/contracts.ts` | - |
| `BackgroundTaskHandler` | Type | `packages/fluxiq/src/programs/background-tasks/runtime/service.ts` | - |
| `BackgroundTaskRun` | Type | `packages/fluxiq/src/programs/background-tasks/types.ts` | - |
| `BackgroundTasksPanel` | Type | `packages/fluxiq/src/programs/background-tasks/ui/contracts.ts` | - |
| `BackgroundTasksService` | Class | `packages/fluxiq/src/programs/background-tasks/runtime/service.ts` | - |
| `BackgroundTasksSnapshot` | Type | `packages/fluxiq/src/programs/background-tasks/types.ts` | - |
| `BackgroundTasksSnapshotResponse` | Type | `packages/fluxiq/src/programs/background-tasks/api/contracts.ts` | - |
| `BackgroundTasksStore` | Type | `packages/fluxiq/src/programs/background-tasks/storage/contracts.ts` | - |
| `BackgroundTaskStatus` | Type | `packages/fluxiq/src/programs/background-tasks/types.ts` | - |
| `BackgroundTasksViewState` | Type | `packages/fluxiq/src/programs/background-tasks/ui/contracts.ts` | - |
| `behaviorForAutomationStudioTrainingMode` | Value | `packages/fluxiq/src/programs/automation-studio/runtime/training-modes.ts` | - |
| `bestElementFingerprintCandidate` | Value | `packages/fluxiq/src/programs/automation-studio/fingerprinting/element-fingerprint.ts` | - |
| `bindAutomationStudioActivityRun` | Value | `packages/fluxiq/src/programs/automation-studio/runtime/activity/bind.ts` | - |
| `bootstrapAdaptationAsFlowAdaptation` | Value | `packages/fluxiq/src/programs/automation-studio/runtime/flow-bootstrap/review-projection.ts` | - |
| `boundedAutomationStudioActivity` | Value | `packages/fluxiq/src/programs/automation-studio/runtime/activity/bounded.ts` | - |
| `buildAutomationStudioFlowBootstrapContext` | Value | `packages/fluxiq/src/programs/automation-studio/runtime/flow-bootstrap/plan/catalog.ts` | - |
| `buildAutomationStudioFlowBootstrapRoutingContext` | Value | `packages/fluxiq/src/programs/automation-studio/runtime/flow-bootstrap/plan/routing-context.ts` | - |
| `buildAutomationStudioFlowFromConversation` | Value | `packages/fluxiq/src/programs/automation-studio/runtime/conversations/commands/build.ts` | - |
| `buildAutomationStudioLegacyMigrationOperations` | Value | `packages/fluxiq/src/programs/automation-studio/storage/project/migration-cutover.ts` | - |
| `buildAutomationStudioLlmEvidenceLoopDecisionSchema` | Value | `packages/fluxiq/src/programs/automation-studio/runtime/llm/evidence-loop-decision.ts` | - |
| `buildAutomationStudioRecoveryTrace` | Value | `packages/fluxiq/src/programs/automation-studio/runtime/recovery/trace.ts` | - |
| `buildAutomationStudioRuntimeDeterministicDiagnosis` | Value | `packages/fluxiq/src/programs/automation-studio/runtime/recovery/deterministic-diagnosis.ts` | - |
| `buildAutomationStudioRuntimeRecoveryContext` | Value | `packages/fluxiq/src/programs/automation-studio/runtime/recovery/context.ts` | - |
| `buildAutomationStudioRuntimeStructuredDiagnosis` | Value | `packages/fluxiq/src/programs/automation-studio/runtime/recovery/structured-diagnosis.ts` | - |
| `buildProgramDirectory` | Value | `packages/fluxiq/src/programs/_shared/catalog.ts` | - |
| `buildSignalRegistryFromSchemas` | Value | `packages/fluxiq/src/programs/automation-studio/model/signal-registry.ts` | - |
| `builtinAutomationNodeDefinitions` | Object | `packages/fluxiq/src/programs/automation-studio/nodes/registry.ts` | - |
| `builtinAutomationStudioHarnessOptions` | Value | `packages/fluxiq/src/programs/automation-studio/runtime/llm/harness-options/builtin.ts` | - |
| `candidatesFromStateSnapshot` | Value | `packages/fluxiq/src/programs/automation-studio/fingerprinting/element-fingerprint.ts` | - |
| `canonicalArtifactIdentity` | Value | `packages/fluxiq/src/programs/automation-studio/storage/ids.ts` | - |
| `CanonicalAuthorityOptions` | Type | `packages/fluxiq/src/programs/automation-studio/storage/canonical-authority/contracts.ts` | - |
| `CanonicalAutomationStudioArtifact` | Type | `packages/fluxiq/src/programs/automation-studio/storage/ids.ts` | - |
| `CanonicalAutomationStudioArtifactKind` | Type | `packages/fluxiq/src/programs/automation-studio/storage/ids.ts` | - |
| `CanonicalAutomationStudioRepositories` | Type | `packages/fluxiq/src/programs/automation-studio/storage/contracts.ts` | - |
| `canonicalAutomationStudioSQLiteFactoryRoot` | Value | `packages/fluxiq/src/programs/automation-studio/storage/sqlite-repository.ts` | - |
| `CanonicalAutomationStudioSQLiteOptions` | Type | `packages/fluxiq/src/programs/automation-studio/storage/contracts.ts` | - |
| `canonicalBuiltinAutomationNodeDefinitions` | Object | `packages/fluxiq/src/programs/automation-studio/nodes/canonical-registry.ts` | - |
| `CaptureClientSnapshotRequest` | Type | `packages/fluxiq/src/programs/automation-studio/api/contracts/client.ts` | - |
| `checkAutomationStudioFlowBootstrapAnswersInstruction` | Value | `packages/fluxiq/src/programs/automation-studio/runtime/flow-bootstrap/answerability/check.ts` | - |
| `checkAutomationStudioFlowBootstrapCompletion` | Value | `packages/fluxiq/src/programs/automation-studio/runtime/llm/harness-options/bootstrap-completion.ts` | - |
| `checkAutomationStudioFlowBootstrapReachesStartLocation` | Value | `packages/fluxiq/src/programs/automation-studio/runtime/flow-bootstrap/reachability/check.ts` | - |
| `checkAutomationStudioInstructedActPermissions` | Value | `packages/fluxiq/src/programs/automation-studio/runtime/flow-bootstrap/instructed-acts/permission.ts` | - |
| `checkAutomationStudioInstructedActs` | Value | `packages/fluxiq/src/programs/automation-studio/runtime/flow-bootstrap/instructed-acts/check.ts` | - |
| `checkAutomationStudioInstructedActsOptionalOnly` | Value | `packages/fluxiq/src/programs/automation-studio/runtime/flow-bootstrap/instructed-acts/optional-only.ts` | - |
| `CheckpointPolicy` | Type | `packages/fluxiq/src/programs/automation-studio/normalization/contracts.ts` | - |
| `chooseAutomationStudioRecovery` | Value | `packages/fluxiq/src/programs/automation-studio/runtime/executor/recovery-ladder.ts` | - |
| `chooseAutomationStudioStartNode` | Value | `packages/fluxiq/src/programs/automation-studio/runtime/executor/start-node.ts` | - |
| `chooseNextEdge` | Value | `packages/fluxiq/src/engine/index.ts` | - |
| `classifyAutomationStudioAdaptiveFailure` | Value | `packages/fluxiq/src/programs/automation-studio/runtime/adaptive-orchestrator.ts` | - |
| `clearFluxIQPerformanceMetrics` | Value | `packages/fluxiq/src/programs/_shared/performance-metrics.ts` | - |
| `CLIENT_GATEWAY_ACTIVITY_CAPABILITY_ID` | Object | `packages/contracts/src/client-gateway.ts` | The capability a client advertises to receive `server.activity`. Core sends the activity stream only to ready sessions that declared it. |
| `CLIENT_GATEWAY_ACTIVITY_RESOLUTIONS` | Object | `packages/contracts/src/client-gateway.ts` | How a wait on the person ended, on the `ask` row that says so: - `answered`: the person answered (a robot check's Continue, a choice, words); - `allowed`: the person granted a permission ask; - `waited_out`: a check that clears by itself cleared while Core waited; - `declined`: the person refused, or pressed Stop at a robot check; - `timed_out`: nobody answered in time; - `cancelled`: the work stopped before anyone answered -- it was cancelled or failed while it waited, or the question could no longer be read. |
| `CLIENT_GATEWAY_PROTOCOL_VERSION` | Object | `packages/contracts/src/client-gateway.ts` | - |
| `ClientGatewayActionCommand` | Type | `packages/contracts/src/client-gateway.ts` | - |
| `ClientGatewayActionResponse` | Type | `packages/contracts/src/client-gateway.ts` | - |
| `ClientGatewayActionResult` | Type | `packages/contracts/src/client-gateway.ts` | - |
| `ClientGatewayActivity` | Type | `packages/contracts/src/client-gateway.ts` | One activity event: the current status of one unit of work (a build or a run) plus an optional detail row for the chat stream. Bounded, and content-free beyond what the person's own panel already shows: labels and titles are Core's own sentences, the actions a step's own input names, tool and node ids, and authored step labels; never raw evidence a tool gathered, tokens or secrets. A `thought` row's `text` is the model's own stated reason for that step (what it does next, on what, and why) or its diagnosis or verdict, whitespace-collapsed, with token-shaped runs hidden, and bounded (240 characters for a decision's reason). Core truncates `label` to 160 characters, `detail.title` to 160 and `detail.text` to 1,000. A wait on the person is one `ask` row pair for one card. The wait opens as `phase: "waiting_permission"`, `detail: { kind: "ask", ref: <askId>, status: "started" }`. When it is settled, Core sends one more `ask` row for the same unit of work with the same `ref` and `title`, the phase the work returns to, `status` `succeeded` (answered, allowed, waited out) or `failed` (declined, timed out, cancelled), `resolution`, and `text`, a sentence such as "You pressed Continue.". A client marks the card from that row alone and never infers the answer from later events. Every wait Core announced gets that row, including one whose work stopped first (`cancelled`); a wait Core never announced is never resolved. A run parked durably is still waiting until it is resumed. |
| `ClientGatewayActivityPhase` | Type | `packages/contracts/src/client-gateway.ts` | What FluxIQ is doing now. Each value is set only by a real Core event. |
| `ClientGatewayActivityResolution` | Type | `packages/contracts/src/client-gateway.ts` | - |
| `ClientGatewayAppendRecordingEntryRequest` | Type | `packages/contracts/src/client-gateway.ts` | - |
| `ClientGatewayAuditEntry` | Type | `packages/contracts/src/client-gateway.ts` | - |
| `ClientGatewayCapability` | Type | `packages/contracts/src/client-gateway.ts` | - |
| `ClientGatewayClientHello` | Type | `packages/contracts/src/client-gateway.ts` | - |
| `ClientGatewayClientMessage` | Type | `packages/contracts/src/client-gateway.ts` | - |
| `ClientGatewayClientType` | Type | `packages/contracts/src/client-gateway.ts` | - |
| `ClientGatewayCommandContext` | Class | `packages/fluxiq/src/client-gateway/service/command-ledger/context.ts` | Opaque server capability. JSON, prototypes and copied fields cannot establish issuance. |
| `ClientGatewayCommandLedgerLease` | Type | `packages/fluxiq/src/client-gateway/service/command-ledger/contracts.ts` | - |
| `ClientGatewayDurableActionOptions` | Type | `packages/fluxiq/src/client-gateway/service/command-ledger/contracts.ts` | - |
| `ClientGatewayDurableActionResponse` | Type | `packages/fluxiq/src/client-gateway/service/command-ledger/contracts.ts` | - |
| `ClientGatewayEnvelope` | Type | `packages/contracts/src/client-gateway.ts` | - |
| `ClientGatewayEvent` | Type | `packages/contracts/src/client-gateway.ts` | - |
| `ClientGatewayEventHandler` | Type | `packages/contracts/src/client-gateway.ts` | - |
| `ClientGatewayItemKind` | Type | `packages/fluxiq/src/client-gateway/service/types.ts` | - |
| `ClientGatewayPairingChallenge` | Type | `packages/contracts/src/client-gateway.ts` | - |
| `ClientGatewayRecordingEvent` | Type | `packages/contracts/src/client-gateway.ts` | - |
| `ClientGatewayRequiredCommandContext` | Class | `packages/fluxiq/src/client-gateway/service/command-ledger/required-context.ts` | Registration validation and STOP only; the real resolver still enforces live ownership/storage. |
| `ClientGatewayRuntimeTransport` | Class | `packages/fluxiq/src/runtime/client-gateway-transport.ts` | - |
| `ClientGatewayRuntimeTransportOptions` | Type | `packages/fluxiq/src/runtime/client-gateway-transport.ts` | - |
| `ClientGatewayServerMessage` | Type | `packages/contracts/src/client-gateway.ts` | - |
| `ClientGatewayService` | Class | `packages/fluxiq/src/client-gateway/service.ts` | The client gateway: pairing, durable client trust, session lifecycle, and the command channel to a paired client. This class is a facade. It holds no gateway state of its own; each method forwards to the collaborator under `service/` that owns the state it touches. Its public surface is the gateway contract every program imports, so a method is added or removed here only when that contract changes — the collaborators behind it can be reshaped freely. |
| `ClientGatewayServiceOptions` | Type | `packages/fluxiq/src/client-gateway/service/types.ts` | Construction options for `ClientGatewayService`. |
| `ClientGatewaySession` | Type | `packages/contracts/src/client-gateway.ts` | - |
| `ClientGatewaySessionStatus` | Type | `packages/contracts/src/client-gateway.ts` | - |
| `ClientGatewaySnapshot` | Type | `packages/contracts/src/client-gateway.ts` | - |
| `ClientGatewaySnapshotView` | Type | `packages/contracts/src/client-gateway.ts` | - |
| `ClientGatewaySocket` | Type | `packages/contracts/src/client-gateway.ts` | - |
| `ClientGatewayStartRecordingRequest` | Type | `packages/contracts/src/client-gateway.ts` | - |
| `ClientGatewayStateUpdate` | Type | `packages/contracts/src/client-gateway.ts` | - |
| `ClientGatewayStopRecordingRequest` | Type | `packages/contracts/src/client-gateway.ts` | - |
| `ClientGatewaySummaryItem` | Type | `packages/fluxiq/src/client-gateway/service/types.ts` | - |
| `ClientGatewaySummaryPage` | Type | `packages/fluxiq/src/client-gateway/service/types.ts` | - |
| `ClientGatewayTrustedClient` | Type | `packages/contracts/src/client-gateway.ts` | - |
| `ClientGatewayTrustedClientStore` | Type | `packages/fluxiq/src/client-gateway/service/types.ts` | Durable store the gateway reads trusted clients from and writes them back to. |
| `ClientGatewayTrustedClientView` | Type | `packages/contracts/src/client-gateway.ts` | - |
| `ClientGatewayUnknownPayload` | Type | `packages/contracts/src/client-gateway.ts` | - |
| `ClientRecordingContext` | Type | `packages/fluxiq/src/programs/automation-studio/client-gateway/bridge.ts` | - |
| `ClientRecordingContextProvider` | Type | `packages/fluxiq/src/programs/automation-studio/client-gateway/bridge.ts` | - |
| `Clock` | Type | `packages/fluxiq/src/core/index.ts` | - |
| `compactAutomationStudioAdaptiveFailure` | Value | `packages/fluxiq/src/programs/automation-studio/runtime/adaptive-orchestrator.ts` | - |
| `ComparatorDefinition` | Type | `packages/fluxiq/src/programs/automation-studio/model/signals.ts` | - |
| `comparatorForStateType` | Value | `packages/fluxiq/src/programs/automation-studio/model/signal-registry.ts` | - |
| `compareAutomationStudioHybridRead` | Value | `packages/fluxiq/src/programs/automation-studio/storage/project/migration-cutover.ts` | - |
| `compareAutomationStudioTransition` | Value | `packages/fluxiq/src/programs/automation-studio/runtime/executor/transition-comparison.ts` | - |
| `compileAutomationStudioPlan` | Value | `packages/fluxiq/src/programs/automation-studio/runtime/compiled-plan.ts` | - |
| `CompileAutomationStudioPlanInput` | Type | `packages/fluxiq/src/programs/automation-studio/runtime/compiled-plan.ts` | - |
| `compileAutomationStudioRegions` | Value | `packages/fluxiq/src/programs/automation-studio/runtime/region-compiler.ts` | - |
| `compileAutomationStudioRouterPlan` | Value | `packages/fluxiq/src/programs/automation-studio/runtime/router-runtime.ts` | - |
| `compiledPlanToFlowDocument` | Value | `packages/fluxiq/src/programs/automation-studio/runtime/compiled-plan.ts` | - |
| `compileFlowDefinition` | Value | `packages/fluxiq/src/programs/automation-studio/dsl/compiler.ts` | - |
| `compileFlowSource` | Value | `packages/fluxiq/src/programs/automation-studio/dsl/source.ts` | - |
| `CompleteComputeCommandRequest` | Type | `packages/fluxiq/src/programs/compute-control/api/contracts.ts` | - |
| `ComponentDefinition` | Type | `packages/fluxiq/src/components/index.ts` | - |
| `ComponentParamSpec` | Type | `packages/fluxiq/src/components/index.ts` | - |
| `ComponentRegistry` | Class | `packages/fluxiq/src/components/index.ts` | - |
| `ComponentSpec` | Type | `packages/fluxiq/src/components/index.ts` | - |
| `compositeNodeDefinitionId` | Value | `packages/fluxiq/src/programs/automation-studio/model/composites.ts` | - |
| `COMPUTE_CONTROL_ENDPOINTS` | Object | `packages/fluxiq/src/programs/compute-control/api/contracts.ts` | - |
| `COMPUTE_CONTROL_PROGRAM` | Object | `packages/fluxiq/src/programs/compute-control/metadata.ts` | - |
| `computeAutomationStudioStabilityMetrics` | Value | `packages/fluxiq/src/programs/automation-studio/runtime/training-modes.ts` | - |
| `ComputeCommand` | Type | `packages/fluxiq/src/programs/compute-control/types.ts` | - |
| `ComputeControlCommandRequest` | Type | `packages/fluxiq/src/programs/compute-control/api/contracts.ts` | - |
| `ComputeControlPanel` | Type | `packages/fluxiq/src/programs/compute-control/ui/contracts.ts` | - |
| `ComputeControlService` | Class | `packages/fluxiq/src/programs/compute-control/runtime/service.ts` | - |
| `ComputeControlSnapshot` | Type | `packages/fluxiq/src/programs/compute-control/types.ts` | - |
| `ComputeControlSnapshotResponse` | Type | `packages/fluxiq/src/programs/compute-control/api/contracts.ts` | - |
| `ComputeControlStore` | Type | `packages/fluxiq/src/programs/compute-control/storage/contracts.ts` | - |
| `ComputeControlViewState` | Type | `packages/fluxiq/src/programs/compute-control/ui/contracts.ts` | - |
| `ComputeHeartbeatRequest` | Type | `packages/fluxiq/src/programs/compute-control/api/contracts.ts` | - |
| `ComputeLease` | Type | `packages/fluxiq/src/programs/compute-control/types.ts` | - |
| `ComputeNode` | Type | `packages/fluxiq/src/programs/compute-control/types.ts` | - |
| `ComputeStatus` | Type | `packages/fluxiq/src/programs/compute-control/types.ts` | - |
| `Condition` | Type | `packages/fluxiq/src/programs/automation-studio/types.ts` | - |
| `ConditionSet` | Type | `packages/fluxiq/src/programs/automation-studio/types.ts` | - |
| `ConservativeTimelineNormalizer` | Class | `packages/fluxiq/src/programs/automation-studio/normalization/default-normalizer.ts` | - |
| `ControlBackgroundTaskRequest` | Type | `packages/fluxiq/src/programs/background-tasks/api/contracts.ts` | - |
| `ConversationAnswerRequest` | Type | `packages/fluxiq/src/programs/automation-studio/api/contracts/conversation.ts` | The answer to one ask. `kind` must settle the ask's kind -- grant or deny a permission or a confirmation, name an option for a choice, words for an open question -- and `value` carries the option id or the words. |
| `ConversationAttachmentRequest` | Type | `packages/fluxiq/src/programs/automation-studio/api/contracts/conversation.ts` | What a turn's attachment refers to. Optional in every sense: a thread with no attachments never calls it, and a deployment that cannot serve the kind says so rather than answering with nothing. |
| `ConversationCommandExecution` | Type | `packages/fluxiq/src/programs/automation-studio/api/contracts/conversation.ts` | `append-turn`'s `payload.response.execution`, and `answer-ask`'s `payload.execution` when a granted question runs something: null when Core does not run the chosen capability or nothing is run now; otherwise `done` or `failed` for work that finished in the request, and `started` for a build or run whose result arrives later as an automation turn with a `panel-capability-result` attachment naming the capability. |
| `ConversationListRequest` | Type | `packages/fluxiq/src/programs/automation-studio/api/contracts/conversation.ts` | A project's threads, most recently touched first, optionally narrowed to one subject or to the open ones. `projectId` may be null, meaning "every project this caller can see". That exists for the globally mounted prompt: nothing can push to the browser, so reachability is a poll, and a poll cannot name the project an unanswered ask belongs to before it has found it. The projects searched are exactly the ones `projects` itself would return for this request's domain scope. |
| `ConversationOpenRequest` | Type | `packages/fluxiq/src/programs/automation-studio/api/contracts/conversation.ts` | The thread a person starts. `subjectKind` and `subjectId` say what the thread is about, and are checked by `requestedSubject`, which takes only `project`, `flow`, `build` or `run`. Both are optional together: a person opening the chat with nothing selected is talking about the project, so the subject falls back to the project's own id rather than being refused. `openConversation` continues the subject's open thread when there is one, so asking twice does not leave two. Opening a thread is `authoring`, like writing a turn: it creates nothing a person would need warning about and must not take a PIN. |
| `ConversationReadRequest` | Type | `packages/fluxiq/src/programs/automation-studio/api/contracts/conversation.ts` | One thread. With `sinceTurnId` only the turns after that one are read, which is what a reader already holding it asks for. |
| `ConversationTurnAppendRequest` | Type | `packages/fluxiq/src/programs/automation-studio/api/contracts/conversation.ts` | A turn the person writes. The author is always the person: Core's own turns do not come through the API. With `capabilities` the turn is also read as an instruction. That is the panel's vocabulary (`fluxiq/automation-studio/panel-capabilities`), handed across on every message so Core never keeps a second catalog; Core stores the turn first, has the model decide whether to run a capability, ask one question or reply, writes that into the thread, and answers with the decision so the panel can run what was chosen. Without it the turn is only stored, exactly as before -- which is how the panel records what it did. For the capabilities Core runs itself (`runtime/conversations/commands/`: `flow.createHere`, `flow.describe`, `flow.explore`, `flow.improve`, `run.execute`, `ask.answer`) a client need send only the id: Core's own descriptor replaces whatever was sent, Core runs the capability, and the answer's `response.execution` says what came of it (`ConversationCommandExecution`). The client then runs nothing itself. |
| `convertCodeOwnedFlowToVisual` | Value | `packages/fluxiq/src/programs/automation-studio/dsl/source.ts` | - |
| `correctAutomationStudioFlowBootstrapPlanNames` | Value | `packages/fluxiq/src/programs/automation-studio/runtime/flow-bootstrap/plan/name-correction.ts` | - |
| `createAutomationStudioDeepSeekPanelCommandModel` | Value | `packages/fluxiq/src/programs/automation-studio/runtime/llm/deepseek/panel-command.ts` | - |
| `createAutomationStudioDeepSeekProvider` | Value | `packages/fluxiq/src/programs/automation-studio/runtime/llm/deepseek/provider.ts` | - |
| `createAutomationStudioElementMatcher` | Value | `packages/fluxiq/src/programs/automation-studio/fingerprinting/element-fingerprint.ts` | - |
| `createAutomationStudioFileStorePaths` | Value | `packages/fluxiq/src/programs/automation-studio/storage/file-store.ts` | - |
| `createAutomationStudioFixture` | Value | `packages/fluxiq/src/programs/automation-studio/model/fixtures/recorded-task.ts` | - |
| `createAutomationStudioFlowExpansionFixture` | Value | `packages/fluxiq/src/programs/automation-studio/model/fixtures/flow-expansion.ts` | - |
| `createAutomationStudioLargeProjectFixture` | Value | `packages/fluxiq/src/programs/automation-studio/model/fixtures/large-project.ts` | - |
| `createAutomationStudioMarketingDemo` | Value | `packages/fluxiq/src/programs/automation-studio/testing/marketing-demo.ts` | - |
| `createAutomationStudioResultCheckProvider` | Value | `packages/fluxiq/src/programs/automation-studio/runtime/result-check-authorization/provider.ts` | - |
| `createAutomationStudioScaleCertificationReport` | Value | `packages/fluxiq/src/programs/automation-studio/testing/scale-certification.ts` | - |
| `createAutomationStudioScaleCertificationTemplate` | Value | `packages/fluxiq/src/programs/automation-studio/testing/scale-certification.ts` | - |
| `createAutomationStudioScaleManifest` | Value | `packages/fluxiq/src/programs/automation-studio/testing/scale-fixtures.ts` | - |
| `createAutomationStudioScaleMatrixTemplate` | Value | `packages/fluxiq/src/programs/automation-studio/testing/scale-certification.ts` | - |
| `createAutomationStudioSessionKeyProviderResolver` | Value | `packages/fluxiq/src/programs/automation-studio/runtime/llm/session-key-provider.ts` | - |
| `createAutomationStudioTrainingStatus` | Value | `packages/fluxiq/src/programs/automation-studio/runtime/training-modes.ts` | - |
| `createAutomationStudioVerifiedBackupManifest` | Value | `packages/fluxiq/src/programs/automation-studio/storage/project/migration-cutover.ts` | - |
| `createBlankAutomationStudioFlow` | Value | `packages/fluxiq/src/programs/automation-studio/model/artifacts.ts` | - |
| `createBlankAutomationStudioFlowArtifact` | Value | `packages/fluxiq/src/programs/automation-studio/model/flows.ts` | - |
| `createCallFlowNode` | Value | `packages/fluxiq/src/programs/automation-studio/model/composites.ts` | - |
| `createCanonicalAutomationStudioMemoryRepositories` | Value | `packages/fluxiq/src/programs/automation-studio/storage/memory-repository.ts` | - |
| `createCanonicalAutomationStudioSQLiteRepositories` | Value | `packages/fluxiq/src/programs/automation-studio/storage/sqlite-repository.ts` | - |
| `createEnvelope` | Value | `packages/fluxiq/src/io/index.ts` | - |
| `CreateFlowRequest` | Type | `packages/fluxiq/src/programs/automation-studio/api/contracts/flow.ts` | - |
| `CreateFlowSubflowInput` | Type | `packages/fluxiq/src/programs/automation-studio/runtime/service/flows/mutations.ts` | - |
| `CreateFlowSubflowRequest` | Type | `packages/fluxiq/src/programs/automation-studio/api/contracts/subflow.ts` | - |
| `createGlobalProgramRuntime` | Value | `packages/fluxiq/src/programs/_shared/runtime.ts` | - |
| `CreateGraphSnapshotRequest` | Type | `packages/fluxiq/src/programs/automation-studio/api/contracts/graph.ts` | - |
| `createId` | Value | `packages/fluxiq/src/core/index.ts` | - |
| `CreateIdentityUserRequest` | Type | `packages/fluxiq/src/programs/identity-access/api/contracts.ts` | - |
| `createIoPolicyEffectDispatcher` | Value | `packages/fluxiq/src/programs/automation-studio/runtime/io-policy.ts` | - |
| `createPassingAutomationStudioScaleCertificationFixture` | Value | `packages/fluxiq/src/programs/automation-studio/testing/scale-certification.ts` | - |
| `createPublishedFlowSnapshot` | Value | `packages/fluxiq/src/programs/automation-studio/model/composites.ts` | - |
| `createRecord` | Value | `packages/fluxiq/src/programs/database-manager/storage/sqlite-repository.ts` | - |
| `CreateRecordingFlowProposalsResult` | Type | `packages/fluxiq/src/programs/automation-studio/runtime/service/proposals/types.ts` | - |
| `CreateRecordingRequest` | Type | `packages/fluxiq/src/programs/automation-studio/api/contracts/recording.ts` | - |
| `createRecordingSession` | Value | `packages/fluxiq/src/programs/automation-studio/model/recording-framework.ts` | - |
| `CreateRecordingSessionInput` | Type | `packages/fluxiq/src/programs/automation-studio/model/recording-framework.ts` | - |
| `createRuntimeInputs` | Value | `packages/fluxiq/src/engine/index.ts` | - |
| `createRuntimeOutputs` | Value | `packages/fluxiq/src/engine/index.ts` | - |
| `createRuntimePolicyEffectDispatcher` | Value | `packages/fluxiq/src/programs/automation-studio/runtime/io-policy.ts` | - |
| `createRuntimeSession` | Value | `packages/fluxiq/src/engine/index.ts` | - |
| `CreateSecretKeyRequest` | Type | `packages/fluxiq/src/programs/secret-keys/api/contracts.ts` | - |
| `currentAutomationStudioConversation` | Value | `packages/fluxiq/src/programs/automation-studio/runtime/conversations/context/current.ts` | - |
| `currentAutomationStudioInstructedConsequences` | Value | `packages/fluxiq/src/programs/automation-studio/runtime/action-permissions/instructed.ts` | - |
| `currentAutomationStudioInstructionRoute` | Value | `packages/fluxiq/src/programs/automation-studio/runtime/action-permissions/instruction-route/current.ts` | - |
| `DATABASE_MANAGER_ENDPOINTS` | Object | `packages/fluxiq/src/programs/database-manager/api/contracts.ts` | - |
| `DATABASE_MANAGER_PROGRAM` | Object | `packages/fluxiq/src/programs/database-manager/metadata.ts` | - |
| `DatabaseManagerPanel` | Type | `packages/fluxiq/src/programs/database-manager/ui/contracts.ts` | - |
| `DatabaseManagerPutRecordRequest` | Type | `packages/fluxiq/src/programs/database-manager/api/contracts.ts` | - |
| `DatabaseManagerRecordPageResponse` | Type | `packages/fluxiq/src/programs/database-manager/api/contracts.ts` | - |
| `DatabaseManagerRecordRequest` | Type | `packages/fluxiq/src/programs/database-manager/api/contracts.ts` | - |
| `DatabaseManagerRecordResponse` | Type | `packages/fluxiq/src/programs/database-manager/api/contracts.ts` | - |
| `DatabaseManagerRunMigrationRequest` | Type | `packages/fluxiq/src/programs/database-manager/api/contracts.ts` | - |
| `DatabaseManagerSensitiveGrantResponse` | Type | `packages/fluxiq/src/programs/database-manager/api/contracts.ts` | - |
| `DatabaseManagerService` | Class | `packages/fluxiq/src/programs/database-manager/runtime/service.ts` | - |
| `DatabaseManagerSnapshot` | Type | `packages/fluxiq/src/programs/database-manager/types.ts` | - |
| `DatabaseManagerSnapshotRequest` | Type | `packages/fluxiq/src/programs/database-manager/api/contracts.ts` | - |
| `DatabaseManagerSnapshotResponse` | Type | `packages/fluxiq/src/programs/database-manager/api/contracts.ts` | - |
| `DatabaseManagerStoreRequest` | Type | `packages/fluxiq/src/programs/database-manager/api/contracts.ts` | - |
| `DatabaseManagerStoreSummary` | Type | `packages/fluxiq/src/programs/database-manager/types.ts` | - |
| `DatabaseManagerViewState` | Type | `packages/fluxiq/src/programs/database-manager/ui/contracts.ts` | - |
| `DatasetRunListRequest` | Type | `packages/fluxiq/src/programs/automation-studio/api/contracts/dataset.ts` | The runs holding rows for one table, identified by the pair (`flowId`, `datasetId`). |
| `decideAutomationStudioAdaptationPromotionGate` | Value | `packages/fluxiq/src/programs/automation-studio/runtime/training-modes.ts` | - |
| `decideAutomationStudioBootstrapApplyGate` | Value | `packages/fluxiq/src/programs/automation-studio/runtime/training-modes.ts` | - |
| `decideAutomationStudioChangeConfidence` | Value | `packages/fluxiq/src/programs/automation-studio/runtime/flow-change/confidence.ts` | - |
| `decideAutomationStudioChangeResume` | Value | `packages/fluxiq/src/programs/automation-studio/runtime/flow-change/resume.ts` | - |
| `decideAutomationStudioChangeVerdict` | Value | `packages/fluxiq/src/programs/automation-studio/runtime/flow-change/verdict.ts` | - |
| `decideAutomationStudioLlmInvocationGate` | Value | `packages/fluxiq/src/programs/automation-studio/runtime/training-modes.ts` | - |
| `decideAutomationStudioProposalApprovalGate` | Value | `packages/fluxiq/src/programs/automation-studio/runtime/training-modes.ts` | - |
| `decideAutomationStudioResultCheck` | Value | `packages/fluxiq/src/programs/automation-studio/runtime/result-check-schedule/decide.ts` | - |
| `decideAutomationStudioRuntimeLlmInvocation` | Value | `packages/fluxiq/src/programs/automation-studio/runtime/recovery/llm-invocation.ts` | - |
| `decideAutomationStudioRuntimePatchRequest` | Value | `packages/fluxiq/src/programs/automation-studio/runtime/recovery/diagnosis-chain.ts` | - |
| `decideAutomationStudioStateRoute` | Value | `packages/fluxiq/src/programs/automation-studio/runtime/executor/state-routing/decision.ts` | - |
| `decideAutomationStudioTrainingBudget` | Value | `packages/fluxiq/src/programs/automation-studio/runtime/training-modes.ts` | - |
| `decodeAutomationStudioPageCursor` | Value | `packages/fluxiq/src/programs/automation-studio/storage/paging.ts` | - |
| `DEFAULT_ELEMENT_FINGERPRINT_WEIGHTS` | Object | `packages/fluxiq/src/programs/automation-studio/fingerprinting/element-fingerprint.ts` | - |
| `DEFAULT_SESSION_TTL_MS` | Object | `packages/fluxiq/src/programs/identity-access/runtime/service.ts` | - |
| `defaultAutomationStudioFlowSettingsMetadata` | Value | `packages/fluxiq/src/programs/automation-studio/model/flows.ts` | - |
| `defaultAutomationStudioSubflowForFlow` | Value | `packages/fluxiq/src/programs/automation-studio/runtime/router-runtime.ts` | - |
| `defaultGlobalProgramCatalog` | Value | `packages/fluxiq/src/programs/_shared/catalog.ts` | - |
| `defaultProgramCatalog` | Object | `packages/fluxiq/src/programs/_shared/catalog.ts` | - |
| `defaultRoles` | Object | `packages/fluxiq/src/programs/identity-access/runtime/roles.ts` | - |
| `DefinedInput` | Type | `packages/fluxiq/src/io/index.ts` | - |
| `defineDomainIo` | Value | `packages/fluxiq/src/io/index.ts` | - |
| `DefinedOutput` | Type | `packages/fluxiq/src/io/index.ts` | - |
| `defineFlow` | Value | `packages/fluxiq/src/programs/automation-studio/dsl/compiler.ts` | - |
| `defineInput` | Value | `packages/fluxiq/src/io/index.ts` | - |
| `defineOutput` | Value | `packages/fluxiq/src/io/index.ts` | - |
| `DeleteFlowMapRouteGroupRequest` | Type | `packages/fluxiq/src/programs/automation-studio/api/contracts/flow-map.ts` | - |
| `DeleteFlowMapRouteRequest` | Type | `packages/fluxiq/src/programs/automation-studio/api/contracts/flow-map.ts` | - |
| `DeleteRecordingRequest` | Type | `packages/fluxiq/src/programs/automation-studio/api/contracts/recording.ts` | - |
| `DeleteRecordingsRequest` | Type | `packages/fluxiq/src/programs/automation-studio/api/contracts/recording.ts` | - |
| `DeleteSecretKeyRequest` | Type | `packages/fluxiq/src/programs/secret-keys/api/contracts.ts` | - |
| `DEPLOYMENT_SYNC_ENDPOINTS` | Object | `packages/fluxiq/src/programs/deployment-sync/api/contracts.ts` | - |
| `DEPLOYMENT_SYNC_PROGRAM` | Object | `packages/fluxiq/src/programs/deployment-sync/metadata.ts` | - |
| `DeploymentArtifact` | Type | `packages/fluxiq/src/programs/deployment-sync/types.ts` | - |
| `DeploymentGitBranch` | Type | `packages/fluxiq/src/programs/deployment-sync/types.ts` | - |
| `DeploymentGitSnapshot` | Type | `packages/fluxiq/src/programs/deployment-sync/types.ts` | - |
| `DeploymentGitVersion` | Type | `packages/fluxiq/src/programs/deployment-sync/types.ts` | - |
| `DeploymentRunMode` | Type | `packages/fluxiq/src/programs/deployment-sync/types.ts` | - |
| `DeploymentRunOptions` | Type | `packages/fluxiq/src/programs/deployment-sync/runtime/service.ts` | - |
| `DeploymentSyncPanel` | Type | `packages/fluxiq/src/programs/deployment-sync/ui/contracts.ts` | - |
| `DeploymentSyncProvider` | Type | `packages/fluxiq/src/programs/deployment-sync/runtime/service.ts` | - |
| `DeploymentSyncRequest` | Type | `packages/fluxiq/src/programs/deployment-sync/api/contracts.ts` | - |
| `DeploymentSyncResponse` | Type | `packages/fluxiq/src/programs/deployment-sync/api/contracts.ts` | - |
| `DeploymentSyncRun` | Type | `packages/fluxiq/src/programs/deployment-sync/types.ts` | - |
| `DeploymentSyncService` | Class | `packages/fluxiq/src/programs/deployment-sync/runtime/service.ts` | - |
| `DeploymentSyncSnapshot` | Type | `packages/fluxiq/src/programs/deployment-sync/types.ts` | - |
| `DeploymentSyncSnapshotResponse` | Type | `packages/fluxiq/src/programs/deployment-sync/api/contracts.ts` | - |
| `DeploymentSyncStatus` | Type | `packages/fluxiq/src/programs/deployment-sync/types.ts` | - |
| `DeploymentSyncStore` | Type | `packages/fluxiq/src/programs/deployment-sync/storage/contracts.ts` | - |
| `DeploymentSyncViewState` | Type | `packages/fluxiq/src/programs/deployment-sync/ui/contracts.ts` | - |
| `DeploymentTarget` | Type | `packages/fluxiq/src/programs/deployment-sync/types.ts` | - |
| `DeprecateFlowPublicationRequest` | Type | `packages/fluxiq/src/programs/automation-studio/api/contracts/flow.ts` | - |
| `DIAGNOSTIC_ISSUE_CODE` | Object | `packages/fluxiq/src/programs/automation-studio/runtime/flow-bootstrap/generation-failure/diagnostic.ts` | The shape an issue code must have to travel: no whitespace, so no sentence. |
| `diffStateSnapshots` | Value | `packages/fluxiq/src/programs/automation-studio/model/state-diff.ts` | - |
| `discoverSignalDefinitions` | Value | `packages/fluxiq/src/programs/automation-studio/model/signal-registry.ts` | - |
| `dispatchPolicyOutput` | Value | `packages/fluxiq/src/programs/automation-studio/runtime/io-policy.ts` | - |
| `DOCS_ENDPOINTS` | Object | `packages/fluxiq/src/programs/docs/api/contracts.ts` | - |
| `DOCS_PROGRAM` | Object | `packages/fluxiq/src/programs/docs/metadata.ts` | - |
| `DocsPageRequest` | Type | `packages/fluxiq/src/programs/docs/api/contracts.ts` | - |
| `DocsPageResponse` | Type | `packages/fluxiq/src/programs/docs/api/contracts.ts` | - |
| `DocsPanel` | Type | `packages/fluxiq/src/programs/docs/ui/contracts.ts` | - |
| `DocsService` | Class | `packages/fluxiq/src/programs/docs/runtime/service.ts` | - |
| `DocsSnapshot` | Type | `packages/fluxiq/src/programs/docs/types.ts` | - |
| `DocsSnapshotResponse` | Type | `packages/fluxiq/src/programs/docs/api/contracts.ts` | - |
| `DocsStore` | Type | `packages/fluxiq/src/programs/docs/storage/contracts.ts` | - |
| `DocsViewState` | Type | `packages/fluxiq/src/programs/docs/ui/contracts.ts` | - |
| `DocumentationGenerator` | Type | `packages/fluxiq/src/programs/docs/types.ts` | - |
| `DocumentationGeneratorContext` | Type | `packages/fluxiq/src/programs/docs/types.ts` | - |
| `DocumentationPage` | Type | `packages/fluxiq/src/programs/docs/types.ts` | - |
| `DocumentationPageContent` | Type | `packages/fluxiq/src/programs/docs/types.ts` | - |
| `DocumentationRuntimeProviders` | Type | `packages/fluxiq/src/programs/_shared/docs-generators.ts` | - |
| `DocumentationSource` | Type | `packages/fluxiq/src/programs/docs/types.ts` | - |
| `DomainEventEntry` | Type | `packages/fluxiq/src/programs/automation-studio/model/timeline.ts` | - |
| `DomainInputDefinition` | Type | `packages/fluxiq/src/domains/index.ts` | - |
| `DomainIoRegistration` | Type | `packages/fluxiq/src/io/index.ts` | A cohesive importer-owned domain IO package. |
| `DomainManifest` | Type | `packages/fluxiq/src/domains/index.ts` | - |
| `DomainOutputDefinition` | Type | `packages/fluxiq/src/domains/index.ts` | - |
| `DomainRegistration` | Type | `packages/fluxiq/src/domains/index.ts` | - |
| `DomainRegistry` | Class | `packages/fluxiq/src/domains/index.ts` | - |
| `DomainStatus` | Type | `packages/fluxiq/src/domains/index.ts` | - |
| `domainSummary` | Value | `packages/fluxiq/src/domains/index.ts` | - |
| `DomainSummary` | Type | `packages/fluxiq/src/domains/index.ts` | - |
| `DomainSummaryContract` | Type | `packages/contracts/src/program-api.ts` | - |
| `domainSummarySchema` | Object | `packages/contracts/src/program-api.ts` | - |
| `DuplicateFlowSubflowRequest` | Type | `packages/fluxiq/src/programs/automation-studio/api/contracts/subflow.ts` | - |
| `DynamicPolicyArtifact` | Type | `packages/fluxiq/src/programs/automation-studio/types.ts` | - |
| `DynamicPolicyEdge` | Type | `packages/fluxiq/src/programs/automation-studio/types.ts` | - |
| `DynamicPolicyNode` | Type | `packages/fluxiq/src/programs/automation-studio/types.ts` | - |
| `ElementFingerprint` | Type | `packages/fluxiq/src/programs/automation-studio/fingerprinting/element-fingerprint.ts` | - |
| `ElementFingerprintCandidate` | Type | `packages/fluxiq/src/programs/automation-studio/fingerprinting/element-fingerprint.ts` | - |
| `ElementFingerprintContribution` | Type | `packages/fluxiq/src/programs/automation-studio/fingerprinting/element-fingerprint.ts` | - |
| `ElementFingerprintScore` | Type | `packages/fluxiq/src/programs/automation-studio/fingerprinting/element-fingerprint.ts` | - |
| `ElementFingerprintScoringOptions` | Type | `packages/fluxiq/src/programs/automation-studio/fingerprinting/element-fingerprint.ts` | - |
| `ElementFingerprintWeights` | Type | `packages/fluxiq/src/programs/automation-studio/fingerprinting/element-fingerprint.ts` | - |
| `emitAutomationStudioActivity` | Value | `packages/fluxiq/src/programs/automation-studio/runtime/activity/emit.ts` | - |
| `emitAutomationStudioActivityAskResolved` | Value | `packages/fluxiq/src/programs/automation-studio/runtime/activity/ask/resolved.ts` | - |
| `emitAutomationStudioActivityClearedWait` | Value | `packages/fluxiq/src/programs/automation-studio/runtime/activity/ask/cleared-wait.ts` | - |
| `emitAutomationStudioActivityStep` | Value | `packages/fluxiq/src/programs/automation-studio/runtime/activity/step/started.ts` | - |
| `emitAutomationStudioActivityStepRecovering` | Value | `packages/fluxiq/src/programs/automation-studio/runtime/activity/step/recovering.ts` | - |
| `emitAutomationStudioActivityThought` | Value | `packages/fluxiq/src/programs/automation-studio/runtime/activity/thought.ts` | - |
| `emitAutomationStudioActivityWaitedOut` | Value | `packages/fluxiq/src/programs/automation-studio/runtime/activity/ask/waited-out.ts` | - |
| `emitAutomationStudioActivityWaitingOnAsk` | Value | `packages/fluxiq/src/programs/automation-studio/runtime/activity/ask/ask.ts` | - |
| `emitAutomationStudioBuildRequest` | Value | `packages/fluxiq/src/programs/automation-studio/runtime/activity/build.ts` | - |
| `emptyAutomationStudioRootIndex` | Value | `packages/fluxiq/src/programs/automation-studio/storage/file-store.ts` | - |
| `emptyFlowSummaryIndex` | Value | `packages/fluxiq/src/programs/automation-studio/storage/file-store.ts` | - |
| `emptyObjectIndex` | Value | `packages/fluxiq/src/programs/automation-studio/storage/file-store.ts` | - |
| `emptyProposalSummaryIndex` | Value | `packages/fluxiq/src/programs/automation-studio/storage/file-store.ts` | - |
| `emptyRecordingIndex` | Value | `packages/fluxiq/src/programs/automation-studio/storage/state-index.ts` | - |
| `EmptyRecordingIndexInput` | Type | `packages/fluxiq/src/programs/automation-studio/storage/state-index.ts` | - |
| `emptyRecordingSummaryIndex` | Value | `packages/fluxiq/src/programs/automation-studio/storage/file-store.ts` | - |
| `emptyRuntimeSummaryIndex` | Value | `packages/fluxiq/src/programs/automation-studio/storage/file-store.ts` | - |
| `emptyStateSnapshot` | Value | `packages/fluxiq/src/programs/automation-studio/model/state-store.ts` | - |
| `encodeAutomationStudioPageCursor` | Value | `packages/fluxiq/src/programs/automation-studio/storage/paging.ts` | - |
| `EncryptedSecretValueRecord` | Type | `packages/fluxiq/src/programs/secret-keys/types.ts` | - |
| `EncryptedSecretValueRecordV1` | Type | `packages/fluxiq/src/programs/secret-keys/types.ts` | A version 1 seal: scrypt at Node's default cost (N=2^14), recording no parameters, with the base64url salt text itself as the scrypt salt. Still read; never written. It is re-sealed as version 2 at its next successful unlock or reveal. |
| `EncryptedSecretValueRecordV2` | Type | `packages/fluxiq/src/programs/secret-keys/types.ts` | A version 2 seal: records its scrypt parameters, which must be in the read allowlist, and derives from the decoded salt bytes. `sealedByUserId` is a non-secret hint naming the account whose password sealed the value, so a login tries only that user's keys; tampering with it affects availability only. |
| `EnvironmentDescriptor` | Type | `packages/fluxiq/src/programs/automation-studio/model/descriptors.ts` | - |
| `estimateAutomationStudioDeepSeekCostUsd` | Value | `packages/fluxiq/src/programs/automation-studio/runtime/llm/deepseek/pricing.ts` | - |
| `estimateAutomationStudioDeepSeekInputTokens` | Value | `packages/fluxiq/src/programs/automation-studio/runtime/llm/deepseek/request-body.ts` | - |
| `evaluateAutomationStudioCandidateRequirements` | Value | `packages/fluxiq/src/programs/automation-studio/runtime/flow-bootstrap/verification/predicates.ts` | - |
| `evaluateAutomationStudioRouteCondition` | Value | `packages/fluxiq/src/programs/automation-studio/runtime/router-runtime.ts` | - |
| `evaluateBootstrapAdaptationApplyGates` | Value | `packages/fluxiq/src/programs/automation-studio/runtime/recovery/adaptation-promotion.ts` | - |
| `evaluateFlowAdaptationPromotionGates` | Value | `packages/fluxiq/src/programs/automation-studio/runtime/recovery/adaptation-promotion.ts` | - |
| `EvidenceAnchor` | Type | `packages/fluxiq/src/programs/automation-studio/model/state.ts` | - |
| `EvidenceClaim` | Type | `packages/fluxiq/src/programs/automation-studio/mining/contracts.ts` | - |
| `EvidenceClaimConfidence` | Type | `packages/fluxiq/src/programs/automation-studio/mining/contracts.ts` | - |
| `EvidenceClaimType` | Type | `packages/fluxiq/src/programs/automation-studio/mining/contracts.ts` | - |
| `EvidenceComparator` | Type | `packages/fluxiq/src/programs/automation-studio/model/evidence.ts` | - |
| `EvidenceFact` | Type | `packages/fluxiq/src/programs/automation-studio/mining/contracts.ts` | - |
| `EvidenceFactKind` | Type | `packages/fluxiq/src/programs/automation-studio/mining/contracts.ts` | - |
| `EvidenceLayer` | Type | `packages/fluxiq/src/programs/automation-studio/model/evidence.ts` | - |
| `EvidenceObservation` | Type | `packages/fluxiq/src/programs/automation-studio/mining/contracts.ts` | - |
| `EvidenceObservationKind` | Type | `packages/fluxiq/src/programs/automation-studio/mining/contracts.ts` | - |
| `EvidenceReference` | Type | `packages/fluxiq/src/programs/automation-studio/model/evidence.ts` | - |
| `evidenceStepAnswerability` | Value | `packages/fluxiq/src/programs/automation-studio/runtime/flow-bootstrap/evidence-loop-steps.ts` | - |
| `evidenceStepDraft` | Value | `packages/fluxiq/src/programs/automation-studio/runtime/flow-bootstrap/evidence-loop-steps.ts` | - |
| `evidenceStepDraftChange` | Value | `packages/fluxiq/src/programs/automation-studio/runtime/flow-bootstrap/evidence-loop-steps.ts` | - |
| `evidenceStepProgress` | Value | `packages/fluxiq/src/programs/automation-studio/runtime/flow-bootstrap/evidence-loop-steps.ts` | - |
| `evidenceStepRestoredStep` | Value | `packages/fluxiq/src/programs/automation-studio/runtime/flow-bootstrap/evidence-loop-steps.ts` | - |
| `executeAutomationStudioConversationCommand` | Value | `packages/fluxiq/src/programs/automation-studio/runtime/conversations/commands/execute.ts` | - |
| `executeAutomationStudioRuntimePatch` | Value | `packages/fluxiq/src/programs/automation-studio/runtime/live-patch.ts` | - |
| `ExecuteClientActionRequest` | Type | `packages/fluxiq/src/programs/automation-studio/api/contracts/client.ts` | - |
| `Expectation` | Type | `packages/fluxiq/src/programs/automation-studio/model/policies.ts` | - |
| `explainAutomationStudioQueryPlan` | Value | `packages/fluxiq/src/programs/automation-studio/storage/query-plan.ts` | - |
| `FileRepository` | Class | `packages/fluxiq/src/programs/database-manager/storage/file-repository.ts` | - |
| `FileRuntimeStore` | Class | `packages/fluxiq/src/runtime/storage.ts` | - |
| `FileRuntimeStoreOptions` | Type | `packages/fluxiq/src/runtime/storage.ts` | - |
| `FinalizeRecordingRequest` | Type | `packages/fluxiq/src/programs/automation-studio/api/contracts/recording.ts` | - |
| `finalizeRecordingSession` | Value | `packages/fluxiq/src/programs/automation-studio/model/recording-framework.ts` | - |
| `FingerprintCandidateScore` | Type | `packages/fluxiq/src/programs/automation-studio/fingerprinting/contracts.ts` | - |
| `FingerprintScorer` | Type | `packages/fluxiq/src/programs/automation-studio/fingerprinting/contracts.ts` | - |
| `FingerprintScoringContext` | Type | `packages/fluxiq/src/programs/automation-studio/fingerprinting/contracts.ts` | - |
| `FLOW_BOOTSTRAP_DEFAULT_PHASE_FAILURE_CODE` | Object | `packages/fluxiq/src/programs/automation-studio/runtime/flow-bootstrap/generation-failure/codes.ts` | The code a stage falls back to when nothing more specific is established. |
| `FLOW_BOOTSTRAP_HARNESS_PREFLIGHT_CODE_SET` | Object | `packages/fluxiq/src/programs/automation-studio/runtime/flow-bootstrap/generation-failure/codes.ts` | - |
| `FLOW_BOOTSTRAP_PHASE_FAILURE_CODE_STAGE` | Object | `packages/fluxiq/src/programs/automation-studio/runtime/flow-bootstrap/generation-failure/codes.ts` | The stage a code belongs to. A code appears under exactly one stage, so this is total. |
| `FLOW_BOOTSTRAP_PROVIDER_PREFLIGHT_CODE_LIST` | Object | `packages/fluxiq/src/programs/automation-studio/runtime/flow-bootstrap/generation-failure/harness-vocabulary.ts` | - |
| `FLOW_BOOTSTRAP_PROVIDER_PREFLIGHT_CODE_SET` | Object | `packages/fluxiq/src/programs/automation-studio/runtime/flow-bootstrap/generation-failure/harness-vocabulary.ts` | - |
| `FLOW_BOOTSTRAP_PROVIDER_PREFLIGHT_CODES` | Object | `packages/fluxiq/src/programs/automation-studio/runtime/flow-bootstrap/generation-failure/harness-vocabulary.ts` | Each provider refusal made before a request is sent, under its Flow-bootstrap name. They all used to arrive as one `llm.provider_configuration_invalid` and leave as one `flow_bootstrap.provider_configuration_invalid`, so a refusal could not say which check made it. |
| `FLOW_BOOTSTRAP_RUN_BUDGET_CODE_LIST` | Object | `packages/fluxiq/src/programs/automation-studio/runtime/flow-bootstrap/generation-failure/harness-vocabulary.ts` | - |
| `FLOW_BOOTSTRAP_RUN_BUDGET_CODES` | Object | `packages/fluxiq/src/programs/automation-studio/runtime/flow-bootstrap/generation-failure/harness-vocabulary.ts` | Each refusal of the run's spending authority, under its Flow-bootstrap name. **These had no name here at all, and that is how a run that never reached the provider could be recorded as a provider fault.** The harness used to refuse a reservation before sending anything and return the provider's metadata anyway, so `flowBootstrapHarnessFailure` took its provider branch, no arm matched, and the `default` arm named it `flow_bootstrap.provider_transport_unknown` at stage `provider_request` with `providerInvocation: "attempted"` -- a request attempted whose answer is unknown, true of nothing that happened. They are pre-provider refusals, so their diagnostics say plainly that no request was made -- and they keep the request's accounting, which is the only record of the call that did not happen. Nothing else: no provider, no model, no status, no usage, whichever branch the refusal arrives on. **Both halves of that fix are in, and the harness's half came second.** A refused reservation no longer returns provider metadata (`runtime/llm/harness/run.ts`), so these codes are reached through the pre-provider branch and the provider branch's arm for them is unreachable from the harness -- kept as a guard, for the reason given at that arm. **What the two runs that started this were not.** `run-muhs8hx3-6fd929e6` and `run-muhtuizo-c458e49c` recorded `provider_transport_unknown` with no provider status, no usage and no evidence loop, and t145 narrowed the cause to these six refusals. That cannot be right: `runBudget` is passed to the harness by exactly three production callers -- `recovery/annotation/exploration.ts`, `recovery/annotation/patch-reserve.ts` and `result-verification/verify.ts` -- and a Flow Bootstrap build is none of them, so `reservation` is `null` for a build and this branch cannot fire on one. Both runs were builds. The shape that does fit every field they recorded is `llm.provider_request_failed`, which `normalizedAutomationStudioLlmProviderFailure` answers when a throw cannot be structurally typed, projected by its own arm to `provider_transport_unknown`. Their 167 s and 194 s are the calls that succeeded before it: a harness-projected build failure carries no evidence-loop counts and no per-call usage however many calls preceded it, so those nulls were read as evidence of no call and are evidence of nothing. Established by elimination, not observed -- which is why the `default` arm now publishes the harness code it could not name, so the next such run answers the question from its own record instead of from an argument about the other fields. |
| `FlowAdaptationRequest` | Type | `packages/fluxiq/src/programs/automation-studio/api/contracts/adaptation.ts` | - |
| `flowBootstrapBuildEndingFailure` | Value | `packages/fluxiq/src/programs/automation-studio/runtime/flow-bootstrap/generation-failure/evidence-failure.ts` | - |
| `flowBootstrapDiagnosticIssueCodes` | Value | `packages/fluxiq/src/programs/automation-studio/runtime/flow-bootstrap/generation-failure/diagnostic.ts` | - |
| `flowBootstrapEvidenceCompletionFailure` | Value | `packages/fluxiq/src/programs/automation-studio/runtime/flow-bootstrap/generation-failure/evidence-failure.ts` | - |
| `flowBootstrapEvidenceLoopFailure` | Value | `packages/fluxiq/src/programs/automation-studio/runtime/flow-bootstrap/generation-failure/evidence-failure.ts` | - |
| `flowBootstrapEvidenceUnusableDecisionFailure` | Value | `packages/fluxiq/src/programs/automation-studio/runtime/flow-bootstrap/generation-failure/evidence-failure.ts` | - |
| `flowBootstrapHarnessFailure` | Value | `packages/fluxiq/src/programs/automation-studio/runtime/flow-bootstrap/generation-failure/harness-failure.ts` | - |
| `flowBootstrapPermissionRequiredFailure` | Value | `packages/fluxiq/src/programs/automation-studio/runtime/flow-bootstrap/generation-failure/evidence-failure.ts` | - |
| `flowBootstrapPhaseFailure` | Value | `packages/fluxiq/src/programs/automation-studio/runtime/flow-bootstrap/generation-failure/phase-failure.ts` | - |
| `flowBootstrapThrownIssueCodes` | Value | `packages/fluxiq/src/programs/automation-studio/runtime/flow-bootstrap/generation-failure/thrown-issue-codes.ts` | - |
| `flowBootstrapUnclassifiedThrowCode` | Value | `packages/fluxiq/src/programs/automation-studio/runtime/flow-bootstrap/generation-failure/phase-failure.ts` | - |
| `flowBootstrapUserInterventionRequiredFailure` | Value | `packages/fluxiq/src/programs/automation-studio/runtime/flow-bootstrap/generation-failure/evidence-failure.ts` | - |
| `FlowChangeProposalRequest` | Type | `packages/fluxiq/src/programs/automation-studio/api/contracts/instruction.ts` | - |
| `FlowDocument` | Type | `packages/fluxiq/src/flows/index.ts` | - |
| `flowDocumentId` | Value | `packages/fluxiq/src/programs/automation-studio/storage/ids.ts` | - |
| `FlowEdge` | Type | `packages/fluxiq/src/flows/index.ts` | - |
| `FlowExpansionSummaryRequest` | Type | `packages/fluxiq/src/programs/automation-studio/api/contracts/flow.ts` | - |
| `FlowIdProjectRequest` | Type | `packages/fluxiq/src/programs/automation-studio/api/contracts/flow.ts` | - |
| `FlowInstructionRequest` | Type | `packages/fluxiq/src/programs/automation-studio/api/contracts/instruction.ts` | - |
| `flowInstructionScopeFromPayload` | Value | `packages/fluxiq/src/programs/automation-studio/api/handlers/instruction-scope.ts` | - |
| `FlowInstructionSetRequest` | Type | `packages/fluxiq/src/programs/automation-studio/api/contracts/instruction.ts` | - |
| `FlowMetadataPageRequest` | Type | `packages/fluxiq/src/programs/automation-studio/api/contracts/flow.ts` | - |
| `flowMigrationLedgerDocumentId` | Value | `packages/fluxiq/src/programs/automation-studio/storage/ids.ts` | - |
| `FlowNode` | Type | `packages/fluxiq/src/flows/index.ts` | - |
| `FlowNodeContext` | Type | `packages/fluxiq/src/flows/index.ts` | - |
| `FlowNodeHandler` | Type | `packages/fluxiq/src/flows/index.ts` | - |
| `FlowProjectRequest` | Type | `packages/fluxiq/src/programs/automation-studio/api/contracts/flow.ts` | - |
| `flowPublicationDocumentId` | Value | `packages/fluxiq/src/programs/automation-studio/storage/ids.ts` | - |
| `FlowRetry` | Type | `packages/fluxiq/src/flows/index.ts` | - |
| `FlowRunActionPageRequest` | Type | `packages/fluxiq/src/programs/automation-studio/api/contracts/run.ts` | - |
| `FlowRunDetailRequest` | Type | `packages/fluxiq/src/programs/automation-studio/api/contracts/run.ts` | - |
| `FlowRunEventPageRequest` | Type | `packages/fluxiq/src/programs/automation-studio/api/contracts/run.ts` | - |
| `FlowState` | Type | `packages/fluxiq/src/flows/index.ts` | - |
| `FlowStepResult` | Type | `packages/fluxiq/src/engine/index.ts` | - |
| `FlowSubflowRequest` | Type | `packages/fluxiq/src/programs/automation-studio/api/contracts/subflow.ts` | - |
| `FlowValidationIssue` | Type | `packages/fluxiq/src/flows/index.ts` | - |
| `FluxIQ` | Class | `packages/fluxiq/src/framework/index.ts` | - |
| `FLUXIQ_RUNTIME_WITHHELD_VALUE` | Object | `packages/fluxiq/src/runtime/contracts.ts` | What a withheld value reads as in a command attempt the runtime keeps. A constant rather than a removed field, so a reader can tell a value that was withheld from one that was never there. |
| `FLUXIQ_STORAGE_LAYOUT_VERSION` | Object | `packages/fluxiq/src/framework/storage-layout.ts` | - |
| `FluxIQConfigFile` | Type | `packages/fluxiq/src/framework/index.ts` | - |
| `fluxiqConsoleTheme` | Object | `packages/fluxiq/src/ui/index.ts` | - |
| `FluxIQEnvironment` | Type | `packages/fluxiq/src/framework/index.ts` | - |
| `FluxIQEnvironmentKey` | Type | `packages/fluxiq/src/framework/index.ts` | - |
| `FluxIQHostPaths` | Type | `packages/fluxiq/src/framework/index.ts` | - |
| `FluxIQIconName` | Type | `packages/fluxiq/src/ui/index.ts` | - |
| `FluxIQMigrationJournal` | Type | `packages/fluxiq/src/framework/storage-layout.ts` | - |
| `FluxIQOptions` | Type | `packages/fluxiq/src/framework/index.ts` | - |
| `FluxIQPerformanceMetric` | Type | `packages/fluxiq/src/programs/_shared/performance-metrics.ts` | - |
| `fluxiqPerformanceMetricsSnapshot` | Value | `packages/fluxiq/src/programs/_shared/performance-metrics.ts` | - |
| `FluxIQRuntimeAdapter` | Type | `packages/fluxiq/src/runtime/contracts.ts` | - |
| `FluxIQRuntimeCapability` | Type | `packages/fluxiq/src/runtime/contracts.ts` | - |
| `FluxIQRuntimeCapabilityKind` | Type | `packages/fluxiq/src/runtime/contracts.ts` | - |
| `FluxIQRuntimeClient` | Type | `packages/fluxiq/src/runtime/contracts.ts` | - |
| `FluxIQRuntimeClientStatus` | Type | `packages/fluxiq/src/runtime/contracts.ts` | - |
| `FluxIQRuntimeCommand` | Type | `packages/fluxiq/src/runtime/contracts.ts` | - |
| `FluxIQRuntimeCommandAttempt` | Type | `packages/fluxiq/src/runtime/contracts.ts` | - |
| `FluxIQRuntimeCommandAttemptResult` | Type | `packages/fluxiq/src/runtime/contracts.ts` | The result a command attempt keeps: the command's result, except that a payload its caller withheld reads as `FLUXIQ_RUNTIME_WITHHELD_VALUE`. |
| `FluxIQRuntimeCommandKind` | Type | `packages/fluxiq/src/runtime/contracts.ts` | - |
| `FluxIQRuntimeCommandResult` | Type | `packages/fluxiq/src/runtime/contracts.ts` | - |
| `FluxIQRuntimeCommandStatus` | Type | `packages/fluxiq/src/runtime/contracts.ts` | - |
| `FluxIQRuntimeDispatchContext` | Type | `packages/fluxiq/src/runtime/contracts.ts` | - |
| `FluxIQRuntimeEvent` | Type | `packages/fluxiq/src/runtime/contracts.ts` | - |
| `FluxIQRuntimeEventHandler` | Type | `packages/fluxiq/src/runtime/contracts.ts` | - |
| `FluxIQRuntimeExecutionContext` | Type | `packages/fluxiq/src/runtime/contracts.ts` | - |
| `FluxIQRuntimeRun` | Type | `packages/fluxiq/src/runtime/contracts.ts` | - |
| `FluxIQRuntimeRunStatus` | Type | `packages/fluxiq/src/runtime/contracts.ts` | - |
| `FluxIQRuntimeSnapshot` | Type | `packages/fluxiq/src/runtime/contracts.ts` | - |
| `fluxiqRuntimeTextWithholding` | Value | `packages/fluxiq/src/runtime/text-withholding.ts` | - |
| `FluxIQRuntimeTransport` | Type | `packages/fluxiq/src/runtime/contracts.ts` | - |
| `FluxIQRuntimeTransportKind` | Type | `packages/fluxiq/src/runtime/contracts.ts` | - |
| `FluxIQRuntimeWithheldValues` | Type | `packages/fluxiq/src/runtime/contracts.ts` | Values a command carries that its caller supplied from run-time data of unknown sensitivity. The runtime is told that they are withheld, never why. |
| `FluxIQSetupOptions` | Type | `packages/fluxiq/src/framework/index.ts` | - |
| `FluxIQSetupResult` | Type | `packages/fluxiq/src/framework/index.ts` | - |
| `fluxiqStatusLabel` | Value | `packages/fluxiq/src/ui/index.ts` | - |
| `fluxiqStatusTone` | Value | `packages/fluxiq/src/ui/index.ts` | - |
| `FluxIQStorageConfig` | Type | `packages/fluxiq/src/framework/storage-layout.ts` | - |
| `FluxIQStorageInspection` | Type | `packages/fluxiq/src/framework/storage-layout.ts` | - |
| `FluxIQStorageMigrationResult` | Type | `packages/fluxiq/src/framework/storage-migration.ts` | - |
| `FluxIQTheme` | Type | `packages/fluxiq/src/ui/index.ts` | - |
| `FluxIQThemeColorToken` | Type | `packages/fluxiq/src/ui/index.ts` | - |
| `FluxIQUncommittedV2AdoptionResult` | Type | `packages/fluxiq/src/framework/uncommitted-v2-adoption.ts` | - |
| `FrameworkResult` | Type | `packages/fluxiq/src/core/index.ts` | - |
| `GeneratedDocumentationPage` | Type | `packages/fluxiq/src/programs/docs/types.ts` | - |
| `GeneratedMetadata` | Type | `packages/fluxiq/src/programs/automation-studio/model/evidence.ts` | - |
| `GenerateFlowBootstrapAdaptationFailureDiagnostic` | Type | `packages/fluxiq/src/programs/automation-studio/api/contracts/adaptation.ts` | - |
| `GenerateFlowBootstrapAdaptationRequest` | Type | `packages/fluxiq/src/programs/automation-studio/api/contracts/adaptation.ts` | - |
| `GenerateFlowBootstrapAdaptationResponse` | Type | `packages/fluxiq/src/programs/automation-studio/api/contracts/adaptation.ts` | - |
| `generateFlowTypeScript` | Value | `packages/fluxiq/src/programs/automation-studio/dsl/generator.ts` | - |
| `GeneratePolicyRequest` | Type | `packages/fluxiq/src/programs/automation-studio/api/contracts/policy.ts` | - |
| `GeneratePolicyResponse` | Type | `packages/fluxiq/src/programs/automation-studio/api/contracts/policy.ts` | - |
| `GenerateRecordingProposalInput` | Type | `packages/fluxiq/src/programs/automation-studio/runtime/service/proposals/types.ts` | - |
| `GenerateRecordingProposalResult` | Type | `packages/fluxiq/src/programs/automation-studio/runtime/service/proposals/types.ts` | - |
| `getAutomationNodeDefinition` | Value | `packages/fluxiq/src/programs/automation-studio/nodes/registry.ts` | - |
| `getAutomationNodeDefinitions` | Value | `packages/fluxiq/src/programs/automation-studio/nodes/registry.ts` | - |
| `getAutomationNodeDefinitionsByClass` | Value | `packages/fluxiq/src/programs/automation-studio/nodes/registry.ts` | - |
| `getCallFlowConfiguration` | Value | `packages/fluxiq/src/programs/automation-studio/model/composites.ts` | - |
| `GetProposalRequest` | Type | `packages/fluxiq/src/programs/automation-studio/api/contracts/recording.ts` | - |
| `GetRecordingEntryStateRequest` | Type | `packages/fluxiq/src/programs/automation-studio/api/contracts/recording.ts` | - |
| `GetRuntimeRunRequest` | Type | `packages/fluxiq/src/programs/runtime-control/api/contracts.ts` | - |
| `GetStateSnapshotRequest` | Type | `packages/fluxiq/src/programs/automation-studio/api/contracts/recording.ts` | - |
| `GLOBAL_PROGRAMS` | Object | `packages/fluxiq/src/programs/_shared/catalog.ts` | - |
| `GlobalProgramApiRegistry` | Class | `packages/fluxiq/src/programs/_shared/api.ts` | - |
| `GlobalProgramDefinition` | Type | `packages/fluxiq/src/programs/_shared/types.ts` | - |
| `GlobalProgramRuntime` | Type | `packages/fluxiq/src/programs/_shared/runtime.ts` | - |
| `GraphPatchOperation` | Type | `packages/fluxiq/src/programs/automation-studio/api/contracts/graph.ts` | - |
| `GraphViewportRequest` | Type | `packages/fluxiq/src/programs/automation-studio/api/contracts/graph.ts` | - |
| `holdAutomationStudioRecoveryPatchReserve` | Value | `packages/fluxiq/src/programs/automation-studio/runtime/recovery/annotation/patch-reserve.ts` | - |
| `hostExpectationEvaluator` | Value | `packages/fluxiq/src/programs/automation-studio/runtime/host-runtime.ts` | - |
| `hostRuntimeCapabilityIds` | Value | `packages/fluxiq/src/programs/automation-studio/runtime/host-runtime.ts` | - |
| `IDENTITY_ACCESS_ENDPOINTS` | Object | `packages/fluxiq/src/programs/identity-access/api/contracts.ts` | - |
| `IDENTITY_ACCESS_PROGRAM` | Object | `packages/fluxiq/src/programs/identity-access/metadata.ts` | - |
| `IdentityAccessPanel` | Type | `packages/fluxiq/src/programs/identity-access/ui/contracts.ts` | - |
| `IdentityAccessService` | Class | `packages/fluxiq/src/programs/identity-access/runtime/service.ts` | - |
| `IdentityAccessServiceOptions` | Type | `packages/fluxiq/src/programs/identity-access/types.ts` | - |
| `IdentityAccessSnapshot` | Type | `packages/fluxiq/src/programs/identity-access/types.ts` | - |
| `IdentityAccessSnapshotResponse` | Type | `packages/fluxiq/src/programs/identity-access/api/contracts.ts` | - |
| `IdentityAccessStore` | Type | `packages/fluxiq/src/programs/identity-access/storage/contracts.ts` | - |
| `IdentityAccessViewState` | Type | `packages/fluxiq/src/programs/identity-access/ui/contracts.ts` | - |
| `IdentityCredentialChange` | Type | `packages/fluxiq/src/programs/identity-access/types.ts` | A password change announced to credential-change subscribers, such as a program that re-seals data under the new password. `currentPassword` is set only for a self-service change, where the account's own current password was proven for it; an administrator's reset of another account carries none, so data sealed under the old password cannot be recovered. |
| `IdentityCredentialChangeSubscriber` | Type | `packages/fluxiq/src/programs/identity-access/types.ts` | The credential-change port. Every subscriber `prepare`s before the credential is written, and a `prepare` that throws refuses the change. After the write each subscriber is sent `commit`; when a `prepare` or the write fails, each subscriber asked to prepare is sent `abort` instead. |
| `initializeFluxIQStorage` | Value | `packages/fluxiq/src/framework/storage-layout.ts` | - |
| `initialNodeStatePhases` | Object | `packages/fluxiq/src/programs/automation-studio/model/node-state.ts` | - |
| `InputAdapter` | Type | `packages/fluxiq/src/io/index.ts` | - |
| `InputOutputBinding` | Type | `packages/fluxiq/src/io/index.ts` | - |
| `InputReadRequest` | Type | `packages/fluxiq/src/io/index.ts` | - |
| `inspectFluxIQStorage` | Value | `packages/fluxiq/src/framework/storage-layout.ts` | - |
| `InspectStateDiffRequest` | Type | `packages/fluxiq/src/programs/automation-studio/api/contracts/recording.ts` | - |
| `interpretAutomationStudioConversationTurn` | Value | `packages/fluxiq/src/programs/automation-studio/runtime/conversations/instructions/interpret.ts` | - |
| `inventoryAutomationStudioLegacyProject` | Value | `packages/fluxiq/src/programs/automation-studio/storage/project/migration-cutover.ts` | - |
| `IoAdapterSummary` | Type | `packages/fluxiq/src/io/index.ts` | - |
| `IoEnvelope` | Type | `packages/fluxiq/src/io/index.ts` | - |
| `IoInputRole` | Type | `packages/fluxiq/src/io/index.ts` | - |
| `IoMode` | Type | `packages/fluxiq/src/io/index.ts` | - |
| `IoRegistration` | Type | `packages/fluxiq/src/io/index.ts` | - |
| `IoRegistry` | Class | `packages/fluxiq/src/io/index.ts` | - |
| `IoSnapshot` | Type | `packages/fluxiq/src/io/index.ts` | - |
| `IoUnsubscribe` | Type | `packages/fluxiq/src/io/index.ts` | - |
| `IoValidationIssue` | Type | `packages/fluxiq/src/io/index.ts` | - |
| `isAutomationNodeParameterStateBinding` | Value | `packages/fluxiq/src/programs/automation-studio/nodes/parameter-bindings.ts` | - |
| `isAutomationStudioActionConsequence` | Value | `packages/fluxiq/src/programs/automation-studio/runtime/action-permissions/consequences.ts` | - |
| `isAutomationStudioActionPermissionCarriedName` | Value | `packages/fluxiq/src/programs/automation-studio/runtime/action-permissions/request.ts` | - |
| `isAutomationStudioAdaptationId` | Value | `packages/fluxiq/src/programs/automation-studio/runtime/flow-change/node-adaptation/ids.ts` | - |
| `isAutomationStudioAdaptiveFailureClass` | Value | `packages/contracts/src/failure/adaptive-class.ts` | - |
| `isAutomationStudioAuthoringMode` | Value | `packages/fluxiq/src/programs/automation-studio/model/authoring-mode/authoring-mode.ts` | - |
| `isAutomationStudioConversationAuthor` | Value | `packages/fluxiq/src/programs/automation-studio/runtime/conversations/turn.ts` | - |
| `isAutomationStudioConversationStatus` | Value | `packages/fluxiq/src/programs/automation-studio/runtime/conversations/thread.ts` | - |
| `isAutomationStudioConversationSubjectKind` | Value | `packages/fluxiq/src/programs/automation-studio/runtime/conversations/thread.ts` | - |
| `isAutomationStudioDeepSeekModel` | Value | `packages/fluxiq/src/programs/automation-studio/runtime/llm/deepseek/models.ts` | - |
| `isAutomationStudioDestructiveActionConsequence` | Value | `packages/fluxiq/src/programs/automation-studio/runtime/action-permissions/destructive.ts` | - |
| `isAutomationStudioElementTarget` | Value | `packages/fluxiq/src/programs/automation-studio/model/action-element-target.ts` | - |
| `isAutomationStudioEvidenceFlowBootstrapResultWithinLimits` | Value | `packages/fluxiq/src/programs/automation-studio/runtime/flow-bootstrap/plan/evidence-schema.ts` | - |
| `isAutomationStudioExplorationOutcome` | Value | `packages/fluxiq/src/programs/automation-studio/runtime/recovery/exploration-outcome.ts` | - |
| `isAutomationStudioExplorationStepReplayable` | Value | `packages/fluxiq/src/programs/automation-studio/runtime/exploration-reduction/step.ts` | - |
| `isAutomationStudioExploredEvidenceLabel` | Value | `packages/fluxiq/src/programs/automation-studio/runtime/llm/harness/explored-evidence-label.ts` | - |
| `isAutomationStudioLlmRecentActionContext` | Value | `packages/fluxiq/src/programs/automation-studio/runtime/llm/harness/context-packet.ts` | - |
| `isAutomationStudioLoopStage` | Value | `packages/fluxiq/src/programs/automation-studio/runtime/llm/stages/protocol.ts` | - |
| `isAutomationStudioModelAuthoredTargetOverrideTarget` | Value | `packages/fluxiq/src/programs/automation-studio/runtime/llm/harness/structured-response.ts` | - |
| `isAutomationStudioNoRepairReason` | Value | `packages/fluxiq/src/programs/automation-studio/runtime/llm/harness/structured-response.ts` | - |
| `isAutomationStudioObjectReference` | Value | `packages/fluxiq/src/programs/automation-studio/storage/object-store.ts` | - |
| `isAutomationStudioRuntimeTargetOverrideTarget` | Value | `packages/fluxiq/src/programs/automation-studio/runtime/llm/harness/structured-response.ts` | - |
| `isAutomationStudioSubflowGraphMetadata` | Value | `packages/fluxiq/src/programs/automation-studio/model/flows.ts` | - |
| `isRecord` | Value | `packages/fluxiq/src/programs/automation-studio/runtime/flow-bootstrap/generation-failure/diagnostic-parse.ts` | - |
| `isRecordingIndex` | Value | `packages/fluxiq/src/programs/automation-studio/storage/state-index.ts` | - |
| `JsonObject` | Type | `packages/contracts/src/core.ts` | - |
| `JsonPrimitive` | Type | `packages/contracts/src/core.ts` | - |
| `JsonValue` | Type | `packages/contracts/src/core.ts` | - |
| `latestStateSnapshot` | Value | `packages/fluxiq/src/programs/automation-studio/model/recording-domain.ts` | - |
| `LearnedActionCluster` | Type | `packages/fluxiq/src/programs/automation-studio/learning/contracts.ts` | - |
| `LearnedConditionCandidate` | Type | `packages/fluxiq/src/programs/automation-studio/mining/contracts.ts` | - |
| `LearnedConditionRole` | Type | `packages/fluxiq/src/programs/automation-studio/mining/contracts.ts` | - |
| `LearnedEffect` | Type | `packages/fluxiq/src/programs/automation-studio/learning/contracts.ts` | - |
| `LearnedTaskModel` | Type | `packages/fluxiq/src/programs/automation-studio/learning/contracts.ts` | - |
| `learnedTaskModelDocumentId` | Value | `packages/fluxiq/src/programs/automation-studio/storage/ids.ts` | - |
| `LearnedTransition` | Type | `packages/fluxiq/src/programs/automation-studio/learning/contracts.ts` | - |
| `LearningUncertainty` | Type | `packages/fluxiq/src/programs/automation-studio/learning/contracts.ts` | - |
| `LearnTaskModelRequest` | Type | `packages/fluxiq/src/programs/automation-studio/api/contracts/policy.ts` | - |
| `ListGraphRevisionsRequest` | Type | `packages/fluxiq/src/programs/automation-studio/api/contracts/graph.ts` | - |
| `ListRecordingDomainsResponse` | Type | `packages/fluxiq/src/programs/automation-studio/api/contracts/recording.ts` | - |
| `loadFluxIQEnv` | Value | `packages/fluxiq/src/framework/index.ts` | - |
| `LoadFluxIQEnvOptions` | Type | `packages/fluxiq/src/framework/index.ts` | - |
| `MarkerEntry` | Type | `packages/fluxiq/src/programs/automation-studio/model/timeline.ts` | - |
| `MAX_DIAGNOSTIC_ISSUE_CODES` | Object | `packages/fluxiq/src/programs/automation-studio/runtime/flow-bootstrap/generation-failure/diagnostic.ts` | - |
| `measureAutomationStudioGraphStoreBenchmark` | Value | `packages/fluxiq/src/programs/automation-studio/testing/scale-graph-store.ts` | - |
| `measureAutomationStudioLegacyBaseline` | Value | `packages/fluxiq/src/programs/automation-studio/testing/scale-baseline.ts` | - |
| `migrateAutomationStudioLegacyObjectIndex` | Value | `packages/fluxiq/src/programs/automation-studio/storage/project/object-index-migration.ts` | - |
| `migrateAutomationStudioLegacyProjectCatalog` | Value | `packages/fluxiq/src/programs/automation-studio/storage/catalog-index-migration.ts` | - |
| `migrateFluxIQStorage` | Value | `packages/fluxiq/src/framework/storage-migration.ts` | - |
| `MigrateLegacyFlowRepresentationRequest` | Type | `packages/fluxiq/src/programs/automation-studio/api/contracts/subflow.ts` | - |
| `Migration` | Type | `packages/fluxiq/src/programs/database-manager/types.ts` | - |
| `MigrationRun` | Type | `packages/fluxiq/src/programs/database-manager/types.ts` | - |
| `MineRecordingEvidenceRequest` | Type | `packages/fluxiq/src/programs/automation-studio/api/contracts/recording.ts` | - |
| `MiningWindow` | Type | `packages/fluxiq/src/programs/automation-studio/mining/contracts.ts` | - |
| `MiningWindowKind` | Type | `packages/fluxiq/src/programs/automation-studio/mining/contracts.ts` | - |
| `MockClientGatewayClient` | Class | `packages/fluxiq/src/client-gateway/testing/mock-client.ts` | - |
| `MutateFlowMapRouteRequest` | Type | `packages/fluxiq/src/programs/automation-studio/api/contracts/flow-map.ts` | - |
| `NavigationItem` | Type | `packages/fluxiq/src/ui/index.ts` | - |
| `NodeEvidenceBinding` | Type | `packages/fluxiq/src/programs/automation-studio/model/evidence.ts` | - |
| `NodeEvidenceRole` | Type | `packages/fluxiq/src/programs/automation-studio/model/evidence.ts` | - |
| `NodeStatePhase` | Type | `packages/fluxiq/src/programs/automation-studio/model/node-state.ts` | - |
| `NodeStateRuntimeComparison` | Type | `packages/fluxiq/src/programs/automation-studio/model/node-state.ts` | - |
| `NodeStateSource` | Type | `packages/fluxiq/src/programs/automation-studio/model/node-state.ts` | - |
| `NodeStateSourceKind` | Type | `packages/fluxiq/src/programs/automation-studio/model/node-state.ts` | - |
| `NodeStateViewSelection` | Type | `packages/fluxiq/src/programs/automation-studio/model/node-state.ts` | - |
| `NormalizationIssue` | Type | `packages/fluxiq/src/programs/automation-studio/normalization/contracts.ts` | - |
| `NormalizationIssueSeverity` | Type | `packages/fluxiq/src/programs/automation-studio/normalization/contracts.ts` | - |
| `NormalizationOptions` | Type | `packages/fluxiq/src/programs/automation-studio/normalization/contracts.ts` | - |
| `NormalizationReviewArtifact` | Type | `packages/fluxiq/src/programs/automation-studio/runtime/service/recordings/types.ts` | - |
| `normalizeAutomationStudioElementTarget` | Value | `packages/fluxiq/src/programs/automation-studio/model/action-element-target.ts` | - |
| `normalizeAutomationStudioFlow` | Value | `packages/fluxiq/src/programs/automation-studio/dsl/compiler.ts` | - |
| `normalizeAutomationStudioFlowBuildPlan` | Value | `packages/fluxiq/src/programs/automation-studio/runtime/flow-bootstrap/adaptation.ts` | - |
| `normalizeAutomationStudioName` | Value | `packages/fluxiq/src/programs/automation-studio/nodes/name-match/normalize.ts` | - |
| `normalizeAutomationStudioRuntimeInterventionMode` | Value | `packages/fluxiq/src/programs/automation-studio/runtime/service/runtime-adaptation/intervention-mode.ts` | - |
| `normalizedAutomationStudioLlmProviderFailure` | Value | `packages/fluxiq/src/programs/automation-studio/runtime/llm/provider-contract.ts` | - |
| `normalizeDomainId` | Value | `packages/fluxiq/src/domains/index.ts` | - |
| `NormalizedTimeline` | Type | `packages/fluxiq/src/programs/automation-studio/normalization/contracts.ts` | - |
| `normalizedTimelineDocumentId` | Value | `packages/fluxiq/src/programs/automation-studio/storage/ids.ts` | - |
| `NormalizedTimelineProjectRequest` | Type | `packages/fluxiq/src/programs/automation-studio/api/contracts/recording.ts` | - |
| `normalizeFluxIQStatus` | Value | `packages/fluxiq/src/ui/index.ts` | - |
| `NormalizeRecordingRequest` | Type | `packages/fluxiq/src/programs/automation-studio/api/contracts/recording.ts` | - |
| `normalizeRecordingTimeline` | Value | `packages/fluxiq/src/programs/automation-studio/normalization/default-normalizer.ts` | - |
| `NoteEntry` | Type | `packages/fluxiq/src/programs/automation-studio/model/timeline.ts` | - |
| `ObservationEntry` | Type | `packages/fluxiq/src/programs/automation-studio/model/timeline.ts` | - |
| `observeAutomationStudioEvidenceLoop` | Value | `packages/fluxiq/src/programs/automation-studio/runtime/activity/observer.ts` | - |
| `OutputAdapter` | Type | `packages/fluxiq/src/io/index.ts` | - |
| `OutputDispatchRequest` | Type | `packages/fluxiq/src/io/index.ts` | - |
| `OutputDispatchResult` | Type | `packages/fluxiq/src/io/index.ts` | - |
| `packAutomationStudioLlmContext` | Value | `packages/fluxiq/src/programs/automation-studio/runtime/llm/harness/context-packet.ts` | - |
| `packAutomationStudioReusableLlmContext` | Value | `packages/fluxiq/src/programs/automation-studio/runtime/reusable-llm-context.ts` | - |
| `ParameterDefinition` | Type | `packages/fluxiq/src/programs/automation-studio/model/actions.ts` | - |
| `parseAutomationStudioActionPermissionRequest` | Value | `packages/fluxiq/src/programs/automation-studio/runtime/action-permissions/request.ts` | - |
| `parseAutomationStudioCandidateAuthoringResult` | Value | `packages/fluxiq/src/programs/automation-studio/runtime/flow-bootstrap/authoring-result/parse.ts` | - |
| `parseAutomationStudioCandidateProposalResult` | Value | `packages/fluxiq/src/programs/automation-studio/runtime/flow-bootstrap/authoring-result/parse.ts` | - |
| `parseAutomationStudioConversationDecision` | Value | `packages/fluxiq/src/programs/automation-studio/runtime/conversations/instructions/parse.ts` | - |
| `parseAutomationStudioDeterministicPath` | Value | `packages/fluxiq/src/programs/automation-studio/model/validation/adaptation.ts` | - |
| `parseAutomationStudioFailureRecord` | Value | `packages/contracts/src/failure/parse-record.ts` | - |
| `parseAutomationStudioFlowBootstrapBuildEnding` | Value | `packages/fluxiq/src/programs/automation-studio/runtime/flow-bootstrap/generation-failure/build-ending.ts` | - |
| `parseAutomationStudioFlowBootstrapCandidateKept` | Value | `packages/fluxiq/src/programs/automation-studio/runtime/flow-bootstrap/generation-failure/candidate-kept.ts` | - |
| `parseAutomationStudioFlowBootstrapCreationSpend` | Value | `packages/fluxiq/src/programs/automation-studio/runtime/flow-bootstrap/creation-spend/parse.ts` | - |
| `parseAutomationStudioFlowBootstrapEvidenceSteps` | Value | `packages/fluxiq/src/programs/automation-studio/runtime/flow-bootstrap/evidence-loop-steps.ts` | - |
| `parseAutomationStudioFlowBootstrapFailureDiagnostic` | Value | `packages/fluxiq/src/programs/automation-studio/runtime/flow-bootstrap/generation-failure/diagnostic-parse.ts` | - |
| `parseAutomationStudioFlowBootstrapGenerationError` | Value | `packages/fluxiq/src/programs/automation-studio/runtime/flow-bootstrap/generation-failure/error.ts` | - |
| `parseAutomationStudioFlowBootstrapGenerationReadiness` | Value | `packages/fluxiq/src/programs/automation-studio/api/contracts/adaptation.ts` | - |
| `parseAutomationStudioFlowBootstrapIncompleteDraft` | Value | `packages/fluxiq/src/programs/automation-studio/runtime/flow-bootstrap/incomplete-draft/parse.ts` | - |
| `parseAutomationStudioFlowBootstrapPlan` | Value | `packages/fluxiq/src/programs/automation-studio/runtime/flow-bootstrap/plan/parsing.ts` | - |
| `parseAutomationStudioFlowBootstrapProviderThrow` | Value | `packages/fluxiq/src/programs/automation-studio/runtime/flow-bootstrap/generation-failure/diagnostic-parse.ts` | - |
| `parseAutomationStudioFlowChangeOrigin` | Value | `packages/fluxiq/src/programs/automation-studio/model/validation/adaptation.ts` | - |
| `parseAutomationStudioFlowScript` | Value | `packages/fluxiq/src/programs/automation-studio/runtime/flow-bootstrap/authoring/parse.ts` | - |
| `parseAutomationStudioLlmProviderRefusal` | Value | `packages/fluxiq/src/programs/automation-studio/runtime/provider-refusal/record.ts` | - |
| `parseAutomationStudioLlmProviderResult` | Value | `packages/fluxiq/src/programs/automation-studio/runtime/llm/harness/provider-result.ts` | - |
| `parseAutomationStudioObjectContentRef` | Value | `packages/fluxiq/src/programs/automation-studio/storage/object-store.ts` | - |
| `parseAutomationStudioPanelCapabilities` | Value | `packages/fluxiq/src/programs/automation-studio/runtime/panel-capabilities/parse.ts` | - |
| `parseAutomationStudioPermittedConsequences` | Value | `packages/fluxiq/src/programs/automation-studio/runtime/action-permissions/consequences.ts` | - |
| `parseAutomationStudioRecordOutput` | Value | `packages/contracts/src/record-sets/parse-output.ts` | - |
| `parseConstrainedFlowModule` | Value | `packages/fluxiq/src/programs/automation-studio/dsl/source.ts` | - |
| `pathSize` | Value | `packages/fluxiq/src/framework/storage-layout.ts` | - |
| `Permission` | Type | `packages/fluxiq/src/programs/identity-access/types.ts` | - |
| `planAutomationStudioRuntimeRecovery` | Value | `packages/fluxiq/src/programs/automation-studio/runtime/recovery/plan.ts` | - |
| `PolicyAction` | Type | `packages/fluxiq/src/programs/automation-studio/model/actions.ts` | - |
| `PolicyEdge` | Type | `packages/fluxiq/src/programs/automation-studio/model/policies.ts` | - |
| `PolicyGraph` | Type | `packages/fluxiq/src/programs/automation-studio/model/policies.ts` | - |
| `policyGraphDocumentId` | Value | `packages/fluxiq/src/programs/automation-studio/storage/ids.ts` | - |
| `PolicyGraphPatch` | Type | `packages/fluxiq/src/programs/automation-studio/runtime/policy-model.ts` | - |
| `PolicyNode` | Type | `packages/fluxiq/src/programs/automation-studio/model/policies.ts` | - |
| `PolicyProposalArtifact` | Type | `packages/fluxiq/src/programs/automation-studio/runtime/policy-model.ts` | - |
| `PolicyRunner` | Type | `packages/fluxiq/src/programs/automation-studio/runtime/contracts.ts` | - |
| `PollComputeCommandsRequest` | Type | `packages/fluxiq/src/programs/compute-control/api/contracts.ts` | - |
| `preflightAutomationStudioRuntimePatch` | Value | `packages/fluxiq/src/programs/automation-studio/runtime/live-patch.ts` | - |
| `preflightAutomationStudioRuntimeTargetOverrideProposal` | Value | `packages/fluxiq/src/programs/automation-studio/runtime/live-patch.ts` | - |
| `PreflightDefinition` | Type | `packages/fluxiq/src/programs/automation-studio/model/actions.ts` | - |
| `ProcessFinalizedRecordingRequest` | Type | `packages/fluxiq/src/programs/automation-studio/api/contracts/recording.ts` | - |
| `ProcessFinalizedRecordingResult` | Type | `packages/fluxiq/src/programs/automation-studio/runtime/service/proposals/types.ts` | - |
| `processRecordingDomainEvent` | Value | `packages/fluxiq/src/programs/automation-studio/model/recording-domain.ts` | - |
| `PRODUCTION_RUNNER_ENDPOINTS` | Object | `packages/fluxiq/src/programs/production-runner/api/contracts.ts` | - |
| `PRODUCTION_RUNNER_PROGRAM` | Object | `packages/fluxiq/src/programs/production-runner/metadata.ts` | - |
| `ProductionRun` | Type | `packages/fluxiq/src/programs/production-runner/types.ts` | - |
| `ProductionRunDispatcher` | Type | `packages/fluxiq/src/programs/production-runner/runtime/service.ts` | - |
| `ProductionRunExecution` | Type | `packages/fluxiq/src/programs/production-runner/types.ts` | - |
| `ProductionRunnerPanel` | Type | `packages/fluxiq/src/programs/production-runner/ui/contracts.ts` | - |
| `ProductionRunnerService` | Class | `packages/fluxiq/src/programs/production-runner/runtime/service.ts` | - |
| `ProductionRunnerSnapshot` | Type | `packages/fluxiq/src/programs/production-runner/types.ts` | - |
| `ProductionRunnerSnapshotResponse` | Type | `packages/fluxiq/src/programs/production-runner/api/contracts.ts` | - |
| `ProductionRunnerStore` | Type | `packages/fluxiq/src/programs/production-runner/storage/contracts.ts` | - |
| `ProductionRunnerViewState` | Type | `packages/fluxiq/src/programs/production-runner/ui/contracts.ts` | - |
| `ProductionRunResponse` | Type | `packages/fluxiq/src/programs/production-runner/api/contracts.ts` | - |
| `ProductionRunStatus` | Type | `packages/fluxiq/src/programs/production-runner/types.ts` | - |
| `ProductionRunTargetType` | Type | `packages/fluxiq/src/programs/production-runner/types.ts` | - |
| `ProductionTarget` | Type | `packages/fluxiq/src/programs/production-runner/types.ts` | - |
| `ProgramApiActor` | Type | `packages/fluxiq/src/programs/_shared/api.ts` | - |
| `ProgramApiHandler` | Type | `packages/fluxiq/src/programs/_shared/api.ts` | - |
| `ProgramApiRequest` | Type | `packages/fluxiq/src/programs/_shared/api.ts` | - |
| `ProgramApiResponse` | Type | `packages/fluxiq/src/programs/_shared/api.ts` | - |
| `programAuthorizationPinError` | Value | `packages/fluxiq/src/programs/_shared/authorization.ts` | - |
| `ProgramDirectory` | Type | `packages/fluxiq/src/programs/_shared/types.ts` | - |
| `ProgramDirectoryContract` | Type | `packages/contracts/src/program-api.ts` | - |
| `programDirectorySchema` | Object | `packages/contracts/src/program-api.ts` | - |
| `ProgramEndpointClassification` | Type | `packages/fluxiq/src/programs/_shared/api.ts` | What an endpoint does to persisted state, and therefore which credential the registry requires beyond the endpoint's permission. Every registration declares one, so a new endpoint cannot reach the wire unclassified: omitting the field is a compile error, not a review note. - `read` — persists nothing. The permission is the whole gate. - `authoring` — creates or edits user content, or withdraws access without removing persisted data. The permission is the whole gate: the operator's PIN guards destruction, not authorship, so an autonomous loop can build and edit Flows with nobody at the keyboard, and revoking a compromised session or client never waits behind a prompt. - `destructive` — removes persisted user data, or takes an irreversible external action. `call()` requires the operator's session PIN before the handler runs. - `program-gated` — the owning program runs its own, stronger credential check inside the handler (password, PIN and TOTP, or a time-boxed grant). The registry adds nothing, so that one regime stays the single rule. - `destructive-ungated` — destructive, and no credential is checked. A declared gap, not an endorsement: either no operator auth session reaches the program at all, or the gate was never written. Each one is listed in `docs/architecture/automation-studio/persistence.md`. |
| `ProgramEndpointPerformanceMetric` | Type | `packages/fluxiq/src/programs/_shared/performance-metrics.ts` | - |
| `ProgramPinAuthorizationPayload` | Type | `packages/fluxiq/src/programs/_shared/authorization.ts` | - |
| `ProgramScope` | Type | `packages/fluxiq/src/programs/_shared/types.ts` | - |
| `ProgramScopeContract` | Type | `packages/contracts/src/program-api.ts` | - |
| `programScopeSchema` | Object | `packages/contracts/src/program-api.ts` | - |
| `ProgramStatus` | Type | `packages/fluxiq/src/programs/_shared/types.ts` | - |
| `ProgramSummary` | Type | `packages/fluxiq/src/programs/_shared/types.ts` | - |
| `ProgramSummaryContract` | Type | `packages/contracts/src/program-api.ts` | - |
| `programSummarySchema` | Object | `packages/contracts/src/program-api.ts` | - |
| `ProjectDatasetListRequest` | Type | `packages/fluxiq/src/programs/automation-studio/api/contracts/dataset.ts` | The Data window's tables for a project, newest write first (CD21). |
| `projectPublishedFlowSnapshotToNodeDefinition` | Value | `packages/fluxiq/src/programs/automation-studio/model/composites.ts` | - |
| `projectSummaryFromProject` | Value | `packages/fluxiq/src/programs/automation-studio/storage/file-store.ts` | - |
| `ProposalNodeStateLink` | Type | `packages/fluxiq/src/programs/automation-studio/storage/state-index.ts` | - |
| `proposalSummaryFromPolicyProposal` | Value | `packages/fluxiq/src/programs/automation-studio/storage/file-store.ts` | - |
| `proposalSummaryFromRecordingFlowProposal` | Value | `packages/fluxiq/src/programs/automation-studio/storage/file-store.ts` | - |
| `proposeAutomationStudioRuntimeTargetOverride` | Value | `packages/fluxiq/src/programs/automation-studio/runtime/live-patch.ts` | - |
| `ProposePolicyFromModelRequest` | Type | `packages/fluxiq/src/programs/automation-studio/api/contracts/policy.ts` | - |
| `PublishFlowRequest` | Type | `packages/fluxiq/src/programs/automation-studio/api/contracts/flow.ts` | - |
| `readAutomationStudioActionDeclaration` | Value | `packages/fluxiq/src/programs/automation-studio/runtime/action-permissions/declaration.ts` | - |
| `readAutomationStudioInstructedConsequences` | Value | `packages/fluxiq/src/programs/automation-studio/runtime/action-permissions/instructed.ts` | - |
| `readAutomationStudioInstructedRead` | Value | `packages/fluxiq/src/programs/automation-studio/runtime/action-permissions/instructed.ts` | - |
| `readAutomationStudioInstructionReading` | Value | `packages/fluxiq/src/programs/automation-studio/runtime/action-permissions/instruction-reading/read.ts` | - |
| `readAutomationStudioInstructionRoute` | Value | `packages/fluxiq/src/programs/automation-studio/runtime/action-permissions/instruction-route/read.ts` | - |
| `readMigrationJournal` | Value | `packages/fluxiq/src/framework/storage-layout.ts` | - |
| `readRecordSets` | Value | `packages/fluxiq/src/programs/automation-studio/runtime/result-verification/run-outcome.ts` | - |
| `readStorageConfig` | Value | `packages/fluxiq/src/framework/storage-layout.ts` | - |
| `recordAutomationStudioAdaptationReplays` | Value | `packages/fluxiq/src/programs/automation-studio/runtime/adaptation-confidence/replay.ts` | - |
| `RecordEnvelope` | Type | `packages/fluxiq/src/programs/database-manager/types.ts` | - |
| `RECORDING_STATE_INDEX_SCHEMA_VERSION` | Object | `packages/fluxiq/src/programs/automation-studio/storage/state-index.ts` | - |
| `RecordingActionIndexItem` | Type | `packages/fluxiq/src/programs/automation-studio/storage/state-index.ts` | - |
| `recordingActionVisualTargetIndexItem` | Value | `packages/fluxiq/src/programs/automation-studio/storage/state-index.ts` | - |
| `RecordingActionVisualTargetIndexItem` | Type | `packages/fluxiq/src/programs/automation-studio/storage/state-index.ts` | - |
| `RecordingDomainDefinition` | Type | `packages/fluxiq/src/programs/automation-studio/model/recording-domain.ts` | - |
| `RecordingDomainEventDefinition` | Type | `packages/fluxiq/src/programs/automation-studio/model/recording-domain.ts` | - |
| `RecordingDomainEventInput` | Type | `packages/fluxiq/src/programs/automation-studio/model/recording-domain.ts` | - |
| `RecordingDomainEventProcessingResult` | Type | `packages/fluxiq/src/programs/automation-studio/model/recording-domain.ts` | - |
| `RecordingDomainEventReducer` | Type | `packages/fluxiq/src/programs/automation-studio/model/recording-domain.ts` | - |
| `RecordingDomainEventReducerContext` | Type | `packages/fluxiq/src/programs/automation-studio/model/recording-domain.ts` | - |
| `RecordingDomainEventValidationIssue` | Type | `packages/fluxiq/src/programs/automation-studio/model/recording-domain.ts` | - |
| `RecordingDomainEventValidationResult` | Type | `packages/fluxiq/src/programs/automation-studio/model/recording-domain.ts` | - |
| `RecordingDomainObservationExtractor` | Type | `packages/fluxiq/src/programs/automation-studio/model/recording-domain.ts` | - |
| `RecordingDomainReducerResult` | Type | `packages/fluxiq/src/programs/automation-studio/model/recording-domain.ts` | - |
| `RecordingDomainRegistry` | Class | `packages/fluxiq/src/programs/automation-studio/model/recording-domain.ts` | - |
| `RecordingDomainStatePathDefinition` | Type | `packages/fluxiq/src/programs/automation-studio/model/recording-domain.ts` | - |
| `RecordingEntryIndexItem` | Type | `packages/fluxiq/src/programs/automation-studio/storage/state-index.ts` | - |
| `RecordingEntryStateLookupInput` | Type | `packages/fluxiq/src/programs/automation-studio/runtime/service/recording-state-index/contracts.ts` | - |
| `RecordingEntryStateLookupResult` | Type | `packages/fluxiq/src/programs/automation-studio/runtime/service/recording-state-index/contracts.ts` | - |
| `RecordingEvent` | Type | `packages/fluxiq/src/programs/automation-studio/types.ts` | - |
| `RecordingEventJsonSchema` | Type | `packages/fluxiq/src/programs/automation-studio/model/recording-domain.ts` | - |
| `RecordingFlowActionCandidate` | Type | `packages/fluxiq/src/programs/automation-studio/runtime/recording-flow-proposal.ts` | - |
| `RecordingFlowProposalArtifact` | Type | `packages/fluxiq/src/programs/automation-studio/runtime/recording-flow-proposal.ts` | - |
| `RecordingFlowProposalDestination` | Type | `packages/fluxiq/src/programs/automation-studio/runtime/recording-flow-proposal.ts` | - |
| `RecordingFlowProposalReview` | Type | `packages/fluxiq/src/programs/automation-studio/runtime/recording-flow-proposal.ts` | - |
| `RecordingIdProjectRequest` | Type | `packages/fluxiq/src/programs/automation-studio/api/contracts/recording.ts` | - |
| `RecordingIndex` | Type | `packages/fluxiq/src/programs/automation-studio/storage/state-index.ts` | - |
| `RecordingIndexSchemaVersion` | Type | `packages/fluxiq/src/programs/automation-studio/storage/state-index.ts` | - |
| `recordingIndexStateObjectRefs` | Value | `packages/fluxiq/src/programs/automation-studio/storage/state-index.ts` | - |
| `RecordingIndexSummary` | Type | `packages/fluxiq/src/programs/automation-studio/storage/state-index.ts` | - |
| `RecordingNote` | Type | `packages/fluxiq/src/programs/automation-studio/model/recordings.ts` | - |
| `RecordingProjectRequest` | Type | `packages/fluxiq/src/programs/automation-studio/api/contracts/recording.ts` | - |
| `recordingProposalDefinitionId` | Value | `packages/fluxiq/src/programs/automation-studio/runtime/recording-flow-proposal.ts` | - |
| `RecordingProposalEvidenceReference` | Type | `packages/fluxiq/src/programs/automation-studio/runtime/recording-flow-proposal.ts` | - |
| `RecordingProposalIndexItem` | Type | `packages/fluxiq/src/programs/automation-studio/storage/state-index.ts` | - |
| `RecordingSession` | Type | `packages/fluxiq/src/programs/automation-studio/model/recordings.ts` | - |
| `recordingSessionDocumentId` | Value | `packages/fluxiq/src/programs/automation-studio/storage/ids.ts` | - |
| `RecordingStateCoordinateSpace` | Type | `packages/fluxiq/src/programs/automation-studio/storage/state-index.ts` | - |
| `RecordingStateIndexItem` | Type | `packages/fluxiq/src/programs/automation-studio/storage/state-index.ts` | - |
| `RecordingStateIndexStore` | Class | `packages/fluxiq/src/programs/automation-studio/storage/recording-index-store.ts` | - |
| `RecordingStateIndexValidationIssue` | Type | `packages/fluxiq/src/programs/automation-studio/storage/state-index.ts` | - |
| `RecordingSummaryItem` | Type | `packages/fluxiq/src/programs/automation-studio/runtime/service/recording-projections/contracts.ts` | - |
| `RecordingSummaryList` | Type | `packages/fluxiq/src/programs/automation-studio/runtime/service/recording-projections/contracts.ts` | - |
| `RecordingTimelineIndex` | Type | `packages/fluxiq/src/programs/automation-studio/storage/state-index.ts` | - |
| `recordProgramEndpointPerformance` | Value | `packages/fluxiq/src/programs/_shared/performance-metrics.ts` | - |
| `recordSqlPerformance` | Value | `packages/fluxiq/src/programs/_shared/performance-metrics.ts` | - |
| `RecoveryPolicy` | Type | `packages/fluxiq/src/programs/automation-studio/model/policies.ts` | - |
| `redeemAutomationStudioResultCheckAuthorization` | Value | `packages/fluxiq/src/programs/automation-studio/runtime/result-check-authorization/redeem.ts` | - |
| `redeemAutomationStudioUnattendedRepairAuthorization` | Value | `packages/fluxiq/src/programs/automation-studio/runtime/result-check-authorization/repair.ts` | - |
| `reduceAutomationStudioExploration` | Value | `packages/fluxiq/src/programs/automation-studio/runtime/exploration-reduction/backward-slice.ts` | - |
| `reduceAutomationStudioFlowBootstrapDraft` | Value | `packages/fluxiq/src/programs/automation-studio/runtime/flow-bootstrap/draft-reduction.ts` | - |
| `registerAutomationStudioApi` | Value | `packages/fluxiq/src/programs/automation-studio/api/handlers/register.ts` | - |
| `registerBackgroundTasksApi` | Value | `packages/fluxiq/src/programs/background-tasks/api/handlers.ts` | - |
| `registerBasicComponents` | Value | `packages/fluxiq/src/components/index.ts` | - |
| `registerComputeControlApi` | Value | `packages/fluxiq/src/programs/compute-control/api/handlers.ts` | - |
| `RegisterComputeNodeRequest` | Type | `packages/fluxiq/src/programs/compute-control/api/contracts.ts` | - |
| `registerDatabaseManagerApi` | Value | `packages/fluxiq/src/programs/database-manager/api/handlers.ts` | - |
| `registerDeploymentSyncApi` | Value | `packages/fluxiq/src/programs/deployment-sync/api/handlers.ts` | - |
| `registerDocsApi` | Value | `packages/fluxiq/src/programs/docs/api/handlers.ts` | - |
| `RegisterDocsSourceRequest` | Type | `packages/fluxiq/src/programs/docs/api/contracts.ts` | - |
| `registerGlobalDocumentationGenerators` | Value | `packages/fluxiq/src/programs/_shared/docs-generators.ts` | - |
| `registerHostDocumentationGenerators` | Value | `packages/fluxiq/src/programs/_shared/docs-generators.ts` | - |
| `registerIdentityAccessApi` | Value | `packages/fluxiq/src/programs/identity-access/api/handlers.ts` | - |
| `registerProductionRunnerApi` | Value | `packages/fluxiq/src/programs/production-runner/api/handlers.ts` | - |
| `RegisterProductionTargetRequest` | Type | `packages/fluxiq/src/programs/production-runner/api/contracts.ts` | - |
| `registerRuntimeApi` | Value | `packages/fluxiq/src/programs/runtime-control/api/handlers.ts` | - |
| `registerSecretKeysApi` | Value | `packages/fluxiq/src/programs/secret-keys/api/handlers.ts` | - |
| `releaseAutomationStudioSessionDeepSeekKey` | Value | `packages/fluxiq/src/programs/automation-studio/runtime/llm/deepseek/session-key.ts` | - |
| `ReleaseComputeLeaseRequest` | Type | `packages/fluxiq/src/programs/compute-control/api/contracts.ts` | - |
| `RemoveRecordingEntryRequest` | Type | `packages/fluxiq/src/programs/automation-studio/api/contracts/recording.ts` | Removes every entry of a still-open recording that was recorded from one gateway event: each entry whose `metadata.eventId` is `eventId`, the id `runtime/io-bridge.ts` copies from the recorded event's envelope. A finalized recording is refused. |
| `RemoveRecordingEntryResponse` | Type | `packages/fluxiq/src/programs/automation-studio/api/contracts/recording.ts` | How many entries were removed, and the recording as a summary: no timeline, notes or state. |
| `RenameFlowSubflowRequest` | Type | `packages/fluxiq/src/programs/automation-studio/api/contracts/subflow.ts` | - |
| `repairAutomationStudioRefutedRunResult` | Value | `packages/fluxiq/src/programs/automation-studio/runtime/recovery/refuted-result/repair.ts` | - |
| `RepairRecordingStateIndexRequest` | Type | `packages/fluxiq/src/programs/automation-studio/api/contracts/recording.ts` | - |
| `RepairRecordingStateIndexResult` | Type | `packages/fluxiq/src/programs/automation-studio/runtime/service/recording-state-index/contracts.ts` | - |
| `replanAutomationStudioRecoveryAfterExploration` | Value | `packages/fluxiq/src/programs/automation-studio/runtime/recovery/annotation/replan.ts` | - |
| `replayAutomationStudioFlowDraft` | Value | `packages/fluxiq/src/programs/automation-studio/runtime/llm/node-tools/replay-draft.ts` | - |
| `ReplayPolicyAgainstRecordingRequest` | Type | `packages/fluxiq/src/programs/automation-studio/api/contracts/policy.ts` | - |
| `ReplayResultArtifact` | Type | `packages/fluxiq/src/programs/automation-studio/runtime/service/recordings/types.ts` | - |
| `Repository` | Type | `packages/fluxiq/src/programs/database-manager/types.ts` | - |
| `RepositoryListPage` | Type | `packages/fluxiq/src/programs/database-manager/types.ts` | - |
| `RepositoryListPageOptions` | Type | `packages/fluxiq/src/programs/database-manager/types.ts` | - |
| `RepositoryScope` | Type | `packages/fluxiq/src/programs/database-manager/types.ts` | - |
| `resolveActionVisualTarget` | Value | `packages/fluxiq/src/programs/automation-studio/model/action-visual-target.ts` | - |
| `ResolveActionVisualTargetInput` | Type | `packages/fluxiq/src/programs/automation-studio/model/action-visual-target.ts` | - |
| `resolveAutomationNodeParameterValues` | Value | `packages/fluxiq/src/programs/automation-studio/nodes/parameter-bindings.ts` | - |
| `resolveAutomationStudioAuthoringMode` | Value | `packages/fluxiq/src/programs/automation-studio/model/authoring-mode/authoring-mode.ts` | - |
| `resolveAutomationStudioDeepSeekModel` | Value | `packages/fluxiq/src/programs/automation-studio/runtime/llm/deepseek/models.ts` | - |
| `resolveAutomationStudioExplorationBudget` | Value | `packages/fluxiq/src/programs/automation-studio/runtime/recovery/exploration-budget.ts` | - |
| `resolveAutomationStudioFlowBootstrapPlanParameters` | Value | `packages/fluxiq/src/programs/automation-studio/runtime/llm/harness-options/plan-parameter-resolution.ts` | - |
| `resolveAutomationStudioFlowCatalog` | Value | `packages/fluxiq/src/programs/automation-studio/model/flow-compatibility.ts` | - |
| `ResolveAutomationStudioFlowCatalogInput` | Type | `packages/fluxiq/src/programs/automation-studio/model/flow-compatibility.ts` | - |
| `resolveAutomationStudioLlmBuildCallLimit` | Value | `packages/fluxiq/src/programs/automation-studio/model/build-call-limit/resolve.ts` | - |
| `resolveAutomationStudioLlmDefaultModel` | Value | `packages/fluxiq/src/programs/automation-studio/runtime/llm/deepseek/models.ts` | - |
| `resolveAutomationStudioLlmInstructions` | Value | `packages/fluxiq/src/programs/automation-studio/runtime/llm/harness/instruction.ts` | - |
| `resolveAutomationStudioLlmRunCostCeilingUsd` | Value | `packages/fluxiq/src/programs/automation-studio/model/run-cost-ceiling/run-cost-ceiling-env.ts` | - |
| `resolveAutomationStudioLlmTestRunCostCeilingUsd` | Value | `packages/fluxiq/src/programs/automation-studio/model/run-cost-ceiling/run-cost-ceiling-env.ts` | - |
| `resolveAutomationStudioLlmTokenLimits` | Value | `packages/fluxiq/src/programs/automation-studio/runtime/llm/harness/token-limits.ts` | - |
| `resolveAutomationStudioRecoveryRunBudget` | Value | `packages/fluxiq/src/programs/automation-studio/runtime/recovery/annotation/run-budget.ts` | - |
| `resolveAutomationStudioResultCheckSchedule` | Value | `packages/fluxiq/src/programs/automation-studio/runtime/result-check-schedule/resolve.ts` | - |
| `resolveAutomationStudioV2Feature` | Value | `packages/fluxiq/src/programs/automation-studio/storage/project/migration-cutover.ts` | - |
| `ResolvedActionVisualTarget` | Type | `packages/fluxiq/src/programs/automation-studio/model/action-visual-target.ts` | - |
| `respondToAutomationStudioConversationTurn` | Value | `packages/fluxiq/src/programs/automation-studio/runtime/conversations/instructions/respond.ts` | - |
| `RestoreGraphSnapshotRequest` | Type | `packages/fluxiq/src/programs/automation-studio/api/contracts/graph.ts` | - |
| `ResultState` | Type | `packages/fluxiq/src/core/index.ts` | - |
| `resumeAutomationStudioGraph` | Value | `packages/fluxiq/src/programs/automation-studio/runtime/executor/resume.ts` | - |
| `resumeAutomationStudioGraphRun` | Value | `packages/fluxiq/src/programs/automation-studio/runtime/executor/graph-run.ts` | - |
| `RetryPolicy` | Type | `packages/fluxiq/src/programs/automation-studio/model/policies.ts` | How many times one step may be attempted, and how long the run waits between those attempts. `backoffMs` had no consumer anywhere in the runtime: a policy could declare a wait and nothing ever waited it. Both fields are now read by `automationStudioNodeRetryPolicy` (`runtime/executor/retry-policy.ts`), which accepts this exact shape from a node's `parameterValues.retry`, a node's `metadata.retry`, or a Flow's `metadata.retry`. `maxAttempts` counts the first attempt, so 6 means one attempt and five retries, and `backoffMs` is the wait before each retry. A declaration can only raise the attempts: the runtime's default of the first attempt and three retries (`AUTOMATION_STUDIO_DEFAULT_NODE_RETRY_POLICY`, t355) is a floor, so asking for fewer than four still gets four. |
| `revealAutomationStudioResultCheckSecret` | Value | `packages/fluxiq/src/programs/automation-studio/runtime/result-check-authorization/reveal.ts` | - |
| `RevealSecretKeyRequest` | Type | `packages/fluxiq/src/programs/secret-keys/api/contracts.ts` | - |
| `RevealSecretKeyResponse` | Type | `packages/fluxiq/src/programs/secret-keys/api/contracts.ts` | - |
| `reviewAutomationStudioExplorationReduction` | Value | `packages/fluxiq/src/programs/automation-studio/runtime/recovery/exploration-state/reduction-review.ts` | - |
| `reviewerApprovalForAdaptation` | Value | `packages/fluxiq/src/programs/automation-studio/runtime/recovery/adaptation-promotion.ts` | - |
| `ReviewFlowAdaptationInput` | Type | `packages/fluxiq/src/programs/automation-studio/runtime/service/adaptation-projections/contracts.ts` | - |
| `ReviewFlowAdaptationRequest` | Type | `packages/fluxiq/src/programs/automation-studio/api/contracts/adaptation.ts` | - |
| `RevokeClientTrustRequest` | Type | `packages/fluxiq/src/programs/automation-studio/api/contracts/client.ts` | - |
| `RevokeSessionRequest` | Type | `packages/fluxiq/src/programs/identity-access/api/contracts.ts` | - |
| `rewriteAutomationNodeStatePaths` | Value | `packages/fluxiq/src/programs/automation-studio/nodes/parameter-bindings.ts` | - |
| `Role` | Type | `packages/fluxiq/src/programs/identity-access/types.ts` | - |
| `rollbackFluxIQStorageMigration` | Value | `packages/fluxiq/src/framework/storage-migration.ts` | - |
| `RotateSecretKeyRequest` | Type | `packages/fluxiq/src/programs/secret-keys/api/contracts.ts` | - |
| `runAutomationStudioCompiledPlan` | Value | `packages/fluxiq/src/programs/automation-studio/runtime/compiled-plan.ts` | - |
| `runAutomationStudioDetachedCandidate` | Value | `packages/fluxiq/src/programs/automation-studio/runtime/flow-bootstrap/verification/detached-execution.ts` | - |
| `runAutomationStudioFlowBootstrapBuildPhases` | Value | `packages/fluxiq/src/programs/automation-studio/runtime/flow-bootstrap/unfinished-build/phases.ts` | - |
| `runAutomationStudioFlowCandidateAuthoringLoop` | Value | `packages/fluxiq/src/programs/automation-studio/runtime/flow-bootstrap/candidate/authoring-loop.ts` | - |
| `runAutomationStudioFlowDraftPart` | Value | `packages/fluxiq/src/programs/automation-studio/runtime/llm/node-tools/run-flow-part.ts` | - |
| `runAutomationStudioGraph` | Value | `packages/fluxiq/src/programs/automation-studio/runtime/executor/graph-run.ts` | - |
| `runAutomationStudioLegacyImporterBatch` | Value | `packages/fluxiq/src/programs/automation-studio/storage/project/migration-cutover.ts` | - |
| `runAutomationStudioLegacyMigrationOrchestration` | Value | `packages/fluxiq/src/programs/automation-studio/storage/project/migration-cutover.ts` | - |
| `runAutomationStudioLlmEvidenceLoop` | Value | `packages/fluxiq/src/programs/automation-studio/runtime/llm/evidence-loop.ts` | - |
| `runAutomationStudioLlmHarness` | Value | `packages/fluxiq/src/programs/automation-studio/runtime/llm/harness/run.ts` | - |
| `runAutomationStudioRecoveryExploration` | Value | `packages/fluxiq/src/programs/automation-studio/runtime/recovery/annotation/exploration.ts` | - |
| `runAutomationStudioRecoveryLadder` | Value | `packages/fluxiq/src/programs/automation-studio/runtime/executor/ladder-run.ts` | - |
| `runAutomationStudioRouter` | Value | `packages/fluxiq/src/programs/automation-studio/runtime/router-runtime.ts` | - |
| `runAutomationStudioRuntimeExploration` | Value | `packages/fluxiq/src/programs/automation-studio/runtime/recovery/runtime-exploration.ts` | - |
| `RunBackgroundTaskRequest` | Type | `packages/fluxiq/src/programs/background-tasks/api/contracts.ts` | - |
| `RunBackgroundTaskResponse` | Type | `packages/fluxiq/src/programs/background-tasks/api/contracts.ts` | - |
| `runCanonicalAutomationStudioFlow` | Value | `packages/fluxiq/src/programs/automation-studio/runtime/composite-executor.ts` | - |
| `runConfirmedAutomationStudioConversationCommand` | Value | `packages/fluxiq/src/programs/automation-studio/runtime/conversations/commands/confirmed.ts` | - |
| `runCurrentNode` | Value | `packages/fluxiq/src/engine/index.ts` | - |
| `RunDatasetDeleteRequest` | Type | `packages/fluxiq/src/programs/automation-studio/api/contracts/dataset.ts` | Without `datasetId`, every dataset the run stored is deleted (CD17). |
| `RunDatasetExportRequest` | Type | `packages/fluxiq/src/programs/automation-studio/api/contracts/dataset.ts` | One dataset as a single CSV or JSON body, or a `tooLarge` answer pointing at the streaming route. |
| `RunDatasetListRequest` | Type | `packages/fluxiq/src/programs/automation-studio/api/contracts/dataset.ts` | Every dataset one run stored. |
| `RunDatasetPageRequest` | Type | `packages/fluxiq/src/programs/automation-studio/api/contracts/dataset.ts` | One page of one dataset's rows, 1-200 rows and 50 by default. |
| `runDatasetSummariesForRun` | Value | `packages/fluxiq/src/programs/automation-studio/storage/project/run-dataset-store.ts` | - |
| `runFlow` | Value | `packages/fluxiq/src/engine/index.ts` | - |
| `runInAutomationStudioConversation` | Value | `packages/fluxiq/src/programs/automation-studio/runtime/conversations/context/run.ts` | - |
| `RUNTIME_ENDPOINTS` | Object | `packages/fluxiq/src/programs/runtime-control/api/contracts.ts` | - |
| `RUNTIME_PROGRAM` | Object | `packages/fluxiq/src/programs/runtime-control/metadata.ts` | - |
| `RuntimeActionAttempt` | Type | `packages/fluxiq/src/programs/automation-studio/model/runtime.ts` | - |
| `runtimeClientFromGatewaySession` | Value | `packages/fluxiq/src/runtime/client-gateway-transport.ts` | - |
| `RuntimeInputs` | Type | `packages/fluxiq/src/io/index.ts` | - |
| `RuntimeMode` | Type | `packages/fluxiq/src/engine/index.ts` | - |
| `RuntimeOutputs` | Type | `packages/fluxiq/src/io/index.ts` | - |
| `RuntimeService` | Class | `packages/fluxiq/src/runtime/service.ts` | - |
| `RuntimeServiceOptions` | Type | `packages/fluxiq/src/runtime/service.ts` | - |
| `RuntimeSession` | Type | `packages/fluxiq/src/engine/index.ts` | - |
| `RuntimeSessionControlRequest` | Type | `packages/fluxiq/src/programs/automation-studio/api/contracts/run.ts` | - |
| `RuntimeSessionOptions` | Type | `packages/fluxiq/src/engine/index.ts` | - |
| `RuntimeStore` | Type | `packages/fluxiq/src/runtime/storage.ts` | - |
| `RuntimeStoreSnapshot` | Type | `packages/fluxiq/src/runtime/storage.ts` | - |
| `runWithAutomationStudioActivity` | Value | `packages/fluxiq/src/programs/automation-studio/runtime/activity/scope.ts` | - |
| `sanitizeAutomationStudioLlmFailureEvidence` | Value | `packages/fluxiq/src/programs/automation-studio/runtime/llm/harness/failure-evidence.ts` | - |
| `sanitizedBootstrapAccounting` | Value | `packages/fluxiq/src/programs/automation-studio/runtime/flow-bootstrap/review-projection.ts` | - |
| `SaveBackgroundTaskScheduleRequest` | Type | `packages/fluxiq/src/programs/background-tasks/api/contracts.ts` | - |
| `SaveFlowGenerationInstructionRequest` | Type | `packages/fluxiq/src/programs/automation-studio/api/contracts/instruction.ts` | - |
| `SaveFlowInstructionRequest` | Type | `packages/fluxiq/src/programs/automation-studio/api/contracts/instruction.ts` | - |
| `SaveFlowMapFallbackRequest` | Type | `packages/fluxiq/src/programs/automation-studio/api/contracts/flow-map.ts` | - |
| `SaveFlowMapRouteGroupRequest` | Type | `packages/fluxiq/src/programs/automation-studio/api/contracts/flow-map.ts` | - |
| `SaveFlowMapRouteRequest` | Type | `packages/fluxiq/src/programs/automation-studio/api/contracts/flow-map.ts` | - |
| `SaveFlowRequest` | Type | `packages/fluxiq/src/programs/automation-studio/api/contracts/flow.ts` | - |
| `sayAutomationStudioResultCheck` | Value | `packages/fluxiq/src/programs/automation-studio/runtime/result-check-schedule/conversation.ts` | - |
| `scaleProfile` | Value | `packages/fluxiq/src/programs/automation-studio/testing/scale-fixtures.ts` | - |
| `scoreElementFingerprintCandidate` | Value | `packages/fluxiq/src/programs/automation-studio/fingerprinting/element-fingerprint.ts` | - |
| `scoreElementFingerprintCandidates` | Value | `packages/fluxiq/src/programs/automation-studio/fingerprinting/element-fingerprint.ts` | - |
| `screenAutomationStudioLlmEvidence` | Value | `packages/fluxiq/src/programs/automation-studio/runtime/llm/harness/evidence-screen.ts` | - |
| `SECRET_KEYS_ENDPOINTS` | Object | `packages/fluxiq/src/programs/secret-keys/api/contracts.ts` | - |
| `SECRET_KEYS_PROGRAM` | Object | `packages/fluxiq/src/programs/secret-keys/metadata.ts` | - |
| `SecretKeyAuthorizationPayload` | Type | `packages/fluxiq/src/programs/secret-keys/api/contracts.ts` | - |
| `SecretKeyCredentialChange` | Type | `packages/fluxiq/src/programs/secret-keys/runtime/credential-changes.ts` | A prepared or committed credential change; `resealedKeyCount` counts the keys re-sealed under the next password. |
| `SecretKeyCredentialChangeInput` | Type | `packages/fluxiq/src/programs/secret-keys/runtime/credential-changes.ts` | - |
| `SecretKeyKind` | Type | `packages/fluxiq/src/programs/secret-keys/types.ts` | - |
| `SecretKeyMutationResponse` | Type | `packages/fluxiq/src/programs/secret-keys/api/contracts.ts` | - |
| `SecretKeyRecord` | Type | `packages/fluxiq/src/programs/secret-keys/types.ts` | - |
| `SecretKeyScope` | Type | `packages/fluxiq/src/programs/secret-keys/types.ts` | - |
| `SecretKeysService` | Class | `packages/fluxiq/src/programs/secret-keys/runtime/service.ts` | Secret Keys: values sealed under account passwords. This class is the public surface; records and their writes live in `SecretKeyStore`, held derived keys in `HeldKeys`, seal upgrades in `SealUpgrades`, and credential changes, including pending seals, in `CredentialChanges`. |
| `SecretKeysSnapshot` | Type | `packages/fluxiq/src/programs/secret-keys/types.ts` | - |
| `SecretKeysSnapshotResponse` | Type | `packages/fluxiq/src/programs/secret-keys/api/contracts.ts` | - |
| `SecretKeySummary` | Type | `packages/fluxiq/src/programs/secret-keys/types.ts` | - |
| `SecretRevealAuthorizationMetadata` | Type | `packages/fluxiq/src/programs/secret-keys/runtime/held-keys.ts` | - |
| `selectActionContextStateCheckpointIds` | Value | `packages/fluxiq/src/programs/automation-studio/normalization/default-normalizer.ts` | - |
| `selectActionContextStateEntryIds` | Value | `packages/fluxiq/src/programs/automation-studio/normalization/default-normalizer.ts` | - |
| `serializedByteCount` | Value | `packages/fluxiq/src/programs/automation-studio/runtime/recovery/context.ts` | - |
| `serializedMetricBytes` | Value | `packages/fluxiq/src/programs/_shared/performance-metrics.ts` | - |
| `Session` | Type | `packages/fluxiq/src/programs/identity-access/types.ts` | - |
| `SessionRequest` | Type | `packages/fluxiq/src/programs/identity-access/api/contracts.ts` | - |
| `SetBackgroundTaskEnabledRequest` | Type | `packages/fluxiq/src/programs/background-tasks/api/contracts.ts` | - |
| `SetIdentitySecretRequest` | Type | `packages/fluxiq/src/programs/identity-access/api/contracts.ts` | - |
| `SignalContribution` | Type | `packages/fluxiq/src/programs/automation-studio/fingerprinting/contracts.ts` | - |
| `SignalDefinition` | Type | `packages/fluxiq/src/programs/automation-studio/model/signals.ts` | - |
| `signalDefinitionFromSchema` | Value | `packages/fluxiq/src/programs/automation-studio/model/signal-registry.ts` | - |
| `SignalMiner` | Type | `packages/fluxiq/src/programs/automation-studio/mining/contracts.ts` | - |
| `SignalMiningResult` | Type | `packages/fluxiq/src/programs/automation-studio/mining/contracts.ts` | - |
| `SignalProvenance` | Type | `packages/fluxiq/src/programs/automation-studio/model/signals.ts` | - |
| `SignalRegistry` | Type | `packages/fluxiq/src/programs/automation-studio/model/signals.ts` | - |
| `SignalRegistryBuildOptions` | Type | `packages/fluxiq/src/programs/automation-studio/model/signal-registry.ts` | - |
| `signalRegistryDocumentId` | Value | `packages/fluxiq/src/programs/automation-studio/storage/ids.ts` | - |
| `signalValueFromSnapshot` | Value | `packages/fluxiq/src/programs/automation-studio/model/signal-registry.ts` | - |
| `slugify` | Value | `packages/fluxiq/src/core/index.ts` | - |
| `sortRecordingIndex` | Value | `packages/fluxiq/src/programs/automation-studio/storage/state-index.ts` | - |
| `SourceDescriptor` | Type | `packages/fluxiq/src/programs/automation-studio/model/descriptors.ts` | - |
| `SQLiteListPage` | Type | `packages/fluxiq/src/programs/database-manager/storage/sqlite-repository.ts` | - |
| `SQLiteListPageOptions` | Type | `packages/fluxiq/src/programs/database-manager/storage/sqlite-repository.ts` | - |
| `SQLiteRepository` | Class | `packages/fluxiq/src/programs/database-manager/storage/sqlite-repository.ts` | - |
| `SQLiteRepositoryOptions` | Type | `packages/fluxiq/src/programs/database-manager/storage/sqlite-repository.ts` | - |
| `SQLiteTransaction` | Type | `packages/fluxiq/src/programs/database-manager/storage/sqlite-repository.ts` | - |
| `SqlPerformanceContext` | Type | `packages/fluxiq/src/programs/_shared/performance-metrics.ts` | - |
| `SqlPerformanceMetric` | Type | `packages/fluxiq/src/programs/_shared/performance-metrics.ts` | - |
| `startAutomationStudioConversationCommand` | Value | `packages/fluxiq/src/programs/automation-studio/runtime/conversations/commands/start.ts` | - |
| `startAutomationStudioRecoveryDeadline` | Value | `packages/fluxiq/src/programs/automation-studio/runtime/recovery/recovery-deadline.ts` | - |
| `StartClientRecordingInput` | Type | `packages/fluxiq/src/programs/automation-studio/client-gateway/bridge.ts` | - |
| `StartClientRecordingRequest` | Type | `packages/fluxiq/src/programs/automation-studio/api/contracts/client.ts` | - |
| `StartProductionRunRequest` | Type | `packages/fluxiq/src/programs/production-runner/api/contracts.ts` | - |
| `StateActionCorrelation` | Type | `packages/fluxiq/src/programs/automation-studio/mining/contracts.ts` | - |
| `StateActionCorrelationRelation` | Type | `packages/fluxiq/src/programs/automation-studio/mining/contracts.ts` | - |
| `StateBounds` | Type | `packages/fluxiq/src/programs/automation-studio/model/state.ts` | - |
| `StateBoundsKind` | Type | `packages/fluxiq/src/programs/automation-studio/model/state.ts` | - |
| `StateChangeEvent` | Type | `packages/fluxiq/src/programs/automation-studio/model/state-store.ts` | - |
| `StateCheckpointEntry` | Type | `packages/fluxiq/src/programs/automation-studio/model/timeline.ts` | - |
| `StateCoordinateSpace` | Type | `packages/fluxiq/src/programs/automation-studio/model/state.ts` | - |
| `StateDelta` | Type | `packages/fluxiq/src/programs/automation-studio/model/state.ts` | - |
| `StateDeltaEntry` | Type | `packages/fluxiq/src/programs/automation-studio/model/timeline.ts` | - |
| `StateDiffOptions` | Type | `packages/fluxiq/src/programs/automation-studio/model/state-diff.ts` | - |
| `StateElementDescriptor` | Type | `packages/fluxiq/src/programs/automation-studio/model/state.ts` | - |
| `StateElementKind` | Type | `packages/fluxiq/src/programs/automation-studio/model/state.ts` | - |
| `StateFact` | Type | `packages/fluxiq/src/programs/automation-studio/model/evidence.ts` | - |
| `StateFactReference` | Type | `packages/fluxiq/src/programs/automation-studio/model/evidence.ts` | - |
| `StateNamespace` | Type | `packages/fluxiq/src/programs/automation-studio/model/state.ts` | - |
| `StateNamespaceId` | Type | `packages/fluxiq/src/programs/automation-studio/model/state.ts` | - |
| `StatePath` | Type | `packages/fluxiq/src/programs/automation-studio/model/state.ts` | - |
| `StatePathPermissions` | Type | `packages/fluxiq/src/programs/automation-studio/model/state.ts` | - |
| `StatePathSchema` | Type | `packages/fluxiq/src/programs/automation-studio/model/state.ts` | - |
| `StatePresentationMetadata` | Type | `packages/fluxiq/src/programs/automation-studio/model/state.ts` | - |
| `StateRenderKind` | Type | `packages/fluxiq/src/programs/automation-studio/model/state.ts` | - |
| `StateSnapshot` | Type | `packages/fluxiq/src/programs/automation-studio/model/state.ts` | - |
| `StateSnapshotPresentation` | Type | `packages/fluxiq/src/programs/automation-studio/model/state.ts` | - |
| `StateUnsubscribe` | Type | `packages/fluxiq/src/programs/automation-studio/model/state-store.ts` | - |
| `stateValue` | Value | `packages/fluxiq/src/programs/automation-studio/model/state-store.ts` | - |
| `StateValue` | Type | `packages/fluxiq/src/programs/automation-studio/model/state.ts` | - |
| `StateValueType` | Type | `packages/fluxiq/src/programs/automation-studio/model/state.ts` | - |
| `StateVisualFrame` | Type | `packages/fluxiq/src/programs/automation-studio/model/state.ts` | - |
| `StateVisualLayer` | Type | `packages/fluxiq/src/programs/automation-studio/model/state.ts` | - |
| `StateVolatility` | Type | `packages/fluxiq/src/programs/automation-studio/model/state.ts` | - |
| `stepFlow` | Value | `packages/fluxiq/src/engine/index.ts` | - |
| `StopClientRecordingRequest` | Type | `packages/fluxiq/src/programs/automation-studio/api/contracts/client.ts` | - |
| `StopProductionRunRequest` | Type | `packages/fluxiq/src/programs/production-runner/api/contracts.ts` | - |
| `subscribeFluxIQPerformanceMetrics` | Value | `packages/fluxiq/src/programs/_shared/performance-metrics.ts` | - |
| `summarizeAutomationStudioRunResult` | Value | `packages/fluxiq/src/programs/automation-studio/runtime/result-verification/result-summary.ts` | - |
| `summarizeAutomationStudioRuntimeRecoveryContext` | Value | `packages/fluxiq/src/programs/automation-studio/runtime/recovery/context-summary.ts` | - |
| `summarizeAutomationStudioRuntimeStructuredDiagnosis` | Value | `packages/fluxiq/src/programs/automation-studio/runtime/recovery/structured-diagnosis.ts` | - |
| `summarizeAutomationStudioUncertainty` | Value | `packages/fluxiq/src/programs/automation-studio/runtime/training-modes.ts` | - |
| `summarizeStateDeltas` | Value | `packages/fluxiq/src/programs/automation-studio/model/state-diff.ts` | - |
| `SurfaceTone` | Type | `packages/fluxiq/src/ui/index.ts` | - |
| `systemClock` | Object | `packages/fluxiq/src/core/index.ts` | - |
| `TaskModelLearner` | Type | `packages/fluxiq/src/programs/automation-studio/learning/contracts.ts` | - |
| `TestFlowMapRouteConditionRequest` | Type | `packages/fluxiq/src/programs/automation-studio/api/contracts/flow-map.ts` | - |
| `TimelineBase` | Type | `packages/fluxiq/src/programs/automation-studio/model/timeline.ts` | - |
| `TimelineEntry` | Type | `packages/fluxiq/src/programs/automation-studio/model/timeline.ts` | - |
| `TimelineNormalizer` | Type | `packages/fluxiq/src/programs/automation-studio/normalization/contracts.ts` | - |
| `TimeoutPolicy` | Type | `packages/fluxiq/src/programs/automation-studio/model/policies.ts` | - |
| `TotpConfirmRequest` | Type | `packages/fluxiq/src/programs/identity-access/api/contracts.ts` | - |
| `TotpRequiredError` | Class | `packages/fluxiq/src/programs/identity-access/runtime/service.ts` | - |
| `trialAutomationStudioFlowChange` | Value | `packages/fluxiq/src/programs/automation-studio/runtime/flow-change/trial.ts` | - |
| `TrustedModuleBuildIdentity` | Type | `packages/fluxiq/src/runtime/build-identity/modules/types.ts` | Optional provenance supplied only by trusted, locally loaded runtime modules. |
| `UpdateFlowSubflowInput` | Type | `packages/fluxiq/src/programs/automation-studio/runtime/service.ts` | - |
| `UpdateFlowSubflowRequest` | Type | `packages/fluxiq/src/programs/automation-studio/api/contracts/subflow.ts` | - |
| `UpdateIdentityUserRequest` | Type | `packages/fluxiq/src/programs/identity-access/api/contracts.ts` | - |
| `UpdateRecordingRequest` | Type | `packages/fluxiq/src/programs/automation-studio/api/contracts/recording.ts` | - |
| `UpdateSecretKeyRequest` | Type | `packages/fluxiq/src/programs/secret-keys/api/contracts.ts` | - |
| `upgradeAutomationStudioBootstrapAdaptation` | Value | `packages/fluxiq/src/programs/automation-studio/runtime/flow-bootstrap/adaptation.ts` | - |
| `UpsertDeploymentArtifactRequest` | Type | `packages/fluxiq/src/programs/deployment-sync/api/contracts.ts` | - |
| `UpsertDeploymentTargetRequest` | Type | `packages/fluxiq/src/programs/deployment-sync/api/contracts.ts` | - |
| `UpsertFlowMapRouteGroupInput` | Type | `packages/fluxiq/src/programs/automation-studio/runtime/service/flow-map-routes/contracts.ts` | - |
| `UpsertFlowMapRouteInput` | Type | `packages/fluxiq/src/programs/automation-studio/runtime/service/flow-map-routes/contracts.ts` | - |
| `User` | Type | `packages/fluxiq/src/programs/identity-access/types.ts` | - |
| `UserCredential` | Type | `packages/fluxiq/src/programs/identity-access/types.ts` | - |
| `validateActionVisualEntityTarget` | Value | `packages/fluxiq/src/programs/automation-studio/model/validation/visual-target.ts` | - |
| `validateAutomationStudioAdaptationPolicy` | Value | `packages/fluxiq/src/programs/automation-studio/model/validation/adaptation.ts` | - |
| `validateAutomationStudioElementTarget` | Value | `packages/fluxiq/src/programs/automation-studio/model/action-element-target.ts` | - |
| `validateAutomationStudioFlow` | Value | `packages/fluxiq/src/programs/automation-studio/model/validation/flow.ts` | - |
| `validateAutomationStudioFlowAdaptation` | Value | `packages/fluxiq/src/programs/automation-studio/model/validation/adaptation.ts` | - |
| `validateAutomationStudioFlowBootstrapPlan` | Value | `packages/fluxiq/src/programs/automation-studio/runtime/flow-bootstrap/plan/validation.ts` | - |
| `validateAutomationStudioFlowChangeProposal` | Value | `packages/fluxiq/src/programs/automation-studio/model/validation/adaptation.ts` | - |
| `validateAutomationStudioFlowInstruction` | Value | `packages/fluxiq/src/programs/automation-studio/model/validation/adaptation.ts` | - |
| `validateAutomationStudioFlowRegions` | Value | `packages/fluxiq/src/programs/automation-studio/model/regions.ts` | - |
| `validateAutomationStudioFlowRouter` | Value | `packages/fluxiq/src/programs/automation-studio/model/validation/adaptation.ts` | - |
| `validateAutomationStudioFlowSubflow` | Value | `packages/fluxiq/src/programs/automation-studio/model/validation/adaptation.ts` | - |
| `validateAutomationStudioImporterNodeManifest` | Value | `packages/fluxiq/src/programs/automation-studio/nodes/definitions.ts` | - |
| `validateAutomationStudioImporterSdkManifest` | Value | `packages/fluxiq/src/programs/automation-studio/nodes/importer-sdk.ts` | - |
| `validateAutomationStudioLlmOutput` | Value | `packages/fluxiq/src/programs/automation-studio/runtime/llm/harness/output-validation.ts` | - |
| `validateAutomationStudioNodeDefinition` | Value | `packages/fluxiq/src/programs/automation-studio/nodes/definitions.ts` | - |
| `validateAutomationStudioRecords` | Value | `packages/contracts/src/record-sets/validate-records.ts` | - |
| `validateDomainIo` | Value | `packages/fluxiq/src/io/index.ts` | - |
| `validateEvidenceAnchor` | Value | `packages/fluxiq/src/programs/automation-studio/model/validation/state.ts` | - |
| `validateFlow` | Value | `packages/fluxiq/src/flows/index.ts` | - |
| `validateFlowComposition` | Value | `packages/fluxiq/src/programs/automation-studio/model/composites.ts` | - |
| `validateIoRequirements` | Value | `packages/fluxiq/src/io/index.ts` | - |
| `validateNodeEvidenceBinding` | Value | `packages/fluxiq/src/programs/automation-studio/model/validation/evidence.ts` | - |
| `validateNodeStateRuntimeComparison` | Value | `packages/fluxiq/src/programs/automation-studio/model/validation/node-state.ts` | - |
| `validateNodeStateSource` | Value | `packages/fluxiq/src/programs/automation-studio/model/validation/node-state.ts` | - |
| `validateNodeStateViewSelection` | Value | `packages/fluxiq/src/programs/automation-studio/model/validation/node-state.ts` | - |
| `validatePolicyGraph` | Value | `packages/fluxiq/src/programs/automation-studio/model/validation/policy-graph.ts` | - |
| `ValidateRecordingDomainEventRequest` | Type | `packages/fluxiq/src/programs/automation-studio/api/contracts/recording.ts` | - |
| `validateRecordingIndex` | Value | `packages/fluxiq/src/programs/automation-studio/storage/state-index.ts` | - |
| `validateRecordingSession` | Value | `packages/fluxiq/src/programs/automation-studio/model/validation/recording.ts` | - |
| `validateSignalRegistry` | Value | `packages/fluxiq/src/programs/automation-studio/model/validation/signal-registry.ts` | - |
| `validateStateFact` | Value | `packages/fluxiq/src/programs/automation-studio/model/validation/evidence.ts` | - |
| `validateStateFactReference` | Value | `packages/fluxiq/src/programs/automation-studio/model/validation/evidence.ts` | - |
| `validateStateSnapshot` | Value | `packages/fluxiq/src/programs/automation-studio/model/validation/state.ts` | - |
| `validateStateVisualFrame` | Value | `packages/fluxiq/src/programs/automation-studio/model/validation/state.ts` | - |
| `VaultRecord` | Type | `packages/fluxiq/src/programs/identity-access/types.ts` | - |
| `VaultStatus` | Type | `packages/fluxiq/src/programs/identity-access/types.ts` | - |
| `VaultUnlockRequest` | Type | `packages/fluxiq/src/programs/identity-access/api/contracts.ts` | - |
| `verifyAutomationStudioBackupManifest` | Value | `packages/fluxiq/src/programs/automation-studio/storage/project/migration-cutover.ts` | - |
| `verifyAutomationStudioRunResult` | Value | `packages/fluxiq/src/programs/automation-studio/runtime/result-verification/verify.ts` | - |
| `verifyAutomationStudioRuntimeSessionResult` | Value | `packages/fluxiq/src/programs/automation-studio/runtime/result-verification/run-outcome.ts` | - |
| `verifyAutomationStudioV2Migration` | Value | `packages/fluxiq/src/programs/automation-studio/storage/project/migration-cutover.ts` | - |
| `verifyCodeOwnedFlowCompilation` | Value | `packages/fluxiq/src/programs/automation-studio/dsl/compiler.ts` | - |
| `viewerRole` | Object | `packages/fluxiq/src/programs/identity-access/runtime/roles.ts` | - |
| `WeightedAutomationCondition` | Type | `packages/fluxiq/src/programs/automation-studio/model/conditions.ts` | - |
| `withAutomationStudioAdaptationReplay` | Value | `packages/fluxiq/src/programs/automation-studio/runtime/adaptation-confidence/replay.ts` | - |
| `withAutomationStudioBuildActivity` | Value | `packages/fluxiq/src/programs/automation-studio/runtime/activity/build.ts` | - |
| `withAutomationStudioFlowRepresentation` | Value | `packages/fluxiq/src/programs/automation-studio/model/flows.ts` | - |
| `withAutomationStudioInterventionMode` | Value | `packages/fluxiq/src/programs/automation-studio/model/flows.ts` | - |
| `withAutomationStudioNodeAdaptationId` | Value | `packages/fluxiq/src/programs/automation-studio/runtime/flow-change/contracts.ts` | - |
| `withAutomationStudioRunActivity` | Value | `packages/fluxiq/src/programs/automation-studio/runtime/activity/run.ts` | - |
| `withEndpointPerformanceScope` | Value | `packages/fluxiq/src/programs/_shared/performance-metrics.ts` | - |
| `withSqlPerformanceContext` | Value | `packages/fluxiq/src/programs/_shared/performance-metrics.ts` | - |
| `writeMigrationJournal` | Value | `packages/fluxiq/src/framework/storage-layout.ts` | - |
