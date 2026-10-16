import type { JsonObject } from "../../../../../core/index.ts";
import type { AutomationStudioFlowCandidate, AutomationStudioFlowCandidateSubmissionController, AutomationStudioFlowCandidateTrialGate } from "../../flow-bootstrap/candidate/index.ts";
import type { AutomationStudioProjectBuilderReturn, AutomationStudioProjectReceiptRef, AutomationStudioProjectStructurePlan, AutomationStudioProjectSubflowBrief, AutomationStudioProjectTaskSpec } from "../contracts/index.ts";
import type { AutomationStudioProjectBuildRecordView } from "../record/index.ts";
import { automationStudioProjectSupervisorCarriedProposals, type AutomationStudioProjectSupervisorAnswered, type AutomationStudioProjectSupervisorCarried, type AutomationStudioProjectSupervisorCarriedForward } from "../amendment/index.ts";

export type { AutomationStudioProjectSupervisorAnswered, AutomationStudioProjectSupervisorCarried, AutomationStudioProjectSupervisorCarriedForward } from "../amendment/index.ts";

/**
 * A repair that came back done with a proposal doing exactly what the one it
 * replaced did (`./dispatch-tool.ts`, t595): its brief, the brief whose
 * proposal it matches, and what stood when it came back -- the plan, and the
 * latest whole test (`standing`, a key the dispatch tool compares).
 */
export type AutomationStudioProjectSupervisorUnchangedRepair = { briefId: string; sameAs: { briefId: string; revision: number }; planDigest: string; standing: string };

/**
 * The latest whole test when it passed only on the run's own recovery from
 * what its Flow does not answer (t603, below): the assembled revision, the
 * receipt a repair names it by, what the trial gate says is unanswered
 * (`unanswered`, its `slowDown`), and one key for this exact trial.
 */
export type AutomationStudioProjectSupervisorRescuedTest = { key: string; revision: number; digest: string; receipt: AutomationStudioProjectReceiptRef; unanswered: JsonObject[] };

/**
 * Why a rescued test's repair could not be made (below): it came back without
 * the change, or the build's money, time or turns ran out first, or a guard
 * stopped the supervisor's loop (`stalled`: a stall, a run of unusable or
 * unprogressing decisions) or its model provider stopped answering
 * (`provider`) before it completed (`./supervisor-loop.ts`, t622), or the
 * model gave an honest ending while the pass stood (`ended`, `./completion.ts`),
 * or completed naming the build's fallback (`completed`, t637).
 */
export type AutomationStudioProjectSupervisorRecoveryShortfall = "short" | "money" | "time" | "turns" | "stalled" | "provider" | "ended" | "completed";

/** What the person is told when the supervisor completes on a rescued test (t603, below). */
export type AutomationStudioProjectSupervisorReliesOnRecovery = {
  revision: number; digest: string; receiptId: string; why: AutomationStudioProjectSupervisorRecoveryShortfall; steps: JsonObject[]; told: string;
  /** `ended` only: the honest ending the model gave, its own words kept beside what the person is told (t622). */
  endedWith?: { outcome: "blocked" | "partial"; reason: string };
  /** Completed on the build's fallback rather than the latest assembly (header, t637): the later assembly set aside, which never passed its whole test. */
  setAside?: { revision: number; digest: string };
};

/**
 * The build's fallback as an ending completes on it (header, t637): the
 * revision that passed, its trial's receipt, its Flow -- the one the run then
 * hands its caller to promote -- and the later assembly it sets aside.
 */
export type AutomationStudioProjectSupervisorFallbackFlow = {
  revision: number; digest: string; receiptId: string; candidate: AutomationStudioFlowCandidate; setAside: { revision: number; digest: string } | undefined;
  /** The latest assembly's own outright pass, which a guard's end completes on (header, t637): nothing set aside. */
  latest?: true;
};

/**
 * The pass an ending completes on (header, t637): the latest assembly's own
 * rescued pass (`test` alone), or the build's fallback -- a rescued pass, its
 * test beside it, or an outright one, with no `test`.
 */
