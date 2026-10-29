// The submission controller: each candidate a model or Core sends is checked
// and, when valid, becomes the next revision (the header of `submit` says
// which are refused and why). The refusals and readings it composes are the
// sibling files of this directory.

import { isDeepStrictEqual } from "node:util";
import type { JsonObject, JsonValue } from "../../../../../core/index.ts";
import { checkAutomationStudioFlowBootstrapCompletion, checkAutomationStudioFlowBootstrapPlanCompletion, type AutomationStudioFlowBootstrapCompletionVerdict } from "../../llm/harness-options/index.ts";
import { automationStudioFlowBootstrapWrittenPlanBindingIssues, parseAutomationStudioFlowScript } from "../authoring/index.ts";
import { automationStudioInstructedActOptionalScriptIssues } from "../instructed-acts/index.ts";
// Its own barrel, not result-verification's, whose reads import flow-bootstrap back (a module cycle).
import { automationStudioResultKeptConditionsDropped, type AutomationStudioResultKeptConditionDrop, type AutomationStudioResultKeptConditionsCarrier } from "../../result-verification/standing-no/index.ts";
import { validateAutomationStudioFlowBootstrapPlan, type AutomationStudioFlowBootstrapIssue, type AutomationStudioFlowBootstrapPlan, type AutomationStudioFlowBuildPlan } from "../plan/index.ts";
import { AutomationStudioCandidateNumericTextHint } from "../numeric-text/index.ts";
import { automationStudioFlowPlanListedValuesAdvice, automationStudioFlowPlanToggleSteps, automationStudioFlowScriptWayOutIssues, type AutomationStudioExploredToggle } from "../script-statements/index.ts";
import type { AutomationStudioFlowCandidate, AutomationStudioFlowCandidateSubmission, AutomationStudioFlowCandidateSubmissionHistory, AutomationStudioCandidateOriginalSourceBinding } from "./contracts.ts";
import { automationStudioCandidateFingerprint as fingerprint } from "./digest.ts";
import { AutomationStudioCandidateKeptStepHint } from "./kept-step-hint.ts";
import { automationStudioCandidateSameBehaviour, automationStudioCandidateUnchangedRefusal } from "./unchanged-submission.ts";
import { bindingRefusal } from "./binding-refusal.ts";
import { changedPaths } from "./changed-paths.ts";
import { keptConditionRefusal } from "./kept-condition-refusal.ts";
import { partOutputPortIssues } from "./part-output-port-issues.ts";
import { submissionText } from "./submission-text.ts";
import { automationStudioCandidateUnwitnessedAdvice } from "../reset-admission/index.ts";
import type { AutomationStudioExploredInterruption } from "../explored-interruptions.ts";
import { automationStudioCandidateExploredLayerHandlers } from "../layer-handlers/index.ts";

