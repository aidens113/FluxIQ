// The Flow the attempt leaves behind (plan, D3, D11): the steps the model authored, assembled by
// the same check a legacy completion goes through and saved as an unverified candidate, which
// nothing runs or applies. Best effort, always: a draft that cannot be assembled or saved costs
// the draft and never the result, and the steps stay on the attempt's row, so nothing is lost.
//
// **Nobody is asked here.** The permission check handed to the assembly grants every step, because
// a step that did not run has done nothing, and a draft runs nothing. Asking would put a question
// to a person at the end of a task (plan, D13: never in the middle of a Flow), and it is the
// later attempt that runs this draft which goes through the gates.
//
// **A step on a control this attempt saw flip checks before it presses** (`../flow-run/stated-toggles.ts`),
// worked out here where the attempt's handles still mean what they meant, and kept by the task with
// the steps. A person's Run again learns nothing new of which state is wanted: what it flipped, it
// flipped because it was told to, so a step keeps what it had.
//
// **The saved Flow reads what the answer was read as** (lane t905). The answer is the output step's current version
// (`../result/`): a Flow whose read of it lost its conditions or columns is refused here and kept as steps, never saved
// to hand the next attempt another list (`../result/output-saved.ts`, run-mwcess01). And a read the result folded into a
// paging loop's read step (the same list read the same way, D2), with the press that only moved that list on for it, is
// left out: it is the loop's own work done again by hand, and saved after the loop it stops the Flow on a press with
// nothing left to press (`../result/loop-copies.ts`, run-mwcncux8).

import { randomUUID } from "node:crypto";
import { automationStudioCandidateFingerprint as fingerprint, type AutomationStudioFlowCandidate } from "../../../../../runtime/flow-authoring/bootstrap/candidate/index.ts";
import { automationStudioLlmStepLogNote, checkAutomationStudioFlowBootstrapCompletion } from "../../../../../runtime/llm/index.ts";
import type { AutomationStudioFlowCandidateDraftRecord } from "../../candidate-drafts/index.ts";
import { automationStudioFlowDraftStepCopy } from "../../../../../runtime/flow-authoring/draft/index.ts";
import { automationStudioAnswerFirstInputBoundSteps, automationStudioAnswerFirstStampedPlan, automationStudioAnswerFirstStatedToggles } from "../flow-run/index.ts";
import { automationStudioAnswerFirstResultLoopCopies, automationStudioAnswerFirstResultOutputSaved, type AutomationStudioAnswerFirstResultVersion } from "../result/index.ts";
import { automationStudioAnswerFirstResultVersionOf } from "../result-feed/index.ts";
import type { AutomationStudioAnswerFirstStatedToggle } from "../task-memory/index.ts";
import { automationStudioAnswerFirstAccounting } from "./accounting.ts";
import type { AutomationStudioAnswerFirstAttemptRun } from "./state.ts";

export type AutomationStudioAnswerFirstDraftOutcome =
  | { kind: "saved"; record: AutomationStudioFlowCandidateDraftRecord; stated: AutomationStudioAnswerFirstStatedToggle[] }
  | { kind: "kept"; why: "not_assembled" | "not_saved"; codes: readonly string[] };

