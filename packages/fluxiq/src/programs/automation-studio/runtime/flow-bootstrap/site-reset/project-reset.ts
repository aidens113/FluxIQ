// What a project build's trial is told of the site, over every brief's ledger
// (t578, t586; t775: a trial is judged against the state recorded just before
// it and the change asked for, so the site is reset as rarely as possible;
// user, 2026-10-27). At host capacity 1 the briefs run one after another on
// one site, so an earlier brief's act is on this phase's site (A8 bigbox debug:
// brief-4 left the store switched for brief-5), and the trial is told so.
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
// - otherwise, given the trial's steps and parts (`change`, t775), a step whose
//   asked end state is already shown by an in-place act of any brief made with
//   another step, with no act of the step itself seen making it anywhere in the
//   build, refuses the trial `candidate.trial_starts_in_end_state`, naming just
//   those acts (`./ledger.ts`, `endStateClash`);
// - otherwise each ledger looks for its own acts on their own pages, and the
//   trial is admitted with what each said it starts with said together; acts in
//   place and acts no call can settle never refuse it;
// - the trial's before readings are taken once, through the own brief's ledger
//   (or the first that holds an act), with what of the build is on the site
//   gathered from every ledger (`../trial-change/session.ts`). None where the
//   caller gives no look. The supervisor's look is Core's own, made outside any
//   loop (`../../service/project-build/phase-start.ts`, t775 D5): each read
//   reaches every ledger that holds an act, so the first of them reads for all,
//   and a step's witness stamp resolves alike through any of them (receipts,
//   control witnesses and explored acts are the build's).
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
//
// **An unwitnessed step runs, and its gap is said (t791 fix 4; replaces t751
// R3, "no unwitnessed step runs", whose reason -- every later trial was
// refused -- t775 removed).** Before a trial runs its steps -- before the start
// hook and before any baseline moves -- its door asks `admit` which reversible
// lasting steps (lasting classes all among create_new, modify_existing and
// delete) carry no witness stamp its node took at submission that still
// resolves (`./project-ledger.ts`, `stepWitnessResolves`). None of them refuses
// the trial: `admit` always admits, and where there are such steps it notes
// them under `unwitnessed` with the builder's words
// (`./unwitnessed-step-words.ts`), which a trial gate copies into its answer.
// The trial then runs and is judged by its end view and each step's done-when
// check. Its acts are recorded as on the site as any trial act is (`trialRan`;
// an act with no witness seals nothing, t775), and `beforeTrial` finishes its
// readings with those steps said to the judge as unread and the parts they
// serve `unproven` (`../trial-change/unwitnessed-session.ts`), with or without
// a look, and even where no other step has a witness. The one refusal left is
// still `candidate.trial_starts_in_end_state`. Only a project build's reset
// asks; a standalone ledger has no `admit`.
//
// **Each such step is told what it can do in its own tab (t791 fix 2).** A ref is
// read in one tab and shows a press's change only for a press in that tab, so a
// step is offered the refs read in its own tab and no others, and where no call
// there can make a witness it is told so (`../reset-admission/step-gaps.ts`, `stepReach`, found by
// its node as the step door noted it at submission, `../reset-admission/trial-steps.ts`).

import type { JsonObject, JsonValue } from "../../../../../core/index.ts";
import type { AutomationStudioActionConsequence } from "../../action-permissions/index.ts";
import type {
  AutomationStudioSiteResetChecks,
  AutomationStudioSiteResetComparison,
  AutomationStudioSiteResetDecision,
  AutomationStudioSiteResetNamedAct,
  AutomationStudioSiteResetStepAdmission,
  AutomationStudioSiteResetTrialReset,
  AutomationStudioSiteResetTrialStep
} from "./contracts.ts";
import type { AutomationStudioSiteResetLedger } from "./ledger.ts";
import { automationStudioTrialChangeBegin, automationStudioTrialChangeUnwitnessedSession, type AutomationStudioTrialChangeAsk, type AutomationStudioTrialChangeLedgerPort, type AutomationStudioTrialChangeSession } from "../trial-change/index.ts";
import type { AutomationStudioSiteResetProjectLedger } from "./project-ledger.ts";
import type { AutomationStudioSiteResetStepReachAnswer } from "../reset-admission/index.ts";
import { AUTOMATION_STUDIO_SITE_RESET_UNWITNESSED_STEP_WORDS as UNWITNESSED_WORDS } from "./unwitnessed-step-words.ts";

