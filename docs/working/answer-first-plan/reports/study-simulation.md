# Study: test and repair a Flow in simulation against one recorded exploration

Date 2026-11-03. Read-only: no code changed, no Lab, browser, provider or panel. Stores read with `immutable=1` or from scratch copies. Counts, codes and field paths only. `S/` = Core `packages/fluxiq/src`; `X/` = `!FluxIQWebExtension`. Scripts: `scratchpad/sim/`.

**Sample.** Six project-mode DeepSeek builds: office (`run-mvsknffp`, passed), job (`run-mvsknvqv`, passed), social (`run-mvtdmo5p`, passed), photo (`run-mvtdn37t`, failed), earbuds (`run-mvtdoyf3`, failed), hub (`run-mvtdpdpf`, passed). Plus two Claude legacy builds on company-website (t836, t840). "Final Flow" = the commands of the build's last live `test` trace. "E0" = the build trace's model commands before its first test, the closest thing to a one-time exploration. I read stored traces directly and did not run the Lab's `survey`: it needs a working `dist`, and opening a store applies migrations.

## The short answer

1. **Byte-exact equality fails on every act.** 0 of 43 non-navigate, non-snapshot commands equal an exploration call. For most, the cause is mechanical: the two paths write the same element in two wire forms.
2. **Normalising the forms is safe and reaches 37 of 63.** The rest are real differences: another row, read, target, or a page never reached.
3. **All 26 inconclusive checks were real candidate changes, not capture failures.** 11 were a changed `extractList.where`, which tier 1 assumed was offline computation. It runs in the extension.
4. **A state rule answers 141 of 173 commands; a strict cursor answers 6.** But answered is not right: answers agreed with live less often than a Flow agrees with itself. Validate on the saved corpus before building on it.
5. **An empty-input read says nothing about where it was read.** A snapshot's input is `{}`. 28 of 28 snapshots answered from "same act version, other position" had the wrong page URL. State must include page position.

## 1. Capture

| Model tool | Reaches the gateway as | In trace? |
|---|---|---|
| `core.run_node` | The node's command, with snapshots | Yes |
| `web.find_on_page`, `web.describe_element` | `capture_snapshot {includeHidden}`; the query stays in Core | As a snapshot |
| `web.detect_repeating_structure` | `capture_snapshot {detectStructure.selector}` or `{}` | Yes |
| `core.test_subflow` | Child trace; its look is in the build trace | Yes |
| `project.*`, `core.submit_subflow`, `core.describe_nodes`, `core.recall_result` | Nothing sent, Core-side | **No** |

(Joined on `callId` in job, social, hub, office.)