export type AutomationStudioProjectSupervisorStandingRescue =
  | { test: AutomationStudioProjectSupervisorRescuedTest; fallback?: AutomationStudioProjectSupervisorFallbackFlow }
  | { test?: undefined; fallback: AutomationStudioProjectSupervisorFallbackFlow };

/** What the person is told when the supervisor completes on a fallback that passed outright (header, t637): no recovery to rely on, so none is said. */
export type AutomationStudioProjectSupervisorCompletedOnPass = {
  revision: number; digest: string; receiptId: string; why: AutomationStudioProjectSupervisorRecoveryShortfall; told: string;
  setAside?: { revision: number; digest: string };
  endedWith?: { outcome: "blocked" | "partial"; reason: string };
};

/** The trial gate's refusal of a yes whose Flow does not answer what the site asked the run to do (`flow-bootstrap/candidate/trial-gate.ts`). */
const SLOW_DOWN_UNHANDLED = "candidate.trial_slow_down_unhandled";

/** The words that end what the person is told, by why the repair could not be made (below). */
const SHORTFALL_WORDS: Readonly<Record<AutomationStudioProjectSupervisorRecoveryShortfall, string>> = Object.freeze({
  short: "A repair to add that came back without it.",
  money: "The build's spending limit could not pay for a repair to add that.",
  time: "The build reached its time limit before a repair to add that was made.",
  turns: "The build ran out of turns before a repair to add that was made.",
  stalled: "The build stopped making progress before it could add that.",
  provider: "The AI model provider stopped answering before the build could add that.",
  ended: "The supervisor ended the build before a repair to add that was made.",
  completed: "The supervisor completed on it before a repair to add that was made."
});

/** What then stopped a build that completes on its fallback (header, t637): its repair was made, so the words above, which say it was not, do not fit. */
const FALLBACK_STOP_WORDS: Readonly<Record<AutomationStudioProjectSupervisorRecoveryShortfall, string>> = Object.freeze({
  short: "A later repair came back without the change.",
  money: "The build's spending limit then ran out.",
  time: "The build then reached its time limit.",
  turns: "The build then ran out of turns.",
  stalled: "The build then stopped making progress.",
  provider: "The AI model provider then stopped answering.",
  ended: "The supervisor then ended the build.",
  completed: "The supervisor then completed on it."
});

/** A plan as the supervisor takes it into force: what `project.write_plan` and `project.amend_plan` read. */
type Adopted = { taskSpec: AutomationStudioProjectTaskSpec; structure: AutomationStudioProjectStructurePlan; purposes: Record<string, string>; after: Record<string, string[]> };

/** The brief kinds whose done return carries a proposal. */
const PROPOSING: ReadonlySet<AutomationStudioProjectSubflowBrief["kind"]> = new Set(["build", "repair"]);

