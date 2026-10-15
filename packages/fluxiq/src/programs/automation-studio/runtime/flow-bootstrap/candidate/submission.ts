import type { JsonObject, JsonValue } from "../../../../../core/index.ts";
import type { AutomationStudioLlmEvidenceResendInvitation } from "../../llm/repeat-guard/index.ts";
import { checkAutomationStudioFlowBootstrapCompletion, checkAutomationStudioFlowBootstrapPlanCompletion, type AutomationStudioFlowBootstrapCompletionVerdict } from "../../llm/harness-options/index.ts";
import { automationStudioFlowBootstrapIssuePlace, automationStudioFlowBootstrapWrittenPlanBindingIssues, parseAutomationStudioFlowScript, type AutomationStudioFlowBootstrapIssueLocator } from "../authoring/index.ts";
import { automationStudioInstructedActOptionalScriptIssues } from "../instructed-acts/index.ts";
// Its own barrel, not result-verification's, whose reads import flow-bootstrap back (a module cycle).
import { automationStudioResultKeptConditionsDropped, type AutomationStudioResultKeptConditionDrop, type AutomationStudioResultKeptConditionsCarrier } from "../../result-verification/standing-no/index.ts";
import type { AutomationStudioFlowBootstrapIssue, AutomationStudioFlowBootstrapPlan } from "../plan/index.ts";
import { automationStudioFlowScriptWayOutIssues } from "../script-statements/index.ts";
import type { AutomationStudioFlowCandidate, AutomationStudioFlowCandidateSubmission, AutomationStudioFlowCandidateSubmissionHistory, AutomationStudioCandidateOriginalSourceBinding } from "./contracts.ts";
import { automationStudioCandidateFingerprint as fingerprint } from "./digest.ts";
import { automationStudioInterfaceOutputPort } from "./interface-output-port.ts";
import { automationStudioCandidateSameBehaviour, automationStudioCandidateUnchangedRefusal } from "./unchanged-submission.ts";

/** The code a submission dropping a condition Core's record kept is refused under, once (`submit`, t641). */
export const AUTOMATION_STUDIO_CANDIDATE_KEPT_CONDITION_DROPPED_CODE = "candidate.kept_condition_dropped";

