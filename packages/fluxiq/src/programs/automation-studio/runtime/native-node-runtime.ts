import type { JsonObject, JsonValue } from "../../../core/index.ts";
import { createAutomationStudioElementMatcher } from "../fingerprinting/index.ts";
import type { AutomationStudioFlowNode, AutomationStudioFlowScope } from "../model/index.ts";
import { AutomationStudioImporterSdkRegistry, combineAutomationStudioResolvedActionEffects, isAutomationNodeParameterStateBinding, resolveAutomationStudioNodeActionEffect, type AutomationStudioComparatorImplementation, type AutomationStudioImporterImplementationBundle, type AutomationStudioImporterSdkManifest, type AutomationStudioNativeLogEntry, type AutomationStudioNativeNodeContext, type AutomationStudioNativeNodeImplementation, type AutomationStudioNodeDefinition, type AutomationStudioNodeRegistryResolution, type AutomationStudioRecordingMapperImplementation, type AutomationStudioResolvedActionEffect, type AutomationStudioTargetResolverImplementation } from "../nodes/index.ts";
import type { AutomationNodeExecutionResult, AutomationNodePort } from "../nodes/contracts.ts";
import { automationStudioReferenceNow } from "./reference-now/index.ts";
import { projectRuntimeTargetActionability } from "../../../runtime/result-control/index.ts";

export type AutomationStudioNativeRuntimeGrants = {
  permissions?: Iterable<string>;
  runtimeCapabilities?: Iterable<string>;
  networkDestinations?: Iterable<string>;
  secretHandles?: Iterable<string>;
  filesystemRoots?: Iterable<string>;
  process?: boolean;
  childProcess?: boolean;
};
/**
 * What one native execution answered. `declaredOutputs` is the bound
 * definition's output ports, given beside a result the implementation produced:
 * the executor checks a route its dispatch answers against them
 * (`executor/node-execution.ts`), and an importer definition lives only here,
 * never in the builtin library the executor otherwise reads.
 */
export type AutomationStudioNativeExecution = { result: AutomationNodeExecutionResult; logs: AutomationStudioNativeLogEntry[]; declaredOutputs?: readonly AutomationNodePort[] };

/**
 * Explicit trusted-local implementation binder. This is an authorization and
 * tracing boundary, not a security sandbox or containment mechanism.
 */
export class AutomationStudioNativeNodeRuntime {
  readonly sdk = new AutomationStudioImporterSdkRegistry();
  private readonly bindings = new Map<string, { manifest: AutomationStudioImporterSdkManifest; implementation: AutomationStudioNativeNodeImplementation }>();
  private readonly recordingMappers = new Map<string, AutomationStudioRecordingMapperImplementation>();
  private readonly targetResolvers = new Map<string, AutomationStudioTargetResolverImplementation>();
  private readonly comparators = new Map<string, AutomationStudioComparatorImplementation>();
  private readonly grants: Required<AutomationStudioNativeRuntimeGrants>;
  readonly elementMatcher = createAutomationStudioElementMatcher();

  constructor(grants: AutomationStudioNativeRuntimeGrants = {}) {
    this.grants = { permissions: [...(grants.permissions ?? [])], runtimeCapabilities: [...(grants.runtimeCapabilities ?? [])], networkDestinations: [...(grants.networkDestinations ?? [])], secretHandles: [...(grants.secretHandles ?? [])], filesystemRoots: [...(grants.filesystemRoots ?? [])], process: grants.process === true, childProcess: grants.childProcess === true };
  }

