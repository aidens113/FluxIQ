import type { JsonValue } from "../../../core/index.ts";
import { getCallFlowConfiguration, validateFlowComposition, type ExecutableFlowSnapshot } from "../../../flows/executable/composite/index.ts";
import type { ExecutableGraph } from "../../../flows/executable/graph/index.ts";
import { compileAutomationStudioRegions } from "../../../flows/executable/regions/compilation/index.ts";
import type { AutomationStudioGraphExecutionOptions } from "../contracts/index.ts";
import type { AutomationStudioGraphExecutionTrace } from "../contracts.ts";
import { runAutomationStudioGraph } from "../graph-run.ts";
import { automationStudioChildInvocation, automationStudioRootInvocation, type AutomationStudioSubflowGraphRunner } from "../frames/index.ts";
import { automationStudioCallAcrossBoundary } from "./boundary.ts";
import { runAutomationStudioChildWithBounds } from "./child-bounds.ts";
import type { AutomationStudioCompositeFlow } from "./flow.ts";

import { copyAutomationExecutionOptions } from "../execution-admission/index.ts";
import { AutomationOrchestrationCallbacks, AutomationPureCallbacks, invokeAutomationCallbackSync, registerAutomationExecutionKernel, prepareAutomationFrame, invokeAutomationFrame } from "../execution-admission/kernel/index.ts";

