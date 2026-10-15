import type { JsonObject } from "../../../../../core/index.ts";
import type { AutomationStudioFlowCandidateSubmissionController, AutomationStudioFlowCandidateTrialGate } from "../../flow-bootstrap/candidate/index.ts";
import type { AutomationStudioProjectBuilderReturn, AutomationStudioProjectReceiptRef, AutomationStudioProjectStructurePlan, AutomationStudioProjectSubflowBrief, AutomationStudioProjectTaskSpec } from "../contracts/index.ts";
import type { AutomationStudioProjectBuildRecordView } from "../record/index.ts";

/** A brief and the return that answered it. */
export type AutomationStudioProjectSupervisorAnswered = { brief: AutomationStudioProjectSubflowBrief; returned: AutomationStudioProjectBuilderReturn };

/**
 * What the plan in force did with the done proposals made under earlier plans
 * (t590): each it keeps, by subflow key, and each it drops, with what changed.
 */
export type AutomationStudioProjectSupervisorCarried = {
  kept: ReadonlyMap<string, AutomationStudioProjectSupervisorAnswered>;
  dropped: ReadonlyMap<string, readonly string[]>;
  /** Each kept subflow whose parts the amendment only reworded, with those part ids (header, t595). */
  reworded: ReadonlyMap<string, readonly string[]>;
};

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
 * model gave an honest ending while the pass stood (`ended`, `./completion.ts`).
 */
export type AutomationStudioProjectSupervisorRecoveryShortfall = "short" | "money" | "time" | "turns" | "stalled" | "provider" | "ended";