/** Session-local candidates, separate from discovery and the accepted Flow store. */
export class AutomationStudioFlowCandidateSubmissionController {
  private revision = 0;
  private current: AutomationStudioFlowCandidate | undefined;
  private previous: AutomationStudioFlowCandidate | undefined;
  /** Every revision accepted in this session, oldest first: what a renamed refuted Flow is found among (t493). */
  private readonly accepted: AutomationStudioFlowCandidate[] = [];
  /** Each kept condition, as written and by the revision whose trial showed it, a submission was already refused for dropping (t641): refused once, never twice. */
  private readonly keptRefused = new Set<string>();
  /** The one-time hints for a dropped step that chose the request's own words (t666, `./kept-step-hint.ts`). */
  private readonly keptSteps = new AutomationStudioCandidateKeptStepHint();
  /** Numbers or dates tested by their characters, each refused once (t800, `../numeric-text/hint.ts`). */
  private readonly numericText = new AutomationStudioCandidateNumericTextHint();
  /** The current revision's Flow as the script reader reads it (`submissionText`), to tell an unchanged resubmission (t464). */
  private currentText: string | undefined;
  private readonly originalSource: AutomationStudioCandidateOriginalSourceBinding | undefined;
  constructor(private readonly input: Omit<Parameters<typeof checkAutomationStudioFlowBootstrapCompletion>[0], "result" | "draftSteps" | "routeSignaturesOf"> & {
    baseDependencyDigest: string; signal?: AbortSignal; originalSource?: AutomationStudioCandidateOriginalSourceBinding;
    /**
     * The submit and test tools of the loop this controller serves, and what it
     * calls what it submits, for its refusals to name (`./unchanged-submission.ts`,
     * t632): a subflow brief's are `core.submit_subflow` and `core.test_subflow`.
     * Absent, the candidate loop's.
     */
    refusalTools?: { submit: string; test: string; subject: string } | undefined;
    /**
     * The build's explored presses the domain answered as a toggle
     * (`../explored-toggles.ts`, the permission wrapper's): a model's step on
     * the same control is given `ensureState`, or refused for the node that
     * sets the state (`../script-statements/toggle-idempotent.ts`, t775).
     * Absent, no step is tied to a press, and any `ensureState` a model wrote
     * is still taken off.
     */
    exploredToggles?: { list(): readonly AutomationStudioExploredToggle[] } | undefined;
    /**
     * The build's explored presses the domain answered as clearing a layer
     * that covered the page (`../explored-interruptions.ts`, the permission
     * wrapper's): each one no step of a model's Flow makes becomes a handler of
     * every part, closing the layer whenever it shows
     * (`../layer-handlers/explored.ts`, t787). Absent, none is added.
     */
    exploredInterruptions?: { list(): readonly AutomationStudioExploredInterruption[] } | undefined;
    /**
     * The lasting acts the task's parts ask for, as consequence classes
     * (a subflow scope's parts' `lastingActs`, t796): a step declaring one of
     * them is a requested act even where the instruction's words name no act
     * Core reads, so it is never optional or `only after:`
     * (`../instructed-acts/optional-act-steps.ts`). Absent, words alone decide.
     */
    askedConsequences?: readonly string[] | undefined;
  }) {
    const descriptor = Object.getOwnPropertyDescriptor(input, "originalSource");
    if (!descriptor) return;
    if (!Object.hasOwn(descriptor, "value") || descriptor.value === undefined) throw new Error("candidate.original_binding_invalid");
    const binding = fingerprint.snapshot(descriptor.value as AutomationStudioCandidateOriginalSourceBinding);
    const source = binding.originalSources;
    if (Object.keys(binding).length !== 2 || !source || source.schemaVersion !== "candidate.original_sources.v1" || source.projectId !== input.projectId || source.flowId !== input.flowId
      || binding.originalInstructionsDigest !== fingerprint.source(source) || source.effectiveInstructionIds.map(id => {
        const item = source.instructions.find(instruction => instruction.instructionId === id);
        if (!item) throw new Error("candidate.original_binding_invalid");
        return `${item.title}\n${item.body}`;
      }).join("\n") !== (input.instructionText ?? "")) throw new Error("candidate.original_binding_mismatch");
    this.originalSource = binding;
    this.input = Object.freeze({ ...input, originalSource: binding, resolution: fingerprint.snapshot(input.resolution) });
  }

  latest(): AutomationStudioFlowCandidate | undefined { return !this.input.signal?.aborted && this.current ? structuredClone(this.current) : undefined; }

  /**
   * The last revision Core accepted, whether or not a refusal has since cleared
   * it as the one to test (`previous`): the Flow a model edits next, which a
   * refused submission's evidence names as its current one (t498,
   * `./authoring-loop.ts`).
   */
  lastAccepted(): { revision: number; digest: string } | undefined {
    return !this.input.signal?.aborted && this.previous ? { revision: this.previous.revision, digest: this.previous.digest } : undefined;
  }

  matches(receipt: { revision: number; digest: string; baseDependencyDigest: string }): boolean {
    return !this.input.signal?.aborted && this.current?.revision === receipt.revision && this.current.digest === receipt.digest && this.current.baseDependencyDigest === receipt.baseDependencyDigest;
  }