/** Executes pinned snapshots and owns the one private callback-registration set. */
export class AutomationStudioCanonicalExecution {
    private static readonly registered = new WeakSet<object>();
    private static readonly observedKernel = registerAutomationExecutionKernel(this, this.runBody, "children");
    static isRegistered(callback: object): boolean { return this.registered.has(callback); }
    static async run(flow: AutomationStudioCompositeFlow, snapshots: ExecutableFlowSnapshot[], options: AutomationStudioGraphExecutionOptions = {}, deprecatedPublicationIds: Iterable<string> = [], onExecutedTrace?: (executed: AutomationStudioGraphExecutionTrace, saved: AutomationStudioGraphExecutionTrace) => void): Promise<AutomationStudioGraphExecutionTrace> {
        const callback = this.runBody;
        const frame = await prepareAutomationFrame(options, { receiver: this, callback }, this.observedKernel);
        if (!frame) return await callback.call(this, flow, snapshots, options, deprecatedPublicationIds, onExecutedTrace);
        return await invokeAutomationFrame(frame, { receiver: this, callback, args: [flow, snapshots, frame.options, deprecatedPublicationIds, onExecutedTrace] });
    }
    private static async runBody(flow: AutomationStudioCompositeFlow, snapshots: ExecutableFlowSnapshot[], options: AutomationStudioGraphExecutionOptions, deprecatedPublicationIds: Iterable<string>, onExecutedTrace?: (executed: AutomationStudioGraphExecutionTrace, saved: AutomationStudioGraphExecutionTrace) => void): Promise<AutomationStudioGraphExecutionTrace> {
        await options.commandRun?.checkpoint();
        const boundDomains = new Set(options.authorizedDomainIds ?? []);
        const authorizedDomainIds = (flow.executionDefaults?.authorizedDomainIds ?? []).filter((domainId) => boundDomains.has(domainId));
        const composition = validateFlowComposition({ flow, publishedSnapshots: snapshots, deprecatedPublicationIds, authorizedDomainIds, ...(options.runtimeCapabilities ? { runtimeCapabilities: options.runtimeCapabilities } : {}) });
        if (!composition.ok)
            return { status: "failed", startedAt: Date.now(), finishedAt: Date.now(), attempts: [], values: {}, effects: [], message: `Invalid Flow composition: ${composition.issues.map((issue) => issue.code).join(", ")}` };
        const compiledRegions = compileAutomationStudioRegions({
            nodes: flow.nodes,
            edges: flow.edges,
            scope: flow.scope,
            ...(flow.regions !== undefined ? { regions: flow.regions } : {}),
            ...(flow.regionHandoffs !== undefined ? { regionHandoffs: flow.regionHandoffs } : {})
        });
        if (!compiledRegions.ok)
            return { status: "failed", startedAt: Date.now(), finishedAt: Date.now(), attempts: [], values: {}, effects: [], message: `Invalid Flow regions: ${compiledRegions.issues.map((issue) => issue.code).join(", ")}` };
        const byId = new Map(snapshots.map((snapshot) => [`${snapshot.flowId}@${snapshot.version}`, snapshot]));
        // The trace each graph run executed, by the saved trace it returned. A trace
        // no graph run returned -- a deadline, a cancellation, a cycle -- has no entry
        // and is read as it is.
        const executedTraces = new WeakMap<AutomationStudioGraphExecutionTrace, AutomationStudioGraphExecutionTrace>();
        const executedTrace = (saved: AutomationStudioGraphExecutionTrace) => executedTraces.get(saved) ?? saved;
        const runSnapshot = async (snapshot: ExecutableFlowSnapshot, inputs: Record<string, JsonValue>, stack: string[], executionOptions: AutomationStudioGraphExecutionOptions): Promise<AutomationStudioGraphExecutionTrace> => {
            const key = `${snapshot.flowId}@${snapshot.version}`;
            if (stack.includes(key))
                return { status: "failed", startedAt: Date.now(), finishedAt: Date.now(), attempts: [], values: {}, effects: [], message: `Composite Flow cycle detected at ${key}.` };
            return runDocument(snapshot, inputs, [...stack, key], executionOptions);
        };
        const runDocument = async (document: Pick<ExecutableGraph, "flowId" | "nodes" | "edges"> & Partial<Pick<AutomationStudioCompositeFlow, "scope" | "regions" | "regionHandoffs">>, inputs: Record<string, JsonValue>, stack: string[], executionOptions: AutomationStudioGraphExecutionOptions) => {
            await executionOptions.commandRun?.checkpoint();
            const compiled = compileAutomationStudioRegions({
                nodes: document.nodes,
                edges: document.edges,
                ...(document.scope !== undefined ? { scope: document.scope } : {}),
                ...(document.regions !== undefined ? { regions: document.regions } : {}),
                ...(document.regionHandoffs !== undefined ? { regionHandoffs: document.regionHandoffs } : {})
            });
            if (!compiled.ok)
                return { status: "failed", startedAt: Date.now(), finishedAt: Date.now(), attempts: [], values: {}, effects: [], message: `Invalid Flow regions: ${compiled.issues.map((issue) => issue.code).join(", ")}` } satisfies AutomationStudioGraphExecutionTrace;
            const compositeExecutor: NonNullable<AutomationStudioGraphExecutionOptions["compositeExecutor"]> = async ({ node, inputs: callInputs, options: parentOptions }) => {
                const call = getCallFlowConfiguration(node);
                if (!call)
                    return undefined;
                const snapshot = byId.get(`${call.target.flowId}@${call.target.version}`);
                if (!snapshot)
                    return { result: { status: "failed", route: "failed", effects: [] } };
                const { target: _target, ...bindings } = call;
                const crossed = await automationStudioCallAcrossBoundary({
                    contract: {
                        interface: snapshot.interface,
                        errors: snapshot.errors,
                        ...(snapshot.executionDefaults !== undefined ? { executionDefaults: snapshot.executionDefaults } : {})
                    },
                    bindings,
                    callInputs,
                    parentOptions,
                    maxAttempts: Math.max(1, Number((node.parameterValues?.retry as {
                        maxAttempts?: unknown;
                    } | undefined)?.maxAttempts ?? 1)),
                    // A Call Flow child is a frame of the run too, of no Subflow (C1).
                    frame: (childInputs) => automationStudioChildInvocation(parentOptions.invocation, { callNodeId: node.id, subflowId: null, graph: snapshot, graphRevision: null, inputs: childInputs }),
                    runChild: (childOptions) => runSnapshot(snapshot, childOptions.inputs ?? {}, stack, childOptions),
                    executedTrace,
                    failedMessage: `Child Flow ${snapshot.flowId}@${snapshot.version} failed.`
                });
                return { ...crossed, compositeTarget: { flowId: snapshot.flowId, version: snapshot.version, flowDigest: snapshot.flowDigest } };
            };
            this.registered.add(compositeExecutor);
            AutomationOrchestrationCallbacks.register(compositeExecutor);
            // Preserve the execution scope historically used by composite documents.
            const graph: ExecutableGraph = { flowId: document.flowId, ownerId: document.flowId, nodes: document.nodes, edges: document.edges };
            const graphOptions = copyAutomationExecutionOptions(copyAutomationExecutionOptions(executionOptions), { inputs, compositeExecutor, regionRuntime: compiled.plan });
            const capture = (executed: AutomationStudioGraphExecutionTrace, saved: AutomationStudioGraphExecutionTrace) => { executedTraces.set(saved, executed); };
            AutomationPureCallbacks.register(undefined, capture);
            return runAutomationStudioGraph(graph, graphOptions, capture);
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
        AutomationOrchestrationCallbacks.register(runSubflow);
        const startedAt = options.now?.() ?? Date.now();
        const ownDeadline = flow.executionDefaults?.timeoutMs ? startedAt + flow.executionDefaults.timeoutMs : undefined;
        const deadlineAt = Math.min(options.deadlineAt ?? Number.POSITIVE_INFINITY, ownDeadline ?? Number.POSITIVE_INFINITY);
        // The run's root frame and the holder its frames share, unless a caller framed it already (C1).
        const invocation = options.invocation ?? automationStudioRootInvocation(flow, options, runSubflow);
        const rootOptions = copyAutomationExecutionOptions(copyAutomationExecutionOptions(options), { invocation, ...(Number.isFinite(deadlineAt) ? { deadlineAt } : {}) });
        const trace = await runAutomationStudioChildWithBounds((signal) => {
            const bounded = copyAutomationExecutionOptions(rootOptions, { signal });
            return runDocument(flow, options.inputs ?? {}, [`${flow.flowId}@draft`], bounded);
        }, Number.isFinite(deadlineAt) ? deadlineAt : undefined, options.signal, options.now, options.commandRun);
        if (trace.failure?.code !== "run.outcome_uncertain")
            await options.commandRun?.checkpoint();
        if (onExecutedTrace) invokeAutomationCallbackSync(rootOptions, { receiver: undefined, callback: onExecutedTrace, args: [executedTrace(trace), trace] });
        return trace;
    }
}
