import { randomUUID } from "node:crypto";
import type { AutomationStudioRuntimeSession } from "../../../model/index.ts";
import type { AutomationStudioCandidateTrialAct } from "../../flow-bootstrap/candidate/index.ts";
import type { AutomationStudioSubflowProposal, AutomationStudioSubflowScope } from "../../flow-bootstrap/subflow-candidate/index.ts";
import { runAutomationStudioDetachedSubflow, type AutomationStudioDetachedSubflowIdentity, type AutomationStudioDetachedSubflowProposal } from "../../flow-bootstrap/verification/index.ts";
import { automationStudioCandidateFrameEvidence, automationStudioCandidateTrialLandedActs, type AutomationStudioCandidateTrialStart } from "../candidate-trial/index.ts";
import { automationStudioSubflowTrialPredecessorGap } from "../subflow-trial/index.ts";
import type { AutomationStudioProjectBuildProposals } from "./proposals.ts";
import type { AutomationStudioProjectBuildTrialEnvironment } from "./whole-trials.ts";

// A dependent builder's entry, prepared before its first look (bigbox debug
// fix 8, t580). A builder used to explore from the build's start, not from
// where its predecessors leave the site, so every act it explored landed in
// the wrong state: on run `run-mv8186yr-a385fd3a` every add was explored before
// the store switch it depended on, and so made with the wrong fulfilment.
//
// So before a builder whose subflow has predecessors takes its first look,
// its predecessors' latest passing proposals run once, exactly as its own
// subflow trial will run them to reach its entry: the same proposals
// (`./proposals.ts`, only one whose trial answered yes), checked as that trial
// checks them (`../subflow-trial/predecessor-gap.ts`), the same arrival at the
// build's start location first (t578), and the same detached runner, with the
// last predecessor as the run's target and the others before it. Nothing is
// judged and no model is called: the run only puts the site where this
// builder's subflow begins. It runs in a runtime session of its own, marked
// `metadata.entryPreparation`, and every lasting act it lands is handed back
// so the brief's ledger holds it for a reset, as a trial's are.
//
// **It is step (d) of the phase's start (t593).** The deployment's start hook
// and the reset over the build's ledgers come first, once, for every phase
// alike (`./phase-start.ts`); this is handed the start the hook made and runs
// nothing when it failed. It used to run the hook itself, so a builder with no
// predecessors -- which never came here -- explored on whatever the last trial
// left (A8 bigbox `run-mv8c7unr-42a8456d`).
//
// Where it cannot run -- a predecessor has no passing proposal yet, the start
// failed, or a predecessor's run did not reach its end -- the answer says so
// and why, and the builder is told plainly that its entry is not prepared
// (`./brief-ports.ts`).
//
// **A proposal an amendment kept runs too (t590).** A predecessor's passing
// proposal counts when it was made under the brief's own plan, or under an
// earlier plan whose proposal for that subflow the plan in force kept because
// it left the subflow as it was (`project-agents/supervisor/state.ts`). The
// supervisor tells the build which it kept (`ports.kept`), and the build's
// proposals answer it here (`keptUnder`, wired in `./run.ts`); a proposal the
// amendment dropped, or one of another build, is still refused as stale.

/** Whether a passing proposal made under an earlier plan is one the plan in force kept for that subflow (t590). */
export type AutomationStudioProjectBuildKeptProposals = { keptUnder(subflowKey: string, madeUnder: string, planDigest: string): boolean };

/** What preparing a builder's entry came to. */
export type AutomationStudioProjectBuildEntry =
  /** The subflow has no predecessors: the build's start is its entry. */
  | { kind: "start" }
  /** Every predecessor ran to its end, in order. */
  | { kind: "prepared"; predecessors: string[]; runId: string; acts: AutomationStudioCandidateTrialAct[] }
  | { kind: "unprepared"; predecessors: string[]; code: string; missing?: string[]; failed?: string; runId?: string; acts: AutomationStudioCandidateTrialAct[] };