/** What the person is told when the supervisor completes on a rescued test (t603, below). */
export type AutomationStudioProjectSupervisorReliesOnRecovery = {
  revision: number; digest: string; receiptId: string; why: AutomationStudioProjectSupervisorRecoveryShortfall; steps: JsonObject[]; told: string;
  /** `ended` only: the honest ending the model gave, its own words kept beside what the person is told (t622). */
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
  ended: "The supervisor ended the build before a repair to add that was made."
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
 * still drops it, as "its facts changed"; one whose text differs only by at
 * most `EDGE_WORDS` words at its ends, with the same instruction, lasting acts
 * and facts, keeps it, named under `reworded` in the amendment's answer.
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
  /** Every plan and task spec this build has had, by digest: what an amendment's comparison reads. */
  private readonly plans = new Map<string, AutomationStudioProjectStructurePlan>();
  private readonly specs = new Map<string, AutomationStudioProjectTaskSpec>();
  private carried: AutomationStudioProjectSupervisorCarried = { kept: new Map(), dropped: new Map(), reworded: new Map() };

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

  /** Completes on `test`, which the build could not repair for `why` (header): what the person is told, kept for the run's outcome. */
  relyOnRecovery(test: AutomationStudioProjectSupervisorRescuedTest, why: AutomationStudioProjectSupervisorRecoveryShortfall, endedWith?: { outcome: "blocked" | "partial"; reason: string }): AutomationStudioProjectSupervisorReliesOnRecovery {
    const at = test.unanswered.map((entry) => `${typeof entry.step === "number" ? `step ${entry.step}` : "a step"}${typeof entry.label === "string" ? ` (${JSON.stringify(entry.label)})` : ""}`);
    const where = at.length > 1 ? `${at.slice(0, -1).join(", ")} and ${at.at(-1)}` : at[0]!;
    // A repair that already came back without the change is said too, before what then stopped the build (t622).
    const short = why !== "short" && this.recoveryRepairsShort.has(test.key) ? `${SHORTFALL_WORDS.short} ` : "";
    const told = `The Flow passed its whole test, but the site asked the run to slow down at ${where}, and the Flow does not answer that itself: it relies on the run's own recovery, which waits, tries the step again and closes the site's notice. ${short}${SHORTFALL_WORDS[why]}`;
    this.reliesOnRecovery = { revision: test.revision, digest: test.digest, receiptId: test.receipt.receiptId, why, steps: structuredClone(test.unanswered), told, ...(endedWith ? { endedWith: { ...endedWith } } : {}) };
    return structuredClone(this.reliesOnRecovery);
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

  /** Which earlier plans' latest done proposals the plan in force keeps, and what changed for each it drops (header). */
  private carry(): AutomationStudioProjectSupervisorCarried {
    const structure = this.structure;
    if (!structure) return { kept: new Map(), dropped: new Map(), reworded: new Map() };
    const current = this.doneUnderPlan();
    const earlier = new Map<string, AutomationStudioProjectSupervisorAnswered>();
    for (const brief of this.briefs) {
      if (brief.planDigest === structure.digest || current.has(brief.subflowKey) || !PROPOSING.has(brief.kind)) continue;
      const returned = this.returns.get(brief.briefId);
      if (returned?.outcome === "done" && returned.proposal) earlier.set(brief.subflowKey, { brief, returned });
    }
    const compared = new Map([...earlier].map(([key, answered]) => [key, this.changes(key, answered.brief)]));
    const changed = new Map([...compared].map(([key, found]) => [key, found.why]));
    // A subflow that runs after one that is not kept is not kept either, however far down the chain (header).
    for (let moved = true; moved;) {
      moved = false;
      for (const [key, answered] of earlier) {
        if (changed.get(key)!.length) continue;
        const lost = answered.brief.entry.predecessors.filter((predecessor) => changed.get(predecessor)?.length !== 0);
        if (!lost.length) continue;
        changed.set(key, lost.map((predecessor) => `it runs after "${predecessor}", which is not kept`));
        moved = true;
      }
    }
    const kept = new Map<string, AutomationStudioProjectSupervisorAnswered>();
    const dropped = new Map<string, readonly string[]>();
    const reworded = new Map<string, readonly string[]>();
    for (const [key, answered] of earlier) {
      const why = changed.get(key)!;
      if (why.length) dropped.set(key, why);
      else kept.set(key, answered);
      const parts = compared.get(key)!.reworded;
      if (!why.length && parts.length) reworded.set(key, parts);
    }
    return { kept, dropped, reworded };
  }

  /** What the plan in force changed for `key` against the plan `brief` was built under, in words (empty when nothing did), and the parts it only reworded (header). */
  private changes(key: string, brief: AutomationStudioProjectSubflowBrief): { why: string[]; reworded: string[] } {
    const now = this.structure!;
    const then = this.plans.get(brief.planDigest);
    const ours = now.plan.subflows.find((subflow) => subflow.key === key);
    if (!ours) return { why: ["it is no longer in the plan"], reworded: [] };
    const theirs = then?.plan.subflows.find((subflow) => subflow.key === key);
    const specNow = this.specs.get(now.taskSpecDigest);
    const specThen = then ? this.specs.get(then.taskSpecDigest) : undefined;
    if (!then || !theirs || !specNow || !specThen) return { why: ["the plan it was built under is not known to this run"], reworded: [] };
    const changed: string[] = [];
    if (ours.role !== theirs.role) changed.push("its role changed");
    if (!same(ours.interface, theirs.interface)) changed.push("its inputs or outputs changed");
    if (!same(ours.metadata?.["fluxiq.successCheck"], theirs.metadata?.["fluxiq.successCheck"])) changed.push("its success check changed");
    const partsNow = [...(now.partOf[key] ?? [])].sort();
    const partsThen = [...(then.partOf[key] ?? [])].sort();
    const compared = partsNow.map((id) => [id, partChange(specNow, specThen, id)] as const);
    if (!same(partsNow, partsThen) || compared.some(([, change]) => change === "changed")) changed.push("its parts changed");
    else if (compared.some(([, change]) => change === "facts")) changed.push("its facts changed");
    const after = this.after[key];
    if (!after) changed.push("what runs before it is not known to this run");
    else if (!same([...new Set(after)].sort(), [...new Set(brief.entry.predecessors)].sort())) changed.push("what runs before it changed");
    return { why: changed, reworded: compared.filter(([, change]) => change === "reworded").map(([id]) => id) };
  }
}

/** Whether the gate's `entry` is a step whose own record says the site asked the run to slow down (header): an absorbed refusal carrying the site's wait, a closed layer of kind `rate_limit`, or a pace the run learned for it, which only such a wait raises. */
function slowedDown(entry: JsonObject, steps: readonly JsonObject[], paces: readonly JsonObject[]): boolean {
  const record = steps.find((step) => typeof entry.step === "number" && step.step === entry.step);
  const learned = paces.some((pace) => (record ? pace.definitionId === record.definitionId && pace.label === record.label && pace.control === record.control : entry.step === undefined && pace.label === entry.label));
  return learned || objects(record?.absorbed).some((absorbed) => typeof absorbed.askedWaitMs === "number" && absorbed.askedWaitMs > 0) || objects(record?.interruptions).some((layer) => layer.kind === "rate_limit");
}

/** The JSON objects in `value` when it is a list; none otherwise. */
const objects = (value: unknown): JsonObject[] => (Array.isArray(value) ? value.filter((entry): entry is JsonObject => Boolean(entry) && typeof entry === "object" && !Array.isArray(entry)) : []);

/** The most words a part's text may gain or lose at its two ends together and still be the same part reworded (header). */
const EDGE_WORDS = 2;

/**
 * Whether part `id` is the same in both specs; only its words moved by a word
 * or two at their ends (`reworded`, header); its facts changed (`facts`); or
 * otherwise changed: its lasting acts, its instruction, or its words beyond that.
 */
function partChange(now: AutomationStudioProjectTaskSpec, then: AutomationStudioProjectTaskSpec, id: string): "same" | "reworded" | "facts" | "changed" {
  const ours = now.parts.find((part) => part.id === id);
  const theirs = then.parts.find((part) => part.id === id);
  if (!ours || !theirs) return "changed";
  if (!same([...ours.lastingActs].sort(), [...theirs.lastingActs].sort()) || ours.quote.sourceId !== theirs.quote.sourceId) return "changed";
  const text = ours.quote.text === theirs.quote.text ? "same" : withinEdges(wordsOf(ours.quote.text), wordsOf(theirs.quote.text)) ? "reworded" : "changed";
  if (text === "changed") return "changed";
  if (!same(ours.goalFacts.map(fact), theirs.goalFacts.map(fact))) return "facts";
  return text;
}

/** A goal fact as compared across plans: trimmed, lower case, each run of whitespace one space. */
function fact(text: string): string {
  return text.trim().replace(/\s+/gu, " ").toLowerCase();
}

/** A text's words, lower case, with no punctuation. */
function wordsOf(text: string): string[] {
  return text.toLowerCase().split(/[^\p{L}\p{N}]+/u).filter(Boolean);
}

/** Whether the shorter word list is the longer one with at most `EDGE_WORDS` words taken off its two ends together. */
function withinEdges(left: readonly string[], right: readonly string[]): boolean {
  const [short, long] = left.length <= right.length ? [left, right] : [right, left];
  if (!short.length || long.length - short.length > EDGE_WORDS) return false;
  for (let start = 0; start <= long.length - short.length; start += 1) {
    if (short.every((word, index) => long[start + index] === word)) return true;
  }
  return false;
}

/** Whether two plain values hold the same JSON. */
function same(left: unknown, right: unknown): boolean {
  return JSON.stringify(left) === JSON.stringify(right);
}
