// Running a Flow, seeing what a run did, and the grants a run spends.
//
// The inspections are here rather than in a reading of their own because
// "why did it fail" is asked in the same breath as "run it", and a person
// switching between the two should not be switching vocabularies.

import { flowModelFromDetail } from "../../../authoring";
import { RUNTIME_ACTION_PAGE_SIZE, RUNTIME_RUN_PAGE_SIZE, cancelRuntimeSession, executeRuntimeSession, exportRuntimeRunAudit, getRuntimeRunDetail, issueLlmExecutionGrant, listRuntimeRunActions, listRuntimeRuns, preflightLlmExecution, startRuntimeSession } from "../../../runtime";
import { loadFlowSettingsDetail } from "../../../settings";
import { automationStudioViewId } from "../../../views";
import { definePanelCapability, panelCapabilityResult, type PanelCapability, type PanelCapabilityArgument, type PanelCapabilityContext } from "../contract";
import { PROJECT, FLOW, RUN } from "./argument";
import { str } from "./value";

/** What a model run is for. Left out, Core applies its own default. */
const PURPOSE: PanelCapabilityArgument = { name: "purpose", kind: "text", describe: "What the model run is for, such as `build_and_adapt`.", required: false };

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
    id: "permission.allowModelRun",
    title: "Allow a model run",
    summary: "Issues the grant a build or a repair spends, so the model can do the work you asked for, on the model key chosen in the Flow's settings.",
    group: "Permissions",
    phrases: ["allow the model", "grant it", "give it permission", "let it use the model", "authorise the model"],
    control: { view: automationStudioViewId.flowEditor, label: "Allow model run" },
    endpoints: ["get-flow-metadata-detail", "issue-llm-execution-grant"],
    arguments: [PROJECT, FLOW, PURPOSE],
    consequences: ["create_new"],
    invoke: async (context, args) => {
      const model = await flowModelKey(context.transport, str(args, "projectId"), str(args, "flowId"));
      if (!model.ok) return { status: "failed", summary: "The grant could not be issued.", error: model.error, ...(model.retryable ? { retryable: true } : {}) };
      return panelCapabilityResult(
        await issueLlmExecutionGrant(context.transport, {
          projectId: str(args, "projectId"),
          flowId: str(args, "flowId"),
          ...model.request,
          ...(args.purpose ? { purpose: str(args, "purpose") } : {})
        }),
        "The model may run.",
        "The grant could not be issued."
      );
    }
  }),
  definePanelCapability({
    id: "permission.check",
    title: "Check what a model run needs",
    summary: "Says what a build or a repair would need before you start it, without starting it.",
    group: "Permissions",
    phrases: ["what does it need", "check permissions", "preflight", "is it ready to build"],
    control: { view: automationStudioViewId.flowEditor, label: "Check readiness" },
    endpoints: ["get-flow-metadata-detail", "preflight-llm-execution"],
    arguments: [PROJECT, FLOW, PURPOSE],
    consequences: [],
    invoke: async (context, args) => {
      const model = await flowModelKey(context.transport, str(args, "projectId"), str(args, "flowId"));
      if (!model.ok) return { status: "failed", summary: "The check could not be made.", error: model.error, ...(model.retryable ? { retryable: true } : {}) };
      return panelCapabilityResult(
        await preflightLlmExecution(context.transport, {
          projectId: str(args, "projectId"),
          flowId: str(args, "flowId"),
          ...model.request,
          ...(args.purpose ? { purpose: str(args, "purpose") } : {})
        }),
        "Here is what a model run would need.",
        "The check could not be made."
      );
    }
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

type FlowModelKey =
  | { ok: true; request: { keyId: string; provider?: string; model?: string } }
  | { ok: false; error: string; retryable?: boolean };

/**
 * The model key, provider and model chosen in the Flow's settings.
 *
 * Core's grant service refuses a request with no `keyId` ("An enabled LLM key
 * is required."), and a person asking the chat to "allow the model" never names
 * a key. The panel's own build button takes it from the Flow's
 * `metadata.llmSecretKeyId`, so this reads the same choice rather than asking.
 *
 * It reads the Flow's metadata detail, never `get-flow`: the browser refuses
 * whole-document reads (`data-request-policy.ts`,
 * `AUTOMATION_STUDIO_BROWSER_BLOCKED_LEGACY_ENDPOINTS`), so a `get-flow` here
 * threw in the real chat window before any grant could be issued, and chat
 * build and explore had no way to get one. The detail keeps the choice in
 * `settings.llm` (`flowModelFromDetail`).
 */
async function flowModelKey(transport: PanelCapabilityContext["transport"], projectId: string, flowId: string): Promise<FlowModelKey> {
  const read = await loadFlowSettingsDetail(transport, { projectId, flowId });
  if (!read.ok) return { ok: false, error: read.error ?? "The Flow could not be read.", ...((read as { retryable?: boolean }).retryable ? { retryable: true } : {}) };
  const metadata = flowModelFromDetail(read.payload?.flow).metadata;
  const keyId = typeof metadata.llmSecretKeyId === "string" ? metadata.llmSecretKeyId : "";
  if (!keyId) return { ok: false, error: "This Flow has no model key chosen. Choose one in the Flow's settings first." };
  return {
    ok: true,
    request: {
      keyId,
      ...(typeof metadata.llmProvider === "string" && metadata.llmProvider ? { provider: metadata.llmProvider } : {}),
      ...(typeof metadata.llmModel === "string" && metadata.llmModel ? { model: metadata.llmModel } : {})
    }
  };
}
