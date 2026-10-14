import type { JsonObject, JsonValue } from "../../../../../core/index.ts";
import type {
  AutomationStudioSiteResetChecks,
  AutomationStudioSiteResetComparison,
  AutomationStudioSiteResetDecision,
  AutomationStudioSiteResetLedger,
  AutomationStudioSiteResetNamedAct,
  AutomationStudioSiteResetProjectLedger,
  AutomationStudioSiteResetTrialReset
} from "../../flow-bootstrap/site-reset/index.ts";

// The site reset before a builder's subflow trial (t578; user, 2026-10-12): the
// site goes back to how the build found it, undoing every lasting act THIS
// BUILD made, whichever brief made it, and never what was there before the
// build began (supervisor decision, 2026-10-14). At host capacity 1 the briefs
// run one after another on one site, so an earlier brief's act is on this
// brief's site (A8 bigbox debug: brief-4 left the store switched for brief-5).
//
// Each act stays in the ledger of the brief that made it (`project-ledger.ts`),
// which keeps judging its undo. Before a trial this asks every ledger that
// still holds an act, and the trialling brief's own, the same question the
// whole-candidate gate asks its one ledger (`beforeTrial`), and answers as one:
//
// - after the deployment's start hook (`startReset`), every ledger counts its
//   acts undone, and what each took back is answered together;
// - otherwise each ledger looks for its own acts on their own pages and applies
//   the trial policy; any refusal refuses the trial, naming every act still to
//   undo across them, the first `candidate.trial_reset_required` leading;
// - admitted, what each ledger said the trial starts with is said together.
//
// The start comparison is read once per ask and shared, so the target is taken
// back to the start once, not once per ledger. A trial's own acts go into the
// trialling brief's ledger; every other ledger asked starts a new phase too,
// and the acts still on the site afterwards are answered from all of them.
//
// Above capacity 1 briefs run on separate host resources, and another brief's
// act is not on this site; the web domain declares capacity 1.

export function automationStudioProjectBuildTrialReset(input: {
  project: AutomationStudioSiteResetProjectLedger;
  /** The trialling brief's own ledger, which its trials' acts go into. */
  own: AutomationStudioSiteResetLedger;
  /** The start check, under the signal of the trial being prepared. */
  checks(signal: AbortSignal | undefined): AutomationStudioSiteResetChecks;
}): AutomationStudioSiteResetTrialReset {
  const { project, own } = input;
  /** The trialling brief's ledger, then every other one that recorded an act, in the order their first act was recorded. */
  const ledgers = (): AutomationStudioSiteResetLedger[] => [...new Set([own, ...project.snapshot().acts.map((act) => project.forBrief(act.owner))])];
  return {
    async beforeTrial(signal, cannotUndo, options) {
      const base = input.checks(signal);
      let start: Promise<AutomationStudioSiteResetComparison> | undefined;
      const checks: AutomationStudioSiteResetChecks = { compare: () => (start ??= base.compare()), ...(base.compareAt ? { compareAt: base.compareAt } : {}) };
      const decisions: AutomationStudioSiteResetDecision[] = [];
      for (const ledger of ledgers()) {
        signal?.throwIfAborted();
        decisions.push(await ledger.beforeTrial(checks, cannotUndo, options));
      }
      return joined(decisions);
    },
    trialRan(acts, trialRunId) {
      const left = own.trialRan(acts, trialRunId);
      for (const ledger of ledgers()) if (ledger !== own) left.push(...ledger.trialRan([], trialRunId));
      return left;
    }
  };
}

/** Every ledger's answer as one (header). */
function joined(decisions: readonly AutomationStudioSiteResetDecision[]): AutomationStudioSiteResetDecision {
  const refusals = decisions.filter((decision): decision is Extract<AutomationStudioSiteResetDecision, { kind: "refuse" }> => decision.kind === "refuse");
  if (refusals.length) {
    const lead = refusals.find((refusal) => refusal.evidence.code === "candidate.trial_reset_required") ?? refusals[0]!;
    const actsToUndo = refusals.flatMap((refusal) => list(refusal.evidence.actsToUndo));
    const cannotUndo = refusals.flatMap((refusal) => list(refusal.evidence.cannotUndo));
    const evidence = { ...lead.evidence, ...(actsToUndo.length ? { actsToUndo } : {}), ...(cannotUndo.length ? { cannotUndo } : {}) };
    return { kind: "refuse", evidence, moved: decisions.some((decision) => decision.kind === "refuse" && decision.moved) };
  }
  const admitted = decisions as ReadonlyArray<Extract<AutomationStudioSiteResetDecision, { kind: "admit" }>>;
  const absorbed: AutomationStudioSiteResetNamedAct[] = admitted.flatMap((decision) => decision.absorbedByStartReset ?? []);
  const startedWith = joinedStartedWith(admitted.flatMap((decision) => decision.startedWith ? [decision.startedWith] : []));
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