export async function automationStudioAnswerFirstSaveDraft(run: AutomationStudioAnswerFirstAttemptRun, summary: string): Promise<AutomationStudioAnswerFirstDraftOutcome> {
  const { input } = run;
  try {
    // A caller's input values become the Flow's inputs before anything is assembled, so the draft and the steps the task keeps (`./remember.ts`, after this) both hold the bindings (`../flow-run/input-bound-steps.ts`).
    if (input.caller?.inputs) run.steps = automationStudioAnswerFirstInputBoundSteps(run.steps, input.caller.inputs);
    withoutLoopCopies(run);
    const verdict = await checkAutomationStudioFlowBootstrapCompletion({
      result: { summary }, projectId: input.projectId, flowId: input.flowId, registry: input.registry, resolution: input.resolution, size: input.size, binding: input.binding,
      permissionFor: () => async () => ({ permitted: true, missing: [], requestId: null }),
      draftSteps: run.steps, routeSignaturesOf: input.routing.signaturesOf, instructionText: input.instructionText,
      ...(input.startLocation === undefined ? {} : { startLocation: input.startLocation })
    });
    if (!verdict.ok) {
      // Codes belong in a step log, which a person does not read: without them nobody can say why a draft saved nothing.
      // Each issue's code and where it is, as the next attempt's opening prints them (`./opening.ts`): which step, and not only that some step failed.
      automationStudioLlmStepLogNote(`The draft was refused and kept as steps only: ${[...verdict.codes, ...verdict.issues.map((issue) => `${issue.code} at ${issue.path}`)].join(", ") || "no code given"}`);
      return { kind: "kept", why: "not_assembled", codes: verdict.codes };
    }
    const held = automationStudioAnswerFirstResultOutputSaved(run.result.port.outputStep(), savedReads(run, verdict));
    if (!held.ok) {
      automationStudioLlmStepLogNote(`The draft was refused and kept as steps only: ${held.code}. ${held.said}`);
      return { kind: "kept", why: "not_assembled", codes: [held.code] };
    }
    const stated = statedOf(run, verdict);
    const record = await input.stores.drafts.save(draftRecord(run, verdict.summary, automationStudioAnswerFirstStampedPlan(input, verdict.buildPlan, verdict.locator, run.steps, stated)));
    // Its parts go to the library; a failure there is reported by name on the trace and changes nothing here (`../../project-parts/draft-parts.ts`).
    await input.parts?.saveDraft({ projectId: input.projectId, flowId: input.flowId, candidateId: record.candidateId, buildPlan: verdict.buildPlan, instructionIds: input.instructionIds, instructionText: input.instructionText, startLocation: input.startLocation });
    return { kind: "saved", record, stated };
  } catch (error) {
    const code = error instanceof Error ? error.name : "unknown";
    automationStudioLlmStepLogNote(`The draft could not be saved and was kept as steps only: ${code}`);
    return { kind: "kept", why: "not_saved", codes: [code] };
  }
}

/** The draft without the reads that repeat a paging loop's own work by hand, and the presses that moved the list on for them (header). */
function withoutLoopCopies(run: AutomationStudioAnswerFirstAttemptRun): void {
  run.result.draft(run.steps);
  const copies = automationStudioAnswerFirstResultLoopCopies(run.steps, run.result.port.ledger(), run.result.idOf);
  if (!copies.size) return;
  run.steps = run.steps.map((step) => (copies.has(step) ? { ...automationStudioFlowDraftStepCopy(step), disposition: "dropped" as const } : step));
  run.result.draft(run.steps);
  automationStudioLlmStepLogNote(`Left out of the saved Flow as a paging loop's own work done again by hand: steps ${[...copies].map((step) => step.position).sort((one, other) => one - other).join(", ")}.`);
}

/** What the assembled plan reads for each draft step it holds a read of, by the step's id in the result (`../result-feed/feed.ts`). */
function savedReads(run: AutomationStudioAnswerFirstAttemptRun, verdict: Extract<Awaited<ReturnType<typeof checkAutomationStudioFlowBootstrapCompletion>>, { ok: true }>): Map<string, AutomationStudioAnswerFirstResultVersion> {
  const saved = new Map<string, AutomationStudioAnswerFirstResultVersion>();
  for (const [subflowIndex, subflow] of verdict.buildPlan.plan.subflows.entries()) {
    for (const [nodeIndex, node] of subflow.nodes.entries()) {
      const place = verdict.locator?.nodes[`${subflowIndex}.${nodeIndex}`];
      const step = place === undefined ? undefined : run.steps.find((each) => (place.draftStepId !== undefined ? each.id === place.draftStepId : each.position === place.draftStep));
      if (step) saved.set(run.result.idOf(step), automationStudioAnswerFirstResultVersionOf({ parameters: node.parameters ?? {} }));
    }
  }
  return saved;
}