/** The classes the site's own controls can reverse: a step declaring only these has its gap said where it has no witness (header). */
const REVERSIBLE: ReadonlySet<string> = new Set<AutomationStudioActionConsequence>(["create_new", "modify_existing", "delete"]);

export function automationStudioSiteResetProjectReset(input: {
  /** The build's ledger; `stepWitnessResolves` and `stepReach` answer `admit` (header), absent where a caller holds a narrower port, and then every reversible step is noted unwitnessed. */
  project: Pick<AutomationStudioSiteResetProjectLedger, "snapshot" | "forBrief"> & Partial<Pick<AutomationStudioSiteResetProjectLedger, "stepWitnessResolves" | "stepReach">>;
  /** The phase's own brief's ledger, which its trials' acts go into; absent for the supervisor, which records none. */
  own?: AutomationStudioSiteResetLedger | undefined;
  /** The start check, under the signal of the trial or phase being prepared. */
  checks(signal: AbortSignal | undefined): AutomationStudioSiteResetChecks;
}): AutomationStudioSiteResetTrialReset {
  const { project, own } = input;
  /** The own brief's ledger, then every other one that recorded an act, in the order their first act was recorded. */
  const ledgers = (): AutomationStudioSiteResetLedger[] => [...new Set([...(own ? [own] : []), ...project.snapshot().acts.map((act) => project.forBrief(act.owner))])];
  const session = (ask: AutomationStudioTrialChangeAsk, look: NonNullable<AutomationStudioSiteResetChecks["lookAt"]>) => sessionOver(ledgers(), ask, look);
  const resolves = (witness: unknown): boolean => project.stepWitnessResolves?.(witness) === true;
  return {
    async beforeTrial(signal, cannotUndo, options) {
      const base = input.checks(signal);
      const { change: ask, ...rest } = options ?? {};
      // The one refusal left (header, t775): just the in-place acts of any brief that already show an asked end state.
      if (ask && rest.startReset !== true) {
        const all = ledgers();
        const carried = (step: AutomationStudioTrialChangeAsk["steps"][number]): boolean => all.some((ledger) => ledger.trialChange().carried(step));
        const clashing = all.map((ledger) => ({ ledger, acts: ledger.endStateClash(ask, carried) })).filter((entry) => entry.acts.length);
        if (clashing.length) return refusedTogether(clashing.map((entry) => entry.ledger.startsInEndState(entry.acts)));
      }
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
        decisions.push(await ledger.beforeTrial(checks, cannotUndo, rest));
      }
      // The trial's before readings, once, for the whole build (header, t775); its looks move the target, so it goes back to the start after them.
      const read = ask && lookAt ? await session(ask, lookAt) : undefined;
      if (read) await base.compare();
      // The steps with no witness, said to the judge as unread whether or not anything else was read (header, t791).
      const gap = ask ? unwitnessed(ask.steps, resolves).map((step) => step.step) : [];
      const change = ask && gap.length ? automationStudioTrialChangeUnwitnessedSession({ session: read, steps: ask.steps, parts: ask.parts, unwitnessed: gap, leftFromEarlier: () => ledgers().flatMap((ledger) => ledger.trialChange().leftFromEarlier()) }) : read;
      const joinedDecision = joined(decisions);
      return change && joinedDecision.kind === "admit" ? { ...joinedDecision, change } : joinedDecision;
    },
    trialRan(acts, trialRunId) {
      const left = own ? own.trialRan(acts, trialRunId) : [];
      for (const ledger of ledgers()) if (ledger !== own) left.push(...ledger.trialRan([], trialRunId));
      return left;
    },
    admit(steps) {
      return admitted(steps, resolves, (step) => project.stepReach?.(step));
    }
  };
}

