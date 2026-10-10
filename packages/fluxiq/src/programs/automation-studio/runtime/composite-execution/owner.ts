import type { JsonValue } from "../../../../core/index.ts";
import { getCallFlowConfiguration, validateFlowComposition, type AutomationStudioFlowArtifact, type AutomationStudioPublishedFlowSnapshot } from "../../model/index.ts";
import { runAutomationStudioGraph, type AutomationStudioGraphExecutionOptions, type AutomationStudioGraphExecutionTrace } from "../executor.ts";
import { automationStudioChildInvocation, automationStudioRootInvocation, type AutomationStudioSubflowGraphRunner } from "../executor/frames/index.ts";
import { compileAutomationStudioRegions } from "../region-compiler.ts";
import { automationStudioCallAcrossBoundary } from "./boundary.ts";
import { runAutomationStudioChildWithBounds } from "./child-bounds.ts";

/**
 * Executes only immutable, version-pinned published snapshots.
 *
 * The trace this returns, and the child trace each Call Flow attempt keeps, are
 * the saved traces `runAutomationStudioGraph` withholds. Execution reads real
 * values: a Call Flow parent builds its outputs from the trace its child
 * executed. `onExecutedTrace` hands a caller that goes on executing the root
 * trace as executed, beside the saved trace returned, as
 * `runAutomationStudioGraph`'s does; it is called once the root run returns, and
 * not when the Flow's composition or regions are invalid.
 */
