# Framework API Reference

This deterministic inventory is generated from the public exports of `packages/fluxiq/src/index.ts` using TypeDoc.
It intentionally omits line numbers, timestamps, machine paths, Git state, and runtime data, so it changes only when the public surface changes.

Regenerate it with `pnpm docs:reference`; CI verifies freshness with `pnpm docs:check`.

## API Summary

- Public declarations: 809
- Class: 49
- Object: 91
- Type: 524
- Value: 145

## Public Declarations

| Name | Kind | Source | Summary |
| --- | --- | --- | --- |
| `AcquireComputeLeaseRequest` | Type | `packages/fluxiq/src/programs/compute-control/api/contracts.ts` | - |
| `ACTIVITY_ACTION_CONTROL_NOUNS` | Object | `packages/fluxiq/src/ui/activity-action/control-nouns.ts` | Every noun `activityActionControlNoun` says, for a card to read a sentence that names a control by one ("Clicking a button") back (`./action-of.ts`). |
| `ACTIVITY_ACTION_ICONS` | Object | `packages/fluxiq/src/ui/activity-action/icons.ts` | The icon each action kind's card shows: a lucide icon name (Core's icon set, `lucide-react`), in kebab case. A client maps the name to its own component. |
| `ACTIVITY_ACTION_NAMES` | Object | `packages/fluxiq/src/ui/activity-action/names.ts` | The short label each action kind's card carries beside its icon. |
| `ACTIVITY_ACTION_REFUSAL_WORDS` | Object | `packages/fluxiq/src/ui/activity-action/refusal-words.ts` | Core's plain words for why it did not do what a decision asked, written once for every client's card and for Core's own wording (`runtime/automation-activity/wording/draft-edit-card.ts`, which checks at compile time that every reason the draft can give has words here). - `amendment`: why an edit to the draft changed nothing, by the draft's own refusal reason (`runtime/flow-authoring/draft/amendment/types.ts`). - `repeated`: why a call, or a step asked to run again, was not run, by what the same call came to before (`runtime/llm/repeat-guard/outcomes.ts`). - `resent`: why a whole Flow sent again unchanged (a candidate build's submission) was not taken, by the same. Each finishes "Not done: ...", so each opens in lower case and is no code. |
| `ACTIVITY_ACTION_VERB_NAMES` | Object | `packages/fluxiq/src/ui/activity-action/verb-names.ts` | The short name a card carries for a verb whose act is narrower than its kind's name (`./names.ts`): "Choose" for an option chosen, which is a click by kind. A verb not here is named by its kind. |
| `ACTIVITY_ATTEMPT_WORDS` | Object | `packages/fluxiq/src/ui/activity-status/attempt/words.ts` | What an attempt's activity is called while it works and as it ends, in a person's words. |
| `ACTIVITY_DETAIL_INTERVAL_MS` | Object | `packages/fluxiq/src/ui/activity-status/pacer.ts` | The shortest time between two paced changes of the line: more than half of three seconds, so any three seconds show at most two. The overlay used to add this on its own (a 1.6 s dwell over a 1.2 s pace); one pace for both surfaces keeps them in step (D7). |
| `ACTIVITY_DOUBTED_ENDING_CLOSE` | Object | `packages/fluxiq/src/ui/activity-status/doubted-ending.ts` | The words that close such an ending; shared by the sentence's builder and the headline's reader. |
| `ACTIVITY_DOUBTED_HEADLINE` | Object | `packages/fluxiq/src/ui/activity-status/doubted-ending.ts` | The headline for such an ending. |
| `ACTIVITY_FAN_OUT_INTERVAL_MS` | Object | `packages/fluxiq/src/ui/activity-status/fan-out-gate.ts` | Four sends a second. |
| `ACTIVITY_HEADLINE_DWELL_MS` | Object | `packages/fluxiq/src/ui/activity-status/pacer.ts` | The least time a headline stays up before another that does not settle or wait replaces it (t753). |
| `ACTIVITY_HISTORY_LIMITS` | Object | `packages/fluxiq/src/ui/activity-status/history-limits.ts` | How much of FluxIQ's work the background keeps for the chat's step messages (`background/activity/unit-history.ts`): the last `units` units of work, and at most `eventsPerUnit` events of each, the newest. A build of 60 decisions is about 250 kept events, so a whole build fits with room to spare; the bound is there so a runaway loop cannot grow the panel's state without end. A build still in progress is held to `buildEventsCeiling` instead, and is never the unit dropped for a newer one: a build with a project supervisor, several builders, the validator and a repair passes 500 events, and can pass ten units, on its own (automation-project-agents-plan, chat presentation). The ceiling is still a bound, for the same runaway loop. |
| `ACTIVITY_PAGE_PREPARATION_WORDS` | Object | `packages/fluxiq/src/ui/activity-status/steady/page-preparation.ts` | Core's words opening every row of a step run to get the page ready; the headline while it lasts. |
| `ACTIVITY_RECORDED_CHECK_WORDS` | Object | `packages/fluxiq/src/ui/activity-status/steady/recorded-check.ts` | Core's words opening every row of a step checked against the recorded run. |
| `ACTIVITY_RESULT_CHECK_LABELS` | Object | `packages/fluxiq/src/ui/activity-action/result-check-labels.ts` | The status sentence (`ClientGatewayActivity.label`) each verdict of a run's result check is said in (`runtime/result-verification/check-activity.ts`). Written once, here, because a chat card reads two of them back: a result Core could not confirm (`unconfirmed`, the two checks disagreed or the model was unsure) and one it could not check at all (`unchecked`) are not a pass, and they are not a failure either. The row's `status` is `failed` for both, fail-closed, so the label is the only thing that tells them from `refuted`. |
| `ActivityAction` | Type | `packages/fluxiq/src/ui/activity-action/types.ts` | One action, ready for a card. `target` is the name of what it acted on as the event already carried it, or null when it named none (the client says "the page" in its own words). `why` is a short human reason for a failure, or null; never a result code. `tested` is set only on a step a test of the Flow did not simply do again, and says what it did instead, in words a card shows in place of "Done" ("Checked, not pressed", "Already done on the site", "Skipped: not there, optional"; `./tested.ts`), and on a run step skipped rather than run says why (`./skipped.ts`). |
| `activityActionAskNamesPermission` | Value | `packages/fluxiq/src/ui/activity-action/ask-names-permission.ts` | - |
| `activityActionControlNoun` | Value | `packages/fluxiq/src/ui/activity-action/control-nouns.ts` | - |
| `ActivityActionEvent` | Type | `packages/fluxiq/src/ui/activity-action/types.ts` | The fields of one activity event the classifier reads. A client passes the `server.activity` payload as it arrived; fields it does not have may be left out. |
| `activityActionFailureReason` | Value | `packages/fluxiq/src/ui/activity-action/failure-reason.ts` | - |
| `activityActionKey` | Value | `packages/fluxiq/src/ui/activity-action/key.ts` | - |
| `ActivityActionKind` | Type | `packages/fluxiq/src/ui/activity-action/types.ts` | What kind of action a card shows; each has one icon and one short name. |
| `activityActionOf` | Value | `packages/fluxiq/src/ui/activity-action/action-of.ts` | - |
| `ActivityActionOutcome` | Type | `packages/fluxiq/src/ui/activity-action/types.ts` | Where the action stands: still going, finished, failed, or waiting on a person. |
| `activityActionReplayFailing` | Value | `packages/fluxiq/src/ui/activity-action/replay-failing.ts` | - |
| `activityActionSentences` | Value | `packages/fluxiq/src/ui/activity-action/sentences.ts` | - |
| `activityActionSkipped` | Value | `packages/fluxiq/src/ui/activity-action/skipped.ts` | - |
| `activityActionTested` | Value | `packages/fluxiq/src/ui/activity-action/tested.ts` | - |
| `activityActionVerb` | Value | `packages/fluxiq/src/ui/activity-action/verb.ts` | - |
| `ActivityActionVerb` | Type | `packages/fluxiq/src/ui/activity-action/types.ts` | The generic verbs an id, a label or a result code can name. Each belongs to one kind; the activity wording (`runtime/automation-activity/wording`) says each in a person's words. |
| `activityAgent` | Value | `packages/fluxiq/src/ui/activity-status/project/agent.ts` | - |
| `ActivityAgent` | Type | `packages/fluxiq/src/ui/activity-status/project/agent.ts` | The author an event names, as the wire contract declares it. |
| `activityAttemptHeadline` | Value | `packages/fluxiq/src/ui/activity-status/attempt/headline.ts` | - |
| `ActivityClock` | Type | `packages/fluxiq/src/ui/activity-status/clock.ts` | - |
| `ActivityDisplay` | Type | `packages/fluxiq/src/ui/activity-status/activity-display.ts` | The status a person sees, paced from Core's raw events by the background (`background/activity/`). The overlay and the chat's live line render this and nothing else, so both show the same words and neither can flicker faster than the pacer lets it. - `headline` names the unit of work and stays put while it runs ("Building your Flow", "Running your Flow", "Fixing your Flow" once Core repairs it, "Testing your Flow" while a candidate build test-runs the Flow it submitted, which is never a repair); it changes only when the work changes, settles ("Flow ready", "Build failed", "Run finished", "Run failed", "Couldn't fix your Flow" for a run whose repair failed; a build that fails says "Build failed" even mid-repair) or needs the person ("Waiting for you: finish the check on the page", "Waiting for you: answer in the FluxIQ panel", "Paused: your turn on the page" while a run is held for the person). Those changes show at once (`background/activity/headline.ts`). - `detail` is Core's latest event in a person's words (`activityWording`), never a tool id or result code, changed at most once per 1.6 s (`ACTIVITY_DETAIL_INTERVAL_MS`); the newest always shows once the interval ends, and a step that starts after a decision shows at once. It is null rather than a repeat of the headline (`isHeadlineEcho`). The overlay draws each display as it arrives; it has no pace of its own. - `phase` and `step` are the phase and step of the event `detail` came from, so they change no faster than `detail` does. - `kind` says what the newest event folded in was, so a reader keys on it rather than on the raw event riding beside the display: `action` for FluxIQ's own status; `thought` for the model's words (a reason, a refused edit: `isModelThought`), which never become the detail -- the display keeps the unit's last action line, phase and step -- and never count as a change of it; `starting` for the status put up the moment the person sends a message FluxIQ takes on, before Core's first activity (`background/activity/send-start.ts`). Absent reads as `action`. The background sends it on at most four times a second, and only when it changed (`background/activity/activity-relay.ts`). |
| `activityHeadline` | Value | `packages/fluxiq/src/ui/activity-status/headline.ts` | - |
| `ActivityHeadlineSituation` | Type | `packages/fluxiq/src/ui/activity-status/headline.ts` | - |
| `ActivityHostWords` | Type | `packages/fluxiq/src/ui/activity-status/host-words.ts` | A host's headlines for a wait on the person. |
| `ActivityPacer` | Class | `packages/fluxiq/src/ui/activity-status/pacer.ts` | - |
| `ActivityPacerOptions` | Type | `packages/fluxiq/src/ui/activity-status/pacer.ts` | - |
| `ActivityProjectCard` | Type | `packages/fluxiq/src/ui/activity-status/project/project-card.ts` | A card a `note` row carries, as the wire contract declares it. |
| `activitySaidOnce` | Value | `packages/fluxiq/src/ui/activity-status/steady/said-once.ts` | - |
| `ActivityStepRecovery` | Type | `packages/fluxiq/src/ui/activity-status/step-recovery.ts` | The recovery a step row reports, as the wire contract declares it. |
| `ActivityStepSkip` | Type | `packages/fluxiq/src/ui/activity-status/step-skip.ts` | The skip a step row reports, as the wire contract declares it. |
| `ActivityTimer` | Type | `packages/fluxiq/src/ui/activity-status/clock.ts` | - |
| `ActivityWaitReason` | Type | `packages/fluxiq/src/ui/activity-status/headline.ts` | What the person is being waited on for. |
| `activityWithoutHeadline` | Value | `packages/fluxiq/src/ui/activity-status/headline-echo.ts` | - |
| `activityWording` | Value | `packages/fluxiq/src/ui/activity-status/wording.ts` | - |
| `ActivityWording` | Type | `packages/fluxiq/src/ui/activity-status/wording.ts` | - |
| `adminRole` | Object | `packages/fluxiq/src/programs/identity-access/runtime/roles.ts` | - |
| `admitClientGatewayTraceForMatching` | Value | `packages/fluxiq/src/client-gateway/trace-matcher/trace-admission.ts` | - |
| `adoptUncommittedFluxIQStorage` | Value | `packages/fluxiq/src/framework/uncommitted-v2-adoption.ts` | - |
| `AdvanceProductionRunRequest` | Type | `packages/fluxiq/src/programs/production-runner/api/contracts.ts` | - |
| `assertFlowLlmExecutionSettings` | Value | `packages/fluxiq/src/framework/automation-service/service/flow-settings-requests/llm-execution-settings.ts` | - |
| `AssistantModelChoice` | Type | `packages/fluxiq/src/programs/secret-keys/types.ts` | What the panel assistant should call, or a plain reason there is none. Never carries a secret value. `ownerId` is the key's holder, its creator (absent for a legacy key nobody is stamped on). It pays for another person's message only when both hold (`ModelKeySettings.resolveAssistant`): `chosenForWorkspace`, an owner or administrator chose it as the workspace's key, and `offeredByHolder`, its holder offered it to the workspace. |
| `atomicWriteJson` | Value | `packages/fluxiq/src/framework/storage-layout.ts` | - |
| `authorizeProgramPin` | Value | `packages/fluxiq/src/programs/_shared/authorization.ts` | - |
| `AUTOMATION_STUDIO_PROGRAM` | Object | `packages/fluxiq/src/programs/automation-studio/metadata.ts` | - |
| `AutomationStudioPanel` | Type | `packages/fluxiq/src/programs/automation-studio/ui/contracts.ts` | - |
| `automationStudioPersonProject` | Value | `packages/fluxiq/src/programs/automation-studio/api/person-project.ts` | - |
| `automationStudioProjectName` | Value | `packages/fluxiq/src/programs/automation-studio/api/project-name.ts` | - |
| `AutomationStudioViewState` | Type | `packages/fluxiq/src/programs/automation-studio/ui/contracts.ts` | - |
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
| `buildProgramDirectory` | Value | `packages/fluxiq/src/programs/_shared/catalog.ts` | - |
| `CandidateTrial` | Class | `packages/fluxiq/src/ui/activity-status/candidate-trial.ts` | - |
| `chooseNextEdge` | Value | `packages/fluxiq/src/engine/index.ts` | - |
| `classifyClientGatewayTraceDivergence` | Value | `packages/fluxiq/src/client-gateway/trace-replay/comparison/divergence-class.ts` | - |
| `clearFluxIQPerformanceMetrics` | Value | `packages/fluxiq/src/framework/persistence/performance-metrics/performance-metrics.ts` | - |
| `CLIENT_GATEWAY_ACTIVITY_CAPABILITY_ID` | Object | `packages/contracts/src/client-gateway.ts` | The capability a client advertises to receive `server.activity`. Core sends the activity stream only to ready sessions that declared it. |
| `CLIENT_GATEWAY_ACTIVITY_RECOVERY_EVENTS` | Object | `packages/contracts/src/client-gateway.ts` | The lifecycle boundaries a handler fires at (C3), as a `handler` recovery names them. |
| `CLIENT_GATEWAY_ACTIVITY_RECOVERY_KINDS` | Object | `packages/contracts/src/client-gateway.ts` | What kind of recovery a `step` row's `recovery` reports (state-aware recovery plan, C11): - `handler`: a lifecycle handler ran (On Start, On Before, On Retry, On Fail, On Before Next); - `entry`: a frame began at an alternative entry rather than its Start node; - `route`: the run moved to a checkpoint, or state routing moved it to the node the page is at; - `alternative`: a known alternative path or recovery Subflow was tried; - `interference`: the client closed a layer the page put over itself (a notice, a promotion, a consent banner) by its dismiss control while the step ran. Its `subject` is Core's own words by layer kind, never the control's words or other page text; - `reacquire`: a step whose target came from an earlier step (a read list's row, another node's answer) lost it when the page changed, so that earlier step was re-run and the same item found again by its identity (`succeeded`), or found gone (`failed`), t786. Its `subject` is Core's own words, naming the source step by its authored label at most, never page text. Additive: a client that does not know a kind reads the row as a plain step. |
| `CLIENT_GATEWAY_ACTIVITY_RECOVERY_OUTCOMES` | Object | `packages/contracts/src/client-gateway.ts` | How a recovery ended: it moved the run on, it failed, or a guard or budget refused it before it ran. |
| `CLIENT_GATEWAY_ACTIVITY_RESOLUTIONS` | Object | `packages/contracts/src/client-gateway.ts` | How a wait on the person ended, on the `ask` row that says so: - `answered`: the person answered (a robot check's Continue, a choice, words); - `allowed`: the person granted a permission ask; - `waited_out`: a check that clears by itself cleared while Core waited; - `declined`: the person refused, or pressed Stop at a robot check; - `timed_out`: nobody answered in time; - `cancelled`: the work stopped before anyone answered -- it was cancelled or failed while it waited, or the question could no longer be read. |
| `CLIENT_GATEWAY_ACTIVITY_SKIP_REASONS` | Object | `packages/contracts/src/client-gateway.ts` | Why a run step was skipped rather than run, on the `step` row that says so: - `already_done`: the run already completed the step's lasting act for the same row, so it was not done again (the executor's completed-act ledger); - `already_in_state`: the step's control already showed the state it asks for, so it was not pressed (no failure, and not a lasting act this run did); - `optional_absent`: a sometimes-present step whose target was not shown; - `state_routed`: the page was elsewhere, so state routing passed the step over and the run went on at the step the page is at. Additive: a client that does not know a reason reads the row as a plain step. |
| `CLIENT_GATEWAY_HOST_LEASE_REFUSAL_CODES` | Object | `packages/contracts/src/client-gateway.ts` | Failure codes for a command refused because of its host lease; category `blocked_by_capability_or_policy`, effect `unacted`. |
| `CLIENT_GATEWAY_PROTOCOL_VERSION` | Object | `packages/contracts/src/client-gateway.ts` | The version the gateway stamps on its envelopes. Gateway 0.2 (hosted production plan) is additive over 0.1 and shares its major version; the versions this contract describes are `CLIENT_GATEWAY_PROTOCOL_VERSIONS`. This stays `0.1` until the gateway sends the 0.2 messages, since it is also a recorded trace's contract version. |
| `CLIENT_GATEWAY_RECONCILE_ANSWER_METADATA_KEY` | Object | `packages/contracts/src/client-gateway.ts` | The capability metadata field a client sets to `true` to say it answers `server.reconcile_command`. Core asks only a session that declared it, on any capability; a session that did not is never asked, and a lost reply to it keeps the outcome it had (`timed_out`). |
| `CLIENT_GATEWAY_RECONCILE_STATES` | Object | `packages/contracts/src/client-gateway.ts` | What became of one command, as the client that was sent it answers `server.reconcile_command` (state-aware recovery plan, C8 and B3). The client answers from what it kept and never by acting: - `landed`: the command finished there; `result` is the result it kept, the one whose delivery was lost; - `not_seen`: the client has no record of that id, so the act never reached it and making it again is not a second act. A client that answers this refuses the id from then on, so a copy still on its way cannot act later; - `running`: the command is still being carried out; - `unknown`: the client cannot say -- for example its record was cleared by a restart before a result was kept. Core never makes the act again on it. |
| `CLIENT_GATEWAY_REPORTED_ACTION_STATUSES` | Object | `packages/contracts/src/client-gateway.ts` | The statuses a client may report for an action, in order of the wire: Core's own five, plus `interrupted` -- the client lost the command in flight (its background worker stopped, or its channel to the page closed) and does not know whether the act happened. Core reads `interrupted` the way it reads the wire status a client sent before it existed (state-aware recovery plan, C8 and B3): a committing act is `unknown`, its outcome uncertain (`effect: "ambiguous"`), and every other act is `failed` having done nothing (`effect: "unacted"`). Which acts commit is the domain's fact, so Core takes it from the result's `failure.effect`: only a record stating `unacted` makes it a failure, and a result that states nothing is held uncertain. A client built earlier sends `unknown` or `failed` with `payload.status: "interrupted"`, which Core still accepts and records as interrupted. |
| `CLIENT_GATEWAY_SECURITY_EVENT_TYPES` | Object | `packages/fluxiq/src/client-gateway/service/security/security-events.ts` | The audit entries that are security events: delivered to every `onSecurityEvent` listener as they are recorded, so the web layer can persist them beyond the in-memory audit ring. Everything the transport reports through `recordTransportEvent` is a security event too, whatever its type. |
| `CLIENT_GATEWAY_TRACE_ACTIVITIES` | Object | `packages/fluxiq/src/client-gateway/trace/vocabulary.ts` | The build activity the episode was in. |
| `CLIENT_GATEWAY_TRACE_ARTIFACT_PATH` | Object | `packages/contracts/src/client-gateway.ts` | Where a paired client uploads a trace artifact: `PUT <path>/<sha256>`, bearer token, `content-type` its media type. |
| `CLIENT_GATEWAY_TRACE_ARTIFACT_ROLES` | Object | `packages/contracts/src/client-gateway.ts` | `primary`: the observation itself; `resource`: something the primary artifact refers to, stored once per digest. |
| `CLIENT_GATEWAY_TRACE_CAPTURE_BOUNDARY_VERSION` | Object | `packages/fluxiq/src/client-gateway/trace/versions.ts` | Where the copies are taken: raw inbound text before parsing, structured outbound copies at the transport, lifecycle, dispositions and Core-synthesized outcomes as further events, on one delivery sequence assigned on entry. |
| `CLIENT_GATEWAY_TRACE_COMPLETENESS_STATUSES` | Object | `packages/fluxiq/src/client-gateway/trace/completeness-vocabulary.ts` | Whether a trace's evidence is all there. Missing evidence is never `complete`. |
| `CLIENT_GATEWAY_TRACE_DERIVATIONS` | Object | `packages/fluxiq/src/client-gateway/trace/vocabulary.ts` | How a trace that is not live was produced. |
| `CLIENT_GATEWAY_TRACE_EVENT_KINDS` | Object | `packages/fluxiq/src/client-gateway/trace/vocabulary.ts` | What an event is. `inbound`: a client message as Core received it. `outbound`: a message Core sent. `lifecycle`: connect, disconnect, pairing. `disposition`: what Core did with an inbound message. `synthesized`: an outcome Core produced itself (a timeout, a close). `control`: an input that arrived outside the socket. `artifact`: captured content arriving. |
| `CLIENT_GATEWAY_TRACE_ISSUE_CODES` | Object | `packages/fluxiq/src/client-gateway/trace/completeness-vocabulary.ts` | What makes a trace incomplete, each tagged by sequence range or artifact. |
| `CLIENT_GATEWAY_TRACE_LOSS_REASONS` | Object | `packages/fluxiq/src/client-gateway/trace/completeness-vocabulary.ts` | Why the recorder could not keep a sequence it assigned. |
| `CLIENT_GATEWAY_TRACE_MATCHER_FIELDS` | Object | `packages/fluxiq/src/client-gateway/trace-matcher/operation/fields.ts` | - |
| `CLIENT_GATEWAY_TRACE_MATCHER_GAP_REASONS` | Object | `packages/fluxiq/src/client-gateway/trace-matcher/gap-reasons.ts` | - |
| `CLIENT_GATEWAY_TRACE_METADATA_KEY` | Object | `packages/contracts/src/client-gateway.ts` | Traces (traces and offline trials, P2). Core marks an action command it is tracing with `metadata.trace` (`ClientGatewayTraceRequest`): the client may then upload artifacts of what it observed for that command -- content addressed, PUT to `CLIENT_GATEWAY_TRACE_ARTIFACT_PATH/<sha256>` with its bearer token -- and reference them from its result's `metadata.trace` (`ClientGatewayTraceResultMetadata`). Core records the reference in the trace and takes it off the result before any consumer reads it, so nothing traced ever reaches a run, a recording or a model. A client that cannot capture ignores the request; its result simply carries no reference. Never a top-level key: the durable path refuses a result with an unknown one. |
| `CLIENT_GATEWAY_TRACE_MINTED_FIELDS` | Object | `packages/fluxiq/src/client-gateway/trace-replay/comparison/minted-fields.ts` | - |
| `CLIENT_GATEWAY_TRACE_OPENING` | Object | `packages/fluxiq/src/client-gateway/trace-matcher/recorded-feed.ts` | What the trace delivered before its first operation came after: no command. |
| `CLIENT_GATEWAY_TRACE_PARITY_CLASSES` | Object | `packages/fluxiq/src/client-gateway/trace-replay/parity-classes.ts` | - |
| `CLIENT_GATEWAY_TRACE_PARITY_NORMALIZATIONS` | Object | `packages/fluxiq/src/client-gateway/trace-replay/comparison/normalizations.ts` | - |
| `CLIENT_GATEWAY_TRACE_RECORDER_STATES` | Object | `packages/fluxiq/src/client-gateway/trace/completeness-vocabulary.ts` | The recorder's own state. `failed`: it can no longer persist what it receives. |
| `CLIENT_GATEWAY_TRACE_REDACTION_REASONS` | Object | `packages/fluxiq/src/client-gateway/trace/vocabulary.ts` | Why a payload field was withheld. A redaction is a declared fidelity limitation. |
| `CLIENT_GATEWAY_TRACE_SCHEMA_VERSION` | Object | `packages/fluxiq/src/client-gateway/trace/versions.ts` | The trace manifest and event envelope shape. Bump on any incompatible change. |
| `CLIENT_GATEWAY_TRACE_SESSION_BOUND_KINDS` | Object | `packages/fluxiq/src/client-gateway/trace-replay/session-references/bound-kinds.ts` | - |
| `CLIENT_GATEWAY_TRACE_STATE_GAP_CODES` | Object | `packages/fluxiq/src/client-gateway/trace-state/gap-codes.ts` | - |
| `CLIENT_GATEWAY_TRACE_TAP_STREAMS` | Object | `packages/fluxiq/src/client-gateway/service/trace-tap/streams.ts` | - |
| `CLIENT_GATEWAY_TRACE_TERMINATION_REASONS` | Object | `packages/fluxiq/src/client-gateway/trace/vocabulary.ts` | Why a trace was closed. |
| `CLIENT_GATEWAY_TRANSPORT_EVENT_TYPES` | Object | `packages/fluxiq/src/client-gateway/service/security/security-events.ts` | The types a transport is expected to report through `recordTransportEvent` (hosted-production-plan, "Gateway Transport Over The Internet"). Any other type is accepted and delivered the same way. |
| `ClientGatewayActionCommand` | Type | `packages/contracts/src/client-gateway.ts` | - |
| `ClientGatewayActionResponse` | Type | `packages/contracts/src/client-gateway.ts` | - |
| `ClientGatewayActionResult` | Type | `packages/contracts/src/client-gateway.ts` | An action result as Core hands it to the caller that dispatched the command. A client's `interrupted` has already been read into `unknown` or `failed` (see `ClientGatewayReportedActionResult`), so no caller meets it. |
| `ClientGatewayActionResultStatus` | Type | `packages/contracts/src/client-gateway.ts` | What an action ended as, once Core has read it. `unknown` is an act that may have landed with its answer missing; a missing answer is never a failure that did nothing. |
| `ClientGatewayActivity` | Type | `packages/contracts/src/client-gateway.ts` | One activity event: the current status of one unit of work (a build or a run) plus an optional detail row for the chat stream. Bounded, and content-free beyond what the person's own panel already shows: labels and titles are Core's own sentences, the actions a step's own input names, tool and node ids, and authored step labels; never raw evidence a tool gathered, tokens or secrets. A `thought` row's `text` is the model's own stated reason for that step (what it does next, on what, and why) or its diagnosis or verdict, whitespace-collapsed, with token-shaped runs hidden, and bounded (240 characters for a decision's reason). Core truncates `label` to 160 characters, `detail.title` to 160, `detail.recovery.subject` and `detail.skipped.subject` to 160 and `detail.text` to 1,000. A wait on the person is one `ask` row pair for one card. The wait opens as `phase: "waiting_permission"`, `detail: { kind: "ask", ref: <askId>, status: "started" }`. When it is settled, Core sends one more `ask` row for the same unit of work with the same `ref` and `title`, the phase the work returns to, `status` `succeeded` (answered, allowed, waited out) or `failed` (declined, timed out, cancelled), `resolution`, and `text`, a sentence such as "You pressed Continue.". A client marks the card from that row alone and never infers the answer from later events. Every wait Core announced gets that row, including one whose work stopped first (`cancelled`); a wait Core never announced is never resolved. A run parked durably is still waiting until it is resumed. |
| `ClientGatewayActivityAgent` | Type | `packages/contracts/src/client-gateway.ts` | Which of a build's agents an event comes from (automation-project-agents-plan, chat presentation). Optional and additive: absent on a build with one agent, and a client that does not know it reads the event as before. `briefId` is never a digest; Core bounds `subflowName` to 160 characters. |
| `ClientGatewayActivityPhase` | Type | `packages/contracts/src/client-gateway.ts` | What FluxIQ is doing now. Each value is set only by a real Core event. `paused` is a run held at a step boundary because it was paused, usually because the person took the page (Take over): nothing is dispatched to the page until it is resumed or stopped. Core sends it once when the run holds, with `step` naming the node the run will execute first, and once more as `running` when the run is let go to continue. A held run that is stopped ends through the ordinary final event instead. |
| `ClientGatewayActivityProjectCard` | Type | `packages/contracts/src/client-gateway.ts` | On a `note` row only: a card of the supervisor's work. Optional and additive; a client that does not know it reads the row as a plain note. Core bounds every string to 160 characters (`reason` to 240) and `parts` and `subflows` to 20 entries each. A `brief`'s `after` names, by the plan's names, the subflows it starts after (its entry's predecessors), at most 20: a brief dispatched beside one of them waits for it to pass before its builder starts. Empty when it starts after none; additive: absent only from an older Core, whose client cannot tell. A `return`'s `reason` is said for the person, never a code, a call or an id. |
| `ClientGatewayActivityRecovery` | Type | `packages/contracts/src/client-gateway.ts` | The recovery a `step` row reports, so a client renders its card from closed fields rather than parsing Core's sentence. `subject` is the plain words the card shows ("Dismiss the sign-in popup"): an authored label or Core's own words, never page data. `event` is set on a `handler` recovery; `targetId` is the checkpoint, entry, node or Subflow it led to, when there is one. |
| `ClientGatewayActivityRecoveryEvent` | Type | `packages/contracts/src/client-gateway.ts` | - |
| `ClientGatewayActivityRecoveryKind` | Type | `packages/contracts/src/client-gateway.ts` | - |
| `ClientGatewayActivityRecoveryOutcome` | Type | `packages/contracts/src/client-gateway.ts` | - |
| `ClientGatewayActivityResolution` | Type | `packages/contracts/src/client-gateway.ts` | - |
| `ClientGatewayActivitySkip` | Type | `packages/contracts/src/client-gateway.ts` | The skip a `step` row reports, so a client draws its card from a closed field rather than from the row's shape or Core's sentence. `subject` is the plain words naming what was skipped: the list row's label ("Lin Zhao") or the step's authored label, never other page data. |
| `ClientGatewayActivitySkipReason` | Type | `packages/contracts/src/client-gateway.ts` | - |
| `ClientGatewayAppendRecordingEntryRequest` | Type | `packages/contracts/src/client-gateway.ts` | - |
| `ClientGatewayAuditEntry` | Type | `packages/contracts/src/client-gateway.ts` | - |
| `ClientGatewayCapability` | Type | `packages/contracts/src/client-gateway.ts` | - |
| `ClientGatewayClientHello` | Type | `packages/contracts/src/client-gateway.ts` | `token` is the client's credential: under gateway 0.2 the connected-client credential from the connect flow (`ConnectTokenResponse.credential`), under 0.1 a trusted-client token. |
| `ClientGatewayClientMessage` | Type | `packages/contracts/src/client-gateway.ts` | - |
| `ClientGatewayClientType` | Type | `packages/contracts/src/client-gateway.ts` | - |
| `ClientGatewayCommandClosure` | Type | `packages/fluxiq/src/client-gateway/service/command-history.ts` | How Core had stopped waiting for a command when its late result came. |
| `ClientGatewayCommandContext` | Class | `packages/fluxiq/src/client-gateway/service/command-ledger/context.ts` | Opaque server capability. JSON, prototypes and copied fields cannot establish issuance. |
| `ClientGatewayCommandLedgerLease` | Type | `packages/fluxiq/src/client-gateway/service/command-ledger/contracts.ts` | - |
| `ClientGatewayCommandOwnerRef` | Type | `packages/fluxiq/src/client-gateway/service/command-history.ts` | The run a command was sent for, when the dispatcher knew it. |
| `ClientGatewayCredentialCustody` | Type | `packages/fluxiq/src/client-gateway/service/credential-custody.ts` | Who keeps something for a client's credential, told of each moment the gateway handles one. The gateway owns the credential and verifies it; custody decides what it opens. Only a credential the gateway has verified reaches `issued`, `confirmed`, `rotating` or `presented`, and the gateway never logs one. |
| `ClientGatewayCredentialHolder` | Type | `packages/fluxiq/src/client-gateway/service/credential-custody.ts` | A trusted client as custody needs it: who it acts for, until when, and what to call it. No credential. |
| `ClientGatewayDurableActionOptions` | Type | `packages/fluxiq/src/client-gateway/service/command-ledger/contracts.ts` | - |
| `ClientGatewayDurableActionResponse` | Type | `packages/fluxiq/src/client-gateway/service/command-ledger/contracts.ts` | - |
| `ClientGatewayEnvelope` | Type | `packages/contracts/src/client-gateway.ts` | - |
| `ClientGatewayEvent` | Type | `packages/contracts/src/client-gateway.ts` | - |
| `ClientGatewayEventHandler` | Type | `packages/contracts/src/client-gateway.ts` | - |
| `ClientGatewayGoingAwayNotice` | Type | `packages/contracts/src/client-gateway.ts` | `server.going_away` (gateway 0.2): the server is draining. No new work is sent; the client keeps its credential and reconnects after `retryAfterMs`. |
| `ClientGatewayHelloMetadata` | Type | `packages/contracts/src/client-gateway.ts` | A hello's metadata. Open, as in 0.1; gateway 0.2 names `clientLabel`, the person-readable name of this client ("Work laptop") that the connect consent page and the account's client list show. |
| `ClientGatewayHostLease` | Type | `packages/contracts/src/client-gateway.ts` | The host lease a command is issued under (automation-project-agents-plan, `Host resources and concurrency`). Core's gateway stamps it from the scheduler's scope; a caller never writes it. `resourceKey` is opaque to Core and names the domain's resource (for the web extension, its automation tab); `epoch` rises every time the resource is granted again, so a client refuses a command whose epoch is lower than the highest it has seen for that key. |
| `ClientGatewayItemKind` | Type | `packages/fluxiq/src/client-gateway/service/types.ts` | - |
| `ClientGatewayLateActionResult` | Type | `packages/fluxiq/src/client-gateway/service/command-history.ts` | A result that arrived for a command Core no longer awaited. It names the command and how it ended, never what the client said in words: no message, payload or target, so no page data reaches the run's evidence through it. |
| `ClientGatewayLateActionResultListener` | Type | `packages/fluxiq/src/client-gateway/service/command-history.ts` | - |
| `ClientGatewayPairingCapacityError` | Class | `packages/fluxiq/src/client-gateway/service/security/pairing-capacity-error.ts` | A new pairing challenge refused because a pending-pairing cap was reached (`ClientGatewayPairingLimits`). `code` is what a caller reads; the client that asked is told the same code in `server.error`. |
| `ClientGatewayPairingCapacityScope` | Type | `packages/fluxiq/src/client-gateway/service/security/pairing-capacity-error.ts` | Which pending-pairing cap a new challenge met. |
| `ClientGatewayPairingChallenge` | Type | `packages/contracts/src/client-gateway.ts` | - |
| `ClientGatewayPairingLimits` | Type | `packages/fluxiq/src/client-gateway/service/security/pairing-limits.ts` | Caps on pairing challenges still waiting for approval. `total` bounds them across the gateway; `perAddress` bounds those asked for from one client address, and `null` turns that cap off. A challenge whose session has no known address counts towards `total` only. |
| `ClientGatewayPairingRequired` | Type | `packages/contracts/src/client-gateway.ts` | `server.pairing_required`. Gateway 0.2 adds `codeEntryUrl`, the same-origin path where the signed-in person types `referenceCode` (Flow B). |
| `ClientGatewayPeer` | Type | `packages/fluxiq/src/client-gateway/service/security/peer.ts` | Where a connection came from, as the transport read it. `address` is the full client address; `prefix` is the part of it the audit may keep (the transport decides how much to keep); `source` says whether it came from the socket's own peer, from a forwarded header the transport was told to trust, or from nowhere. The gateway keeps it on its own session record only. It never reaches the public session (`ClientGatewaySession` is a frozen contract), an event, a trace or the snapshot, and the audit carries `clientAddressPrefix` alone. |
| `ClientGatewayReconcileAnswer` | Type | `packages/contracts/src/client-gateway.ts` | A client's answer to `server.reconcile_command`. `result` is present only on `landed`. |
| `ClientGatewayReconcileRequest` | Type | `packages/contracts/src/client-gateway.ts` | Core asking a client what became of a command it sent: answered, never executed. |
| `ClientGatewayReconcileState` | Type | `packages/contracts/src/client-gateway.ts` | - |
| `ClientGatewayRecordingEvent` | Type | `packages/contracts/src/client-gateway.ts` | - |
| `ClientGatewayReportedActionResult` | Type | `packages/contracts/src/client-gateway.ts` | An action result as a client sends it: Core's result, whose status may also be `interrupted`. |
| `ClientGatewayReportedActionStatus` | Type | `packages/contracts/src/client-gateway.ts` | - |
| `ClientGatewayRequiredCommandContext` | Class | `packages/fluxiq/src/client-gateway/service/command-ledger/required-context.ts` | Registration validation and STOP only; the real resolver still enforces live ownership/storage. |
| `ClientGatewayRevokedNotice` | Type | `packages/contracts/src/client-gateway.ts` | `server.revoked` (gateway 0.2): the credential this socket connected with is revoked. The gateway closes the socket after it; the client discards the credential and must connect again through the connect flow. |
| `ClientGatewayRuntimeTransport` | Class | `packages/fluxiq/src/runtime/client-gateway-transport.ts` | - |
| `ClientGatewayRuntimeTransportOptions` | Type | `packages/fluxiq/src/runtime/client-gateway-transport.ts` | - |
| `ClientGatewaySecurityEventListener` | Type | `packages/fluxiq/src/client-gateway/service/security/security-events.ts` | Hears each security event as it is recorded. A throw or a rejection is audited and never reaches the gateway. |
| `ClientGatewayServerMessage` | Type | `packages/contracts/src/client-gateway.ts` | - |
| `ClientGatewayService` | Class | `packages/fluxiq/src/client-gateway/service.ts` | The client gateway: pairing, durable client trust, session lifecycle, and the command channel to a paired client. This class is a facade. It holds no gateway state of its own; each method forwards to the collaborator under `service/` that owns the state it touches. Its public surface is the gateway contract every program imports, so a method is added or removed here only when that contract changes — the collaborators behind it can be reshaped freely. |
| `ClientGatewayServiceOptions` | Type | `packages/fluxiq/src/client-gateway/service/types.ts` | Construction options for `ClientGatewayService`. |
| `ClientGatewaySession` | Type | `packages/contracts/src/client-gateway.ts` | - |
| `ClientGatewaySessionReady` | Type | `packages/contracts/src/client-gateway.ts` | `server.session_ready`. Gateway 0.2 adds who the session acts as (`user`, `workspace`) and `credentialExpiresAt` (epoch milliseconds); a connected client's credential rotates on every connect, and `token` is then the new credential the client stores in place of the old one. |
| `ClientGatewaySessionStatus` | Type | `packages/contracts/src/client-gateway.ts` | - |
| `ClientGatewaySnapshot` | Type | `packages/contracts/src/client-gateway.ts` | - |
| `ClientGatewaySnapshotView` | Type | `packages/contracts/src/client-gateway.ts` | - |
| `ClientGatewaySocket` | Type | `packages/contracts/src/client-gateway.ts` | - |
| `ClientGatewayStartRecordingRequest` | Type | `packages/contracts/src/client-gateway.ts` | - |
| `ClientGatewayStateUpdate` | Type | `packages/contracts/src/client-gateway.ts` | - |
| `ClientGatewayStopRecordingRequest` | Type | `packages/contracts/src/client-gateway.ts` | - |
| `ClientGatewaySummaryItem` | Type | `packages/fluxiq/src/client-gateway/service/types.ts` | - |
| `ClientGatewaySummaryPage` | Type | `packages/fluxiq/src/client-gateway/service/types.ts` | - |
| `ClientGatewayTraceActivity` | Type | `packages/fluxiq/src/client-gateway/trace/types.ts` | - |
| `ClientGatewayTraceAlignment` | Class | `packages/fluxiq/src/client-gateway/trace-replay/walk/alignment.ts` | - |
| `clientGatewayTraceArtifactDigest` | Value | `packages/fluxiq/src/client-gateway/trace/artifact-digest.ts` | - |
| `ClientGatewayTraceArtifactEntry` | Type | `packages/fluxiq/src/client-gateway/trace/types.ts` | One captured artifact: its integrity, its type, and the sequence it arrived at. |
| `ClientGatewayTraceArtifactInput` | Type | `packages/fluxiq/src/client-gateway/trace/types.ts` | Captured content arriving. The sink copies the bytes and computes their digest. |
| `ClientGatewayTraceArtifactIntake` | Type | `packages/fluxiq/src/client-gateway/service/trace-tap/types.ts` | How many open traces claiming the session took the artifact, or why it was refused. |
| `ClientGatewayTraceArtifactPresence` | Type | `packages/fluxiq/src/client-gateway/trace/types.ts` | An artifact a store actually holds, with the digest of the bytes it holds. |
| `ClientGatewayTraceArtifactReference` | Type | `packages/contracts/src/client-gateway.ts` | One artifact a client uploaded for a traced command; `sha256` is the lower-case hex SHA-256 of its bytes. |
| `ClientGatewayTraceArtifactRole` | Type | `packages/contracts/src/client-gateway.ts` | - |
| `ClientGatewayTraceArtifactUpload` | Type | `packages/fluxiq/src/client-gateway/service/trace-tap/types.ts` | A trace artifact as a paired client uploads it: its claimed digest, its type and its bytes. |
| `ClientGatewayTraceCaptureSource` | Type | `packages/fluxiq/src/client-gateway/trace/capture-source.ts` | Where the client gateway finds the trace to record into (traces and offline trials, P2): the sink of the episode the dispatching async context runs in, read synchronously the way the gateway reads `hostLease` and `channelScope`. The program owns episodes and their stores; the gateway never imports them. Unset on the gateway, or answering `undefined`, nothing is captured and capture costs nothing. |
| `clientGatewayTraceCausalChains` | Value | `packages/fluxiq/src/client-gateway/trace-replay/comparison/causal-chains.ts` | - |
| `ClientGatewayTraceCheckpoint` | Type | `packages/fluxiq/src/client-gateway/trace/types.ts` | A point in the trace an observation can be reconstructed from. |
| `ClientGatewayTraceCheckpointInput` | Type | `packages/fluxiq/src/client-gateway/trace/types.ts` | - |
| `ClientGatewayTraceCheckpointResult` | Type | `packages/fluxiq/src/client-gateway/trace/types.ts` | - |
| `ClientGatewayTraceClockOrigin` | Type | `packages/fluxiq/src/client-gateway/trace/types.ts` | The point every event's logical time is measured from. |
| `ClientGatewayTraceCloseInput` | Type | `packages/fluxiq/src/client-gateway/trace/types.ts` | - |
| `ClientGatewayTraceComparedSide` | Type | `packages/fluxiq/src/client-gateway/trace-replay/comparison/event-differences.ts` | One side of a comparison: an event, and the alignment keys and session translation of its trace. |
| `ClientGatewayTraceCompatibility` | Type | `packages/fluxiq/src/client-gateway/trace/types.ts` | The compatibility decision a caller made over the manifest's contract versions. |
| `ClientGatewayTraceCompleteness` | Type | `packages/fluxiq/src/client-gateway/trace/types.ts` | - |
| `ClientGatewayTraceCompletenessClaim` | Type | `packages/fluxiq/src/client-gateway/trace/types.ts` | The recorder's own claim about the trace. Readers never trust a `complete` claim alone: they evaluate the evidence (`evaluateClientGatewayTraceCompleteness`). |
| `ClientGatewayTraceCompletenessInput` | Type | `packages/fluxiq/src/client-gateway/trace/types.ts` | - |
| `ClientGatewayTraceCompletenessIssue` | Type | `packages/fluxiq/src/client-gateway/trace/types.ts` | One reason a trace is incomplete, tagged by sequence range or artifact. |
| `ClientGatewayTraceCompletenessStatus` | Type | `packages/fluxiq/src/client-gateway/trace/types.ts` | - |
| `ClientGatewayTraceContext` | Type | `packages/fluxiq/src/client-gateway/trace/types.ts` | Opaque program context (task inputs, goal contract version), named by its schema. |
| `clientGatewayTraceContractCompatibility` | Value | `packages/fluxiq/src/client-gateway/trace-matcher/contract-compatibility.ts` | - |
| `ClientGatewayTraceCorrelation` | Type | `packages/fluxiq/src/client-gateway/trace/types.ts` | Explicit correlations only. A cause is recorded only when it is known; the next state change is never assumed to follow from the previous command. |
| `ClientGatewayTraceCorrelationInput` | Type | `packages/fluxiq/src/client-gateway/trace/types.ts` | Correlation as the gateway supplies it; `owner` is cloned on record. |
| `ClientGatewayTraceCorrelationKey` | Type | `packages/fluxiq/src/client-gateway/trace/types.ts` | The correlation fields a store indexes. |
| `ClientGatewayTraceDeliveredAfter` | Type | `packages/fluxiq/src/client-gateway/trace-matcher/recorded-feed.ts` | The command a delivery came after: the one whose recorded segment holds it. |
| `ClientGatewayTraceDerivation` | Type | `packages/fluxiq/src/client-gateway/trace/types.ts` | - |
| `ClientGatewayTraceDurableOwner` | Type | `packages/fluxiq/src/client-gateway/trace-replay/walk/recorded-command.ts` | The run binding a durable command is issued under. |
| `ClientGatewayTraceEvent` | Type | `packages/fluxiq/src/client-gateway/trace/types.ts` | One delivery to or from Core, in authoritative delivery order. |
| `clientGatewayTraceEventDifferences` | Value | `packages/fluxiq/src/client-gateway/trace-replay/comparison/event-differences.ts` | - |
| `ClientGatewayTraceEventInput` | Type | `packages/fluxiq/src/client-gateway/trace/types.ts` | What the gateway hands the sink for one event; the sink assigns sequence, id and time. |
| `ClientGatewayTraceEventKind` | Type | `packages/fluxiq/src/client-gateway/trace/types.ts` | - |
| `clientGatewayTraceEventsWithOnlySession` | Value | `packages/fluxiq/src/client-gateway/trace-replay/session-references/attached.ts` | - |
| `ClientGatewayTraceFidelityLimitation` | Type | `packages/fluxiq/src/client-gateway/trace/types.ts` | A scope whose evidence is present but withheld: it cannot pass exact parity. |
| `clientGatewayTraceGapAnswer` | Value | `packages/fluxiq/src/client-gateway/trace-matcher/gap-answer.ts` | - |
| `ClientGatewayTraceIssueCode` | Type | `packages/fluxiq/src/client-gateway/trace/types.ts` | - |
| `clientGatewayTraceJsonDifferences` | Value | `packages/fluxiq/src/client-gateway/trace-replay/comparison/json-differences.ts` | - |
| `ClientGatewayTraceJsonValue` | Type | `packages/fluxiq/src/client-gateway/trace/types.ts` | A deep-frozen JSON value. |
| `ClientGatewayTraceLoss` | Type | `packages/fluxiq/src/client-gateway/trace/types.ts` | Sequences the recorder assigned and could not keep. |
| `ClientGatewayTraceLossReason` | Type | `packages/fluxiq/src/client-gateway/trace/types.ts` | - |
| `ClientGatewayTraceManifest` | Type | `packages/fluxiq/src/client-gateway/trace/types.ts` | What identifies and qualifies one trace. Episode ids are live run ids. |
| `ClientGatewayTraceMatchedOperation` | Type | `packages/fluxiq/src/client-gateway/trace-matcher/types.ts` | A command answered from the trace. `ordinal`: its place among the commands the matcher was sent, from 1. `answeredFrom`: `recorded`, a strict match fed the recorded result; `reevaluated`, a changed command whose result a reevaluator gave in the recorded result's place. `fields`: where the command differed from the recorded operation, by path (empty for a strict match). |
| `ClientGatewayTraceMatcher` | Class | `packages/fluxiq/src/client-gateway/trace-matcher/matcher.ts` | - |
| `ClientGatewayTraceMatcherAdmission` | Type | `packages/fluxiq/src/client-gateway/trace-matcher/types.ts` | A trace read and judged for matching: refused, or its operations and deliveries for one session. |
| `ClientGatewayTraceMatcherClock` | Type | `packages/fluxiq/src/client-gateway/trace-matcher/types.ts` | The trial's clock. Time moves only when the matcher asks it to, by a recorded latency or delta. |
| `ClientGatewayTraceMatcherDeliveries` | Type | `packages/fluxiq/src/client-gateway/trace-matcher/types.ts` | What the trace delivers before the first recorded operation, and after each one up to the next. |
| `ClientGatewayTraceMatcherDelivery` | Type | `packages/fluxiq/src/client-gateway/trace-matcher/types.ts` | One recorded event the matcher hands the gateway once its point is reached: an inbound message, an uploaded artifact, or the point where Core's own answer wait ran out for a command (`deadline`: nothing is fed, the clock is moved past it). `atMs` is the logical time the clock is moved to before it. |
| `ClientGatewayTraceMatcherGap` | Type | `packages/fluxiq/src/client-gateway/trace-matcher/types.ts` | An evidence gap: a command answered with one, or a recorded event or artifact that could not be read or fed. `fields` names what differed from the recorded operation it was compared with, by path, never by value. `cause`: the trace was refused, the command differed from the next recorded operation, it came past the recorded end, it came after an earlier gap, the trace's answer to it could not be read back, a reevaluator answered it with a gap or failed (`reevaluation`; a failure is `incomplete_capture`), or (`failed_delivery`) a recorded event delivered after it could not be read or fed: then the ordinal, command id and action type are the matched command's (0, "" and "" before the first), and `recordedSequence` is the event's. |
| `ClientGatewayTraceMatcherGapReason` | Type | `packages/fluxiq/src/client-gateway/trace-matcher/types.ts` | - |
| `ClientGatewayTraceMatcherGateway` | Type | `packages/fluxiq/src/client-gateway/trace-matcher/types.ts` | The gateway the matcher's session is attached to and feeds. |
| `ClientGatewayTraceMatcherInput` | Type | `packages/fluxiq/src/client-gateway/trace-matcher/types.ts` | - |
| `ClientGatewayTraceMatcherRefusal` | Type | `packages/fluxiq/src/client-gateway/trace-matcher/types.ts` | Why a trace cannot be matched against at all. |
| `ClientGatewayTraceMatcherReport` | Type | `packages/fluxiq/src/client-gateway/trace-matcher/types.ts` | What a trial reads from the matcher for its result. |
| `ClientGatewayTraceMatcherSessionView` | Type | `packages/fluxiq/src/client-gateway/trace-matcher/types.ts` | The public view the matcher's session is attached with, and where it came from: `recorded`, the view the trace took when it first claimed the session (`session.claimed`); `supplied`, a view the caller handed in for a trace that recorded none (in a build, the live session's public view for the same client). A supplied view never stands in for a recorded one. |
| `ClientGatewayTraceMemoryStore` | Class | `packages/fluxiq/src/client-gateway/trace/memory-store.ts` | - |
| `clientGatewayTraceOlderDispositionView` | Value | `packages/fluxiq/src/client-gateway/trace-replay/comparison/older-disposition.ts` | - |
| `ClientGatewayTraceOlderDispositionView` | Type | `packages/fluxiq/src/client-gateway/trace-replay/comparison/older-disposition.ts` | What a version 1 disposition is compared against, and the gap it leaves when nothing else differs. |
| `ClientGatewayTraceOperation` | Type | `packages/fluxiq/src/client-gateway/trace-matcher/types.ts` | An external call, as the matcher compares it (`./operation/fields.ts`). |
| `clientGatewayTraceOperationDifferences` | Value | `packages/fluxiq/src/client-gateway/trace-matcher/operation/differences.ts` | - |
| `ClientGatewayTraceOperationMatch` | Type | `packages/fluxiq/src/client-gateway/trace-matcher/types.ts` | The outcome of comparing one command with the trace at the cursor. |
| `ClientGatewayTraceOrigin` | Type | `packages/fluxiq/src/client-gateway/trace/types.ts` | Whether a trace is what a live episode delivered (`live`) or something produced from traces: a replay's diagnostic trace, or a trace that left Core and came back (`derived`). A derived trace is never read as live (T24). |
| `ClientGatewayTraceParityClass` | Type | `packages/fluxiq/src/client-gateway/trace-replay/types.ts` | Why a delivery point diverged. `capture_gap`: the trace lacks something the replay needs. `nondeterminism`: an id or time Core minted, or the order of concurrent handling. `intake_defect`: the same input, a different derivation. |
| `ClientGatewayTraceParityDivergence` | Type | `packages/fluxiq/src/client-gateway/trace-replay/types.ts` | One delivery point that did not match. |
| `ClientGatewayTraceParityEntry` | Type | `packages/fluxiq/src/client-gateway/trace-replay/types.ts` | Each original sequence: matched, diverged, or outside gateway parity (an input that bypassed the gateway). |
| `ClientGatewayTraceParityNormalization` | Type | `packages/fluxiq/src/client-gateway/trace-replay/types.ts` | A field left out of the comparison, and why it cannot carry what Core derived. |
| `ClientGatewayTraceParityReport` | Type | `packages/fluxiq/src/client-gateway/trace-replay/types.ts` | - |
| `ClientGatewayTracePayload` | Type | `packages/fluxiq/src/client-gateway/trace/types.ts` | An event's payload. `text` is the raw text as received: it keeps absent versus `null`, number spellings, unknown fields and key order. `json` is a deep-frozen clone of a structured message. `none` carries nothing. |
| `ClientGatewayTracePayloadInput` | Type | `packages/fluxiq/src/client-gateway/trace/types.ts` | - |
| `ClientGatewayTraceProvenance` | Type | `packages/fluxiq/src/client-gateway/trace/types.ts` | - |
| `ClientGatewayTraceRecordedCommand` | Type | `packages/fluxiq/src/client-gateway/trace-replay/walk/recorded-command.ts` | - |
| `clientGatewayTraceRecordedDeliveries` | Value | `packages/fluxiq/src/client-gateway/trace-matcher/recorded-deliveries.ts` | - |
| `ClientGatewayTraceRecordedFeed` | Class | `packages/fluxiq/src/client-gateway/trace-matcher/recorded-feed.ts` | - |
| `ClientGatewayTraceRecordedFeedInput` | Type | `packages/fluxiq/src/client-gateway/trace-matcher/recorded-feed.ts` | - |
| `ClientGatewayTraceRecordedOperation` | Type | `packages/fluxiq/src/client-gateway/trace-matcher/types.ts` | A recorded `server.execute_action`: the operation, where the trace delivered it, and the command id it went out with. |
| `ClientGatewayTraceRecordedPayload` | Type | `packages/fluxiq/src/client-gateway/trace-matcher/types.ts` | A message payload as the trace recorded it, or as a reevaluator answers it: an object, read as data. |
| `ClientGatewayTraceRecordedSession` | Type | `packages/fluxiq/src/client-gateway/trace-replay/types.ts` | A session the trace met, as the original recorded it. |
| `ClientGatewayTraceRecorder` | Class | `packages/fluxiq/src/client-gateway/trace/recorder.ts` | - |
| `ClientGatewayTraceRecorderOptions` | Type | `packages/fluxiq/src/client-gateway/trace/recorder.ts` | - |
| `ClientGatewayTraceRecorderStart` | Type | `packages/fluxiq/src/client-gateway/trace/recorder.ts` | What a trace is about, fixed when it starts. Episode ids are live run ids. |
| `ClientGatewayTraceRecorderState` | Type | `packages/fluxiq/src/client-gateway/trace/types.ts` | - |
| `ClientGatewayTraceRecordResult` | Type | `packages/fluxiq/src/client-gateway/trace/types.ts` | The answer to one record call. The sink never throws into the gateway. |
| `ClientGatewayTraceRedaction` | Type | `packages/fluxiq/src/client-gateway/trace/types.ts` | A withheld field (JSON pointer) and why. A declared fidelity limitation. |
| `ClientGatewayTraceRedactionReason` | Type | `packages/fluxiq/src/client-gateway/trace/types.ts` | - |
| `ClientGatewayTraceReevaluation` | Type | `packages/fluxiq/src/client-gateway/trace-matcher/types.ts` | A reevaluator's answer. `answered`: `result` replaces the payload of the recorded result (the matcher sets its command id), and the command counts as matched; `gap`: the command is answered with this evidence gap; `declined`: the matcher answers as it would with no reevaluator. |
| `ClientGatewayTraceReevaluationArtifact` | Type | `packages/fluxiq/src/client-gateway/trace-matcher/types.ts` | An artifact a reevaluator may read: one the trace recorded up to the end of the replaced operation's segment. |
| `clientGatewayTraceReevaluationRequest` | Value | `packages/fluxiq/src/client-gateway/trace-matcher/reevaluation-request.ts` | - |
| `ClientGatewayTraceReevaluationRequest` | Type | `packages/fluxiq/src/client-gateway/trace-matcher/types.ts` | What a reevaluator is asked (traces and offline trials, P5): a command that differs from the recorded operation at the cursor in its target or parameters but keeps its action type, beside everything the trace recorded up to the end of that operation's segment and nothing after it. - `command`: the `server.execute_action` payload the trial's gateway sent; `operation`: its compared form; - `recorded`: the recorded operation at the cursor; `recordedCommand`: the payload it was recorded with, or `null` when that was withheld or cannot be read back; - `fields`: where the two differ, by path; - `recordedResult`: the payload of the one `client.action_result` the segment recorded for the recorded command, its command id as recorded; - `artifacts`: every artifact the trace recorded up to the end of that segment, in recorded order; `readArtifact` gives back the bytes of a listed one by its digest, and `undefined` for any other. |
| `ClientGatewayTraceReevaluator` | Type | `packages/fluxiq/src/client-gateway/trace-matcher/types.ts` | The port a domain plugs into the matcher to answer a changed command from what the trace recorded (a page snapshot, in the web domain). Core stays domain-neutral: it only asks, feeds the answer in the recorded result's place, and reads a failure as a gap, never a pass. |
| `ClientGatewayTraceReplayContext` | Type | `packages/fluxiq/src/client-gateway/trace-replay/walk/gateway.ts` | What the replayed gateway reads as its dispatching context, set by the replay around each call. |
| `ClientGatewayTraceReplayGaps` | Type | `packages/fluxiq/src/client-gateway/trace-replay/types.ts` | What the replay noted it could not feed, by original sequence, session reference or command id. |
| `ClientGatewayTraceReplayGateway` | Type | `packages/fluxiq/src/client-gateway/trace-replay/walk/gateway.ts` | - |
| `ClientGatewayTraceReplayInput` | Type | `packages/fluxiq/src/client-gateway/trace-replay/types.ts` | What a replay reads and how it is run. |
| `ClientGatewayTraceReplayLedger` | Class | `packages/fluxiq/src/client-gateway/trace-replay/walk/ledger.ts` | - |
| `ClientGatewayTraceReplayMessageStamp` | Type | `packages/fluxiq/src/client-gateway/trace-replay/walk/sources.ts` | A message the recording shows a step sent: its id, and its time stamp when it carried one. |
| `ClientGatewayTraceReplayOutcome` | Type | `packages/fluxiq/src/client-gateway/trace-replay/types.ts` | What a walk through a trace produced, for the comparison. |
| `ClientGatewayTraceReplaySources` | Class | `packages/fluxiq/src/client-gateway/trace-replay/walk/sources.ts` | - |
| `ClientGatewayTraceReplayStep` | Type | `packages/fluxiq/src/client-gateway/trace-replay/walk/sources.ts` | What one replay step is fed. |
| `ClientGatewayTraceReplayTimers` | Class | `packages/fluxiq/src/client-gateway/trace-replay/walk/timers.ts` | - |
| `ClientGatewayTraceReplayWalk` | Class | `packages/fluxiq/src/client-gateway/trace-replay/walk/walk.ts` | - |
| `ClientGatewayTraceRequest` | Type | `packages/contracts/src/client-gateway.ts` | On a traced action command's `metadata.trace`. `scope` names the trace the command is recorded into: a client that skips re-uploading what it already sent keeps one such record per scope, so every trace holds each artifact its results reference. |
| `ClientGatewayTraceResultMetadata` | Type | `packages/contracts/src/client-gateway.ts` | On a traced command's result `metadata.trace`: what the client uploaded, and how many artifacts it could not. |
| `ClientGatewayTraceSchemaRef` | Type | `packages/fluxiq/src/client-gateway/trace/types.ts` | A named, versioned schema: a payload contract or the program's context. |
| `ClientGatewayTraceSequenceRange` | Type | `packages/fluxiq/src/client-gateway/trace/types.ts` | A closed range of delivery sequences; `to: null` is open-ended (to the trace's end). |
| `ClientGatewayTraceSessionReferences` | Type | `packages/fluxiq/src/client-gateway/trace-replay/types.ts` | Whether the trace's events say which session they belong to. `recorded`: every event that belongs to a session names its reference (or none belongs to one). A trace captured before the tap gave events a session reference is legacy: `single_session` when the trace itself shows it held one session (`checks`, each a fixed sentence), so the replay attached that session's reference to its events as a declared normalization; `refused` when it cannot be shown (`reason`, a fixed sentence), so every event without a reference is a capture gap. |
| `ClientGatewayTraceSink` | Type | `packages/fluxiq/src/client-gateway/trace/types.ts` | The port the client gateway records through (wired in P2). `record` and `recordArtifact` are synchronous: they assign the delivery sequence and take an immutable copy before returning, so later mutation of the live object cannot alter the trace. `flush` persists; `close` ends the trace. |
| `ClientGatewayTraceSinkStatus` | Type | `packages/fluxiq/src/client-gateway/trace/types.ts` | What the sink shows about itself at any moment. |
| `ClientGatewayTraceSource` | Type | `packages/fluxiq/src/client-gateway/trace/types.ts` | Where an event came from on the client side: the client envelope's id and sequence. |
| `ClientGatewayTraceSourceInput` | Type | `packages/fluxiq/src/client-gateway/trace/types.ts` | - |
| `clientGatewayTraceStandInHello` | Value | `packages/fluxiq/src/client-gateway/trace-replay/walk/stand-in-hello.ts` | - |
| `ClientGatewayTraceStateAnswer` | Type | `packages/fluxiq/src/client-gateway/trace-state/types.ts` | - |
| `ClientGatewayTraceStateAnsweredRule` | Type | `packages/fluxiq/src/client-gateway/trace-state/types.ts` | - |
| `ClientGatewayTraceStateAnswerReading` | Type | `packages/fluxiq/src/client-gateway/trace-state/types.ts` | An answer as the domain reads it. |
| `ClientGatewayTraceStateAssertion` | Type | `packages/fluxiq/src/client-gateway/trace-state/types.ts` | One of the three assertions a pass needs, and whether a gap left it unknown. |
| `ClientGatewayTraceStateCallKind` | Type | `packages/fluxiq/src/client-gateway/trace-state/types.ts` | What a call does to the state: looks at it, moves the page, or acts on it. |
| `ClientGatewayTraceStateCallOutcome` | Type | `packages/fluxiq/src/client-gateway/trace-state/types.ts` | How a call came out: `succeeded` starts a new state when the call moves or acts; `no_effect` and `failed` never do. |
| `ClientGatewayTraceStateClockSpan` | Type | `packages/fluxiq/src/client-gateway/trace-state/types.ts` | The time a recording spans, on the wall clock it was recorded under: what a simulated run's clock reads. |
| `ClientGatewayTraceStateComputedRead` | Type | `packages/fluxiq/src/client-gateway/trace-state/types.ts` | A read's answer computed from recorded reads: the recorded read it came from, the answer in its place, and its rows by identity. |
| `ClientGatewayTraceStateDomain` | Type | `packages/fluxiq/src/client-gateway/trace-state/types.ts` | The domain's half of the rule. Core never reads a target, a selector or a URL. - `labelCall`: read, page move or act, from the domain's own classification; - `pageMoveForm`: `absolute` names where it goes, and may be made from anywhere; `relative` moves from where the page is, so its place is part of its identity; - `canonicalKey`: equal keys are the same call, as JSON text of what is compared. Every difference it removes is in `normalisations`; row identity and the call's values are never removed; - `siblingKey`: the canonical key apart from row identity. Two acts with equal sibling keys and different canonical keys act on two rows of one list; - `waitMs`: the wait the command gave, when it names one; - `isOneTimeLayerAct`: whether a recorded act closed a layer in front of the page, judged from the read before it. Such an act may be gone the next time (rule 6); - `handleScope`: a fresh reader of one run's calls in order, which rewrites what a run mints for itself (which tab, which frame, the instant it reads dates at) to where it stands in that run, so two runs' calls compare and a genuinely new handle still differs. `clock` is the time the recording spans: an instant inside it is the recording's own, and one outside it stays in the key. With no clock every instant is the run's own. Declared among `normalisations`. Calls go through it before `canonicalKey`; - `unansweredCall`: what a read or a page move the recording cannot answer is told so the run can go on and report what else it cannot answer, or `null` when it cannot go on. It says nothing was read and nothing moved. It is never recorded data, and any such answer leaves the verdict `inconclusive`. An act has none: a run never hears that an act landed when it did not; - `computeRead`: a read the recording holds no answer for, computed from recorded reads of the state it stands in, or `null` when the page would be needed. It is also asked when `recordedAnswerFits` says a same-input answer does not stand as it is. |
| `clientGatewayTraceStateEndCheck` | Value | `packages/fluxiq/src/client-gateway/trace-state/end-check.ts` | - |
| `ClientGatewayTraceStateEndCheck` | Type | `packages/fluxiq/src/client-gateway/trace-state/types.ts` | - |
| `ClientGatewayTraceStateEngine` | Class | `packages/fluxiq/src/client-gateway/trace-state/engine.ts` | - |
| `ClientGatewayTraceStateEngineAnswered` | Type | `packages/fluxiq/src/client-gateway/trace-state/engine.ts` | A command answered from the recording: by the recorded answer of `recordedSequence`, or computed from its rows. |
| `ClientGatewayTraceStateEngineGap` | Type | `packages/fluxiq/src/client-gateway/trace-state/engine.ts` | A command answered with a gap, or (`failed_delivery`) a recorded event that could not be fed. |
| `ClientGatewayTraceStateEngineGapCode` | Type | `packages/fluxiq/src/client-gateway/trace-state/engine.ts` | Why the state engine could not use a recorded event, or a command it could not answer. |
| `ClientGatewayTraceStateEngineInput` | Type | `packages/fluxiq/src/client-gateway/trace-state/engine.ts` | - |
| `ClientGatewayTraceStateEngineReport` | Type | `packages/fluxiq/src/client-gateway/trace-state/engine.ts` | - |
| `ClientGatewayTraceStateEntry` | Type | `packages/fluxiq/src/client-gateway/trace-state/types.ts` | A recorded call placed in the recording's states. |
| `ClientGatewayTraceStateGapCode` | Type | `packages/fluxiq/src/client-gateway/trace-state/types.ts` | - |
| `clientGatewayTraceStateIsBookkeepingCall` | Value | `packages/fluxiq/src/client-gateway/trace-state/bookkeeping-calls.ts` | - |
| `ClientGatewayTraceStateNearest` | Type | `packages/fluxiq/src/client-gateway/trace-state/types.ts` | A gap's nearest recorded call: where to look and what differed, by path. |
| `ClientGatewayTraceStateNormalisation` | Type | `packages/fluxiq/src/client-gateway/trace-state/types.ts` | One normalisation a domain's canonical key applies, named so a report can say what was made equal and why. |
| `ClientGatewayTraceStateReceipt` | Type | `packages/fluxiq/src/client-gateway/trace-state/types.ts` | Why a successful recorded act need not be repeated by a Flow: a reducer's receipt for it, or (only when asked for) that it closed a one-time layer. |
| `ClientGatewayTraceStateRecordedCall` | Type | `packages/fluxiq/src/client-gateway/trace-state/types.ts` | One command of a trace with its answer, in delivery order. |
| `clientGatewayTraceStateRecordedCalls` | Value | `packages/fluxiq/src/client-gateway/trace-state/recorded-calls.ts` | - |
| `ClientGatewayTraceStateRecordedCalls` | Type | `packages/fluxiq/src/client-gateway/trace-state/recorded-calls.ts` | - |
| `ClientGatewayTraceStateRecordedRead` | Type | `packages/fluxiq/src/client-gateway/trace-state/types.ts` | A recorded read offered to `computeRead`, with its place in the recording. |
| `clientGatewayTraceStateRecording` | Value | `packages/fluxiq/src/client-gateway/trace-state/recording.ts` | - |
| `ClientGatewayTraceStateRecording` | Type | `packages/fluxiq/src/client-gateway/trace-state/types.ts` | - |
| `ClientGatewayTraceStateSkippedActs` | Type | `packages/fluxiq/src/client-gateway/trace-state/types.ts` | What a walk does with an act the recording holds in the same position after acts this run skipped. `gap`: the study's rule, a read or move there shows what this run did not cause. `tolerate`: answered, with the count on the answer. |
| `clientGatewayTraceStateVerdict` | Value | `packages/fluxiq/src/client-gateway/trace-state/verdict.ts` | - |
| `ClientGatewayTraceStateVerdict` | Type | `packages/fluxiq/src/client-gateway/trace-state/types.ts` | - |
| `ClientGatewayTraceStateVerdictValue` | Type | `packages/fluxiq/src/client-gateway/trace-state/types.ts` | - |
| `ClientGatewayTraceStateWalker` | Class | `packages/fluxiq/src/client-gateway/trace-state/walker.ts` | - |
| `ClientGatewayTraceStateWalkOptions` | Type | `packages/fluxiq/src/client-gateway/trace-state/types.ts` | - |
| `clientGatewayTraceStepMessages` | Value | `packages/fluxiq/src/client-gateway/trace-replay/walk/step-messages.ts` | - |
| `ClientGatewayTraceStore` | Type | `packages/fluxiq/src/client-gateway/trace/types.ts` | Persisted traces with indexed reads, so a replay loads only what it needs. |
| `ClientGatewayTraceStoreWriter` | Type | `packages/fluxiq/src/client-gateway/trace/types.ts` | The write side a recorder persists through. Artifacts, then events, then the manifest. |
| `ClientGatewayTraceTerminationReason` | Type | `packages/fluxiq/src/client-gateway/trace/types.ts` | - |
| `ClientGatewayTraceTime` | Type | `packages/fluxiq/src/client-gateway/trace/types.ts` | - |
| `ClientGatewayTrustedClient` | Type | `packages/contracts/src/client-gateway.ts` | - |
| `ClientGatewayTrustedClientStore` | Type | `packages/fluxiq/src/client-gateway/service/types.ts` | Durable store the gateway reads trusted clients from and writes them back to. |
| `ClientGatewayTrustedClientView` | Type | `packages/contracts/src/client-gateway.ts` | - |
| `ClientGatewayUnknownPayload` | Type | `packages/contracts/src/client-gateway.ts` | - |
| `Clock` | Type | `packages/fluxiq/src/core/index.ts` | - |
| `cloneClientGatewayTraceJson` | Value | `packages/fluxiq/src/client-gateway/trace/clone-json.ts` | - |
| `CompleteComputeCommandRequest` | Type | `packages/fluxiq/src/programs/compute-control/api/contracts.ts` | - |
| `ComponentDefinition` | Type | `packages/fluxiq/src/components/index.ts` | - |
| `ComponentParamSpec` | Type | `packages/fluxiq/src/components/index.ts` | - |
| `ComponentRegistry` | Class | `packages/fluxiq/src/components/index.ts` | - |
| `ComponentSpec` | Type | `packages/fluxiq/src/components/index.ts` | - |
| `COMPUTE_CONTROL_ENDPOINTS` | Object | `packages/fluxiq/src/programs/compute-control/api/contracts.ts` | - |
| `COMPUTE_CONTROL_PROGRAM` | Object | `packages/fluxiq/src/programs/compute-control/metadata.ts` | - |
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
| `ControlBackgroundTaskRequest` | Type | `packages/fluxiq/src/programs/background-tasks/api/contracts.ts` | - |
| `createClientGatewayTraceReplayGateway` | Value | `packages/fluxiq/src/client-gateway/trace-replay/walk/gateway.ts` | - |
| `createEnvelope` | Value | `packages/fluxiq/src/io/index.ts` | - |
| `createGlobalProgramRuntime` | Value | `packages/fluxiq/src/programs/_shared/runtime.ts` | - |
| `createId` | Value | `packages/fluxiq/src/core/index.ts` | - |
| `CreateIdentityUserRequest` | Type | `packages/fluxiq/src/programs/identity-access/api/contracts.ts` | - |
| `createPasswordIdentityProvider` | Value | `packages/fluxiq/src/programs/identity-access/runtime/providers/password.ts` | - |
| `createRecord` | Value | `packages/fluxiq/src/framework/persistence/repository/sqlite-repository.ts` | - |
| `createRuntimeInputs` | Value | `packages/fluxiq/src/engine/index.ts` | - |
| `createRuntimeOutputs` | Value | `packages/fluxiq/src/engine/index.ts` | - |
| `createRuntimeSession` | Value | `packages/fluxiq/src/engine/index.ts` | - |
| `CreateSecretKeyRequest` | Type | `packages/fluxiq/src/programs/secret-keys/api/contracts.ts` | - |
| `cutAtWord` | Value | `packages/fluxiq/src/ui/activity-status/cut-at-word.ts` | - |
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
| `DatabaseManagerSnapshot` | Type | `packages/fluxiq/src/framework/persistence/repository/types.ts` | - |
| `DatabaseManagerSnapshotRequest` | Type | `packages/fluxiq/src/programs/database-manager/api/contracts.ts` | - |
| `DatabaseManagerSnapshotResponse` | Type | `packages/fluxiq/src/programs/database-manager/api/contracts.ts` | - |
| `DatabaseManagerStoreRequest` | Type | `packages/fluxiq/src/programs/database-manager/api/contracts.ts` | - |
| `DatabaseManagerStoreSummary` | Type | `packages/fluxiq/src/framework/persistence/repository/types.ts` | - |
| `DatabaseManagerViewState` | Type | `packages/fluxiq/src/programs/database-manager/ui/contracts.ts` | - |
| `declinedSubmission` | Value | `packages/fluxiq/src/ui/activity-status/declined-submission.ts` | - |
| `DEFAULT_SESSION_TTL_MS` | Object | `packages/fluxiq/src/programs/identity-access/runtime/service.ts` | - |
| `defaultGlobalProgramCatalog` | Value | `packages/fluxiq/src/programs/_shared/catalog.ts` | - |
| `defaultProgramCatalog` | Object | `packages/fluxiq/src/programs/_shared/catalog.ts` | - |
| `defaultRoles` | Object | `packages/fluxiq/src/programs/identity-access/runtime/roles.ts` | - |
| `DefinedInput` | Type | `packages/fluxiq/src/io/index.ts` | - |
| `defineDomainIo` | Value | `packages/fluxiq/src/io/index.ts` | - |
| `DefinedOutput` | Type | `packages/fluxiq/src/io/index.ts` | - |
| `defineInput` | Value | `packages/fluxiq/src/io/index.ts` | - |
| `defineOutput` | Value | `packages/fluxiq/src/io/index.ts` | - |
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
| `deriveClientGatewayTraceEvent` | Value | `packages/fluxiq/src/client-gateway/trace/derived-origin.ts` | - |
| `deriveClientGatewayTraceManifest` | Value | `packages/fluxiq/src/client-gateway/trace/derived-origin.ts` | - |
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
| `EncryptedSecretValueRecord` | Type | `packages/fluxiq/src/programs/secret-keys/types.ts` | - |
| `EncryptedSecretValueRecordV1` | Type | `packages/fluxiq/src/programs/secret-keys/types.ts` | A version 1 seal: scrypt at Node's default cost (N=2^14), recording no parameters, with the base64url salt text itself as the scrypt salt. Still read; never written. It is re-sealed as version 2 at its next successful unlock or reveal. |
| `EncryptedSecretValueRecordV2` | Type | `packages/fluxiq/src/programs/secret-keys/types.ts` | A version 2 seal: records its scrypt parameters, which must be in the read allowlist, and derives from the decoded salt bytes. `sealedByUserId` is a non-secret hint naming the account whose password sealed the value, so a login tries only that user's keys; tampering with it affects availability only. |
| `endingKindOf` | Value | `packages/fluxiq/src/ui/activity-status/ending-kind.ts` | - |
| `endsOnDoubt` | Value | `packages/fluxiq/src/ui/activity-status/doubted-ending.ts` | - |
| `evaluateClientGatewayTraceCompleteness` | Value | `packages/fluxiq/src/client-gateway/trace/evaluate-completeness.ts` | - |
| `evaluateClientGatewayTraceSessionReferences` | Value | `packages/fluxiq/src/client-gateway/trace-replay/session-references/evaluation.ts` | - |
| `FanOutGate` | Class | `packages/fluxiq/src/ui/activity-status/fan-out-gate.ts` | - |
| `FileRepository` | Class | `packages/fluxiq/src/framework/persistence/repository/file-repository.ts` | - |
| `FileRuntimeStore` | Class | `packages/fluxiq/src/runtime/storage.ts` | - |
| `FileRuntimeStoreOptions` | Type | `packages/fluxiq/src/runtime/storage.ts` | - |
| `FlowDocument` | Type | `packages/fluxiq/src/flows/index.ts` | - |
| `FlowEdge` | Type | `packages/fluxiq/src/flows/index.ts` | - |
| `flowInstructionScopeFromPayload` | Value | `packages/fluxiq/src/framework/automation-service/service/flow-instruction-requests/scope.ts` | - |
| `FlowNode` | Type | `packages/fluxiq/src/flows/index.ts` | - |
| `FlowNodeContext` | Type | `packages/fluxiq/src/flows/index.ts` | - |
| `FlowNodeHandler` | Type | `packages/fluxiq/src/flows/index.ts` | - |
| `FlowRetry` | Type | `packages/fluxiq/src/flows/index.ts` | - |
| `FlowState` | Type | `packages/fluxiq/src/flows/index.ts` | - |
| `FlowStepResult` | Type | `packages/fluxiq/src/engine/index.ts` | - |
| `FlowValidationIssue` | Type | `packages/fluxiq/src/flows/index.ts` | - |
| `FluxIQ` | Class | `packages/fluxiq/src/framework/index.ts` | - |
| `FLUXIQ_LAYOUT_V3_VERSION` | Object | `packages/fluxiq/src/framework/layout-v3/version.ts` | - |
| `FLUXIQ_RUNTIME_WITHHELD_VALUE` | Object | `packages/fluxiq/src/runtime/contracts.ts` | What a withheld value reads as in a command attempt the runtime keeps. A constant rather than a removed field, so a reader can tell a value that was withheld from one that was never there. |
| `FLUXIQ_STORAGE_LAYOUT_VERSION` | Object | `packages/fluxiq/src/framework/storage-layout.ts` | - |
| `FluxIQCloseOptions` | Type | `packages/fluxiq/src/framework/index.ts` | How `FluxIQ.close()` ends an instance. `shutdown` (the default) is a real stop: every held key is revoked. `evict` drops an idle instance a host will create again: key custody given in `FluxIQOptions.heldKeys` stays held, so its users stay unlocked. Both close the instance's own connections and detach it from process-wide state, and neither touches another instance's. |
| `FluxIQConfigFile` | Type | `packages/fluxiq/src/framework/index.ts` | - |
| `fluxiqConsoleTheme` | Object | `packages/fluxiq/src/ui/index.ts` | - |
| `FluxIQEnvironment` | Type | `packages/fluxiq/src/framework/index.ts` | - |
| `FluxIQEnvironmentKey` | Type | `packages/fluxiq/src/framework/index.ts` | - |
| `FluxIQHostPaths` | Type | `packages/fluxiq/src/framework/index.ts` | - |
| `FluxIQIconName` | Type | `packages/fluxiq/src/ui/index.ts` | - |
| `FluxIQLayoutV3Inspection` | Type | `packages/fluxiq/src/framework/layout-v3/inspect.ts` | - |
| `fluxiqLayoutV3Paths` | Value | `packages/fluxiq/src/framework/layout-v3/paths.ts` | - |
| `FluxIQLayoutV3Paths` | Type | `packages/fluxiq/src/framework/layout-v3/paths-type.ts` | Where a multi-tenant (`service`) deployment keeps its platform state and workspaces. All paths are absolute. |
| `FluxIQMigrationJournal` | Type | `packages/fluxiq/src/framework/storage-layout.ts` | - |
| `FluxIQOptions` | Type | `packages/fluxiq/src/framework/index.ts` | - |
| `FluxIQPerformanceMetric` | Type | `packages/fluxiq/src/framework/persistence/performance-metrics/performance-metrics.ts` | - |
| `fluxiqPerformanceMetricsSnapshot` | Value | `packages/fluxiq/src/framework/persistence/performance-metrics/performance-metrics.ts` | - |
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
| `fluxiqWorkspaceRootDir` | Value | `packages/fluxiq/src/framework/layout-v3/workspace-root-dir.ts` | - |
| `FrameworkResult` | Type | `packages/fluxiq/src/core/index.ts` | - |
| `GeneratedDocumentationPage` | Type | `packages/fluxiq/src/programs/docs/types.ts` | - |
| `GetMyPreferencesRequest` | Type | `packages/fluxiq/src/programs/identity-access/api/contracts.ts` | The calling person's own preferences. Both endpoints act only on the caller (`request.actor.userId`): the request names no person, and one that carries any field but `startingHumanness` is refused (`IDENTITY_PREFERENCES_ERRORS.selfOnly`). |
| `GetRuntimeRunRequest` | Type | `packages/fluxiq/src/programs/runtime-control/api/contracts.ts` | - |
| `GLOBAL_PROGRAMS` | Object | `packages/fluxiq/src/programs/_shared/catalog.ts` | - |
| `GlobalProgramApiRegistry` | Class | `packages/fluxiq/src/programs/_shared/api.ts` | - |
| `GlobalProgramDefinition` | Type | `packages/fluxiq/src/programs/_shared/types.ts` | - |
| `GlobalProgramRuntime` | Type | `packages/fluxiq/src/programs/_shared/runtime.ts` | - |
| `GlobalProgramRuntimeActivity` | Type | `packages/fluxiq/src/programs/_shared/runtime.ts` | The work in flight in one runtime. Every count is zero when it is idle. - `openProjectDatabases`: Automation Studio project databases open. A run and a build hold theirs for as long as they work, so this is how one is seen; any other project operation holds one for its own length, and the pool closes an idle one within a second. - `backgroundTasksRunning`: background task runs not yet settled. - `backgroundTasksScheduled`: tasks outside the built-in `maintenance` queue that a person turned on with an interval through this runtime. - `openGatewaySessions`: client gateway sessions not disconnected. - `taskAttemptsInFlight`: answer-first task attempts entered and not yet ended. An attempt can wait a long time holding nothing (a person's answer, a provider's backoff), with no project database open and its gateway session gone, so this is the count that says it is still working, whether or not tracing is on. |
| `GlobalProgramRuntimeOptions` | Type | `packages/fluxiq/src/programs/_shared/runtime.ts` | How a program runtime is built; each field is optional, and absent means today's local behaviour. |
| `HeldKeys` | Class | `packages/fluxiq/src/programs/secret-keys/runtime/held-keys.ts` | Custody of password-derived keys held after a successful check: session unlocks and one-use reveal authorizations. Invariant: every held key opens its record's current seal. Rotation, metadata edits, and deletion revoke a key's holders; a re-seal or credential change replaces their keys. Every buffer dropped or replaced is zeroed. A `SecretKeysService` creates its own, or is given one that outlives it (a workspace manager's, so evicting an idle instance does not lock its users' keys). Expiry timers come from here and hold only this custody and an id, never the service that asked for them or the password that unlocked them. |
| `IDENTITY_ACCESS_ENDPOINTS` | Object | `packages/fluxiq/src/programs/identity-access/api/contracts.ts` | - |
| `IDENTITY_ACCESS_PROGRAM` | Object | `packages/fluxiq/src/programs/identity-access/metadata.ts` | - |
| `IDENTITY_PREFERENCES_ERRORS` | Object | `packages/fluxiq/src/programs/identity-access/api/contracts.ts` | The named refusals of the preference endpoints, sent as the response's `errorCode`. |
| `IDENTITY_RECASE_ERRORS` | Object | `packages/fluxiq/src/programs/identity-access/api/contracts.ts` | The named refusals of `recase-my-username`, sent as the response's `errorCode`. A name another person has ignoring case is refused as `identity.username_taken` (`IdentityUsernameTakenError`), as on every write. |
| `IdentityAccessListedUser` | Type | `packages/fluxiq/src/programs/identity-access/types.ts` | A person as the `snapshot` endpoint lists them. `authorityHeldElsewhere` is true exactly when `update-user` would refuse to change their sign-in name, role or on/off (`IdentityAuthorityDelegation`): an account holder, whose three are provisioning's, or a person the owner could not answer for. A client offers those changes only when it is false. |
| `IdentityAccessListing` | Type | `packages/fluxiq/src/programs/identity-access/types.ts` | The snapshot as the `snapshot` endpoint answers it: each person marked as an `IdentityAccessListedUser`. |
| `IdentityAccessPanel` | Type | `packages/fluxiq/src/programs/identity-access/ui/contracts.ts` | - |
| `IdentityAccessService` | Class | `packages/fluxiq/src/programs/identity-access/runtime/service.ts` | - |
| `IdentityAccessServiceOptions` | Type | `packages/fluxiq/src/programs/identity-access/types.ts` | - |
| `IdentityAccessSnapshot` | Type | `packages/fluxiq/src/programs/identity-access/types.ts` | - |
| `IdentityAccessSnapshotResponse` | Type | `packages/fluxiq/src/programs/identity-access/api/contracts.ts` | Each person carries `authorityHeldElsewhere`: whether `update-user` refuses their sign-in name, role and on/off. |
| `IdentityAccessStore` | Type | `packages/fluxiq/src/programs/identity-access/storage/contracts.ts` | - |
| `IdentityAccessViewState` | Type | `packages/fluxiq/src/programs/identity-access/ui/contracts.ts` | - |
| `IdentityAuthorityDelegation` | Class | `packages/fluxiq/src/programs/identity-access/runtime/authority/delegation.ts` | Where a person's authority (sign-in name, sign-in role and on/off) is held: here, or with the one owner a host hands it to (`holdElsewhere`), its account provisioning. One source of truth per person: an account holder's role is a projection of their memberships' policies, their on/off follows their account's status and their sign-in name is their account's email, all written only by provisioning, so the `update-user` endpoint asks `refuseChangeHeldElsewhere` before it changes any of the three and refuses an account holder's. Provisioning writes through `IdentityAccessService.updateUser`, which never asks. |
| `IdentityAuthorityManagedError` | Class | `packages/fluxiq/src/programs/identity-access/runtime/authority/managed-error.ts` | The refusal of an Identity Access sign-in name, role or on/off change for a person whose authority is held elsewhere (`IdentityAuthorityOwner`): a person with a platform account. Their sign-in role is derived from their workspace memberships' policies, whether they may sign in from their account's status, and their sign-in name is their account's email, so a change made here would disagree with provisioning's record and the role or on/off would be undone by the next provisioning change. Its `code` is what a caller matches on; the registry answers it as the response's `errorCode`. |
| `IdentityAuthorityOwner` | Type | `packages/fluxiq/src/programs/identity-access/types.ts` | Who holds a person's authority (their sign-in name, sign-in role and whether they may sign in) when Identity Access does not: the host's account provisioning, for a person with a platform account, whose role is derived from their workspace memberships' policies and whose sign-in name is their account email. `holdsAuthorityOf` is true for such a person; the `update-user` endpoint then refuses to change their sign-in name, role or on/off (`IdentityAuthorityManagedError`), while provisioning keeps writing them through the service directly. An answer that cannot be had (a throw) refuses the change too: it is never read as "no account". |
| `IdentityAuthorityUncheckedError` | Class | `packages/fluxiq/src/programs/identity-access/runtime/authority/unchecked-error.ts` | The refusal of an Identity Access sign-in name, role or on/off change when the authority owner (`IdentityAuthorityOwner`) could not say whether the person's authority is held elsewhere. Failing closed: an unreadable answer is never read as "held here", so nothing changes until it can be checked. Carries no detail of the failure. |
| `IdentityCredentialChange` | Type | `packages/fluxiq/src/programs/identity-access/types.ts` | A password change announced to credential-change subscribers, such as a program that re-seals data under the new password. `currentPassword` is set only for a self-service change, where the account's own current password was proven for it; an administrator's reset of another account carries none, so data sealed under the old password cannot be recovered. |
| `IdentityCredentialChangeSubscriber` | Type | `packages/fluxiq/src/programs/identity-access/types.ts` | The credential-change port. Every subscriber `prepare`s before the credential is written, and a `prepare` that throws refuses the change. After the write each subscriber is sent `commit`; when a `prepare` or the write fails, each subscriber asked to prepare is sent `abort` instead. |
| `IdentityLastAdministratorError` | Class | `packages/fluxiq/src/programs/identity-access/runtime/last-administrator-error.ts` | The refusal to disable, delete or demote the last enabled administrator (`updateUser`, `deleteUser`). Its `code` is what a caller outside this program matches on -- platform provisioning answers it as `last_administrator` -- so it never parses the message. |
| `IdentityProvider` | Type | `packages/fluxiq/src/programs/identity-access/runtime/providers/identity-provider.ts` | One way of proving a person's identity, taking that provider's own credentials. |
| `IdentityProviderId` | Type | `packages/fluxiq/src/programs/identity-access/runtime/providers/identity-provider.ts` | The providers Core knows: `password` now, `oidc` in H2. |
| `IdentityProviderSignIn` | Type | `packages/fluxiq/src/programs/identity-access/runtime/providers/identity-provider.ts` | A signed-in person: the session minted for them, their account and their role. |
| `IdentitySessionEnd` | Type | `packages/fluxiq/src/programs/identity-access/types.ts` | A session end by digest, for what is keyed by what is stored: it needs no raw id, so it reaches a listener for a session this process never saw. `wholeUserId` says every session of that person ended together, including any `digests` does not list. Announced with the same rule as `IdentitySessionRevocationListener`. |
| `IdentitySessionEndListener` | Type | `packages/fluxiq/src/programs/identity-access/types.ts` | - |
| `IdentitySessionRevocationListener` | Type | `packages/fluxiq/src/programs/identity-access/types.ts` | Told the raw id of each panel session revoked -- by a sign-out, an administrator's revoke, `revokeUserSessions` or `deleteUser` -- and who revoked it, so a program holding state per session drops it: Secret Keys' unlocks are keyed by that id, and it drops one only for that unlock's own user or an administrator. The id is the cookie's bearer value; it is handed over in memory only and must never be stored or logged. A listener that fails is reported by the revoke after every other listener has run; the session stays revoked. |
| `IdentitySessionRevoker` | Type | `packages/fluxiq/src/programs/identity-access/types.ts` | Who revokes a panel session. `userId` is the user asking, or for a revoke with no named revoker (a sign-out presenting its own cookie, `revokeUserSessions`, `deleteUser`) the session's own user, null when it is unknown. `administrator` is true only for a caller whose permission check admitted `identity.manage`. |
| `IdentitySessionTarget` | Type | `packages/fluxiq/src/programs/identity-access/types.ts` | A session to revoke: its raw id, or (administrators only) the digest the panel lists it by. |
| `IdentitySetPasswordAuthorized` | Type | `packages/fluxiq/src/programs/identity-access/types.ts` | A password change by someone proving themselves on a session of theirs: the person, or an administrator. |
| `IdentityTwoFactorResetError` | Class | `packages/fluxiq/src/programs/identity-access/runtime/two-factor-reset-error.ts` | The refusal of `resetPassword` (a welcome or reset link, or an operator's reset) for an account with two-factor sign-in whose credential is sealed and not unlocked in this process. The authenticator secret is inside the seal, so the reset could only go ahead by turning two-factor off, and a link or an operator command alone must never do that. Nothing is changed; a signed-in administrator resets such an account (`setPasswordAuthorized`). Its `code` is what platform provisioning matches on (answered as `two_factor`), never the message. |
| `IdentityUsernameTakenError` | Class | `packages/fluxiq/src/programs/identity-access/runtime/username-taken-error.ts` | The refusal of a sign-in name another person already has, ignoring case (`refuseTakenUsername`): sign-in matches names ignoring case, so two people whose names differ only by case could not both sign in by name. Nothing is changed. Its `code` is what a caller outside this program matches on; the `create-user` and `update-user` endpoints answer it as the response's `errorCode`, never by parsing the message. |
| `IdentityUserUpdate` | Type | `packages/fluxiq/src/programs/identity-access/types.ts` | The fields of an account an administrator may change. |
| `initializeFluxIQLayoutV3` | Value | `packages/fluxiq/src/framework/layout-v3/initialize.ts` | - |
| `initializeFluxIQStorage` | Value | `packages/fluxiq/src/framework/storage-layout.ts` | - |
| `InputAdapter` | Type | `packages/fluxiq/src/io/index.ts` | - |
| `InputOutputBinding` | Type | `packages/fluxiq/src/io/index.ts` | - |
| `InputReadRequest` | Type | `packages/fluxiq/src/io/index.ts` | - |
| `inspectFluxIQLayoutV3` | Value | `packages/fluxiq/src/framework/layout-v3/inspect.ts` | - |
| `inspectFluxIQStorage` | Value | `packages/fluxiq/src/framework/storage-layout.ts` | - |
| `IoAdapterSummary` | Type | `packages/fluxiq/src/io/index.ts` | - |
| `IoEnvelope` | Type | `packages/fluxiq/src/io/index.ts` | - |
| `IoInputRole` | Type | `packages/fluxiq/src/io/index.ts` | - |
| `IoMode` | Type | `packages/fluxiq/src/io/index.ts` | - |
| `IoRegistration` | Type | `packages/fluxiq/src/io/index.ts` | - |
| `IoRegistry` | Class | `packages/fluxiq/src/io/index.ts` | - |
| `IoSnapshot` | Type | `packages/fluxiq/src/io/index.ts` | - |
| `IoUnsubscribe` | Type | `packages/fluxiq/src/io/index.ts` | - |
| `IoValidationIssue` | Type | `packages/fluxiq/src/io/index.ts` | - |
| `isClientGatewayTraceLive` | Value | `packages/fluxiq/src/client-gateway/trace/derived-origin.ts` | - |
| `isHeadlineEcho` | Value | `packages/fluxiq/src/ui/activity-status/headline-echo.ts` | - |
| `isInternalStep` | Value | `packages/fluxiq/src/ui/activity-status/internal-step.ts` | - |
| `isModelThought` | Value | `packages/fluxiq/src/ui/activity-status/model-thought.ts` | - |
| `issueClientGatewayTraceCallerCommand` | Value | `packages/fluxiq/src/client-gateway/trace-replay/walk/caller-command.ts` | - |
| `JsonObject` | Type | `packages/contracts/src/core.ts` | - |
| `JsonPrimitive` | Type | `packages/contracts/src/core.ts` | - |
| `JsonValue` | Type | `packages/contracts/src/core.ts` | - |
| `loadFluxIQEnv` | Value | `packages/fluxiq/src/framework/index.ts` | - |
| `LoadFluxIQEnvOptions` | Type | `packages/fluxiq/src/framework/index.ts` | - |
| `longestWordCut` | Value | `packages/fluxiq/src/ui/activity-status/word-cut.ts` | - |
| `matchClientGatewayTraceOperation` | Value | `packages/fluxiq/src/client-gateway/trace-matcher/operation/match.ts` | - |
| `migrateFluxIQStorage` | Value | `packages/fluxiq/src/framework/storage-migration.ts` | - |
| `Migration` | Type | `packages/fluxiq/src/framework/persistence/repository/types.ts` | - |
| `MigrationRun` | Type | `packages/fluxiq/src/framework/persistence/repository/types.ts` | - |
| `MockClientGatewayClient` | Class | `packages/fluxiq/src/client-gateway/testing/mock-client.ts` | - |
| `MODEL_KEY_LOCK_REASONS` | Object | `packages/contracts/src/task-attempts/model-key-lock.ts` | Why a person's model key is locked where they are, and the one thing to do about it. Every sentence a person reads about a locked key comes from here: the empty chat's setup step, the reply to a task that did not start, the line a waiting task writes, so they cannot drift apart. - `first_unlock`: nothing has been stored for this person yet, as on the first start after unlocks began to last. Told once (`Unlock` then ends it for good). - `signed_out`: they signed out, and this browser went with it. - `administrator`: an administrator ended their session. - `sessions_ended`: all their sessions ended together, such as a disabled account brought back. - `password_changed`: they changed their password somewhere else, which ends every unlock but the session that changed it. A change often means they suspect someone. - `password_reset`: their password was reset without the old one, so nothing they can type opens the key: they add it again. - `unknown`: locked, with nothing more to say. |
| `modelKeyLockedWords` | Value | `packages/contracts/src/task-attempts/model-key-lock.ts` | - |
| `ModelKeyLockReason` | Type | `packages/contracts/src/task-attempts/model-key-lock.ts` | - |
| `ModelKeySettingsRecord` | Type | `packages/fluxiq/src/programs/secret-keys/types.ts` | Which model key is the workspace's default, and what the panel assistant uses. One small record beside the keys; it holds key ids, a model id and a notice, never a value. Absent until something sets it: the default is then the oldest enabled model key, so a workspace made before this record needs no migration. |
| `ModelKeySettingsResponse` | Type | `packages/fluxiq/src/programs/secret-keys/api/contracts.ts` | The reply of `set-default-key`, `get-assistant-model` and `set-assistant-model`. |
| `ModelKeySettingsView` | Type | `packages/fluxiq/src/programs/secret-keys/types.ts` | The model-key choices as a client shows them: no ids of values, only which key. |
| `MyPreferencesResponse` | Type | `packages/fluxiq/src/programs/identity-access/api/contracts.ts` | What both preference endpoints answer: the value now stored, null when none. |
| `NavigationItem` | Type | `packages/fluxiq/src/ui/index.ts` | - |
| `normalizeDomainId` | Value | `packages/fluxiq/src/domains/index.ts` | - |
| `normalizeFluxIQStatus` | Value | `packages/fluxiq/src/ui/index.ts` | - |
| `notTriedOutcome` | Value | `packages/fluxiq/src/ui/activity-status/not-tried.ts` | - |
| `OfferSecretKeyRequest` | Type | `packages/fluxiq/src/programs/secret-keys/api/contracts.ts` | The holder offers their own key to the workspace (`offered` true) or withdraws it (false). |
| `OfferSecretKeyResponse` | Type | `packages/fluxiq/src/programs/secret-keys/api/contracts.ts` | The reply of `offer-key`. |
| `opensActivityAttempt` | Value | `packages/fluxiq/src/ui/activity-status/attempt/opens.ts` | - |
| `OutputAdapter` | Type | `packages/fluxiq/src/io/index.ts` | - |
| `OutputDispatchRequest` | Type | `packages/fluxiq/src/io/index.ts` | - |
| `OutputDispatchResult` | Type | `packages/fluxiq/src/io/index.ts` | - |
| `PasswordIdentityCredentials` | Type | `packages/fluxiq/src/programs/identity-access/runtime/providers/password.ts` | What the password provider takes: the `authenticate` input, without the test-only clock. |
| `pathSize` | Value | `packages/fluxiq/src/framework/storage-layout.ts` | - |
| `Permission` | Type | `packages/fluxiq/src/programs/identity-access/types.ts` | - |
| `personFacingTextFaults` | Value | `packages/fluxiq/src/ui/person-facing/text-faults.ts` | - |
| `PollComputeCommandsRequest` | Type | `packages/fluxiq/src/programs/compute-control/api/contracts.ts` | - |
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
| `ProgramApiActor` | Type | `packages/fluxiq/src/programs/_shared/api.ts` | Who calls. `channel` says how the call arrived: `paired-client` for a connected client's token (its `permissions` are narrowed below its role's), `panel` or absent otherwise. Under the `service` profile only a paired client is narrowed by its permissions; everyone else by their policies. |
| `ProgramApiEndpointSummary` | Type | `packages/fluxiq/src/programs/_shared/api.ts` | What `endpoints()` lists for one registration (the catalog generator and parity read it). |
| `ProgramApiHandler` | Type | `packages/fluxiq/src/programs/_shared/api.ts` | - |
| `ProgramApiIamOptions` | Type | `packages/fluxiq/src/programs/_shared/iam/registry-iam-types.ts` | How `GlobalProgramApiRegistry` decides (constructor option `iam`). - `profile`: `local` (the default) and `self-hosted` decide exactly as today's `actor.permissions.includes(registration.permission)` did, through the IAM engine; `service` decides by the policies `source` attaches to the caller, under `FluxIQServiceGuardrail`. - `workspaceId`: the workspace every FRN is in; `workspace-main` by default. - `source`: where `service` reads a principal's policies (an `IamStore`). Without one, `service` denies everything. - `audit`: where every decision is recorded. The default discards them; it never keeps an unbounded buffer. |
| `ProgramApiRegistrationParams` | Type | `packages/fluxiq/src/programs/_shared/api.ts` | One registration: its program, endpoint, today's permission and classification, and its IAM declaration. The declaration is optional in the type only so test doubles can register bare endpoints: every live registration declares `action`, `accessLevel` and `resource` (a registry test fails the build on any that does not), and an undeclared endpoint evaluates against the workspace FRN, which grants no owner-conditioned access. `assistant` says how the panel assistant may call the endpoint (its input, summary, phrases and context arguments), or `{ hidden: <reason> }`. It is optional in the type for the same reason; the assistant parity test fails the build on any live registration without one. |
| `ProgramApiRequest` | Type | `packages/fluxiq/src/programs/_shared/api.ts` | One call. `via` names who made it on the actor's behalf: `assistant` for every tool call the panel assistant makes, written to the call's audit rows; absent for the person's own. `pressGrant` is a press grant that server code (never a request body, never a model) hands over after the person pressed Allow; a panel page sends its grant as the payload's `pressGrant` field instead. A grant never reaches a handler: `call()` drops both from the request it hands on. |
| `ProgramApiResponse` | Type | `packages/fluxiq/src/programs/_shared/api.ts` | - |
| `programAuthorizationPinError` | Value | `packages/fluxiq/src/programs/_shared/authorization.ts` | - |
| `ProgramDirectory` | Type | `packages/fluxiq/src/programs/_shared/types.ts` | - |
| `ProgramDirectoryContract` | Type | `packages/contracts/src/program-api.ts` | - |
| `programDirectorySchema` | Object | `packages/contracts/src/program-api.ts` | - |
| `ProgramEndpointClassification` | Type | `packages/fluxiq/src/programs/_shared/api.ts` | What an endpoint does to persisted state, and therefore which credential the registry requires beyond the endpoint's permission. Every registration declares one, so a new endpoint cannot reach the wire unclassified: omitting the field is a compile error, not a review note. - `read` — persists nothing. The permission is the whole gate. - `authoring` — creates or edits user content, or withdraws access without removing persisted data. The permission is the whole gate: the operator's PIN guards destruction, not authorship, so an autonomous loop can build and edit Flows with nobody at the keyboard, and revoking a compromised session or client never waits behind a prompt. - `destructive` — removes persisted user data, or takes an irreversible external action. `call()` requires a confirmation before the handler runs (`confirmDestructiveCall`): the person's PIN where they turned one on, otherwise a press grant their own press of Delete or Allow minted. - `program-gated` — the owning program runs its own, stronger credential check inside the handler (password, PIN and TOTP, or a time-boxed grant). The registry adds nothing, so that one regime stays the single rule. - `destructive-ungated` — destructive, and no credential is checked. A declared gap, not an endorsement: either no operator auth session reaches the program at all, or the gate was never written. Each one is listed in `docs/architecture/automation-studio/persistence.md`. |
| `ProgramEndpointPerformanceMetric` | Type | `packages/fluxiq/src/framework/persistence/performance-metrics/performance-metrics.ts` | - |
| `ProgramPinAuthorizationPayload` | Type | `packages/fluxiq/src/programs/_shared/authorization.ts` | - |
| `ProgramScope` | Type | `packages/fluxiq/src/programs/_shared/types.ts` | - |
| `ProgramScopeContract` | Type | `packages/contracts/src/program-api.ts` | - |
| `programScopeSchema` | Object | `packages/contracts/src/program-api.ts` | - |
| `programStateConnections` | Object | `packages/fluxiq/src/framework/persistence/program-state/state-connections.ts` | The storage state's SQLite connection pools, one per storage root: a unit of work keeps connections with `forRoot(dir).keepWhile`, and a FluxIQ instance closes only its own root's with `close(dir)` (t435, t808). |
| `ProgramStatus` | Type | `packages/fluxiq/src/programs/_shared/types.ts` | - |
| `ProgramSummary` | Type | `packages/fluxiq/src/programs/_shared/types.ts` | - |
| `ProgramSummaryContract` | Type | `packages/contracts/src/program-api.ts` | - |
| `programSummarySchema` | Object | `packages/contracts/src/program-api.ts` | - |
| `projectCard` | Value | `packages/fluxiq/src/ui/activity-status/project/project-card.ts` | - |
| `readClientGatewayTraceHello` | Value | `packages/fluxiq/src/client-gateway/trace-replay/walk/hello.ts` | - |
| `readClientGatewayTraceInboundText` | Value | `packages/fluxiq/src/client-gateway/trace-replay/walk/inbound-text.ts` | - |
| `readClientGatewayTraceMessageStamp` | Value | `packages/fluxiq/src/client-gateway/trace-replay/walk/message-stamp.ts` | - |
| `readClientGatewayTraceOperation` | Value | `packages/fluxiq/src/client-gateway/trace-matcher/operation/read.ts` | - |
| `readClientGatewayTraceRecordedCommand` | Value | `packages/fluxiq/src/client-gateway/trace-replay/walk/recorded-command.ts` | - |
| `readClientGatewayTraceSessions` | Value | `packages/fluxiq/src/client-gateway/trace-replay/walk/recorded-sessions.ts` | - |
| `readMigrationJournal` | Value | `packages/fluxiq/src/framework/storage-layout.ts` | - |
| `readModelKeyLockReason` | Value | `packages/contracts/src/task-attempts/model-key-lock.ts` | - |
| `readStorageConfig` | Value | `packages/fluxiq/src/framework/storage-layout.ts` | - |
| `RecaseMyUsernameRequest` | Type | `packages/fluxiq/src/programs/identity-access/api/contracts.ts` | The calling person's own sign-in name in another case (`recase-my-username`). It acts only on the caller (`request.actor.userId`): the request names no person, and one that carries any field but `username` is refused (`IDENTITY_RECASE_ERRORS.selfOnly`). `username` must equal the caller's current name ignoring case (`usernameKey`); it is written as sent and answered as the written person, the same as `update-user` answers. |
| `RecordEnvelope` | Type | `packages/fluxiq/src/framework/persistence/repository/types.ts` | - |
| `recordProgramEndpointPerformance` | Value | `packages/fluxiq/src/framework/persistence/performance-metrics/performance-metrics.ts` | - |
| `recordSqlPerformance` | Value | `packages/fluxiq/src/framework/persistence/performance-metrics/performance-metrics.ts` | - |
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
| `ReleaseComputeLeaseRequest` | Type | `packages/fluxiq/src/programs/compute-control/api/contracts.ts` | - |
| `removeFluxIQWorkspaceRoot` | Value | `packages/fluxiq/src/framework/layout-v3/remove-workspace-root.ts` | - |
| `replayClientGatewayTrace` | Value | `packages/fluxiq/src/client-gateway/trace-replay/replay-trace.ts` | - |
| `Repository` | Type | `packages/fluxiq/src/framework/persistence/repository/types.ts` | - |
| `RepositoryListPage` | Type | `packages/fluxiq/src/framework/persistence/repository/types.ts` | - |
| `RepositoryListPageOptions` | Type | `packages/fluxiq/src/framework/persistence/repository/types.ts` | - |
| `RepositoryScope` | Type | `packages/fluxiq/src/framework/persistence/repository/types.ts` | - |
| `ResultState` | Type | `packages/fluxiq/src/core/index.ts` | - |
| `RetryState` | Type | `packages/fluxiq/src/ui/activity-status/run-retry.ts` | What a run's recovery makes of one event. |
| `RevealSecretKeyRequest` | Type | `packages/fluxiq/src/programs/secret-keys/api/contracts.ts` | - |
| `RevealSecretKeyResponse` | Type | `packages/fluxiq/src/programs/secret-keys/api/contracts.ts` | - |
| `RevokeSessionRequest` | Type | `packages/fluxiq/src/programs/identity-access/api/contracts.ts` | Exactly one of the two: `sessionId`, a raw session id, or `sessionDigest`, the digest the snapshot lists a session by, so an administrator can revoke another user's session without any raw id leaving the server. |
| `Role` | Type | `packages/fluxiq/src/programs/identity-access/types.ts` | - |
| `ROLE_POLICY_NAMES` | Object | `packages/fluxiq/src/programs/identity-access/runtime/roles.ts` | The predefined IAM identity policies each role is replaced by (hosted production plan, Permissions, "Predefined policies"), as data: the names are the contract's (`IAM_PREDEFINED_POLICIES` in `@fluxiq/contracts/iam`), and the policies themselves are the platform's (`platform/iam/predefined/`), which this program does not import. - `admin` -> `FluxIQAdministratorAccess`, `viewer` -> `FluxIQReadOnlyAccess`: the parity test (`platform/iam/parity/`) proves each allows exactly what the role's permissions allow today. - `user` -> `FluxIQUserAccess`, the own-data rule. No `user` role exists today (`defaultRoles` is unchanged); the entry is the mapping a `user` membership takes when IAM is switched on. |
| `rolePolicyNames` | Value | `packages/fluxiq/src/programs/identity-access/runtime/roles.ts` | - |
| `rollbackFluxIQStorageMigration` | Value | `packages/fluxiq/src/framework/storage-migration.ts` | - |
| `RotateSecretKeyRequest` | Type | `packages/fluxiq/src/programs/secret-keys/api/contracts.ts` | - |
| `RunBackgroundTaskRequest` | Type | `packages/fluxiq/src/programs/background-tasks/api/contracts.ts` | - |
| `RunBackgroundTaskResponse` | Type | `packages/fluxiq/src/programs/background-tasks/api/contracts.ts` | - |
| `runCurrentNode` | Value | `packages/fluxiq/src/engine/index.ts` | - |
| `runFlow` | Value | `packages/fluxiq/src/engine/index.ts` | - |
| `RunRetry` | Class | `packages/fluxiq/src/ui/activity-status/run-retry.ts` | - |
| `RUNTIME_ENDPOINTS` | Object | `packages/fluxiq/src/programs/runtime-control/api/contracts.ts` | - |
| `RUNTIME_PROGRAM` | Object | `packages/fluxiq/src/programs/runtime-control/metadata.ts` | - |
| `runtimeClientFromGatewaySession` | Value | `packages/fluxiq/src/runtime/client-gateway-transport.ts` | - |
| `RuntimeInputs` | Type | `packages/fluxiq/src/io/index.ts` | - |
| `RuntimeMode` | Type | `packages/fluxiq/src/engine/index.ts` | - |
| `RuntimeOutputs` | Type | `packages/fluxiq/src/io/index.ts` | - |
| `RuntimeService` | Class | `packages/fluxiq/src/runtime/service.ts` | - |
| `RuntimeServiceOptions` | Type | `packages/fluxiq/src/runtime/service.ts` | - |
| `RuntimeSession` | Type | `packages/fluxiq/src/engine/index.ts` | - |
| `RuntimeSessionOptions` | Type | `packages/fluxiq/src/engine/index.ts` | - |
| `RuntimeStore` | Type | `packages/fluxiq/src/runtime/storage.ts` | - |
| `RuntimeStoreSnapshot` | Type | `packages/fluxiq/src/runtime/storage.ts` | - |
| `SaveBackgroundTaskScheduleRequest` | Type | `packages/fluxiq/src/programs/background-tasks/api/contracts.ts` | - |
| `SECRET_KEYS_ENDPOINTS` | Object | `packages/fluxiq/src/programs/secret-keys/api/contracts.ts` | - |
| `SECRET_KEYS_PROGRAM` | Object | `packages/fluxiq/src/programs/secret-keys/metadata.ts` | - |
| `SecretKeyActorSession` | Type | `packages/fluxiq/src/programs/secret-keys/runtime/service.ts` | The signed-in session of the person changing a key, as the caller verified it: its id, its user and when it expires. Only that user's own session takes the key, and never past `expiresAtMs`. |
| `SecretKeyAuthorizationPayload` | Type | `packages/fluxiq/src/programs/secret-keys/api/contracts.ts` | - |
| `SecretKeyCredentialChange` | Type | `packages/fluxiq/src/programs/secret-keys/runtime/credential-changes.ts` | A prepared or committed credential change; `resealedKeyCount` counts the keys re-sealed under the next password. |
| `SecretKeyCredentialChangeInput` | Type | `packages/fluxiq/src/programs/secret-keys/runtime/credential-changes.ts` | - |
| `SecretKeyCredentialHolder` | Type | `packages/fluxiq/src/programs/secret-keys/types.ts` | A holder as the caller verified it. `heldAs` is a panel session's own id, which is never stored; a paired client's unlock is held under a random handle instead. |
| `SecretKeyCredentialHolderKind` | Type | `packages/fluxiq/src/programs/secret-keys/types.ts` | Who keeps a credential unlock: a paired client, or a signed-in panel session. Non-secret: a holder id names a trusted client or a session's digest, never a credential or a raw session id. |
| `SecretKeyCredentialUnlockBox` | Type | `packages/fluxiq/src/programs/secret-keys/types.ts` | One record's data key, sealed so that only the holder's private key opens it. |
| `SecretKeyCredentialUnlockGeneration` | Type | `packages/fluxiq/src/programs/secret-keys/types.ts` | One key pair of a holder: the private half under its credential, and what is boxed to the public half, by Secret Keys record id. |
| `SecretKeyCredentialUnlockRecord` | Type | `packages/fluxiq/src/programs/secret-keys/types.ts` | What Core stores so a holder's unlock can come back with no password: nothing in it opens a key without the holder's credential, which Core keeps only as a digest. `pending` is a whole new key pair for the credential a rotation just sent, until it is confirmed in use. A box whose record was re-sealed no longer opens it, and is dropped when found. `lockedAtMs` is set when a holder is new (a paired client starts locked) and by a lock (a sign-out, a revoke): nothing but the person's own unlock naming this holder boxes a key for it again. |
| `SecretKeyCredentialUnlockWrap` | Type | `packages/fluxiq/src/programs/secret-keys/types.ts` | A holder's private key, sealed under a key only its credential derives. |
| `SecretKeyKind` | Type | `packages/fluxiq/src/programs/secret-keys/types.ts` | - |
| `SecretKeyLockedClient` | Type | `packages/fluxiq/src/programs/secret-keys/types.ts` | A locked paired client as its person chooses among them. |
| `SecretKeyMutationResponse` | Type | `packages/fluxiq/src/programs/secret-keys/api/contracts.ts` | - |
| `SecretKeyOffer` | Type | `packages/fluxiq/src/programs/secret-keys/types.ts` | A holder's offer of their own key to the workspace: the key, who offered it (its holder then), and when. |
| `secretKeyPairedHolderId` | Value | `packages/fluxiq/src/programs/secret-keys/runtime/unlocks/credential-unlocks.ts` | - |
| `secretKeyPanelHolderId` | Value | `packages/fluxiq/src/programs/secret-keys/runtime/unlocks/credential-unlocks.ts` | - |
| `SecretKeyRecord` | Type | `packages/fluxiq/src/programs/secret-keys/types.ts` | - |
| `SecretKeysCloseMode` | Type | `packages/fluxiq/src/programs/secret-keys/runtime/service.ts` | How `SecretKeysService.close` ends. `shutdown` revokes and zeroes every held key. `evict` drops the instance but leaves a `HeldKeys` the service was given as it is, so the next service over the same repository releases the same unlocks; a service's own `HeldKeys` is revoked either way. |
| `SecretKeyScope` | Type | `packages/fluxiq/src/programs/secret-keys/types.ts` | - |
| `secretKeySessionDigest` | Value | `packages/fluxiq/src/programs/secret-keys/runtime/unlocks/credential-unlocks.ts` | - |
| `SecretKeySessionEnd` | Type | `packages/fluxiq/src/programs/secret-keys/types.ts` | A panel session that ended, as Identity Access announced it: `digest` is the session's stored digest, null when a whole person's sessions ended together (`wholeUserId`). `administrator` is true for an administrator's revoke. |
| `SecretKeysService` | Class | `packages/fluxiq/src/programs/secret-keys/runtime/service.ts` | Secret Keys: values sealed under account passwords. This class is the public surface; records and their writes live in `SecretKeyStore`, held derived keys in `HeldKeys`, seal upgrades in `SealUpgrades`, and credential changes, including pending seals, in `CredentialChanges`. |
| `SecretKeysSnapshot` | Type | `packages/fluxiq/src/programs/secret-keys/types.ts` | - |
| `SecretKeysSnapshotResponse` | Type | `packages/fluxiq/src/programs/secret-keys/api/contracts.ts` | - |
| `SecretKeySummary` | Type | `packages/fluxiq/src/programs/secret-keys/types.ts` | - |
| `SecretKeyUnlockPersonRecord` | Type | `packages/fluxiq/src/programs/secret-keys/types.ts` | What is remembered of one person across restarts: nothing secret. |
| `SecretKeyUnlockRevoker` | Type | `packages/fluxiq/src/programs/secret-keys/types.ts` | Who asks for a session's unlock to be dropped (`revokeSessionUnlock`): the user asking (null when nobody vouches for one), and whether they are an administrator. `administrator` is true only when the caller's own permission check admitted them (`identity.manage`), never because they hold a session id. |
| `SecretRevealAuthorizationMetadata` | Type | `packages/fluxiq/src/programs/secret-keys/runtime/held-keys.ts` | - |
| `serializedMetricBytes` | Value | `packages/fluxiq/src/framework/persistence/performance-metrics/performance-metrics.ts` | - |
| `Session` | Type | `packages/fluxiq/src/programs/identity-access/types.ts` | - |
| `SessionRequest` | Type | `packages/fluxiq/src/programs/identity-access/api/contracts.ts` | - |
| `SetAssistantModelRequest` | Type | `packages/fluxiq/src/programs/secret-keys/api/contracts.ts` | - |
| `SetBackgroundTaskEnabledRequest` | Type | `packages/fluxiq/src/programs/background-tasks/api/contracts.ts` | - |
| `SetDefaultKeyRequest` | Type | `packages/fluxiq/src/programs/secret-keys/api/contracts.ts` | - |
| `SetIdentitySecretRequest` | Type | `packages/fluxiq/src/programs/identity-access/api/contracts.ts` | - |
| `slugify` | Value | `packages/fluxiq/src/core/index.ts` | - |
| `SQLiteListPage` | Type | `packages/fluxiq/src/framework/persistence/repository/sqlite-repository.ts` | - |
| `SQLiteListPageOptions` | Type | `packages/fluxiq/src/framework/persistence/repository/sqlite-repository.ts` | - |
| `SQLiteRepository` | Class | `packages/fluxiq/src/framework/persistence/repository/sqlite-repository.ts` | - |
| `SQLiteRepositoryOptions` | Type | `packages/fluxiq/src/framework/persistence/repository/sqlite-repository.ts` | - |
| `SQLiteTransaction` | Type | `packages/fluxiq/src/framework/persistence/repository/sqlite-repository.ts` | - |
| `SqlPerformanceContext` | Type | `packages/fluxiq/src/framework/persistence/performance-metrics/performance-metrics.ts` | - |
| `SqlPerformanceMetric` | Type | `packages/fluxiq/src/framework/persistence/performance-metrics/performance-metrics.ts` | - |
| `StartProductionRunRequest` | Type | `packages/fluxiq/src/programs/production-runner/api/contracts.ts` | - |
| `stepFlow` | Value | `packages/fluxiq/src/engine/index.ts` | - |
| `stepRecovery` | Value | `packages/fluxiq/src/ui/activity-status/step-recovery.ts` | - |
| `stepSkip` | Value | `packages/fluxiq/src/ui/activity-status/step-skip.ts` | - |
| `StopProductionRunRequest` | Type | `packages/fluxiq/src/programs/production-runner/api/contracts.ts` | - |
| `subscribeFluxIQPerformanceMetrics` | Value | `packages/fluxiq/src/framework/persistence/performance-metrics/performance-metrics.ts` | - |
| `SupervisorEnding` | Class | `packages/fluxiq/src/ui/activity-status/supervisor-ending.ts` | - |
| `SupervisorEndingWords` | Type | `packages/fluxiq/src/ui/activity-status/supervisor-ending.ts` | What the row ending a supervisor-ended build is said with: Core's whole sentence in place of its cut title, or why, after it. |
| `SurfaceTone` | Type | `packages/fluxiq/src/ui/index.ts` | - |
| `systemActivityClock` | Object | `packages/fluxiq/src/ui/activity-status/clock.ts` | The service worker's own clock. |
| `systemClock` | Object | `packages/fluxiq/src/core/index.ts` | - |
| `TotpConfirmRequest` | Type | `packages/fluxiq/src/programs/identity-access/api/contracts.ts` | - |
| `TotpRequiredError` | Class | `packages/fluxiq/src/programs/identity-access/runtime/totp-required-error.ts` | The refusal of a sign-in (`IdentityAccessService.authenticate`) whose password was right but whose authenticator code is missing or wrong, so a client asks for the code rather than reporting bad credentials. |
| `translateClientGatewayTraceCommandIds` | Value | `packages/fluxiq/src/client-gateway/trace-matcher/command-id-translation.ts` | - |
| `TrialState` | Type | `packages/fluxiq/src/ui/activity-status/candidate-trial.ts` | What a build's test of its Flow makes of one event. |
| `TrustedModuleBuildIdentity` | Type | `packages/fluxiq/src/runtime/build-identity/modules/types.ts` | Optional provenance supplied only by trusted, locally loaded runtime modules. |
| `UnitHistory` | Class | `packages/fluxiq/src/ui/activity-status/unit-history.ts` | - |
| `UnitHistoryLimits` | Type | `packages/fluxiq/src/ui/activity-status/unit-history.ts` | The bounds, as `ACTIVITY_HISTORY_LIMITS` sets them; a build's ceiling defaults to that. |
| `UnitSituation` | Class | `packages/fluxiq/src/ui/activity-status/unit-situation.ts` | - |
| `UnitState` | Type | `packages/fluxiq/src/ui/activity-status/unit-situation.ts` | - |
| `UnlockSecretKeysRequest` | Type | `packages/fluxiq/src/programs/secret-keys/api/contracts.ts` | The person's own unlock, with their password: this session, and the locked paired clients they chose, by `holderId`. Named or not lifted: never one they did not choose. |
| `UnlockSecretKeysResponse` | Type | `packages/fluxiq/src/programs/secret-keys/api/contracts.ts` | `stillLocked`: those named that this did not lift. |
| `UpdateIdentityUserRequest` | Type | `packages/fluxiq/src/programs/identity-access/api/contracts.ts` | - |
| `UpdateMyPreferencesRequest` | Type | `packages/fluxiq/src/programs/identity-access/api/contracts.ts` | `startingHumanness`: an integer 0-100, or null to clear it. |
| `UpdateSecretKeyRequest` | Type | `packages/fluxiq/src/programs/secret-keys/api/contracts.ts` | - |
| `UpsertDeploymentArtifactRequest` | Type | `packages/fluxiq/src/programs/deployment-sync/api/contracts.ts` | - |
| `UpsertDeploymentTargetRequest` | Type | `packages/fluxiq/src/programs/deployment-sync/api/contracts.ts` | - |
| `User` | Type | `packages/fluxiq/src/programs/identity-access/types.ts` | - |
| `UserCredential` | Type | `packages/fluxiq/src/programs/identity-access/types.ts` | - |
| `validateDomainIo` | Value | `packages/fluxiq/src/io/index.ts` | - |
| `validateFlow` | Value | `packages/fluxiq/src/flows/index.ts` | - |
| `validateIoRequirements` | Value | `packages/fluxiq/src/io/index.ts` | - |
| `VaultRecord` | Type | `packages/fluxiq/src/programs/identity-access/types.ts` | - |
| `VaultStatus` | Type | `packages/fluxiq/src/programs/identity-access/types.ts` | - |
| `VaultUnlockRequest` | Type | `packages/fluxiq/src/programs/identity-access/api/contracts.ts` | - |
| `viewerRole` | Object | `packages/fluxiq/src/programs/identity-access/runtime/roles.ts` | - |
| `withEndpointPerformanceScope` | Value | `packages/fluxiq/src/framework/persistence/performance-metrics/performance-metrics.ts` | - |
| `withSqlPerformanceContext` | Value | `packages/fluxiq/src/framework/persistence/performance-metrics/performance-metrics.ts` | - |
| `writeClientGatewayTraceParityReport` | Value | `packages/fluxiq/src/client-gateway/trace-replay/comparison/parity-report.ts` | - |
| `writeMigrationJournal` | Value | `packages/fluxiq/src/framework/storage-layout.ts` | - |
