// Building a Flow by exploring the site: the step create-here, explore and
// improve share.
//
// The request is the one the panel's "Explore and build" and "Improve
// automation" send (`generate-flow-bootstrap-adaptation`, evidence-guided),
// plus what only the chat knows: the page the person has open, as the place
// the Flow starts, and what reading the person's message cost, which the build
// carries in the Flow's creation purse (the rule is a ceiling per Flow, and the
// chat call that decided to build it is part of that Flow's cost). The session
// travels as `authSessionId` because the endpoint refuses a request whose
// session is not the caller's own.
//
// How the build is authored is Core's authoring mode
// (`../../../model/authoring-mode/`), read through
// `automationStudioConversationAuthorsCandidates` below by the commands too, for
// their descriptors, their first reply and their result:
// `legacy` asks for a proposed adaptation the command then applies or asks
// about; `candidate` asks for a candidate Core test-runs once from its start
// (t340). A candidate whose test was judged yes twice comes back as a proposal
// naming that candidate and trial, which the command applies or asks about
// exactly as a legacy one; anything else is a saved draft, which nothing
// applies, and the command says plainly what the test came to
// (`automationStudioConversationCandidateDraftSaid`).

import { resolveAutomationStudioAuthoringMode } from "../../../model/authoring-mode/index.ts";
import { parseAutomationStudioCandidateAuthoringResult, parseAutomationStudioCandidateProposalResult, type AutomationStudioCandidateAuthoringResult } from "../../flow-bootstrap/authoring-result/index.ts";
import { parseAutomationStudioFlowBootstrapCandidateKept, type AutomationStudioFlowBootstrapCandidateKept } from "../../flow-bootstrap/generation-failure/index.ts";
import type { AutomationStudioConversationCommandCallResult, AutomationStudioConversationCommandContext } from "./command.ts";
import { automationStudioConversationCallCause } from "./progress.ts";

/** What a create-here, explore or improve says once its candidate draft is saved with no trial runner (candidate mode only). */
export const AUTOMATION_STUDIO_CONVERSATION_CANDIDATE_SAVED = "Saved a candidate draft. Verification pending; the Flow's steps are unchanged.";

/**
 * What a create-here, explore or improve says when its candidate stayed a
 * draft: what the test run of the whole Flow came to, in plain words, and that
 * nothing was put into the Flow. A draft is never applied.
 */
export function automationStudioConversationCandidateDraftSaid(candidate: AutomationStudioCandidateAuthoringResult): string {
  const trial = candidate.trial;
  if (!trial) return AUTOMATION_STUDIO_CONVERSATION_CANDIDATE_SAVED;
  const kept = "so nothing was put into the Flow. I kept what I wrote as a draft.";
  if (trial.verdict === "yes") {
    if (trial.codes.includes("FLOW_BOOTSTRAP_STALE")) return `Its test run from the start was judged to do what you asked, but the Flow or what it should do changed before the change could be made, ${kept}`;
    return `Its test run from the start was judged to do what you asked, but the draft I saved no longer matched the one that was tested, ${kept}`;
  }
  const said: Record<Exclude<typeof trial.verdict, "yes">, string> = {
    no: "Its test run from the start was judged not to do what you asked,",
    unsure: "I could not confirm that its test run from the start did what you asked,",
    not_judged: "Its test run from the start was not checked,",
    execution_failed: "Its test run from the start did not get to the end,",
    not_tested: "It was never test-run from the start,"
  };
  return `${said[trial.verdict]} ${kept}`;
}

/** How a test run from the start came out, in words that finish "the last test run ...". */
const LAST_TRIAL: Readonly<Record<AutomationStudioFlowBootstrapCandidateKept["trials"][number]["verdict"], string>> = Object.freeze({
  yes: "was judged to do what you asked",
  no: "was judged not to do what you asked",
  unsure: "could not be confirmed to do what you asked",
  not_judged: "was not checked",
  execution_failed: "did not get to the end"
});