export class AutomationStudioCanonicalExecution {
  private static readonly registered = new WeakSet<object>();
  static isRegistered(callback: object): boolean { return this.registered.has(callback); }
  static async run(flow: AutomationStudioFlowArtifact, snapshots: AutomationStudioPublishedFlowSnapshot[], options: AutomationStudioGraphExecutionOptions = {}, deprecatedPublicationIds: Iterable<string> = [], onExecutedTrace?: (executed: AutomationStudioGraphExecutionTrace, saved: AutomationStudioGraphExecutionTrace) => void): Promise<AutomationStudioGraphExecutionTrace> {
  await options.commandRun?.checkpoint();
  const boundDomains = new Set(options.authorizedDomainIds ?? []);
  const authorizedDomainIds = (flow.executionDefaults?.authorizedDomainIds ?? []).filter((domainId) => boundDomains.has(domainId));
  const composition = validateFlowComposition({ flow, publishedSnapshots: snapshots, deprecatedPublicationIds, authorizedDomainIds, ...(options.runtimeCapabilities ? { runtimeCapabilities: options.runtimeCapabilities } : {}) });
  if (!composition.ok) return { status: "failed", startedAt: Date.now(), finishedAt: Date.now(), attempts: [], values: {}, effects: [], message: `Invalid Flow composition: ${composition.issues.map((issue) => issue.code).join(", ")}` };
  const compiledRegions = compileAutomationStudioRegions(flow);
  if (!compiledRegions.ok) return { status: "failed", startedAt: Date.now(), finishedAt: Date.now(), attempts: [], values: {}, effects: [], message: `Invalid Flow regions: ${compiledRegions.issues.map((issue) => issue.code).join(", ")}` };
  const byId = new Map(snapshots.map((snapshot) => [`${snapshot.flowId}@${snapshot.version}`, snapshot]));
  // The trace each graph run executed, by the saved trace it returned. A trace
  // no graph run returned -- a deadline, a cancellation, a cycle -- has no entry
  // and is read as it is.
  const executedTraces = new WeakMap<AutomationStudioGraphExecutionTrace, AutomationStudioGraphExecutionTrace>();
  const executedTrace = (saved: AutomationStudioGraphExecutionTrace) => executedTraces.get(saved) ?? saved;
  const runSnapshot = async (snapshot: AutomationStudioPublishedFlowSnapshot, inputs: Record<string, JsonValue>, stack: string[], executionOptions: AutomationStudioGraphExecutionOptions): Promise<AutomationStudioGraphExecutionTrace> => {
    const key = `${snapshot.flowId}@${snapshot.version}`;
    if (stack.includes(key)) return { status: "failed", startedAt: Date.now(), finishedAt: Date.now(), attempts: [], values: {}, effects: [], message: `Composite Flow cycle detected at ${key}.` };
    return runDocument(snapshot, inputs, [...stack, key], executionOptions);
  };
  const runDocument = async (document: Pick<AutomationStudioFlowArtifact, "flowId" | "name" | "nodes" | "edges"> & { regions?: AutomationStudioFlowArtifact["regions"]; regionHandoffs?: AutomationStudioFlowArtifact["regionHandoffs"] }, inputs: Record<string, JsonValue>, stack: string[], executionOptions: AutomationStudioGraphExecutionOptions) => {
    await executionOptions.commandRun?.checkpoint();
    const compiled = compileAutomationStudioRegions(document as AutomationStudioFlowArtifact);
    if (!compiled.ok) return { status: "failed", startedAt: Date.now(), finishedAt: Date.now(), attempts: [], values: {}, effects: [], message: `Invalid Flow regions: ${compiled.issues.map((issue) => issue.code).join(", ")}` } satisfies AutomationStudioGraphExecutionTrace;
    const compositeExecutor: NonNullable<AutomationStudioGraphExecutionOptions["compositeExecutor"]> = async ({ node, inputs: callInputs, options: parentOptions }) => {
      const call = getCallFlowConfiguration(node);
      if (!call) return undefined;
      const snapshot = byId.get(`${call.target.flowId}@${call.target.version}`);
      if (!snapshot) return { result: { status: "failed", route: "failed", effects: [] } };
      const { target: _target, ...bindings } = call;
      const crossed = await automationStudioCallAcrossBoundary({
        contract: snapshot,
        bindings,
        callInputs,
        parentOptions,
        maxAttempts: Math.max(1, Number((node.parameterValues?.retry as { maxAttempts?: unknown } | undefined)?.maxAttempts ?? 1)),
        // A Call Flow child is a frame of the run too, of no Subflow (C1).
        frame: (childInputs) => automationStudioChildInvocation(parentOptions.invocation, { callNodeId: node.id, subflowId: null, graph: snapshot, graphRevision: null, inputs: childInputs }),
        runChild: (childOptions) => runSnapshot(snapshot, childOptions.inputs ?? {}, stack, childOptions),
        executedTrace,
        failedMessage: `Child Flow ${snapshot.flowId}@${snapshot.version} failed.`
      });
      return { ...crossed, compositeTarget: { flowId: snapshot.flowId, version: snapshot.version, flowDigest: snapshot.flowDigest } };
    };
    this.registered.add(compositeExecutor);
    return runAutomationStudioGraph({ schemaVersion: "0.1", flowId: document.flowId, ownerKind: "routine", ownerId: document.flowId, name: document.name, nodes: document.nodes, edges: document.edges, createdAt: 0, updatedAt: 0 }, {
    ...executionOptions,
    inputs,
    compositeExecutor,
    regionRuntime: compiled.plan
  }, (executed, saved) => { executedTraces.set(saved, executed); });
  };
  // A Subflow a Call Subflow node calls runs as the root's graphs do: its own
  // regions compiled, its own Call Flow nodes run against the same snapshots.
  // The trace it executed is read back as a Call Flow child's is.
  const runSubflow: AutomationStudioSubflowGraphRunner = async (target, childOptions, onExecuted) => {
    const saved = await runDocument(target.artifact ?? target.graph, childOptions.inputs ?? {}, [`${target.graph.flowId}@subflow`], childOptions);
    onExecuted(executedTrace(saved), saved);
    return saved;
  };
  this.registered.add(runSubflow);
  const startedAt = options.now?.() ?? Date.now();
  const ownDeadline = flow.executionDefaults?.timeoutMs ? startedAt + flow.executionDefaults.timeoutMs : undefined;
  const deadlineAt = Math.min(options.deadlineAt ?? Number.POSITIVE_INFINITY, ownDeadline ?? Number.POSITIVE_INFINITY);
  // The run's root frame and the holder its frames share, unless a caller framed it already (C1).
  const invocation = options.invocation ?? automationStudioRootInvocation(flow, options, runSubflow);
  const rootOptions: AutomationStudioGraphExecutionOptions = { ...options, invocation, ...(Number.isFinite(deadlineAt) ? { deadlineAt } : {}) };
  const trace = await runAutomationStudioChildWithBounds((signal) => runDocument(flow, options.inputs ?? {}, [`${flow.flowId}@draft`], { ...rootOptions, signal }), Number.isFinite(deadlineAt) ? deadlineAt : undefined, options.signal, options.now, options.commandRun);
  await options.commandRun?.checkpoint();
  onExecutedTrace?.(executedTrace(trace), trace);
  return trace;
}

}
