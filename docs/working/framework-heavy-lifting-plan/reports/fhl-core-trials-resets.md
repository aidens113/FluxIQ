# Report: fhl-core-trials-resets

Root R = `C:/Users/osrs_/FluxStuff/!FluxIQ/packages/fluxiq/src/programs/automation-studio/runtime` (paths relative to R).
Read-only audit; excerpts only; nothing run. Evidence: `run-mvswhobv-5eb308c0.md`, `fhl-debug-notes.md`, `fhl-core-surface.md`, `fhl-domain-surface.md`.
Short names: FB = `flow-bootstrap`, SR = `FB/site-reset`, RS = `FB/reset-settlement`, RA = `FB/reset-admission`, TG = `FB/candidate/trial-gate.ts`.

## Outcome

Done (read-only). Headline findings:

1. **Core's trial door demands a witness only a list/table/control reading can supply, and tells the model it can meet it.**
   `SR/project-reset.ts:136-141` (`admitted`) refuses every lasting step whose stamp does not resolve, always
   `canMeet: "another_page"` (:140) with `WORDS.stepWitnessRequired` (`SR/words.ts:171`). Witness kinds are a closed set of four
   (`RA/witness.ts:24-29`: destination list, own list, own control state, repeated explored act). A region that shows its change as
   page text, a count or any non-list structure (the div-built cart, run mvswhobv) has no admissible witness, so 11/11 trials were
   refused unrun and $0.199 of $0.25 went on a search that could not succeed.
2. **The client already reports more than Core admits as witness.** `SR/contracts.ts:168-196` (`AutomationStudioSiteResetRead`) carries
   `state`, `differs`, `lines`, `collections`, `controls`, `values` for every read. Only `collections` and `controls` can witness an
   admission; `values` witnesses only an undo/settlement (`RS/value-tracker.ts`, t772), and `differs`/`lines` witness nothing.
3. **The trial itself is already judged by change, with a graceful `unproven` state** (`FB/trial-change/proof.ts:20-27`: an unread side
   proves nothing either way; `unproven` is never a grounded no). Refusing a trial for want of a witness is stricter than the
   judging layer needs. This is the single largest slack.
4. **Resets are already rare** (t775): the only pre-trial refusal left is `candidate.trial_starts_in_end_state` (`SR/ledger.ts:573`,
   `SR/project-reset.ts:96-102`). The remaining model work is undo plumbing (pairing, `undoes`, `cannotUndo`, `resetDestination`)
   and about 18 refusal codes around it, several of which no model call can satisfy.

## Responsibilities table

Class: (a) needs a model, (b) Core could compute/enforce/default generically, (c) client-specific.
"Contract" = what a client (web, desktop, mobile, API) supplies so Core can do it.

