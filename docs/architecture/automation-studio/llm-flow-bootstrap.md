# LLM Flow Bootstrap Contract

Automation Studio owns a domain-neutral, instruction-first authoring boundary for
building a new executable Flow without a recording. The boundary is implemented
in `runtime/flow-bootstrap/plan.ts` and integrated with the existing LLM harness as
the `flow_bootstrap` task. It does not execute a provider request, persist a
proposal, or mutate a Flow by itself.

## Passive result observation

A domain evidence binding may supply `observeResult` for the fresh end view used
by both candidate-trial and saved-run verification. Core treats its result as
opaque evidence: only declared top-level `observedStateKeys` survive projection,
and existing result-summary privacy screening still applies. The callback gets
project, Flow and call identifiers, denied-lasting-action permission and the
existing ten-second cancellation signal. It grants no executable tool binding.

When omitted, the reader retains the domain's free initial-observation fallback.
When supplied but absent, failed or timed out, its answer is not replaced with
that ordinary observation. More complete evidence does not itself establish that
the original instruction was fulfilled; the existing result checks remain.

## Authoring mode

Result accounts may include an optional passive condition-observation companion
beside rejected-row labels. Core validates its closed shape and original condition
ordinal, preserves alignment across repeated read passes, and screens values before
model-facing publication. Present text, including empty text, absent successful
reads, unavailable legacy evidence and privacy withholding remain distinct.
Missing legacy entries remain unknown. Trial and saved-result projections carry
the same evidence without importing domain contracts, evaluating a domain predicate,
adding an executable binding or granting a positive judgement.

How the product's own creation and improvement builds are authored is one runtime
setting with one owner, `model/authoring-mode/`: `FLUXIQ_AUTHORING_MODE` in the
Core process environment, `project` (the default since 2026-10-16), `candidate`
or `legacy`. Any other value refuses instead of falling back. Nothing else holds a
mode literal of its own.

- `legacy` is the explicit opt-out for the evidence-guided draft behavior
  (Core `e9b7d691` through the parent of t330's merge `66a310cc`). The chat's
  `flow.createHere` and `flow.explore` build with the evidence loop, its build
  tests and judges, then approve and apply the proposed adaptation onto the blank
  Flow and say the automation is ready. `flow.improve` asks before applying its
  extend. The web panel's Explore and Improve show the proposal for review.
- `candidate` separates discovery from submission of a complete Flow. Submission
  alone stores an unverified draft. With a trial runner, Core runs the exact
  submitted revision from its declared start and judges the trial before
  completion can promote through the ordinary proposal path. Without a trial
  runner, completion remains draft-only; a stored draft grants no acceptance.
- `project` builds that same candidate through agents: a project supervisor
  plans the Flow's subflows and briefs a bounded builder per subflow, then
  assembles their proposals and tests the whole candidate. Its result and
  promotion are the candidate's (below, "Authoring mode `project`").

### Authoring mode `project`

`project` (automation-project-agents-plan, unit A5c) replaces the candidate
build's single loop with a project supervisor and its builders, behind the same
generation command, lock, purse, trial runner and promotion. It became the
default on 2026-10-16, when the Lab comparison (A8) passed: on one frozen pair it
passed each of the five realistic tasks twice in a row (10 of 10), where
`candidate` failed one of them, at about 1.6 times `candidate`'s cost per build
(downstream automation-project-agents-plan, A8 Run Plan). `candidate` stays
selectable with `FLUXIQ_AUTHORING_MODE=candidate`.

- **Who asks for it.** A request names `authoringMode: "project"`, or sends
  `configured` to a Core whose mode is `project` (the default). The chat's
  build sends Core's configured mode as it is set, so a project Core builds
  `flow.createHere` and `flow.explore` in project mode. An extend is not yet a
  project build's (A7): the request refuses `project` with `mode: "extend"`, so
  the chat's `flow.improve` sends `candidate` for its extend in a project Core;
  a repair's re-author is refused in the build itself.
- **Where it runs.** The candidate branch of `generateFlowBootstrapAdaptationInternal`
  builds what it always built -- binding, instruction authority, provider, loop
  limits, creation purse, the build-level permission gate and person-needed, the
  whole candidate's trial runner and judge (`service/project-build/whole-trials.ts`,
  shared with `candidate`) -- and hands it, with the project's own ports, to
  `runAutomationStudioProjectBuild` (`service/project-build/`) instead of the
  candidate draft generator. Builders are never started through the generation
  entry: its generation lock is not re-entrant.
- **Per brief.** Each brief gets its own harness options and node descriptions,
  build routing, permission gate (holding only the acts the brief was
  permitted, never more than the person permitted the build: every lasting act
  the task asks for when the brief's parts act, none when they only read, t575)
  and person-needed,
  its own ledger from the project ledger, and the build's subflow trial port.
  Each brief's allowance caps its calls at three per decision, so its subflow
  trials' judges (a first answer and a confirmation) never starve its decisions.
- **A brief's own ending stops its loop (t551).** A plan step the person did
  not permit -- refused inside the submission's completion check, which the
  loop cannot see -- or a check only a person could pass that was not passed
  aborts the brief's `ended` signal (`service/project-build/brief-ports.ts`). The
  dispatcher joins it to the loop's and the submission's signals
  (`project-agents/dispatch/run-brief.ts`), so the loop stops at its next turn
  instead of asking the model again, and the brief comes back `blocked` with the
  reason (the missing classes, the control and the request; or the check's
  code), naming any proposal it had. A reset whose ending fired but that left
  nothing of the build in place comes back `done`. A build stop is still a stop.
- **A return says when nothing more can be done (t743).** A builder return
  that is not `done` may carry `terminalReason`, one of a closed set
  (`project-agents/contracts/builder-return.ts`): `allowance_spent`, `stopped`,
  `person_ended` or `gate_unsatisfiable`; a `done` return carrying one is
  refused `project.return_terminal_reason`. Core sets it from its own signals,
  never from the words of the reason (`project-agents/dispatch/ending.ts`): the
  allowance's refusal, the brief's or build's stop, the person-refusal and
  person-only-check ending above (`ending.personEnded`), and, once per return in
  `dispatch/run-brief.ts`, an act no call can settle still on the site
  (`ending.gateUnsatisfiable`). A reason already set is kept. The supervisor sees
  it on the dispatch answer (`supervisor/dispatch-tool.ts`).
- **Permissions at promotion (t551).** Every brief's gate is registered with the
  build (`service/project-build/permissions.ts`), and the proposal's permission
  outcome reads the build's gate with every brief gate's answers in it: every
  declaration (the briefs' in the order their gates were made, then the build's
  own), the latest standing request of any gate, the instruction's one read,
  and Core's cross-check of all declarations together. A person's no to a
  builder's step is seen at promotion as a candidate build's own is.
- **The supervisor's reserve (t551).** The purse keeps back the judged whole run
  and one repair round -- the repaired Flow judged again -- at the judge's own
  reserve pricing: four judge calls (`service/project-build/reserve.ts`). No
  brief's allowance can be carved from it; a repair brief's decisions and its
  own subflow trial are its allowance's.
- **Host resources.** One scheduler per host-resource port: the domain's
  (`hostResources`), whose capacity sets how many builders run at once -- the web
  domain declares 1 -- or, for a domain that declares none, one local resource.
  A subflow trial opens its session only while its brief holds a current lease
  (`admitAutomationStudioBuildTrialSession`).
- **Lasting acts.** The project ledger holds every agent's acts: each builder's
  exploration acts and its subflow trials' acts in its brief's ledger, and the
  whole trials' acts under the supervisor. The supervisor refuses a whole trial
  while any is in place and briefs a reset; a reset's undo of an act is put to
  the ledger that owns it, and the reset completes once every such ledger, having
  looked again on each act's own page, holds none in place. A reset brief settles
  what Core's own looks can settle before its first decision, and a reset that
  cannot settle an act ends `blocked` with it still listed, so no further trial
  runs on it (see "How an act settles" below). An act no call can settle any
  more (`gate_unsatisfiable`, below) is never in the reset's list of acts to
  undo, but everything that says what is on the site names it as left and not
  undoable: the reset's words (`project-agents/dispatch/reset-done.ts`), the
  person's left-on-target note (`supervisor/left-on-target.ts`, with
  `unsettleable: true`), a phase start's `actsUnsettleable`
  (`service/project-build/phase-start.ts`), a build-wide reset refusal
  (`service/project-build/reset-calls.ts`), a repeated whole-trial refusal, and
  the supervisor's `lastingActsUnsettleable` count. A reset whose only remaining
  acts are of that kind is not asked to undo them: it comes back `blocked`, never
  `done`, since a `done` reset would send the supervisor to a test the gate
  refuses.
- **Each builder act is placed (t551),** as a candidate build's is: a builder's
  call that makes a lasting act is read just before and just after it, in
  place, through the brief's own start check (`flow-bootstrap/site-reset/act-places.ts`),
  so the act keeps its page, what it changed there and the items it created. A
  reset can then remove what an act created even when its control sat in no
  item -- an Add to cart that adds a line to the cart drawer -- and never the
  line that was there before the build. A reset's undo is read around the same
  way, and what it did is told to the act's owner (`service/project-build/reset-calls.ts`).
- **Acts in the build record (t551).** Every act the project ledger records is
  written into the build record's `lastingActs` as it is recorded
  (`service/project-build/acts-record.ts`), one writer per ledger: its id, what
  it did, its owner -- the supervisor (whole trials), or the brief under the
  role it ran as -- every lasting class it declared, whether or not its brief
  was permitted it, and whether the site can undo it. So the record names every
  act of the build after a restart. The build waits for those writes before it
  saves its draft; a write that fails for a reason other than the record's own
  refusal fails the build.
- **Toggles in the build record (t792).** Every toggle the build learned, from
  an exploration press or a trial pass's press, is written into the build
  record's `toggles` (`service/project-build-toggles/toggles-record.ts`): where
  it came from, its node and call, the handles and resolved target it is tied
  by, the trial nodes that pressed it and the parameters they ran with
  (`trialParameters`), its signature and `idempotentWith`. It is written after
  each builder or repair tool call and each trial, so a debug can read which
  signature a step was given, and what the record kept is a record of toggles
  again (`AutomationStudioProjectBuildTogglesRecord.restored`) that ties a
  step exactly as before.
- **Repair before ending (t743).** While money is left, the supervisor's
  `ended` completion is refused `project.completion_repair_first`
  (`project-agents/supervisor/completion.ts`), with `unrepaired:
  [{subflowKey, failingBrief}]`, while a subflow of the plan in force has a
  latest build or repair return that is blocked or partial, carries no
  `terminalReason`, and has had no changed brief after it
  (`supervisor/state.ts` `unrepaired()`). A changed brief is a repair, or a
  brief sent under another plan digest (after `project.amend_plan`); a brief
  whose `sentAs` key equals the one before it is a resend and does not count.
  The rule is checked after `ended_too_soon` and before the reset rule, and only
  when no rescued pass or fallback stands. It holds nothing when the purse
  cannot pay for one repair brief (`canPayForBrief`, the same
  `automationStudioProjectSupervisorBriefSizing` check the dispatch makes; no
  purse means it can pay), when fewer than `REPAIR_TURNS = 3` of the
  supervisor's turns are left (`turnsLeft`, threaded from the loop through
  `llm/evidence-loop/completion-attempt.ts` and
  `llm/decision-handlers/completion.ts`), or while an act no call can settle is
  on the site, since no changed brief could be tested. Each subflow is named in
  at most one such refusal, so the rule can never hold a build to its ceiling.
  The guidance's step 7 (`supervisor/guidance.ts`) says the same in generic
  words: each subflow that came back blocked or partial gets one changed brief
  first, a resend does not count, and a subflow whose return says nothing more
  can be done is skipped.
- **How it ends.** On a yes for the latest assembled revision the assembled
  candidate is saved as the Flow's candidate draft and promoted by the
  candidate's own promotion, after which the build record ends `promoted`. A
  supervisor that ended without that yes keeps its assembled candidate as a
  draft with nothing to promote; with no assembled candidate the build fails as
  a candidate build does. The start hook (`prepareStart`) stays on the whole
  candidate's trial port, so a Lab Core resets the target before each whole
  trial in project mode as in candidate mode.

### A trial is judged by the change, not by a clean start (t775)

Rule (user, 2026-10-27): reset as rarely as possible and judge the change. A
trial or judged whole run is judged against the state of the site recorded just
before it and the change the task asks for. A reset happens only where the
before-state cannot make a trial meaningful, and it undoes exactly this build's
own lasting acts. This section is the current design; the section after it
describes the earlier rule and holds only where this one says so. The wiring of
the trial gates to this design is pending (phase D); the parts below it that are
already built are the typed effect, the `trial-change/` module, the idempotent
toggle and the skip record.

- **Before and after per witness.** Every lasting step names where its change
  shows (its witness: a list group or a control place). A trial reads each
  witness twice: before the trial, from the ledger's latest read when nothing
  landed since, otherwise by Core looking at the witness's location; and after
  the trial, from the end view when the run ended on that page, otherwise by a
  second look. A lasting step that ran in several passes of a loop gets one
  control witness per pass, at that pass's own place and location, read from the
  pass's own diff (`trial-change/pass-witnesses.ts`, t787), so a pass at the
  second item is never attributed to the first. The judge's packet gains `siteChange`: per witness the before and
  after side and the change (added, removed, changed, or none), the acts of the
  trial with their outcome (`changed`, `already_in_state`, `no_change_seen`),
  the earlier acts of this build left in place at the start, and one proof per
  task part. Rows are shown as counts plus bounded readable lines; no opaque
  token is emitted (`flow-bootstrap/trial-change/`).
- **A typed effect per part.** The plan's task part says what it must do to the
  site, never parsed from words: `effect: { kind: "change", direction, count,
  what }` (adds or removes N, or each match) or `{ kind: "end_state", state }`,
  and the task lists `unchanged` things that must show no change. A `change`
  part is met by the delta, whatever the absolute state was: a cart line moving
  from nine to ten meets "add one" with no reset. An `end_state` part is met when
  the after-reading shows the state. `unchanged` and every witnessed row no act
  was attributed to are met when before equals after, so something already liked
  before the run and still liked after is no violation, while a row that changed
  with no act is `result.unasked_change`.
- **Proofs.** Per part: `shown` (a witness changed as declared), `no_change`
  (every witness read and none changed; finding `result.change_not_seen`, a
  grounded no, never a yes), `already_in_end_state` (the state held before and
  after, and no earlier act of that same step was seen to make it), `carried`
  (the state held before, and the same step was seen to make that change earlier
  in this build), `unproven` (a witness unread or none named), and
  `contradicted` (a part asking to add, one of whose control witnesses the trial
  put back to the counts the build first read there: a removal; finding
  `result.change_contradicted`, t787). A judge yes on
  `no_change`, `unproven` or `already_in_end_state` is not taken; the verdict is
  `unknown` with the reason named. A judge yes on `contradicted` becomes a no at
  both trial gates, with Core's words as `changeContradicted`
  (`trial-change/contradicted.ts`), so such a trial never passes. A pass that skipped a row as `already_in_state`
  is still listed with its row, so a Flow that targets a row it must not touch is
  seen even when nothing changed.
- **Targeted resets only.** A reset is asked for when an `end_state` part's state
  already holds because this build's own act put it there through another path,
  and the Flow's step was never seen to make it: Core asks for an undo of exactly
  that act (`candidate.trial_starts_in_end_state`). A state that existed before
  the build began is never touched; the run is judged on leaving it as it is. An
  undo no call can make never blocks a trial: it runs with the act disclosed and
  the part `unproven`.
