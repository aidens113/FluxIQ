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
// and, the first time, the page is checked (`recheck`). The first no stops the run: the
// step is not dispatched, and every later ask stops as well, so nothing retries past it.
//
// A person's own pause holds first, and says so; a hold this gate makes for itself
// is said nowhere, since no person holds the run.
import type { AutomationStudioFlowNode } from "../../../../../flows/executable/graph/index.ts";
import type { AutomationStudioActionPermissionCheck } from "../../../../../runtime/action-permission-requests/index.ts";
import type { AutomationStudioRunCheckpointOutcome, AutomationStudioRunControlGate } from "../../../../../runtime/automation-host/index.ts";
import type { ProjectPartRecheckStop } from "./recheck.ts";
import type { ProjectPartStepClasses } from "./step-classes.ts";

/** Why the gate stopped a run, in a closed word. */
export type ProjectPartGateStopReason = ProjectPartRecheckStop | "not_allowed" | "unknown_step";
export type ProjectPartGateStop = { node: AutomationStudioFlowNode | undefined; reason: ProjectPartGateStopReason };

const GO: AutomationStudioRunCheckpointOutcome = { outcome: "resume", afterManualAction: false };
const STOP: AutomationStudioRunCheckpointOutcome = { outcome: "stop", message: "This part stopped before its next step, and that step was not done." };

export type ProjectPartStepGate = AutomationStudioRunControlGate & { stopped(): ProjectPartGateStop | undefined };

export function projectPartStepGate(input: {
  person: AutomationStudioRunControlGate;
  nodeOf(nodeId: string): AutomationStudioFlowNode | undefined;
  classesOf(node: AutomationStudioFlowNode): ProjectPartStepClasses;
  permitted: ReadonlySet<string>;
  permission(node: AutomationStudioFlowNode, classes: ProjectPartStepClasses): ReturnType<AutomationStudioActionPermissionCheck>;
  recheck(node: AutomationStudioFlowNode): Promise<ProjectPartRecheckStop | undefined>;
}): ProjectPartStepGate {
  let stop: ProjectPartGateStop | undefined;
  let rechecked = false;
  let ownHold = false;
  const stopping = (node: AutomationStudioFlowNode | undefined, reason: ProjectPartGateStopReason): AutomationStudioRunCheckpointOutcome => {
    stop ??= { node, reason };
    return STOP;
  };
  const decide = async (node: AutomationStudioFlowNode, classes: ProjectPartStepClasses): Promise<AutomationStudioRunCheckpointOutcome> => {
    if (classes.classes.some((each) => !input.permitted.has(each))) return stopping(node, "not_allowed");
    if (!(await input.permission(node, classes)).permitted) return stopping(node, "not_allowed");
    if (!rechecked) {
      const stopped = await input.recheck(node);
      if (stopped) return stopping(node, stopped);
      rechecked = true;
    }
    return GO;
  };
  return {
    stopped: () => stop,
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
        return await decide(node, classes);
      })();
    }
  };
}