| # | Responsibility | What the model does today (file:line) | Class | Generic change and contract |
| --- | --- | --- | --- | --- |
| 1 | Declare an act's lasting classes | Writes `consequences` per `core.run_node` / plan node (`FB/action-permissions.ts:352,380,393`; stamped to steps at `RA/trial-steps.ts:8`). Core cross-checks undeclared ones (`action-permissions.ts:699`). | (a) for intent, (b) for the floor | Client reports each press's observed effect class (the web domain does: toggle signature, layer cleared, location move). Core takes the union of declared and observed, so a lasting act is never silently `consequences: []` (mvswhobv 0021: coupon declared none). |
| 2 | Name where a change shows (witness) | Presses once while exploring with `resetDestination` = an issued list ref (`SR/undoes-tool.ts:19-27`, `RA/admission.ts:70,79-88`); must read the list complete first. | (b) | Client reports an **observed-effect reading of any region** (`values`/`differs`/`lines` of a location, not only a list). Core records, per lasting press, which locations it looked at afterwards (`checks.lookAt`, `SR/contracts.ts:225-245`) and which differed; that is the witness. The model names nothing. |
| 3 | Witness requirement at the trial door | None by the model; Core refuses `candidate.trial_step_unwitnessed` (`SR/project-reset.ts:140`), `create_baseline_required` (`RA/admission.ts:77`), `reset_witness_required` (:82, :88). | (b) | Refuse only if a witness is reachable; otherwise admit and run with `proof: unproven` (Top change 1). |
| 4 | Before-state capture | Mostly Core: ledger `observed` read-log, `lookAt` before readings (`FB/trial-change/readings.ts`, `read-log.ts`). The model contributes the exploration reads that make a list read complete (`SR/create-baselines.ts`). | (b) | Core looks at every location its read-log holds for the step's resource before each trial (bounded N), whether or not the model read it. Contract: client `lookAt(location)` returns a Read (exists). |
| 5 | After-state capture and delta | Core (`trial-change/session.ts`, `delta.ts`, `pass-witnesses.ts`). Delta exists only for list groups and control places (`delta.ts` header). | (b) | Add a third delta kind, `value`/`region`, from `Read.values`/`differs`. Contract: client reports `values: place -> opaque token` for any region it can name (cart total, badge count, field text). |
| 6 | Undo pairing (which act a press reverses) | Model writes `undoes: act-N` on the reversing call (`SR/undoes-tool.ts:15`; refusals `SR/undo-claims.ts:137-145`: `undo_act_kept`, `undo_unknown_act`, `undo_already_done`). | (b) | Client reports each act's observed effect and, where known, an inverse act. Core pairs a press to the open act whose effect it reverses (same witness, opposite delta); `undoes` becomes an optional hint. Mirrors Core's own `ownControl` / `subjectUndo` paths (`SR/undo-admission.ts`, `undo-paths.ts`). |
| 7 | Undo admissibility | Core: `undo_unproved` (`undo-admission.ts:141`), `undo_wrong_target` (:184), `undo_already_back` (:197). The model retries variants. | (b) | One shared "control is back / not back" answer for admission and settlement (proposed in a44a Fix 1; `RS/own-control.ts`). A `no_call` refusal closes the act, never invites a retry. |
| 8 | Reset destinations (where an undo is judged) | Model supplies refs (`resetDestination`) and chooses the list; Core only validates (`RA/admission.ts:64`, `SR/create-baselines.ts:122-135`). | (b) | Core derives destinations from the act's observed effect (row 2): the regions that changed after the press are its settlement witnesses. |
| 9 | Deciding whether a reset is needed | Core decides (t775): `endStateClash` only (`SR/project-reset.ts:96-102`); settlement by `RS/decision.ts`. The model acts on `actsToUndo` and writes `cannotUndo` (`TG:415-422`). | (b) | Already mostly Core. Remove the echo: Core knows which acts a reset listed, so `cannotUndo` defaults from them (the model may only narrow). |
| 10 | Start-hook / site reset | Deployment `startReset`; Core runs it (`SR/project-reset.ts:97`). | (c) | The client's own start hook. Keep. |
| 11 | Offline trial | Core: runs offline-first only when `tried === 0` per revision (`TG:447`), keeps only `no`/`execution_failed`, never a yes (`FB/offline-first/gate-step.ts:7-12`). The model does nothing. | (b), done | Possible extension: also offline-check later revisions whose changed steps all have recorded evidence (`service/offline-trial/evidence-result.ts`). Contract: client trace store + reevaluator (`service/offline-first/contracts.ts:18-28`). |
| 12 | Trial request bookkeeping | Model copies `revision` + `digest` exactly and optionally `cannotUndo` (`TG:415-425`; stale -> `trial_stale_revision` :430). Receipts are re-derived from evidence at `llm/candidate-receipt/receipt.ts:41-59`. | (b) | Accept `{}` or `latest: true`; Core binds to its own latest receipt. Keep the digest only as an optimistic-concurrency guard. |
| 13 | Trial feedback text | Core composes (`service/candidate-trial/feedback.ts`; verdict wording :275, :281, :288; `TG:721 standingInstruction`, `TG:765 repeatedInstruction`). Judge advice (a model) is embedded for `no`/`unsure`. | (a) judge, (b) rest | Core-computed sections are fine; the risk is judge advice reaching the builder unmarked (mvswh11y D1). Mark provenance (`judge_said` vs `core_found`). |
| 14 | Retest after a refusal | Model decides to resend; refusals carry `retry_allowed` (`TG:453,466,523`); `llm/refused-action-retest.ts:43-46` lets the identical call run once any other call ran; a stall retests once (`candidate/stall-retest.ts:27-37`). | (b) | Core remembers the pending trial request; when a later call meets the refusal's failed condition (a read, an undo), Core re-runs it and reports, instead of waiting for a resend. Bound: the existing 3 trials per revision (`TG:286`). |
| 15 | Change contradicted / toggle direction | Core (`trial-change/contradicted.ts`, t787). | (b), done | Keep; extend direction to the region delta. |
| 16 | Slow-down handled before completion | Model must add pace/wait steps (`candidate/trial-slow-down.ts:14-24`, `TG:531`). | (b) | Core writes the pace/wait step itself from the recorded `paceAtLeastMs` (same pattern as the auto-written `ensureState` and layer handlers). |