  /**
   * A submission is checked and, when valid, becomes the next revision.
   *
   * **Except one that changes nothing (t464).** A Flow the same as the current
   * revision -- the same script as the reader reads it, or the same resolved
   * plan (digest) -- or one whose digest the judge refuted, is refused under
   * `./unchanged-submission.ts` with what failed last (`history`, the trial
   * gate's), and the current revision stands: nothing was submitted that it
   * is not. Any other refusal still invalidates the current revision.
   *
   * **The same after a refusal too (t474).** A refusal clears the current
   * revision, so t464 had nothing to compare the next submission with. Lane D
   * round 9 (`run-mv5q4j2n-25784472`, 0124 to 0126) resubmitted revision 15
   * word for word after a refused revision 16; it was accepted as revision 17,
   * `changedPaths: []`, with a fresh trial count. The comparison is now with
   * the last accepted revision (`previous`) whenever none stands. A Flow the
   * same as it is refused as unchanged, with that revision's last trial, and
   * that revision stands again: resubmitting it is saying it is the Flow meant.
   * One the judge refuted is named but not reinstated, since it cannot be
   * tested again or completed.
   *
   * **The same by what it does, too (t485, N1).** A Flow that differs from the
   * last accepted revision only in display words -- names and labels -- is
   * refused as unchanged, saying it was reworded, and that revision stands
   * with its own names (`automationStudioCandidateSameBehaviour`). A changed
   * `datasetId` is not a rewording: it decides where results are recorded.
   *
   * **Except against a refuted Flow (t493, supervisor policy).** Live run
   * `run-mv6bg8d8-1a461436` (D2) renamed only the `datasetId` of a Flow the
   * judge had refuted two revisions earlier, and it was accepted, tried and
   * judged yes on the same evidence. A submission the same as any revision
   * accepted in this session whose digest the judge refuted, once the
   * `datasetId` is set aside too, is refused as `unchanged_after_no`: where a
   * run saves its rows cannot change which rows it keeps.
   *
   * **And once, one that drops a condition Core's record kept (t641).** A8
   * wave 14 candidate towels `run-mv9ul5dy-e9a1b1c1`: judges' misread advice got
   * two conditions of an exact revision dropped, one revision after another,
   * though Core's record of its trial showed each left out, by itself, only rows
   * the request does not ask for. The trial gate keeps such conditions as the
   * revision that ran wrote them and hands them back on the result it keeps for
   * a trial (`keptConditions`, `../../result-verification/standing-no/kept-conditions.ts`);
   * the latest accepted revision's trial that has one carries them. A
   * submission that no longer writes one as it was written is refused
   * `candidate.kept_condition_dropped` with Core's words naming it, as written,
   * and the rows it kept out, and the revision that stood still stands. Once per
   * condition and the trial that showed it: the same drop submitted again is
   * accepted, so the refusal is a hint the model can override, never a block. A
   * Flow Core composed (`submitComposed`) is held to nothing here: no model
   * wrote it.
   *
   * **And once, one that no longer reads the request's words a step chose
   * (t666):** refused `candidate.kept_step_dropped` once, after any kept-condition
   * refusal, and accepted when sent again (`./kept-step-hint.ts`).
   *
   * **A step on a control explored as a toggle is safe to run again (t775).**
   * Once resolved, a model's step that repeats an explored press the domain
   * answered as a toggle carries `ensureState`, or is refused
   * `candidate.toggle_not_idempotent` naming the node that sets the state
   * (`../script-statements/toggle-idempotent.ts`). A composed Flow keeps what
   * its parts' submissions gave it. A step is tied to a trial pass of its own
   * node the domain answered as a toggle too (t787), so a looped step whose
   * handle was never pressed while exploring carries it from the revision after
   * its first trial. The plan so changed is validated and laid out again, as
   * the layer handlers' is: a trial runs, and a promotion saves, the graph
   * built from the laid-out parts, not the plan, and a trial refuses a
   * candidate whose plan lays out otherwise (`candidate.execution_plan_rewritten`,
   * `../verification/detached-execution.ts`).
   *
   * **A layer the build closed while exploring is closed by the Flow too
   * (t787).** Each explored press the domain answered as clearing a layer that
   * covered the page, which no step of the Flow makes, becomes a handler of
   * every part: when the control it used shows, press it, then carry on
   * (`../layer-handlers/explored.ts`). The model writes nothing; a composed Flow
   * keeps the handlers its parts' submissions gave it.
   */
  async submit(result: JsonObject, history: AutomationStudioFlowCandidateSubmissionHistory = {}): Promise<AutomationStudioFlowCandidateSubmission> {
    return this.submitChecked(result, history, () => checkAutomationStudioFlowBootstrapCompletion({ ...this.input, result, handleReach: "view_history" }), true);
  }