/**
 * What one supervisor run knows of its build: the plan in force, every brief
 * sent and every return read. The build record is the durable copy
 * (`../record/`), read when the run starts, so a supervisor started again on a
 * build under way sees the plan and the returns it left.
 *
 * **What an amendment keeps (t590).** A proposal's identity holds the digest
 * of the plan it was made under, so `project.amend_plan` used to drop every
 * subflow's passing proposal, even those the amendment left as they were, and
 * the build paid to build them again. Now each subflow's latest done proposal
 * from an earlier plan is kept when the plan in force gives that subflow the
 * same key, role, interface and success check, the same parts with the same
 * lasting acts and words (below, t595), and the same `after` as the predecessors its
 * brief ran after -- and every subflow it runs after is kept too, since a
 * changed predecessor would leave the site somewhere else for it. What is kept
 * is fixed when a plan comes into force (`adopt`), so it never shifts under a
 * dispatch, and counts as done until the subflow is built again under the plan
 * in force. A supervisor started again on a build under way reads no plan's
 * `after` (below), so it keeps nothing an earlier plan made.
 *
 * **A part's words moved by a word or two are not a part changed (bigbox
 * debug, t595).** Bigbox `run-mv8c7unr-42a8456d` reworded one part's facts and
 * gave another's words a leading "then", and both proposals were dropped. A
 * part whose facts changed (compared trimmed, case and whitespace set aside)
 * no longer keeps it, as "its facts changed" -- since t671 it carries it,
 * below, where t595 dropped it; one whose text differs only by at most two
 * words at its ends (`../amendment/part-change.ts`), with the same
 * instruction, lasting acts and facts, keeps it, named under `reworded` in
 * the amendment's answer.
 *
 * **An amendment that only adds to a subflow carries its proposal (A8 towels
 * `run-mvac0nmw`, t658).** The supervisor moved a part that only shaped the
 * rows into the subflow that read them and renamed that subflow's output, and
 * the judged-yes proposal was dropped for "its inputs or outputs changed" and
 * "its parts changed", though it already stored what the moved part asked; the
 * build spent the rest of its money earning it again and did not. Now, when
 * the only changes are parts added beside the ones it was built for (each of
 * those the same or reworded) and outputs added or renamed, with its inputs,
 * key, role, success check and `after` as they were, the proposal is carried
 * (`forward`): not done -- its trial never judged the new parts, so it counts
 * for nothing towards assembly or completion -- but named on the next build
 * brief of that subflow (`carriedFrom`, `./dispatch-tool.ts`), whose builder
 * starts from it and tests it first (`../dispatch/run-brief.ts`). A yes on that
 * trial is a yes on every part. Any other change drops it, as before. A carried
 * subflow is not kept, so what runs after it is dropped, as after any not kept.
 *
 * **A narrowing or a merge carries it too (Lab `run-mvan7giv`, t671).** That
 * run's supervisor removed an output no subflow took any more, then merged two
 * subflows into one, and each time Core dropped the done work and the build
 * paid for it again from the start page. Now a done subflow whose amendment
 * only removed outputs is carried on its own key, and one merged into another
 * subflow, or renamed, is carried onto the subflow that holds its parts, and
 * one whose parts kept their ids and words but changed their facts or lasting
 * acts is carried too (supervisor decision, reversing t595's drop) -- each
 * with the conditions and the reasons in `../amendment/carried-proposals.ts`, where
 * the whole comparison lives. The answer says, for each, why (`because`).
 *
 * **A pass the run rescued is repaired, or relied on and said (t603).** Social
 * `run-mv8mebid-84ada5bd` passed its whole test only on the runtime's own
 * recovery when the site asked it to slow down, and its repair was refused as
 * naming a trial that passed. Such a test (`rescuedTest`) is read from the
 * trial gate's completion answer, never from page words, and a repair may name
 * it; when the repair cannot be made (`recoveryRepairsShort`) the supervisor
 * completes on it (`relyOnRecovery`) and the person is told why. Only a
 * slow-down admits that repair (t612): a consent banner or dialog the run
 * closed asks the Flow for no step, so each step the gate names is kept only
 * when its own step record says the site asked the run to slow down
 * (`slowedDown`, below).
 *
 * **A rescued pass outlives a later assembly (A8 wave 9 social
 * `run-mv9ml775`, t637).** The repair of a rescued pass came back done, its
 * re-assembly became the latest candidate, no later whole test answered yes,
 * and the build ended with no Flow: `rescuedTest` reads only the latest
 * assembly, so the passing revision stopped counting the moment it was no
 * longer latest. A repair whose re-assembled Flow never passes is a failed
 * repair, and a failed repair never loses a passing Flow. So after every whole
 * test (`noteWholeTest`, from `./whole-trial.ts`) the most recent pass of
 * either kind -- a rescued pass, or an outright yes the gate completes on -- is
 * kept with its own Flow, a snapshot of the candidate the trial ran, as the
 * build's fallback, replaced only by a later pass, and dropped when its own
 * revision is tested again and no longer passes. An ending with no later pass,
 * and a completion naming the fallback (coordinator, t637), complete on it
 * (`standingRescue`): the run hands its caller that revision's Flow and its
 * own yes to promote (`completedOn`, `./supervisor-loop.ts`), never the later
 * assembly, which the person is told was set aside. A rescued fallback is said
 * with the recovery words (`relyOnRecovery`); an outright one plainly, that the
 * later revision never passed (`completeOnPass`). An outright pass that is
 * itself the latest assembly is no fallback: the supervisor completes on it.
 * But when a guard ends the build before the supervisor did (`latestPass`,
 * `./supervisor-loop.ts`; coordinator, t637), the build completes on that
 * pass too -- a standing pass is Core's evidence however the loop stopped, as
 * t611 holds for a brief -- and the person is told the supervisor stopped
 * before completing. Before it does, the reset
 * rule holds as for any ending (`./completion.ts`, `./supervisor-loop.ts`): a
 * reset brief undoes this build's own acts still on the target, and what no
 * reset could undo is named in the person's words.
 */
