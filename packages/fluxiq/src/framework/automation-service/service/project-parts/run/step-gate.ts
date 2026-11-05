// What every step of a part run passes before it runs.
//
// **Where a run holds, not a node it runs through.** The executor asks a run's gate once
// per step, before it dispatches anything, in every frame of the run: a step the part
// calls is asked exactly as a step of its own (`engine/automation/graph-run.ts`,
// `options.runControl`). So the re-check is a stop point at the step boundary, and the
// run goes on from the same place with everything it computed. An inserted check node
// would have been passed by the routes a run really takes: a state route or an `on
// failed` route can reach a lasting step by an edge the check node is not on, while no
// route reaches a step without this asking. It also needs no node a model could be
// offered, and no graph copy that differs from what was saved.
//
// **In order, for a lasting step:** the classes it names are ones that were asked for;
// the same permission check `core.run_node` passes a domain answers it (`permission`);
// and the page is checked (`recheck`): the first time for a step with no list row, and
// for a step bound to a row before every ask, since each row is its own lasting act and a
// page shifts as acts land. The row is found again first, by what it is, from the step that
// read it (`at.recheckRow`). The first no stops the run: the step is not dispatched, and
// every later ask stops as well, so nothing retries past it.
//
// **A row found gone stops the run, and the rows after it are not done.** That is where the
// engine's own gone path ends a lasting step with no way on written for it: `executor.target.gone`
// is not retried, and a lasting act that failed is not walked past (`defensive/continuation.ts`).
// A gate cannot take a written `on failed:` route, so one is not taken here: the run stops
// and says so, which is the side a mistake should fall on.
//
// **In a task's attempt the act record may stop the run too** (`stopFor`, asked at the door a
// step's resolved values reach, `./settled-calls.ts`): its stop holds here, like any other, so
// no later step and no written `on failed:` route goes past it.
//
// A person's own pause holds first, and says so; a hold this gate makes for itself
// is said nowhere, since no person holds the run.
import type { AutomationStudioFlowNode } from "../../../../../flows/executable/graph/index.ts";
import type { AutomationStudioActionPermissionCheck } from "../../../../../runtime/action-permission-requests/index.ts";
import type { AutomationStudioRunCheckpoint, AutomationStudioRunCheckpointOutcome, AutomationStudioRunCheckpointRow, AutomationStudioRunControlGate } from "../../../../../runtime/automation-host/index.ts";
import type { ProjectPartRecheckStop } from "./recheck.ts";
import type { ProjectPartStepClasses } from "./step-classes.ts";

/** Why the gate stopped a run, in a closed word. */
export type ProjectPartGateStopReason = ProjectPartRecheckStop | "not_allowed" | "unknown_step" | "row_gone" | "row_unclear" | "row_unread" | "row_not_handed" | "act_done" | "act_may_have_landed";
export type ProjectPartGateStop = { node: AutomationStudioFlowNode | undefined; reason: ProjectPartGateStopReason };

const GO: AutomationStudioRunCheckpointOutcome = { outcome: "resume", afterManualAction: false };
const STOP: AutomationStudioRunCheckpointOutcome = { outcome: "stop", message: "This part stopped before its next step, and that step was not done." };

export type ProjectPartStepGate = AutomationStudioRunControlGate & { stopped(): ProjectPartGateStop | undefined; stopFor(node: AutomationStudioFlowNode, reason: ProjectPartGateStopReason): void };

export function projectPartStepGate(input: {
  person: AutomationStudioRunControlGate;
  nodeOf(nodeId: string): AutomationStudioFlowNode | undefined;
  classesOf(node: AutomationStudioFlowNode): ProjectPartStepClasses;
  permitted: ReadonlySet<string>;
  permission(node: AutomationStudioFlowNode, classes: ProjectPartStepClasses): ReturnType<AutomationStudioActionPermissionCheck>;
  /** The look at the page; `row` is the row found again, for a step bound to one. */
  recheck(node: AutomationStudioFlowNode, row?: Extract<AutomationStudioRunCheckpointRow, { outcome: "found" }>): Promise<ProjectPartRecheckStop | undefined>;
}): ProjectPartStepGate {
  let stop: ProjectPartGateStop | undefined;
  let rechecked = false;
  let ownHold = false;
  const stopping = (node: AutomationStudioFlowNode | undefined, reason: ProjectPartGateStopReason): AutomationStudioRunCheckpointOutcome => {
    stop ??= { node, reason };
    return STOP;
  };
  const decide = async (node: AutomationStudioFlowNode, classes: ProjectPartStepClasses, at: AutomationStudioRunCheckpoint): Promise<AutomationStudioRunCheckpointOutcome> => {
    if (classes.classes.some((each) => !input.permitted.has(each))) return stopping(node, "not_allowed");
    if (!(await input.permission(node, classes)).permitted) return stopping(node, "not_allowed");
    const row: AutomationStudioRunCheckpointRow = (await at.recheckRow?.()) ?? { outcome: "no_row" };
    if (row.outcome === "done") return GO;
    if (row.outcome === "gone") return stopping(node, "row_gone");
    if (row.outcome === "unmatched") return stopping(node, "row_unclear");
    if (row.outcome === "unavailable") return stopping(node, row.reason === "row_not_handed" ? "row_not_handed" : "row_unread");
    if (row.outcome === "found") {
      const stopped = await input.recheck(node, row);
      return stopped ? stopping(node, stopped) : GO;
    }
    if (!rechecked) {
      const stopped = await input.recheck(node);
      if (stopped) return stopping(node, stopped);
      rechecked = true;
    }
    return GO;
  };
  return {
    stopped: () => stop,
    stopFor: (node, reason) => {
      stopping(node, reason);
    },
    heldBy: () => input.person.heldBy?.() ?? null,
    heldQuietly: () => ownHold,
    checkpoint(at) {
      if (stop) return Promise.resolve(STOP);
      const held = input.person.checkpoint(at);
      const node = input.nodeOf(at.nodeId);
      const classes = node ? input.classesOf(node) : undefined;
      ownHold = !held;
      if (!node) return (async () => {
        if (held && (await held).outcome === "stop") return held;
        return stopping(undefined, "unknown_step");
      })();
      if (!classes?.lasting) return held;
      return (async () => {
        if (held) {
          const released = await held;
          if (released.outcome === "stop") return released;
        }
        return await decide(node, classes, at);
      })();
    }
  };
}
