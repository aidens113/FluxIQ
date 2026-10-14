import type { AutomationStudioProjectBuilderReturn, AutomationStudioProjectStructurePlan, AutomationStudioProjectSubflowBrief, AutomationStudioProjectTaskSpec } from "../contracts/index.ts";
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
};

/** A plan as the supervisor takes it into force: what `project.write_plan` and `project.amend_plan` read. */
type Adopted = { taskSpec: AutomationStudioProjectTaskSpec; structure: AutomationStudioProjectStructurePlan; purposes: Record<string, string>; after: Record<string, string[]> };

/** The brief kinds whose done return carries a proposal. */
const PROPOSING: ReadonlySet<AutomationStudioProjectSubflowBrief["kind"]> = new Set(["build", "repair"]);

/**
 * What one supervisor run knows of its build: the task spec and structure
 * plan in force, every brief sent and every return read, and what the whole
 * trials left. The build record is the durable copy (`../record/`); this is
 * read from it when the run starts, so a supervisor started again on a build
 * already under way sees the plan and the returns it left.
 *
 * **What an amendment keeps (t590).** A proposal's identity holds the digest
 * of the plan it was made under, so `project.amend_plan` used to drop every
 * subflow's passing proposal, even those the amendment left as they were, and
 * the build paid to build them again. Now each subflow's latest done proposal
 * from an earlier plan is kept when the plan in force gives that subflow the
 * same key, role, interface and success check, the same parts with the same
 * words, facts and lasting acts, and the same `after` as the predecessors its
 * brief ran after -- and every subflow it runs after is kept too, since a
 * changed predecessor would leave the site somewhere else for it. What is kept
 * is fixed when a plan comes into force (`adopt`), so it never shifts under a
 * dispatch, and counts as done until the subflow is built again under the plan
 * in force. A supervisor started again on a build under way reads no plan's
 * `after` (below), so it keeps nothing an earlier plan made.
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
  /** The last whole trial left lasting acts on the target, and no reset brief has come back done since. */
  wholeTrialLeftActs = false;
  /** A whole trial ran and did not pass. */
  wholeTrialFailed = false;
  /**
   * The latest reset brief that came back not done, and what it left on the
   * target (`left`, a key the dispatch tool compares): a second reset sent
   * right after it with the same acts left is answered without running
   * (social debug fix 5, `./dispatch-tool.ts`).
   */
  resetLeft: { briefId: string; outcome: string; reason: string; left: string } | undefined;
  /** Every plan and task spec this build has had, by digest: what an amendment's comparison reads. */
  private readonly plans = new Map<string, AutomationStudioProjectStructurePlan>();
  private readonly specs = new Map<string, AutomationStudioProjectTaskSpec>();
  private carried: AutomationStudioProjectSupervisorCarried = { kept: new Map(), dropped: new Map() };

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
    if (!structure) return { kept: new Map(), dropped: new Map() };
    const current = this.doneUnderPlan();
    const earlier = new Map<string, AutomationStudioProjectSupervisorAnswered>();
    for (const brief of this.briefs) {
      if (brief.planDigest === structure.digest || current.has(brief.subflowKey) || !PROPOSING.has(brief.kind)) continue;
      const returned = this.returns.get(brief.briefId);
      if (returned?.outcome === "done" && returned.proposal) earlier.set(brief.subflowKey, { brief, returned });
    }
    const changed = new Map([...earlier].map(([key, answered]) => [key, this.changes(key, answered.brief)]));
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
    for (const [key, answered] of earlier) {
      const why = changed.get(key)!;
      if (why.length) dropped.set(key, why);
      else kept.set(key, answered);
    }
    return { kept, dropped };
  }

  /** What the plan in force changed for `key` against the plan `brief` was built under, in words; empty when nothing did. */
  private changes(key: string, brief: AutomationStudioProjectSubflowBrief): string[] {
    const now = this.structure!;
    const then = this.plans.get(brief.planDigest);
    const ours = now.plan.subflows.find((subflow) => subflow.key === key);
    if (!ours) return ["it is no longer in the plan"];
    const theirs = then?.plan.subflows.find((subflow) => subflow.key === key);
    const specNow = this.specs.get(now.taskSpecDigest);
    const specThen = then ? this.specs.get(then.taskSpecDigest) : undefined;
    if (!then || !theirs || !specNow || !specThen) return ["the plan it was built under is not known to this run"];
    const changed: string[] = [];
    if (ours.role !== theirs.role) changed.push("its role changed");
    if (!same(ours.interface, theirs.interface)) changed.push("its inputs or outputs changed");
    if (!same(ours.metadata?.["fluxiq.successCheck"], theirs.metadata?.["fluxiq.successCheck"])) changed.push("its success check changed");
    const partsNow = [...(now.partOf[key] ?? [])].sort();
    const partsThen = [...(then.partOf[key] ?? [])].sort();
    if (!same(partsNow, partsThen) || partsNow.some((id) => !same(words(specNow, id), words(specThen, id)))) changed.push("its parts changed");
    const after = this.after[key];
    if (!after) changed.push("what runs before it is not known to this run");
    else if (!same([...new Set(after)].sort(), [...new Set(brief.entry.predecessors)].sort())) changed.push("what runs before it changed");
    return changed;
  }
}

/** A part as a builder was briefed and judged on it: its words, facts and lasting acts. */
function words(spec: AutomationStudioProjectTaskSpec, id: string): unknown {
  const part = spec.parts.find((candidate) => candidate.id === id);
  return part ? { quote: part.quote, goalFacts: part.goalFacts, lastingActs: part.lastingActs } : undefined;
}

/** Whether two plain values hold the same JSON. */
function same(left: unknown, right: unknown): boolean {
  return JSON.stringify(left) === JSON.stringify(right);
}