  /**
   * A whole candidate Core composed itself, never one a model wrote: the
   * project supervisor's assembly of each subflow builder's latest proposal
   * with the call steps it writes for the router-run subflow
   * (`../../project-agents/supervisor/assembly.ts`; automation-project-agents
   * plan, `Assembly`). It becomes a revision exactly as `submit`'s do -- the
   * same counter, the same digest, the same unchanged and refuted-Flow rules,
   * the same trial gate after it -- and runs the completion check's one
   * sequence as a composed Flow (`checkAutomationStudioFlowBootstrapPlanCompletion`,
   * whose header says what differs from a model's).
   */
  async submitComposed(composed: { plan: AutomationStudioFlowBootstrapPlan; summary: string }, history: AutomationStudioFlowCandidateSubmissionHistory = {}): Promise<AutomationStudioFlowCandidateSubmission> {
    const plan = structuredClone(composed.plan);
    const result: JsonObject = { plan: plan as unknown as JsonObject, summary: composed.summary };
    return this.submitChecked(result, history, () => checkAutomationStudioFlowBootstrapPlanCompletion({ ...this.input, origin: "composed", plan, summary: composed.summary }));
  }

  /** `submit`'s body, with the completion check it is held to given (`submit`, `submitComposed`); `holdKept`, whether a dropped kept condition is refused (header of `submit`, t641). */
  private async submitChecked(result: JsonObject, history: AutomationStudioFlowCandidateSubmissionHistory, check: () => Promise<AutomationStudioFlowBootstrapCompletionVerdict>, holdKept = false): Promise<AutomationStudioFlowCandidateSubmission> {
    this.input.signal?.throwIfAborted();
    const standing = this.current;
    // The last revision accepted: the standing one, or the one a refusal since cleared.
    const last = standing ?? this.previous;
    const text = submissionText(result);
    // A Flow with a reversible lasting step is checked again even as the same text: its steps' reset witnesses are stamped as it is resolved, and a new stamp is a new Flow (t751).
    if (last && text !== undefined && text === this.currentText && !restampable(last.buildPlan.plan)) return this.sameAsLast(standing, last, history, history.refuted?.(last.digest));
    // Even a refused revision invalidates any earlier candidate and receipt.
    const revision = ++this.revision;
    this.current = undefined;
    // A candidate is written after exploration, so it may name a control from
    // any view exploration took, not only the page it last saw (t358).
    const verdict = await check();
    this.input.signal?.throwIfAborted();
    if (!verdict.ok) return { ok: false, revision, check: verdict.check };
    if (revision !== this.revision) return { ok: false, revision, check: { ok: false, issueCodes: ["candidate.superseded_submission"], feedback: { code: "candidate.superseded_submission" } } };
    // No draft stands behind a candidate, so the checks a drafted plan meets
    // statement by statement are asked of the submitted graph (t346).
    const bindings = [
      ...automationStudioFlowBootstrapWrittenPlanBindingIssues({ plan: verdict.buildPlan.plan, registry: this.input.registry, resolution: this.input.resolution }),
      ...partOutputPortIssues(verdict.buildPlan.plan, this.input)
    ].filter((issue) => issue.severity === "error");
    // An interruption answered through its offer rather than its way out
    // (t423), read once the domain has said which control each step names.
    const script = typeof result.flow === "string" ? parseAutomationStudioFlowScript(result.flow).script : undefined;
    const wayOut = script ? automationStudioFlowScriptWayOutIssues({ script, plan: verdict.buildPlan.plan, locator: verdict.locator }) : [];
    // A step doing one of the person's requested acts is never optional (r4b
    // F4): the draft path's `step_is_optional` rule, which no candidate met.
    const optionalActs = script ? automationStudioInstructedActOptionalScriptIssues({ instructionText: this.input.instructionText, script, plan: verdict.buildPlan.plan, locator: verdict.locator, ...(this.input.askedConsequences?.length ? { askedConsequences: this.input.askedConsequences } : {}) }) : [];
    if (bindings.length || wayOut.length || optionalActs.length) {
      const code = bindings.length ? "candidate.loop_or_binding_refused" : wayOut.length ? "candidate.way_out_refused" : "candidate.optional_act_refused";
      return { ok: false, revision, check: bindingRefusal([...bindings, ...wayOut, ...optionalActs], verdict.locator, code) };
    }
    // A step on a control explored as a toggle: given `ensureState`, or refused for the node that sets the state (header of `submit`, t775).
    const toggled = holdKept ? automationStudioFlowPlanToggleSteps({ plan: verdict.buildPlan.plan, handleViews: verdict.handleViews, explored: this.input.exploredToggles?.list() ?? [],
      takesEnsureState: (definitionId) => this.input.registry.get(definitionId, this.input.resolution)?.parameters.some((parameter) => parameter.id === "ensureState") === true }) : undefined;
    if (toggled?.issues.length) return { ok: false, revision, check: bindingRefusal(toggled.issues, verdict.locator, "candidate.toggle_not_idempotent") };
    // Laid out again, so the parts a trial runs and a promotion saves carry what the plan does (header of `submit`, t787).
    const relaid = toggled ? this.relaid(verdict.buildPlan, toggled.plan) : { buildPlan: verdict.buildPlan };
    if ("issues" in relaid) return { ok: false, revision, check: bindingRefusal(relaid.issues, verdict.locator, "candidate.toggle_not_idempotent") };
    const kept = relaid.buildPlan;
    // A layer an exploration press cleared that no step answers: a handler of every part closes it whenever it shows (header of `submit`, t787).
    const plan = structuredClone(holdKept ? automationStudioCandidateExploredLayerHandlers({ buildPlan: kept, handleViews: verdict.handleViews, explored: this.input.exploredInterruptions?.list() ?? [],
      registry: this.input.registry, resolution: this.input.resolution, size: this.input.size }) : kept);
    const digest = fingerprint.candidate({ buildPlan: plan, baseDependencyDigest: this.input.baseDependencyDigest, projectId: this.input.projectId, flowId: this.input.flowId, instructionText: this.input.instructionText ?? "",
      ...(this.originalSource ? { originalInstructionsDigest: this.originalSource.originalInstructionsDigest } : {}) });
    // The same plan as the current revision's, written differently, or a Flow
    // the judge refuted: nothing new to test (header of `submit`).
    const refuted = history.refuted?.(digest);
    if (last && digest === last.digest) return this.sameAsLast(standing, last, history, refuted, text);
    // The last revision's Flow with only its display words reworded does what it did: no new revision, no new trial (header).
    if (last && automationStudioCandidateSameBehaviour(last.buildPlan, plan)) return this.sameAsLast(standing, last, history, history.refuted?.(last.digest), undefined, true);
    if (refuted !== undefined) return this.unchanged(standing, undefined, history, refuted);
    // A refuted Flow with only where it saves its rows renamed: still refuted (header).
    const renamedRefuted = this.renamedRefuted(plan, history);
    if (renamedRefuted !== undefined) return this.unchanged(standing, undefined, history, renamedRefuted, undefined, undefined, true);
    // A condition Core's record kept, no longer written as it was: refused once, and what stood still stands (header of `submit`, t641).
    const dropped = holdKept ? this.keptDropped(plan, history) : undefined;
    if (dropped) {
      this.current = standing;
      return { ok: false, revision, check: keptConditionRefusal(dropped, standing) };
    }
    // A step that chose the request's own words, no longer had and tested nowhere: hinted once (header of `submit`, t666).
    const hinted = holdKept ? this.keptSteps.hint({ accepted: this.accepted, plan: plan.plan, history, requestText: this.input.instructionText, subject: this.input.refusalTools?.subject, standing }) : undefined;
    if (hinted) {
      this.current = standing;
      return { ok: false, revision, check: hinted };
    }
    // A text test of numbers or dates by characters: refused once, sent again accepted (t800, `../numeric-text/hint.ts`).
    const numeric = holdKept ? this.numericText.hint({ plan: plan.plan, standing }) : undefined;
    if (numeric) {
      this.current = standing;
      return { ok: false, revision, check: numeric };
    }
    const candidate: AutomationStudioFlowCandidate = {
      revision, digest, baseDependencyDigest: this.input.baseDependencyDigest,
      status: "draft", summary: verdict.summary, buildPlan: plan,
      changedPaths: changedPaths(this.previous?.buildPlan.plan as unknown as JsonValue, plan.plan as unknown as JsonValue),
      ...(this.originalSource ? { fingerprintVersion: "candidate.plan+original_sources.v2" as const, originalInstructionsDigest: this.originalSource.originalInstructionsDigest } : {})
    };
    this.current = structuredClone(candidate);
    this.previous = structuredClone(candidate);
    this.accepted.push(structuredClone(candidate));
    this.currentText = text;
    const handleViews = (verdict.handleViews ?? []).map((view) => ({ node: view.node, handle: view.handle, view: view.view, location: view.location }));
    // Advice, never a refusal: a condition listing values the request never says (t785, `../script-statements/listed-values-advice.ts`).
    // And each step with no witness, said now rather than after its trial (t791 fix 2, `../reset-admission/unwitnessed-advice.ts`).
    const advice = [...automationStudioFlowPlanListedValuesAdvice(plan.plan, this.input.instructionText, this.sampleRowsOf(history)), ...automationStudioCandidateUnwitnessedAdvice(plan.plan, this.input.permissionFor)];
    return { ok: true, candidate, handleViews, ...(advice.length ? { advice } : {}) };
  }

