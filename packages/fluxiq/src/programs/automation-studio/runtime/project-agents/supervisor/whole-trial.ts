import type { JsonObject, JsonValue } from "../../../../../core/index.ts";
import { emitAutomationStudioProjectReceiptCard } from "../../activity/project/index.ts";
import type {
  AutomationStudioSiteResetBeforeTrialOptions,
  AutomationStudioSiteResetChecks,
  AutomationStudioSiteResetDecision,
  AutomationStudioSiteResetLedger,
  AutomationStudioSiteResetNamedAct,
  AutomationStudioSiteResetTrialReset
} from "../../flow-bootstrap/site-reset/index.ts";
import type { AutomationStudioLlmEvidenceToolExecutionResult } from "../../llm/evidence-loop.ts";
import type { AutomationStudioProjectSupervisorContext } from "./context.ts";
import { AUTOMATION_STUDIO_PROJECT_SUPERVISOR_GUIDANCE as GUIDANCE } from "./guidance.ts";
import type { AutomationStudioProjectSupervisorPorts } from "./ports.ts";
import type { AutomationStudioProjectSupervisorState } from "./state.ts";
import { automationStudioProjectSupervisorToolAnswer as answer } from "./tool-answer.ts";

// `core.test_candidate` for the supervisor: the whole candidate's trial gate
// (`../../flow-bootstrap/candidate/trial-gate.ts`), run under the supervisor's
// purse run frame so its judge spends the reserve no builder could be given.
// Each trial that ran is recorded in the build record as a receipt reference
// and shown in the chat as its receipt card.
//
// **The site is put back first (user, 2026-10-12), as a candidate build's is
// (t586).** Social `run-mv85xmgq-8a6a6f43` could never test: the whole test
// was refused on any act in the project ledger before its gate ran, and the
// gate was built with no reset, so the deployment's start hook -- which
// candidate mode and a builder's subflow trial (t578) both run -- never ran,
// and on a site with no control that undoes a confirmed request nothing else
// could put it back. So the gate is given this build's reset (`reset`):
//
// - the start hook first (the gate's `prepareStart`): after it every ledger
//   counts its acts undone, and the trial's evidence names what the hook took
//   back under `absorbedByStartReset`;
// - otherwise every brief's ledger that holds an act is asked, as the
//   candidate gate asks its one, with no look at the target -- the supervisor
//   never acts on it, so an act counts undone once a reset brief's undo of it
//   landed, or once that brief's own look found it gone. Acts still to undo
//   refuse the trial `project.trial_reset_required`, naming `project.dispatch`
//   with a reset brief (`retry_allowed`, so the test after the reset reaches
//   the gate again). An act the site offers no way to undo is kept, as the
//   ledger keeps it, and the trial runs with it in place, the judge told under
//   `startedWith`;
// - a refusal is repeated, unasked of the ledgers, until a reset brief has come
//   back: the ledgers' no-deadlock admission is for a reset that was tried and
//   made no progress, never for a test sent again instead of one.
//
// A whole trial's own acts are recorded under the supervisor by its trial port
// (`service/project-build/whole-trials.ts`), so the reset records none of its
// own; after each trial every ledger starts a new phase. Every project ledger
// is asked per brief (`ports.projectLedger.forBrief`, t590): the rule kept for
// a stand-in that held only a snapshot is gone with the stand-in.

/** A trial's start as the supervisor checks it: no look at the target, which it never acts on (header). */
const UNLOOKED: AutomationStudioSiteResetChecks = { compare: async () => ({ moved: false }) };

export class AutomationStudioProjectSupervisorWholeTrial {
  /** The reset the whole candidate's gate runs before each trial (header). */
  readonly reset: AutomationStudioSiteResetTrialReset;
  /** How many reset briefs had come back when the last refusal was given; undefined once a trial was admitted. */
  private refusedAtResets: number | undefined;

  constructor(private readonly input: { ports: Pick<AutomationStudioProjectSupervisorPorts, "projectLedger">; state: AutomationStudioProjectSupervisorState }) {
    this.reset = this.ledgersReset(input.ports.projectLedger);
  }

  async test(context: AutomationStudioProjectSupervisorContext, value: JsonObject, callSignal: AbortSignal | undefined): Promise<AutomationStudioLlmEvidenceToolExecutionResult> {
    const { ports, state, gate } = context;
    const ran = await gate.test(value, callSignal ?? context.signal);
    const evidence = ran.evidence as JsonObject;
    if (evidence.code === "candidate.trial_reset_required") return this.resetRequired(evidence);
    if (typeof evidence.verdict !== "string" || typeof evidence.revision !== "number" || typeof evidence.digest !== "string") return ran;
    const verdict = evidence.verdict;
    const receiptId = typeof evidence.trialRunId === "string" && evidence.trialRunId ? evidence.trialRunId : `whole-trial-${evidence.revision}-${Date.now()}`;
    await ports.record.recordReceipt(ports.build, { receipt: { kind: "candidate_trial", receiptId, digest: evidence.digest } });
    emitAutomationStudioProjectReceiptCard({ receipt: { kind: "candidate_trial", receiptId, digest: evidence.digest }, verdict: verdict === "yes" ? "passed" : verdict === "no" ? "failed" : "unconfirmed" });
    // The trial's own acts are in the ledger itself, under the supervisor (header).
    if (verdict !== "yes") state.wholeTrialFailed = true;
    return ran;
  }