  register(manifest: AutomationStudioImporterSdkManifest, bundle: AutomationStudioImporterImplementationBundle): this {
    if (bundle.packageId !== manifest.packageId || bundle.packageVersion !== manifest.packageVersion) throw new Error("Importer implementation bundle identity/version does not match its manifest.");
    for (const node of manifest.nodes) {
      const key = node.source.kind === "importer" || node.source.kind === "code" ? node.source.implementationKey : "";
      const implementation = bundle.implementations[key];
      if (node.capabilities.executable && !implementation) throw new Error(`Missing trusted-local implementation ${key} for node ${node.id}.`);
    }
    for (const key of Object.keys(bundle.implementations)) if (!manifest.nodes.some((node) => (node.source.kind === "importer" || node.source.kind === "code") && node.source.implementationKey === key)) throw new Error(`Implementation ${key} is not declared by manifest ${manifest.packageId}.`);
    validateExtensionBindings("recording mapper", manifest.recordingMappers, bundle.recordingMappers);
    validateExtensionBindings("target resolver", manifest.targetResolvers, bundle.targetResolvers);
    validateExtensionBindings("comparator", manifest.comparators, bundle.comparators);
    for (const [nodeId, contract] of Object.entries(bundle.parameterContracts ?? {})) {
      if (!manifest.nodes.some((node) => node.id === nodeId)) throw new Error(`Parameter contract ${nodeId} is not declared by manifest ${manifest.packageId}.`);
      if (typeof contract !== "function") throw new Error(`Parameter contract ${nodeId} must be a function.`);
    }
    this.sdk.register(manifest);
    // Bound on the registry that validation of a generated plan reads, never on the definition, which stays plain data.
    for (const [nodeId, contract] of Object.entries(bundle.parameterContracts ?? {})) this.sdk.nodes.bindParameterContract(nodeId, contract);
    for (const node of manifest.nodes) { const key = node.source.kind === "importer" || node.source.kind === "code" ? node.source.implementationKey : ""; const implementation = bundle.implementations[key]; if (implementation) this.bindings.set(node.id, { manifest, implementation }); }
    for (const [id, implementation] of Object.entries(bundle.recordingMappers ?? {})) this.recordingMappers.set(`${manifest.domainId}:${id}`, implementation);
    for (const [id, implementation] of Object.entries(bundle.targetResolvers ?? {})) this.targetResolvers.set(`${manifest.domainId}:${id}`, implementation);
    for (const [id, implementation] of Object.entries(bundle.comparators ?? {})) this.comparators.set(`${manifest.domainId}:${id}`, implementation);
    return this;
  }

  getDefinition(nodeId: string): AutomationStudioNodeDefinition | undefined { return this.sdk.nodes.get(nodeId); }
  /** Only registered canonical definitions supply the runtime floor. */
  resolveActionEffect(node: AutomationStudioFlowNode, parameterValues: Readonly<Record<string, unknown>> = node.parameterValues ?? {}): AutomationStudioResolvedActionEffect | undefined {
    const definition = this.getDefinition(node.definitionId);
    const own = definition ? resolveAutomationStudioNodeActionEffect(definition, parameterValues) : undefined;
    if (node.definitionId !== "builtin.policy.action" || typeof parameterValues.outputId !== "string") return own;
    const outputId = parameterValues.outputId.trim();
    if (!outputId) return own;
    const payload = parameterValues.parameters;
    const parameters = payload && typeof payload === "object" && !Array.isArray(payload) && !isAutomationNodeParameterStateBinding(payload) ? payload as Readonly<Record<string, unknown>> : undefined;
    const matches = this.listDefinitions().filter((candidate) => candidate.outputAction?.fixedOutputId === outputId || candidate.outputAction?.allowedOutputIds?.includes(outputId));
    return combineAutomationStudioResolvedActionEffects([
      own,
      ...matches.map((candidate) => resolveAutomationStudioNodeActionEffect(candidate, parameters ?? (payload === undefined ? {} : Object.fromEntries(candidate.parameters.map((parameter) => [parameter.id, undefined])))))
    ]);
  }
  listDefinitions(): AutomationStudioNodeDefinition[] { return this.sdk.list().flatMap((manifest) => manifest.nodes); }
  getRuntimeCapabilities(): string[] { return [...this.grants.runtimeCapabilities]; }
  getRegistryResolution(scope: AutomationStudioFlowScope): AutomationStudioNodeRegistryResolution {
    return { scope: structuredClone(scope), runtimeCapabilities: [...this.grants.runtimeCapabilities], permissions: [...this.grants.permissions] };
  }
  getRecordingMapper(domainId: string, id: string): AutomationStudioRecordingMapperImplementation | undefined { return this.recordingMappers.get(`${domainId}:${id}`); }
  listRecordingMappers(domainId: string): Array<{ definition: NonNullable<AutomationStudioImporterSdkManifest["recordingMappers"]>[number]; packageId: string; packageVersion: string; implementation: AutomationStudioRecordingMapperImplementation }> {
    return this.sdk.list().filter((manifest) => manifest.domainId === domainId).flatMap((manifest) => (manifest.recordingMappers ?? []).flatMap((definition) => {
      const implementation = this.getRecordingMapper(domainId, definition.id);
      return implementation ? [{ definition, packageId: manifest.packageId, packageVersion: manifest.packageVersion, implementation }] : [];
    }));
  }
  getTargetResolver(domainId: string, id: string): AutomationStudioTargetResolverImplementation | undefined { return this.targetResolvers.get(`${domainId}:${id}`); }
  getComparator(domainId: string, id: string): AutomationStudioComparatorImplementation | undefined { return this.comparators.get(`${domainId}:${id}`); }