export class AutomationStudioProjectSupervisorState {
  taskSpec: AutomationStudioProjectTaskSpec | undefined;
  structure: AutomationStudioProjectStructurePlan | undefined;
  /** The supervisor's own one line per subflow key, for the chat. */
  purposes: Record<string, string> = {};
  /**
   * What the plan in force says runs before each subflow, by key: a brief's
   * predecessors when it gives none (`./brief-input.ts`). Written with the plan
   * by this run; a supervisor started again on a build under way reads no
   * plan's `after` from the record, so its briefs name their predecessors.
   */
  after: Record<string, string[]> = {};
  readonly briefs: AutomationStudioProjectSubflowBrief[] = [];
  private readonly returns = new Map<string, AutomationStudioProjectBuilderReturn>();
  /** A whole trial ran and did not pass. */
  wholeTrialFailed = false;
  /**
   * The latest reset brief that came back not done, and what it left on the
   * target (`left`, a key the dispatch tool compares): a second reset sent
   * right after it with the same acts left is answered without running
   * (social debug fix 5, `./dispatch-tool.ts`).
   */
  resetLeft: { briefId: string; outcome: string; reason: string; left: string } | undefined;
  /**
   * What each brief this run sent was sent with, and what stood once its
   * return came back, by brief id, as a key the dispatch tool compares
   * (`./dispatch-tool.ts`, t595): the same brief sent again after it came back
   * blocked, with nothing it starts from changed since, is answered without
   * running. Briefs read from the record have none.
   */
  readonly sentAs = new Map<string, string>();
  /** The latest repair of each subflow that came back unchanged, by subflow key (`AutomationStudioProjectSupervisorUnchangedRepair`). */
  readonly unchangedRepairs = new Map<string, AutomationStudioProjectSupervisorUnchangedRepair>();
  /** Each rescued whole test whose repair could not be made, by its key, with why (header). */
  readonly recoveryRepairsShort = new Map<string, AutomationStudioProjectSupervisorRecoveryShortfall>();
  /** Set once the supervisor completed on a rescued test: what the person was told (header). */
  reliesOnRecovery: AutomationStudioProjectSupervisorReliesOnRecovery | undefined;
  /** Set once the supervisor completed on a fallback that passed outright: what the person was told (header, t637). */
  completedOnPass: AutomationStudioProjectSupervisorCompletedOnPass | undefined;
  /** Set once the supervisor completed on the fallback rather than the latest assembly: that fallback's Flow, for the run to hand its caller (header, t637). */
  completedOn: AutomationStudioFlowCandidate | undefined;
  /** The most recent whole-test pass with its Flow and trial receipt, its rescued test when it was rescued, until a later pass replaces it (header, t637). */
  private fallback: { candidate: AutomationStudioFlowCandidate; receiptId: string; rescued?: AutomationStudioProjectSupervisorRescuedTest } | undefined;
  /** Each subflow a plan was refused once for only reshaping what another reads, by its key and parts (`./plan-tool.ts`, t658): sent again, it is taken. */
  readonly reshapeRefused = new Set<string>();
  /** Every plan and task spec this build has had, by digest: what an amendment's comparison reads. */
  private readonly plans = new Map<string, AutomationStudioProjectStructurePlan>();
  private readonly specs = new Map<string, AutomationStudioProjectTaskSpec>();
  private carried: AutomationStudioProjectSupervisorCarried = NOTHING_CARRIED();