  /** The gate's refusal in the supervisor's words: a reset brief undoes what the gate listed, each act with the brief that made it. */
  private resetRequired(evidence: JsonObject): AutomationStudioLlmEvidenceToolExecutionResult {
    const owners = new Map(this.input.ports.projectLedger.snapshot().acts.map((act) => [act.act, act.owner]));
    const acts = list(evidence.actsToUndo).flatMap((entry) => {
      const act = entry && typeof entry === "object" && !Array.isArray(entry) ? entry : undefined;
      return typeof act?.act === "string" ? [{ act: act.act, did: typeof act.did === "string" ? act.did : "an act", brief: owners.get(act.act) ?? "unknown" }] : [];
    });
    const cannotUndo = list(evidence.cannotUndo);
    return answer.refused("project.trial_reset_required", GUIDANCE.refusals.resetRequired, { actsInPlace: acts, ...(cannotUndo.length ? { cannotUndo } : {}) }, { retry: true });
  }

  /** How many reset briefs have come back under the plan in force, done or not. */
  private resetsBack(): number {
    return this.input.state.answeredUnderPlan().filter((answered) => answered.brief.kind === "reset").length;
  }

  /** The build's reset over every brief's ledger (header). */
  private ledgersReset(ledger: AutomationStudioProjectSupervisorPorts["projectLedger"]): AutomationStudioSiteResetTrialReset {
    /** Every ledger that recorded an act, in the order its first act was recorded. */
    const ledgers = (): AutomationStudioSiteResetLedger[] => [...new Set(ledger.snapshot().acts.map((act) => act.owner))].map((owner) => ledger.forBrief(owner));
    const ask = async (signal: AbortSignal | undefined, cannotUndo: readonly string[] | undefined, options: AutomationStudioSiteResetBeforeTrialOptions | undefined): Promise<AutomationStudioSiteResetDecision> => {
      const decisions: AutomationStudioSiteResetDecision[] = [];
      for (const each of ledgers()) {
        signal?.throwIfAborted();
        decisions.push(await each.beforeTrial(UNLOOKED, cannotUndo, options));
      }
      return joined(decisions);
    };
    return {
      beforeTrial: async (signal, cannotUndo, options) => {
        const inPlace = ledger.snapshot().acts.filter((act) => act.inPlace);
        // The same refusal until a reset brief has come back (header); a start hook's reset needs none.
        if (options?.startReset !== true && inPlace.length && this.refusedAtResets !== undefined && this.refusedAtResets === this.resetsBack()) {
          return { kind: "refuse", moved: false, evidence: { ok: false, code: "candidate.trial_reset_required", actsToUndo: inPlace.map((act) => ({ act: act.act, did: act.did })) } };
        }
        const decision = await ask(signal, cannotUndo, options);
        this.refusedAtResets = decision.kind === "refuse" ? this.resetsBack() : undefined;
        return decision;
      },
      trialRan: (_acts, trialRunId) => ledgers().flatMap((each) => each.trialRan([], trialRunId))
    };
  }
}

/** Every ledger's answer as one: any refusal refuses, naming every act still to undo; admitted, what each said the trial starts with, together. */
function joined(decisions: readonly AutomationStudioSiteResetDecision[]): AutomationStudioSiteResetDecision {
  const refusals = decisions.filter((decision): decision is Extract<AutomationStudioSiteResetDecision, { kind: "refuse" }> => decision.kind === "refuse");
  if (refusals.length) {
    const lead = refusals.find((refusal) => refusal.evidence.code === "candidate.trial_reset_required") ?? refusals[0]!;
    const actsToUndo = refusals.flatMap((refusal) => list(refusal.evidence.actsToUndo));
    const cannotUndo = refusals.flatMap((refusal) => list(refusal.evidence.cannotUndo));
    return { kind: "refuse", moved: refusals.some((refusal) => refusal.moved), evidence: { ...lead.evidence, ...(actsToUndo.length ? { actsToUndo } : {}), ...(cannotUndo.length ? { cannotUndo } : {}) } };
  }
  const admitted = decisions as ReadonlyArray<Extract<AutomationStudioSiteResetDecision, { kind: "admit" }>>;
  const absorbed: AutomationStudioSiteResetNamedAct[] = admitted.flatMap((decision) => decision.absorbedByStartReset ?? []);
  const startedWith = joinedStartedWith(admitted.flatMap((decision) => (decision.startedWith ? [decision.startedWith] : [])));
  return { kind: "admit", ...(startedWith ? { startedWith } : {}), ...(absorbed.length ? { absorbedByStartReset: absorbed } : {}) };
}

/** The ledgers' `startedWith` as one: their acts and kept acts listed together, each difference once, the first instruction. */
function joinedStartedWith(said: readonly JsonObject[]): JsonObject | undefined {
  if (said.length <= 1) return said[0];
  const acts = said.flatMap((entry) => list(entry.acts));
  const cannotUndo = said.flatMap((entry) => list(entry.cannotUndo));
  const differs = [...new Set(said.flatMap((entry) => list(entry.differs)))];
  const instruction = said.find((entry) => typeof entry.instruction === "string")?.instruction;
  return { ...(acts.length ? { acts } : {}), ...(differs.length ? { differs } : {}), ...(cannotUndo.length ? { cannotUndo } : {}), ...(instruction !== undefined ? { instruction } : {}) };
}

function list(value: JsonValue | undefined): JsonValue[] {
  return Array.isArray(value) ? value : [];
}