## Unsatisfiable refusals

"Unsatisfiable" = no call the model can make meets the condition, or Core says it can and it cannot.

| Code | file:line | Said to be met | Why the model cannot meet it | What would unblock it |
| --- | --- | --- | --- | --- |
| `candidate.trial_step_unwitnessed` | `SR/project-reset.ts:140` | `another_page`, always | Reachability is never checked. Needs an issued list ref of the *same resource* (tab/session identity), and the domain issues refs only for semantic list/table/grid with rows. The crossborder cart (div lines; empty-state panel first) never issues one; the only ref (`destination-1`) was read in another tab (34 refusals advertised it). | Region witness (row 2); compute `canMeet` from whether a ref of this resource exists; else admit as `unproven`. |
| `candidate.create_baseline_required` | `RA/admission.ts:77` | `another_page` | An identified create needs a destination original with the subject absent, or a witnessed repeat. A fresh creation on a non-list region has neither. | Same as above. |
| `candidate.reset_witness_required` | `RA/admission.ts:82` (`this_page` or `no_call` by `controlOriginalCanBeRead`), `:88` (`another_page`) | partly | :88 as above. :82 `no_call` is honest, but the model is told to end. | Value/region witness; control original captured at first read. |
| `candidate.reset_target_unidentified` | `RA/admission.ts:67` | `no_call` | The press has no subject/page/scope; the model cannot add identity, only the domain can. The instruction says "end honestly", which ends the build. | Core falls back to location + control name as identity (client contract: always report page/location). |
| `gate_unsatisfiable` acts: `witness_unreachable`, `nothing_to_name`, `no_admissible_undo`, `no_baseline`, `value_not_back`, `already_back` | `RS/judge.ts:171,316`; `SR/undo-reach.ts:96-103`; `SR/ledger.ts:157-169,617-621` | `no_call` | Honest, but the act stays on the site. Remaining harm is a wrong `no_admissible_undo` from stale in-place reads (mvrj-b6dc) and the place-token mismatch livelock (mvrj-a44a: admission said `undo_already_back`, settlement said press back). | One shared back/not-back function; `reload` before judging in-place reads (`RS/decision.ts` header). |
| `candidate.undo_unproved` | `SR/undo-admission.ts:141` (`consequence_not_inverse` at :152) | `this_page` | Needs the undo press to declare the inverse class of the act; the model's declaration is the only input, and an effect the domain cannot classify cannot be proved (mvswhobv 0211). | Pair by observed inverse effect (row 6). |
| `candidate.undo_wrong_target` | `undo-admission.ts:184` | `no_call` | Legacy acts only. | None needed in project mode. |
| `candidate.trial_starts_in_end_state` | `SR/ledger.ts:573`; `SR/words.ts` `startsInEndState` | `another_page` | Satisfiable only by undoing the named act; if that act is unsettleable the trial can never run. | Run the trial with the clash named to the judge (it is judged by change already); undo only on request. |
| `candidate.trial_unaffordable` | `TG:334` | n/a | Purse, not the Flow. | Not fixable by the model; correct as is. |
| `candidate.trial_retest_limit`, `trial_same_failure`, `trial_unchanged_after_no` | `TG:435-440` | change the Flow | Satisfiable only by a real Flow change; if the cause is a missing witness no such change exists (mvswhobv revisions 1-6 all refused identically). | Fix the witness refusal upstream so these are not reached. |