  /** Reads the record's task specs and plans (the latest in force), every brief and every return written. */
  load(view: AutomationStudioProjectBuildRecordView): void {
    for (const { plan } of view.record.plans) this.plans.set(plan.digest, plan);
    for (const { taskSpec } of view.record.taskSpecs) this.specs.set(taskSpec.digest, taskSpec);
    this.taskSpec = view.record.taskSpecs.at(-1)?.taskSpec;
    this.structure = view.record.plans.at(-1)?.plan;
    for (const { brief } of view.record.briefs) this.briefs.push(brief);
    for (const entry of view.returns) this.returns.set(entry.briefId, entry.builderReturn);
    this.carried = this.carry();
  }

  /** Takes a written or amended plan into force, and answers which earlier proposals it keeps and which it drops (header). */
  adopt(plan: Adopted): AutomationStudioProjectSupervisorCarried {
    this.plans.set(plan.structure.digest, plan.structure);
    this.specs.set(plan.taskSpec.digest, plan.taskSpec);
    this.taskSpec = plan.taskSpec;
    this.structure = plan.structure;
    this.purposes = plan.purposes;
    this.after = plan.after;
    this.carried = this.carry();
    return this.carried;
  }

  /** Ids for the next briefs, in order: unique across the build, each a storage id. */
  briefIds(): () => string {
    const taken = new Set(this.briefs.map((brief) => brief.briefId));
    let index = this.briefs.length;
    return () => {
      index += 1;
      while (taken.has(`brief-${index}`)) index += 1;
      return `brief-${index}`;
    };
  }

  answer(briefId: string, returned: AutomationStudioProjectBuilderReturn): void {
    this.returns.set(briefId, returned);
  }

  /** Every brief answered so far under the plan in force, oldest first. */
  answeredUnderPlan(): AutomationStudioProjectSupervisorAnswered[] {
    const digest = this.structure?.digest;
    return this.briefs.flatMap((brief) => {
      const returned = this.returns.get(brief.briefId);
      return returned && brief.planDigest === digest ? [{ brief, returned }] : [];
    });
  }

  /**
   * The latest done return with a proposal for each subflow, by subflow key:
   * under the plan in force, or else the one the plan in force kept from an
   * earlier plan (header).
   */
  latestDone(): Map<string, AutomationStudioProjectSupervisorAnswered> {
    const done = this.doneUnderPlan();
    for (const [key, answered] of this.carried.kept) if (!done.has(key)) done.set(key, answered);
    // In the order the briefs were sent, as assembly names where each came from.
    const sent = new Map(this.briefs.map((brief, index) => [brief.briefId, index]));
    return new Map([...done].sort(([, left], [, right]) => sent.get(left.brief.briefId)! - sent.get(right.brief.briefId)!));
  }

  /** Each done proposal an earlier plan made that the plan in force keeps and has not built again: the plan digest it was made under, by subflow key. */
  keptFromEarlierPlans(): Map<string, string> {
    const current = this.doneUnderPlan();
    return new Map([...this.carried.kept].filter(([key]) => !current.has(key)).map(([key, answered]) => [key, answered.brief.planDigest]));
  }

  /**
   * The subflows whose only done proposals were made under an earlier plan
   * and that the plan in force dropped, each with what changed: what a
   * `project.amend_plan` left without one, so a refusal of a brief waiting on
   * one can say the amendment is why (bigbox debug C4, t588).
   */
  droppedByEarlierPlans(): Map<string, readonly string[]> {
    const current = this.doneUnderPlan();
    return new Map([...this.carried.dropped].filter(([key]) => !current.has(key)));
  }

  /** Each proposal the plan in force carried to its subflow's next build brief, while that subflow has no done proposal under it (header, t658). */
  carriedForward(): Map<string, AutomationStudioProjectSupervisorCarriedForward> {
    const current = this.doneUnderPlan();
    return new Map([...this.carried.forward].filter(([key]) => !current.has(key)));
  }

  /** The latest build or repair brief of `subflowKey` answered under the plan in force, with its return. */
  latestFor(subflowKey: string): AutomationStudioProjectSupervisorAnswered | undefined {
    return this.answeredUnderPlan().filter((answered) => answered.brief.subflowKey === subflowKey && PROPOSING.has(answered.brief.kind)).at(-1);
  }

