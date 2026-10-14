import type { AutomationStudioProjectBuilderReturn, AutomationStudioProjectStructurePlan, AutomationStudioProjectSubflowBrief, AutomationStudioProjectTaskSpec } from "../contracts/index.ts";
import type { AutomationStudioProjectBuildRecordView } from "../record/index.ts";

/** A brief and the return that answered it. */
export type AutomationStudioProjectSupervisorAnswered = { brief: AutomationStudioProjectSubflowBrief; returned: AutomationStudioProjectBuilderReturn };

/**
 * What one supervisor run knows of its build: the task spec and structure
 * plan in force, every brief sent and every return read, and what the whole
 * trials left. The build record is the durable copy (`../record/`); this is
 * read from it when the run starts, so a supervisor started again on a build
 * already under way sees the plan and the returns it left.
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

  /** Reads the record's latest task spec and plan, every brief and every return written. */
  load(view: AutomationStudioProjectBuildRecordView): void {
    this.taskSpec = view.record.taskSpecs.at(-1)?.taskSpec;
    this.structure = view.record.plans.at(-1)?.plan;
    for (const { brief } of view.record.briefs) this.briefs.push(brief);
    for (const entry of view.returns) this.returns.set(entry.briefId, entry.builderReturn);
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

  /** The latest done return with a proposal for each subflow under the plan in force, by subflow key. */
  latestDone(): Map<string, AutomationStudioProjectSupervisorAnswered> {
    const done = new Map<string, AutomationStudioProjectSupervisorAnswered>();
    for (const answered of this.answeredUnderPlan()) {
      if (answered.brief.kind === "build" || answered.brief.kind === "repair") {
        if (answered.returned.outcome === "done" && answered.returned.proposal) done.set(answered.brief.subflowKey, answered);
      }
    }
    return done;
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
}