/**
 * What a candidate build that failed kept, in plain words (t362): whether the
 * latest version of the Flow's steps it wrote was kept as a draft, that
 * nothing was put into the Flow, and how its test runs from the start came
 * out. Round 4 (`run-muyrpbnk-fef374e7`, C6) said the Flow "has no steps yet"
 * over four saved revisions and two test runs. Nothing when the model never
 * wrote a version Core accepted: then there is nothing to say beyond the Flow
 * having no steps. Never a revision number, a candidate id or a code.
 */
export function automationStudioConversationCandidateKeptSaid(candidate: AutomationStudioFlowBootstrapCandidateKept): string | undefined {
  if (candidate.revision === undefined) return undefined;
  const kept = candidate.draft === "saved"
    ? "I kept the latest version of the Flow's steps that I wrote as a draft, but nothing was put into the Flow."
    : "The latest version of the Flow's steps that I wrote could not be kept, and nothing was put into the Flow.";
  const last = candidate.trials.at(-1);
  if (candidate.trialCount === 0 || !last) return `${kept} It was never test-run from the start.`;
  const times = candidate.trialCount === 1 ? "once" : candidate.trialCount === 2 ? "twice" : `${candidate.trialCount} times`;
  const lastSaid = candidate.trialCount === 1 ? `and that test run ${LAST_TRIAL[last.verdict]}` : `and the last test run ${LAST_TRIAL[last.verdict]}`;
  return `${kept} A version of it was test-run from the start ${times}, ${lastSaid}.`;
}

/**
 * What a candidate build did before its steps went in, as the ready line's
 * last clause (candidate mode only). The ready line used to keep the legacy
 * build's words, "I tried its steps on the page you had open and put the ones
 * that worked into it", which a candidate build never did: it explores, writes
 * the whole Flow, and puts it in only after a test run of the whole Flow from
 * its start is judged to do what was asked; the person is told that plainly
 * (t370, lane A round 7 UI).
 */
export const AUTOMATION_STUDIO_CONVERSATION_CANDIDATE_JUDGED = "checked it with a test run from the start";

/** True when Core authors candidate drafts instead of proposing adaptations; read each time it matters. */
export function automationStudioConversationAuthorsCandidates(): boolean {
  return resolveAutomationStudioAuthoringMode() === "candidate";
}

export type AutomationStudioConversationBuildResult =
  | {
      ok: true;
      status: "proposed";
      adaptationId: string;
      /** True when the build finished holding a question: the change cannot be applied until it is answered. */
      awaitingPermission: boolean;
      /** Candidate mode only: the trial run whose confirmed yes made this proposal. */
      trial?: { runId: string; calls: number };
    }
  /** Candidate mode only: saved authoring, never a verified or executable result. */
  | { ok: true; status: "draft"; candidate: AutomationStudioCandidateAuthoringResult }
  /**
   * `ending` is the build's own account for the person, when it gave one; the
   * answer opens with it (`./progress.ts`). `kept` is true when the build kept
   * the steps it had found as an incomplete draft that building again carries
   * on from, though the Flow itself holds none of them
   * (`diagnostic.evidenceLoop.incompleteDraft`,
   * `../../flow-bootstrap/generation-failure/diagnostic.ts`). `candidateKept`
   * is what a candidate build that failed kept, said for the person
   * (`automationStudioConversationCandidateKeptSaid`); a candidate draft is not
   * carried on from, so `kept` stays about the incomplete draft alone.
   */
  | { ok: false; cause: string; ending?: string; kept: boolean; candidateKept?: string };