  /** Every brief of `subflowKey` answered under any plan, oldest first: what a repair's failing receipt is looked for in. */
  answeredFor(subflowKey: string): AutomationStudioProjectSupervisorAnswered[] {
    return this.briefs.flatMap((brief) => {
      const returned = this.returns.get(brief.briefId);
      return returned && brief.subflowKey === subflowKey ? [{ brief, returned }] : [];
    });
  }

  /** Whether any brief, under any plan, came back partial or blocked. */
  anyNotDone(): boolean {
    return this.briefs.some((brief) => {
      const outcome = this.returns.get(brief.briefId)?.outcome;
      return outcome === "partial" || outcome === "blocked";
    });
  }

  /** Whether the latest brief sent was a reset and its return came back, done or not: the build tried to undo its acts after its last other brief. */
  resetCameBackLast(): boolean {
    const latest = this.briefs.at(-1);
    return latest?.kind === "reset" && this.returns.has(latest.briefId);
  }

  /**
   * The latest assembled Flow's latest whole test, when it passed and the
   * trial gate holds it back from completion only for what the run recovered
   * from by itself and the Flow does not answer (header); undefined otherwise.
   */
  rescuedTest(controller: Pick<AutomationStudioFlowCandidateSubmissionController, "latest">, gate: Pick<AutomationStudioFlowCandidateTrialGate, "standing" | "completion">): AutomationStudioProjectSupervisorRescuedTest | undefined {
    const latest = controller.latest();
    const standing = latest ? gate.standing(latest) : undefined;
    if (!latest || standing?.verdict !== "yes") return undefined;
    const checked = gate.completion({ revision: latest.revision, digest: latest.digest });
    if (checked.ok || !checked.issueCodes.includes(SLOW_DOWN_UNHANDLED)) return undefined;
    const unanswered = objects(checked.feedback.slowDown).filter((entry) => slowedDown(entry, objects(standing.feedback.steps), objects(standing.feedback.paces)));
    if (!unanswered.length) return undefined;
    const receiptId = standing.trialRunId ?? `whole-test-${latest.revision}`;
    return { key: JSON.stringify([latest.revision, latest.digest, receiptId]), revision: latest.revision, digest: latest.digest, receipt: { kind: "candidate_trial", receiptId, digest: latest.digest }, unanswered: structuredClone(unanswered) };
  }

  /**
   * After each whole test (header, t637): a pass of the latest assembly,
   * rescued or outright, becomes the build's fallback, with its Flow; the
   * fallback's own revision tested again and no longer passing drops it.
   */
  noteWholeTest(controller: Pick<AutomationStudioFlowCandidateSubmissionController, "latest">, gate: Pick<AutomationStudioFlowCandidateTrialGate, "standing" | "completion">): void {
    const latest = controller.latest();
    if (!latest) return;
    const rescued = this.rescuedTest(controller, gate);
    if (rescued) {
      this.fallback = { candidate: latest, receiptId: rescued.receipt.receiptId, rescued };
      return;
    }
    const standing = gate.standing(latest);
    if (standing?.verdict === "yes" && gate.completion({ revision: latest.revision, digest: latest.digest }).ok) {
      this.fallback = { candidate: latest, receiptId: standing.trialRunId ?? `whole-test-${latest.revision}` };
      return;
    }
    if (this.fallback?.candidate.revision === latest.revision && this.fallback.candidate.digest === latest.digest) this.fallback = undefined;
  }