- **Stored:** each command's `target` and `parameters`, its full `client.action_result` (up to 1.4 MB, snapshots embedded), `state_update`, `recording_event`, page-capture artifacts (`S/client-gateway/trace-matcher/types.ts`, `recorded-deliveries.ts`). All six exploration traces and all 46 other traces in those builds: 0 losses, 0 redactions in exploration. Every exploration result asked for a page capture; all but one carried one.
- **Not stored:** the model's tool input (node id, parameters, page handles) and the page view shown to it. Those exist only in the Lab's step log (`S/runtime/llm/step-log/directory.ts:6-12`). **[I]** The page view is recomputable from recorded answers; not proved for exploration. Handles never reach the wire, so simulation matches on fingerprints.
- **Phases.** Capture does not depend on phase. A build is one `exploration` episode (`S/runtime/recording/gateway-trace/wiring/build-activity.ts:43`). A trial opens a child trace, and its reset stays in the build's (`wiring/trial.ts:9-10`). Decision 2 refuses offline *trials* in exploration (`S/framework/automation-service/service/offline-trial/matcher-session.ts:63`), not capture.
- **Noise.** 710 of 1,360 commands (52%) in the six build traces are `site-reset.*`, `result-check.*`, `dryrun.*`, `rerun.*`, separable by `metadata.callId`. Legacy dry runs sit inside the exploration trace (t836, t840: 44 and 54).
- **Source eligibility.** Exploration traces are never a source: `sources.ts` keeps only test trials (`S/framework/automation-service/service/offline-first/sources.ts:41,46`). The session checks `origin.kind === "live"`, not the activity (`matcher-session.ts:66`), so one would be admitted. Work outside an episode is not captured (`S/client-gateway/trace/capture-source.ts`), so an Answer First run must open one.
- **Product: off.** "Unset is the product's configuration" (`S/runtime/recording/gateway-trace/environment.ts:2-4`); the Lab sets it (`X/packages/test-runner/src/environment.ts:158`).
- **Secrets.** Payloads are screened before storage, and a screen failure withholds the payload (`S/runtime/recording/gateway-trace/screening-sink.ts:24,38`). **Artifacts pass through unscreened** (`screening-sink.ts:6`), and a page capture holds what the page shows: settle this before product use. A typed secret returns `redacted_input` (`trace-matcher/operation/match.ts:21`). Protected projects seal chunks [Doc Core plan `:51-53`]; 0 sampled chunks were sealed, so the Lab does not exercise it.
- **Overhead and storage.** About +11.5% [Doc Core plan `:49`], not re-measured. Per exploration trace: 315-2,549 events, 18-95 MB raw, **1.0-2.6 MB stored chunks** plus 1.7-5.7 MB artifacts; whole project DB 8.6-24.5 MB.
- **Retention: none.** `deleteTrace` has no caller outside its store (`S/framework/persistence/automation/project/gateway-trace/store.ts:274`). Buffer bound 50,000 events or 256 MB, declared as losses (`S/runtime/recording/gateway-trace/episodes.ts:21`). Lab workspaces get reused: of six 2026-11-03 runs, one run's traces remain.

## 2. Do a Flow's calls equal exploration's? Measured

On the matcher's key (`actionType`, canonical `target`, `parameters`; `trace-matcher/operation/read.ts`, `fields.ts`), against the whole build's model commands:

| Run | Commands | Snapshots exact | Others | Exact | After safe normalisation |
|---|---:|---:|---:|---:|---:|
| office | 39 | 24/24 | 15 | 3 | 11 |
| job | 38 | 26/26 | 12 | 2 | 4 |
| social | 24 | 15/15 | 9 | 1 | 5 |
| photo | 34 | 22/22 | 12 | 2 | 5 |
| earbuds | 13 | 7/8 | 5 | 1 | 4 |
| hub | 25 | 15/15 | 10 | 1 | 8 |
| **Total** | **173** | **109/110** | **63** | **10 (16%)** | **37 (59%)** |

The raw 119/173 (69%) flatters: snapshots have empty input and all 10 exact others are navigates. **Exact on click, check, type, extract, extract_list, next_page: 0 of 43.**

| The 53 non-exact | Count | What differs | Safe to normalise? |
|---|---:|---|---|
| Target form and wait | 20 (13 click, 7 check) | `target`, `params.target {element, runtime}`, `params.timeoutMs`; `params.element` identical | **Yes**, if the target names the same element |
| New tab | 7 navigate | `params.newTab` | Yes, declared |
| Row binding | 7 click | `element.context.record`; 4 also `ensureState` | **No.** Another row; `ensureState` can skip the press |
| Changed read | 6 extract_list | `answer` 6, `where` 5, field selector 2, others 2 | **No as a match**; computable sometimes (section 3) |
| Other target | 8 (4 extract, 3 click, 1 type) | Selector and fingerprint | **No.** Never recorded |
| Other URL | 3 navigate | `params.url`, row-derived | **No** |
| Never reached | 2 next_page | Exploration never paged | **No** |

**Why the form differs.** A Flow step's target goes through Core's re-derivation: "a lossy copy of the same recorded element" (`X/domain/src/client/gateway-mapping.ts:265-268`). Exploration's `core.run_node` does not add it. All 18 near-identical click/check pairs in four runs differ in exactly those 3 fields. It is unsafe in the case the mapper names: a repair renamed the control and the target wins (`:258-263`).