/** Session-local candidates, separate from discovery and the accepted Flow store. */
export class AutomationStudioFlowCandidateSubmissionController {
  private revision = 0;
  private current: AutomationStudioFlowCandidate | undefined;
  private previous: AutomationStudioFlowCandidate | undefined;
  /** Every revision accepted in this session, oldest first: what a renamed refuted Flow is found among (t493). */
  private readonly accepted: AutomationStudioFlowCandidate[] = [];
  /** Each kept condition, as written and by the revision whose trial showed it, a submission was already refused for dropping (t641): refused once, never twice. */
  private readonly keptRefused = new Set<string>();
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
  }) {
    const descriptor = Object.getOwnPropertyDescriptor(input, "originalSource");
    if (!descriptor) return;
    if (!Object.hasOwn(descriptor, "value") || descriptor.value === undefined) throw new Error("candidate.original_binding_invalid");
    const binding = fingerprint.snapshot(descriptor.value as AutomationStudioCandidateOriginalSourceBinding);
    const source = binding.originalSources;
    if (Object.keys(binding).length !== 2 || !source || source.schemaVersion !== "candidate.original_sources.v1" || source.projectId !== input.projectId || source.flowId !== input.flowId
      || binding.originalInstructionsDigest !== fingerprint.source(source) || source.effectiveInstructionIds.map(id => {
        const item = source.instructions.find(instruction => instruction.instructionId === id); if (!item) throw new Error("candidate.original_binding_invalid");
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
    if (last && text !== undefined && text === this.currentText) return this.sameAsLast(standing, last, history, history.refuted?.(last.digest));
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
    const optionalActs = script ? automationStudioInstructedActOptionalScriptIssues({ instructionText: this.input.instructionText, script, plan: verdict.buildPlan.plan, locator: verdict.locator }) : [];
    if (bindings.length || wayOut.length || optionalActs.length) {
      const code = bindings.length ? "candidate.loop_or_binding_refused" : wayOut.length ? "candidate.way_out_refused" : "candidate.optional_act_refused";
      return { ok: false, revision, check: bindingRefusal([...bindings, ...wayOut, ...optionalActs], verdict.locator, code) };
    }
    const plan = structuredClone(verdict.buildPlan);
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
    return { ok: true, candidate, handleViews };
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

/** A kept condition as a refusal of it is remembered: as written, and the revision whose trial showed it, so a later trial's showing may refuse once more. */
function refusedKey(condition: { written: string; revision: number }): string {
  return `${condition.revision}\n${condition.written}`;
}

/**
 * The refusal of a submission that drops or changes a kept condition (header
 * of `submit`, t641): Core's words, and each condition as its trial's lines
 * named it, as its revision wrote it and the rows it kept out, with the
 * revision that still stands. One issue, so the loop counts it by its own code;
 * the model's next step is said by `./submission-refusal.ts`. `resend` is Core's
 * own mark that lets the repeat guard run the invited resend once (t650).
 */
function keptConditionRefusal(dropped: AutomationStudioResultKeptConditionDrop, standing: AutomationStudioFlowCandidate | undefined): Extract<AutomationStudioFlowCandidateSubmission, { ok: false }>["check"] {
  const code = AUTOMATION_STUDIO_CANDIDATE_KEPT_CONDITION_DROPPED_CODE;
  return {
    ok: false,
    issueCodes: [code],
    feedback: {
      ok: false,
      code,
      resend: "accepted_once" satisfies AutomationStudioLlmEvidenceResendInvitation,
      ...(standing ? { standingRevision: { revision: standing.revision, digest: standing.digest } } : {}),
      keptConditions: dropped.dropped.map((condition) => ({
        condition: condition.name,
        revision: condition.revision,
        written: JSON.parse(condition.written) as JsonValue,
        keptOut: condition.keptOut.map((row) => ({ label: row.label, by: row.by, ...(row.texts ? { texts: [...row.texts] } : {}) }))
      })),
      // The issue's path names the conditions dropped, so a refusal for one kept
      // condition and a later one for another are two refusals, not a run of one
      // (`./submission-refusal.ts` `refusalCode`): each is a hint refused once,
      // and hints must never add up to the run of refusals that ends a build.
      issues: [{ code, message: dropped.said, path: dropped.dropped.map((condition) => condition.written).sort().join(" | ") }],
      instruction: dropped.said
    }
  };
}

/**
 * The submitted Flow as the script reader reads it, so a resubmission that
 * differs only in what the reader ignores is the same Flow: line endings, the
 * spaces around each line, blank lines and whole-line comments
 * (`../authoring/parse.ts`). A JSON plan is read as its canonical JSON. Nothing
 * else of the input counts -- a new `summary` changes no step -- and an input
 * with neither has no text and is never "the same".
 */
function submissionText(result: JsonObject): string | undefined {
  if (typeof result.flow === "string") {
    const lines = result.flow.split(/\r\n|\r|\n/u).map((line) => line.trim()).filter((line) => line && !line.startsWith("#") && !line.startsWith("//"));
    return `flow\n${lines.join("\n")}`;
  }
  return result.plan !== undefined ? `plan\n${canonical(result.plan)}` : undefined;
}

/**
 * A candidate refused for its loops or bindings, for a step that answers an
 * interruption through its offer (`../script-statements/way-out-steps.ts`), or
 * for an optional step that does a requested act
 * (`../instructed-acts/optional-act-steps.ts`), under `code`. Every sentence is Core's own
 * (`../authoring/`, `../script-statements/`) and quotes only node keys, labels,
 * field names and output ids the model wrote -- and, for the way out, the words
 * of the control its step names, which the evidence already printed to it --
 * so each travels whole with its code and path, and with
 * the step it is about as the model wrote it (t378): a node key such as "s11"
 * is Core's, and names no step the model can find in its script.
 */
function bindingRefusal(issues: readonly AutomationStudioFlowBootstrapIssue[], locator: AutomationStudioFlowBootstrapIssueLocator | undefined, code: string): Extract<AutomationStudioFlowCandidateSubmission, { ok: false }>["check"] {
  return {
    ok: false,
    issueCodes: [...new Set(issues.map((issue) => issue.code))],
    feedback: {
      ok: false,
      code,
      issues: issues.map((issue) => {
        const place = automationStudioFlowBootstrapIssuePlace(locator, issue.path);
        return {
          code: issue.code,
          ...(issue.path ? { path: issue.path } : {}),
          message: issue.message,
          ...(place ? { step: place.step, ...(place.label === undefined ? {} : { label: place.label }), ...(place.line === undefined ? {} : { line: place.line }) } : {})
        };
      }),
      instruction: "Each issue names the step it is about, by its line where the script has one. Correct every one and resubmit the entire candidate."
    }
  };
}

/**
 * A part's output bound to a port its step's node does not declare (t639),
 * or to its success or failure port, a route that hands on no value (t594's
 * rule, which only a subflow brief met): the value would be empty when the
 * Flow runs, and a step that reads it would read nothing. Refused naming the ports the node does declare
 * (`./interface-output-port.ts`). A whole candidate's parts are its own, so the
 * way out is to drop the output rather than to end a brief.
 */
function partOutputPortIssues(
  plan: AutomationStudioFlowBootstrapPlan,
  nodes: Pick<Parameters<typeof checkAutomationStudioFlowBootstrapCompletion>[0], "registry" | "resolution">
): AutomationStudioFlowBootstrapIssue[] {
  return plan.subflows.flatMap((subflow, index) => (subflow.interface?.outputs ?? []).flatMap((output): AutomationStudioFlowBootstrapIssue[] => {
    const read = automationStudioInterfaceOutputPort(subflow, output.metadata?.binding, nodes);
    const way = "If no step of the part makes that value, drop the output, and have the step that needs the value read it where it is made.";
    if (read?.kind === "route") {
      return [{ severity: "error", code: "candidate.part_output_not_a_value", path: `plan.subflows.${index}`, message: `The output "${output.id}" of the part "${subflow.key}" is bound to the ${read.role} port "${read.port}" of one of its steps. That port says only whether the step ${read.role === "success" ? "worked" : "failed"}, and hands on no value. `
        + "Bind the output to a value one of the part's own steps reads or makes: `output: <name> = $step.<label>.<output>`, naming an output that holds that value. " + way }];
    }
    if (read?.kind !== "unknown") return [];
    return [{ severity: "error", code: "candidate.part_output_unknown_port", path: `plan.subflows.${index}`, message: `The output "${output.id}" of the part "${subflow.key}" is bound to "${read.port}" of one of its steps, and that step's node "${read.definitionId}" declares no output by that name: it declares only ${read.declared.join(", ") || "no output"}. That binding would hand on nothing when the Flow runs. `
      + "Bind the output to an output the step's node declares and that holds the value: `output: <name> = $step.<label>.<output>`. " + way }];
  }));
}

function changedPaths(before: JsonValue | undefined, after: JsonValue, path = "plan"): string[] {
  if (before === undefined) return [path];
  if (canonical(before) === canonical(after)) return [];
  if (before && after && typeof before === "object" && typeof after === "object") {
    const old = before as Record<string, JsonValue>, next = after as Record<string, JsonValue>;
    return [...new Set([...Object.keys(old), ...Object.keys(next)])].sort().flatMap((key) => next[key] === undefined ? [`${path}.${key}`] : changedPaths(old[key], next[key]!, `${path}.${key}`));
  }
  return [path];
}

/** JSON object key order never changes the submitted graph identity. */
function canonical(value: JsonValue): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  if (value && typeof value === "object") return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${canonical(value[key]!)}`).join(",")}}`;
  return JSON.stringify(value);
}