- **Idempotent toggles.** A step that sets a state must be safe to run on a site
  already in that state. A control that states its state (checkbox, radio,
  `aria-pressed`, `aria-checked`, `aria-selected`) uses `web.dom.check`. A control
  that shows its state only by name is handled by the toggle signature: the
  domain answers an exploration press with `toggle: { signature,
  idempotentWith? }`, and a trial pass's press carries the same answer on its
  action result (`outputs.result.toggle`, t787); `flow-bootstrap/explored-toggles.ts`
  records both, and a `modify_existing` step repeating an explored press, or the
  same step's press from an earlier trial, gets the node parameter
  `ensureState` written by Core, never by the model. A trial's press is tied to
  a step by the step's identity, never its key (t792): the same node written
  with the same parameters, compared whole with `ensureState` taken off, as the
  trial's graph recorded them (`trialParameters`). That is the identity Core
  already uses for a step across revisions (`result-verification/standing-no/written-conditions.ts`,
  t666); a label is display words, and the web domain drops a resolved
  `target`. A step's key (`s10`) is its place in the script, which a repair
  renumbers when it inserts or removes an earlier step, so the key decides only
  between two steps written the same, and a step whose parameters match no
  trial press gets none (`script-statements/toggle-tie.ts`). A toggle's own
  words change with its state ("Like" and "Unlike"), so a step whose parameters
  differ only by the words that press's own signature gained and lost
  (`gains`, `loses`, the one place Core reads inside a signature) is the same
  step, unless another step of the plan on that node matches the press too
  (`script-statements/toggle-state-words.ts`). The submission re-validates
  the rewritten plan, so `ensureState` reaches the laid-out subflows the trial and
  the saved graph are built from, not only the plan. The click node then presses
  only when the target does not already show the signature, and otherwise answers
  `skipped: "already_in_state"`, which the executor records as a skipped attempt
  with no landed act. A plain press that repeats a toggle whose signature names
  `idempotentWith` is refused `candidate.toggle_not_idempotent` at submission
  (`script-statements/toggle-idempotent.ts`). A toggle with no signature has no
  idempotent form and falls under the targeted-reset case.
  When several presses are tied to one step and their signatures disagree, the
  earliest decides (`script-statements/toggle-tie.ts`, t792): a later opposite
  press reversed the build's own act and names the site's before-state, never
  the asked state. An exploration press on a control the build already flipped
  runs with the earliest tied press's signature as `ensureState`
  (`flow-bootstrap/action-permissions.ts`), so pressing toward the asked state
  again presses nothing; an undo goes through the undo path as before. A trial
  names a subflow's nodes under the brief's key while the submission names them
  as written (a script's own steps as `main`), so a subflow builder's
  controller reads the build's toggles with each trial node also under the
  written key (`subflow-candidate/scoped-submission.ts`, t792), which the key
  tie between two steps written the same still needs.
- **Layers cleared while exploring become handlers.** A press while exploring
  that cleared a covering layer (the domain's `evidence.layerCleared`: the
  layer's signature and the control pressed) is recorded by
  `flow-bootstrap/explored-interruptions.ts`. Unless a step of the Flow already
  makes that press, the submission adds to every non-recovery part a handler of
  the same shape in-run interruption learning builds
  (`flow-bootstrap/layer-handlers/patch.ts`): when the control shows, press it,
  check it gone, resume, with no lasting consequence, scoped to that part
  (`inherit: false`). Core writes it; the model writes nothing (t787). A Flow
  therefore does not depend on a layer the build dismissed once and the site
  remembered.
- **No automatic cleanup.** The build does not put the site back when it ends.
  The ending row says per witness what the build changed ("held 9, now holds 11"),
  and the chat offers "Put it back", which runs the reset brief only on request.
  `project.completion_reset_first` no longer holds completion.
- **What retires.** `candidate.trial_reset_required` (acts in place, and
  `acts_unsettleable`), `candidate.trial_reset_unproved`,
  `candidate.trial_start_differs`, `project.trial_reset_required` and
  `project.completion_reset_first`; at exploration, `candidate.create_baseline_required`
  and `candidate.reset_witness_required`. Acts in place at a trial's start are
  reported as `leftFromEarlier` instead. `candidate.trial_step_unwitnessed`
  retired too (t791, below). What stays: undo admission, settlement,
  `undoes` and the `lookFirst` port, used only by targeted resets and "Put it
  back". Offline trials carry no `siteChange`: their acts never happened.
- **The Lab's acceptance is separate.** The in-build judged run is Core's
  evidence, judged by delta. The Lab's own oracles stay absolute and judge its own
  playback after the fixture reset (see the Lab documentation).

### The site is put back before each trial

Superseded by the section above (t775) once the trial-gate wiring lands: the
gates below that demand a reset before every trial retire; the targeted reset,
undo admission and settlement stay.

A candidate trial runs the whole Flow live, so a trial run on what exploration
or an earlier trial left behind measures nothing (user, 2026-10-12, t462).
Before every trial the model returns the site to the state the build started
from, through the site's own controls, undoing exactly the lasting acts this
build made and nothing that was there before it began
(`runtime/flow-bootstrap/site-reset/`, with its siblings
`flow-bootstrap/reset-settlement/`, which judges whether an act is settled,
`flow-bootstrap/reset-answers/`, which builds every refusal,
`flow-bootstrap/reset-undo/`, which admits and reaches undos,
`flow-bootstrap/reset-ledger/`, the ledger's collaborators, and
`flow-bootstrap/trial-defaults/`, which fills in what a trial request leaves
out; the dependency runs one way, from site-reset to each sibling, and
site-reset's barrel re-exports reset-settlement's). `site-reset/ledger.ts` is
the facade callers use; the siblings sit beside site-reset, not under it,
because the structure audit's depth limit leaves no room below it:

- **The ledger.** The build's permission wrapper tells
  `AutomationStudioSiteResetLedger` every exploration call it ran. One that was
  permitted, acted (`mutate`), landed and declared `create_new`,
  `modify_existing` or `delete` becomes an act `act-N`, shown with the gate's
  verb and control words and the call id the model gave it. Each trial's own
  lasting steps that landed (`AutomationStudioCandidateTrialAct`, read off the
  trial's trace by `service/candidate-trial/landed-acts.ts`) become acts too.
  An act that moved money or sent something cannot be undone and is never asked
  for.
- **Page destinations (t791).** A complete read of a page in one tab that
  carries no list the client reports as a collection, an empty state included,
  still becomes a page original when the client reports the page's scope and
  item subjects (`site-reset/page-collection.ts`), and its receipt is printed
  with `page: true`. It witnesses only an identified creation naming that ref in
  the same tab, with the creation's subject absent from the page; after a trial
  the page is read again, and a subject that appeared, or a change in the page's
  shown values, reads as `changed`. Refs are per tab: a ref read in another tab
  is never offered for a step and never witnesses a press, and a successful
  exploration press naming one carries `resetDestinationUnreached` saying the
  press has no witness.
- **One witness admission (t751).** `flow-bootstrap/reset-admission/` serves
  exploration and plan submission. A reversible press needs an issued original
  destination, its own complete list, its control's state, or a witnessed
  explored act it repeats. The `resetDestination` envelope key stays build-only;
  the domain never receives it. Original inventories remain immutable across
  owners. An act seals only its witness groups: a first read after that group
  was touched never becomes original authority, while an unrelated group can
  still issue a ref. Existing brief ledgers receive shared originals immediately.
  At the step door a missing witness answers no stamp, with `canMeet` honest
  (t791): only refs read in the step's own tab are offered, and `no_call` is
  said where no call in that tab can make one; an unidentified project press ends honestly
  with `no_target_identity`, met by no call. Standalone legacy exploration keeps
  its compatibility policy.
- **Project exploration also requires retained originals.** A declared control
  place and current state alone prove no original counts. The one admission
  refuses the press until those counts were actually read before the build
  acted there. This applies to custom domain tools as well as `core.run_node`,
  regardless of the older optional creation-preflight flag; an unavailable
  project ledger refuses reversible effects before execution. Project custom
  calls publish reads before their effects even when consequences are declared
  only inside their permission call. Standalone custom-tool compatibility stays
  explicit. A missing original is meetable by a safe read only before the build
  could have changed it; an unprovable original is met by no call.
- **Every execution door checks before preparing the site.** At submission Core
  stamps admitted reversible steps with `resetWitness`; model-written stamps
  are refused or stripped. The candidate and subflow gates, their predecessor
  steps, and phase entry preparation check stamps before any start hook or
  baseline moves. A missing stamp no longer refuses the trial (t791): the
  trial runs and is judged by its end view and each step's done-when check; the
  admission answers `admit` with an `unwitnessed` note naming the steps and how a
  witness is made in their own tab (or that none can be), which the builder's
  trial answer carries, and the judge's packet states the gap as
  `siteChange.unwitnessed` with those steps' parts `unproven`. Submission names
  the same steps as a note on the accepted submission. Only
  `candidate.trial_starts_in_end_state` still refuses a trial unrun. Stamps
  survive assembly and reach landed acts.
  Own-list admission uses that list's immutable destination receipt. A control
  stamp names a `control-N` receipt held by this build, retaining the original
  counts read before any build press at that resource and place. Submission's
  current state never replaces those counts. Bare or unresolved project control
  stamps refuse before execution; optional runtime diff fields cannot erase a
  pre-admitted witness. Core can resolve a retained list original for its own
  stamp without issuing an unseen ref to the model; model `resetDestination`
  calls still require a receipt actually printed to it.
  A phase never reruns predecessors while this build's effects remain on the
  site: its entry stays unprepared with `project.entry_site_not_reset`.
- **Which list a creation names, and the step after reading it (t748).** Core
  does not judge which issued list a creation's `resetDestination` names,
  beyond same resource, a valid group and the subject absent from the list: by
  everything Core reads, a list of other items suggested beside the subject has
  the same shape as a list a creation on its own page does join (replies under
  what a reply answers, a collection panel beside an item). So the
  `candidate.create_baseline_required` refusal lists the refs already issued,
  split into those read on this page and those read elsewhere, says to name the
  list the new entry would join, and that a list that only suggests or relates
  other items never gains it; `candidate.reset_witness_required` says the same
  of a press's effect. Every reversible
  press needs a witness before and after earlier build acts. Unknown legacy
  effect locations still seal all groups; no global seal bypasses admission.
- **Undo through the normal tool.** In candidate mode with a trial runner,
  `core.run_node` takes an optional `undoes: "act-N"`, a hint. The wrapper strips
  it before the domain sees the call. The ledger accepts it only for an act still
  to undo. The key is not required: Core pairs an undo with its act by inverse
  effect (see "Undo pairs by effect" below). An accepted undo of an act that created something may `delete`
  without asking (`AutomationStudioActionPermissionAction.undoes`), once per
  act: the allowance is spent only by a landed undo of that act that declared
  `delete`, never by a navigation or a look under the claim (t471, lane B round
  9). A landed `modify_existing` undo admitted on the act's subject spends it
  too (`site-reset/ledger.ts` `explored()`). Naming an act whose allowance is
  spent is refused unrun as
  `candidate.undo_already_done`, naming the call that spent it. Any other undo
  is gated as any call is, so an act on something that pre-existed still asks.
  The record carries `undoes`, and the cross-check against the instruction
  leaves undo records out, so a reset never raises a question or finding. An
  undo is not a repeat of a lasting act.
- **An undo counts only when the act's effect is gone** (t471, lane D round 9).
  A call naming an act never marks it undone. The candidate loop reads the
  target in place just before and just after each exploration call that
  declares a lasting class (`site-reset/act-places.ts`), and keeps with the act
  its page's state before it, that page's `location`, and what it changed
  there, worded and as lines. Before a trial the reset takes the target back to
  each act's page through the arrival's node with that location
  (`AutomationStudioSiteResetStartCheck.compareAt`) and the act is undone once
  nothing it changed there is still there. A line the act removed is excused
  when another act of the build added it: two acts that each change one total
  share that line. An act with no such place (a trial's act, or one whose page
  could not be read) counts as undone once an undo of it landed and changed the
  page it ran on without leaving it; where the target cannot be read at all, a
  landed undo counts as before. These source-page rules settle only legacy
  unscoped acts (no subject, page or scope token on the declaration). An act
  that carries any of those tokens is strict: it settles only by its witnesses
  (see "How an act settles" below), and the source-page comparison stays
  diagnostic `stillThere` evidence for it.
- **Acts the site cannot undo.** An act the reset made no progress on, or asked
  for twice, or one the model names under `core.test_candidate`'s `cannotUndo`
  once the reset has listed it, is kept: never asked for again, refused if
  named (`candidate.undo_act_kept`). `cannotUndo` is optional: when the request
  leaves it out, Core fills in the acts a reset listed apart as unsettleable
  (reason `gate_unsatisfiable`, below), remembered per reset by
  `flow-bootstrap/trial-defaults/before-trial.ts`, which both trial gates call.
  A list the model does supply only narrows that default to acts Core listed;
  an id Core never listed is dropped, and `[]` stays empty. For legacy acts without identified
  resource-scoped ownership, later trials run with it in
  place under `startedWith.cannotUndo`, with words telling the model to make
  the Flow pass over an item already done. The trial request carries
  `startedWith` lines (`candidate/started-with.ts`), and the judge reads them as
  `resultSummary.startedWith`: already done, neither the run's doing nor its
  failure.
  Strict (identified, reversible) acts instead settle only by their witnesses;
  `cannotUndo`, or keeping an open strict act, never admits an ordinary trial
  on leftovers: the trial is refused `candidate.trial_reset_unproved`, listing
  each such act under `actsToRestore` with its `settle` sentence.
- **The start state.** As the build begins, right after the loop's opening
  arrival, Core asks the domain's optional `startState` binding for the state
  to keep. Before a trial that is due, the gate takes the target back to the
  build's start with the run-node tool's own arrival, asks `startState` again
  with that state, and reads its `differs`. `startState` also answers the
  `location` it read and the same differences as `lines` (gone, added), which
  Core compares only for equality.
- **The gate** (`candidate/trial-gate.ts`, `site-reset/trial-policy.ts`). A
  trial is due when an act was recorded since the build began or since the
  last trial, or one is still to undo. A clean start page never vouches for an
  act: lane D's start page showed nothing of the requests its trial had
  confirmed. With nothing left to undo and the start back, or different while
  acts are kept, the trial runs. Otherwise the test is refused, and the
  refusal is not a trial:
  - `candidate.trial_reset_required`, listing `actsToUndo` (each with
    `stillThere` where its page was looked at), `differs` and any kept acts,
    while acts are still to undo;
  - `candidate.trial_start_differs`, once per phase, when nothing is left to
    undo, none is kept, but the start still differs.
  Before this gate admits a live test, a build trial first checks the
  recorded run (offline-first): see
  [Offline trials in builds](./client-gateway.md#offline-trials-in-builds-p6).

  Acts no call can settle (`gate_unsatisfiable`, see "How an act settles")
  never admit a trial and never sit under `actsToUndo`. With nothing else in
  place the policy refuses `candidate.trial_reset_required` with `failed:
  "acts_unsettleable"`, `canMeet: "no_call"`, an empty `actsToUndo` and
  `actsUnsettleable`, and its instruction is the honest exit: end the brief
  `blocked`, naming those acts and `gate_unsatisfiable`
  (`WORDS.unsettleable(false)`). With acts also to undo, the `acts_in_place`
  refusal carries `actsUnsettleable` beside them and adds the same sentence.
  The code stays `trial_reset_required`, so the whole-trial and repeat-guard
  consumers route it unchanged; the supervisor's whole trial answers a gate
  refusal listing only such acts `project.trial_unsettleable`, with no
  `retry_allowed`, and tells the supervisor to end honestly
  (`supervisor/whole-trial.ts`).

  The refusal answers `retry_allowed` and reports whether the arrival moved
  the page, so the identical retest reaches the gate. That matters in the
  wrap-up, which offers only submit and test. The gate never deadlocks over
  legacy acts: a refusal identical to the last one, or a fourth in one phase,
  admits the trial and says under `startedWith` what was still in place or
  different. That admission never covers an open strict act: the ledger
  refuses `candidate.trial_reset_unproved` before the policy runs and again
  after it admits.
  A trial's answer lists the acts now on the site under `leftOnSite`.
- **A refused trial is retested after any call.** A refused action (an
  action tool that applied nothing and answered `ok: false`) stays answered
  from the loop's memory only until the next call runs, a look included
  (`llm/refused-action-retest.ts`); with no call between, the identical
  request is still answered `llm_evidence_loop.already_answered`. The repeat
  guard treats `trial_reset_required`, `trial_reset_unproved` and
  `trial_start_differs` (`candidate.` or `project.`) as a precondition
  (`llm/repeat-guard/outcomes.ts`, `PRECONDITIONS`): any later call that ran and
  was not refused lifts it on every page, so the retest after a settling look
  reaches the ledger even when the look left the page digest unchanged; the
  call that lifts it is still recorded as changing nothing when it did. This
  holds whether or not the gate's `retry_allowed` reason also exempts the
  refusal. Refuse, look, refuse stays bounded by
  `llm_evidence_loop.repeat_without_progress`.
- **Every refusal says what can meet it (t743).** Every site-reset refusal is
  built by one constructor, `automationStudioSiteResetRefusal(code, answer)`
  (`flow-bootstrap/reset-answers/refusal.ts`). It takes a `candidate.*` code and
  requires a `failed` condition from a closed set (`reset-answers/failed.ts`:
  `undo_spent`, `subject_differs`, `destination_not_read_now`,
  `subject_there_before`, `acts_in_place`, `start_differs`,
  `witness_unreachable`, `nothing_to_name`, `acts_unsettleable` and the rest),
  `canMeet` (`this_page`, `another_page` or `no_call`;
  `reset-answers/can-meet.ts`) and a non-empty `instruction`, and it throws on
  anything outside those sets. The answer carries `condition`, one generic
  sentence for the condition plus one for `canMeet`
  (`reset-answers/condition-words.ts`, which `site-reset/words.ts` `condition`
  delegates to); `no_call` says not to make that call, or a variation of it,
  again. So the words survive where a caller later rewrites `instruction`
  (`service/project-build/brief-ports.ts`, `service/project-build/reset-calls.ts`).
  Each admission path names the first condition it fails, in order; for
  example an undo on a different item than the act's is `subject_differs`, an
  original row on a list the act named is `subject_there_before` with `no_call`.
  An undo pressed on the act's own toggle that already shows the state the
  build found is answered `candidate.undo_already_back` (`already_back`,
  `no_call`), after fresh evidence settles it; stale evidence asks for a read instead of another press.
  An undo of a value act (t772) is admitted `own`, `modify_existing` unasked,
  only on its own control (the same resource, page, place and state, in the
  same item and dialog or none, declaring exactly `modify_existing`); a press
  declaring nothing on the act's own resource is admitted `step` (a choice
  made before the confirming press), which counts no attempt and only moves
  the clock; another control declaring a lasting class is refused
  `value_not_own_control`, and while no call can settle the act every press is
  refused `no_call`. An act that created nothing, named no list and sat in no
  item is refused `no_exact_inverse` (`no_call`), never with a subject
  deletion's condition. Settle words follow the witness kind: a value act is
  told to set the value back where it shows, then look. A
  source scan (`site-reset/tests/refusal-sites.test.ts`, over site-reset and
  reset-settlement) fails the build on a refusal built by hand: a `code:
  "candidate.` literal, an `ok: false` value, or any other `candidate.*`
  literal that is neither the constructor's first argument nor a comparison.
  The builders' guidance before a reversible press is qualified the same way
  (`WORDS.actionDeclarations()`, sent from `brief-ports.ts`): observe completely
  the list where the effect would show only for a press with no other witness;
  a control that shows its own state, or one inside a list already read
  complete, needs none; and name a list read on a page that loads at its own
  URL, so the reset can read it there again (`WORDS.ownUrl()`).

### How an act settles

The site-reset ledger settles every strict act by one rule over observed state
(L1 reset settlement replaced three narrow proofs, 2026-10-19). Sources:
`site-reset/ledger.ts`, a facade over its collaborators in
`flow-bootstrap/reset-ledger/` (what it records in `recording.ts`, its
settlement answers in `answers.ts`, its answers under `undoes` in `claims.ts`,
the act record in `act.ts`; t797), the undo side in `flow-bootstrap/reset-undo/`
(`claims.ts`, `admission.ts`, `reach.ts`), the settlement modules in
`flow-bootstrap/reset-settlement/` (the judgement in `judge.ts`,
`AutomationStudioSiteResetSettlementJudge`), `site-reset/words.ts`,
`site-reset/contracts.ts`. The settlement modules import nothing from
site-reset; they read structural local types (`reset-settlement/spot.ts`,
the collection type in `reset-settlement/collection-groups.ts`).

- **Witnesses.** Each lasting act of the build, explored or trial, carries the
  before-state of what it could change:
  - **Group witnesses** (`reset-settlement/act-groups.ts`,
    `reset-settlement/group-witness.ts`). The complete list groups its named scopes
    fall in: its own list (the complete original its control sat in, read
    before it), every destination named for it (`resetDestination` on its own
    call, or on a later look that names it under `undoes`, resolved from an
    issued ref without the act's resource; destinations accumulate and are
    never removed), the destination its creation was admitted against, the
    lists of a witnessed transfer or a proved subject undo, and the
    destinations of the explored acts a trial act repeats. A witness's
    relevant scopes are those named scopes plus every original scope of the
    group that held one of the act's subjects before it. It holds when the
    group's latest read is fresh, every relevant scope is in it and restored
    row for row and value for value, and no other scope of that read holds an
    act subject it did not originally hold with the same value. Lists on the
    same page about nothing the act touched (recently viewed, menus) do not
    block it. A relevant scope missing from the read, or a malformed group
    (`collection-groups.ts`), is `incomplete`; a group with no relevant scope
    read before the act is no witness. An act whose own undo landed also
    holds (`restored`, never `unchanged`; t772) on a list read again by a load,
    not in place after an undo, that is back for its own subjects while other
    rows still differ, when each such row is the own subject of another open
    act of this ledger that witnesses the same list and came after its first
    read: a row no act added, an original row gone or changed, or an
    unexplained reorder still keeps it open.
  - **No adoption.** Trial and entry acts take their step's stamp: a
    destination attaches that original; a repeat lends its explored act's
    witnesses; a control receipt retains its actual original counts across
    brief owners even when execution reports no spot or controls. Fresh reads
    compare every count with that original, and only an observed single-control
    transition authorizes its inverse. No unrelated list becomes a witness. A legacy act with no
    witness can name only a list read before that act; otherwise its condition
    is unmet, independent of a global refs-closed flag.
  - **Toggle witness** (`reset-settlement/toggle-witness.ts`,
    `reset-settlement/control-tracker.ts`). Only for an act declaring exactly
    `modify_existing` whose control has a `place` and `state`
    (`control.place`/`control.state` on the declaration; `Spot.place`/`state`).
    For an explored act it comes from the `controls` of the reads just before
    and after the press; for a trial act from the step diff's
    `controls: { page, before, after }` (`TrialActPlace.controls`). A looped
    step's diff is scoped to its own pass: `executor/host-state.ts` passes the
    attempt's `inputs` to the host's `inspectStateDiff` (an optional `inputs`
    field in `host-runtime.ts`, the same inputs the captures receive), so a
    domain can place each pass's control in the row that pass ran on, and each
    pass's act carries its own row's spot rather than the recorded row's. It exists
    only when exactly one control at that place went from `state` to one other
    state and nothing else there moved. It holds when a fresh read after the act and
    latest lasting call shows the build's start counts, including when the
    site reverted the control itself. No return press is required. A place's
    start is never seeded after this build pressed it; an unproven start is
    `no_baseline`. A page not read again keeps its act open.
  - **Value witness** (t772; `reset-settlement/value-witness.ts`,
    `reset-settlement/value-tracker.ts`, `reset-settlement/values-of.ts`). For
    an act declaring exactly `modify_existing` that no group, toggle, control
    original, transfer or subject undo witnesses -- a choice confirmed by a
    press that reloads its page to the same address, a form's Save -- the
    shown values its press replaced. Every read may carry `values` (place token
    to value token, `AutomationStudioSiteResetRead.values`, at most 2,000, all
    opaque; anything malformed drops the whole map). For an explored act the
    replacements come from the reads just before and after it on one page
    (`site-reset/act-places.ts`, `Place.values`); for a trial act from the step
    diff's `values: { page, location, replaced: [{ place, from, to,
    newValue? }] }` (`TrialActPlace.values`, at most 256). A place is replaced
    when its value changed and the old value is gone from the page; one
    without `newValue` (the new value was already shown, as an option's label)
    never keeps an act open. It holds when a fresh read shows the build's
    start value at one of its started places and no `newValue` place still
    shows the value the act set; a place's start is never seeded after an act
    replaced it, except that a trial act starts an unread place at its `from`.
    It is `look` while stale, `baseline` (`no_baseline`) with no started
    place, and `value` otherwise. The act is set back by its own control
    (below); after two landed undos, each read fresh still showing the value
    it set, it is closed `gate_unsatisfiable` with `failed: "value_not_back"`.
    Core parses the read's and the step diff's fields with
    `automationStudioSiteResetValuesOf` and
    `automationStudioSiteResetValueWitnessOf`; a read or a trial act that
    carries no `values` gives an act no value witness.
- **Fresh reads and the clock.** The ledger's clock advances on each landed,
  permitted `mutate` that declares a lasting class or is recorded as possibly
  lasting, on any landed `mutate` under `undoes`, and on each `trialRan`; an
  unrecorded navigation does not move it. A read is fresh for an act only when
  it was taken after the act and at the current clock. Partial reads (the
  domain did not positively establish completeness), malformed groups and
  stale reads never settle an act.
- **Lists Core cannot read again** (`reset-settlement/reach.ts`). One store of
  lost groups is shared by every brief's ledger of a build (the project
  ledger's `reach` option). While each `lookAt` runs, the judge counts the
  reads that reach its ledger: when the look landed and a group witness at
  that location is still stale or incomplete, the group is lost at once; when
  the look answered unread, it is lost after two separate pre-trial checks. A
  lost group that is stale or incomplete is never a `look` again; one read
  fresh later is judged as usual. With another witness holding, the act
  settles (`restored` when a change was seen or an undo landed, otherwise
  `unchanged`) and carries `unread: [refs]`, so later trials list it under
  `startedWith.cannotUndo` with words saying it was put back as far as fresh
  complete reads can show and naming the list that could not be read again
  (`WORDS.settledAs`), which the judge is told. When lost groups are its only
  witnesses, the act stays open with the reason `unreachable`, which no call
  can meet.
- **Acts no call can settle (`gate_unsatisfiable`).** An open act whose every
  reason is unmet (`unreachable`, or `name` with no original before that act, or an
  `undo` or `toggle` reason no undo could meet, below, or a value never back
  after two undos, or a value whose own control carries no tokens) leaves `inPlace` and
  `actsToUndo`. Every claim and target refusal that
  carries `actsToUndo`, `trial_reset_unproved` and the trial policy list it
  under `actsUnsettleable: [{act, did, call?, reason: "gate_unsatisfiable",
  failed}]`; `project-reset.ts` merges them across ledgers, puts a meetable
  refusal first and appends the exit words when the first lacks them. Trials
  stay refused while such an act is on the site: the reset rule is not
  weakened, and the way out is the honest exit (the brief ends `blocked`
  naming the acts, and its return carries `terminalReason:
  "gate_unsatisfiable"`). The ledger reads `unsatisfiable()` and
  `issuedRefs()` (issued refs with count and location); the project ledger
  reads them build-wide, `unsatisfiable()` with each act's `owner`.
- **No undo can put it back: `no_admissible_undo` (t748).** An open act is
  also `gate_unsatisfiable` when no undo under `undoes` could ever settle it,
  decided from Core's own reads (`reset-undo/reach.ts`). The only undo
  paths that act on a list a read can describe are removals of a subject new
  on that list: the subject deletion for an act that created it, or the
  removal on a destination the act named or can name, at most one per act
  before it is spent. So where an act's differing list shows a row held before
  the build that is gone, a value of one that changed, rows out of order, or
  more new rows than the acts able to remove them, and no act of the ledger has
  a path no read can rule out (its own item still listed, its own toggle, a
  transfer, a pending confirmation), the act is listed apart with `failed:
  "no_admissible_undo"`. The same holds at once when the act's own control, on
  its last open condition, answers a state that is neither the build's nor the
  act's (`control_state_differs`); a press back admitted later clears it. A
  differing list the reads could not name a group for is never judged. Nothing
  is newly admitted. `reset-undo/reach.ts` mirrors the admission paths of
  `reset-undo/admission.ts` by copy, so `site-reset/tests/settlement-unmeetable.test.ts`
  pins the admitting lines: a path changed there fails the build until the
  reach rule is checked against it and the pin is updated.
- **Settled or open** (`reset-settlement/decision.ts`). With every witness holding,
  an act is **settled restored** when a change was seen at some point or an
  undo of it landed, and **settled unchanged** when no read ever showed a
  change. Both are sticky, decided as soon as a fresh read settles them. A
  settled-unchanged act is never asked for, a claim on it is refused unrun
  `candidate.undo_act_kept`, and every later trial lists it under
  `startedWith.cannotUndo` as left with nothing it could change showing a
  change, which the judge is told. Otherwise the act is **open**: no witness
  at all (`name`), a stale or incompletely read witness (`look`), a group that
  still differs (`undo`), its control still showing the state it set
  (`toggle`), or a value it replaced still not back (`value`). `standing(actId)` answers `in_place`, `restored`, `unchanged`,
  `kept`, `irreversible`, `unsettleable`, `possible` or nothing, and a reset's `done` words say why an act
  stayed from it (`project-agents/dispatch/reset-done.ts`).
- **What is left on the site** (t772, `reset-ledger/leftover.ts`). One function
  decides, from an act's settlement, whether it is left: **no** once settled
  restored or unchanged; **yes** while open or of a class no site control
  undoes; **possibly** when closed `gate_unsatisfiable` (carrying its `failed`
  reason), kept, or a press with no lasting class. The ledger settles the act
  first and then asks it, and `inPlace()`, `unsatisfiable()`,
  `possiblyInPlace()`, `standing()`, `leftover()`, what `trialRan()` returns
  and each project-ledger snapshot act (`left`, `failed`) all read that one
  answer, so an ending never reports as left an act settlement put back, and
  reports an act no call can settle as possibly left, with its reason.
- **One answer, never two.** The ledger's verdict is the answer. A refusal
  never says a call can still meet it while the ledger lists the same act
  apart as `gate_unsatisfiable`: where a refusal's own act is listed apart,
  `reset-answers/agreeing.ts` re-says the refusal with `canMeet: "no_call"`,
  the generic listed-apart instruction, and the act out of `actsToUndo`. (This
  reverses the earlier direction, in which the refusal was trusted and the act
  moved to `actsToUndo`.) Every act to undo has an admissible call its `settle`
  words name, or it is listed apart as `gate_unsatisfiable` with a closed
  `failed`; `site-reset/tests/ledger-act-to-call.test.ts` sweeps the loop and
  value states to hold that.
- **One place per act, one own-control answer.** An act's control has one place
  token: the original's place, else the toggle's, else the press's, else the
  spot's (`reset-settlement/own-control.ts`). The judge, the toggle witness and
  the value undo's same-control check all read it, and one shared function says
  whether the control stands set, back, or other. A control read in a third
  state, or no longer drawn at its place, is `other`, and the act closes
  `control_other` (`no_admissible_undo`): no press back is admitted there, so
  none is promised. A later fresh read showing the set state reopens it.
- **A list read in place after a landed undo is not judged.** Any landed undo
  in the ledger, of an act that witnesses the list or only has its own
  control, can change a list that a read taken in place (without Core loading
  the page) still draws. Such a read is never judged until a fresh read of the
  page: the in-place fact counts every landed undo of the ledger, so the other
  acts on the list are not wrongly called `undo` or `no_admissible_undo`.
- **Undo pairs by effect.** `undoes` is an optional hint. Core pairs a press
  with the earlier open act it reverses (`reset-undo/claims.ts`): both on the
  same resource, and either the press's changed places are exactly the act's
  reversed (after back to before) with nothing extra, or both are toggles at
  the same place with `from` and `to` swapped. Two possible matches pair
  nothing; an act declared irreversible never pairs. The domain may put an
  `effect` record on the start-state read taken just after a press
  (`AutomationStudioSiteResetRead.effect`, and the binding's `startState`
  answer; passed through `site-reset/start-check.ts` to
  `site-reset/act-places.ts`): `class`, per-place `before`/`after`, and an
  optional `inverse` that narrows the match by action, control or resulting
  state. Every member is optional and a malformed member is dropped alone. A
  paired press is recorded like an admitted `undoes` press (attempts,
  `undoneBy`, named lists), is never asked for or listed as left itself, and
  drops out of `exploredActs`. The lists an undo attaches to an act are those
  the act already named; otherwise, for an act whose change showed on its own
  page, only a list read at that page, else a list on the same resource.
  Pairing never admits more than the `undoes` path does. The web domain does
  not fill `effect` yet; pairing then runs from the control counts alone.
- **Core looks first.** Before deciding, `beforeTrial` goes once to each
  location where an open act's witness is stale (`checks.lookAt`): the start
  check takes the target there with the arrival's node, reads it settled, and
  the caller feeds that read to every ledger (`start-check.ts`,
  `project-reset.ts`; the candidate loop in `candidate/authoring-loop.ts`; in a
  project build `service/project-build/brief-ports.ts`, where both the
  builder's trial reset and a reset's `remainingActs` look, each location once
  per ask). The model is asked only for what Core could not observe or what
  still differs. Where a caller passes no `lookAt`, Core never looks. Core's
  own moves are not the model's calls: the start check's `compare`,
  `compareAt` and `lookAt` arrivals run inside an async-context marker
  (`runAsAutomationStudioCoreMove`, `llm/harness-options/core-move.ts`), and
  the registry frames such a call `move: "core"` ("A domain tool call's build
  scope and durable state" below), so a domain can exempt them from rules meant
  for the model.
- **Per-act `settle` feedback** (`reset-settlement/words.ts`). Each open act under
  `actsToUndo`, `actsToRestore` and in a reset brief carries `settle`
  (`AutomationStudioSiteResetNamedAct.settle`), one generic sentence built from
  its open reasons: read a named list at a location completely again; that list
  still differs, so undo the act there naming it under `undoes`; its control
  still shows the state the act set, so press that same control back once; or
  nothing read shows where its effect would be, so read that list completely
  and name its ref as `resetDestination` on a look under `undoes`, listing the
  refs read complete before the build acted with their counts and locations.
  It names only this run's refs and locations, never a site noun. The refusal
  words state the rule once (`WORDS.settleModel()`).
- **Trial acts inherit destinations.** A trial step cannot carry a
  `resetDestination`, so a strict trial act that repeats an explored act
  (`reset-settlement/trial-repeat.ts`: the same lasting classes, the same operation
  where both say which, the subject or page token present and equal on both,
  and no contradicting subject, page or resource) shares that act's
  destinations, lazily: one named later for the explored act covers the trial
  act too.
- **Toggle back is admitted.** An undo whose control is at the toggle's
  `place`, shows the act's after state, and declares `[]` or
  `[modify_existing]` is admitted `own` with `modify_existing` unasked. A
  control at that place in any other state, or declaring anything else, is
  refused unrun `candidate.undo_unproved`; one already showing the state the
  build found is answered `candidate.undo_already_back`.
- **Removing a subject newly present on a named destination (t743).** A strict
  act's undo on a control whose `scope` is one of the act's destinations, or a
  destination lent from the explored act it repeats (`Act.lent`, gathered by
  the judge's `lent(act)` before admission), is admitted once, on `subject`,
  without asking (`reset-undo/admission.ts`, `destinationRemoval`, after
  every earlier admission path). It needs, in order: a subject token
  (`no_item_identity`); the allowance unspent (`undo_spent`); an original read
  of that list before the act (`no_destination_read_before`); the list read
  completely now, its latest read after the act (`destination_not_read_now`);
  the subject absent from the original (`subject_there_before`) and present now
  (`subject_not_present_now`); an act that declared `create_new` or
  `modify_existing` (`no_exact_inverse`); and an undo declaring only `delete`
  or `modify_existing` (`consequence_not_inverse`). The admission records the
  subject inverse, so the destination's group witness settles the act as
  usual, and a landed removal spends it. An undo on a named destination that is
  not about the act is refused with the removal's own failed condition (an
  original row is `subject_there_before`, `no_call`); a list the act never
  named keeps its earlier condition.
- **Invariants kept.** Pre-existing items are never touched: every other
  admission rule (own item, created item, follow-up confirmation, subject
  delete of a subject proved absent, witnessed transfer) is unchanged, and the
  removal on a named destination touches only a subject proved absent from
  that list's original.
  Partial or stale reads never settle. `cannotUndo` never settles a strict
  act: it stays listed with its `settle` until fresh reads settle it. Legacy
  unscoped acts keep their earlier paths (source-page `compareAt`, landed-undo
  fallback, keeping).
- **A reset brief's honest ending** (`project-agents/dispatch/reset-loop.ts`,
  `service/project-build/brief-ports.ts`). The reset port runs `remainingActs`
  once before its loop starts, so acts Core's looks settle never reach the
  model. Its task lists each open act with `What settles it: <settle>`, and a
  trial step's act reads `(made by step N of a trial run)`. A completion is
  refused `project.reset_acts_in_place` with `actsToUndo` (each with
  `settle`) while acts remain; a completion that names every act still listed
  under `cannotUndo`, each one already listed by an earlier refusal with what
  settles it, is accepted as the honest unresolved ending, and the reset comes
  back `blocked` with those acts still to undo. The ledger keeps refusing
  trials while they are open, so no trial runs on them. Acts no call can
  settle are never in `remainingActs`; a reset left with only those completes
  at once and comes back `blocked` with `terminalReason: "gate_unsatisfiable"`,
  its words naming them as left (`dispatch/ending.ts` `gateUnsatisfiable`).

Legacy mode is unchanged. Its dry-run test verifies lasting steps rather than
redoing them (`flow-draft/verify-only.ts`), so it needs exploration's effects
in place and has no reset. The deployment's optional start hook
(`prepareCandidateStart`, the Lab's fixture reset) still runs after the gate
admits a trial.

Submission and trial tools remain offered when repeated observations are withdrawn
and through the final counted budget decision. An accepted submission names the
exact revision/digest to test next; resubmission requires a new trial. The budget
count is guidance: the purse and hard limits still decide whether a request runs,
and the trial gate still refuses an untested revision. Completion without any
submission explicitly says that no Flow has been submitted and supplies no invented
revision or digest. The conversation ending distinguishes that failure from a
refused submission.

An offered candidate submission or trial can use the last estimated decision
slot through the ordinary tool and purse gates. If its decision returns at or
after the actual duration deadline, it cannot start another tool; the paid
decision retains a `llm_evidence_loop.duration_limit` trace and duration-bound
ending. Estimated time does not guarantee that a trial fits. Literal decision
ceilings, cancellation, result checks and promotion requirements still apply.

Candidate cached-answer and no-progress redirects carry the latest validated
submission's revision/digest and direct its exact trial before completion. They
do not refer to a legacy accumulated draft; a later refused submission clears
the older receipt from this guidance. Dedupe and no-progress bounds still apply.
Wrong-control feedback distinguishes a known control from the intended target:
correcting the node or choosing another observed handle remains an explicit choice.
Result-check cards use the ordinary refusal explanation when a screened finding
only repeats a stored-row count; a count alone is not presented as a failure cause.

The conversation commands read the setting through
`automationStudioConversationAuthorsCandidates` in `runtime/conversations/commands/build.ts`, for their descriptors, their
first reply, the build request and the result. The web panel cannot read Core's
environment, so it sends `authoringMode: "configured"` and the
`generate-flow-bootstrap-adaptation` handler resolves it once per request; the
answer is `payload.adaptation` in legacy mode and `payload.candidate` in candidate
mode, and the handler refuses a result that disagrees with the resolved mode. An
API request that omits the field is legacy and one that sends `candidate` is a
candidate request, whatever the setting. The downstream Lab sets the variable on
each Core it starts and refuses created-Flow qualification only in candidate mode.

The configured product default changed after two same-pair candidate creations
and their separate zero-model replays passed. Setting `FLUXIQ_AUTHORING_MODE=legacy`
retains the prior product path; no environment file is rewritten by this change.
Raw API omitted-mode behavior remains legacy for compatibility. Submission alone,
a mode setting and an unverified stored draft still grant no outcome acceptance.

## Explicit candidate authoring

The actual candidate service enumerates all active original instruction IDs before
reading or filtering artifacts. Missing, duplicate, incomplete or changing pages
refuse before provider resolution. It captures full original artifacts and explicit
applicable/excluded IDs into a schema2 draft, with a canonical original-source digest
and `candidate.plan+original_sources.v2` fingerprint covering the complete normalized
build plan. Inventory and artifact ordering use the same locale-independent ID order.
Synthetic prompt/repair context stays separate. Legacy helper callers without bound
inventory still create historical schema1 records; adding fields cannot upgrade them.

`getVerificationSource` reads existing disk state without repair, validates the full
source/build fingerprints, exact reference/base/settings and current original bytes,
and refuses historical, memory-only, malformed or stale records. V2 accounting must
equal the existing closed sanitized projection; it is informational. Normal WAL
read-only observation remains unsupported here. Source binding is historical byte
consistency, and supplies no pinned read, complete interpretation, execution permission
or accepted promotion. Those production joins remain required.

`runtime/flow-bootstrap/candidate/` supplies an opt-in discovery-only loop and
`core.submit_candidate`. Discovery appends evidence without draft retention,
automatic opener insertion or act completion. A complete submission uses the
existing bootstrap compiler, domain parameter resolution and plan/permission
validation. Core assigns a revision and canonical digest; refused or superseded
submissions invalidate the earlier candidate. Completion names the latest revision
and digest and grants static validity only.

`runtime/service/candidate-drafts/` persists unverified submissions separately
from adaptations in Core project storage. Reading a stored draft grants neither
execution nor promotion; it must be revalidated before runtime use. The existing
raw API legacy authoring path remains the omitted-mode default. In candidate
authoring mode (above), website panel Explore/Improve and conversation
create/explore/improve request unverified candidate drafts. Explicit API requests with
`authoringMode: "candidate"` and `evidenceGuided: true` run discovery and full
submission through the service, then store a separate unverified draft. The API
returns `payload.candidate` with candidate ID, revision/digest, accepted base and
settings revision, source instruction IDs and accounting, `status: "draft"`,
`verification: "not_performed"` and `promotionAllowed: false`. It returns no
adaptation ID or apply action; omitted mode still returns `payload.adaptation`
with `status: "proposed"` through the legacy path.

Candidate discovery uses the same purse, tool permissions, instruction authority,
registry/handle resolution, routing observations and build cancellation as legacy
generation. Discovery evidence does not enter the submitted graph or persisted
draft record. Completion stores the latest submitted revision without marking
the creation purse ended. Current Flow/settings mismatches and cancellation
checkpoints refuse storage. This is not an atomic base compare or cancellation
inside the underlying OS write. Stored drafts grant no execution or promotion.
In candidate mode, website authoring callers validate the closed `payload.candidate`
envelope against the original project/Flow, retain its reference/revision and report
verification pending. They do not approve/apply adaptations or offer an apply
confirmation. In legacy mode they review or apply the proposed adaptation as before.
Conversation completion means a draft was authored; its candidate attachment
contains an ID reference, not execution or acceptance authority. Explicit plain
structural generation and raw omitted-mode API compatibility remain legacy.

Browser consumers import the pure parser from
`fluxiq/automation-studio/candidate-authoring`, rather than the server-bearing
automation-studio barrel. The owning Fluxiq build validates and removes its fixed
generated library outputs before compilation so relocated modules cannot survive
as orphan artifacts. Neither browser compilation nor a draft response proves
execution or semantic acceptance.

Exact detached execution, declared start reset, independent requirements/observer
receipts, command/subject acknowledgements and durable promotion reconciliation
remain separate integration work. Static candidate submission does not prove
the user's requested outcome, and this facade never accepts or promotes it.

### What a refused candidate is told

**Every issue names the step it is about** (since t378). A script's steps do
not become plan nodes one for one, so a refusal that named only a plan path
("nodes 10 and 17") sent the model to the wrong lines. Each issue a refused
candidate shows the model is `{code, path?, message?, step?, label?, line?,
instead?, ...}`:

- `step` is the step's description as the model wrote it, `label` its label
  when it wrote one, and `line` the 1-based script line the issue is about:
  the step's own `step:` line for an issue about the node, the specific line
  (a `repeat most:`, an `only after:`) for one about a line.
- The acceptor builds a locator from what assembly actually built
  (`flow-bootstrap/authoring/script-locator.ts`), so indexes are never
  recounted. A node Core derived -- the join after an optional step, a loop
  head -- maps through its `cause` to the written step whose line made it.
  `automationStudioFlowBootstrapIssuePlace` (`authoring/locate-issue.ts`)
  resolves a path to its place. Both acceptance answers and the completion
  verdict carry the map as `locator`, so assembly, the domain's parameter
  resolution, registry validation and the binding check after it
  (`candidate/submission.ts`) all place their issues the same way
  (`llm/harness-options/bootstrap-completion.ts`).
- A JSON-plan submission has no lines: its issues carry the node's name as
  `step` and its key as `label` (`authoring/plan-locator.ts`).
- Only issues about the whole Flow carry no line, and they are one explicit
  list: `flow_script.no_steps`, `flow_script.too_many_lines`,
  `flow_script.repeat_unavailable` and `bootstrap.invalid_plan`
  (`WHOLE_FLOW`).
- `instead` is one fixed sentence saying what to write, given where Core
  knows it. A step whose consequences are undeclared gets it on its first
  issue; a typing step with `submit: true` is told it sends its form, which is
  a press, so it needs `consequences: none` or its classes
  (`plan/issue-feedback.ts`).
- The refusal's `next` names the refused steps by line and words ("line 32,
  "search for the paper towels""), each held to 120 characters
  (`candidate/submission-refusal.ts`).

Trusted static handler-scope refusals also retain Core's explanation through
early completion and repeated-submission feedback. A handler targets an explicit
step label; a descriptive unlabelled step does not bind that scope. Only the exact
authored-statement refusal code admits this message, preserving the existing
withholding of arbitrary provider or page messages. Invalid handlers remain refused.

The contract is enforced by
`flow-bootstrap/candidate/tests/refusal-locator-corpus.test.ts`: a corpus of
scripts, each refused at one stage, goes through the real submission
controller and is read back as the model is shown it, and every issue must
have a `line` and a `step` unless its code is in `WHOLE_FLOW`. A source scan
of `authoring/` and `script-statements/` requires every refusal code they can
raise to be met by a case, be in `WHOLE_FLOW`, or be listed, with its reason,
as one a written script never reaches (`NOT_FROM_A_SCRIPT`).

**A run of refusals is counted by its issues.** A refused submission's kind is
`<category>:<8-hex digest>` over the sorted set of `code@line` (`code@path`
where an issue has no line). An identical resubmission is the same refusal;
correcting one step makes a different one and breaks the run. The refused-in-a-
row warning shows the category without the digest and lists the recurring
issues ("..., the same issues each time: <code> at line <n>",
`llm/decision-handlers/refusal-run.ts`).

**An identical resubmission is told so in candidate terms.** The repeat guard
keys `core.submit_candidate` on its `flow` (or `plan`) alone, so a changed
`summary` does not make an unchanged script a new call
(`llm/repeat-guard/outcomes.ts`). A refused script sent again is not checked
again: its note says so, carries the earlier refusal's `issues` as given, tells
the model to change the lines they name and keep the rest, and says what one
more unchanged send does -- the build ends with nothing tested at three repeats
refused in a row (`llm/repeat-guard/candidate-feedback.ts`). Candidate mode is
`discoveryOnly`; the note and the refusal-run warning never mention the draft,
a rerun, marking a step optional or the Flow being tested and judged as it
stands, which the legacy notes still say.

### Script statements a candidate may write

These are taught in `AUTOMATION_STUDIO_FLOW_SCRIPT_LOOP_FORMAT`
(`flow-bootstrap/plan/flow-script-format.ts`) and assembled by
`flow-bootstrap/script-statements/`:

- **`repeat most: <n>`** bounds a `repeat while` span and goes on the span's
  first step, beside `repeat while:`. Written under a later member of the
  span, it is moved to the first step, since nesting is refused and it can
  bound only that span. Written where no `while` span takes it, or on a span
  that already has a bound, it is refused `flow_script.repeat_most_misplaced`
  at its own line (`repeat-bound.ts`).
- **`optional: yes` inside a span.** A step inside a repeat span may be
  optional (an optional step that is the last step of a `repeat while` span,
  the check that repeats it, is still refused `flow_script.optional_misplaced`).
- **`only after: <label>`** on the steps written directly after an optional
  step makes them a guarded group: they run only when the optional step was
  done, and the pass then continues where it was. The optional step's `failed`
  edge goes to a Merge after the group (a `guard` branch, which a span
  allows), and a span that ended on the group's last step closes at that
  Merge. So "if the notice shows, close it, wait, and go on with the loop" is
  an optional dismiss plus an `only after:` wait. Every misplacement -- no
  such step, another block or span, a step that is not optional, not written
  directly after the group, on an optional or branching step, on the last
  step of a `while` span -- is refused `flow_script.only_after_misplaced` at
  that line (`guarded-steps.ts`).
- **`repeat pace: <time>`** on a span's first step is the least time between
  two passes: a number with `ms`, `s` or `min` (a bare number is seconds),
  from 1 ms to 10 min. A pace under a later member moves to the first step; a
  second pace, or one no span takes, is `flow_script.repeat_pace_misplaced`,
  and one that cannot be read or is out of range
  `flow_script.repeat_pace_invalid` (`repeat-pace.ts`). It lands on that
  step's plan node as `paceMs`.

A plan node's `paceMs` is a whole number of milliseconds from 1 to 600,000
(`AUTOMATION_STUDIO_FLOW_BOOTSTRAP_PACE_LIMITS`; anything else is
`bootstrap.invalid_pace`), and adaptation writes it to the Flow node as
`metadata.paceMs`, which the executor honours (Core's
[Router Runtime](../automation-studio.md#router-runtime) section).

The executor skips a guarded group's optional step as it skips any optional
step (`executor/step-skip/optional-step.ts`): besides a step whose `failed`
and `success` edges enter the same Merge, it accepts one whose `failed` edge
enters a Merge that its success path reaches through at most 32 steps that do
not branch, and the `failed` edge stays the way on. So on a pass where the
site's notice is absent the group is gone past without spending retries or
recovery (`executor/step-skip/tests/guarded-group-run.test.ts`).

### What a trial says it absorbed

A candidate trial's feedback lists, for each step, every refused attempt it
got past (`absorbed`, `service/candidate-trial/absorbed.ts`): the failure
code, what happened ("The site asked the run to slow down on pass 4 (Jonas),
and to try again in 5.5 s." when the failure carried a wait hint, else Core's
category sentence), the pass and row, the wait asked, the wait taken and the
pace, and a `said` sentence ending "From then on the run started this step at
most once every 5.5 s." when a pace was learned. The paces a run learned are
also said once at the top level under `paces`. The failure's own message is
never read. Promotion keeps a learned pace: the deciding trial's learned pace
raises the matching plan node's `paceMs` (never lowers an authored one, held
to the plan's bound), and the `candidateTrial` audit detail names
`learnedPaces` and `raisedPaces` (`service/candidate-trial/promotion.ts`).

**The feedback always names the step a run stopped at (t743).** A run of more
than `MAX_STEPS` (40) steps lists the first 39 and then the last step the run
attempted, under its real step number and with its full entry
(`service/candidate-trial/feedback.ts`); `stepsLeftOut` counts the steps
between them. When that last step failed, the stop
(`flow-bootstrap/candidate/trial-stop.ts`) is about it, with `leftOut`, and its
sentence says the listing shows the first N and then that step, with the M
between them left out; with steps left out it does not claim how often that
step ran before. A long run whose last step did not fail ends on the graph,
start or run sentence, and the run sentence counts the listed steps plus those
left out. The step log names what a tool threw by the error's name
(`llm/step-log/summary.ts`), and its `loopVerdict` is
`llm_evidence_loop.cancelled` for an `AbortError` or `TimeoutError`,
otherwise `llm_evidence_loop.tool_failed` (`llm/step-log/tool-step.ts`).

**What a trial calls each step's control (t748).** One owner,
`service/candidate-trial/step-control.ts`, gives the feedback's
`steps[n].control` and a landed act's `on "<control>"` the same words. A control
is named by its own words as the domain resolved them
(`llm/model-facing/control-words.ts`), screened by `control-text.ts`: no
locator shape, no match score, no finding-only word (selector, fingerprint).
The failure-text screen (`sayable-text.ts`) also drops "address" and "score",
which a failure's text uses for the finding; on a control they are page words,
so a button whose words hold "address" keeps its name (rerun round 3's confirm
press had lost it, which was not its page reload). A target whose words are the
value its step reads (`readsWords`) is named by what the step read in that
trial (`outputs.value`, whitespace collapsed, at most 160 characters, the same
screen), or by nothing when it read none, never by the words captured before an
earlier step changed them. A step that ran in more than one loop pass names its
pass in each act's words, `trial step N, pass K of M "<label>"`, where K counts
the passes the step ran in; a step that ran once keeps `trial step N
"<label>"`. Every pass is its own executed step, act and call ref
(`<trialRunId>#step-N`). **Cross-repository contract:** Core reads the
downstream mark `readsWords: true` on a resolved `element`, set by the web
domain's `domain/src/runtime/llm-evidence/plan-resolution/read-identity.ts`;
Core's element-target type does not declare it, and renaming it there silently
names read steps by their saved words again.