  /**
   * `buildPlan` with `plan` in its place, validated and laid out again so its
   * parts and risk are the plan's own (header of `submit`, t787); the
   * validator's errors when it refuses it. Unchanged when `plan` is its own.
   */
  private relaid(buildPlan: AutomationStudioFlowBuildPlan, plan: AutomationStudioFlowBootstrapPlan): { buildPlan: AutomationStudioFlowBuildPlan } | { issues: AutomationStudioFlowBootstrapIssue[] } {
    if (isDeepStrictEqual(plan, buildPlan.plan)) return { buildPlan };
    const validation = validateAutomationStudioFlowBootstrapPlan({ plan, registry: this.input.registry, resolution: this.input.resolution, ...(this.input.size ? { size: this.input.size } : {}) });
    if (!validation.ok || !validation.validated) return { issues: validation.issues.filter((issue) => issue.severity === "error") };
    return { buildPlan: { ...buildPlan, plan: validation.validated.plan, risk: validation.validated.risk, subflows: validation.validated.subflows } };
  }

  /** The rows Core held of the latest accepted revision's judged trial that kept any (t800, `sampleRows` of the trial result); none without one. */
  private sampleRowsOf(history: AutomationStudioFlowCandidateSubmissionHistory): Array<Record<string, string>>[] {
    if (!history.trialOf) return [];
    for (const earlier of [...this.accepted].reverse()) {
      const rows = history.trialOf(earlier)?.sampleRows;
      if (rows?.length) return rows;
    }
    return [];
  }