/** The trial's admission (header): always admitted, noting under `unwitnessed` each reversible lasting step whose stamp is missing or no longer resolves. */
function admitted(steps: readonly AutomationStudioSiteResetTrialStep[], resolves: (witness: unknown) => boolean, reach: (step: AutomationStudioSiteResetTrialStep) => AutomationStudioSiteResetStepReachAnswer | undefined): AutomationStudioSiteResetStepAdmission {
  const found = unwitnessed(steps, resolves);
  if (!found.length) return { kind: "admit" };
  // Each step in its own tab (header, t791 fix 2): a step the step door never saw is offered no ref, since none is known to be read in its tab.
  const gap = found.map((step) => ({ step: step.step, ...(step.label !== undefined ? { label: step.label } : {}), ...(reach(step) ?? { canMeet: "another_page" as const, issued: [] }) }));
  return { kind: "admit", unwitnessed: { steps: gap.map(({ step, label }) => ({ step, ...(label !== undefined ? { label } : {}) })), instruction: UNWITNESSED_WORDS.ran(gap) } };
}

/** The reversible lasting steps among `steps` with no stamp that still resolves (header). */
function unwitnessed<S extends { consequences: readonly string[]; witness?: unknown }>(steps: readonly S[], resolves: (witness: unknown) => boolean): S[] {
  return steps.filter((step) => step.consequences.length > 0 && step.consequences.every((consequence) => REVERSIBLE.has(consequence)) && !resolves(step.witness));
}

/** Refusals of several ledgers as one: the first's evidence, naming every act each named (header). */
function refusedTogether(refusals: ReadonlyArray<AutomationStudioSiteResetDecision>): AutomationStudioSiteResetDecision {
  const refused = refusals.filter((decision): decision is Extract<AutomationStudioSiteResetDecision, { kind: "refuse" }> => decision.kind === "refuse");
  const lead = refused[0]!;
  const actsToUndo = refused.flatMap((refusal) => list(refusal.evidence.actsToUndo));
  return { kind: "refuse", evidence: { ...lead.evidence, ...(actsToUndo.length ? { actsToUndo } : {}) }, moved: refused.some((refusal) => refusal.moved) };
}

/** Every ledger's answer as one (header): a refusal of any (the targeted one) refuses, naming every act; else one admission. */
function joined(decisions: readonly AutomationStudioSiteResetDecision[]): AutomationStudioSiteResetDecision {
  if (decisions.some((decision) => decision.kind === "refuse")) return refusedTogether(decisions);
  const admitted = decisions as ReadonlyArray<Extract<AutomationStudioSiteResetDecision, { kind: "admit" }>>;
  const absorbed: AutomationStudioSiteResetNamedAct[] = admitted.flatMap((decision) => decision.absorbedByStartReset ?? []);
  const startedWith = joinedStartedWith(admitted.flatMap((decision) => (decision.startedWith ? [decision.startedWith] : [])));
  return { kind: "admit", ...(startedWith ? { startedWith } : {}), ...(absorbed.length ? { absorbedByStartReset: absorbed } : {}) };
}

/**
 * The trial's readings for the whole build (header, t775): places, latest reads and the read count through one ledger (the
 * own brief's, or the first that holds an act), every read reaching it as it reaches every ledger; what of the build is on
 * the site, and whether a step's change was seen, asked of every ledger.
 */
function sessionOver(ledgers: readonly AutomationStudioSiteResetLedger[], ask: AutomationStudioTrialChangeAsk, look: NonNullable<AutomationStudioSiteResetChecks["lookAt"]>): Promise<AutomationStudioTrialChangeSession | undefined> {
  const reader = ledgers[0];
  if (!reader) return Promise.resolve(undefined);
  const ports = ledgers.map((ledger) => ledger.trialChange());
  const own = ports[0]!;
  const port: AutomationStudioTrialChangeLedgerPort = {
    places: own.places, latest: own.latest, seq: own.seq,
    leftFromEarlier: () => ports.flatMap((entry) => entry.leftFromEarlier()),
    carried: (step) => ports.some((entry) => entry.carried(step)),
    start: (place) => ports.map((entry) => entry.start?.(place)).find((counts) => counts !== undefined)
  };
  return automationStudioTrialChangeBegin({ steps: ask.steps, parts: ask.parts, port, look: (location, start) => look(location, start) });
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
