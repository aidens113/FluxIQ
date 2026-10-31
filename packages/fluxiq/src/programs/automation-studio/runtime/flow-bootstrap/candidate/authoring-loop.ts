import type { JsonObject } from "../../../../../core/index.ts";
import { runAutomationStudioLlmEvidenceLoop, type AutomationStudioLlmEvidenceLoopInput, type AutomationStudioLlmEvidenceTool } from "../../llm/evidence-loop.ts";
import type { AutomationStudioLlmEvidenceRuntimeBinding } from "../../llm/index.ts";
import { automationStudioLlmEvidenceIsOpeningCallId as isOpeningCall } from "../../llm/evidence-loop/index.ts";
import { AUTOMATION_STUDIO_SITE_RESET_SETTLE_MS, AutomationStudioSiteResetStartCheck, automationStudioSiteResetPlacedCall, automationStudioSiteResetUndoesTool, type AutomationStudioSiteResetLedger, type AutomationStudioSiteResetTrialReset } from "../site-reset/index.ts";
import { renderAutomationStudioFlowScriptFormat } from "../script-examples/index.ts";
import type { AutomationStudioCandidateTrialPort, AutomationStudioFlowCandidate } from "./contracts.ts";
import { AutomationStudioFlowCandidateSubmissionController } from "./submission.ts";
import { automationStudioCandidateTestRequestKey } from "../test-request/index.ts";
import { automationStudioCandidateSubmissionRefusal } from "./submission-refusal.ts";
import { automationStudioCandidateStallRetest } from "./stall-retest.ts";
import { AUTOMATION_STUDIO_CANDIDATE_TEST_TOOL_ID, AutomationStudioFlowCandidateTrialGate } from "./trial-gate.ts";
import { automationStudioCandidateTrialView } from "./trial-view.ts";

/** The code a completion is refused under when it does not name the latest accepted submission, or there is none. */
const LATEST_REQUIRED = "candidate.latest_submission_required";

/** What a completion is told when no Flow has been submitted yet. */
function automationStudioCandidateNothingSubmitted(submitId: string, testId: string | undefined): string {
  return `No Flow has been submitted yet, so there is no revision or digest to complete with: never invent them. Write the whole Flow and submit it with ${submitId}; `
    + `${testId ? `test the revision it returns with ${testId}; then ` : "then "}complete with that revision and digest exactly as ${submitId} returned them.`;
}

/**
 * The Flow an accepted submission is, as the model sent it, labelled by its
 * revision and digest (t498), in words that stay true for good (t503).
 *
 * Every decision is a fresh request, and an accepted submission used to come
 * back as a revision, a digest and changed paths only. Live run
 * `run-mv6ff44s-01def7f6` therefore rewrote each revision from memory: the
 * only script in its context was a refused one, which it sent back word for
 * word three times after a later revision was accepted, and the repeat guard
 * ended the build. The accepted result now carries the whole script (or the
 * JSON plan) it accepted. It is written once, at the end of the evidence, and
 * never changes after (t501), so every request stays a byte prefix of the next.
 * It therefore never calls itself the current Flow: once a newer revision is
 * accepted that would be false, and lane C round 17 (`run-mv6lgqi6-4bfab2e1`)
 * was shown four scripts each saying so. Which revision is current is said
 * once, by Core's `core.current_flow` entry at the end of the window
 * (`../../llm/context-window.ts`).
 */
function acceptedScript(sent: JsonObject, candidate: Readonly<AutomationStudioFlowCandidate>): JsonObject {
  const said = `Revision ${candidate.revision} (digest ${candidate.digest}), as Core accepted it`;
  if (typeof sent.flow === "string") return { script: sent.flow, scriptIs: `${said}: script is its whole text.` };
  if (sent.plan !== undefined) return { plan: sent.plan, scriptIs: `${said}: plan is its whole JSON plan.` };
  return {};
}

/**
 * What a refused submission is, once a revision was accepted before it (t498):
 * no revision. Its script (`diagnostics.previous`, where the check gave one)
 * stays readable, since its issues name its lines. The label says what was
 * true when it was written and stays true (t503): the revision Core had
 * accepted last at that moment, under `latestAcceptedWhenSent` with the call
 * whose result holds its whole script. It neither calls that revision current
 * nor says to submit again from it: lane C round 17 (`run-mv6lgqi6-4bfab2e1`)
 * read "Submit again from revision 4's script" after revision 5 was accepted,
 * and sent revision 4's script three times. Which revision is current is said
 * once, at the end of the window (`../../llm/context-window.ts`). With nothing
 * accepted before it, `previous` is the only script there is and is corrected
 * as it stands: nothing is added.
 */