  /**
   * The pass an ending completes on (header, t637): the latest assembly's own
   * rescued pass, else the fallback a later assembly set aside, with its Flow.
   * Undefined when there is none, or the fallback is the latest assembly's
   * outright pass, which the supervisor completes on as it is.
   */
  standingRescue(controller: Pick<AutomationStudioFlowCandidateSubmissionController, "latest">, gate: Pick<AutomationStudioFlowCandidateTrialGate, "standing" | "completion">): AutomationStudioProjectSupervisorStandingRescue | undefined {
    const latest = this.rescuedTest(controller, gate);
    if (latest) return { test: latest };
    const kept = this.fallback;
    if (!kept) return undefined;
    const now = controller.latest();
    const { revision, digest } = kept.candidate;
    if (!kept.rescued && now?.revision === revision && now.digest === digest) return undefined;
    const fallback: AutomationStudioProjectSupervisorFallbackFlow = { revision, digest, receiptId: kept.receiptId, candidate: structuredClone(kept.candidate), setAside: now ? { revision: now.revision, digest: now.digest } : undefined };
    return kept.rescued ? { test: kept.rescued, fallback } : { fallback };
  }

  /**
   * Completes on a rescued pass, which the build could not repair for `why`
   * (header): what the person is told, kept for the run's outcome. On the
   * fallback (t637) the person is told the later assembly never passed and
   * what then stopped the build, and `left`, Core's note of what is still on
   * the target, follows.
   */
  relyOnRecovery(rescue: { test: AutomationStudioProjectSupervisorRescuedTest; fallback?: AutomationStudioProjectSupervisorFallbackFlow }, why: AutomationStudioProjectSupervisorRecoveryShortfall, endedWith?: { outcome: "blocked" | "partial"; reason: string }, left?: string): AutomationStudioProjectSupervisorReliesOnRecovery {
    const { test, fallback } = rescue;
    const at = test.unanswered.map((entry) => `${typeof entry.step === "number" ? `step ${entry.step}` : "a step"}${typeof entry.label === "string" ? ` (${JSON.stringify(entry.label)})` : ""}`);
    const where = at.length > 1 ? `${at.slice(0, -1).join(", ")} and ${at.at(-1)}` : at[0]!;
    // A repair that already came back without the change is said too, before what then stopped the build (t622).
    const short = !fallback && why !== "short" && this.recoveryRepairsShort.has(test.key) ? `${SHORTFALL_WORDS.short} ` : "";
    const later = fallback?.setAside ? `revision ${fallback.setAside.revision}` : "a later revision";
    const after = fallback
      ? `A repair to add that was made, but the Flow assembled from it (${later}) never passed its whole test, so the build completes on revision ${test.revision}, the last that passed. ${FALLBACK_STOP_WORDS[why]}${left ? ` ${left}` : ""}`
      : `${short}${SHORTFALL_WORDS[why]}`;
    const told = `The Flow passed its whole test, but the site asked the run to slow down at ${where}, and the Flow does not answer that itself: it relies on the run's own recovery, which waits, tries the step again and closes the site's notice. ${after}`;
    this.reliesOnRecovery = {
      revision: test.revision, digest: test.digest, receiptId: test.receipt.receiptId, why, steps: structuredClone(test.unanswered), told,
      ...(endedWith ? { endedWith: { ...endedWith } } : {}), ...(fallback?.setAside ? { setAside: { ...fallback.setAside } } : {})
    };
    this.completedOn = fallback ? structuredClone(fallback.candidate) : undefined;
    return structuredClone(this.reliesOnRecovery);
  }

  /**
   * The latest assembly's own outright pass, for a guard's end to complete on
   * (header, t637); undefined when its latest whole test is no such pass.
   */
  latestPass(controller: Pick<AutomationStudioFlowCandidateSubmissionController, "latest">, gate: Pick<AutomationStudioFlowCandidateTrialGate, "standing" | "completion">): { fallback: AutomationStudioProjectSupervisorFallbackFlow } | undefined {
    const latest = controller.latest();
    const standing = latest ? gate.standing(latest) : undefined;
    if (!latest || standing?.verdict !== "yes" || !gate.completion({ revision: latest.revision, digest: latest.digest }).ok) return undefined;
    return { fallback: { revision: latest.revision, digest: latest.digest, receiptId: standing.trialRunId ?? `whole-test-${latest.revision}`, candidate: latest, setAside: undefined, latest: true } };
  }

