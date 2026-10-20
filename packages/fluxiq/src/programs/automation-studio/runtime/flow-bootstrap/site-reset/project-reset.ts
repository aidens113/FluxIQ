// The site reset of a project build, over every brief's ledger (t578, t586;
// user, 2026-10-12): the site goes back to how the build found it, undoing
// every lasting act THIS BUILD made, whichever brief made it, and never what was
// there before the build began. At host capacity 1 the briefs run one after
// another on one site, so an earlier brief's act is on this phase's site (A8
// bigbox debug: brief-4 left the store switched for brief-5).
//
// **One reset for every phase of the build (t593).** A builder's subflow trial
// (`../../service/project-build/brief-ports.ts`), the supervisor's whole trial
// (`../../project-agents/supervisor/whole-trial.ts`) and every phase's start
// (`../../service/project-build/phase-start.ts`) each kept their own copy of
// this; they now share this one.
//
// Each act stays in the ledger of the brief that made it (`./project-ledger.ts`),
// which keeps judging its undo. Before a trial or a phase this asks every ledger
// that still holds an act, and the phase's own brief's (`own`), the same question
// the whole-candidate gate asks its one ledger (`beforeTrial`), and answers as
// one:
//
// - after the deployment's start hook (`startReset`), every ledger counts its
//   acts undone, and what each took back is answered together;
// - otherwise each ledger looks for its own acts on their own pages and applies
//   the trial policy; any refusal refuses, naming every act still to undo across
//   them, the first `candidate.trial_reset_required` leading -- one with acts to
//   undo before one refused only on acts no call can settle (t743) -- and every
//   act no call can settle listed together under `actsUnsettleable`;
// - admitted, what each ledger said the trial starts with is said together.
//
// The start comparison is read once per ask and shared, so the target is taken
// back to the start once, not once per ledger; so is each place Core looks at
// for an act's stale witness (`lookAt`, L1). A trial's own acts go into the
// own brief's ledger; every other ledger asked starts a new phase too, and the
// acts still on the site afterwards are answered from all of them. Without an
// own brief (the supervisor, which never acts on the site), every ledger that
// holds an act is asked and none records.
//
// Above capacity 1 briefs run on separate host resources, and another brief's
// act is not on this site; the web domain declares capacity 1.

import type { JsonObject, JsonValue } from "../../../../../core/index.ts";
import type {
  AutomationStudioSiteResetChecks,
  AutomationStudioSiteResetComparison,
  AutomationStudioSiteResetDecision,
  AutomationStudioSiteResetNamedAct,
  AutomationStudioSiteResetTrialReset
} from "./contracts.ts";
import type { AutomationStudioSiteResetLedger } from "./ledger.ts";
import type { AutomationStudioSiteResetProjectLedger } from "./project-ledger.ts";
import { AUTOMATION_STUDIO_SITE_RESET_WORDS as WORDS } from "./words.ts";

export function automationStudioSiteResetProjectReset(input: {
  project: Pick<AutomationStudioSiteResetProjectLedger, "snapshot" | "forBrief">;
  /** The phase's own brief's ledger, which its trials' acts go into; absent for the supervisor, which records none. */
  own?: AutomationStudioSiteResetLedger | undefined;
  /** The start check, under the signal of the trial or phase being prepared. */
  checks(signal: AbortSignal | undefined): AutomationStudioSiteResetChecks;
}): AutomationStudioSiteResetTrialReset {
  const { project, own } = input;
  /** The own brief's ledger, then every other one that recorded an act, in the order their first act was recorded. */
  const ledgers = (): AutomationStudioSiteResetLedger[] => [...new Set([...(own ? [own] : []), ...project.snapshot().acts.map((act) => project.forBrief(act.owner))])];
  return {
    async beforeTrial(signal, cannotUndo, options) {
      const base = input.checks(signal);
      let start: Promise<AutomationStudioSiteResetComparison> | undefined;
      // Core's own looks (L1): each place once per ask, its read reaching every ledger through the caller, whichever ledger asked first.
      const looked = new Set<string>();
      const lookAt = base.lookAt;
      const look = lookAt ? { lookAt: async (location: string) => {
        if (looked.has(location)) return;
        looked.add(location);
        await lookAt(location);
      } } : {};
      const checks: AutomationStudioSiteResetChecks = { compare: () => (start ??= base.compare()), ...(base.compareAt ? { compareAt: base.compareAt } : {}), ...look };
      const decisions: AutomationStudioSiteResetDecision[] = [];
      for (const ledger of ledgers()) {
        signal?.throwIfAborted();
        decisions.push(await ledger.beforeTrial(checks, cannotUndo, options));
      }
      return joined(decisions);
    },
    trialRan(acts, trialRunId) {
      const left = own ? own.trialRan(acts, trialRunId) : [];
      for (const ledger of ledgers()) if (ledger !== own) left.push(...ledger.trialRan([], trialRunId));
      return left;
    }
  };
}

/** Every ledger's answer as one (header). */
function joined(decisions: readonly AutomationStudioSiteResetDecision[]): AutomationStudioSiteResetDecision {
  const refusals = decisions.filter((decision): decision is Extract<AutomationStudioSiteResetDecision, { kind: "refuse" }> => decision.kind === "refuse");
  if (refusals.length) {
    const required = refusals.filter((refusal) => refusal.evidence.code === "candidate.trial_reset_required");
    // A refusal some call can meet leads one refused only on acts no call can settle (t743).
    const meetable = (refusal: Extract<AutomationStudioSiteResetDecision, { kind: "refuse" }>): boolean => refusal.evidence.failed !== "acts_unsettleable";
    const lead = required.find((refusal) => list(refusal.evidence.actsToUndo).length > 0) ?? required.find(meetable) ?? refusals.find(meetable) ?? refusals[0]!;
    const actsToUndo = refusals.flatMap((refusal) => list(refusal.evidence.actsToUndo));
    const cannotUndo = refusals.flatMap((refusal) => list(refusal.evidence.cannotUndo));
    const actsUnsettleable = refusals.flatMap((refusal) => list(refusal.evidence.actsUnsettleable));
    // Another ledger's acts no call can settle are said by the lead's instruction too, with the honest exit (t743).
    const exit = actsUnsettleable.length > 0 && !list(lead.evidence.actsUnsettleable).length && typeof lead.evidence.instruction === "string" ? { instruction: `${lead.evidence.instruction} ${WORDS.unsettleable(actsToUndo.length > 0)}` } : {};
    const evidence = { ...lead.evidence, ...exit, ...(actsToUndo.length ? { actsToUndo } : {}), ...(cannotUndo.length ? { cannotUndo } : {}), ...(actsUnsettleable.length ? { actsUnsettleable } : {}) };
    return { kind: "refuse", evidence, moved: refusals.some((refusal) => refusal.moved) };
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