  /**
   * The kept conditions `plan` no longer writes as they were written, from the
   * latest accepted revision's trial that carries any, less those already
   * refused once (header of `submit`, t641); each found is refused this once.
   */
  private keptDropped(plan: AutomationStudioFlowCandidate["buildPlan"], history: AutomationStudioFlowCandidateSubmissionHistory): AutomationStudioResultKeptConditionDrop | undefined {
    if (!history.trialOf) return undefined;
    const trial = [...this.accepted].reverse().map((earlier) => history.trialOf!(earlier)).find((found) => found !== undefined);
    const carried = (trial as AutomationStudioResultKeptConditionsCarrier | undefined)?.keptConditions;
    if (!carried?.length) return undefined;
    const refused = new Set(carried.filter((condition) => this.keptRefused.has(refusedKey(condition))).map((condition) => condition.written));
    const found = automationStudioResultKeptConditionsDropped({ carried, plan: plan.plan, refused, subject: this.input.refusalTools?.subject });
    for (const condition of found?.dropped ?? []) this.keptRefused.add(refusedKey(condition));
    return found;
  }

  /** The judge's finding for an accepted revision the plan matches once its `datasetId` is set aside, the latest first; none when no such revision was refuted. */
  private renamedRefuted(plan: AutomationStudioFlowCandidate["buildPlan"], history: AutomationStudioFlowCandidateSubmissionHistory): JsonObject | undefined {
    if (!history.refuted) return undefined;
    for (const earlier of [...this.accepted].reverse()) {
      const judged = history.refuted(earlier.digest);
      if (judged !== undefined && automationStudioCandidateSameBehaviour(earlier.buildPlan, plan, { datasetId: "set_aside" })) return judged;
    }
    return undefined;
  }