  /**
   * Completes on a pass that passed its whole test outright (header, t637),
   * said plainly: on a fallback, that the later revision never passed; on the
   * latest assembly's own, that the supervisor stopped before completing; then
   * what stopped the build.
   */
  completeOnPass(fallback: AutomationStudioProjectSupervisorFallbackFlow, why: AutomationStudioProjectSupervisorRecoveryShortfall, endedWith?: { outcome: "blocked" | "partial"; reason: string }, left?: string): AutomationStudioProjectSupervisorCompletedOnPass {
    const later = fallback.setAside ? `Revision ${fallback.setAside.revision}` : "A later revision";
    const said = fallback.latest
      ? `The supervisor stopped before completing, so the build completes on revision ${fallback.revision}, which passed its whole test.`
      : `${later} never passed its whole test, so the build completes on revision ${fallback.revision}, the last that passed.`;
    const told = `${said} ${FALLBACK_STOP_WORDS[why]}${left ? ` ${left}` : ""}`;
    this.completedOnPass = {
      revision: fallback.revision, digest: fallback.digest, receiptId: fallback.receiptId, why, told,
      ...(fallback.setAside ? { setAside: { ...fallback.setAside } } : {}), ...(endedWith ? { endedWith: { ...endedWith } } : {})
    };
    this.completedOn = structuredClone(fallback.candidate);
    return structuredClone(this.completedOnPass);
  }

  /** Whether any brief came back done. */
  anyDone(): boolean {
    return [...this.returns.values()].some((returned) => returned.outcome === "done");
  }

  /** The latest done return with a proposal for each subflow under the plan in force, by subflow key. */
  private doneUnderPlan(): Map<string, AutomationStudioProjectSupervisorAnswered> {
    const done = new Map<string, AutomationStudioProjectSupervisorAnswered>();
    for (const answered of this.answeredUnderPlan()) {
      if (PROPOSING.has(answered.brief.kind) && answered.returned.outcome === "done" && answered.returned.proposal) done.set(answered.brief.subflowKey, answered);
    }
    return done;
  }

  /** Which earlier plans' latest done proposals the plan in force keeps, which it carries and what changed for each it drops (header, `../amendment/`). */
  private carry(): AutomationStudioProjectSupervisorCarried {
    const structure = this.structure;
    if (!structure) return NOTHING_CARRIED();
    const current = this.doneUnderPlan();
    const earlier = new Map<string, AutomationStudioProjectSupervisorAnswered>();
    for (const brief of this.briefs) {
      if (brief.planDigest === structure.digest || current.has(brief.subflowKey) || !PROPOSING.has(brief.kind)) continue;
      const returned = this.returns.get(brief.briefId);
      if (returned?.outcome === "done" && returned.proposal) earlier.set(brief.subflowKey, { brief, returned });
    }
    return automationStudioProjectSupervisorCarriedProposals({ structure, plans: this.plans, specs: this.specs, after: this.after, earlier, current: new Set(current.keys()) });
  }
}

/** What a build with no plan in force keeps and carries: nothing. */
const NOTHING_CARRIED = (): AutomationStudioProjectSupervisorCarried => ({ kept: new Map(), dropped: new Map(), reworded: new Map(), forward: new Map(), changedParts: new Map() });

/** Whether the gate's `entry` is a step whose own record says the site asked the run to slow down (header): an absorbed refusal carrying the site's wait, a closed layer of kind `rate_limit`, or a pace the run learned for it, which only such a wait raises. */
function slowedDown(entry: JsonObject, steps: readonly JsonObject[], paces: readonly JsonObject[]): boolean {
  const record = steps.find((step) => typeof entry.step === "number" && step.step === entry.step);
  const learned = paces.some((pace) => (record ? pace.definitionId === record.definitionId && pace.label === record.label && pace.control === record.control : entry.step === undefined && pace.label === entry.label));
  return learned || objects(record?.absorbed).some((absorbed) => typeof absorbed.askedWaitMs === "number" && absorbed.askedWaitMs > 0) || objects(record?.interruptions).some((layer) => layer.kind === "rate_limit");
}

/** The JSON objects in `value` when it is a list; none otherwise. */
const objects = (value: unknown): JsonObject[] => (Array.isArray(value) ? value.filter((entry): entry is JsonObject => Boolean(entry) && typeof entry === "object" && !Array.isArray(entry)) : []);