Satisfiable, for completeness: `reset_destination_unissued` (RA:64), `undo_already_back` (:197), `trial_slow_down_unhandled` (TG:531), `trial_required` (TG:537), `trial_stale_revision` (TG:430).

## Top (b) changes ranked by effect

**1. Admit a trial with an unwitnessed step as `unproven`, and compute `canMeet` honestly.** (Highest effect.)
- Change: in `admitted` (`SR/project-reset.ts:136`), refuse only when the step could still gain a witness (an issuable ref of its resource exists, or a control receipt can be read here). Otherwise admit, run the trial, and let `trial-change/proof.ts` give `unproven`. The leftover act goes into `startedWith.cannotUndo` as "no witness, left as is" (the `no_baseline`/`witness_unreachable` words already exist).
- Contract: none new. Uses the existing "unread side proves nothing" rule.
- Wrong choice still caught: the judge reads the run and end view; `unproven` is never a grounded no or an automatic yes; the whole-Flow judged run must still pass; the Lab oracle and `result.unasked_change` for witnessed places still apply.
- Expected effect: mvswhobv had 0 of 11 trials run. With this, trial 1 (step 0027) runs and gets a verdict for about one trial's cost, instead of $0.199 of fruitless exploration. It also unblocks the mvrj-6916 reloading `modify_existing` press at the door.
- Caveat: confirm the gate lets a yes stand when a part is `unproven` (not verified).

**2. Region/value witness from any read.**
- Change: add `via: "region"` to `RA/witness.ts:24-29` and the stamp validator (`RA/stamp-valid.ts:49-55`). Admission rule: if, after a lasting exploration press, Core's own look (`checks.lookAt`) at a location the build read earlier shows `differs` non-empty or a changed `values` token, that location is the press's witness. The delta (`trial-change/delta.ts`) gets a `value` kind compared by token equality.
- Contract: client reports, per read, `values: Record<place, token>` for non-list regions (cart total, badge, row text), tokens stable across loads, and `differs` against a supplied start state. The web domain already emits `values` and `differs` (`SR/contracts.ts:168-196`).
- Wrong choice caught: `unasked_change` finding, direction/`contradicted` proof, the judge, the final oracle.
- Expected effect: removes the cause of mvswhobv and the value-witness gap of mvrj-6916 (fix 1 there). Carries to desktop, mobile and API clients, where a "region" is a screen, pane or endpoint field.

**3. Core finds the destination itself (the model stops naming `resetDestination`).**
- Change: after any exploration press with lasting classes, Core looks at up to N locations the read-log holds for the same resource and records which differ (row 8). It puts the result on the call result: "witnessed at <ref>" or "witnessed nothing". Today the exploration door says nothing when a ref witnesses nothing (`SR/create-baselines.ts` `check`; mvswhobv 0086, 0167, 0175, 0256 returned no note).
- Wrong choice caught: if nothing differs the press is flagged "effect not seen", which `result.change_not_seen` already handles at trial time.
- Effect: removes 4 silent non-witnesses and the dead refs in mvswhobv, and the "read the list, come back, press with the ref" sequence (one press instead of three calls).

