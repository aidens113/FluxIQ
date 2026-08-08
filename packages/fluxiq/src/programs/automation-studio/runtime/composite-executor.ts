import type { JsonValue } from "../../../core/index.ts";
import { getCallFlowConfiguration, validateFlowComposition, type AutomationStudioFlowArtifact, type AutomationStudioPublishedFlowSnapshot } from "../model/index.ts";
import { runAutomationStudioGraph, type AutomationStudioGraphExecutionOptions, type AutomationStudioGraphExecutionTrace } from "./executor.ts";
import { compileAutomationStudioRegions } from "./region-compiler.ts";

/** Executes only immutable, version-pinned published snapshots. */
export async function runCanonicalAutomationStudioFlow(flow: AutomationStudioFlowArtifact, snapshots: AutomationStudioPublishedFlowSnapshot[], options: AutomationStudioGraphExecutionOptions = {}, deprecatedPublicationIds: Iterable<string> = []): Promise<AutomationStudioGraphExecutionTrace> {
  const boundDomains = new Set(options.authorizedDomainIds ?? []);
  const authorizedDomainIds = (flow.executionDefaults?.authorizedDomainIds ?? []).filter((domainId) => boundDomains.has(domainId));
  const composition = validateFlowComposition({ flow, publishedSnapshots: snapshots, deprecatedPublicationIds, authorizedDomainIds, ...(options.runtimeCapabilities ? { runtimeCapabilities: options.runtimeCapabilities } : {}) });
  if (!composition.ok) return { status: "failed", startedAt: Date.now(), finishedAt: Date.now(), attempts: [], values: {}, effects: [], message: `Invalid Flow composition: ${composition.issues.map((issue) => issue.code).join(", ")}` };
  const compiledRegions = compileAutomationStudioRegions(flow);
  if (!compiledRegions.ok) return { status: "failed", startedAt: Date.now(), finishedAt: Date.now(), attempts: [], values: {}, effects: [], message: `Invalid Flow regions: ${compiledRegions.issues.map((issue) => issue.code).join(", ")}` };
  const byId = new Map(snapshots.map((snapshot) => [`${snapshot.flowId}@${snapshot.version}`, snapshot]));
  const runSnapshot = async (snapshot: AutomationStudioPublishedFlowSnapshot, inputs: Record<string, JsonValue>, stack: string[], executionOptions: AutomationStudioGraphExecutionOptions): Promise<AutomationStudioGraphExecutionTrace> => {
    const key = `${snapshot.flowId}@${snapshot.version}`;
    if (stack.includes(key)) return { status: "failed", startedAt: Date.now(), finishedAt: Date.now(), attempts: [], values: {}, effects: [], message: `Composite Flow cycle detected at ${key}.` };
    return runDocument(snapshot, inputs, [...stack, key], executionOptions);
  };
  const runDocument = async (document: Pick<AutomationStudioFlowArtifact, "flowId" | "name" | "nodes" | "edges"> & { regions?: AutomationStudioFlowArtifact["regions"]; regionHandoffs?: AutomationStudioFlowArtifact["regionHandoffs"] }, inputs: Record<string, JsonValue>, stack: string[], executionOptions: AutomationStudioGraphExecutionOptions) => {
    const compiled = compileAutomationStudioRegions(document as AutomationStudioFlowArtifact);
    if (!compiled.ok) return { status: "failed", startedAt: Date.now(), finishedAt: Date.now(), attempts: [], values: {}, effects: [], message: `Invalid Flow regions: ${compiled.issues.map((issue) => issue.code).join(", ")}` } satisfies AutomationStudioGraphExecutionTrace;
    return runAutomationStudioGraph({ schemaVersion: "0.1", flowId: document.flowId, ownerKind: "routine", ownerId: document.flowId, name: document.name, nodes: document.nodes, edges: document.edges, createdAt: 0, updatedAt: 0 }, {
    ...executionOptions,
    inputs,
    compositeExecutor: async ({ node, inputs: callInputs, options: parentOptions }) => {
      const call = getCallFlowConfiguration(node);
      if (!call) return undefined;
      const snapshot = byId.get(`${call.target.flowId}@${call.target.version}`);
      if (!snapshot) return { result: { status: "failed", route: "failed", effects: [] } };
      // A composite is a real typed boundary: no ambient parent values cross it.
      const childInputs: Record<string, JsonValue> = {};
      for (const port of snapshot.interface.inputs) if (port.defaultValue !== undefined) childInputs[port.id] = port.defaultValue;
      for (const binding of call.inputBindings ?? []) {
        const value = callInputs[binding.valueKey];
        if (value !== undefined) childInputs[binding.targetPortId] = value;
      }
      const now = parentOptions.now?.() ?? Date.now();
      const ownDeadline = snapshot.executionDefaults?.timeoutMs ? now + snapshot.executionDefaults.timeoutMs : undefined;
      const deadlineAt = Math.min(parentOptions.deadlineAt ?? Number.POSITIVE_INFINITY, ownDeadline ?? Number.POSITIVE_INFINITY);
      const boundedDeadline = Number.isFinite(deadlineAt) ? deadlineAt : undefined;
      const childOptions: AutomationStudioGraphExecutionOptions = { ...parentOptions, ...(boundedDeadline !== undefined ? { deadlineAt: boundedDeadline } : {}) };
      const maxAttempts = Math.max(1, Number((node.parameterValues?.retry as { maxAttempts?: unknown } | undefined)?.maxAttempts ?? 1));
      let childTrace: AutomationStudioGraphExecutionTrace = { status: "failed", startedAt: now, finishedAt: now, attempts: [], values: {}, effects: [], message: "Child Flow did not execute." };
      for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
        childTrace = await runChildWithBounds((signal) => runSnapshot(snapshot, childInputs, stack, { ...childOptions, signal }), boundedDeadline, parentOptions.signal, parentOptions.now);
        if (childTrace.status === "succeeded" || childTrace.status === "waiting" || childTrace.status === "cancelled") break;
      }
      const outputs: Record<string, JsonValue> = {};
      for (const port of snapshot.interface.outputs) outputs[port.id] = childTrace.values[port.id] ?? null;
      for (const binding of call.outputBindings ?? []) outputs[binding.valueKey] = childTrace.values[binding.targetPortId] ?? null;
      const errorBinding = childTrace.status === "failed" ? call.errorBindings?.find((binding) => snapshot.errors.some((error) => error.id === binding.targetPortId)) : undefined;
      if (errorBinding) outputs[errorBinding.valueKey] = childTrace.message ?? `Child Flow ${snapshot.flowId}@${snapshot.version} failed.`;
      return { result: { status: childTrace.status === "succeeded" ? "success" : childTrace.status === "waiting" ? "waiting" : "failed", route: childTrace.status === "succeeded" ? "success" : errorBinding ? `error.${errorBinding.targetPortId}` : "failed", outputs }, childTrace, compositeTarget: { flowId: snapshot.flowId, version: snapshot.version, flowDigest: snapshot.flowDigest } };
    },
    regionRuntime: compiled.plan
  });
  };
  const startedAt = options.now?.() ?? Date.now();
  const ownDeadline = flow.executionDefaults?.timeoutMs ? startedAt + flow.executionDefaults.timeoutMs : undefined;
  const deadlineAt = Math.min(options.deadlineAt ?? Number.POSITIVE_INFINITY, ownDeadline ?? Number.POSITIVE_INFINITY);
  const rootOptions: AutomationStudioGraphExecutionOptions = { ...options, ...(Number.isFinite(deadlineAt) ? { deadlineAt } : {}) };
  const trace = await runChildWithBounds((signal) => runDocument(flow, options.inputs ?? {}, [`${flow.flowId}@draft`], { ...rootOptions, signal }), Number.isFinite(deadlineAt) ? deadlineAt : undefined, options.signal, options.now);
  return trace;
}