export async function automationStudioProjectBuildPrepareEntry(input: {
  scope: AutomationStudioSubflowScope;
  /** The build's proposals; `keptUnder` where the build can say which an amendment kept (header), so none is kept without it. */
  proposals: Pick<AutomationStudioProjectBuildProposals, "predecessors"> & Partial<AutomationStudioProjectBuildKeptProposals>;
  environment: AutomationStudioProjectBuildTrialEnvironment;
  /** The start the phase's start made (header); a failed one runs nothing. */
  start: AutomationStudioCandidateTrialStart;
  signal: AbortSignal;
  /**
   * The domain's arrival node (`runsNodes.arrival`), where the build has a
   * start location (`./phase-start.ts`). The run goes there first, so it
   * starts on a loaded start page, as a subflow trial does (t578).
   */
  arrival?: { node: string; parameter: string } | undefined;
  /** The detached runner; replaced only by tests. */
  execute?: typeof runAutomationStudioDetachedSubflow | undefined;
  newRunId?: (() => string) | undefined;
}): Promise<AutomationStudioProjectBuildEntry> {
  const { scope, environment, signal, start } = input;
  const predecessors = [...scope.predecessors];
  if (!predecessors.length) return { kind: "start" };
  signal.throwIfAborted();
  const unprepared = (code: string, extra: { missing?: string[]; failed?: string; runId?: string; acts?: AutomationStudioCandidateTrialAct[] } = {}): AutomationStudioProjectBuildEntry => ({ kind: "unprepared", predecessors, code, acts: [], ...extra });
  const passing = input.proposals.predecessors(scope);
  // The same check the subflow's own trial makes (header).
  const gap = automationStudioSubflowTrialPredecessorGap(scope, passing, input.proposals.keptUnder);
  if (gap) return "missing" in gap ? unprepared("project.entry_predecessor_missing", { missing: gap.missing }) : unprepared("project.entry_predecessor_stale", { missing: gap.stale });
  if (start.status === "failed") return unprepared(start.code);

  const target = passing.at(-1)!;
  const before = passing.slice(0, -1);
  const runId = input.newRunId?.() ?? `entry-preparation.${randomUUID()}`;
  const marker = { buildId: scope.buildId, briefId: scope.briefId, subflowKey: scope.subflowKey, predecessors: passing.map(ref) };
  const opened = await environment.openSession({ runId, metadata: { entryPreparation: structuredClone(marker) } });
  const startedAt = Date.now();
  await environment.writeSession({ ...opened, status: "running", startedAt });
  const identity = await identityOf(scope, target, before, environment);
  let executed: Awaited<ReturnType<typeof runAutomationStudioDetachedSubflow>>;
  try {
    executed = await (input.execute ?? runAutomationStudioDetachedSubflow)({
      identity,
      target: detached(target),
      predecessors: before.map(detached),
      // A predecessor whose passing proposal was replaced while this ran stops it, as a trial is stopped.
      currentIdentity: async () => {
        const now = input.proposals.predecessors(scope);
        return now.length === passing.length ? await identityOf(scope, now.at(-1)!, now.slice(0, -1), environment) : null;
      },
      parentFlow: await environment.parentFlow(),
      ...(environment.registry ? { registry: environment.registry } : {}),
      resolution: environment.resolution,
      snapshots: await environment.snapshots(),
      deprecatedPublicationIds: await environment.deprecatedPublicationIds(),
      sourceInstructionIds: [...environment.sourceInstructionIds],
      runId,
      start: { receiptId: `${runId}.start`, conditionsDigest: `entry-preparation.${start.status}`, preparedAt: startedAt, pageGeneration: 0, subjectStates: [] },
      ...(input.arrival && environment.startLocation ? { arrival: { ...input.arrival, location: environment.startLocation } } : {}),
      options: environment.graphOptions({ runId, signal })
    });
  } catch (error) {
    await environment.writeSession({ ...opened, status: signal.aborted ? "cancelled" : "failed", startedAt, finishedAt: Date.now() });
    if (signal.aborted) throw error;
    return unprepared("project.entry_run_failed", { runId });
  } finally {
    await environment.processDatasets(runId);
  }
  const status: AutomationStudioRuntimeSession["status"] = executed.trace?.status ?? (executed.receipt.status === "succeeded" ? "succeeded" : executed.receipt.status === "cancelled" ? "cancelled" : "failed");
  await environment.writeSession({ ...opened, status, startedAt, finishedAt: executed.receipt.finishedAt, ...(executed.trace ? { trace: executed.trace } : {}), metadata: { ...(opened.metadata ?? {}), entryPreparation: { ...marker, start: start.status, execution: executed.receipt.status, ...(executed.code ? { code: executed.code } : {}) } } });
  signal.throwIfAborted();
  const frames = automationStudioCandidateFrameEvidence(executed.trace?.attempts ?? [], executed.graph, executed.candidateGraphs);
  // Every lasting act that landed, for the brief's ledger: a reset undoes them as it undoes a trial's.
  const acts = automationStudioCandidateTrialLandedActs(executed.trace, frames.graph);
  if (executed.receipt.status === "succeeded") return { kind: "prepared", predecessors, runId, acts };
  // The run's target is the last predecessor, so a target that did not end is that predecessor's failure.
  const failed = executed.failedPredecessor ?? target.scope.subflowKey;
  return unprepared(executed.code ?? `candidate.trial_${executed.receipt.status}`, { failed, runId, acts });
}

const ref = (proposal: Readonly<AutomationStudioSubflowProposal>) => ({ subflowKey: proposal.scope.subflowKey, revision: proposal.revision, digest: proposal.digest });

function detached(proposal: Readonly<AutomationStudioSubflowProposal>): AutomationStudioDetachedSubflowProposal {
  return { ...ref(proposal), subflows: structuredClone(proposal.subflows) as AutomationStudioDetachedSubflowProposal["subflows"] };
}

/** What the detached run is bound to: this brief, its last predecessor as the target, the others before it. */
async function identityOf(scope: AutomationStudioSubflowScope, target: Readonly<AutomationStudioSubflowProposal>, before: readonly AutomationStudioSubflowProposal[], environment: AutomationStudioProjectBuildTrialEnvironment): Promise<AutomationStudioDetachedSubflowIdentity> {
  return {
    projectId: environment.projectId,
    flowId: environment.flowId,
    buildId: scope.buildId,
    briefId: scope.briefId,
    planDigest: scope.planDigest,
    baseDependencyDigest: await environment.currentBaseDigest(),
    target: ref(target),
    predecessors: before.map(ref)
  };
}