**Judge advice after a refused undisclosed read (t743).** The judge's advice
reaches the builder through the subflow's repeated-advice memory
(`flow-bootstrap/subflow-candidate/repeated-advice.ts`), which the dispatcher
shares across a build's briefs. That memory holds an
`AutomationStudioSubflowDisclosureAdvice`
(`subflow-candidate/disclosure-advice.ts`): once a tool answer of the build was
refused with `detail.reason === "incomplete_text"` (seen by `builder-loop.ts`
on every call that is not a submit or a test), or a trial step's `actual`
begins with that marker, a sentence of a judged no's `judge.advice`, or of
`unconfirmedReading.advice` or `answeredReading.advice`, that asks to add or
include a field or column is replaced by Core's disclosure-order sentence: read
the row-context columns without the field; repeat over that read, pressing each
kept row's own disclosure control; then, after the repeat, read the same
listing again with the field, giving both reads the same conditions. It is
said once per advice; a later judge call asking the same is told to follow the
order above. The rewrite runs after the repeat filter, and the judge prompts
are unchanged. The detection is a sentence pattern, and it does not check that
the refused read was the same listing. **Cross-repository contract:** Core
reads the downstream closed refusal word `incomplete_text` (its
`detail.reason`, `detail.missing` and the `actual` prefix), owned by the web
domain's `domain/src/runtime/llm-evidence/action-failure/refusal.ts`; renaming
it there silently turns this rewrite off.

## Context boundary

A bootstrap request carries the existing effective active instruction
resolution plus the node catalog. The canonical node registry filters the
catalog before it reaches the model:

- the Flow's global or domain scope must allow the definition;
- every required runtime capability must be present;
- every required permission must be present;
- entries are sorted by definition ID, and every one that passes is sent,
  whole: its label and description uncut, and every parameter's authoring
  text and example (user, 2026-09-30: "Remove ANY AND ALL LIMITS ON THE NUMBER
  OF ELEMENTS PASSED TO MODEL. DO NOT HIDE INFORMATION OR USE ANY RANKING
  ALGORITHM");
- definition/version, labels, descriptions, capabilities, ports, parameter
  contracts with their authoring text, and output-action contracts are exposed.

The service derives this registry resolution from a defensive snapshot of the
bound native runtime's configured scope, runtime capabilities, and permissions.
It uses the same projection for generation, proposal normalization, and apply
revalidation. Required permissions remain definition-owned safety metadata: a
node whose permission is not granted is excluded rather than made available by
a bootstrap-specific exception. When no native runtime is bound, Core retains
the fail-closed empty capability and permission fallback.

Nothing ranks, budgets or condenses the catalog. Until 2026-09-30 a first live
bootstrap was held to 4,000 input tokens and 384 instruction tokens, the
catalog was ranked against the instruction and filled to a byte budget (64
entries for an evidence-guided build), and an entry's text was cut or
condensed. The only bound on the request is now the model's context window: a
request over it is refused before it is sent, with its size, and is never
trimmed (`runtime/llm/harness/run.ts`). The instruction is still read for one
thing: a capability it asks for (to enter, choose, press, verify and so on) that
no offered node provides is recorded in `catalogSelection.missingRequiredTerms`
(`runtime/flow-bootstrap/plan/required-terms.ts`), and generation fails before
provider or secret resolution.
The provider independently estimates model-visible system and user message
content as `ceil(UTF-8 bytes / 3)` plus a fixed chat-framing reserve, and rejects
a request above either the configured input ceiling or combined input/output
ceiling. The context also contains an explicit compact output schema. Recording IDs,
recording events, timelines, screenshots, and recording-derived candidates are
not part of the schema or context. A `flow_bootstrap` request fails before
provider invocation when it has no effective active instruction or no
scope-aware registry context.

### The catalog an evidence decision is shown

The one-shot `flow_bootstrap` call has no tools, so it is sent the whole
catalog above. An evidence decision -- every decision of an evidence-guided
build: its exploration, its repair rounds and a re-author -- is sent the
catalog by name instead, and the full definitions only of the nodes it asked
for (user, 2026-10-01: the whole catalog, 41,122 of the 58,547 characters of
one decision, was resent on every decision). Its `flowBootstrap` carries:

- `nodeCatalog`: every offered node as `{"<category>": ["<id>: <description>"]}`,
  nothing cut, descriptions whole with whitespace collapsed, categories in the
  order they first appear in the id-sorted catalog and entries by id
  (`runtime/flow-bootstrap/plan/catalog-names.ts`);
- `nodeCatalogNote`: one constant sentence on how to read the two fields;
- `describedNodes`: the full catalog entries (label, description, ports,
  parameter contracts with their authoring text, output-action contract) of
  the nodes this build has described, in the order each was first described,
  absent until there is one.

`catalogTruncated` and `catalogSelection` are not sent on that payload. The
packet still carries the whole `nodeCatalog`, `catalogSelection` included, for
every check that reads it (`catalogNames` and `describedNodes` sit beside it,
`runtime/llm/harness/context-packet.ts`); only the request body leaves it out
(`runtime/llm/deepseek/request-body.ts`).

The model reads a definition with Core's tool `core.describe_nodes`
(`{ids}`, up to 64 per call; `runtime/llm/node-tools/describe-nodes.ts`). It
observes only, is never a step of the Flow, and is offered only beside the
node library (`core.run_node`). It answers with a receipt -- `described`,
`alreadyDescribed`, `unknown`, `shownIn: "flowBootstrap.describedNodes"` --
never the definitions, which appear in `describedNodes` from the next decision
on, so each is shown once per request however long ago it was asked for. A
call naming only unknown ids is refused as `describe_nodes.unknown_nodes`. The
memory is one build's (`runtime/llm/node-tools/node-descriptions.ts`): every
round of the build shares it, and a new build starts empty. A describe call
reads nothing on the page: build routing records nothing for it (`pageless`,
`runtime/route-state/build-routing.ts`) and the state-digest hook skips it, so
it costs no page capture.

Describing first is advice, never a gate: nothing is refused before a call for
not having been described. `core.run_node`'s description teaches the two steps
(pick a name, read its definition before first running it). When a
`core.run_node` call fails -- refused evidence `ok: false`, or a thrown call,
including a rerun asked through `amend_draft` -- the node it named is described,
and a refusal says so (`described`, or `definition` when it already was) with
`undeclaredParameters` listing any parameter it gave that the definition does
not declare (`runtime/llm/node-tools/describing-failures.ts`). Core's own
replays of the draft pass through untouched.

**A parameter the host fills is never shown (t432).** A node parameter
declared `shownToModel: false` (`nodes/contracts.ts`) is one the host fills
from what the model names and the model never writes -- on the web, a node's
`selector`, `element` and `visualTarget`, filled from the handle the model
writes in `target`. It is left out of every catalog entry, so of
`describedNodes` and `core.describe_nodes` too
(`runtime/flow-bootstrap/plan/catalog.ts`), and out of the shape a refused
parameter is answered with (`accepted`) and the list an undeclared one is
answered with (`runtime/flow-bootstrap/plan/issue-feedback.ts`). The node
still declares it, so a Flow that holds it validates and runs. Everything a
model reads about naming an element -- the Flow script format, the library
verb's description, the in-run repair instruction, the advice on a refused
candidate, Core's own refusals -- speaks of the handle the evidence printed and
never of a selector, a locator, CSS or XPath; a guard test fails if one does
(`runtime/tests/model-facing/tests/handle-only.test.ts`). A model told "never
write a locator" has still been taught that a locator is a thing it could
write, so the prohibitions are worded without the word too.

## Permission on the authoring path

A build may carry `permittedConsequences`, the lasting consequences the person
allowed its actions to have. The build's model calls need no authorization of
their own: they run on the caller's own unlocked Secret Keys key. The domain
declares, action by action, what one would do --
for a step the build takes now while exploring, and for a step the finished Flow
would take each time it runs -- and
`AutomationStudioActionPermissionGate` answers from `permittedConsequences`, which a
person's answer to the gate's question extends. An action whose gated consequences the
build does not hold raises an
`automation-studio.action-permission-request.v1` with `reason.stage: "authoring"`.

**Only a high-risk real-world consequence is ever refused.**
`AUTOMATION_STUDIO_DESTRUCTIVE_ACTION_CONSEQUENCES` is exactly `move_money`,
`delete`, and `send_or_publish` (`action-permissions/destructive.ts`): completing
a purchase or checkout, moving money, deleting, and sending or publishing on the
person's behalf. `modify_existing` and `create_new` do not cause an authoring
permission question solely from their class. **The instruction authorises none of
the three** (the user's rule, `docs/working/mvp-today-plan.md:150` in the web
extension repository: these acts independently require a person's authority, so
each is asked about even when the instruction asked for it; restored 2026-09-30
after the gate had let an instructed class through unasked and never gated
sends). The derivation in `instructed.ts` still reads which of them the
instruction asks for: the answer travels in the request's
`authority.instructed`, is stored with the Flow, and feeds the cross-check
below. Every class is still declared, kept in the declaration record, and
compared with the instruction. Only a gated subset no person has permitted
produces an `automation-studio.action-permission-request.v1`.

**The instruction's read: one call per build, about its acts, before any press
needs it (t174-w107).** The read is `service/instruction-authority.ts`: one
`evidence_tool_decision` with no tools, `metadata.source: "instructionAuthority"`,
counted with the build (step-log phase `read`). Where the instruction's acts are
read with no model (`runtime/flow-bootstrap/instructed-acts/instruction-acts.ts`,
the same ids as the build's checklist), its completion's consequence half
(`automationStudioInstructedConsequencesSchema`, `action-permissions/instructed.ts`)
asks first for `acts`: one required key per act id, described by the act's own
words, answered with the classes that act asks for or `["none"]`; then the free
`instructed` list as before, for what no act names (a refund). The decision
schema says it reads the instruction alone, with no page and nothing to do next.
Each act answered with a class adds a grounded entry quoting that act, so two
acts of one class are two stored entries. An act split from one clause with
several counted objects (t262) quotes words Core assembled from the verb and its
own object, so its entries quote the original clause (`source.clause`) instead,
and sibling splits of one class share that clause's one entry. An act the answer
skipped, or every act of a read that failed, is kept as unanswered
(`consequences: null`) on the read the gate holds, never on the stored entries,
and the Flow's thread is told once which act, in the person's words.

**The same read answers the route the person names (D phase 1).** The user's
rule: a route the person names must be followed; a Flow may start where the
work begins unless the person names the route. The authority's completion is
`automationStudioInstructionReadingSchema`
(`action-permissions/instruction-reading/`): the consequence question above,
unchanged, with a required `route` beside it answered `named` (the instruction's
id, its words for the whole route, and each place in the order to visit them),
`open`, or `unclear`. The exported consequence-only schema is unchanged. Core
reads the two halves independently (`readAutomationStudioInstructionReading`):
a route it cannot ground never removes a grounded consequence, and grounded
consequences never make a missing route open. The route reading
(`action-permissions/instruction-route/`) has four states. `named` holds only
when the route's words occur exactly once in the named active instruction and
each waypoint's words exactly once inside them, compared as the permission read
compares quotes but mapped back to the person's own words
(`action-permissions/instruction-quote/`) as UTF-16, half-open spans over
`title + "\n" + body`; Core makes the route and waypoint ids and binds the
reading to the active instruction set's digest. No 300-character quote bound
applies, and a route past 20 waypoints is not shortened. `open` is only an
explicit, well-formed answer. Everything else is `unavailable` with a closed
reason (`transport`, `non_complete`, `malformed`, `ungrounded`, `ambiguous`,
`stale`), never `open` and never the provider's words. `unread` means no read
has settled. `currentAutomationStudioInstructionRoute` makes a named or open
reading `stale` once any active instruction changes. The authority returns
`route.read()`, which shares the one call with `derive` -- whichever comes
first sends it, nothing sends it again, after an answer or a failure -- and
`route.peek()`, which never sends. A call that threw stays a rejection for
`derive`, so the gate still holds its answer as unknown and asks; `route` says
`transport`. A route is the reader's interpretation of the person's words, not
proof any step went anywhere
(`docs/working/mvp-live-continuation-2026-10-03/reports/d-grounded-waypoint-contract.md`
downstream).

**A named route is held at completion (D phase 2, t273 S2).** The build hands
the loop the authority's route (`runtime/llm/harness-options/draft-route.ts`,
through `automationStudioFlowBootstrapDraftActs`). Once the read has settled
and still matches the active instructions, the draft shows it
(`runtime/flow-draft/entry.ts`, `route`): the route in the person's words with
each place under an id, `r1` first, or `"open"` where they named none. The
model says which steps are on each place with `place` (`"r2"`, `"r1,r2"`,
`none`) beside `add` on a call or on an amend_draft `add` or `keep`, stored as
`places` on the step (`runtime/flow-draft/route-places/`). Unlike an act, many
steps may be on one place, and a claim replaces only that step's own. The
completion is refused (`flow_bootstrap.route_not_followed`) while a named
route has a place no step in the Flow is on, places reached out of order, or a
first step that goes straight to an address deeper than the start location --
unless that step says it is on `r1`. A deeper first step is refused too when
the reading is not `open`. The read stays lazy: the route check sends it only
for such a first step, only while nothing has read it, and at most once; a
route still unread is no route, so nothing is shown or refused for it. The
check is composed into the build's `checkCompletion` before the activity
observer wraps it (`automationStudioLlmEvidenceLoopRouteChecked`), so a route
refusal reaches the chat as any refused completion does; the loop never
composes it itself. A `place` is the model's claim, not proof: the whole-Flow
judge is told that a Flow starting deeper than the route's first place, or
skipping a place on it, does not do what was asked
(`runtime/llm/diagnosis-instructions.ts`). Not yet carried: route intent on a
saved Flow, and route-aware feedback at edit time (contract phases 3 and 5).

The build's tests check, rather than do again, a step claiming an act that is
lasting (`flow-bootstrap/action-permissions.ts`, `instructedLastingActs`;
`flow-draft/verify-only.ts`). An act is lasting when any of three holds: (a) its
kind does something to an item that stays done -- `add_to`, `save`, `claim`,
`move`, `submit` -- whatever the read said (run `run-musp4h2f-72e8ed99`, whose
two split adds the read quoted as one sentence were pressed again until the cart
held 12 items); (b) one of the read's quotes grounds it, a split act by its
original clause and its own object's words (t174-w83, t262); or (c) the read
carries per-act answers and this act's answer is missing, unanswered, or names a
class. Only a `set` or an `open` that the read neither quotes nor answered as
lasting runs again. A read that throws holds no quotes and no answers, so only
(a) applies. The read is made at the first of: an exploration call whose input
declares a lasting consequence (before the domain receives it, not from inside
its permission check), the build's first test, the completion check, or the
cross-check. Run `run-musp8nz1-dbd3905a` (Cause 5) is why: its read was posed
with the page decision's framing, asked for classes only, answered the cart and
not the coupon, and ran inside the Add to cart press.

**The request is put to the person, in the Flow's own thread.** The request's
`requestId` is the id of a `permission` ask
(`runtime/conversations/ask.ts`), so the gate and the conversation name the same
question without either inventing an id, and the ask carries the request
verbatim. Answering `grant` adds exactly the classes the request listed as
`missing` and the build carries straight on -- the same check is asked again
rather than answered a second time. A refusal, or nobody answering, leaves the
domain's own recoverable `permission_required` for the model to route around.

**Nobody answering and a person saying no are different answers (t195-w18).**
`automationStudioPermissionAskOutcome` (`runtime/parking/permission-ask.ts`)
reads the ask back as `granted`, `declined` (a `deny` in the thread) or
`unanswered` (the wait ran out, the caller did not wait, the wait was
cancelled, or the thread could not be reached), and the gate settles each
differently. An unanswered request stays in force: every later gated action
is refused with that request's id and no new request is raised, so a build
nobody is watching still costs one wait rather than one per action. A decline
is remembered for that question alone -- the same control name, the same
control kind, and the same classes it was asked about. That question is refused
from then on without asking, carrying the declined request's id and
`declined: true` on the verdict, and a later grant of the same classes on
another control does not lift it. A different question raises a new request,
which is put to the person in the same way. The request the build ends on, or
is proposed with, is the one the latest refusal carried, with one exception: a
declined request is carried only while a step of the Flow needs it. An
exploration press of a declined control is refused without the build standing
on it, so a later stalled round is not ended as that question and a finished
Flow that never presses the control stays approvable; a plan step refused by a
declined question ends the build on the declined request, and one refused by a
new question ends it on that. Until this, one declined press on "Continue
to checkout" refused "Place order" -- the press the task needed -- unasked for
the rest of the build. The domain tells its model `consequences_declined` for a
declined press rather than `consequences_not_granted`, which says the request
is still in front of the person. The repair path
(`recovery/runtime-exploration.ts`) follows the same rules since 2026-10-01:
each request is asked once, a decline is told to the repair's model as
declined and its exploration goes on, a different control is asked, and only
an unanswered request ends the exploration, with `operator_approval_required`
carrying it. Before that a repair settled a no as silence and ended on it.
The gate settles only `granted` and `declined`; any other answer leaves the
request in force, so nothing is ever granted by default.

**Whether the build waits is the caller's decision.**
`permissionAskTimeoutMs` on the generation input is how long it holds open for
an answer; absent, the question is still opened in the thread and the build
carries on without waiting. The API handler passes
`AUTOMATION_STUDIO_FLOW_BOOTSTRAP_PERMISSION_ASK_TIMEOUT_MS`, because somebody
has just pressed build; an unattended caller passes nothing. The caller decides
whether to wait; how long is capped at that same constant, since a build holds
its caller's request open while it waits.

**A build may propose while carrying an unanswered request.** It ends on the
request only when it produced nothing; a plan the completion check accepted is
still a Flow worth having, and the request is stored on the adaptation as
`permissionRequest` and returned with the proposal. Approving or applying such
an adaptation is refused until the ask it names is answered `grant`
(`assertAutomationStudioBootstrapPermissionAnswered`), because a saved Flow
replays with no gate in front of it, by design.

**Both generation paths go through the same gate.** The evidence-guided build
hands the check to every exploration call and to every step of the plan it
completes; the one-call build, which explores nothing, hands it to every step of
the plan as its parameters are resolved. Before this, the one-call path resolved
with no check at all, so every step that declared a lasting consequence was
refused with no request raised and nobody asked.

**Every declaration is kept, including the empty one.** An action that says it
causes nothing lasting is put to the gate like any other: it is read, recorded
and permitted. The gate keeps one `AutomationStudioActionDeclarationRecord` per
action asked about -- the action, the control as a person would name it under
the same evidence rule the request uses, the classes, and Core's answer -- and
the build stores them on the proposal as `declaredConsequences`. Until
2026-09-22 a permitted verdict discarded the declaration where it was read and
the domain never even called the check for an empty one, so what a step had said
about itself could only be deduced from the absence of a refusal. Four live
builds authored Flows containing presses that nobody could account for.

**Core holds the declarations against the instruction.** After the loop stops,
`automationStudioActionDeclarationCrossCheck` compares what the build declared
with what the person's instruction was read as asking for, and stores the
finding on the proposal as `consequenceCrossCheck`. `verdict: "undeclared"` is
the contradiction nothing else catches: the instruction plainly asks for
something lasting, actions that commit ran, and not one of them said it would
cause it. Measured live on `social-scheduler-schedule-post`, twice: the press on
"Schedule post" declared `send_or_publish`, the instruction asked for
`send_or_publish` **and** `create_new`, and `create_new` was declared by
nothing.

It refuses nothing and grants nothing. The instruction is the authority for
permitting, so a class the instruction asks for was already allowed and an
under-declaration bypasses no permission; refusing the build would be Core
overruling the person's own instruction on Core's reading of their words.
Instead the finding is recorded on what the person approves and said out loud in
the Flow's thread. It is a `confirm` ask ("... Apply it as it stands?"), which
does not park, only when a class nobody declared is one a person is asked about
(`destructive.ts`: moving money, deleting, sending or publishing -- the user's
rule of 2026-10-01); a creation or an edit nobody declared is said as a plain
line with no question (t174 F42). The sentence names each class in plain words
beside the person's own quoted words, with no class codes and no action counts:
run `run-muqk4u32-0b36e58f` ended on "The instruction asks for modify_existing
and create_new, and none of this run's 72 actions said it would cause that",
whose 72 counted every replay of the draft. Nothing here reads a control, a
label or a node id: both sides of the comparison are the model's own statements.

The comparison may cost one provider call the build would not otherwise make,
and only in the case worth paying for -- at least one action was put to the gate
and none of them declared anything lasting, so the derivation that reads the
instruction was never triggered. That call is counted:
`totalProviderCallCount` on the created-audit detail is every call the build
made. `providerCallCount` and `decisionCount` remain the evidence loop's own and
stay equal to each other, because a downstream reader holds them to that.

## Untrusted output boundary

The model returns symbolic keys rather than durable IDs. Symbolic keys are
lower-case plan-local identifiers. A later normalization phase owns durable
Router, Subflow, graph Flow, node, and edge IDs.

The strict plan has one Router, bounded owned Subflows, bounded nodes and edges,
and an explicit fallback. Each node pins an exact catalog definition version,
declares only registered parameters, and selects an output action when its
definition requires one. Each edge names registered output/input ports.

The prompt-facing output contract is a compact JSON Schema Draft 2020-12
document, not a prose example. It declares every required field and optional
node field, exact `additionalProperties: false` boundaries, the lower-case
plan-local symbol pattern, per-array minima and maxima, exactly one primary
Subflow, and mutually exclusive `fail` versus `subflow` fallback shapes. The
`parameters` object is the deliberate dynamic-key exception: its description
restricts keys and JSON values to the selected catalog entry's parameter
contracts, which Core enforces against the registry after parsing. The optional
`outputActionId` description requires it if and only if that catalog entry has
an output-action contract. Core remains authoritative for these catalog-relative
rules; the schema does not weaken or replace parser and registry validation.

Core rejects unknown fields and validates all untrusted output against the same
scope-aware registry used to form the catalog. Validation covers:

- schema, UTF-8 bytes, counts, and graph depth, each derived from the Flow's
  size setting (see "Flow Size" below);
- exactly one primary Subflow and valid symbolic Router targets;
- definition availability and exact version pins;
- required, unknown, typed, constrained, and state-bound parameters;
- source/output ports, target/input ports, compatible types, and port
  cardinality;
- importer/recording output-action contracts;
- duplicate nodes, edges, and connections;
- disconnected, cyclic, or excessively deep graphs.

This is deliberately stricter than general hand-authored Flow validation.
Bootstrap graphs are finite DAGs so a model cannot introduce an implicit
unbounded loop during first authoring.

## Flow Size

How large a Flow may be is one setting a person changes: the most nodes one
Subflow may hold, `flowSizeSettings.maxNodesPerSubflow` in the Flow's metadata,
shown in Flow Settings as "Maximum nodes per Subflow". It defaults to 100 and
accepts a whole number from 1 through 1,000; a Flow saved before the setting
existed reads the default. The model is `model/flow-size/`.

Every bound on a Flow's size is derived from it in
`runtime/flow-bootstrap/plan/size-limits.ts`, so raising it raises all of them:
two edges per node in a Subflow, eight full Subflows in total, a graph depth
equal to the node setting (a straight chain of every node fits), two kilobytes
of plan per node (never below 65,536 bytes), and one kilobyte per node for one
reply's result (never below 12,000 bytes). Parsing, registry validation, the
reply and draft profile limits, the output and evidence completion schemas the
model is shown, and the deterministic recovery path all read it. A refusal over
a bound names the setting and the value it had. A reader of a record written
earlier -- a published trace, a stored incomplete draft -- has no Flow in hand
and bounds by the setting's largest value instead, so a record any Flow's
setting allowed stays readable. The setting is part of the Flow's settings
revision whenever it differs from the default, so changing it makes a proposal
built under the old value stale rather than applying it; a Bootstrap context
built for a non-default Flow carries `maxNodesPerSubflow`, which is how the
provider adapters, holding only the request, size the schema they check and the
plan they parse.

## Plan handles

The model never sees a locator. A domain names each thing it observed while
exploring with an opaque handle and keeps what the handle points at to itself,
so a node the model writes can refer to what it observed only by handle.
Wherever a real value belongs, such as a target or an extraction item, a
parameter value may be `{ "handle": "<token copied from the evidence>" }`. When
the model explored more than one place, the value may also name the place the
evidence reported, as `{ "handle": "<token>", "location": "<location>" }`
(`runtime/llm/harness-options/plan-node-handles.ts`). The shape is reserved.
An object whose keys are `handle` and, optionally, `location` is always a
reference, in any node's parameters. An object with `handle` beside any other
key is not a reference. A reference is malformed when its token is outside the
handle syntax: letters and digits, with `_.:-` allowed between them, at most 64
characters. It is also malformed when its location is not a string of 1 to
2,048 characters without control characters, or when one node names more than
16 references.

After parsing and before registry validation, Core asks the bound domain about
every node, once each (`resolveAutomationStudioFlowBootstrapPlanParameters` in
`runtime/llm/harness-options/plan-parameter-resolution.ts`). The domain answers
through `resolvePlanNodeParameters` on its evidence binding
(`runtime/llm/harness-options/binding.ts`). It receives the project ID, Flow ID,
node definition ID, and a copy of the node's parameters as the model wrote
them. Under `handleReach: "view_history"` (a candidate submission) each node is
also sent `precedingSteps` (t748): every Subflow's nodes before it in plan
order, as the plan held them before any was resolved (handles intact, the
consequence declaration taken off), each call its own copy, including the steps
Core never asks about (an inherited step left untouched, a handler whose page
fact was refused). A page fact's target is no step and is sent none, and a node
with more than 200 steps before it is sent none. A domain reads where a node
stands -- which dialog a press before it opened, say -- from this list alone,
never from the order of the calls. Plan order is not run order in a branching
Flow. It answers with one of three results:

- `unchanged`: the parameters stand as written.
- `resolved`: the node's complete parameters, with every handle replaced from
  what the domain retained when it issued it.
- `refused`: issue codes only. Core keeps at most 16 of them.

Core trusts none of the answer. Each of the following refuses the node under a
code of Core's own:

| Code | Cause |
| --- | --- |
| `bootstrap.handle_malformed` | A reference is malformed. |
| `bootstrap.handle_not_issued` | The node names a handle, but the generation explored nothing, so no handle can have been issued. |
| `bootstrap.handle_resolution_unavailable` | The node names a handle, and the domain binds no resolver. |
| `bootstrap.parameter_resolution_failed` | The resolver threw. |
| `bootstrap.parameter_resolution_invalid` | The answer has another shape, or its resolved parameters are not plain JSON within 16,384 bytes. |
| `bootstrap.parameters_refused` | The domain refused without a usable code. |
| `bootstrap.handle_unresolved` | The parameters still name a handle after resolution, `unchanged` ones included. |
| `bootstrap.target_not_a_handle` | A fact the model wrote names its element by something other than a handle or a dialog (t432, below). |

A refused node fails the plan and never reaches dispatch. In evidence-guided
generation the refusal is fed back to the model (see
[Generation command](#generation-command)).
`createFlowBootstrapAdaptation` and Bootstrap apply both run
`assertAutomationStudioFlowBootstrapPlanHandlesResolved`, so a plan that
reaches either without resolution is refused if any handle survives.

### What the model wrote names an element by handle only (t432)

The user's rule (2026-10-10): every saved element carries the full
multi-signal fingerprint, and the model "shouldnt have to worry about any of
that, that's all handled by extension". So a caller says who wrote what it asks
the domain about, and the domain refuses an element the model named any other
way -- a locator, an identity or a description of its own -- instead of running
it as written. Two optional fields of `resolvePlanNodeParameters`'s input say
it, never both:

- `writtenByModel: true`: every parameter of the node is the model's. Set for a
  plan from the reply -- a candidate submission, a legacy completion with no
  draft (`bootstrap-completion.ts`) -- for the one-shot `flow_bootstrap` plan of
  a build that explored nothing (`service.ts`), and for every step and fact an
  in-run repair writes (`runtime/recovery/annotation/step-evidence-resolution.ts`).
  Before asking, a repair's condition about a control named by handle takes its
  `fact` from its `op` (`exists`, `absent`, `visible`, `enabled`, `count`), or
  keeps `text`, `value`, `count` or a presence word for a comparison, because the
  domain reads a described fact as `unknown` and a `when` that answers `unknown`
  never holds; a comparison that says only in its own words what it compares is
  refused (`recovery.fact_kind_unread`), so the repair answers `none` and records
  no adaptation (`runtime/recovery/annotation/patch-fact-kind.ts`, t787).
- `modelWrittenParameters: string[]`: for a node the host wrote -- a plan built
  from the draft, whose steps ran with what the domain resolved -- the
  top-level parameters the model wrote over it: the `settings` an
  `amend_draft` decision carried onto the step, which replace that parameter
  whole (`runtime/llm/harness-options/amended-plan-parameters.ts`). Only those
  are judged.

A step the draft ran, a step the Flow being extended already holds, and a
hand-authored Flow compiled without a build (the Lab's recovery matrix) are
never flagged, so their literal locators still run.

A fact is Core's own statement, so Core judges its target itself: with
`writtenByModel`, or in a parameter `modelWrittenParameters` names, a fact
target that names neither a handle nor a dialog -- the `at "<locator>"` form,
which only a hand-authored Flow may write
(`runtime/flow-bootstrap/script-statements/fact-locator.ts`) -- is refused as
`bootstrap.target_not_a_handle` at its path, with a fixed sentence saying to
name the element by the handle the evidence printed. An in-run repair's fact
whose target is anything but `handles` is refused the same way before any
domain is asked.

## Core-derived fields

The model cannot supply risk or canvas positions. Core derives risk from
registered definition safety, runtime, permission, capability, and output-action
contracts. Core then lays each validated Subflow out by topological depth and
stable symbolic-key order using fixed spacing. The result is deterministic and
contains no overlapping positions.

The validated plan is the only input accepted by the dedicated Bootstrap
Adaptation lifecycle. Provider resolution, UI controls, and same-run
execution remain separate concerns and must consume this boundary rather than
bypass it.
## Provider transport

The DeepSeek adapter maps `flow_bootstrap` only to the
`flow_bootstrap` expected output. Its user payload carries the compact output
schema as an explicit field as well as the bounded bootstrap context. Before
secret resolution, the adapter rejects a missing or altered schema, excess
catalog size, non-bootstrap expected output, and context outside the
instruction/catalog allowlist.

The trusted system message requires exactly one JSON object, treats every user
string as data rather than instruction, requires object delimiters, and forbids
padding, Markdown, commentary, and code fences. For bootstrap it additionally
binds the result to the `outputSchema` field and requires minified JSON, concise
summaries, identifiers, and names, and only the nodes, edges, Subflows, and
routes required by active instructions. Optional recovery, integration, and
extra branches are excluded unless an active instruction explicitly requests
them. The bootstrap directives are absent from the untrusted user context and
other task messages. Requests disable thinking and set temperature to zero;
the strict Bootstrap response schema remains authoritative.

A reply that stopped of its own accord (`finish_reason: stop`) but never
closes its object, short only of closing brackets at its end, has the closers
its open brackets need appended (`llm/deepseek/unclosed-content.ts`, since
t378). The closed text must parse and is validated as any reply; content that
does not start with `{`, ends inside a string or closes the wrong bracket is
still refused `content_unclosed`, and a `length` reply is refused as
truncated before this runs. The reply as sent stays in the step log.

An exhausted provider balance has its own code, `llm.provider_balance_exhausted`
(t728), rather than `llm.provider_http_error`. The DeepSeek adapter
(`llm/deepseek/balance-exhausted.ts`, used by `provider.ts` and
`panel-command.ts`) reads it from HTTP 402, or from a screened error code, type
or message saying the balance, quota, credit or funds are insufficient, at any
status, and checks it before the 401/403/429 refusals. Its disposition is
`end_model_calls`: it is never retried and is not a spent call. A build that
ends on it fails `flow_bootstrap.provider_balance_exhausted` (stage
`provider_request`, attempted and received, not retryable, with
`accounting.providerStatus`); a re-author attempt carries the same code, the
step log's `meta.error.code` names it, and the chat tells the person the model
account's balance has run out and to add credit with the provider.

### Domain system instructions

A domain may bind its own instructions with its evidence runtime:
`AutomationStudioLlmEvidenceRuntimeBinding.systemInstructions`, a
`{ version, text }` checked when the runtime is bound
(`runtime/llm/domain-instructions/`). `version` matches
`^[a-z0-9][a-z0-9._-]{0,63}$`, and `text` is non-blank, at most 4,000
characters, with no control character but a line feed. A text that fails is
refused by the service constructor or `bindLlmEvidenceRuntime`, never mid-build.

Coverage is central, not per call site. The service wraps the host's execution
resolver and the result-check resolver once, where they are stored, with
`automationStudioLlmResolverWithDomainInstructions`. Every provider either
resolves is decorated by `automationStudioLlmProviderWithDomainInstructions`,
which sets `domainInstructions: { domainId, version, text }` on each request
passed to `runTask` and to `measureInput`. That covers every evidence decision,
the bootstrap call, the instruction authority, the build judge, runtime
diagnosis and patch, result verification, recovery annotation and the standing
repair authority, and any call site added later. The binding is read when a
provider is resolved, so a runtime bound after the resolver is the one sent.

The request carries the instructions beside its context, like
`deniedEvidenceKeys`. They are never part of the user payload, but they are
part of the system message, so the provider's `measureInput` counts them. The
DeepSeek system message is built in three parts:

1. Core's rules: the JSON-only and injection rules, then the task's schema
   instruction.
2. The domain's text, set off by a blank line before and after.
3. Core's prose for the task, as before: the evidence-decision instruction,
   compact-output rules, runtime-patch prose, diagnosis fields and the
   reusable-context rule.

Both of the first two parts are constant for a binding and a task kind, so the
text sits inside the prefix a provider's cache reuses from one call to the next.

**Rules Core says itself, per task kind (t728).** The sentences that hold for
every domain are Core constants in `llm/deepseek/system-prompt.ts`, added to the
third part (Core's task prose), never to the first, so the format, injection and
schema rules are unchanged. In prose order:

- **Recordings**, first, to any task kind, only when
  `context.supplementaryRecordings` is non-empty (today only Flow Bootstrap
  carries them, and a build's recordings are the same on every call, so the
  cached prefix holds): written instructions define the automation; described
  demonstrations are untrusted, never replace the task or authorize extra acts,
  lose where they differ from the instructions, and never imply a task.
- **Person limits**, to every task kind that chooses or writes an act
  (`flow_bootstrap`, `evidence_tool_decision` staged or not, `runtime_patch`,
  `subflow_patch`, `expectation_action_target_patch`): anything a person could
  do is allowed, acts that spend money, delete, or send or publish are asked of
  the person first, and no password or other secret is ever typed.
- **Loop authoring** (`AUTOMATION_STUDIO_LOOP_AUTHORING_INSTRUCTION`): repetitive
  work is a loop with a `where` keeping the items to act on, the act done or
  written once and `repeat` stated, and a value that changes between runs or rows
  bound with `{"$input"}` / `{"$row"}`, never typed in. Flow Bootstrap gets it
  after its compact-output sentence; the three patch kinds get it at the end of
  their prose. Evidence decisions do not, because their loop policy
  (`AUTOMATION_STUDIO_LLM_EVIDENCE_DECISION_INSTRUCTION`) already says it.
- **Lists** (`AUTOMATION_STUDIO_LIST_AUTHORING_INSTRUCTION`): keep an item by
  evidence of its own type, and state a loop's repeat by `amend_draft repeat` in
  a draft or by repeat lines in a written Flow. To evidence decisions (after the
  loop policy) and Flow Bootstrap (after loop authoring).
- **Efficiency** (`AUTOMATION_STUDIO_EFFICIENCY_INSTRUCTION`): as few decisions
  as the task needs, under a small cost ceiling. Same kinds as Lists, right
  after it.

Judges, diagnosis, router patches and instruction suggestions get none of these:
they write no step. The chat interpreter's prompt is unchanged; it only picks a
panel capability. A domain's instructions therefore carry only its own domain's
wording (how to read its page view, find things, page, what it can never do);
a generic rule written there as well is said twice, so a domain deletes its
copy when Core takes a rule over.
Nothing a domain writes replaces Core's schema or injection rules. Without
instructions the message is byte for byte what it was; the pins are
`runtime/llm/deepseek/tests/system-prompt-pins.json`.

The chat's interpreter (`runtime/conversations/instructions/prompt.ts`) gets
the same text. The service connects the conversations collaborator to its
binding with `bindDomainInstructions`. The text follows the panel's fixed
capability vocabulary and precedes the project's Flows and what is on screen.
The answer-shape rules stay last.

Provider response content is still untrusted. For bootstrap tasks the adapter
requires exactly `kind`, `summary`, and `plan`, then parses the plan through
the strict bootstrap parser before returning it to the harness. The harness
performs the subsequent scope-aware registry validation. Provider transport
therefore cannot reinterpret bootstrap output as a generic change proposal or
pass recording/timeline-shaped context into this lane.
## Bootstrap Adaptation lifecycle

The runtime/flow-bootstrap/adaptation.ts module defines a separate, typed
flow_bootstrap adaptation. It is not a recording proposal and it cannot be
applied through the arbitrary patch/document-replacement path.

At proposal time the service requires a blank top-level orchestration Flow and
an exact dependency digest. It revalidates the plan against the current Core
registry, deriving risk and layout again, then normalizes plan-local keys into
Core-owned Router, Subflow, graph Flow, node, edge, and route IDs. The normalized
topology is persisted with the proposal so review shows exactly what apply will
write. Recording and timeline provenance keys are rejected recursively.

Manual review moves the proposal from proposed to validated; only a validated
proposal can be applied. Application checks the full dependency digest again,
checks the stored topology against a fresh Core normalization, and writes owned
graph Flows, Subflows, the Router, and constrained parent lineage. Every graph
carries exact parent Flow/Subflow ownership metadata and the deterministic node
positions from validation. The operation is serialized per parent Flow. Because
the durable stores span document and relational boundaries, atomicity is
implemented with verified compensating rollback: failure removes newly created
Router/Subflow/graph artifacts and restores the parent state.

Revert requires the exact post-application dependency digest and preflights
every ownership link before mutation. It removes only artifacts carrying the
adaptation identity and restores the constrained parent state. Revert failures
also compensate back to the complete applied topology. Lifecycle transitions append project change-feed entries with
bootstrap_adaptation identity and deterministic, standard-shaped audit events
(created, approved, rejected, applied, and rollback) to the dedicated proposal
document. Audit reasons and detail are canonical and contain no provider key,
session, prompt, or response data. Standard Adaptation Inbox queries
merge these dedicated summaries with ordinary adaptations by adaptation ID, so
proposals remain discoverable after restart without duplicating their topology
or changing the ordinary-adaptation persistence path. The dedicated proposal
document remains available as lineage after revert.

AutomationStudioService.getLlmExecutionBinding(projectId, flowId) exposes the
current execution dependency digest together with the canonical numeric Flow
settings revision. Persistent projects use the SQL settings revision; the
memory-only fallback derives a stable numeric fingerprint from the effective
settings content and never uses wall-clock time. Provider execution remains
outside the Bootstrap Adaptation persistence path.
## Generation command

The public service command generateFlowBootstrapAdaptation is the only Core
command that joins production provider resolution to the strict bootstrap
contract. Its input is deliberately narrow: project ID, blank Flow ID, the
`caller` (`AutomationStudioLlmModelCaller`, the actor whose unlocked Secret Keys
key pays), and optional `permittedConsequences`. The API endpoint takes the
caller from the request's authenticated actor. Runtime flags, dry-run flags,
side-effect authorization, provider overrides, and arbitrary metadata are
rejected before provider resolution. No grant, purpose, execution digest, or
settings revision is supplied or compared: the model call needs no
authorization beyond the caller's own key.

Before any provider call, the command serializes generation for the parent
Flow and verifies all of the following:

- the parent is a blank top-level orchestration Flow with no Router or Subflow;
- no proposed or validated Bootstrap Adaptation is already pending;
- at least one active global, project, or target-Flow instruction resolves
  without instruction conflicts;
- the scope/capability/permission-filtered node catalog is nonempty and remains
  inside the bootstrap contract's count and byte bounds;
- the configured resolver returns a provider for the caller with bounded
  execution settings.

It reads the Flow's dependency digest and settings revision as they stand as
the proposal's base binding. Without `evidenceGuided`, the command invokes the
harness exactly once with task and expected output flow_bootstrap. The harness
packs only active scoped instructions and the compact catalog/schema context.
Provider output is parsed, its node parameters are resolved through the bound
domain (see [Plan handles](#plan-handles)), and it is registry-validated as
untrusted data. Nothing was explored on this path, so a plan that names a
handle is refused. Core then rechecks the Flow's base binding before
persistence. Provider or validation failures create no proposal.

The caller's key is released per call by a one-use Secret Keys session reveal
authorization against the unlock established at web login; the account
password or PIN is never asked for again. Secret Keys derives per-key
decryption buffers for that session and retains them only in memory, bounded
by the session expiry. One-use reveal authorizations copy only the selected
derived buffer; logout, session expiry, key mutation, and runtime close revoke
and zero the applicable buffers. Neither the login password nor the unlock state
is persisted. The per-request ceiling is the model's context window --
1,000,000 tokens for both configured models, derived from
`AUTOMATION_STUDIO_DEEPSEEK_MODEL_LIMITS` as
`AUTOMATION_STUDIO_LLM_ABSOLUTE_MAX_TOTAL_TOKENS_PER_REQUEST` -- and the session-key
profile is that whole window: 992,000 input tokens, 8,000 reserved for the reply
by default, 1,000,000 total. No request sends a reply cap (`max_tokens`): the
user's order of 2026-10-03 (t254) removed the 2,000-token cap on build decisions
and judges and the 8,000 one on everything else, so the provider's own maximum
applies and the 8,000 is only what this check sets aside. A request whose estimated input plus reserved output exceeds the
window is refused before it is sent, never trimmed:
`llm_budget.input_limit_exceeded` or `llm_budget.request_total_exceeded` from
the harness, and `llm.provider_input_budget_exceeded` from the DeepSeek adapter,
each stating the estimated input tokens, the bytes and the window. The build's
spend is bounded by the Flow creation's one purse, not by the window; see
[One purse per Flow creation](#one-purse-per-flow-creation).

The API failure boundary is cross-bundle-safe without trusting JavaScript class
identity. It recognizes only the canonical error name and message paired with a
diagnostic accepted by the strict public diagnostic parser, reconstructs the
response message from the parsed code, and returns only allowlisted fields.
Malformed, spoofed, or unrelated errors receive a fixed unclassified failure
message; raw thrown messages and response data are never returned. The service
attributes ordinary failures to pre-provider validation, provider resolution,
provider request, provider-output validation, post-provider validation, or
persistence. Only phases after a successful provider response carry its bounded
request/usage accounting; call and response states remain conservative when the
harness throws unexpectedly. Deterministic pre-provider gates use a closed,
public reason-code taxonomy for invalid input, blank-target requirements,
canonical settings binding, pending adaptations, active
instructions, node-catalog availability, and required capabilities. Provider
resolution separately distinguishes an unavailable resolver, resolver failure,
and malformed resolution. The parser rejects known reason codes paired with a
contradictory stage, retryability, call state, response state, or pre-provider
accounting.

Provider-output validation distinguishes a valid envelope whose completion was
cut off by the configured output-token limit
(`flow_bootstrap.provider_output_truncated`) from malformed media, JSON, or
envelope structure. A length stop containing only empty or whitespace padding
uses the narrower `flow_bootstrap.provider_output_padding_truncated` code;
substantive partial content retains `flow_bootstrap.provider_output_truncated`.
Both are received, non-retryable results of the call that was made. Diagnostics
expose only the closed reason code and bounded accounting, never provider
content.

Evidence-guided Bootstrap completion uses a separate self-contained,
reference-free schema while retaining the canonical public Bootstrap plan
shape. This avoids dangling local references when the plan schema is nested
inside an evidence decision. The evidence completion is held to a
240-character summary, four Subflows, eight Router rules and sixteen parameters
per node; how many nodes and edges it may carry, and its UTF-8 byte budget, come
from the Flow's size setting (see "Flow Size" below). Its
instruction asks for one primary Subflow with Router fallback by default and
permits extra topology only when the active instruction requires it. Core
rechecks these bounds after parsing and before registry validation. No path
cuts the catalog: the one-shot path sends it whole, and an evidence decision
sends every node by name plus the definitions it asked for (see
[The catalog an evidence decision is shown](#the-catalog-an-evidence-decision-is-shown)). A representative routed three-action web plan is
1,110 bytes (370 tokens under Core's conservative estimator), so the 4,000
output-token limit remains unchanged.

A completed candidate is checked while the model can still correct it. Every
check a completion must pass runs as the evidence loop's completion check,
`checkAutomationStudioFlowBootstrapCompletion`
(`runtime/llm/harness-options/bootstrap-completion.ts`). The checks run in this
order. Checks 1 to 5 refuse, each with its own code: a plan that cannot be
built at all cannot run. Checks 6 and 7 are information, not refusals (user,
2026-10-01: no restriction on what the model does beyond the permission
gates): what they find travels on the accepted verdict as `notes`, and reaches
the judge of the build's test as `buildTest.notes`
(`runtime/result-verification/build-test/`). A replayed list read's observation
also carries `readRows`: the labels of the rows it returned and, per condition,
the rows that condition alone left out, screened by the same function as the
runtime judge's `leftOutOnlyByThis` (`build-test/read-rows.ts`), so the judge
can see an asked row was dropped (live run `run-muqk713g`, cause C3), and,
where the replay sent them, the rows two or more conditions left out together
(`leftOutTogether`, t655), each set by condition number and name. A test
stores nothing itself, so `buildTest.stores` says what the Flow would store:
each dataset its steps' record outputs write, in Flow order, with the write
mode, the steps, the rows those steps' reads returned in the test, every label
in storing order and the labels stored more than once (`build-test/stores.ts`);
Core's observation of the test leads with that count ("30 records would be
stored"), which is what the check's card says, and the judge is told to judge it
as the result (t274, live run `run-muw60j7c-bb7c9a62`, C-3: told the test
"stored nothing", both judges passed a Flow whose two reads appended 20
unfiltered rows and 10 filtered ones to one dataset, 3 of them twice). Since
read-list stage S1, assembly gives every read a dataset of its own
(`<slug>-<stepId>`), so two reads no longer share one by accident. These
counts are the rows collected, one answer per pass of a repeated read, not
the answer a run keeps: a run processes each dataset when it ends (default
whole-row dedupe, then the record output's `process`; see
[record outputs and run-end processing](../automation-studio-native-nodes.md#record-outputs-and-run-end-processing)),
and the run-time judges read that answer, but the build's test does not
process yet. Nor does `stores.ts` yet know the Repeat node a do-while writes
between the steps' nodes, so it finds no writing step from the first such
loop on. Stage S3 (not done) makes `buildTest.stores` process the test's rows
with each read's `process` and report the answer and its account. Both
kinds of judge are also shown `leftOutNamingTheItem`
(`runtime/result-verification/request-rows/`): rows one condition alone left
out, tested on the row's own label, whose label names first the request's phrase
every kept row names first and another request phrase only after it -- by their
own words the item asked for, sold with something the request leaves out. A
`yes` that does not name each of them, by a distinguishing label prefix or an id,
is not taken: Core reads it as `does_not_answer` with a finding
(`result.left_out_naming_the_item`) and fix lines naming the condition and the
rows (C-2: both judges said yes over three pairs "with Wireless Charging Case").
Every `no` carries `repair.checked`, Core's lines on the rows the judgement
names: a row it calls left out that is in the result, and the rows a condition
it blames really left out alone. A build's judged-wrong round and the
re-author's brief both carry those lines, and the brief's step 3 says advice
resting on a row Core lists as in the result is not followed (C-5: the result
judges said the Plus condition left out two rows that were stored, and the
re-author followed that and discarded the exact answer it held). A
changing step the test ran again carries `observed` too when its answer says
what it changed or what the page answered (`changed`, `notice`), without the
answer's `ok`, `said` and any code the outcome already gives; an answer with
neither is not sent (`build-test/observation.ts`, `build-test/summary.ts`), so
the judge reads what a replayed press did (t193 round 1003: run
`run-musp4h2f-72e8ed99`'s judge never saw the quantity its "+" set). Its
`changed` lines are bounded before the screen: at most three, each cut to 160
characters, the lines quoting the step's own words first, then a text that now
reads otherwise (where a quantity or a total is said), then the rest, with
`changedNotShown` counting the others and the domain's own `and N more
changes`; a credential-shaped line is dropped as withheld
(`build-test/change-lines.ts`, t174-w106: run `run-musp8nz1-dbd3905a`'s judges
saw a press that un-chose Space Grey and the one that chose it again as two
`replayed`). The judge is also told that the test started from a page that kept
what exploration did, so a count, a cart item or a collected coupon may predate
the test, and a withheld step's visible effect is exploration's doing, not proof
the Flow does it (`runtime/llm/diagnosis-instructions.ts`; the same run's judge
cited exploration's "3 Cart" as the Flow's result). A judge
reply that leaves a diagnosis text empty (`changed: ""` beside a yes) has that
field read as omitted, not refused (`runtime/llm/harness/provider-result.ts`,
cause C2). A diagnosis text (`expected`, `observed`, `changed`) past its
500-character bound is read whole, with a warning
`llm_output.diagnosis_text_past_bound` naming the field; the verdict and the
other fields stand, and only a text that is not a string is refused. Until
t665 it was clipped to the bound, and Core weighed the clipped copy: on A8
`run-mvam0lys` a judge's real reason lay past the cut and Core labelled the
whole reading contradicted. It used to void the whole reply: live run `run-murwcmx2`'s
second judge call answered a clear `no` with a 581-character `changed`, and the
refutation was recorded as unconfirmed (t194 cause C-A). The bound stays 500 in
the instruction and the output schema. When the judge's two calls do not settle
(`model_disagreed`, `model_unconfirmed`) but one of them judged the test not to
do what was asked, that call's expected, observed and advice travel on the
unsettled verification as `unconfirmedReading`, on the build's `unknown`
verdict, and into the repair's judgement as `judge.unconfirmedReading`; the
repair is told it is one judge call's reading the second check did not confirm,
to act on where the rows and the test bear it out (cause C-B). It is never a
failure record or a repair directive: an unsettled runtime verification still
does not fail a run, and the reading is not recorded on run records. The judge's verdict on what the
test actually did decides, and a wrong result is repaired with its reasons. The
instructed-act check that follows is information the same way, except
`act_consequence_undeclared`, which is what makes a delete, a payment or a send
get asked, and `step_is_optional` on an act or choice whose only step is marked
optional: the Flow carries on when that step fails, so the act may never be
done, and one passing test does not show it always is
(`runtime/flow-bootstrap/instructed-acts/optional-only.ts`, issue
`bootstrap.instructed_act_only_optional`; run `run-musq0b1m-0472cfa0`, Cause 5,
where the 7-in-1 press was made optional on a false premise and both judges
passed it because it "was replayed"). A step made conditional with `only_if` is
not optional and is not answered, and a step that only arrives is answered
`step_only_arrives` instead, read with the host's declared arrival as the
restore reads it. Both rules share one `missingActs` account, and each optional
entry carries `said`, the sentence the judge of the build's test also reads in
`buildTest.missingActs`.

1. The `{summary, plan}` envelope: `flow_bootstrap.evidence_completion_wrapper_invalid`.
2. The plan's structure: `flow_bootstrap.evidence_completion_plan_invalid`.
3. The tighter evidence completion profile:
   `flow_bootstrap.evidence_completion_profile_limit_exceeded`.
4. The domain's resolution of each node's parameters:
   `flow_bootstrap.evidence_completion_parameters_unresolved`.
5. Registry validation: `flow_bootstrap.evidence_completion_plan_invalid`.
6. Whether the Flow could answer the instruction at all: a note with code
   `bootstrap.cannot_answer_instruction` and the requested `columns`.
7. Whether the Flow could reach the place it starts: a note with the start
   location it `starts` from.

Check 6 is the only one that reads the instruction rather than the node library,
and it is what stops a build proposing a Flow that cannot produce what the
sentence asked for. Four live builds against one instruction — every pair of
wireless earbuds matching three conditions across every page of results, as a
table with four named columns — proposed four different Flows as finished, one
of which navigated twice, typed three times and read nothing. Checks 1 to 5
confirmed all four parsed, resolved and validated.

`flow-bootstrap/answerability/` answers it from the plan and the active
instructions' own text, with no provider call on any path. It reads what the
instruction asks to be given back from a short list of unambiguous words
(`records`, `rows`, `columns`, `as a table`, `scrape`, `extract` and a few
more), and notes only where the instruction plainly asks for a set of records
and no step of the Flow produces or saves one — a step whose definition declares
where its own result keeps rows, or one whose record output names a dataset. It
judges capability, never a chain: a Flow that reaches a search by URL rather
than typing into a field is accepted, as is an extraction that may find nothing,
because whether what it found answers the request is the finished run's
verification to judge. Two cases are left alone outright: an instruction that
asks for no records, and a node library that registers nothing returning rows of
its own, where a refusal would ask for a node that does not exist.

Check 7 asks the other question none of checks 1 to 5 asks: not whether the Flow
could answer, but whether it could run. `run-muht9lpw-a39aa056` built a Flow of
one node — a single list extraction, with no navigation anywhere in it — and
replay failed before its first step with `Cannot access contents of url
"about:blank"`. Its exploration had navigated, dismissed the page's
interruptions and read the list; the amendments that followed reduced the draft
to the reading alone. An extraction on its own satisfies answerability, because
a step that returns rows is present; it simply has nowhere to do it.

`flow-bootstrap/reachability/` answers it from the plan and the start location
the build was given (`flow-bootstrap/start-location.ts`), with no provider call
on any path. It notes only when all three hold: the build was given a start
location, the plan holds at least one step that acts on the bound domain's own
target — a node the domain registered, or one of Core's told to dispatch a
domain output — and no step of the plan carries where the Flow starts. Core
never parses a start location, so "carries" is a text comparison and a loose
one: a value counts when it agrees with the start location from the first
character for twelve characters, or for the whole of it when it is shorter, so
the site's front page, a deeper page and a neighbouring one all count. This is
the plan-side statement of the rule the bound domain already enforces while a
build explores — the node that goes to the start location is also the Flow's own
first step, because the Flow is built from the steps that ran — so a Flow refused
here could not have run under the rule its own build ran under. Three cases are
left alone outright: a build given no start location, which begins already
there; a Flow of Core nodes, which touches no target; and a node library that
registers no node which can be told a destination, where a refusal would ask for
a node that does not exist.

A refused completion is not the end of creation. The loop adds feedback to the
evidence the model sees next, and asks again. The feedback holds the refusal
code, at most 16 issue codes with their plan paths, and a fixed instruction to
correct them and to name observed elements by handle. A refusal under check 6
carries instead what the instruction asks for, the person's own sentence asking
for it, the columns they named, and the Flow's own steps, with an instruction to
run the step that returns rows and finish again. A refusal under check 7 carries
where the Flow starts and the Flow's own steps, with an instruction to run the
node that goes there and keep it as the first step. The refusal counts as an
unusable decision and spends one of the loop's decisions. Repeated unusable
decisions stop that live round; on the build path the phases coordinator
receives its progress instead of publishing the former bare
`flow_bootstrap.evidence_unusable_decision`. A partial Flow is tested, judged
and repaired; an empty Flow explores again while budget remains. Unreadable
replies have their own counter, described below. A completion the check accepts
is tested before its Flow can be persisted.

**An unreadable reply is asked again, never a bare ending (t211).** A reply that
arrived and could not be read (`llm.provider_malformed_response`, a truncated
or oversized reply, output that is not the decision object) has a count of its
own and never moves the no-progress guard. It is asked again with the same
context and a `core.decision_check` note saying what could not be read (the
reply's case from `runtime/llm/reply-account.ts`, in words) and how many in a
row stop the build; it is paid for and counted in the budget. Six in a row end
the round `llm_evidence_loop.unreadable_replies`, and the build ends
`flow_bootstrap.model_replies_unreadable` with an `ending` message saying so,
how many tries it took, what of the request the Flow already does and whether
the Flow so far was kept (`runtime/llm/unreadable-reply.ts`,
`runtime/flow-bootstrap/unfinished-build/replies-unreadable.ts`). A reply that
was read but is no decision the iteration offered -- a shape the grammar does
not read, finishing before finishing was offered, editing the draft when that
was not offered -- is refused as `llm_evidence_loop.decision_shape_invalid`,
`complete_not_offered` or `amend_not_offered` and asked again like any unusable
decision, rather than ending the loop `invalid_decision`
(`runtime/llm/evidence-loop/decision-refusal.ts`). An `amend_draft` left with no
amendment because a rerun in it carried no `input` is refused as
`llm_evidence_loop.rerun_needs_input` instead, whose feedback says a rerun needs
input -- the parameters to change, or `{}` to run the step again as it stands
(t194-w78, `runtime/llm/evidence-loop-decision.ts`): live run
`run-musp39u8-9ac026ab` spent eleven decisions on such a rerun under the plain
shape text, which never named the missing input. The rule that drops the rerun
stands, and an `amend_draft` with other readable amendments is not refused.

**The model authors the draft (user, 2026-09-30).** A step the loop runs is
appended as `taken`: evidence, not a step of the Flow. It enters the Flow only
when the model adds it, either with `add: true` on the tool call that runs it
(no extra decision) or with an `add` amendment naming its step (`to` places it,
`act` names the act it does). Drop, exploratory, reorder, rerun, repeat,
only_if, on_failed and optional edit the authored Flow as before. A rerun's
`input` is a JSON merge patch over the argument the step ran with -- only the
keys that change; a list replaces whole and `null` removes a key -- because the
long free-form whole arguments it used to carry were the replies that came back
unreadable (`runtime/llm/evidence-loop/rerun-input.ts`). A rerun that
worked takes the replaced step's place: its position, its membership, its acts
and its routing, and every routing statement naming the old step is rewritten
to it (`runtime/llm/evidence-loop/rerun-replacement.ts`). No other step's
number changes: the replaced attempt stays listed as the receipt of what was
replaced, at the end of the draft, carrying `replacedBy` (the rerun's id); the
draft entry shows it as `replacedBy: <step number>` without the argument it ran
with, and an amendment or rerun naming it is refused `not_a_kept_step` with
`replacedBy` and a `next` naming the step that replaced it
(`runtime/flow-draft/amendment/replaced-attempt.ts`). The receipt used to sit
just after the rerun, so every later step moved one on and its old argument
read as a step still to fix: live run `run-musp474o-e0ed7432` reran such a
stale listing three times and its round stopped short (t195-w41). The draft entry's
guidance says so, and the Flow is assembled only from added steps. The loop
option `draftAuthoring: "transcript"` keeps the old rule, under which every step
that ran was `kept` unless withdrawn; it exists only to replay builds recorded
under that rule (`runtime/llm/loop-configuration.ts`, `runtime/flow-draft/step.ts`).
A step may also be written rather than run (`core.run_node` with `write: true`),
and its values bound to a Flow input or a loop's row (`amend_draft bind`): see
[Flow Authoring](flow-authoring.md) (t252).

**A step added to the Flow brings the way to its page (t174/F41).** When a step
joins the Flow -- `add` on its call, or an `add` or `keep` amendment -- every
step since the last step in the Flow that the model took without deciding
about (`taken`) and that changed the state joins with it, because the step ran
on what they left (`runtime/flow-draft/opener.ts`, `runtime/flow-draft/path-to-step.ts`).
The walk back passes over a look and a call that did not work (even where the
page went on loading under it), and over a step that changed nothing or has no
states; it ends at a step in the Flow or at one the model dropped or called
exploratory. A detour -- a stretch that came back to a state already seen on
the way, such as a listing opened and left again -- is left out; the state a
step left and the state the next one found are compared as one moment, because
a page can go on changing between two calls. Until t174/F41 the rule brought at
most two steps back: live run `run-muqk4u32-0b36e58f` added 7-in-1 on an item
page reached by a ×, a search, a listing in a new tab, a consent and a colour;
the colour and the consent were kept and the rest were not, and two dry runs
ran the item-page steps on the home page. For the same reason a refused dry
run, given the draft, names the taken steps that changed the page on the way
to its first `unreproducible` step and are not in the Flow (`notInFlow`:
"Steps 3, 4 and 5 changed the page on the way to step 6 ... add them",
`runtime/flow-draft/dry-run.ts`).

**Each step names the control it acted on (t174/F33).** A step's `input` names
a control by the token the domain minted for it, a handle on the web, and a
token says nothing once its page is gone: live run `run-muqiho5c-e830ce01`
pressed "Not now" (t1082), then added that step as its add-to-cart act from a
draft showing only `input: {target: {handle: "t1082"}}`, and completed with an
empty cart. A call's draft statement may therefore carry `control`, the words
its own outcome showed for what it acted on; the draft step keeps it and the
draft entry prints it beside `input`. It is absent where nothing was acted on
(a look, a navigation) and on a refusal. It is page text, so it crosses the
evidence boundary as a permission request's control name does: read only on
the execution-result parse path, carried only when the call's own evidence
showed those words, plain (no control characters or `<>`), and cut to 120
characters; anything else is withheld, never refused
(`runtime/flow-draft/control-words.ts`). It is never a parameter: the Flow is
written from `input`, `ranWith` and `settings` (`runtime/llm/node-tools/draft-step.ts`).

**A step that answered an interruption is optional (t174, case 2 of t174-w60).**
A call's draft statement may also carry `interruption: true`: the host saw the
call answer something standing in front of the page -- a dialog, a consent
wall, a covering popup -- that was gone after it. Only `true` is carried; any
other value is withheld, never refused. The draft step keeps it, and a proposed
step that says it, claims none of the instructed acts and has no routing of its
own is wired as `optional` when the Flow is written
(`runtime/flow-draft/interruption.ts`, `runtime/flow-draft/sometimes-present.ts`,
`runtime/flow-bootstrap/authoring/draft-routing.ts`): its failure reaches the
join the next step runs from, so playback skips it on a visit where the site
remembers the answer. The test from the start passes over its failure the same
way. The stored draft is not rewritten, and a step that does an instructed act
is never made optional.

**Each step records the page it started on and the page it left (t243).** A
run that meets a step it cannot run continues at the node whose expected
pre-state matches the page, so the build records each step's pre-state as it
sees it. The build's routing (`runtime/route-state/build-routing.ts`) keeps,
for every call that reports the digest of the page it left
(`stateDigests.after`) and that page's route state, the host's signature of the
state (`signRouteState`) under that digest; the free first look counts the same
way. A draft step's `stateBefore` and `stateAfter` digests then name its route
signatures: `before`, its expected pre-state, and `after`. They ride the plan
node (`routeSignatures`) through validation, which apply repeats and compares
byte for byte, to the Flow node's metadata under `routeSignatures`
(`runtime/flow-bootstrap/adaptation.ts`). They are keyed by digest rather than
by call id because call ids repeat across repair rounds -- `initial.<tool>`
opens every round -- while a digest names the page itself, and a step's
`stateBefore` is the previous call's `stateAfter` whenever nothing moved the
page in between. A host that signs no states records nothing, an observation
made outside a call has no digest and maps nothing, and a plan the model wrote
itself has any `routeSignatures` dropped before it is read: they are
Core-derived only. Steps also record their **effect**, what they did to the
page: the routing keeps the full route state of the page the newest call left,
with that call's `stateDigests.after` -- one state in memory, never more -- and
for a call whose `stateDigests.before` equals that digest, whose `after`
differs and that reported the route state it left, keeps the host's
`signRouteEffect(previous state, left state)` under the pair of digests. The
web domain reports both digests on an action (its read before acting and its
read after, `withCallStates`). A step's signatures then carry `effect` for its
own `stateBefore` and `stateAfter`. A look (equal digests) records none, nor
does a call that started on a page the previous call did not leave, a call
after one that threw, or a host that records no effects. A run reads the
effect for a step it cannot run, to pass over a step the site already did
(`../automation-studio.md`, "A step that cannot run continues where the page
is").

**A step the build acted on also carries its effect from the domain (t447).**
The candidate path has no build routing to sign a step with, and the model's
own `routeSignatures` are dropped, so until t447 a candidate's steps reached
the Flow with no signatures at all: in the same browser session a coupon the
build collected stays "Collected", the step's saved control ("Get coupons",
t442) is not on the page, and the run failed a step whose act was done. Only
the domain knows which act a handle's control came from, so its answer to
`resolvePlanNodeParameters` may carry `effect`: what that act made true, in the
host's own route-effect form (`signRouteEffect`) and within a signature's
2,048-character bound (`automationStudioReadRouteSignature`); anything else
refuses the node as `bootstrap.parameter_resolution_invalid`. Core accepts it
on any resolved answer, candidate or draft, and writes it onto the plan node as
`routeSignatures.effect` where the build signed no effect of its own: an effect
signed from the step's own pages stands. A fact's answer keeps none
(`runtime/llm/harness-options/plan-parameter-resolution.ts`). From there it
rides validation and `adaptation.ts` to the Flow node exactly as a signed one
does. An effect only ever skips a step: state routing goes on along the step's
own success edge when the page shows it (`effect_holds`), and the repeated-act
guard never sends a run back to a completed lasting act because of one. A
build test's check of a step carried from a Flow node sends that node's
recorded effect with it (`effect` on the `replay: "verify"` call,
`runtime/llm/node-tools/replay.ts`), and a host that finds it on the page
answers `present` whatever the control now reads.

**The instructed acts are the model's checklist from the first decision**
(audit A1, cause 1). The draft entry carries `acts`: each lasting act the
instruction asks for, in the person's words, with `done` naming the step of the
Flow that does it or `todo` saying why none does yet. It is computed each
decision by the same rule the completion check applies
(`runtime/flow-bootstrap/instructed-acts/checklist.ts`, `check.ts`
`automationStudioInstructedActStepFault`), is carried whole and never trimmed,
and is shown even before any step has run. A step added with `act` is the
model's claim for that act, so a completion need not name it again; a claim in
the result names a step by the number the draft shows. The standing decision
instruction says a Flow is ready only when every act on the checklist is done.
Each act includes its requested choices (quantity, size, colour or version),
with their own `done` step or `todo` reason. A claim such as `act: "a2.quantity"`
adds the step toward that choice; completing the parent act alone does not
complete its choices. A choice made by a step positioned after the step that
does its act stays done but carries `afterAct` and `afterActSaid` (the act ran
before its choice), and the check's verdict lists it under `choicesAfterAct`:
information for the model and, through `buildTest.checklist`, the judge, never
a refusal (`runtime/flow-bootstrap/instructed-acts/choice-order.ts`). When the
two steps' recorded domain places differ, the feedback asks the model to review
the act claim or a legitimate change after the act rather than prescribing a
reorder ahead of the place containing the choice's target. Places are compared
opaquely; absent place evidence preserves existing advice. Whole-Flow testing
and judgement still decide completion.

**Progress means the Flow advanced** (audit A1, cause 2). A call that applied
an effect is no longer progress by itself: one that leaves a state the build
has already been in (its post-call digest, for the life of the loop, across
tools) is a step without progress, and so is a completion refused for the same
issues over the same proposed steps, even after calls between. What clears the
guard, besides new evidence, is the authored draft advancing: a step entering
the Flow for the first time, or fewer acts undone than ever before
(`runtime/llm/evidence-progress/authored-progress.ts`); a step toggled out and back
in is not new. A redirect names the acts still undone (`actsMissing`) and the
step to take next.

**A continued build carries no start location on its calls.** Its draft
already reached the start in the build it continues, so Core does not tell the
domain to hold it there: exploration carries on from the page as it stands
(`runtime/service.ts`, the harness registry built for a continuation).

**A round that stops short is not a silent build ending (t208).** The
coordinator in `runtime/flow-bootstrap/unfinished-build/phases.ts` tests a
partial non-empty Flow from its start with the same deterministic gate, judges
it against the checklist, and seeds a live repair with that Flow and judgement.
Where that test ran clean and the completion check accepts the Flow, the
build's judge is asked about it instead (see "A round that stopped short is
judged too" under "One purse per Flow creation"). An empty Flow has nothing to
test and explores again from the live page while budget remains.

**Repairs are bounded by money and progress, not by a count (t240).** Another
round opens only when both hold:

- **The purse can fund it** (t254, `unfinished-build/round-funding.ts`). It must
  hold the judging of its Flow -- two judge calls, since a first answer is
  confirmed or asked again, each at the largest judge hold priced (or, before
  any, at a judge's standing allowance of 8,000 input and 1,250 reply tokens) --
  and the least its first decision can be held at, its 750-token reply reserve
  with no input. The first decision itself is priced from its own request when
  it is sent; it used to be held at the previous round's last decision, though a
  repair starts from a fresh window and every first repair decision recorded was
  smaller. A build that cannot fund the round ends `budget_exhausted` (`cost`),
  saying what was left and what the round needed (run 38, cause C7; murzln6g).
  A provider that does not price leaves nothing to project, and only an empty
  purse stops the round.
- **Judging is kept back while the build explores** (t254). With a judge, the
  purse keeps that judging pair back from every call that is not a judge's
  (`AutomationStudioLlmBuildPurse.keepBackForJudging`): a decision that would fit
  only by spending it is refused, the refusal and the cost ending name it
  (`keptBackUsd`), and the loop's count of what is left takes it out, so the
  model wraps up while the finishing decision and its judging are paid for. The
  reserve is never charged as such. A round stopped because a call would have
  eaten into it spends it testing and judging the Flow as it stands, and
  finishes the build on a yes about that Flow (t254 stage 2), unless that Flow
  is unchanged since a judge of the build said no to it (stage 3; see "One
  purse per Flow creation" below).
- **The round before it measurably progressed** (`unfinished-build/progress.ts`),
  by what the test and the judge report. That means more acts or choices with a
  step, or more of them proven by the test; a test that now runs clean, or fails
  at fewer steps; with no judge, more steps that worked; a round that finished
  and was judged where the one before stopped short; a Flow judged where the
  one before was not judged either way (`judged_after_unjudged`: the judge was
  unsure, did not run, said yes about another version of the Flow or about no
  test, or carried steps never ran); a judge whose two calls now split where the
  round before was refuted (`judge_no_longer_refutes`: one call said yes, so the
  `no` no longer stands; the build-test verdict carries `oneCallSaidYes` for that
  pair only, and a `no` followed by an unconfirmed pair with no yes is not
  progress); or a judge finding no longer reported. It also counts what the judged test
  stored: the build-test judge returns its summary's stored, refused and
  missing-required row counts on a `no`. Progress there means rows stored where
  none were, or fewer refused or incomplete rows while no fewer are stored. A
  merely different Flow is not
  progress: the earbuds build `run-muqiho7e-13be6c03` handed back three
  different Flows, and the judge reported the same thing each time.

A round that did not progress ends the build `not_finished`, saying what stood
still; one more round is allowed after a judge who said no, still achievable or
unsure, and named the fix, and two in a row end it. So does a round that ended
on refused repeats (`repeat_without_progress`) and handed back the Flow it
started from: a second round would only repeat it (run 38, cause C8). Only the
judge's word that what was asked can no longer be had ends a build `not_doable`
(t195-w37).

The words of every unfinished ending have one owner (t264 S3, merging t193
round 1003 and t195-w48), and read as a chat answer, never a debug log:

- **No internal words** (t195-w48). The person never reads "decision",
  "model", "round", "no measurable progress", "(1, as before)" or "handed back".
  The not-finished ending opens "I have not finished this Flow yet." and then
  "My last attempt to fix it got no further than the one before: ..." (or "My
  last N attempts ... each ..."), listing what stood still in plain clauses
  ("the Flow came out exactly the same", "3 of the 3 things you asked have a
  step, no more than before"). What was tried is "I worked on it live twice:
  first exploring the page, then fixing it once after testing what I had"
  (`automationStudioFlowBootstrapWorkedLiveSaid`, `unfinished-build/not-done.ts`),
  shared with the not-doable ending; the counts a debug needs stay in the
  ending's `tried`. The stop clauses (`STOP_WORDS`, `BLOCKED_WORDS`) name "it",
  never "the model". The budget ending says what was tried with the same
  sentence, then what held it up as its own sentence; the unreadable-replies
  ending says "the replies it got back could not be read", gives the count with
  no round, and says what was tried only when more than one live round ran. The
  kept sentence is "The steps I found so far were kept as a draft, so building
  again carries on from them." (`unfinished-build/kept-said.ts`). A budget
  ending stopped by the call limit still names that limit "model calls".
- **Each judge pair said as what it was** (t193 round 1003). After a `no`, a
  split with one yes is "the judge no longer agreed it was wrong, as one of its
  two checks said it does what you asked"; an unconfirmed pair is "the judge
  could not tell this time whether it does what you asked, though it had found
  the attempt before wrong"; "the judge still could not tell" only when it could
  not tell the time before either; an unsure judge before a `no` is "the judge
  now found it does not do what you asked".
- **The judge's doubt named.** An unsure judge's `unconfirmedReading` is said
  where a `no`'s advice is, as a doubt one check did not confirm ("What the
  judge doubted, in one check the other did not confirm: ..."), never as a
  finding.
- **Said once.** How much of what was asked has a step and what the last test
  found are one sentence (`automationStudioFlowBootstrapProgressAndTestSaid`,
  used by the `not_finished`, `budget_exhausted` and `replies_unreadable`
  endings): the test's step count goes into the progress sentence rather than a
  second "not judged" sentence. The not-doable ending leaves out the test's
  sentence where the judge's account already says the Flow was tested and not
  judged to do it, and the budget ending does not say a judged-wrong stop again
  as "what held it up".
- **Never cut inside a sentence.** Each ending is fitted to the ending's limit
  (`unfinished-build/ending-fit.ts`): the still-to-do list, its quotes and the
  judge's words are said with less room until the message fits, and the closing
  sentences (what was tried, what was kept) are always whole.
- **A split judge in a build's words.** Where an ending or a repair heading
  quotes a split judge's reason, the run's closing sentence ("the run is not
  marked as failed for it") is replaced by the build's ("the build cannot finish
  on this test", `automationStudioFlowBootstrapUnsettledForBuild`,
  `AUTOMATION_STUDIO_RESULT_UNSETTLED_WORDS.<basis>.build`).
- **The chat line under the ending** (`runtime/conversations/commands/create-here.ts`)
  is one plain sentence: `The Flow "<name>" has no steps yet, but it keeps your
  instruction, so you can build it again.` when nothing was kept; `The Flow
  "<name>" keeps your instruction.` under an ending that already said the draft
  was kept and that building again carries on from it; and, with no ending,
  `The Flow "<name>" keeps your instruction, and the steps found so far were kept
  as a draft, so building it again carries on from them.`

For an extend build's first
round, `runtime/service.ts` passes the replay signature of the Flow that
round starts from as `seedSignature`: the extended Flow's seed, or the kept
draft a continuation carries on. Six live rounds stay the backstop, since the published
record's reader is bounded by it. Every round draws on the Flow creation's one purse and
shares the build's time/token budget and declared call count; no round has a
cost share of its own, and the per-round decision backstop starts afresh.
A permission or person-needed question takes precedence over another round.
A build that ends without a Flow records why each round stopped and, for "not
doable" and "not finished", which case left no route, as closed words on its
ending's `tried`
(`stops: [{round, stopped}]`, `noRoute: {kind}`, `unfinished-build/tried.ts`);
a re-author attempt keeps that ending (`service/runtime-adaptation/reauthor-build.ts`),
so a debug can tell which bound ended which round. A rerun of a draft step says
where it ran (`rerunPlace`: put back to its start page, or in place and why,
`runtime/llm/node-tools/step-place.ts`).

A re-author's rerun starts where its node started. A re-author seeds its draft
from the Flow, and a step carried from the Flow records no `replay.from`, because
the build never ran it, so its rerun used to run wherever the refuted run had
left the target: in live run `run-murwcmx2-a1c6edf7` the rerun of the Flow's list
read ran on results page 5 and read 11 records from 1 page (t194 cause C-D). The
host may state, on each state snapshot, its own reset token for that state
(`AutomationStudioHostStateSnapshotRef.from`, the same token as a step's
`replay.from`; the web writes `{ location }` only when the address holds nothing
the evidence packet withholds). The re-author build reads each node's first
`before_action` token off the refuted run (`llm/node-tools/run-start-pages.ts`,
called in `service/runtime-adaptation/reauthor-build.ts`); the extend seed keeps
them beside its steps as `startedOnByStepId`, not in `replay.from`, so the
dry-run gate sees the same draft; the loop receives them as `draft.seedStartedOn`.
A rerun of a carried step, or of the step that took its place (`standsFor`), with
no start page of its own is put back there through the ordinary reset before it
runs, and says `rerunPlace: { place: "put_back", startPage: "seeded_run" }`;
with no start page known it runs in place and says `start_page_unknown`.

A repair may not complete the Flow its judge refuted, unchanged (t194 cause
C-C). When a finished round's test is judged `no`, the repair round starts from
that Flow, and its completion check first asks whether the Flow being completed
is that same Flow: the draft's Flow signature
(`automationStudioFlowDraftFlowSignature`) equal to the repair seed's, where the
draft is what the check builds the Flow from (every step a library
`core.run_node` step). Such a completion is the identical retry of a failed act
on an unchanged state, so it is refused with
`bootstrap.flow_unchanged_since_judged_wrong`, with feedback that testing it
again tests the same thing, to change what the judge's advice names, and that a
round that changes nothing ends the build
(`runtime/flow-bootstrap/unfinished-build/unchanged-complete.ts`). It never fires
after an `unknown` or `not_judged` verdict, which refuted nothing, nor for a Flow
built from the reply's own plan. Each refusal is an unusable decision: a model
that keeps completing the unchanged Flow ends its round on the stall guard as
`unusable_decisions`, and the build then ends `not_finished` for no progress
against the judged round, without asking the judge again. In live run
`run-murwcmx2` the unchanged Flow was tested again and one lone judge yes
finished a build its earlier judges had refuted. A repair of a round whose Flow
was not run from its start (`judgement.test: not_tested`) is told exactly that,
and the chat's "Testing the Flow so far" note is posted only when that test will
actually run (causes C-F, UI-4).

A round that could not be measured is never "not doable" (t194-w70). A
re-author or extend build seeds its draft from a stored Flow. Each step it
carries (`f<n>`) has nothing it ran with. An unchanged carried step holds a
scheduled candidate where it declared its consequences or its node need not
(the domain says which on each node definition, `consequenceDeclaration`, read
by `automationStudioNodeDeclarationRequired`; unsaid, it must), with the start
page the repaired run captured where it captured one (t439), and the test runs
it fresh as the Flow saved it. A saved press that declared nothing is never run
blind: the permission gate is asked about an action from its declaration, so
it is listed to be rerun with one. The Merge an optional step joins at is
passed through, and so is an optional carried step the test cannot run as
saved, which is excused as optional and never listed for a live rerun. A change
to an optional saved step that the test never exercised is not saved: once the
build is finished the step goes back to its saved version, the plan is built
again, and the chat says "Kept the saved version of ..."
(`runtime/flow-draft/carried-step/untested-edit.ts`; `runtime/flow-draft/carried-step/`,
t274 C-4: live run `run-muw60j7c-bb7c9a62`'s re-author was told to rerun every
carried step live, the domain refused each rerun of the stored type step,
which names an element and no handle, as `target_not_a_handle`, and five
rounds ended without a test; t439: live run `run-mv4912r9-53b05a51`'s script
-authored Flow declared only its presses and its failed playback never started
the nodes after the failing one, so the gate demanded live reruns of steps the
domain then refused, repair never completed, and the optional notice step was
forced into a press of an unrelated control). Any other carried step -- one
changed since it was seeded -- has nothing to run until it is rerun live. A
round whose Flow still holds one of those is not tested at its
end; its judgement names those steps (`notRunInThisBuild`), and neither `repeated_unchanged` nor
`no_progress` is concluded from it, since there is no measurement to compare.
Live run `run-murwcmx2`'s re-author ended not doable with the advised fix in its
draft, never run from the Flow's start. Such a round is repaired again under the
same money and round bounds; its progress is fewer steps not run, or a changed
Flow, and the announcement says which. The repair's resume names those steps
and tells the model to rerun only them live (`amend_draft rerun`) before
completing. The re-author's brief says up front that the test runs each
unchanged step as the Flow saved it and each changed step with its change, that
a step is changed by rerunning it with the corrected argument, and that only a
step the test names needs a live rerun; its step 5 says a step that needs no
change is left as it is. A stall ending carries the candidates into the next
round (`round-ending.ts`), so the same steps are not listed again. For a Flow that
reads, the brief's step 3 also says that where the check's advice contradicts
"How the read went" -- Core's own account of what the read did, such as more
pages of a read that already read every page there was -- Core's account
stands and that part of the advice is not followed (t194-w78,
`runtime/recovery/refuted-result/brief.ts`): live run `run-musp39u8-9ac026ab`
raised its page bound six times per try and reread the same rows. That
wording, the brief's "a pagination setting", and the rerun-input example of a
stored `maxPages` (`runtime/llm/evidence-loop/rerun-input.ts`) still assume a
read that follows pages itself; under the read-list redesign a read reads one
page and the Flow pages with a do-while `repeat`
([a list that continues](flow-authoring.md#a-list-that-continues)), and stage
S3 (not done) changes these words. If money or the
round limit runs out first, the budget ending says the Flow as it stands was
never run whole and names those steps.

A build's yes is asked twice (t194-w71). The build-test judge's `yes` finishes
a build, so its verification request sets `confirmAnswer`, and a first `yes` gets
a second call with the same evidence (`result-verification/agreement/`). Two
`yes` answers are a yes. A `yes` followed by a `no` is `model_disagreed`: unsure,
carrying the `no` call's expected, observed and advice as `unconfirmedReading`,
which the build reads as `unknown` and repairs with. A second call that answers
`unknown`, gives no verdict, does not come back, is absent, or is refused by the
build's purse leaves the result `unsure` with `model_unconfirmed`. Only an
affirmative confirming verdict can finish a build; uncertainty is not proof of
success. In live run `run-murwcmx2`,
build judges 0032 and 0051 were sent the same request except for one step
number; they answered `no` and then `yes`, and that single `yes` finished the
build on rows the playback judge refused. The runtime result check does not set
the option, and a first `yes` there still stands on one call.

The explicit endings carry `diagnostic.ending.message`, the outstanding
acts/choices and `tried` (rounds, decisions, Flow steps and test verdict).
`runtime/activity/build.ts` and conversation progress use that message:

| Code | Trigger | Message begins |
| --- | --- | --- |
| `flow_bootstrap.not_doable` | The judge of a tested, non-empty Flow said what was asked can no longer be had (`stillAchievable: "no"`) | "I could not build this Flow, and I found no way to:" followed by what the judge found, what could not be done and what was tried |
| `flow_bootstrap.build_not_finished` | A repair made no progress on the round before it, or a round ended on refused repeats with the Flow it started from unchanged | "I have not finished this Flow yet." followed by what stood still, the judge's advice or doubt, how much was done, what was tried and what was kept |
| `flow_bootstrap.evidence_budget_exhausted` | The purse refused a call or could not fund another round (the only cost endings), time, token or declared calls ran out, or the live-round backstop was reached | "The build stopped at ... before the Flow was finished." followed by progress, what blocked it and whether the Flow was kept |
| `flow_bootstrap.model_replies_unreadable` | Six consecutive unreadable replies, each asked again with a corrective note | "The build stopped because the replies it got back could not be read:" followed by the count, cause, paid attempts, progress and kept-Flow status |

Budget exhaustion does not establish that the task is impossible, and an empty
Flow never establishes `not_doable`. Budget and unreadable endings are
retryable; a kept incomplete draft lets the next build continue.

Once drafting has begun and at least one actionable step exists, a provider
decision also receives the Flow-draft beside entry, always whole: every
actionable step in object form, each with the full argument it ran with, and the
full guidance. There is no draft byte budget, no packed row form, no shortened
guidance, no argument withheld or replaced by an `inputTooLarge` marker and no
oldest step counted instead of listed (removed 2026-09-30, with the 4,000-byte
draft cap, the 1,280-byte draft floor and the 512-byte step-input bound). The
trace row's `draft` measurement records its bytes, steps and guidance bytes, and
`budget` equals `bytes`.

From the model's first decision, every provider decision also receives the
decision history beside entry, `core.evidence_history`
(`runtime/llm/decision-context/`). It is one row per decision the loop answered,
oldest first: the initial look; each executed call with its closed result code,
whether it changed anything and whether the tool refused it; each failed call;
each request answered from memory with the call that answered it; each
amendment with its refusals (marked when repeated), the positions of withdrawn
steps that had applied an effect, the iteration an undo returned the draft to
and the step it reran; each completion with the draft revision it was checked
against, its issue codes, the closed codes of the check's feedback and the
steps the dry run refused (or `clean`, `reused_clean` when the gate answered
from an earlier clean replay of the same Flow, by its Flow signature, or
`not_run`); each unusable
reply; and,
beside the rows, each no-progress redirect. Rows hold only closed codes, ids
and integers, never page content or model prose. Identical decisions are
grouped with their iterations and carry `sameAs`, the first iteration the same
decision was made. The entry is always told in full, every row with its full
closed detail; the compression ladder (codes only, folded calls, joined
refusals, least form) and its byte cap were removed on 2026-09-30. The beside
entries follow every evidence entry: `[...evidence, history, draft, budget]`.

These diagnostics retain only bounded provider accounting, the content-free
evidence trace, and, where a plan was refused, at most 16 `issueCodes`. The
trace holds tool IDs, byte counts, effect state, and categorical result codes.
Every build ending retains the trace from every live round, including a
cancelled build, a refused configuration, and cancellation during judgement.
Decisions are numbered across the build; each round's opening observation
keeps iteration zero. Diagnostics use whole-build accounting beside these
rows, including permission and person-needed endings after earlier rounds.
The final round's loop result remains local to that round; its caller uses
the build's accumulated trace when publishing a failure or storing a Flow.

A tool execution may carry an optional `diagnostic` object beside its evidence.
Core copies that object through the execution parser, decision row, persisted
trace and public evidence steps without interpreting the importing domain's
vocabulary. Its transport accepts only a shallow object of code-shaped strings,
booleans, nonnegative integer counts and scalar lists; malformed diagnostics are
dropped while the actual tool outcome remains intact. Shape validation does not
certify that a string is safe: the producer and consuming domain must enforce
their own field and value allowlists before recording domain facts. Older
callers and stored steps that omit the field remain valid. A producer must use
the matching Core build that accepts this optional execution key.

A trace row also carries bounded, content-free convergence facts: the measured
draft shape shown to the decision; build-local draft revisions and stable step
ids; applied/refused/kept amendment counts; page-state changed/unchanged/
unobserved state derived from paired digests; and answerability booleans plus
the closed cannot-answer code. The record never carries the digests themselves,
step inputs, prompt/provider text, page values, selectors, instruction quotes,
or content-derived hashes. These members are observational and do not change
budgets, completion acceptance, amendment behavior, or retry policy.
Draft-shape measurement accepts either the legacy object steps or the exact
`step_rows_v1` format and ten-column declaration. Packed rows must contain seven
through ten cells; a `null` input cell is measured as withheld. An unknown
format, a missing or reordered field declaration, or a malformed row fails
closed instead of being reported as zero omissions. The trace retains only the
existing counts, booleans, and serialized-byte measurement; it does not retain
the draft entry or its step inputs.
A decision that called no tool appears in it as `core.decision_unusable` or
`core.decision_complete`, with the first code that refused it as its result
code, so a build stopped on refused plans says what refused each one. The
diagnostics never include the completion, validation paths, tool inputs, or
page evidence.

Success persists exactly one proposed, reviewable Bootstrap Adaptation bound to
the base dependency digest and settings revision. It does not create or mutate a
Router, Subflow, graph Flow, node, or edge. The return value contains only
project/Flow/adaptation identifiers, proposed status, Core risk, source
instruction IDs, base binding, and sanitized request/token/cost accounting. It
does not return the plan, prompt, instruction bodies, provider credential/key
identity, or secret material. Explicit review and apply are
still required to materialize topology.

Successful DeepSeek usage accounting includes a finite `estimatedCostUsd`:
what DeepSeek bills. As read from DeepSeek's own price list on 2026-09-23
(`https://api-docs.deepseek.com/quick_start/pricing/`), the default model
`deepseek-flash` is served by DeepSeek-V4.1-Flash at a peak cache-miss rate of
USD 0.3 per million input tokens, a peak cache-hit rate of USD 0.006, and USD
1.2 per million output tokens; `deepseek-v4-pro` costs USD 1.32, 0.044 and 3.96
on the same three axes. Core prices per model and at the rate in force when a
call is sent (t254; user, 2026-10-03: "It should be billed at how much it
actually costs"): DeepSeek halves every rate outside 01:00-04:00 and
06:00-10:00 UTC on weekdays and all weekend (`automationStudioDeepSeekOffPeakAt`
in `runtime/llm/deepseek/pricing.ts`), and its cached input is charged at the
cache-hit rate from the usage it reports. A hold before a call uses the rate in
force at that moment with all input uncached. Chinese public holidays, also
off-peak, are not known to Core and are charged at peak. These provider-owned prices are a dated
maintenance input and must be reviewed when DeepSeek changes its line-up or
pricing.

A cache hit costs a **fiftieth** of a miss, not a tenth. Until 2026-09-23 this
document and the constants behind it said 0.44, 0.044 and 1.32 -- figures that
matched no model on the current price list, with the hit rate derived from an
unsourced "a tenth of a miss". Anything that lengthens the cached prefix of a
payload is worth five times what those numbers credited it with.

The cache-hit rate is applied only to the tokens DeepSeek reports it served from
its own context cache, which the adapter reads from `prompt_cache_hit_tokens`
and `prompt_cache_miss_tokens` (or `prompt_tokens_details.cached_tokens`) into
`cacheHitInputTokens` and `cacheMissInputTokens` on the usage summary. A report
whose two halves do not add up to the input tokens is dropped and the call is
priced as though none of it was cached. **Reservations never see the hit rate.**
The run budget reserves against `estimateAutomationStudioDeepSeekInputTokens`,
which measures the bytes about to be sent and knows nothing about caching, so it
still holds back the cache-miss price for every call; the hit rate prices only a
call that has already been made.

Because every decision of an evidence loop is a fresh, stateless request, the
whole of that cache turns on the order of the user message, and
`providerUserPayload` arranges it deliberately: the task envelope, the decision
grammar, the person's instruction, the tool descriptions, the policy gates and
the catalog context (the node names, their note and `describedNodes`) first,
then the evidence window, and the iteration counter last. Everything invariant
is therefore one contiguous prefix, and the window -- which usually only gains
an entry between calls -- extends it. `describedNodes` is the one part of that
head that grows: it is append-only for the length of a build, so a describe
keeps the cached prefix through every node described before it. The order used to
put the counter before the tool descriptions and the catalog, which left 20,341
identical bytes of a 50,840-byte message behind a value that changed on every
call. A key added here must go on the correct side of that line: anything that
varies per call belongs after the evidence.

### One purse per Flow creation

One purse per Flow creation is the only cost authority for a build
(`runtime/llm/build-purse/purse.ts`, `run.ts`). A Flow creation runs from its
first build until a Flow is proposed or a build ends not doable. Every build of
it -- continuations after a budget ending included, with each one's rounds,
test, judge and repairs -- draws from one purse. Ordinary user builds use
the Flow's `maxEstimatedCostUsdPerRun` ($0.25 by default), narrowed by any
explicit resolver/request limit and the existing server maximum. An isolated
test runtime opts in with `FLUXIQ_LLM_RUN_COST_CEILING_SCOPE=test`; only then
does `FLUXIQ_LLM_RUN_COST_CEILING_USD` impose its ceiling ($0.10 when unset).
That test ceiling may only narrow a Flow's settings and never changes stored
or browser UI defaults. An ordinary process ignores the test variable.
The whole build
body runs inside `automationStudioLlmBuildPurseScope`, so reading the
instruction, every decision, the test and the judge are all held against it.

- **The spend outlives a build.** It is kept on a per-Flow creation record
  (`runtime/flow-bootstrap/creation-spend/`, stored as `creation-spend.json`
  beside the Flow by `runtime/service/creation-spend.ts`), carried into the
  next build's purse as `carriedUsd`, and, outside the Lab, cleared when the
  creation ends. In a product run a refuted-result repair during a later
  scheduled run keeps its own run ceiling and never touches the record.
- **In a Lab-scoped run the record is the Flow's one purse (t438).** The
  user's words (2026-10-01): "bring the ceiling down to $0.1 per flow max".
  One purse per Flow: its build, re-authors, repairs and judge all count
  against it, in billed dollars, with no cap on output. Where the run cost
  ceiling is Lab-scoped (`FLUXIQ_LLM_RUN_COST_CEILING_SCOPE=test`), a Flow's
  builds and its runs (`runRuntimeSession`, through
  `service/runtime-adaptation/flow-spend.ts`) run under a second purse, the
  Flow's (`runtime/llm/build-purse/flow-scope.ts`), at the run cost ceiling.
  The harness holds every call against it as well as against any build purse
  (`build-purse/harness-hold.ts`); its spend is the Flow's record read live,
  and each settled call is added to the record as it settles, with a
  compare-and-add the store serializes, so no two additions read the same
  total. So the build and its judge, the chat's reading of the message that
  asked for the build or the run (added when the build or run opens), the
  run's in-run repairs (sized to what the Flow has left at each incident, not
  once per run), its recovery after the run, its result check, its re-authors
  and their re-runs all draw on one ceiling, whether the run succeeds or
  fails. Each pass of a refuted-result repair opens its purse from the Flow's
  record (`recovery/refuted-result/purse.ts`); a ladder already in the record
  joins only the averages. A call the Flow's purse cannot pay for is refused
  unsent and ends its part on the cost bound, as a part's own ceiling does.
  The record outlives the creation, so a later build of the same Flow -- an
  extend after it was proposed -- carries everything the Flow has spent.
  Product scope keeps one purse per creation and a per-run repair purse: a
  product Flow runs on a schedule indefinitely, and a lifetime purse would
  leave every later run with nothing.
- **The Flow's spend is itemised, and readable (t728).** Each call the Flow's
  purse settles is added with `calls: 1` and a phase from
  `AUTOMATION_STUDIO_FLOW_SPEND_PHASES` (`creation-spend/phases.ts`): `build`,
  `read`, `judge`, `runtime`, `reauthor`, `chat`.
  `automationStudioFlowSpendPhaseOf` (`phase-of.ts`) decides it in that order of
  precedence: a judge call (the purse's `onSettled` now says `{ judge }`), then
  the step-log scope's `part` re-author, its `phase` read, its `part` creation
  (counted as build), else runtime. The phase needs the step-log scope, which
  exists only while `FLUXIQ_LLM_STEP_LOG_DIR` is set (every Lab run sets it);
  without it every non-judge call lands under `runtime`. The chat's reading is
  added once when the build or run opens, as `{ phase: "chat", calls:
  interpretationCalls ?? 0 }`: the interpreter counts its priced attempts
  (`pricedCalls`), and the client carries the count as `interpretationCalls`
  beside `interpretationCostUsd` on `generate-flow-bootstrap-adaptation` and
  `run-runtime-session` (a whole number ≥ 0, else refused; an older client that
  sends none records 0 calls, not an invented count). The record gains `calls`
  and `byPhase` (`{ calls, usd }` per phase), always together; `byPhase` sums to
  `spentUsd` unless the record held unitemised spend when itemising began. A
  record never itemised (product per-creation spend, older records) has both
  `null`. `get-flow-spend` (`programs.read`, `read`) takes `{ projectId, flowId }`
  and answers `{ spend: { projectId, flowId, spentUsd, builds, calls, byPhase,
  createdAt, updatedAt } | null }`. Dollars, ceiling and build count are
  unchanged by itemising.
- **Holds price what is sent, with an observed reply reserve (t254).** Each
  call is held at the input its provider will send -- never the packed request,
  which carries the whole node catalog and, since t748, counts toward neither
  the price nor the window refusal unless the provider gives no measure
  -- all uncached at the rate in force, measured at 3 UTF-8 bytes per token plus
  16 framing tokens (densest call recorded: 3.24 bytes per token), plus its reply
  at a reserve: twice the largest reply observed for its kind
  (`runtime/llm/build-purse/build-call-reserves.ts`), 750 tokens for a decision
  or the instruction reading (largest 371) and 1,250 for a judge call (largest
  625). No reply is capped, so a hold is no longer a proof: the ceiling can be
  crossed only by the part of one reply beyond its reserve, and every such call
  is a breach with its overshoot recorded (`AutomationStudioLlmBuildPurse.overshootUsd`,
  the loop accounting's `budgetBreaches` and `budgetOvershootUsd`). A judge
  call's breach reaches the build's accounting too (t254 stage 2): the judge's
  spend arrives as a verdict, so the phases read the purse's breaches and
  overshoot across the judge's calls and add them beside that spend, and a
  build's recorded `estimatedCostUsd` and `budgetOvershootUsd` are what its
  purse charged. Other call kinds are held at their 8,000-token window set-aside.
- **The loop budget does not end a build on cost.** Its count of decisions
  left (`runtime/llm/loop-budget.ts`) reads the purse's figures with no
  held-back decision; it only tells the model what is left and drives the
  wrap-up. The purse refusing a call is the only cost ending, and that ending
  states what was spent (earlier builds of the Flow included), what was held,
  the refused call's worst case, and what the Flow has left.
- **The judge has no cap of its own.** Each judge call is held at its true
  worst case rather than at a share of what is left, and a judge call the
  purse refuses gives a `not_judged` verdict, which finishes nothing: the
  round goes to repair, and a purse that cannot fund that repair ends the build
  at its budget with the Flow kept.
- **The judging reserve is spent judging, never left** (t254 stage 2,
  `runtime/flow-bootstrap/unfinished-build/reserve-judging.ts`). A round the
  purse stopped because its next call would have eaten into the judging kept
  back (a cost refusal carrying `keptBackUsd`) does not end the build with that
  reserve unspent. The Flow as it stands is tested from its start, its test
  handed to the build's judge (`AutomationStudioFlowBootstrapBuildJudge.judgedTest`),
  the caller is asked whether it can build that Flow as it stands
  (`acceptStopped`: the completion check run on the draft, which becomes the
  plan built), and the judge is asked about the test with the reserve its
  calls draw on. A yes about that very Flow (its `flowSignature`) finishes the
  build with it. Anything else -- a no, an unsure verdict, a yes about another
  version or about no test -- ends it `budget_exhausted` (`cost`): the message
  says the reserve went on judging the Flow as it stood and what that cost,
  what the purse had spent after it, what the judge found and says is left to
  change, and that the Flow was kept as a draft. It is never "not doable" from
  here, even where the judge says what was asked can no longer be had: money
  stopped the build, not a judged dead end. An empty Flow, one no replay can
  run, one whose test failed, or one the completion check refuses is not
  judged -- a yes could finish none of them -- and ends at cost as before, as
  does a cost stop that kept nothing back.
- **A Flow a judge said no to is not judged again unchanged** (t254 stage 3,
  `runtime/flow-bootstrap/unfinished-build/phases.ts`). Where the round the
  reserve stopped holds the very Flow a judge of this build last said no to,
  the reserve is not spent: no test from its start and no judge call. "The very
  Flow" is the Flow signature (`automationStudioFlowDraftFlowSignature`) of the
  test that judge judged -- the `no` verdict's own `flowSignature`, or, where
  the verdict carries none, the signature of the finished round's Flow, which a
  `no` is always about -- compared with the signature of the Flow the stopped
  round left. Only a `no` counts: after an unsure or not-judged verdict, or a
  `no` about a test of another version, the Flow is tested and judged with the
  reserve as above. The build ends `budget_exhausted` (`cost`) with the
  refusal's figures; the message says the next call could not fit beside what
  was kept back for judging, and that this was not spent because the Flow was
  unchanged since the judge said it does not do what was asked. It then gives
  what that judge found and says is left to change, and that the Flow was kept
  as a draft. It is never "not doable", even where that judge said what was
  asked can no longer be had. Run murzln6g's repair at peak rates is the case:
  refused its first decision beside $0.0068 kept back, its Flow was still the
  seed round 0's judge said no to, so it ends at cost with round 0's findings
  and makes no judge call.
- **A round that stopped short is judged too** (t195-w42,
  `runtime/flow-bootstrap/unfinished-build/phases.ts`, `reserve-judging.ts`
  with `stopped: "short"`). A round that ended without a completion and not on
  a budget -- refused repeats, unusable decisions, a stall -- has its Flow tested
  from its start as before; where that test ran clean, the completion check
  accepts the Flow as it stands, and the Flow is not the one a judge of this
  build last said no to, the test goes to the build's judge, whose calls draw on
  the judging reserve -- its money and, under a call allowance, its calls
  (t262). A yes about that very Flow finishes the build with it. Any other
  verdict becomes the round's judgement with the judge's account, and the
  repair rules below apply to it unchanged (a judged "can no longer be had" is
  not doable; progress is measured against the judgement before it; one more
  round when this judge named the fix). A `no` here is remembered as the last
  judged-no Flow, so the same Flow is not judged twice. Before this, such a
  round was judged from the checklist alone: in live run
  `run-musp474o-e0ed7432` round 2 applied the fix the judge had named, its
  changed Flow ran clean, and the build ended "not finished" with half its
  purse unspent and that Flow never judged.

## Generation readiness capability

The authenticated, read-only `get-flow-bootstrap-generation-readiness` endpoint
is requested with HTTP `GET` (and no request payload) and returns the exact
`automation-studio.flow-bootstrap-generation-readiness.v1`
capability document before any build authorization or provider work. The
handler reads only a pure runtime-wiring snapshot: whether a provider resolver
is configured and whether a nonempty native node registry is bound. It does not
read secret-key metadata, create a reveal authorization, invoke the provider
resolver or LLM harness, or perform persistence or revision mutation.
`supported` is true only when the runtime-wiring checks pass. Registry readiness requires the canonical Start and End controls plus at least one non-control executable native domain definition; an empty or control-only registry fails closed.

The capability document pins the generation and review endpoint identities,
the `flow_bootstrap` task and output, canonical execution-binding fields,
native node-registry-context requirement, and the complete structured-failure
diagnostic version, stages, provider call states, and accounting field
allowlist. Clients must compare the whole bounded document and fail closed on a
missing, older, newer, malformed, or unequal response. The same pure readiness
predicate runs for generation before any key-summary or reveal-authorization
work. Readiness is a build compatibility assertion, not authorization;
generation still performs its blank-Flow, registry, and post-provider
base-binding checks.

## Blank-Flow authoring UI

### Evidence-guided generation

Domains may bind a provider-neutral evidence runtime with
`bindLlmEvidenceRuntime({ tools, executeTool })`. Core exposes only bounded tool
IDs, descriptions, and JSON input schemas to the model. The domain owns tool
execution and sanitization; Core contains no browser, DOM, URL, selector, or
other domain-specific execution behavior.

The authenticated authoring sequence first saves the user's bounded text with
`save-flow-generation-instruction`. Core upserts one active, required,
Flow-scoped generation instruction before generation, so the build reads its
exact revision. The normal
`generate-flow-bootstrap-adaptation` request then opts in with
`evidenceGuided: true`; it does not carry another instruction body.

Evidence-guided generation uses the caller's provider for a bounded series
of `evidence_tool_decision` tasks. Every task carries the current filtered node
catalog by name with the definitions the build has described, strict dynamic
decision schema, allowlisted tools, and prior sanitized evidence. A decision either requests one registered tool or completes with a
`{ summary, plan }` candidate whose plan schema is the existing strict Flow
Bootstrap schema. Unknown tools, duplicate calls, cancellation, iteration
exhaustion, and evidence-byte overflow fail closed. An unusable reply and a
refused completion are asked again, up to three in a row, as described above.
The series has no fixed length of its own. It makes at most 64 decisions, or
fewer when the resolution declares a call count, with at most one more tool
call than decisions. No decision has a cost share: each is held against the
Flow creation's one purse at its own worst case, and the loop's budget holds
the build's token totals on every call. The cost ceiling follows the Flow's
explicit policy, defaulting to $0.25. An explicitly scoped test process may
add a lower environment ceiling ($0.10 when unset); ordinary UI processes
ignore that environment control
([One purse per Flow creation](#one-purse-per-flow-creation)). The
ordinary proposed Bootstrap Adaptation is written only from a completion the
completion check accepted.

The evidence loop is an authoring-time information-gathering boundary, not a
runtime executor for the workflow being authored. Provider-neutral instructions
require completion as soon as the collected evidence is sufficient to construct
the strict candidate. Once completion is permitted, the dynamic decision schema
places the strict completion variant before all remaining tool-call variants;
provider projection preserves that order and explicitly directs the model to
evaluate completion first. Tools are used only to resolve information missing from
that candidate, with observation preferred over mutation. A mutation is valid
only when its state change reveals otherwise unavailable evidence, such as
navigating to a required page or exposing hidden content; filling, selecting,
submitting, or otherwise performing eventual workflow steps is not evidence
collection merely because an action tool is available.

The coordinator shows the model every evidence entry it holds, whole and in
call order, on every decision; it ranks nothing and chooses nothing. It still
accounts cumulative byte and call totals, but no byte total ends a loop: the
24,000-byte evidence-context window (`maxEvidenceContextBytes`,
`AUTOMATION_STUDIO_EVIDENCE_CONTEXT_BYTES`), the 1,048,576-byte cumulative
evidence backstop (`maxEvidenceBytes`, which ended a loop
`llm_evidence_loop.evidence_limit`), the per-call evidence allowance handed to a
tool (`maxEvidenceBytes` on `executeTool`) and the evidence-entry count in the
DeepSeek pre-flight were all removed on 2026-09-30. Neither the loop's check of
a tool result nor the adapter's pre-flight holds evidence to an array, entry,
string or key length; both keep cycle detection and a recursion guard of depth
64. The only size bound on a request is the model's context window, enforced
loudly before sending with the request's measured size. A Core note is still
superseded by a newer one of its kind; a tool's result never leaves. A request
answered from memory names the entry that answers it, which stays where it
happened.

Each decision is shown the current view of the target whole, and no view the
target has left (B1, 2026-10-01; `runtime/llm/context-window.ts`). A domain
declares which top-level keys of its results are its view of the target, as
`observedStateKeys` on its evidence-runtime binding, beside
`deniedEvidenceKeys`; the registry's loop binding carries the declaration to
the build and the repair's exploration alike, and never onto a tool. In every
result but the newest carrying a view, exactly those keys are replaced by
`supersededBy`, the callId of the next result that carried a view, and the
rest of the result -- what the step did, what it read, what changed, why it
was refused -- stays whole, in its place. A reference names its direct
successor, never the newest, so once written it never changes and each request
is a byte prefix of the next through every entry before its current view. The
decision instruction tells the model once what the reference means. A domain
that declares nothing is shown every result whole, as before. Live run
`run-mup2i28c-6c7fc209` is why: three whole pages of one store in its fifth
decision, 214,853 input tokens, on course to pass a 1M-token window near the
twenty-second call of a thirty-step build.

**A call already tried on this page is not made again** (2026-10-01;
`runtime/llm/repeat-guard/`, `decision-handlers/refused-repeat.ts`). The loop
records every call by its tool, its whole input as canonical JSON, and the
page it found: the domain's `stateDigests.before`, or else the last state seen.
A call whose key matches an earlier call that failed (a refusal, or an action
with no effect) or changed nothing (the page after it the same as before) is
refused before it runs, with nothing spent but the decision. It is recorded as
`llm_evidence_loop.repeat_refused`, and the model is shown a `core.repeat_check`
note saying when it was tried, what came of it, and what to do instead. A rerun
amendment is checked against the same record and refused as `changes_nothing`.
Three such decisions in a row stall the round, which the build then tests,
judges and repairs, or ends as not doable with its reason. The stall's issue
codes are the guard's own followed by `llm_evidence_loop.last_refusal:<code>`
(t748), where `<code>` is the result code of the newest call or look Core
refused for a reason of its own before the repeats (a `candidate.*` or
reset-gate code, say), so a supervisor's brief return ("It was stopped by ...")
and a debug see which answer stranded the builder. Recovery is still asked with
the guard's code alone, and the person's ending says nothing for the carried
code (`flow-bootstrap/unfinished-build/not-done.ts`): it is any site's or
domain's own code and could match a pattern there by chance.

The guard is checked before the repeat policy, so every action repeat is
refused in one place. It never refuses:
- a look, which the repeat policy still answers from memory;
- anything after the page changed;
- an outcome whose code says to try again later (a rate limit, a disabled
  control, a page still loading);
- a call that threw;
- a call that failed only because a handle it names was never shown on that
  page (`handle_not_in_packet`, `handle_not_issued`, `unknown_handle`), once a
  later call on that page ran unrefused and answered something new -- a look, a
  detect, a find. Until then it is refused like any failure, and the note says
  the handle was never shown and which call shows or mints it. A handle that
  was shown and has since gone is not one of them. Live run
  `run-musp39u8-9ac026ab` (t194-w79) read a list by an extraction handle no
  detect had minted, ran the detect, and was then refused the identical read
  four times.

**A part run is keyed on the draft too** (t195-w46,
`runtime/llm/repeat-guard/draft-key.ts`). `core.run_flow` runs the draft again,
so it is keyed on a digest of the draft's Flow signature as well as its page,
and so is the repeat policy's request signature for it. The same part run on
the same draft and page that changed nothing is refused unrun as `same_draft`,
and the model is told to change the draft first; after any amendment that
changes the Flow it runs again. A part run counts as applied only when one of
its changing steps acted (`runtime/llm/node-tools/run-flow-part.ts`), never
because a read it replayed answered. A completion refused again over the same
draft counts in the same run of refusals, so a round that alternates the two
stalls at the bound above. Live run `run-musr9pv3-f4bf6256` sent one passing
`core.run_flow {from: 15, to: 16}` about twenty times between refused
completions until its 64-decision bound.

A dry run moves the page without the loop seeing it, so the last state is
forgotten until a call reports one. The domain's `answered_the_same_again`
mark (one constant for Core and domains since t728,
`AUTOMATION_STUDIO_REPEATED_ANSWER_REASON` in `@fluxiq/contracts/automation-studio`,
republished from `fluxiq/automation-studio`; Core's activity wording, the
unfinished-build last fix and `fluxiq/ui`'s failure reason all read it)
and `repeatedAnswer` stay as what they were, a marking, and the
no-progress guard stays the far backstop. Live runs `run-muq310ht-ab80eed0`
(a close button pressed 20 times, one list read rerun 8 times) and
`run-muq3ubys-4b4dbf5b` are why.

A build has three phases (user, 2026-09-30): live exploration and draft
authoring, testing and judgement, then live repair. In exploration
the model writes its draft, and nothing replays the draft
from its first step: not a completion the check refuses, and not a continued
build, which carries on from wherever the page stands
(`runtime/llm/evidence-loop/completion-attempt.ts`,
`runtime/llm/evidence-loop/resume.ts`). The judgement phase starts when the
model says the Flow is ready and the completion check accepts it: the draft is
then dry-run, which is the one full run from where the Flow starts, and a
refused test sends the model back to live repair from where the test stopped,
to be tested again the next time it says the Flow is ready
(`runtime/flow-draft/dry-run.ts`, `runtime/llm/node-tools/dry-run-gate.ts`):
the target is reset to where the first proposed step started and every
proposed step is run again in order with the argument the Flow will use, with
no model attached. Each step answers `replayed`, `failed`, `changed` or
`unreproducible` (its target was not there on the replay, which the domain
cannot tell apart from a site that remembers an earlier answer). Every answer
but `replayed` refuses the completion, on every attempt: finishing again with
the step unchanged is refused again. The only exemptions are a step the Flow
would not always run (marked `optional`, made `only_if` on a check, the check
guarding such a step, a step another falls back to, or a step the host says
answered an interruption, which the Flow is written with as optional) and a
step no longer proposed (dropped, exploratory or failed), which is not
replayed. The test, its verdict, a rerun's put-back and a partial run all read
that one set (`automationStudioFlowDraftConditionalStepIds`), so the test
judges the Flow as it will be written: in live run `run-murwdp4f-35f976d2`
the test refused the Flow twice on a dismissed chat card alone, a step the Flow
would have skipped, while every later step replayed (t193). A step
reported before is marked `again: true` on the next refusal, which changes no
verdict. Until 2026-09-30 an `unreproducible` step stopped blocking once it had
been reported, and live runs 18, 21 and 33 were accepted or passed a dry run
that way with a step that did not replay. Clean and refused verdicts are
remembered by the draft's Flow signature
(`runtime/flow-draft/flow-signature.ts`: per proposed step, in order, its
action, the argument it runs with, its settings, its routing, whether it
answers an interruption, and its acts), so a completion over the same unchanged
Flow is not replayed again; its history row says `reused_clean`. A refused Flow
completed again unchanged is replayed at most twice; after that it is refused
again from what those replays found, never passed from them. Each refusal of a
Flow whose signature equals the last refused one adds one line (`unchanged`):
nothing changed since the last test, it failed the same way again (or was not
run again), and the steps to change (t193). Routing and
settings are in the signature because an edit to either is an edit to the Flow:
a step marked optional or `only_if` since the refusal is a changed Flow, and
the changed Flow is run (user, 2026-10-02). A refused replay that itself proved
a step only sometimes there and made it optional passes on the Flow signature
taken after that change, because that replay is a run of that Flow. The
replay signature (`automationStudioFlowDraftReplaySignature`, routing left out)
remains only for progress and no-progress: whether the model is re-sending the
same steps, and the `seedSignature` an extend build's first round starts from.
A repeat is run once per row its list returned in the test, a do-while repeat
pass by pass until its last step answers `ended` or its `most` is reached,
and a written step
the test never ran on a row is refused `not_reached`: see
[the build's test](flow-authoring.md#the-builds-test) (t252).

A dry run never clears site data or logs the person out, never repeats a
lasting effect, and checks a changing step rather than running it again
(decision D1, `runtime/flow-draft/verify-only.ts`). The reset is a navigation
and nothing more. A proposed step that changes something and declares any
consequence but none is sent `replay: "verify"` with where it found the target
(`replay.from`) instead of `replay: "step"`, and the host acts on nothing. It
answers `core.replay.verified` (the target is there and would take the action),
`core.replay.present` (the target is gone from the very page the step acted on:
its effect is already in place, as when a store already chosen shows "Your
store" instead of its button), or `unreproducible` (gone, and the page is not
the one the step acted on: the steps before it no longer reach it), `failed`
otherwise. `verified` and `present` pass, and only for a check; a step asked to
run that answers either has failed. The model sees the words `verified` and
`present`, never `replayed`, for a checked step. A step after a verified step
that does not replay is excused (`afterWithheld`) only when the verified step's
own run moved the target, which Core reads by comparing the two steps'
`replay.from` values whole: the withheld effect then left the steps after it on
the page before the move. A verified step that did not move the target excuses
nothing, because the site still holds the effect from exploring. Steps that
declare none (an open, a filter, a navigation) are run again as before, since
the steps after them stand on them. A changing step that claims one of the
person's lasting acts (a bare act id such as `a2`, never a choice such as
`a2.quantity`; lasting by its kind, a grounded quote or the read's per-act
answer, as in [the instruction's read](#permission-on-the-authoring-path)) is
verified whatever it declared, also when it moves the page, since a Submit or a
Place order would otherwise be pressed again: live run
`run-murwdp4f-35f976d2`'s Add to cart declared nothing and was pressed by both
build tests. An act that lasts nothing -- a setting or an open the read neither
quotes nor answers as lasting -- runs again. The same predicate decides for the
dry run, a rerun's put-back and `core.run_flow`. The build trace prints a dry
run's own call ids (`dryrun.<attempt>.<step|reset>`), so a completion that
replayed can be told from one that reused a verdict. The build trace is off
unless `FLUXIQ_BUILD_PROGRESS_TRACE=1`, and then prints one content-free
`[FluxIQ build-trace]` line per seam -- step names, durations, verdict words,
error names and codes, never a sentence: the loop's own lines
(`runtime/llm/evidence-progress/progress-trace.ts`, including a completion a
test sent back) and, around the loop, the build, the build's judge and the
proposal's apply (`build-trace.ts`, t174-w116).

#### Running part of the Flow

The user's rule (2026-10-02): the build and repair loops can run the Flow from
a chosen step to test part of it, but the Flow must also run whole and be
judged a success at least once. The first half is `core.run_flow`
(`runtime/llm/node-tools/run-flow.ts`, `run-flow-part.ts`). Its input is
`{from, to?}`, step numbers as the draft shows them; it runs the proposed steps
from `from` to `to` (the last proposed step when `to` is absent), in order, **on
the target as it stands**: nothing is reset first, which is the point -- a
repaired step and the ones after it are tried without running everything
before them. Each step is sent with the very call the dry run would send
(`replay: "step"`, or `replay: "verify"` for a step that declares a lasting
consequence or claims one of the person's lasting acts, D1) through the loop's own executor, so the permission gate sees
it as it sees every call. Unlike the dry run there is no second try on a step's
own page.

A step the Flow does not always run that does not pass is reported and the run
goes on, as the Flow would; any other step that does not pass stops the run
there and leaves the target where it broke. A step with nothing to run it with
-- one carried from an earlier Flow that never ran in this build -- stops it as
`not_run_in_this_build`: it declares no consequence, and running it would pass
a permission gate that reads an absent declaration as "no consequence". The
answer is `core.run_flow.ran` or `core.run_flow.stopped`, with each step's word
(`replayed`, `verified`, `present`, `failed`, ...), `stoppedAt`, and the
evidence of the last step that answered; a bad range is refused
`run_flow.input_invalid`, `run_flow.nothing_in_flow` or
`run_flow.not_a_flow_step`. It costs one decision and counts as one tool call;
the steps it sends make no provider call and are not counted, as the dry run's
are not. The chat shows "Running part of the Flow" (or "the rest of the Flow",
"one step of the Flow", "the Flow from its start": never a step number, which
the person never sees) and each step as "Trying part of the Flow: ..." in the
`verifying` phase
(`runtime/activity/wording/core-tool.ts`, `tool-call.ts`).

**It is never the Flow's test.** It records no draft step, writes no
`step.replayed`, and leaves the dry-run gate's verdicts alone; its answer tells
the model so. **Where it is offered:** the evidence loop adds it after the
caller's tools only where the loop drafts and its dry run is on, only while the
draft holds a proposed step that can run again (one with `ranWith` and
`replay`), only where the caller's own tools can act (a tool with
`effect: "mutate"` or a per-call effect), never in place of a caller tool with
the same id, and never past the 32-tool limit. That is the build, each of its
repair rounds, and a re-author (an extend build). The recovery ladder's
exploration has no draft and nothing that acts, so it is not offered there.

#### A whole run judged success, on the Flow as it stands

The second half of the rule: a build finishes only after a run of the whole
Flow from its start was judged to do what was asked, on the Flow as it finally
stands; any edit after that run needs another. Three pieces hold it:

- **A test says which Flow it ran.** The report the dry-run gate hands
  `observeTest` carries the Flow signature of the draft it ran, and the build's
  judge (`runtime/service/flow-bootstrap-commands/build-judge.ts`) stamps that
  signature on its verdict as `flowSignature` -- this round's observed test,
  never an earlier round's, and none when no test was observed.
- **Only a yes about this Flow finishes.** The phases coordinator
  (`runtime/flow-bootstrap/unfinished-build/phases.ts`) ends a round finished
  only on a `yes` whose `flowSignature` equals the Flow signature of the steps
  the loop accepted. `no`, `unknown`, `not_judged`, and a `yes` about another
  version of the Flow or about no test (treated as `not_judged` in Core's
  words) are a round `judged_wrong`, repaired live with the judge's account
  under the same funding, progress and round bounds. There is no "finished
  unverified" outcome and no "Flow not verified" note. A phases caller given no
  judge still finishes unjudged; the service always passes one for an
  evidence-guided build. The one-shot build runs no test and no judge and
  produces a proposal for review.
- **A Flow the test cannot run whole is refused, not passed untested.** A
  completion is refused `llm_evidence_loop.full_run_required`
  (`runtime/flow-draft/full-run-required.ts`, `dry-run-gate.ts`), naming each
  step with its word, before any replay and before a judge is paid:
  `not_run_in_this_build` (carried from an earlier Flow with no scheduled
  candidate the test can run as saved, and not a carried Merge, which is passed
  through: `runtime/flow-draft/carried-step/`);
  and, where the loop sets `fullRunRequired` (the build's every round,
  `runtime/llm/loop-configuration.ts`, set by `runtime/service.ts`),
  `cannot_run_again` (its run left nothing to run it again with, or the first
  step has nothing to put the target back where the Flow starts), a Flow none
  of whose steps ran in this build (refused naming no step), and
  `not_a_library_step` where the loop offers `core.run_node` (a step taken
  through another tool would send the Flow to the plan the reply wrote out,
  which never ran). The way through is to rerun each step named, in the Flow's
  order (`amend_draft` rerun, declaring its consequences), or run its library
  node in its place. A loop that authors no Flow -- the recovery ladder's exploration --
  does not set `fullRunRequired` and still passes what it cannot run.

**Re-authored and extended Flows.** A re-author or an improve is an extend
build seeded from the stored Flow (`runtime/llm/node-tools/draft-from-flow.ts`):
its carried steps `f<n>` have no `ranWith` and no `replay`. Each is run by the
test as saved (its scheduled candidate) while unchanged, where it declared or
its node need not, with its captured start where the repaired run captured one
(t439); a carried Merge,
and an optional carried step the test cannot run, are passed through; any other
must be rerun live before the Flow can be tested whole (t274 C-4).
The rerun is a new step; it records `standsFor`, the id of the step whose place
it took (`runtime/flow-draft/step.ts`,
`runtime/llm/evidence-loop/rerun-replacement.ts`), so the written Flow keeps
that node's id. The re-seed carries a node's `metadata.routeSignatures` onto
its step as `routeSignatures`, and a rerun that recorded none of its own takes
them, so a re-authored Flow keeps state routing for a node whose fresh
signatures could not be taken. Because the re-author's build finishes only on a
judged success, its approve and apply (`runtime/recovery/refuted-result/reauthor.ts`)
happen only after the re-authored Flow, carried steps included, ran whole and
was judged. Until 2026-10-02 carried steps were never run, the judge answered
`unknown`, and the Flow was applied unverified.

Core's own notes are superseded rather than accumulated. Before a
`core.request_check`, `core.no_progress`, `core.decision_check`,
`core.amendment_check` or `core.completion_check` note is added, earlier notes
of that tool id leave the evidence. Each completion attempt removes the earlier
`core.completion_check`, `core.dry_run` and `core.dry_run.page` entries before
the check and the gate run, and whichever still refuses shows a fresh one, so a
check that now passes leaves no stale refusal beside a dry run that still
refuses. A tool call that runs removes the `core.request_check` and
`core.decision_check` notes, whose moment the build has left, and a call that
makes progress removes the `core.no_progress` redirect. Tool results never leave
this way. Each removed note's trace is its row in the decision history.

A request answered from memory says what it repeats. Its `core.request_check`
note carries `timesAsked` and `askedAt` (every iteration the same request was
made over the same state, the executed one included: the history keys a call on
its repeat-policy request signature, which carries the epoch it was asked in),
`answeredAt`, and `lastActionBefore`, the
newest action that ran before it. Its instruction says that no action has run
since it was answered (for a tool that acts and is keyed on what has changed,
that no action has changed anything), and from the second ask that this is the
Nth time and it will be answered the same way until an action runs. An answer
from memory takes no capture of any kind. The first time one request is asked
again in the same epoch, and the call that answered it recorded the state it
left, the request is run once more for real -- for a look that is the look's own
single capture -- and the two after-digests are compared: equal is a verified
repeat (a step without progress; the fresh result replaces the answering entry,
and its note, `llm_evidence_loop.looked_again_unchanged`, says Core looked again
and the page is exactly as before), different is a page that moved by itself
and counts as an ordinary look. Every later ask of that request in that epoch is
answered from memory. The second time
one request is answered from the same result, the no-progress redirect is given
at once, below `redirectAt`. A completion refused for the same issue codes over
the same draft revision as an earlier one -- whatever its summary said, since
that is prose the model rewords -- is still checked and replayed; its
`core.completion_check` feedback gains `sameAsIteration` and `timesSent` unless
the check already wrote those keys.

An ignored redirect withdraws looking. When a no-progress redirect was shown and
the next decision again asks for what the loop holds (answered from memory, or a
verified repeat), looks are withdrawn from the following decision until an action
runs and the attempt epoch moves: an observe-only tool is not offered, and a tool
that runs many actions and names the input that picks one (`actionInputKey`,
`node` on `core.run_node`) is offered with that input's enum narrowed to exclude
the actions this build saw report `effect: "observe"` and `proposes: false`. The
key itself is never sent to a provider. A withdrawn look asked for anyway is
refused as the unusable decision `llm_evidence_loop.look_withdrawn` -- never
answered from memory, never run -- and counts toward the no-progress stop. The
decision history lists the withdrawal among its redirects. Only loops that can
refuse a decision (`unusableDecisions`) withdraw looks.

The state digests a build records come from the calls themselves. A binding that
sets `stateDigestsOnCalls` reports on every execution result the digests of the
state the call found and left (`stateDigests`), taken from the captures the call
already made: a look's one capture is both, an action's read before acting and
its read after. The build then passes the loop no `captureStateDigest` hook at
all (`runtime/service/flow-bootstrap-commands/state-digest.ts`), so no step costs
an extra capture on either side. A binding that does not set it keeps the hook,
asked before and after each call as before.
The coordinator canonicalizes each tool ID and JSON input and terminates with
a closed `evidence_duplicate_tool_request` diagnostic before executing the
same effective request twice, even when a provider changes only the call ID.
Tools may additionally declare domain-neutral `effect: observe|mutate` and
`repeatPolicy: after_mutation` semantics. A protected observation cannot run
again, even with varied arguments, until a successful mutating tool advances
the coordinator epoch. While blocked, it is omitted from the decision tool
list and JSON schema, making the no-progress choice structurally unavailable;
a nonconforming provider result still fails closed as
`evidence_repeat_without_progress` before another tool execution. Declaring
this policy requires at least one mutating tool to remain eligible.
One observation tool may also declare
`initialObservation: { input }`. Core executes that domain-declared, bounded
observation deterministically before the first provider decision, accounts for
it as an ordinary tool call and evidence result, and exposes its evidence to
the first decision. This lets a provider complete a simple evidence-guided
generation in one request instead of spending an initial request asking for
the obvious observation. An initial observation is implicitly protected from
repetition for the current mutation epoch even when the descriptor omits
`repeatPolicy`; Core removes that tool from both the first provider catalog and
decision schema until a successful mutation occurs. If no other tool is
eligible, the provider still receives the completion-only schema once the
minimum evidence requirement is satisfied. Configuration fails closed if more than one tool is
designated or if the designated tool is mutating. The initial marker and input
are coordinator-only metadata and are omitted from the provider-facing tool
catalog; the model receives the resulting evidence, not a duplicate execution
hint.

**A build told where its Flow starts opens by going there (F31).** A tool whose
calls declare their own effect (`perCallEffect`, the run-node tool) may carry
`initialObservation: { input, arrival }`, where `arrival` is an input of the
same tool that takes the target to the start location. A binding declares it as
`runsNodes.arrival: { node, parameter }` — the node that goes somewhere and the
parameter the location is written into — and the registry puts the build's
`startLocation` there, without reading it, when the build has one and the node
is offered (`runtime/llm/harness-options/binding.ts`,
`runtime/llm/node-tools/run-node.ts`). The loop then runs the arrival instead of
the look, under the same `initial.<toolId>` call id the domain keys its
per-build memory on, before the first provider decision, and records it exactly
as a model's call added to the Flow at iteration 0 would be: a kept step when it
worked, with the epochs, repeat record, history row and trace row a call has; a
failed call otherwise (`runtime/llm/evidence-loop.ts`, the shared `runCall`
path). The start-location note tells the model the build opened there and that
the step is the Flow's first, already kept, and that it must go there itself
only if that entry failed. Before this, the web domain refused the free look of
every such build for not being at the start yet, and the model's first paid
decision was the navigation (`run-muqc07fh-eeffbc86`, about 17k tokens).
`input` stays the look: a fresh look after a person cleared a check still takes
it (`runtime/parking/person-needed-tool-calls.ts`). A build told no start, a
binding that declares no arrival, and a continued build, which passes no start,
open with the look as before. Every validator of the tool list accepts
`arrival` only on a `perCallEffect` tool, and the provider projection never
carries it.

**The Flow may start where the work does (t195-w47).** The start-location note
also says that, unless the person's instruction names a route to follow (pages,
menus or links to go through: then it is followed in order, a step kept on each
place, and each step's places said with `place` once the draft shows the
route), the Flow's first step may instead go straight to the address where the
work begins, deeper on the same site, and that the completion accepts that only
once Core has read that the person named no route. Core holds both halves at
completion (D phase 2, above), and never by reading addresses or page words for
a route. Once that address is seen to be stable
(nothing in it like a session, a token or a one-time value), the build reruns
step 1 with it and drops the steps that only travelled there, keeping every
optional dismissal (`runtime/llm/deepseek/request-body.ts`). Live run
`run-musr9pv3-f4bf6256` worked entirely at ~/friends/requests/ and its Flow kept
every press of the journey from the front page. The completion admits that
first step under the declared arrival (t262): the rerun keeps the arrival node,
its declared parameter holds the deeper address, and that address agrees with
the start location, so no arrival is restored in front of it.

Reusable context is an explicit per-request option layered on this fresh
inspection path. The service invokes a host-supplied, domain-neutral
`selectForFreshEvidence` projection only after at least one current evidence
result exists, then exact-filters and deterministically packs protected
project-local records. The provider-neutral harness receives at most five
items under its independent 10%-of-input/fixed-byte ceiling. Every item is
marked advisory; current evidence remains authoritative, and the harness
rejects cached projections containing selector or target fields. Feature-off,
unconfigured, and non-opted-in requests do not add a reusable-context packet.
Ordinary non-evidence-guided Bootstrap generation cannot opt in because it has
no fresh inspection.

Bootstrap proposals and their creation audit retain only safe cache status,
fresh/reused contribution counts, packed byte/token counts, and selected
record/run/adaptation IDs. They do not retain the packed projection or fresh
evidence. A miss continues generation without changing the evidence or review
requirements.

Marked mutation tools report
`{kind: llm_evidence_tool_execution, evidence, effectApplied, resultCode?}`. The
optional result code is a bounded safe identifier for categorical outcomes, not
provider text or evidence. Their bounded
evidence is retained even when an action is recoverably rejected, but the
mutation epoch advances only when `effectApplied` is explicitly true. Legacy
raw results remain valid for observations and unmarked tools; raw marked
mutation results fail closed as no applied effect.
Evidence-decision context carries every node by name and the definitions the
build has described beside the tool schemas, decision schema and collected
evidence. In the decision schema, the `add` and `act` properties are explained
once, on the first tool variant that can act, and offered bare on every other
(`runtime/llm/evidence-loop-decision.ts`). DeepSeek still estimates the final provider projection and rejects it
if the authoritative per-call input or total-token limits would be exceeded.

The persisted adaptation records only bounded iteration, decision, call/tool ID,
categorical result code, effect-applied state, evidence-byte, and usage
accounting. Public failure diagnostics may project at most 65 content-free
`{toolId, effectApplied?, resultCode?}` steps: the loop's 64-decision ceiling
plus its initial observation. Raw tool inputs, call IDs, and
collected evidence are not copied into that diagnostic. The loop's budget
charges each call what it reported using, or its worst case when that report is
missing or inconsistent.

The success audit exposes `providerCallCount` and `decisionCount` from trace
entries whose iteration is greater than zero, excluding the deterministic
iteration-zero initial observation. `traceStepCount` reports all trace entries.
The older bounded `iterationCount` remains the total trace length for compatible
readers and must not be used as provider-call accounting. `toolCallCount`
continues to count actual tool executions, including an initial observation.

A build that finished on a judged yes also records that yes on the proposal's
`created` audit event, as `detail.buildJudged` beside those counts
(`runtime/flow-bootstrap/unfinished-build/finishing-verdict.ts`, t174-w118,
live run `run-musp8nz1-dbd3905a` cause R2, where it was provable only from log
order): `verdict` (`yes`), `round`, `judgedAt` (`finished_round`,
`judging_reserve` or `stopped_short`), `flowSignature` and
`standingFlowSignature` as `sha256:` digests of the judged and the finished
Flow's signatures -- never the signatures, which hold every step's input and
target -- and `matchesStandingFlow`. A judge's `confidence` and the advice and
`patchNeeded` given beside a yes (`unconfirmed`, advice capped at 500
characters) are kept when the verdict carries them, for the record only: the
build decides from the verdict and its `flowSignature` alone, and a yes's
advice is never a repair directive (run `run-murwd8le-79e735a8`, cause 10).

Runtime diagnosis and patching may use an optional domain-owned failure-evidence
capture callback. Core invokes it at most once after an action fails, passing
only project/Flow/run identifiers and a compact action descriptor; action
inputs, outputs, messages, metadata, page snapshots, and state references are
excluded. The returned JSON is revalidated against Core's failure-evidence
allowlist and must fit both the 3,000-byte hard ceiling and a dynamic allowance
of at most 20 percent of the request input budget. A malformed, oversized, or
failed applicable capture stops before any provider request. An absent callback
or an `undefined` result preserves diagnosis behavior without evidence.

The same in-memory sanitized packet is supplied to diagnosis and patch context.
Only its schema version, serialized byte count, truncation flag, and Core SHA-256
digest may be persisted; its contents never enter run detail. Every target
override, proposed or executed, is judged by a domain validator closed over
that packet. Core supplies that validator only the failed node ID, definition
ID, and, where the Flow names one, the output the node dispatches (`outputId`).
That lets the domain reject a structurally present target that the failed
action cannot use, without receiving action values or trace content. The
validator may accept the proposed target or return one exact canonical
replacement when sanitized evidence has exactly one compatible candidate. Core
validates a replacement before using it. Malformed, absent, ambiguous, or
unresolved targets fail preflight and create neither an Adaptation nor a Change
Proposal, and so does every target override when no validator is bound. A
refusal may name one reason from Core's closed vocabulary;
[Repair targets and their refusals](../automation-studio.md#repair-targets-and-their-refusals)
lists them. Persisted resolution provenance is categorical (`matched` or
`resolved`); resolved targets appear only in the patch itself. Overrides are
also bound to the failed trace node: Core requires that node to exist in the
current Flow and deterministically replaces any other model-selected node ID
before evidence resolution. Only categorical `targetNodeResolution` provenance
is retained outside the patch.

Runtime Debug exposes `Build Flow from instructions` only for a blank top-level orchestration Flow with no Router or Subflows, at least one active applicable instruction, an enabled DeepSeek key, and saved limits that exactly match the build profile: 4,000 input tokens, 1,000 output tokens, 5,000 total tokens, 20 seconds, USD 0.25, and zero provider retries. The build always asks Core for one call; the Flow's saved call count is not consulted. Ordinary Run remains unavailable while the Flow has no executable topology.

The `Website task` exploration action is available on the same blank Flow as soon as the DeepSeek provider, model, and key reference are configured; it does not require the user to first persist an exact exploration profile. The client derives the request at action time: 8,000 input, 4,000 output, and 12,000 total tokens per call, 45 seconds and USD 0.25 per call. It names no call count and ignores the Flow's saved one. The build is bounded by the Flow creation's one purse -- the explicit Flow policy, defaulting to $0.25, with a lower environment ceiling only in an explicitly scoped test process -- and by its token budget and its deadline, and the panel describes the run by what ends it (a proposal, a lack of progress, the token budget, the total cost, or the deadline) rather than by a call count. This does not relax the exact persisted-limit requirement for the ordinary one-call instruction build.

The authoring action runs on the current authenticated session's own unlocked key and does not ask for the account password or PIN again, or for any confirmation of its size. The browser route adds the authenticated session, so browser code never derives or exposes it. Where the person has allowed lasting consequences, the request carries them as `permittedConsequences`. The surface keeps availability checks visible, and a rejected check offers an explicit retry.

Website exploration distinguishes its two safety boundaries in the interface: bounded browser actions happen immediately against the connected tab, while the generated Router, Subflows, and actions remain an unapplied proposal. Preparing and exploring states expose an accessible indeterminate progress indicator, elapsed time, and a reminder to keep the target tab connected. Shared LLM progress vocabulary uses `Checking prior evidence`, `Inspecting live target`, `Generating proposal`, and `Ready for review`; the current authoring surface renders only phases supported by observable state. In particular, prior-evidence wording and controls remain hidden until reusable-context candidate data exists. Successful generation states explicitly confirm that no generated change has been applied. Failures map only allowlisted diagnostic codes to fixed, actionable recovery guidance; raw service errors, provider output, prompts, and page evidence are never rendered.

Successful generation opens the returned proposed Bootstrap Adaptation in the existing Adaptations view. A typed compatibility bridge projects the dedicated Bootstrap document through the standard `get-flow-adaptation` DTO without copying it into standard Adaptation persistence. The projection exposes only the source instruction IDs, Core-derived risk, summarized Router/Subflow changes, bounded request/token/cost accounting, and the base/current Core execution digests and settings revisions. It never exposes a key identity, session, prompt, instruction body, or raw provider response.

The authoring surface cannot approve or apply the proposal. The standard review endpoint, `review-flow-adaptation`, detects the Bootstrap identity and delegates only approve, reject, apply, and revert to the dedicated lifecycle; the Adaptations UI hides unsupported standard actions. Review responses re-project the new lifecycle state immediately. An applied response includes the canonical post-apply execution digest, which must match the dedicated application record. Only explicit application materializes the deterministic Core-owned Router, Subflows, and graph Flows; existing Router/Subflow mutation subscriptions then refresh Runtime Debug readiness and allow a deterministic Run.

The browser request policy marks generation as an explicit mutation. No bootstrap provider request is part of ordinary preload or summary hydration.

### A domain tool call's build scope and durable state

Core, not the domain, says which build a domain's tool call belongs to (t728).
The registry's `evidenceLoopBinding(context, resolution)`
(`runtime/llm/harness-options/registry.ts`) runs every `executeTool`, Core's
built-in options and the domain's alike, inside
`runWithAutomationStudioEvidenceBuildScope`; `core.recall_result` sits outside
it. Anywhere inside its `executeTool`, after awaits included, the domain reads
`automationStudioEvidenceBuildScope()` (from `fluxiq/automation-studio`), a
frozen `{ projectId, flowId, buildId, callScope?, opening?, move? }`, or
`undefined` outside a registry call.

- **`opening`** is decided from Core's own call-id format, so nothing a model
  writes can produce it (model ids live under `model.`). `"fresh"`: an opening
  id (`initial.`) whose `value.held` is not an array -- the arrival opening, the
  free first look, a project repair's opening, a builder opening on its prepared
  entry, a reset loop's opening. `"continuing"`: an opening whose `value.held`
  is an array -- the opening look of a repair or re-author round whose draft
  already holds the Flow, and of a stopped build continued later. Absent on
  every other call. The domain still reads `arrived` and `repairs` from `value`
  for their own meaning.
- **`places`** (t743) rides every brief's opening call's `value` -- a build,
  repair or reset brief's, beside `repairs` when there are any -- as a list of
  the locations of the build's issued destination refs, in the order they were
  issued, read when the opening is made, so earlier briefs' refs are included
  (`project-agents/dispatch/run-brief.ts`, from the ports' `issuedRefs()`, which
  `service/project-build/brief-ports.ts` fills from the project ledger with
  each ref's location). Duplicates, the withheld value and empty entries are
  left out, and the key is absent when none remain. It is the same kind of key
  as `repairs`: meant to be read on an opening only, so every location Core's
  words name is one the domain can admit even after its in-process memory was
  lost.
- **`move: "core"`** (t743) marks a call that is a move Core makes itself: the
  site reset's `compare`, `compareAt` and `lookAt` arrivals
  (`flow-bootstrap/site-reset/start-check.ts`, which runs them inside
  `runAsAutomationStudioCoreMove`). The registry writes it when
  `automationStudioCoreMoveRunning()` is true as it frames the call
  (`llm/harness-options/core-move.ts`, one store per process under a registered
  symbol, so a second copy of Core in the process reads the same marker). It
  never comes from the call id: a model call whose id has the same shape as
  Core's carries no `move`. It is absent on every call the model wrote.
- **`callScope`** is the scope of the binding's latest opening
  (`initial.<toolId>.<scope>`, read by `automationStudioLlmEvidenceOpeningCallScope`
  beside the call-id writer), carried to every later call of the round and
  cleared by an unscoped opening. It is present only when loops run side by
  side for one Flow: today a project brief (`callScope = briefId`) when the
  scheduler's capacity is above 1.
- **`buildId`** resolves as `context.runId`, then `context.buildId`, then the
  build frame (`runWithAutomationStudioEvidenceBuild`,
  `automationStudioEvidenceBuildBound`, read by `automationStudioEvidenceBuildId`),
  then an id the binding mints once. The service mints one `build.<uuid>` per
  build and passes it to its binding, so every round of a build shares it; a
  project build's record `project.buildId` is that same id, and the project
  build runs inside `automationStudioEvidenceBuildBound`, so every brief binding
  reads it and concurrent briefs differ only by `callScope`. A recovery
  exploration during a run sees the run's `runId`. A continued stopped build
  gets a new id (its opening is `"continuing"`). Trials run the Flow through the
  runtime graph, not a registry binding, so a trial's own node runs carry no
  scope; the trial-view look after a trial carries the build's id with no
  `opening`.

The scope is read from an async frame because the binding, evidence loop and
brief ports did not change. Passing it as an explicit field on the tool request
is a follow-up once `harness-options/binding.ts` and `llm/evidence-loop.ts` are
free to edit.

**Durable domain build state** (`runtime/domain-build-state/`). A registered
domain gets a port with `automationStudioDomainBuildState(fluxiq, domainId)`,
once, after `registerDomain`; it refuses
`domain_build_state.domain_unregistered` for a domain FluxIQ does not know. The
port is frozen and bound to the domain: `get(scope, key)` (a copy, or
`undefined`), `put(scope, key, value)`, `drop(scope, key)` (whether there was
one), with `scope = { projectId, flowId, buildId? }`. With `buildId` (use the
evidence scope's) a value lasts one build; without it, it belongs to the Flow
and outlives its builds and runs. The service owns the store
(`AutomationStudioService.domainBuildState`): one program-state file per
(domain, Flow), `<flow>/domain-build-state/<domain>.json`, written through
`ProgramJsonStore.update` in either storage layout, or in memory when the
service has no storage root. Bounds (`AUTOMATION_STUDIO_DOMAIN_BUILD_STATE_LIMITS`):
plain JSON only (no NaN or Infinity, cycles, class instances, holes, `undefined`,
or nesting past 32 levels), 64 KiB per value, 64 keys and 256 KiB per scope
(replacing a key is allowed at the limit), 16 build scopes per domain and Flow
with the least recently written one dropped on the 17th, keys
`^[A-Za-z0-9._:-]{1,120}$` and ids `^[A-Za-z0-9._:-]{1,200}$`. A refusal is an
`AutomationStudioDomainBuildStateRefusal` naming only a code and part
(`value_invalid`, `value_too_large`, `scope_full`, `scope_invalid`,
`key_invalid`, `document_invalid`, `domain_mismatch`); a malformed stored
document is refused, never read as empty. Values are opaque: Core never reads,
logs or interprets them.

## Candidate verification and detached execution

`runtime/flow-bootstrap/verification` owns revision/base/requirements-bound start,
execution and independent observation receipts. It refuses unknown evidence,
incomplete enumeration, unperformed commands, cancellation and stale identities.
An explicit create requires start absence, a performed command and attribution
to a newly produced subject; ensure may verify an already-present subject.

The detached adapter revalidates the exact submitted topology, refuses silent
compiler rewrites, routes through fresh host state and uses the normal canonical
executor with the accepted parent's permission defaults. It writes no accepted
graph, permits no partial run or hidden retry/LLM repair, and retains selected
branch execution semantics. Its command list is intentionally empty until a
trusted domain runtime supplies performed/subject acknowledgements. Successful
node attempts alone do not certify lasting browser effects.

These modules are independently tested infrastructure. The production service
requirement interpreter, declared-start browser owner, independent oracle,
durable receipt recovery and atomic shared promotion adapter are still required.
No existing build or repair is automatically accepted by adding these exports.

The shared model result-verification instruction compares included and relevant
excluded witnesses with the original request, independently of the authored
predicate. Quantities use their full expressed components; before/after record
sets are not summed as distinct required subjects. An omitted required subject
calls for refusal, and uncertain quantity or cohort evidence calls for unknown.
These are model instructions, not a deterministic arithmetic or completeness
proof. Existing answer schemas, two-call agreement and candidate promotion gates
remain unchanged; an independent runtime oracle is still needed for live proof.


### Cross-page reset ownership

A title match identifies a subject; it does not prove that deleting its whole
line reverses only this build's effects. Passive reset reads therefore expose
opaque, resource-bound complete collection inventories. A domain must positively
establish completeness; absence in a partial or merely rendered list never
establishes ownership. The ledger retains the first complete read of each
scope and its act sequence. A cross-page subject deletion needs a create-new
act, a complete read of the destination before that act, absence of the
subject in that baseline, and its positive presence at the undo. It is
admitted once without another permission question. Completion requires a
later complete read of that same scope to prove that subject disappeared;
an arbitrary page change is insufficient.

The same witnessed removal can restore repeated creations from one registered
operation on the same identified source and control. It does not absorb an
unrelated creation sharing the same subject. The complete baseline must predate
each creation. Existing baseline quantities never authorize deleting a whole
line. Subject-only quantitative modifications are not an exact inverse and
are refused until a deterministic inverse witness is available.

Modern subject- or scope-bearing declared reversible acts cannot admit an
ordinary trial on leftovers. cannotUndo remains an honest unresolved result;
Core refuses the trial with candidate.trial_reset_unproved until fresh complete
reads settle the act (restored or unchanged; "How an act settles" above).
Wrong-target modern undo attempts are recoverable and can retarget before
anything is pressed. Declaring no lasting consequence on an undo's modern
control press does not bypass ownership; the one exception is pressing an
act's own toggle back at its place, which is admitted `own` either way.
Undeclared possible effects, irreversible effects, and legacy domains with
neither subject nor scope tokens retain their existing policy.

An identified reversible act stays listed and correctable after cannotUndo or
repeated refused trials. A source notification disappearing, or an unchanged
source-page read, never clears that act: a destination effect may persist.
The source diff remains diagnostic evidence only. A truly failed declared
press settles `unchanged` without a needless inverse when its witnesses hold
and no read ever showed a change: a fresh complete read, taken after the act
and the latest lasting call, holds every relevant scope of its group (its own
list read before it, its named destinations, and every original scope that
held its subject) in original order with identical row fingerprints, and no
other scope of that read holds its subject differently. Lists of the same
page about nothing it touched do not block it. Pre-act, incomplete, stale,
late-baseline and other-resource observations cannot satisfy it.

Identified created-item tokens use the same positive complete-scope proof as
cross-page subject deletion. Every original and current subject needs a defined
nonempty fingerprint, with exact fingerprint cardinality. The shared internal
collection-group validator runs before project original Maps, ledger baseline
adoption and current subject Sets. Duplicate subjects or scopes, missing row
states and malformed sibling inventories invalidate the entire group. A bad
fresh read also invalidates cached inverse-admission evidence; it cannot leave
an earlier positive snapshot usable. Valid original authority is immutable and
a later genuinely complete current read can restore current evidence.

Project builders receive generic consequence-declaration guidance before their
first decision. Recovery presses must truthfully declare the same lasting
operation they perform; truly nonlasting actions retain an empty declaration.
A declared retry gets its own immediate effect witness and inverse. Restoring
the relevant scopes of the original group also settles an earlier failed
intent on that original scope and subject. No permission or declared consequence is
inferred from an undeclared recovery press. Moving back a row with a changed
quantity cannot settle the earlier quantity edit or the whole reset.

An unproved undo claim is refused without dispatch. When exactly one later
recorded act on the same original item and scope has its own independently
witnessed transfer matching the current target, the refusal may include
`otherActsWithObservedEffect`. This is informational: the builder must inspect
that receipt and explicitly name its act id in a new claim. Looking up the hint
does not assign an inverse, consume authority or settle either act. The original
admission predicate stays unchanged. The hint additionally requires a fresh,
complete original collection group and, when any resource identity is present,
matching positive identities on the claimed act, the later act and the target.
Ambiguous, spent, foreign or incomplete evidence produces no suggestion.
Original-state proof still gates the next ordinary trial.

Project resets route current inventories to the ledger owning an act without
seeding another builder's baseline from an independent resource. Distinct
resource scopes cannot overwrite each other's current inventories. Builders
are told to inspect a destination's complete item inventory before a
reversible press that has no other witness (a control showing its own state,
or one inside a list already read complete, needs none); missing prior
observation fails closed. Restoration compares every baseline row's semantic state fingerprint
and subject inventory in each relevant scope. A sibling complete collection in
the same fresh read refutes restoration only when it holds one of the act's
subjects that it did not hold originally with the same row value; a sibling
about nothing the act touched does not block, and a relevant scope missing
from the fresh read leaves the act open.


A reversible transfer between complete collections also requires immediate
before/after witnesses around the original effect. Exploration passes its
passive captures through the placed call; trial acts carry the same bounded
opaque inventories from the step's own state diff. A later reset observation
cannot invent that transition. The origin must match the original control's
scope and contain the subject before the act; exactly one same-resource/page
destination gains that subject and lacked it in its pre-act baseline. All
other rows and their order must survive the transition. Core freezes the moved
row's immediate destination fingerprint, so a later quantity/state edit prevents
admission of the inverse. Deletion is never a transfer inverse.

One modify inverse can act on the unchanged witnessed destination subject. It
is spent once when it lands. Completion requires the exact original ordered
subject sequences and baseline row-state fingerprints in origin and
destination (and any other original scope that held the subject), with no
other scope of the fresh read holding the subject differently. A fake inverse, swapped baseline rows or
changed quantities remains unresolved and blocks an ordinary trial. A missing
complete baseline, missing immediate trial/exploration witness or ambiguous
same-subject destination fails closed. No collection selector, URL, browser
resource identifier or row value enters this Core contract.


Whole-project trial ownership shares original inventory authority explicitly.
The project ledger retains immutable first complete scope/group inventories only
until a known lasting project act touches that inventory's group. An act of
unknown scope seals all groups. A mere possible effect from a nonlasting UI
press does not close that boundary. Later reads of touched groups never
become original authority. Each owner receives these original inventories,
keyed by the domain's trusted opaque resource-bound scope, without replacing its
current observations. Whole-trial recording refreshes the supervisor owner from
that authority before recording its acts; a per-step move's before snapshot may
already contain an earlier trial creation and is not the original whole-site
baseline. Missing original authority stays unresolved. Current evidence from
another resource cannot prove restoration of a different scope.


## Computed facts first

Before a judge is asked, Core measures what it can in its own record of the run
or build test (`runtime/result-verification/computed-facts/`, contract in
`contracts/computed-facts.ts`; framework plan P5, K4). A fact is never a reading
of a model's reply, and one Core cannot compute is omitted, so the judge is
asked as before. There are eight kinds, in the order a person reads them:

- `count`: the rows stored against the count the part's declared answer asks for
  (`answer.rows` on the task spec, K2: exactly, at least, at most). Too many is
  always Core's to say; too few fails only where Core's record shows rows that
  passed every condition and never reached the answer (a limit cut them, or the
  unfiltered read stopped short of a list that went on).
- `columns`: each requested column (the declared answer's, and those the
  instruction names) is stored and filled. Only a declared column can fail.
- `repeated`: no row stored twice, by the store's own identity or the reads'
  shared `dedupeBy` key.
- `verbatim`: each stored cell is the verbatim text of the element it was read
  from. It computes no fact yet: the summary holds no per-cell source text, which
  paired W5 is to supply.
- `kept_bounds`: every `where` bound Core can read holds on every row the read
  kept, by the same semantics that settle the rows a condition left out.
- `order`: the stored order against the read's declared sort, or, with no sort,
  against the stored date fields when the request asks for newest or oldest
  first. A date-field order waits on stored date fields; a sort Core cannot
  read gives no fact.
- `left_out_accounted`: every row a read left out, alone or by several
  conditions together, is left out under an exclusion the request itself states.
  It applies only where the request asks for every result it looks through (the
  every-result rule, below).
- `act_passes`: each pass of a repeat ran the step carrying a part's requested
  act. It reads t796's per-pass proof on a build trial's `siteChange.proofs[]`:
  the proof `not_run` (no serving step ran on any pass), or a `notRun` list
  (each step's node, label, passes and reason, `guarded` or `unreached`), which
  may sit on a `shown` part whose act missed only some passes. Either fails, as
  an `act_missing` defect naming the step, the passes and why. A judge's yes
  over such a part is a Core no too (`site-change/held.ts`, through the same
  `computed-facts/computed-no.ts`), never a held yes, and the judge's
  instruction says what `not_run` means.

**A fact that fails** is a conclusive reading only, and is a Core no with the
defects located in Core's record and no judge call (`verify.ts`). **A fact that
holds** is put on the judge's copy as `resultSummary.computedFacts`, each said
as "Settled by Core: ... Do not decide ... again", and the judge's instruction
tells it these are true as said and not to answer no over them. A pass still
needs a model yes: a fully computed result is not a yes.

**The every-result rule** (`asked-words/every-result.ts`). A request that
asks for "every"/"each"/"all" of its results (a quantifier, a generic list noun
and at most two other words, none narrowing by a judgement) asks for every row
the search shows, less the exclusions it states. For such a request the words it
searched by say where to look and exclude nothing. So every row a read left out
needs a stated exclusion (`left_out_accounted`; and the judge's yes over a row
one condition alone, or several together, left out must quote the request's own
words, `leftOutOnlyByThis` and `leftOutTogether`), and a no that holds a kept
row only to the searched words is not located and does not bind
(`located-defects/searched-words-kept.ts`). A request for a kind of thing is
read as before.

**Rows left out together** (`request-rows/summary-reads.ts`,
`unquoted-rows.ts`). A read's `leftOutTogether` set is one left-out group, and
a yes over its rows is held to the request's words as alone rows are. Every row
of the group fails every member condition, so one stated exclusion accounts for
it: where a member is a condition Core settles, the group is accounted for when
any such member is named in a sentence that itself quotes the request (no
lending, and not by a quote whose own words name only another condition of the
read). A yes that accounts for no settled member is held under each member
where all are settled, and row by row where one is not.

**The presence locate rule** (`located-defects/presence-settled.ts`). A no that
names a row missing for an absence a presence condition left it out by,
quoting the value as "(no value)", is located when that read's
`leftOutSettled` holds the row with the condition's tested column and
"(no value)" and the defect's column is that column.

## Judge advice consistency and grounded defects

Each trial carries the advice of all earlier trials judged no (never of one judged unsure, t771), with Core's comparison of the named
conditions or step parameters against the current plan. A changed condition is evidence of a
change only; earlier advice never overrides the original request or excuses an incorrect result.
Advice text is bounded per entry, but completed trials are not evicted after three entries or deduplicated by local revision: retests and rebriefs can reuse a revision number. Column references resolve once to a unique canonical column for both grounding and claimed-value checks; ambiguous aliases remain unconfirmed.

A current verification schema requires `diagnosis.defects` (an empty list when none is asserted).
Row defects identify a kept or missing row, or a wrong column value, and quote the original request.
The optional `value` states the cell value claimed by the judge; Core compares it with the stored
cell and rejects a contradicted value claim. Row/column existence grounds a reference but does not
prove the judge's semantic reading correct. Existing no-weighing checks still evaluate measured
counts, page coverage and left-out condition witnesses before the additional grounding check.
`other` represents ordering, formatting, required fields/actions and constraints the row checks
cannot measure. Such claims remain unconfirmed; lack of a locatable row defect never proves yes.

After one recheck, a structured no that Core cannot ground becomes `unsure`, never an automatic
yes. Promotion still requires independent model confirmation. Only explicit independent yeses on
recheck may settle the result as yes. Persisted legacy diagnoses remain readable without a structured field. Every current negative
verification passes a task-specific decoding flag: missing, malformed or partly malformed defect
accounts are unusable and leave the result unsure, rather than being treated as legacy negatives.
Positive and unrelated diagnosis replies retain their established decoder behavior.

A result that stores no answer rows -- a Flow that only acts: saves, sends, likes, adds to a cart --
is grounded against Core's record of the steps the run took, not against rows (t766), and so is an
act of a request that also owes records. Until then
such a no could only name `other`, so every act-only failure came to unsure, failed nothing and
asked for no repair. Two act kinds now exist: `act_missing`, an act the request asks for that no
step does, naming in `row` what it is done to; and `act_wrong`, a step (`step`: its node id, its
label, or a build test's step number) that did its act to the wrong thing, with the wrong value or
with no effect the evidence shows. Core's act record is each step of the Flow with its label,
authored parameters and the changes the run saw it make (`flowShape`), and a build test's steps
with their targets; a step whose record set or build-test observation is rows is a read, not an
act. `act_wrong` is found when it names a step Core holds that acts; `act_missing` when no acting
step's own words name what it is done to (a step that names it did that act). Both still quote the
request's own words. The steps are evidence apart from the rows, so a result that also stores rows
-- a request that owes records and asks for an act beside them -- takes an act defect too
(supervisor, 2026-10-27), while every row claim (a row kept, missing or wrong) still needs its row
in Core's record exactly as before.
A found act defect keeps the no, which fails the run and hands its repair the judge's reading, as a
found row defect does; a no naming nothing Core finds stays unsure.

A missing row is held to its own cells (t771; rerun round 6 social `run-mvrj7qg8-c20c132e`, where
judges gave a friend's own post a group it does not have, Core located the claim because the row
existed, and the wrong double no's advice led the build away from the right condition). Each row a
read leaves out reaches the judge with its own cells beside its label: `leftOutCells` on a
condition, aligned with `leftOutOnlyByThis`, and `cells` on a `leftOutTogether` set -- every
declared column, screened as stored rows are, empty where the read found nothing. An
`asked_missing` defect for a row a read saw is located only where it gives the `column` and that
row's own `value` in it that makes the row asked for, and Core's cell of that row says it (where
Core holds no cell of that column, as for a build test's rows, the row's own label must say it).
A row is named by its whole label, Core's id for it, or its whole label first with more words after
it, which tell apart rows sharing the label; never by another row's label found later in its words.
A build test's record holds its answer's labels (`buildTest.stores`) as stored rows, so a kept row
of a test is located and a row its answer holds is never located missing.

A lone yes beside nos Core refused every one of, after their re-asks, is asked once more to
confirm (lead decision, 2026-10-27): a second yes stands as yes, anything else is unsure. Nothing
a no Core could not ground observed or advised is carried on: its unsure outcome's
`unconfirmedReading` holds only what it read the request to ask and `recordContradicts`, and a
later trial's judge is told the advice of earlier trials judged no only (`earlierAdvice`).

A read that supplies a repeat loop and is superseded by a later read of the same target is working
rows when the graph/run evidence establishes that relationship. Its record set is excluded from
answer-only checks only when every collector is a working read and a later answer set exists.
The closest repair trial uses answer rows and selects the latest nonempty answer among equally
ranked verdicts, rather than favoring inflated working-set counts.
