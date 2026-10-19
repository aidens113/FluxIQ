import type { JsonObject, JsonValue } from "../../../../../core/index.ts";
import { emitAutomationStudioProjectReceiptCard } from "../../activity/project/index.ts";
import { automationStudioSiteResetProjectReset, type AutomationStudioSiteResetChecks, type AutomationStudioSiteResetTrialReset } from "../../flow-bootstrap/site-reset/index.ts";
import type { AutomationStudioLlmEvidenceToolExecutionResult } from "../../llm/evidence-loop.ts";
import { automationStudioProjectSingleSubflowPlan } from "../single-subflow/index.ts";
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
//   the gate again). An act stays on the target only once it is kept: named
//   under `cannotUndo` -- by a reset brief's completion or by this test's own
//   input -- after a reset asked for it, or its undo was refused. The trial then
//   runs with it in place, the judge told under `startedWith.cannotUndo`. An
//   identified reversible effect stays refused until proved restored, kept or
//   not (`candidate.trial_reset_unproved`);
// - no trial runs on leftovers (F1 continuation; user, 2026-10-12): a reset
//   that came back blocked without undoing or naming an act leaves it to undo,
//   and every test is refused while it is. Nothing is kept for being asked for
//   often or for a refusal that made no progress;
// - a refusal is repeated, unasked of the ledgers, until a reset brief has come
//   back, so a test sent again instead of a reset changes nothing.
//
// A whole trial's own acts are recorded under the supervisor by its trial port
// (`service/project-build/whole-trials.ts`), so the reset records none of its
// own; after each trial every ledger starts a new phase. Every project ledger
// is asked per brief (`ports.projectLedger.forBrief`, t590): the rule kept for
// a stand-in that held only a snapshot is gone with the stand-in.
//
// **The reset is the build's one reset (t593).** What every brief's ledger is
// asked, and how their answers are joined, is the reset every phase of the
// build shares (`flow-bootstrap/site-reset/project-reset.ts`), asked here with
// no brief of its own and no look; only the repeated refusal is the
// supervisor's.
//
// **A single-subflow plan's yes is not judged twice (t679).** On a plan of one
// subflow the router runs, the builder's own test was the judged whole run of
// the revision assembled from its proposal (`../single-subflow/single-subflow-trial.ts`).
// A whole test the supervisor then asks of that same revision, while its yes
// stands and may be completed on, runs no second trial: it answers with that
// yes and its `complete` object, records no receipt again, and says to
// complete. A pass the run rescued is tested as before.
//
// **A builder's undo answers the repeated refusal too (t679).** The same
// refusal repeats only while acts are still to undo: an act a builder of a
// single-subflow plan undid, or named under `cannotUndo` in its own test after
// its reset asked for it, is no longer one, so that builder's next test reaches
// the ledgers again without a reset brief.
//
// **A test asked drops the reason for a reset (t684).** An ending held for a
// reset sets the state's `resetToEnd`, which a whole test that ran clears
// (`./state.ts`, `noteWholeTest`). A test refused `project.trial_reset_required`
// never reached it, so the reset the model then sent was answered "end again
// now", though it had chosen to test. Every test asked now clears it first.

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
    // A test asked is the build going on, not ending, even one refused for a reset: the reset's answer then says to test (header, t684).
    state.resetToEnd = undefined;
    // The revision a single-subflow builder's test already judged yes is not tried again (header, t679).
    const judged = this.alreadyJudged(context, value);
    if (judged) return judged;
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
    // The most recent pass, rescued or outright, is kept as the build's fallback until a later pass replaces it (`./state.ts`, t637).
    state.noteWholeTest(context.controller, gate);
    return ran;
  }

  /** The standing yes of a single-subflow plan's latest revision, when `value` names it and it may be completed on (header, t679); undefined otherwise. */
  private alreadyJudged(context: AutomationStudioProjectSupervisorContext, value: JsonObject): AutomationStudioLlmEvidenceToolExecutionResult | undefined {
    const { state, controller, gate } = context;
    if (automationStudioProjectSingleSubflowPlan(state.structure) === undefined) return undefined;
    const latest = controller.latest();
    if (!latest || value.revision !== latest.revision || value.digest !== latest.digest) return undefined;
    const standing = gate.standing(latest);
    if (standing?.verdict !== "yes" || !gate.completion({ revision: latest.revision, digest: latest.digest }).ok) return undefined;
    return answer.answered({
      ok: true, verdict: "yes", revision: latest.revision, digest: latest.digest, ...(standing.trialRunId ? { trialRunId: standing.trialRunId } : {}),
      alreadyJudged: true, complete: { revision: latest.revision, digest: latest.digest }, instruction: GUIDANCE.next.afterWholeAlreadyJudged
    });
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
    // The build's one reset, with no brief of its own and no look (header).
    const shared = automationStudioSiteResetProjectReset({ project: ledger, checks: () => UNLOOKED });
    return {
      beforeTrial: async (signal, cannotUndo, options) => {
        const inPlace = ledger.snapshot().acts.filter((act) => act.inPlace);
        // The same refusal until a reset brief has come back (header); a start hook's reset needs none.
        if (options?.startReset !== true && inPlace.length && this.refusedAtResets !== undefined && this.refusedAtResets === this.resetsBack()) {
          return { kind: "refuse", moved: false, evidence: { ok: false, code: "candidate.trial_reset_required", actsToUndo: inPlace.map((act) => ({ act: act.act, did: act.did })) } };
        }
        const decision = await shared.beforeTrial(signal, cannotUndo, options);
        this.refusedAtResets = decision.kind === "refuse" ? this.resetsBack() : undefined;
        return decision;
      },
      trialRan: (_acts, trialRunId) => shared.trialRan([], trialRunId)
    };
  }
}

function list(value: JsonValue | undefined): JsonValue[] {
  return Array.isArray(value) ? value : [];
}