  async execute(node: AutomationStudioFlowNode, inputs: Record<string, JsonValue>, signal?: AbortSignal, hostContext?: AutomationStudioNativeNodeContext["host"]): Promise<AutomationStudioNativeExecution | undefined> {
    const definition = this.getDefinition(node.definitionId); if (!definition || (definition.source.kind !== "importer" && definition.source.kind !== "code")) return undefined;
    if (node.definitionVersion && node.definitionVersion !== definition.version) return failed(`Node ${definition.id} requires definition version ${node.definitionVersion}, but ${definition.version} is bound.`, true);
    const binding = this.bindings.get(definition.id); if (!binding) return failed(`No trusted-local implementation is bound for ${definition.id}.`, true);
    const denied = deniedRequirement(definition, this.grants); if (denied) return failed(`Native node ${definition.id} was denied ${denied}.`, true);
    const actionEffect = this.resolveActionEffect(node);
    const controller = new AbortController(); const abort = () => controller.abort(signal?.reason); signal?.addEventListener("abort", abort, { once: true }); if (signal?.aborted) controller.abort(signal.reason);
    const logs: AutomationStudioNativeLogEntry[] = [];
    const timeoutMs = readPositiveNumber(node.metadata?.timeoutMs) ?? 30_000;
    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
      const isolatedInputs = Object.fromEntries(definition.inputs.flatMap((port) => inputs[port.id] === undefined ? [] : [[port.id, inputs[port.id]]])) as Record<string, JsonValue>;
      const host = hostContext || actionEffect ? { ...hostContext, capabilityIds: [...(hostContext?.capabilityIds ?? [])], sideEffectClass: hostContext?.sideEffectClass ?? "none" } : undefined;
      if (host) {
        if (actionEffect && actionEffect.effectClass !== "observe" && (host.sideEffectClass === "none" || host.sideEffectClass === "internal")) host.sideEffectClass = "external";
        const referenceNow = automationStudioReferenceNow(host.referenceNow);
        if (referenceNow === undefined) delete host.referenceNow;
        else host.referenceNow = referenceNow;
        Object.freeze(host);
      }
      const execution = Promise.resolve(binding.implementation({ inputs: Object.freeze(isolatedInputs), parameters: Object.freeze({ ...(node.parameterValues ?? {}) }), signal: controller.signal, grants: Object.freeze({ ...this.grants, permissions: [...this.grants.permissions], runtimeCapabilities: [...this.grants.runtimeCapabilities], networkDestinations: [...this.grants.networkDestinations], secretHandles: [...this.grants.secretHandles], filesystemRoots: [...this.grants.filesystemRoots] }), ...(host ? { host } : {}), elementMatcher: this.elementMatcher, resolveTarget: (resolverId, target) => this.resolveTarget(binding.manifest.domainId, resolverId, target, controller.signal), log: (entry) => logs.push(redactLog(entry)) }));
      const result = await Promise.race([execution, new Promise<AutomationNodeExecutionResult>((resolve) => { timer = setTimeout(() => { resolve({ status: "failed", route: "failed", outputs: { error: `Native node exceeded ${timeoutMs}ms timeout.` } }); controller.abort(new Error("Native node timeout.")); }, timeoutMs); })]);
      const boundaryError = validateResultBoundary(definition, result); if (boundaryError) return { ...failed(boundaryError), logs };
      return { result: projectRuntimeTargetActionability(result), logs, declaredOutputs: definition.outputs };
    } catch (error) { return { ...failed(error instanceof Error ? error.message : "Native node execution failed."), logs }; }
    finally { if (timer) clearTimeout(timer); signal?.removeEventListener("abort", abort); }
}

  private async resolveTarget(domainId: string, resolverId: string, target: JsonObject, signal: AbortSignal): Promise<JsonObject | null> {
    const resolver = this.getTargetResolver(domainId, resolverId);
    if (!resolver) throw new Error(`No target resolver ${resolverId} is registered for domain ${domainId}.`);
    return await resolver(target, { signal, elementMatcher: this.elementMatcher });
  }
}