function refusedLabel(last: { revision: number; digest: string } | undefined, acceptedIn: ReadonlyMap<number, string>): JsonObject {
  const call = last ? acceptedIn.get(last.revision) : undefined;
  if (!last || call === undefined) return {};
  return {
    latestAcceptedWhenSent: { revision: last.revision, digest: last.digest, call },
    scriptIs: `This submission was refused and is no revision: nothing of it was kept. When it was sent, the latest revision Core had accepted was revision ${last.revision}, whose whole script is under call ${call}. `
      + "Read previous (under diagnostics, where given) only to find the lines the listed issues name."
  };
}

/**
 * Discovery, explicit complete submission, and a trial of the exact latest
 * submission (`./trial-gate.ts`). With a trial port the model completes only on
 * a yes for that revision and digest; without one it completes on the latest
 * valid submission as before. Either way the loop never promotes: the result
 * carries the standing verdict for its caller to act on.
 */
export async function runAutomationStudioFlowCandidateAuthoringLoop(input: {
  loop: Omit<AutomationStudioLlmEvidenceLoopInput, "draft" | "dryRun" | "checkCompletion" | "completionSchema" | "fullRunRequired" | "discoveryOnly">;
  /** `binding.startState`, when the domain has it, is how the site reset reads where the build began (`../site-reset/start-check.ts`). */
  submission: ConstructorParameters<typeof AutomationStudioFlowCandidateSubmissionController>[0] & { binding?: Pick<AutomationStudioLlmEvidenceRuntimeBinding, "startState" | "runsNodes" | "flowScriptExamples"> | undefined };
  trial?: { candidateId: string; port: AutomationStudioCandidateTrialPort };
  /**
   * This build's ledger of its own lasting acts (t462), the one its permission
   * wrapper tells every call it ran. With a trial port, each trial then runs
   * only once the model has put the site back (`./trial-gate.ts`), and the
   * library tool takes `undoes`. Without a trial port it changes nothing.
   */
  siteReset?: AutomationStudioSiteResetLedger | undefined;
  /** How far apart the reset's two reads of an untouched page are (t475); tests set 0. */
  siteResetSettleMs?: number | undefined;
  /** Told each submission Core accepted, so a caller whose loop then fails still knows the latest one (t362: a refused resubmission clears `latest`). */
  accepted?: (candidate: Readonly<AutomationStudioFlowCandidate>) => void;
  /**
   * Wraps the loop's input before it runs, so every seam -- each decision and
   * every tool call, the candidate's own two among them -- is observed for the
   * chat (the activity observer, `../../activity/observer.ts`). Injected rather
   * than imported, so this module never reaches into the activity stream.
   */
  observe?: (loop: AutomationStudioLlmEvidenceLoopInput) => AutomationStudioLlmEvidenceLoopInput;
}) {
  const signals = [input.loop.signal, input.submission.signal].filter((value): value is AbortSignal => value !== undefined);
  const signal = signals.length ? AbortSignal.any(signals) : undefined;
  const controller = new AutomationStudioFlowCandidateSubmissionController({ ...input.submission, ...(signal ? { signal } : {}) });
  const ledger = input.trial ? input.siteReset : undefined;
  // Every read the reset decides on is settled, so content that changes by itself is not taken for an act's (t475).
  const startCheck = ledger ? new AutomationStudioSiteResetStartCheck({ binding: input.submission.binding, projectId: input.submission.projectId, flowId: input.submission.flowId, tools: input.loop.tools, executeTool: (call) => input.loop.executeTool(call), liveCheck: { settleMs: input.siteResetSettleMs ?? AUTOMATION_STUDIO_SITE_RESET_SETTLE_MS } }) : undefined;
  const reset: AutomationStudioSiteResetTrialReset | undefined = ledger && startCheck ? {
    // Each act still to undo is looked for on its own page, then the start is compared (`../site-reset/ledger.ts`, t471); after a start hook, every act (t475).
    // Core looks at an open act's watched place itself, and the settled read reaches the ledger like any other (L1).
    beforeTrial: (resetSignal, cannotUndo, options) => ledger.beforeTrial({
      compare: () => startCheck.compare(resetSignal),
      compareAt: (place) => startCheck.compareAt(place, resetSignal),
      // A trial's after-reading passes its before-reading's state, so the read says what changed in lines (t775).
      lookAt: async (location, start) => {
        const read = await startCheck.lookAt(location, resetSignal, start);
        if (!("unread" in read)) ledger.observed(read);
      }
    }, cannotUndo, options),
    trialRan: (acts, trialRunId) => ledger.trialRan(acts, trialRunId)
  } : undefined;
  const gate = new AutomationStudioFlowCandidateTrialGate({ latest: () => controller.latest(), trial: input.trial, signal, ...(reset ? { reset } : {}) });
  const submitId = "core.submit_candidate", testId = AUTOMATION_STUDIO_CANDIDATE_TEST_TOOL_ID;
  /** The call each accepted revision was submitted in, so a refusal can name where the latest accepted script is (t498). */
  const acceptedIn = new Map<number, string>();
  const scriptFormat = renderAutomationStudioFlowScriptFormat(input.submission.binding?.flowScriptExamples);
  const tool: AutomationStudioLlmEvidenceTool = {
    toolId: submitId, effect: "observe",
    description: `Submit a complete Flow, written as a Flow script under "flow" (its description gives the format and examples), or an existing canonical JSON plan under "plan". Discovery calls are evidence only and never enter the Flow. Static validity returns a draft revision/digest, never semantic acceptance. Correct all diagnostics and resubmit the entire candidate. Then test that exact revision with ${testId}, and complete with the latest revision and digest only after its trial answers yes.`,
    // The format rides on the input schema, as the legacy completion schema carries it: a tool description is bounded at 2,000 characters.
    inputSchema: { type: "object", properties: { flow: { type: "string", description: `The whole Flow as a script. ${scriptFormat.format}\n${scriptFormat.act}\n${scriptFormat.loop}\n${scriptFormat.state}` }, plan: { type: "object" }, summary: { type: "string" } }, additionalProperties: false }
  };
  // A completion with nothing accepted says so and names the way out: lane C
  // (`run-mv0pa79q-ef91811b`) never submitted a Flow and completed four times
  // with an invented revision and digest, each refused with words that never
  // said nothing had been submitted. A completion that names the wrong
  // revision is told the one to complete with. Both keep one issue code, which
  // the build's ending reads (`../../conversations/commands/progress.ts`).
  const checkCompletion: NonNullable<AutomationStudioLlmEvidenceLoopInput["checkCompletion"]> = async (result) => {
    const candidate = controller.latest();
    if (!candidate) return { ok: false, issueCodes: [LATEST_REQUIRED], feedback: { code: LATEST_REQUIRED, submitted: false, instruction: automationStudioCandidateNothingSubmitted(submitId, gate.available ? testId : undefined) } };
    if (!(typeof result.revision === "number" && typeof result.digest === "string" && controller.matches({ revision: result.revision, digest: result.digest, baseDependencyDigest: candidate.baseDependencyDigest }) && Object.keys(result).every((key) => key === "revision" || key === "digest"))) {
      return { ok: false, issueCodes: [LATEST_REQUIRED], feedback: { code: LATEST_REQUIRED, submitted: true, revision: candidate.revision, digest: candidate.digest,
        instruction: `This is not the latest Flow you submitted. Complete with exactly {"revision": ${candidate.revision}, "digest": "${candidate.digest}"} and nothing else${gate.available ? `, after ${testId} has answered yes for that revision` : ""}; or, if the Flow still needs changes, submit the whole Flow again with ${submitId} and complete with the revision and digest it returns.` } };
    }
    return gate.completion({ revision: candidate.revision, digest: candidate.digest });
  };
  const discovery: AutomationStudioLlmEvidenceLoopInput = {
    ...input.loop, ...(signal ? { signal } : {}), draft: false, dryRun: false, discoveryOnly: true,
    requestContextKey: (toolId) => toolId === testId ? automationStudioCandidateTestRequestKey(controller.latest()) : input.loop.requestContextKey?.(toolId),
    // A stall tests the latest revision instead of ending the build, while it can still be tested (`./stall-retest.ts`, t477).
    recoverStall: automationStudioCandidateStallRetest(gate),
    tools: [...input.loop.tools.filter((item) => item.toolId !== "core.run_flow" && item.toolId !== submitId && item.toolId !== testId).map((item) => reset ? automationStudioSiteResetUndoesTool(item) : item), tool, gate.tool],
    completionSchema: { type: "object", properties: { revision: { type: "integer" }, digest: { type: "string" } }, required: ["revision", "digest"], additionalProperties: false },
    executeTool: async (call) => {
      // The start is read once, right after the opening call, or before the first later call when there was none (`../site-reset/start-check.ts`).
      const opening = isOpeningCall(call.callId);
      if (startCheck && !opening) await startCheck.capture(call.signal ?? signal);
      // A trial leaves the target where the model has not looked: its answer carries the page it left (`./trial-view.ts`, t477).
      // One the reset's own looks moved, though no trial ran, carries that page too (`../site-reset/start-check.ts` `moves`, t738).
      if (call.toolId === testId) {
        const before = startCheck?.moves;
        const answer = await gate.test(call.value, call.signal);
        const targetMoved = before !== undefined && startCheck!.moves > before;
        return automationStudioCandidateTrialView({ answer, targetMoved, tools: input.loop.tools, executeTool: (look) => input.loop.executeTool(look), callId: call.callId, signal: call.signal ?? signal });
      }
      if (call.toolId !== submitId) {
        // A call that makes or undoes an act is read around, so the reset can look for it on its own page (`../site-reset/act-places.ts`).
        const ran = ledger && startCheck && !opening
          ? await automationStudioSiteResetPlacedCall({ call, ledger, reader: startCheck, signal: call.signal ?? signal, run: () => input.loop.executeTool(call) })
          : await input.loop.executeTool(call);
        if (startCheck && opening) await startCheck.capture(call.signal ?? signal);
        return ran;
      }
      // What the gate knows of the current revision's trial, so a Flow sent again
      // unchanged, or one the judge refuted, is refused with what failed last
      // rather than made a new revision told to "test next" (t464, `./unchanged-submission.ts`).
      const submitted = await controller.submit(call.value, { trialOf: (candidate) => gate.standing(candidate), refuted: (digest) => gate.refuted(digest) });
      // A refused submission names its way out and counts in the loop's run of refusals of one kind (`./submission-refusal.ts`),
      // and, once a revision was accepted, names the latest one as it stood when this was sent (header of `refusedLabel`, t498, t503).
      if (!submitted.ok) {
        const refusal = automationStudioCandidateSubmissionRefusal(submitted);
        return { kind: "llm_evidence_tool_execution", effectApplied: false, targetsUnchanged: true, ...refusal, evidence: { ...refusal.evidence, ...refusedLabel(controller.lastAccepted(), acceptedIn) } };
      }
      input.accepted?.(structuredClone(submitted.candidate));
      acceptedIn.set(submitted.candidate.revision, call.callId);
      const evidence: JsonObject = { ok: true, status: "draft", revision: submitted.candidate.revision, digest: submitted.candidate.digest, changedPaths: submitted.candidate.changedPaths, verification: "not_performed", promotionAllowed: false,
        // Which view each target was resolved from, so a step aimed at a control of another page than the one it runs on can be seen (t358).
        ...(submitted.handleViews.length ? { handleViews: submitted.handleViews.map((view) => ({ node: view.node, handle: view.handle, view: view.view, location: view.location })) } : {}),
        ...(submitted.advice?.length ? { advice: submitted.advice } : {}),
        // The whole Flow this revision is, as it was sent, labelled by its revision (t498, t503).
        ...acceptedScript(call.value, submitted.candidate),
        next: gate.available ? `Test next with ${testId} using exactly {"revision": ${submitted.candidate.revision}, "digest": "${submitted.candidate.digest}"}. Do not complete until that exact revision's trial answers yes. Submitting again makes a new revision that needs its own trial.` : "No trial runner is available here; completing leaves an unverified draft." };
      return { kind: "llm_evidence_tool_execution", evidence, effectApplied: false, targetsUnchanged: true };
    }
  };
  // Observed here, around the two candidate tools, and not by the caller around
  // `input.loop`: there, saving and testing the Flow had no rows, so the chat
  // showed no card for either (t366, t373). The completion check stays outside
  // it: completing is allowed only after a passed test, which that test's card
  // already says, and the observer's completion note is the legacy round's
  // ("it still has to run cleanly").
  const loop = await runAutomationStudioLlmEvidenceLoop({ ...(input.observe ? input.observe(discovery) : discovery), checkCompletion });
  const candidate = controller.latest();
  return { loop, candidate, trial: gate.standing(candidate), promotionAllowed: false as const };
}