**Other differences asked about.** Generated ids: none in the key; command ids are translated. Handles: none on the wire. Waits: `params.timeoutMs` only; `checkWaitMs` never differed in those 18. A longer wait over a recorded timeout must stay a gap. Retries: repeats of one key. Reordering: 1 act out of order in E0.

**What would make a match false.** Selector-only identity (matches job's four row-bound clicks across rows). Input-only identity for reads (the 28 of 28). Dropping `ensureState`, `text`, `url`, `value`, `checked`, `where`.

**Control: one Flow, two live runs, by position (five runs).** Key 109/125, status 110/125, snapshot URL 73/77, snapshot selector set 18/77, rows 4/5. A Flow's commands repeat nearly exactly against themselves; job and unequal trace lengths cause most of the 16 key differences. Selector sets are too volatile for equality. Status varies 12% with no change to the Flow.

**Claude legacy.** Flow dry-run non-snapshot commands: exact 5/19 and 8/23; normalised 6/19 and 12/23. Exploration made 5 non-snapshot calls each, with 1 `extract_list` and 1 `next_page`; the dry runs made 7-8 and 4-6. A Flow that pages further than exploration has nothing to read.

## 3. Why checks were inconclusive

`meta.json` holds no reason, but each ran check left a derived trace naming its source. The 29 derived traces equal 26 inconclusive + 2 `kept_no` + 1 `passed`, matching the step folders. Reconstructed prefix matches photo's 8 step folders exactly (14, 14, 29, 3, 29, 3, 11, 11) and the overall range 3/34 to 26/39.

| First divergence | Of 26 |
|---|---:|
| `extract_list` read spec changed (`where`, `answer`, `rejectedSamples`) | 11 |
| Step replaced or reordered (navigate for click 4, click for wait 1, click for check 1) | 6 |
| Same click, other target | 3 |
| Navigate to another URL | 3 |
| Same `web.dom.extract`, other target | 2 |
| `ensureState` only | 1 |

- **Every one is a changed candidate reaching a matcher that cannot answer a change.** Production binds no reevaluator (`S/runtime/recording/gateway-trace/wiring/host.ts:78`). `matched/recorded` only says where the changed step sits. The discovery's "the gap is capture" fits the older parity figures, not these 26.
- Runs stop 2 commands after the mismatch in all 26: the non-retryable gap, one `after_gap` command, then the step fails (`gap-answer.ts`, `matcher.ts:206`).
- 25 of 26 changed commands exist nowhere else in the trace. A looser cursor alone would not answer them.
- **Tier 1 misfiled filters.** It lists "conditions, filters" as computation (Core plan `:101`), but the model's filter is `extractList.where`, applied in content code (`X/apps/extension/src/content/extraction/item-filter.ts:128-135`). It is a changed read.
- **Filters are often computable without a page.** The condition check is one function, `automationStudioRecordConditionHolds`, used by that file. All 34 rows of the six final `extract_list` reads were fully present in an exploration read's rows. Across the traces: 114 `where[].field` conditions, 44 `where[].read` conditions, which need the DOM.

## 4. Cursor versus state

**Dry walk** of the rule below (`sim2.py`): Flow commands against E0, compared with the Flow's own live answers.

| Result | Commands | Agreement with live |
|---|---:|---|
| Read, same state | 74 | URL 51/74 |
| Read, same act version, other position | 28 | **URL 0/28: must be a gap** |
| Read, other version | 7 | URL 1/7: must be a gap |
| Page move (same version 8, other 7) | 15 | Status 14/15 |
| Act (in order 16, out of order 1) | 17 | Status 8/17 |
| Gaps: act never recorded 11, changed read 10, page never recorded 7, other row 3, read never recorded 1 | 32 | |

- Strict cursor on the same data: prefix of 1 per run, 6 of 173. With the bad reads as gaps, the rule answers 106 (61%).
- 66 commands precede the first act or page gap: URL 28/41, status 14/23. **Position tracking here is crude; this is not validation.** Phase 0 must get near the control before anything else.
- 9 of 9 act disagreements are "recorded succeeded, live failed", mostly dismissals of a layer exploration already closed. Simulation is optimistic here (rule 6).
- 38 of 55 successful E0 acts are absent from the final Flow: dropped wandering is the normal case.

**Design.** The recording is one episode's ordered calls, labelled by the domain as read, page move or act, reusing `WEB_AUTOMATION_ACTION_SAFETY` (`X/domain/src/runtime/offline-reads/read-eligibility.ts:1-6`) and the act ledger's outcomes (`S/framework/automation-service/service/candidate-trial/act-ledger.ts`). **State = (page position, acts done).** A successful act or page move starts a new state; a failed or no-effect call does not.

1. **Read.** Only from the current state, by exact canonical input. The n-th repeat gets the n-th recorded answer, then the last. Otherwise offer it to the row computer or reevaluator; else gap.
2. **Page move.** To the recorded state reached by that exact URL or `next_page` from the same act set. Different act set: gap `state_changed_by_act`, never an answer showing what the Flow did not cause.
3. **Act.** Canonical input with row identity equals a recorded act not yet used. Once used, again is gap `would_repeat_act`. Order is free only between siblings: the same key apart from row identity, on one page.
4. **Unrecorded act.** Gap, and the run is off the recording: later reads are gap `after_unrecorded_act`. This keeps what is sound in today's `diverged`, for acts only. A read gap does not end the run.
5. **End check.** A successful recorded act never used needs a reducer receipt (`changed_nothing`, `undone`, `did_not_succeed`; `S/runtime/adaptation/exploration-reduction/reduction.ts:30-38`), or it is `recorded_act_skipped`, a demonstrated defect.
6. **One-time layers.** A recorded dismissal is answered, marked `may_be_gone_next_time`; a required step so marked is flagged for the live attempt.
7. **Waits.** A different wait is accepted if the recorded answer came inside it; a recorded timeout under a longer wait is a gap.

**Behaviours.** *Loops:* each pass's read comes from the state; each row's act needs its own recorded act, matched on `element.context.record`. A row exploration did not act on is a gap; an acted row the Flow skips fails the end check. *Pages:* `next_page` past the recorded end is `missing_transition`. *Branches:* state-route logic runs on recorded answers; steps never reached are reported unexercised, never passed (reuse `not-run.ts`). *Reduced steps:* a skipped read or page move costs nothing; a skipped act obeys rules 2 and 5. *Retries:* a recorded failure answers the same unless exploration recorded a later success for that call; gaps stay non-retryable.

**Gaps.** Reuse `missing_transition`, `argument_mismatch`, `redacted_input`, `dynamic_content`, `snapshot_unavailable`, `incomplete_capture`. Add the four named above by deliberate edit (`trace-matcher/gap-reasons.ts`; drift test `offline-trial/tests/gap-vocabulary.test.ts`).

**Reuse unchanged:** socket and session, `receiveRaw`, virtual clock, `recorded-deliveries`, id translation, reconcile holding, trace admission, gap answer, reevaluator port, `AutomationStudioOfflineTrialNormalization` to declare every normalisation, derived origin. **Replace:** `operation/match.ts` and the cursor plus `diverged` (`matcher.ts:206-218`). The canonical key comes through a domain port; Core stays domain-neutral. **T17 stands** (`sources.ts:13`): one episode, and two positions with the same input are not merged.

## 5. Judging in simulation

**`siteChange` from the recording.** Core reads witnesses before a trial and after its end view (`S/runtime/flow-authoring/bootstrap/trial-change/after-read.ts`); "an offline trial has none" (`S/framework/automation-service/service/candidate-trial/run.ts:81`). The logic is reusable (`delta.ts`, `findings.ts`, `proof.ts`). The readings are missing: the trace holds `site-reset.read.*` only around trials. So exploration must read witnesses before its first lasting act and at its end. A simulated `siteChange` is then before = recorded, after = recorded end, acts = acts this run used. **[I]** Its honest meaning: "the recording shows this change, and this draft performs the acts that made it."

**Judged result, provider-free first.** Exploration's result is the reference. Three pure assertions on the existing U5 result:

- `recording.same_rows`: the Flow's rows equal the result rows, by identity.
- `recording.acts_covered`: used acts equal the kept lasting acts, none repeated, none skipped without a receipt.
- `recording.reached_end`: the run ended in the state the result was read in.

All hold with no gap: `pass`, origins `recorded` and `pure_computation`, scope `full_recorded_path`, no judge. One fails on recorded support: `fail`, and it is repair feedback. Any gap: `inconclusive`. **[I]** Strong for read and scrape tasks, and for act tasks as far as the witnesses reach. It is only as right as the reference, so exploration's result must be judged live once. A model judge is called only when rows legitimately differ, which ends D42's double pay (`S/framework/automation-service/service/offline-first/spend.ts`).

**Cost per simulated pass,** from step folders. Simulation run: 0 calls, about 1-7 s [I, from inconclusive 950-7,386 ms].

| | Claude (11-03, 10-31 runs) | DeepSeek flash |
|---|---|---|
| Repair decision, median | $0.053-0.068 | $0.0005-0.0014 |
| Judge call, median | $0.067-0.122 | about $0.0008 |

A 5-decision repair on Claude is about $0.26-0.34; a judge pair adds $0.13-0.24; a re-simulation is free. Discovery's $0.45-0.60 assumed a judge pair every pass.

## 6. The repair loop

Runs once, right after exploration's result, while the person's task is live and under the build's purse (no unsupervised paid work). Tools are bound to a scoped environment with no other client (`S/framework/automation-service/environment/scoped.ts`, used at `matcher-session.ts:69`), so nothing touches the site.

| Tool | In simulation |
|---|---|
| `core.submit_subflow`, `amend_draft`, `core.describe_nodes`, `core.recall_result` | Core-side, unchanged. `candidate.unchanged_submission` already refuses an unchanged resubmit |
| `core.simulate` (new, same trial runner) | Runs the draft, step-by-step feedback |
| `core.run_node` | State engine at the failing step's state: exact recorded input, recorded answer; same-spec filter, computed; else never-recorded answer |
| `web.find_on_page`, `web.describe_element` | Same snapshot input, query in Core, so **any new query is answered** if the state holds an `includeHidden` snapshot |
| `web.detect_repeating_structure` | Recorded selector only; else points at the snapshot's `evidence.repeating` |

**Never-recorded answer:**

```
not_recorded  step 7  node web.dom.extract_list
state: after "open results"; 3 calls were recorded here
differs from the nearest at: parameters.extractList.where[0].read
recorded here: [node, parameters] ...     // the model's own earlier inputs
you can: re-express with a recorded input
         compute over the rows read (filters on read columns only)
         core.flag_step_for_live { step, why }
```

The model sees only its own earlier inputs and what it was already shown; feedback text stays generic. **Two exits:** re-express, or flag. A flag is evidence beside the draft, bound to its digest; flagged steps run live at attempt 2 and feed back. A flag blocks nothing, but the draft can no longer report a clean check. Proposed bound: three repair rounds, then keep the draft with its flags. **Tier 2 stays deferred:** it needs a hidden browser in the person's panel (`X/docs/working/trace-offline-trials-plan.md:382`, a supervisor decision the user can overrule). The row computer gives its commonest benefit without one; changed targets and DOM-read filters become flags.

## 7. Honesty

**Already enforced, no change.** Live success needs `pass`, `full_live_run`, `original`, only `live`, and a live episode id (`S/flows/authoring/model/offline-trial/live-success-eligibility.ts:1-21`). The gate binds revision, digest and goal contract (`whole-run-gate-eligibility.ts:1-22`). Replays never raise the tally (`live-episode-tally.ts:1-5`). `inconclusive` is never a soft pass (`vocabulary.ts:7`).

**Recorded as:** `evidenceOrigins: [recorded, pure_computation]`, `scope: full_recorded_path`, `liveEpisodeId: null`, `sourceEpisodeIds: [exploration]`, its own trace `derived`, stored beside the draft by digest; the draft's `verification` stays `not_performed` [Doc discovery `:287`]. Chat: "checked against my recording of the one time I did it; not yet run live".

**"A finished Flow needs one judged whole run": the rule stands, its timing moves.** Attempt 1 ends with the person's result and a simulated draft, which **is not a finished Flow** and is never promoted as one. The next real attempt runs it live, judged; only that yes satisfies the gate for that digest. A no goes to live repair. A draft never runs on its own to earn proof: its acts are real.

**Needs the user's word, since these are his standing rules:**

- "Build the whole Flow first; test it whole only when it should work" and "a failed test is repaired live" (AGENTS.md) assume a test inside the build. This design has none.
- "Generalise without running every iteration" (memory `flows-authored-as-general-structure`) conflicts with section 8's "exploration does every row".
- Decisions 2 and 3 survive: simulation starts after exploration, and the phase type adds a value. D41 and D40 do not apply to the new loop.

## 8. Exploration must reach the result

| What works against it today | Where | Change |
|---|---|---|
| Builder acts on one item, then declares a repeat | `S/runtime/flow-authoring/bootstrap/instructed-acts/check.ts:194`; `authoring/assemble-draft.ts:483` | Do every row asked. Acts land once, so the rows are the record |
| Reads one page, then writes pagination | t836, t840 (section 2) | Read until the result is whole, within the purse |
| Build ends at submit or test, not a result | Discovery `:28`: "ready", **no result** | End state: the result, recorded, judged live |
| Live test and reset inside the build | `candidate/trial/gate.ts:463`, `runtime/project-agents/supervisor/whole-trial.ts` | None in attempt 1 |
| A start hook takes back an explored act | `gate.ts:104` | Never: the act is the person's result |
| Legacy dry runs and reruns | `S/framework/automation-service/service.ts:1655`, t840: 54 commands | Off: they repeat lasting acts |
| Reads dropped from draft steps | Reducer `observation_only` (`reduction.ts:32,46`) | Right for steps. Keep reads in the recording, never reduced |
| Page views live in loop memory | Discovery `:134` | Trace holds the answers; keep it, bound to the Flow |
| Lasting acts pre-gated | `permission_required` ends a build (discovery `:37`) | Ask and continue the same exploration |
| Witnesses read only before trials | `trial-change/after-read.ts`, `gate.ts:79-80` | Read before the first act and at the end |
| Source by test trial, memory per build | `sources.ts:41,46`; no "latest for this Flow" query (`store.ts:200`, per discovery) | Latest exploration per Flow, persisted |
| Failed exploration has no reference | No such path | No simulation; say so, keep the draft unchecked |

## Recommended design

```text
ATTEMPT 1: one live exploration in a traced episode; no trial, reset or dry run.
  Witnesses read before the first lasting act and at the end.
  Does every asked row and page. Acts land once.
  Ends with the person's result, judged live once: the reference.
  Recording = that closed trace + {rows, kept acts, end state, witnesses}, bound to the Flow.
AUTHOR: model writes the draft as today; reducer receipts explain dropped acts.
SIMULATE (no site, no model): same trial runner, real intake, scoped environment, virtual clock.
  State engine in place of the cursor:
    state = page position + acts done
    read  = same state, exact canonical input; else row computer; else gap
    page  = recorded move from the same act set; else gap
    act   = recorded, unused, same row; once; siblings any order; else gap
    unrecorded act = off the recording, later reads gap
    end   = every recorded act used or carrying a receipt
  Canonical input through a domain port. Declared normalisations only:
    target form (same element), wait fields, newTab.
    Never row, where, text, url, value, checked, ensureState.
VERDICT (pure, no judge):
  same rows + acts covered + reached end, no gap -> pass (recorded)
  a check failed on recorded support              -> fail, repair feedback
  any gap                                         -> inconclusive, step and code
  Model judge only for legitimately different rows.
REPAIR (bounded, inside the live attempt):
  core.simulate, core.run_node and looks answered from the state.
  Never-recorded input: nearest recorded inputs and differing paths.
  Exits: re-express, or flag the step for the live attempt.
RECORD: U5 result, full_recorded_path, liveEpisodeId null, beside the draft by digest.
  Chat: "checked against my recording, not yet run live."
ATTEMPT 2, only on the person's real next request: run the draft live, judged.
  Only this satisfies the whole-run rule. Yes: finished Flow. No: live repair.
  Report simulated-pass, live-fail as the metric.
```

## Phased build

| Phase | Work | Proves |
|---|---|---|
| 0 | Save the gap reason in `meta.json`. Corpus harness: saved Flows through the state rule, compared with their live answers; no model or site | The rule is sound. Target near the control (73/77, 110/125). **Stop here if it cannot get close** |
| 1 | One canonical form for exploration and Flow, or a domain key port. Re-measure section 2 | "Exactly the same input" for about 20 of 30 acts by construction |
| 2 | State engine behind the same socket, row computer for field filters; experiment CLI takes an exploration trace | Saved Flows run offline end to end through real intake; T05-T24 kept |
| 3 | Pure verdict and U5 mapping. Replay all saved builds | Against the Lab oracle: **0 false passes on saved failed runs**; inconclusive rate |
| 4 | Exploration reaches the result, witnesses, live judgement. One task per site, paid, supervised | Tasks finish within the purse; gap rate falls from section 4 |
| 5 | Repair tools, flags, feedback. Scripted model first, then paid | A model can fix a draft from the recording; rounds and cost per fix |
| 6 | Product tracing for builds, retention, capture screening, Flow binding, chat words, attempt-2 entry | Two-shot in the product; simulated-pass, live-fail rate decides if this earns its place |
| 7 | Only if flags dominate: tier 2 in the product | User's call on the hidden browser |

## Risks

- **Low agreement in the walk.** Phase 0 exists to surface this before product work.
- **One history.** Stock, prompts, variants, session state and row order are frozen. A pass says the logic fits the recording, nothing more.
- **Row identity.** Rules 3 and 5 lean on `context.record`; identity across modes is unsolved (discovery `:166`). Volatile cells (price, relative dates) would cause a false gap: safe but wasteful.
- **Every row on the first attempt is costly and irreversible.** 50 rows land 50 times before anything checks them. The purse and the 30-minute limit (discovery `:34`) may stop it short, and then "must reach the result" has no answer yet.
- **Live time moves, it does not vanish.** Live trials were 31% of wall time (discovery `:297`). Frequent attempt-2 failures cost the person a second real run.
- **Page captures in the product** hold page content unscreened. Needs consent, retention, sealing. Firefox has no capture API [Doc].
- **Stale recording.** `stale_checkpoint` has no producer (discovery `:287`). Compare witnesses at attempt 2.
- **A pure verdict can pass a Flow that repeats exploration's mistake.** The reference rests on one live judgement.

## Verified versus inferred

**Verified from saved traces and code.** Section 2's tables, the 0 of 43, 37 of 63 and the class breakdown; the control; all 26 causes (prefix join checked on photo's 8, count and range overall); `where` in content code; tool-to-command mapping; storage sizes; no retention caller; product off; the honesty files; decide and judge prices.

**Measured on a crude prototype.** All section 4 agreement figures. `sim2.py` is about 100 lines of Python over already-recorded commands, not the real intake: real delivery may change what Core sends next, which this cannot show.

**Inferred.** That a result-reaching exploration lowers gaps (none exists to test; E0 comes from builds not trying to). Page views recomputable from a trace. A recorded `siteChange` being useful. The verdict's coverage of act tasks. Repair success and cost per fix. Row computing beyond the six reads (filters only; `answer` and sort semantics offline not checked).

**Not checked.** Lab `survey`/`trial` not run. No project-mode Claude run in the stores I could read, so Claude evidence is two legacy builds. Firefox, protected projects, multi-session traces. Whether October's wire forms hold for a November project build.