/** What each step checks for: what it was already known to, and what this attempt saw flip. A care taken: one that cannot be worked out costs the draft nothing. */
function statedOf(run: AutomationStudioAnswerFirstAttemptRun, verdict: Extract<Awaited<ReturnType<typeof checkAutomationStudioFlowBootstrapCompletion>>, { ok: true }>): AutomationStudioAnswerFirstStatedToggle[] {
  const held = automationStudioAnswerFirstHeldStated(run);
  if (run.askedAgain) return held;
  try {
    const seen = seenFlipping(run, verdict);
    return [...held.filter((each) => !seen.some((other) => other.step === each.step)), ...seen];
  } catch (error) {
    automationStudioLlmStepLogNote(`The saved steps' checked states could not be worked out, so they stay plain presses: ${error instanceof Error ? error.name : "unknown"}`);
    return held;
  }
}

/** The steps this attempt saw flip their own control (`../flow-run/stated-toggles.ts`). */
function seenFlipping(run: AutomationStudioAnswerFirstAttemptRun, verdict: Extract<Awaited<ReturnType<typeof checkAutomationStudioFlowBootstrapCompletion>>, { ok: true }>): AutomationStudioAnswerFirstStatedToggle[] {
  const { input } = run;
  return automationStudioAnswerFirstStatedToggles({
    buildPlan: verdict.buildPlan, locator: verdict.locator, handleViews: verdict.handleViews, explored: run.permissions?.exploredToggles?.list() ?? [], saved: run.steps,
    takesEnsureState: (definitionId) => input.registry.get(definitionId, input.resolution)?.parameters.some((parameter) => parameter.id === "ensureState") === true
  });
}

/** What the Flow it started from already checked, for the steps it still holds. */
export function automationStudioAnswerFirstHeldStated(run: Pick<AutomationStudioAnswerFirstAttemptRun, "route" | "steps">): AutomationStudioAnswerFirstStatedToggle[] {
  const kept = run.route === undefined || run.route.kind === "build" ? undefined : run.route.saved.stated;
  return (kept ?? []).filter((each) => run.steps.some((step) => (step.id ?? `#${step.position}`) === each.step));
}

function draftRecord(run: AutomationStudioAnswerFirstAttemptRun, summary: string, buildPlan: AutomationStudioFlowCandidate["buildPlan"]): AutomationStudioFlowCandidateDraftRecord {
  const { input } = run;
  const base = { baseDependencyDigest: input.baseDependencyDigest, instructionText: input.instructionText, projectId: input.projectId, flowId: input.flowId };
  const common = {
    kind: "flow_candidate_draft" as const, status: "draft" as const, verification: "not_performed" as const,
    candidateId: `candidate.${randomUUID()}`, projectId: input.projectId, flowId: input.flowId, sourceInstructionIds: [...input.instructionIds], instructionText: input.instructionText,
    baseSettingsRevision: input.baseSettingsRevision, accounting: automationStudioAnswerFirstAccounting(run), createdAt: Date.now()
  };
  const candidate = { revision: 1, baseDependencyDigest: input.baseDependencyDigest, status: "draft" as const, summary, buildPlan, changedPaths: [] };
  if (!input.source) return { ...common, schemaVersion: 1, candidate: { ...candidate, digest: fingerprint.candidate({ ...base, buildPlan }) } };
  const { originalSources, originalInstructionsDigest } = input.source;
  return {
    ...common, schemaVersion: 2, originalSources, originalInstructionsDigest, sourceInstructionIds: [...originalSources.effectiveInstructionIds],
    candidate: { ...candidate, digest: fingerprint.candidate({ ...base, buildPlan, originalInstructionsDigest }), fingerprintVersion: "candidate.plan+original_sources.v2", originalInstructionsDigest }
  };
}
