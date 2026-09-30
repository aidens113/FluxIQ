// Running a Flow, seeing what a run did, and the trust a paired browser holds.
//
// The inspections are here rather than in a reading of their own because
// "why did it fail" is asked in the same breath as "run it", and a person
// switching between the two should not be switching vocabularies.

import { RUNTIME_ACTION_PAGE_SIZE, RUNTIME_RUN_PAGE_SIZE, cancelRuntimeSession, executeRuntimeSession, exportRuntimeRunAudit, getRuntimeRunControl, getRuntimeRunDetail, listRuntimeRunActions, listRuntimeRuns, pauseRuntimeSession, resumeRuntimeSession, startRuntimeSession, type RuntimeRunControlAnswer } from "../../../runtime";
import { automationStudioViewId } from "../../../views";
import { definePanelCapability, panelCapabilityResult, type PanelCapability, type PanelCapabilityArgument, type PanelCapabilityOutcome } from "../contract";
import { PROJECT, FLOW, RUN } from "./argument";
import { str } from "./value";

/** Why a person is holding the run, kept on the run's record. */
const REASON: PanelCapabilityArgument = { name: "reason", kind: "text", describe: "Why the run is being held, in a few words.", required: false };

export const RUNNING_CAPABILITIES: readonly PanelCapability[] = [
  definePanelCapability({
    id: "run.start",
    title: "Get a run ready",
    summary: "Opens a run for the Flow without running it, so it can be given its inputs first. To run a Flow now, use run.execute.",
    group: "Running",
    phrases: ["prepare a run", "set up a run", "get ready to run"],
    control: { view: automationStudioViewId.runtime, label: "New run" },
    endpoints: ["start-runtime-session"],
    arguments: [PROJECT, FLOW],
    consequences: ["create_new"],
    invoke: async (context, args) => panelCapabilityResult(
      await startRuntimeSession(context.transport, { projectId: str(args, "projectId"), flowId: str(args, "flowId") }),
      "The run is ready.",
      "The run could not be opened."
    )
  }),
  definePanelCapability({
    id: "run.execute",
    title: "Run a Flow",
    summary: "Runs the Flow for real and reports what came back.",
    group: "Running",
    phrases: ["run it", "run the flow", "go", "start it", "execute the flow", "try it"],
    control: { view: automationStudioViewId.runtime, label: "Run" },
    endpoints: ["run-runtime-session"],
    arguments: [PROJECT, FLOW, { name: "runId", kind: "id", describe: "An already-opened run, if there is one.", required: false, fromContext: "runId" }],
    consequences: ["create_new"],
    invoke: async (context, args) => panelCapabilityResult(
      await executeRuntimeSession(context.transport, {
        projectId: str(args, "projectId"),
        flowId: str(args, "flowId"),
        ...(args.runId ? { runId: str(args, "runId") } : {})
      }),
      "Ran the Flow.",
      "The Flow could not be run."
    )
  }),
  definePanelCapability({
    id: "run.cancel",
    title: "Stop a run",
    summary: "Stops a run that is still going.",
    group: "Running",
    phrases: ["stop it", "cancel the run", "abort", "halt the run"],
    control: { view: automationStudioViewId.runtime, label: "Cancel" },
    endpoints: ["cancel-runtime-session"],
    arguments: [PROJECT, RUN],
    consequences: ["modify_existing"],
    invoke: async (context, args) => panelCapabilityResult(
      await cancelRuntimeSession(context.transport, { projectId: str(args, "projectId"), runId: str(args, "runId") }),
      "Stopped the run.",
      "The run could not be stopped."
    )
  }),
  definePanelCapability({
    id: "run.pause",
    title: "Pause a run",
    summary: "Holds a run that is going between two steps, never in the middle of one. It keeps everything it has done and goes on from the same step when resumed.",
    group: "Running",
    phrases: ["pause it", "pause the run", "hold on", "wait a moment", "hang on"],
    control: { view: automationStudioViewId.runtime, label: "Pause" },
    endpoints: ["pause-runtime-session"],
    arguments: [PROJECT, RUN, REASON],
    consequences: ["modify_existing"],
    invoke: async (context, args) => runControlOutcome(
      await pauseRuntimeSession(context.transport, { projectId: str(args, "projectId"), runId: str(args, "runId"), ...(args.reason ? { reason: str(args, "reason") } : {}) }),
      "The run will pause before its next step.",
      "The run could not be paused."
    )
  }),
  definePanelCapability({
    id: "run.takeControl",
    title: "Take control of the page",
    summary: "Pauses the run between steps and hands the page to you, so you can sign in, solve a check or fix something by hand. FluxIQ touches nothing until you continue.",
    group: "Running",
    phrases: ["take control", "let me do it", "i will do this part", "hand it to me", "let me take over"],
    control: { view: automationStudioViewId.runtime, label: "Take control" },
    endpoints: ["pause-runtime-session"],
    arguments: [PROJECT, RUN, REASON],
    consequences: ["modify_existing"],
    invoke: async (context, args) => runControlOutcome(
      await pauseRuntimeSession(context.transport, { projectId: str(args, "projectId"), runId: str(args, "runId"), takeControl: true, ...(args.reason ? { reason: str(args, "reason") } : {}) }),
      "You have the page. The run is held before its next step until you continue.",
      "Control could not be handed over."
    )
  }),
  definePanelCapability({
    id: "run.resume",
    title: "Resume a run",
    summary: "Lets a paused run go on from the step it held before, or hands the page back to FluxIQ after you acted on it.",
    group: "Running",
    phrases: ["resume", "continue", "carry on", "keep going", "i am done", "give it back", "return control"],
    control: { view: automationStudioViewId.runtime, label: "Resume" },
    endpoints: ["resume-runtime-session"],
    arguments: [PROJECT, RUN, { name: "afterManualAction", kind: "boolean", describe: "True when you did something on the page while the run was held.", required: false }],
    consequences: ["modify_existing"],
    invoke: async (context, args) => runControlOutcome(
      await resumeRuntimeSession(context.transport, { projectId: str(args, "projectId"), runId: str(args, "runId"), afterManualAction: args.afterManualAction === true }),
      "The run is going on from where it paused.",
      "The run could not be resumed."
    )
  }),
  definePanelCapability({
    id: "run.progress",
    title: "Check on a run",
    summary: "Says what a run is doing right now: running, paused, adapting, waiting for you, or how it ended.",
    group: "Running",
    phrases: ["is it still running", "how is it going", "what is it doing", "is it paused", "run status"],
    control: { view: automationStudioViewId.runtime, label: "Run controls" },
    endpoints: ["get-runtime-run-control"],
    arguments: [PROJECT, RUN],
    consequences: [],
    invoke: async (context, args) => runControlOutcome(
      await getRuntimeRunControl(context.transport, { projectId: str(args, "projectId"), runId: str(args, "runId") }),
      "Here is where the run stands.",
      "The run could not be read.",
      true
    )
  }),
  definePanelCapability({
    id: "run.list",
    title: "List recent runs",
    summary: "Shows recent runs, newest first, with how each one ended.",
    group: "Running",
    phrases: ["what has run", "recent runs", "run history", "list the runs", "show me the runs"],
    control: { view: automationStudioViewId.runtime, label: "Run history" },
    endpoints: ["list-flow-runs"],
    arguments: [PROJECT, { name: "flowId", kind: "id", describe: "Narrow it to one Flow.", required: false, fromContext: "flowId" }],
    consequences: [],
    invoke: async (context, args) => panelCapabilityResult(
      await listRuntimeRuns(context.transport, {
        projectId: str(args, "projectId"),
        limit: RUNTIME_RUN_PAGE_SIZE,
        ...(args.flowId ? { flowId: str(args, "flowId") } : {})
      }),
      "Here are the recent runs.",
      "The runs could not be read."
    )
  }),
  definePanelCapability({
    id: "run.inspect",
    title: "Inspect a run",
    summary: "Reads one run in full: how it ended, what it produced, and where it went wrong.",
    group: "Running",
    phrases: ["what happened", "inspect the run", "why did it fail", "show me the run", "debug the run"],
    control: { view: automationStudioViewId.runtime, label: "Run detail" },
    endpoints: ["get-flow-run-detail"],
    arguments: [PROJECT, RUN],
    consequences: [],
    invoke: async (context, args) => panelCapabilityResult(
      await getRuntimeRunDetail(context.transport, { projectId: str(args, "projectId"), runId: str(args, "runId"), compact: true }),
      "Here is the run.",
      "The run could not be read."
    )
  }),
  definePanelCapability({
    id: "run.steps",
    title: "Walk through what a run did",
    summary: "Lists a run's steps in order, with what each was given and what it returned.",
    group: "Running",
    phrases: ["step by step", "what did it do", "the actions", "walk me through the run", "which step failed"],
    control: { view: automationStudioViewId.runtime, label: "Actions" },
    endpoints: ["list-flow-run-actions"],
    arguments: [PROJECT, RUN],
    consequences: [],
    invoke: async (context, args) => panelCapabilityResult(
      await listRuntimeRunActions(context.transport, { projectId: str(args, "projectId"), runId: str(args, "runId"), limit: RUNTIME_ACTION_PAGE_SIZE }),
      "Here is what the run did, step by step.",
      "The run's steps could not be read."
    )
  }),
  definePanelCapability({
    id: "run.audit",
    title: "Export a run's audit",
    summary: "Produces the full record of a run, for keeping or sending on.",
    group: "Running",
    phrases: ["export the run", "download the audit", "get the record", "audit trail"],
    control: { view: automationStudioViewId.runtime, label: "Export audit" },
    endpoints: ["export-flow-run-audit"],
    arguments: [PROJECT, RUN],
    consequences: [],
    invoke: async (context, args) => panelCapabilityResult(
      await exportRuntimeRunAudit(context.transport, { projectId: str(args, "projectId"), runId: str(args, "runId") }),
      "Here is the run's audit.",
      "The audit could not be exported."
    )
  }),
  definePanelCapability({
    id: "permission.revokeClient",
    title: "Revoke a paired browser's trust",
    summary: "Takes a paired browser off the trusted list so it can no longer act.",
    group: "Permissions",
    phrases: ["revoke", "untrust this browser", "remove the pairing", "disconnect the client"],
    control: { view: automationStudioViewId.clients, label: "Revoke trust" },
    endpoints: ["revoke-client-trust"],
    arguments: [{ name: "trustedClientId", kind: "id", describe: "The paired browser to revoke.", required: true }],
    // Core classes `revoke-client-trust` as authoring, not destructive: the
    // browser can be paired again, so nothing is gone for good and Core asks
    // for no PIN. A PIN sent here was never read.
    consequences: ["modify_existing"],
    invoke: async (context, args) => panelCapabilityResult(
      await context.transport.post("revoke-client-trust", { trustedClientId: str(args, "trustedClientId") }),
      "Revoked the browser's trust.",
      "The trust could not be revoked."
    )
  })
];

/**
 * A run-control answer in words that match what happened. Pausing or resuming
 * a run that is not executing is not a failure -- Core answers it with the run
 * as it stands -- but saying "paused" about it would be untrue.
 */
function runControlOutcome(
  response: { ok: boolean; payload?: RuntimeRunControlAnswer; error?: string; retryable?: boolean },
  done: string,
  failed: string,
  reading = false
): PanelCapabilityOutcome {
  if (!response.ok || !response.payload) return panelCapabilityResult(response, done, failed);
  const answer = response.payload;
  const progress = answer.progress ? `${answer.progress.label}${answer.progress.detail ? `: ${answer.progress.detail}` : "."}` : "No such run.";
  if (reading) return { status: "done", summary: `${done} ${progress}`, payload: answer };
  if (!answer.live) return { status: "done", summary: `That run is not executing right now, so nothing changed. ${progress}`, payload: answer };
  return { status: "done", summary: done, payload: answer };
}