  /**
   * Refuses a submission that is the last accepted revision's Flow (header of
   * `submit`): that revision stands again, unless the judge refuted it, when
   * whatever stood before this submission still does.
   */
  private sameAsLast(standing: AutomationStudioFlowCandidate | undefined, last: AutomationStudioFlowCandidate, history: AutomationStudioFlowCandidateSubmissionHistory, refuted: JsonObject | undefined, text?: string, reworded?: boolean): AutomationStudioFlowCandidateSubmission {
    return this.unchanged(refuted === undefined ? structuredClone(last) : standing, last, history, refuted, text, reworded);
  }

  /**
   * Refuses a submission that changes nothing, keeping `standing` as the
   * current revision. `same` is the revision it is the same as, absent when
   * it is a Flow refuted under an earlier one; `refuted` is the judge's
   * finding when the Flow was judged no; `text` replaces the remembered script
   * when a differently written script read to the same plan; `reworded` says
   * the submission differs from `same` in display words alone; `datasetRenamed`
   * that it differs from a refuted Flow only in where it saves its rows.
   */
  private unchanged(standing: AutomationStudioFlowCandidate | undefined, same: AutomationStudioFlowCandidate | undefined, history: AutomationStudioFlowCandidateSubmissionHistory, refuted: JsonObject | undefined, text?: string, reworded?: boolean, datasetRenamed?: boolean): AutomationStudioFlowCandidateSubmission {
    this.current = standing;
    if (same && text !== undefined) this.currentText = text;
    // Beside a refuted Flow, the revision still standing when it is another, with its last trial (`./unchanged-submission.ts`, t632).
    const current = refuted !== undefined && standing && standing.digest !== same?.digest ? { revision: standing.revision, digest: standing.digest, lastTrial: history.trialOf?.(standing) } : undefined;
    const check = automationStudioCandidateUnchangedRefusal({
      standing: same ? { revision: same.revision, digest: same.digest } : undefined,
      lastTrial: same ? history.trialOf?.(same) : undefined,
      refuted,
      reworded,
      datasetRenamed,
      tools: this.input.refusalTools,
      current
    });
    return { ok: false, revision: (same ?? standing)?.revision ?? this.revision, check };
  }
}

/** The classes a site's own controls can reverse: a step declaring only these may be stamped with a reset witness (t751). */
const REVERSIBLE: ReadonlySet<string> = new Set(["create_new", "modify_existing", "delete"]);

/** Whether any step of `plan` declares a reversible lasting class, so resolving it again may stamp a different reset witness (t751). */
function restampable(plan: AutomationStudioFlowBootstrapPlan): boolean {
  return plan.subflows.some((subflow) => subflow.nodes.some((node) => node.consequences?.some((consequence) => REVERSIBLE.has(consequence)) === true));
}

/** A kept condition as a refusal of it is remembered: as written, and the revision whose trial showed it, so a later trial's showing may refuse once more. */
function refusedKey(condition: { written: string; revision: number }): string {
  return `${condition.revision}\n${condition.written}`;
}
