import type { AutomationStudioProjectSubflowBrief } from "../contracts/index.ts";
import type { AutomationStudioProjectSupervisorInputIssue } from "./plan-input.ts";

/** A refused predecessor: its path, the subflow it names, and why it does not count (t588). */
export type AutomationStudioProjectSupervisorPredecessorIssue = AutomationStudioProjectSupervisorInputIssue & { predecessor: string; why: string };

/** The brief kinds whose return carries a proposal another brief's entry can run. */
const PROPOSING: ReadonlySet<AutomationStudioProjectSubflowBrief["kind"]> = new Set(["build", "repair"]);

/**
 * The order a dispatch hands its briefs over in (automation-project-agents
 * plan, `Concurrent dispatch`): every brief after the briefs of the same call
 * whose subflows its entry runs first, otherwise in the order sent. A
 * predecessor is either a subflow with a done proposal already (`done`) or
 * the subflow of a brief in the same call that proposes one; any other is
 * refused at its path, named, and said why -- it never had a done proposal, or
 * had one only under a plan `project.amend_plan` replaced (`earlier`) -- as is
 * a set of briefs whose predecessors make a circle.
 * The dispatcher still decides what runs at once; this only makes sure it is
 * never handed a brief before the one it waits on.
 */
export function automationStudioProjectSupervisorDispatchOrder(briefs: readonly AutomationStudioProjectSubflowBrief[], done: ReadonlySet<string>, earlier: ReadonlySet<string> = new Set()):
  | { ok: true; ordered: AutomationStudioProjectSubflowBrief[] }
  | { ok: false; code: "predecessor_not_done"; issues: AutomationStudioProjectSupervisorPredecessorIssue[] }
  | { ok: false; code: "cycle"; issues: AutomationStudioProjectSupervisorInputIssue[] } {
  const issues: AutomationStudioProjectSupervisorPredecessorIssue[] = [];
  const waitsOn = briefs.map((brief, index) => {
    const on = new Set<number>();
    brief.entry.predecessors.forEach((predecessor, at) => {
      const sent = briefs.flatMap((other, otherIndex) => (otherIndex !== index && other.subflowKey === predecessor && PROPOSING.has(other.kind) ? [otherIndex] : []));
      for (const otherIndex of sent) on.add(otherIndex);
      if (!sent.length && !done.has(predecessor)) issues.push({ code: "project.predecessor_not_done", path: `briefs.${index}.entry.predecessors.${at}`, predecessor, why: whyNotDone(predecessor, briefs, earlier) });
    });
    return on;
  });
  if (issues.length) return { ok: false, code: "predecessor_not_done", issues };
  const ordered: AutomationStudioProjectSubflowBrief[] = [];
  const placed = new Set<number>();
  while (placed.size < briefs.length) {
    const next = briefs.findIndex((_brief, index) => !placed.has(index) && [...waitsOn[index]!].every((other) => placed.has(other)));
    if (next < 0) {
      const circle = briefs.flatMap((_brief, index) => (placed.has(index) ? [] : [{ code: "project.dispatch_cycle", path: `briefs.${index}.entry.predecessors` }]));
      return { ok: false, code: "cycle", issues: circle };
    }
    placed.add(next);
    ordered.push(briefs[next]!);
  }
  return { ok: true, ordered };
}

/** Why a predecessor does not count, and what to send instead. */
function whyNotDone(predecessor: string, briefs: readonly AutomationStudioProjectSubflowBrief[], earlier: ReadonlySet<string>): string {
  const send = `Send a build or repair brief for "${predecessor}" before this one, or in this same call.`;
  if (earlier.has(predecessor)) return `"${predecessor}" had a done proposal only under an earlier plan: proposals made before project.amend_plan no longer count. ${send}`;
  if (briefs.some((brief) => brief.subflowKey === predecessor)) return `"${predecessor}" has no done proposal under this plan, and its brief in this call is a reset, which proposes nothing. ${send}`;
  return `"${predecessor}" has no done proposal under this plan, and no brief in this call builds it. ${send}`;
}