export async function buildAutomationStudioFlowFromConversation(
  context: AutomationStudioConversationCommandContext,
  input: { flowId: string; mode: "create" | "extend" }
): Promise<AutomationStudioConversationBuildResult> {
  const candidateMode = automationStudioConversationAuthorsCandidates();
  const response = await context.port.call("generate-flow-bootstrap-adaptation", {
    projectId: context.projectId,
    flowId: input.flowId,
    authSessionId: context.sessionId,
    evidenceGuided: true,
    ...(candidateMode ? { authoringMode: "candidate" } : {}),
    // An extend amends the Flow's own steps from where the Flow already
    // starts; the page on screen is a creation's starting point.
    ...(input.mode === "extend" ? { mode: "extend" } : context.startLocation ? { startLocation: context.startLocation } : {}),
    ...(context.interpretationCostUsd === undefined ? {} : { interpretationCostUsd: context.interpretationCostUsd })
  });
  if (!response.ok) {
    const ending = (response.payload as { cancelled?: boolean } | undefined)?.cancelled === true ? "Build stopped. The Flow was not promoted." : buildEnding(response);
    const candidateKept = keptCandidate(response);
    return { ok: false, cause: automationStudioConversationCallCause("the build", response), ...(ending ? { ending } : {}), kept: keptDraft(response), ...(candidateKept ? { candidateKept } : {}) };
  }
  if (candidateMode) {
    const subject = { projectId: context.projectId, flowId: input.flowId };
    // A proposal counts only with the candidate and trial behind it: one without is never applied.
    const proposal = parseAutomationStudioCandidateProposalResult(response.payload, subject);
    if (proposal) return { ok: true, status: "proposed", adaptationId: proposal.adaptationId, awaitingPermission: proposal.awaitingPermission, trial: { runId: proposal.candidate.trial.runId, calls: proposal.candidate.trial.calls } };
    const candidate = parseAutomationStudioCandidateAuthoringResult(response.payload, subject);
    if (!candidate) return { ok: false, cause: "the build answered without a tested change or a valid candidate draft for this Flow", kept: false };
    return { ok: true, status: "draft", candidate };
  }
  const payload = response.payload as { candidate?: { status?: unknown }; adaptation?: { status?: unknown; adaptationId?: unknown; permissionRequest?: unknown } } | undefined;
  if (payload?.candidate?.status === "draft" || payload?.adaptation?.status === "draft") return { ok: false, cause: "the build returned an unverified draft, so no change was applied", ending: "Saved a candidate draft. It still needs independent execution and verification; the Flow's steps are unchanged.", kept: true };
  const adaptation = payload?.adaptation;
  if (!adaptation || adaptation.status !== "proposed" || typeof adaptation.adaptationId !== "string" || !adaptation.adaptationId) {
    return { ok: false, cause: "the build answered without the change it made", kept: false };
  }
  return { ok: true, status: "proposed", adaptationId: adaptation.adaptationId, awaitingPermission: Boolean(adaptation.permissionRequest) };
}

/**
 * The build's own account of why it could not finish, written for the person --
 * not doable and why, or the budget that ran out
 * (`../../flow-bootstrap/generation-failure/build-ending.ts`) -- when the failed
 * call carries one. The command's answer opens with it alone (`./progress.ts`).
 */
function buildEnding(response: AutomationStudioConversationCommandCallResult): string | undefined {
  const ending = (response.payload as { diagnostic?: { ending?: { message?: unknown } } } | undefined)?.diagnostic?.ending?.message;
  return typeof ending === "string" && ending.trim() ? ending.trim() : undefined;
}

/** Whether the failed build kept an incomplete draft for the next build to carry on from: its diagnostic names one with at least one step. */
function keptDraft(response: AutomationStudioConversationCommandCallResult): boolean {
  const draft = (response.payload as { diagnostic?: { evidenceLoop?: { incompleteDraft?: { steps?: unknown } } } } | undefined)?.diagnostic?.evidenceLoop?.incompleteDraft;
  return typeof draft?.steps === "number" && draft.steps > 0;
}

/** What a failed candidate build kept, said for the person, when its diagnostic names the candidate (`diagnostic.candidate`). */
function keptCandidate(response: AutomationStudioConversationCommandCallResult): string | undefined {
  const candidate = parseAutomationStudioFlowBootstrapCandidateKept((response.payload as { diagnostic?: { candidate?: unknown } } | undefined)?.diagnostic?.candidate);
  return candidate ? automationStudioConversationCandidateKeptSaid(candidate) : undefined;
}