function deniedRequirement(definition: AutomationStudioNodeDefinition, grants: Required<AutomationStudioNativeRuntimeGrants>): string | null {
  const permissions = new Set(grants.permissions); const capabilities = new Set(grants.runtimeCapabilities);
  for (const value of definition.safety?.requiredPermissions ?? []) if (!permissions.has(value)) return `permission ${value}`;
  for (const value of definition.requiredRuntimeCapabilities ?? []) if (!capabilities.has(value)) return `runtime capability ${value}`;
  const requirement = definition.safety?.runtime; if (!requirement) return null;
  return missing("network destination", requirement.networkDestinations, grants.networkDestinations) ?? missing("secret handle", requirement.secretHandles, grants.secretHandles) ?? missing("filesystem root", requirement.filesystemRoots, grants.filesystemRoots) ?? (requirement.process && !grants.process ? "process access" : null) ?? (requirement.childProcess && !grants.childProcess ? "child-process access" : null);
}
function missing(label: string, required: string[] | undefined, granted: Iterable<string>): string | null { const values = new Set(granted); const value = required?.find((item) => !values.has(item)); return value ? `${label} ${value}` : null; }
function validateResultBoundary(definition: AutomationStudioNodeDefinition, result: AutomationNodeExecutionResult): string | null {
  const allowed = new Set(definition.outputs.map((port) => port.id)); for (const output of Object.keys(result.outputs ?? {})) if (!allowed.has(output) && output !== "error") return `Native node returned undeclared output ${output}.`;
  for (const effect of result.effects ?? []) if (effect.type === "policy.output.dispatch") {
    if (definition.source.kind === "code") return "Code Nodes cannot dispatch importer output actions.";
    if (!definition.outputAction) return "Importer node emitted an output action without a declared outputAction contract.";
    const payload = effect.payload as JsonObject | undefined; const outputId = typeof payload?.outputId === "string" ? payload.outputId : "";
    if (definition.outputAction.fixedOutputId && outputId !== definition.outputAction.fixedOutputId) return `Importer node attempted undeclared output ${outputId}.`;
    if (definition.outputAction.allowedOutputIds && !definition.outputAction.allowedOutputIds.includes(outputId)) return `Importer node attempted undeclared output ${outputId}.`;
  }
  return null;
}
function redactLog(entry: AutomationStudioNativeLogEntry): AutomationStudioNativeLogEntry { return { level: entry.level, message: entry.message.slice(0, 2_000), ...(entry.data ? { data: redactObject(entry.data) } : {}) }; }
function redactObject(value: JsonObject): JsonObject { return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, /secret|token|password|credential|authorization/i.test(key) ? "[REDACTED]" : item])) as JsonObject; }
function failed(message: string, unacted = false): AutomationStudioNativeExecution {
  const result: AutomationNodeExecutionResult = { status: "failed", route: "failed", outputs: { error: message } };
  if (unacted) result.failure = { category: "graph_validation_or_unknown_node", code: "executor.native.refused", retryable: false, stage: "dispatch", effect: "unacted" };
  return { result, logs: [] };
}
function readPositiveNumber(value: unknown): number | undefined { return typeof value === "number" && Number.isFinite(value) && value > 0 ? value : undefined; }
function validateExtensionBindings(label: string, definitions: Array<{ id: string }> | undefined, implementations: Record<string, unknown> | undefined): void { const declared = new Set((definitions ?? []).map((item) => item.id)); const bound = new Set(Object.keys(implementations ?? {})); for (const id of bound) if (!declared.has(id)) throw new Error(`Implementation ${id} is not declared as an importer ${label}.`); for (const id of declared) if (!bound.has(id)) throw new Error(`Missing importer ${label} implementation ${id}.`); }