async function runChildWithBounds(run: (signal: AbortSignal) => Promise<AutomationStudioGraphExecutionTrace>, deadlineAt?: number, signal?: AbortSignal, now: () => number = Date.now): Promise<AutomationStudioGraphExecutionTrace> {
  const startedAt = now();
  if (signal?.aborted) return { status: "cancelled", startedAt, finishedAt: now(), attempts: [], values: {}, effects: [], message: "Run cancelled." };
  const controller = new AbortController();
  let timer: ReturnType<typeof setTimeout> | undefined;
  let abortListener: (() => void) | undefined;
  const bounds: Array<Promise<AutomationStudioGraphExecutionTrace>> = [];
  if (deadlineAt !== undefined) bounds.push(new Promise((resolve) => { timer = setTimeout(() => { controller.abort(new Error("Flow execution deadline exceeded.")); resolve({ status: "failed", startedAt, finishedAt: now(), attempts: [], values: {}, effects: [], message: "Flow execution deadline exceeded." }); }, Math.max(0, deadlineAt - now())); }));
  if (signal) bounds.push(new Promise((resolve) => { abortListener = () => { controller.abort(signal.reason); resolve({ status: "cancelled", startedAt, finishedAt: now(), attempts: [], values: {}, effects: [], message: "Run cancelled." }); }; signal.addEventListener("abort", abortListener, { once: true }); }));
  try { return bounds.length ? await Promise.race([run(controller.signal), ...bounds]) : await run(controller.signal); }
  finally { if (timer) clearTimeout(timer); if (signal && abortListener) signal.removeEventListener("abort", abortListener); }
}