**4. Filter issued refs by reachability.** Small and immediate. `SR/create-baselines.ts:123` `issuedRefs()` lists every ref and `SR/words.ts:171-176` prints them all. Drop refs whose resource differs from the step control's (`destination()` already requires `original.resource === control.resource`). Effect: the misleading list in 34 refusals disappears. No contract change.

**5. Auto-pair undo by observed inverse; `undoes` optional; `cannotUndo` defaulted.**
- Change: when a press's observed effect reverses an open act's recorded effect at the same witness, Core records the undo without `undoes`.
- Contract: per act, `observedEffect {place, before, after}` and optional `inverse {control, state}`. The web domain already records toggle signatures, cleared layers, chosen-state flips and location moves per press (`fhl-domain-surface.md`) but never derives undo or reset destinations.
- Wrong choice caught: the repeat guard still ends loops; the act stays open until a fresh complete read shows it back (`RS/decision.ts` rule unchanged).
- Effect: addresses mvrj-6916, mvrj-b6dc, mvrj-a44a (3 of 8 audited runs lost to undo bookkeeping).

**6. Single "control back?" function for admission and settlement.** Already specified (a44a Fix 1). Removes the `undo_already_back` vs "press back" livelock (110 steps in a44a). No contract change.

**7. Trial calls take no digest; Core keeps the pending retest.** Rows 12 and 14. Saves model tokens on every trial and removes `trial_stale_revision` and the identical-resend path. Low risk, modest effect.

**8. Auto-write slow-down handling.** Row 16; follows the existing handler-writing pattern.

## Risks

- **Teaching to the test.** None of the above names a site; wording must stay generic (`SR/words.ts` header rule). Examples in new refusal text must be a different kind of site from the ten realistic scenarios.
- **Weaker proof.** Change 1 lets a trial run with no list witness. If a downstream gate treats `unproven` as passable, a false pass becomes possible. Mitigation: keep an `unproven` part non-completable unless the judge's yes quotes the run's own reads, and keep the whole-Flow judged run as the finish line.
- **Lasting acts left on the site.** Unwitnessed trials leave their effects (mvswhobv left 4 hubs). The project rule allows it (judge the change, reset rarely), but `startedWith.cannotUndo` must say "no witness, left as is" so later judges do not count them.
- **Unstable region tokens.** A `values` token that changes for unrelated reasons (timestamps, rotating promos) gives false "changed". The domain must hash only stable text; Core should require a witness to be stable across two reads before use (extra look cost).
- **Auto-pairing.** A wrong pair could mark an act undone; fresh-read settlement still has to confirm, so a mismatch shows as `open`, not `restored`.
- **Look cost.** Change 3 adds navigation per press; bound N (3 to 5) and skip presses that are already witnessed.
- **Tab identity.** `resetResource` is a session+tab identity (`domain/.../sanitize.ts`, per the run note); a new-tab item page makes earlier refs unusable. Witnesses must be keyed by resource, not tab, or Core must carry the resource across tabs. This is a domain contract question.

## Not verified

- Whether the trial gate and completion let a yes stand when a part is `unproven` (only the `proof.ts` header was read, not the completion path).
- Whether `Read.differs`/`values` are populated for a cart-like div region in the web domain (taken from the run note, not from `domain/`).
- Whether `checks.lookAt` can reach a location in another tab and return a Read carrying `differs` against an earlier state.
- Line numbers inside `RS/judge.ts`, `SR/ledger.ts`, `SR/undo-claims.ts` come from headers and grep hits. Bodies of `undo-claims.ts`, `control-tracker.ts`, `value-tracker.ts`, `service/offline-trial/*`, `service/subflow-trial/*` and `candidate/submission*.ts` were not read in full.
- The subflow trial gate (`FB/subflow-candidate/subflow-trial-gate.ts`) was not read; assumed to share these rules (the `trial-change/contradicted.ts` header says both gates hand answers to it).
- Expected-effect figures (cost, trial counts) are copied from the run notes, not re-measured.
