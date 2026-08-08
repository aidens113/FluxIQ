import type { JsonObject, JsonValue } from "../../../core/index.ts";
import type { AutomationStudioFlowNode } from "../model/index.ts";
import { AutomationStudioImporterSdkRegistry, type AutomationStudioComparatorImplementation, type AutomationStudioImporterImplementationBundle, type AutomationStudioImporterSdkManifest, type AutomationStudioNativeLogEntry, type AutomationStudioNativeNodeImplementation, type AutomationStudioNodeDefinition, type AutomationStudioRecordingMapperImplementation, type AutomationStudioTargetResolverImplementation } from "../nodes/index.ts";
import type { AutomationNodeExecutionResult } from "../nodes/contracts.ts";

export type AutomationStudioNativeRuntimeGrants = {
  permissions?: Iterable<string>;
  runtimeCapabilities?: Iterable<string>;
  networkDestinations?: Iterable<string>;
  secretHandles?: Iterable<string>;
  filesystemRoots?: Iterable<string>;
  process?: boolean;
  childProcess?: boolean;
};
export type AutomationStudioNativeExecution = { result: AutomationNodeExecutionResult; logs: AutomationStudioNativeLogEntry[] };

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
    this.sdk.register(manifest);
    for (const node of manifest.nodes) { const key = node.source.kind === "importer" || node.source.kind === "code" ? node.source.implementationKey : ""; const implementation = bundle.implementations[key]; if (implementation) this.bindings.set(node.id, { manifest, implementation }); }
    for (const [id, implementation] of Object.entries(bundle.recordingMappers ?? {})) this.recordingMappers.set(`${manifest.domainId}:${id}`, implementation);
    for (const [id, implementation] of Object.entries(bundle.targetResolvers ?? {})) this.targetResolvers.set(`${manifest.domainId}:${id}`, implementation);
    for (const [id, implementation] of Object.entries(bundle.comparators ?? {})) this.comparators.set(`${manifest.domainId}:${id}`, implementation);
    return this;
  }

  getDefinition(nodeId: string): AutomationStudioNodeDefinition | undefined { return this.sdk.nodes.get(nodeId); }
  listDefinitions(): AutomationStudioNodeDefinition[] { return this.sdk.list().flatMap((manifest) => manifest.nodes); }
  getRuntimeCapabilities(): string[] { return [...this.grants.runtimeCapabilities]; }
  getRecordingMapper(domainId: string, id: string): AutomationStudioRecordingMapperImplementation | undefined { return this.recordingMappers.get(`${domainId}:${id}`); }
  listRecordingMappers(domainId: string): Array<{ definition: NonNullable<AutomationStudioImporterSdkManifest["recordingMappers"]>[number]; packageId: string; packageVersion: string; implementation: AutomationStudioRecordingMapperImplementation }> {
    return this.sdk.list().filter((manifest) => manifest.domainId === domainId).flatMap((manifest) => (manifest.recordingMappers ?? []).flatMap((definition) => {
      const implementation = this.getRecordingMapper(domainId, definition.id);
      return implementation ? [{ definition, packageId: manifest.packageId, packageVersion: manifest.packageVersion, implementation }] : [];
    }));
  }
  getTargetResolver(domainId: string, id: string): AutomationStudioTargetResolverImplementation | undefined { return this.targetResolvers.get(`${domainId}:${id}`); }
  getComparator(domainId: string, id: string): AutomationStudioComparatorImplementation | undefined { return this.comparators.get(`${domainId}:${id}`); }

  async execute(node: AutomationStudioFlowNode, inputs: Record<string, JsonValue>, signal?: AbortSignal): Promise<AutomationStudioNativeExecution | undefined> {
    const definition = this.getDefinition(node.definitionId); if (!definition || (definition.source.kind !== "importer" && definition.source.kind !== "code")) return undefined;
    if (node.definitionVersion && node.definitionVersion !== definition.version) return failed(`Node ${definition.id} requires definition version ${node.definitionVersion}, but ${definition.version} is bound.`);
    const binding = this.bindings.get(definition.id); if (!binding) return failed(`No trusted-local implementation is bound for ${definition.id}.`);
    const denied = deniedRequirement(definition, this.grants); if (denied) return failed(`Native node ${definition.id} was denied ${denied}.`);
    const controller = new AbortController(); const abort = () => controller.abort(signal?.reason); signal?.addEventListener("abort", abort, { once: true }); if (signal?.aborted) controller.abort(signal.reason);
    const logs: AutomationStudioNativeLogEntry[] = [];
    const timeoutMs = readPositiveNumber(node.metadata?.timeoutMs) ?? 30_000;
    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
      const isolatedInputs = Object.fromEntries(definition.inputs.flatMap((port) => inputs[port.id] === undefined ? [] : [[port.id, inputs[port.id]]])) as Record<string, JsonValue>;
      const execution = Promise.resolve(binding.implementation({ inputs: Object.freeze(isolatedInputs), parameters: Object.freeze({ ...(node.parameterValues ?? {}) }), signal: controller.signal, grants: Object.freeze({ ...this.grants, permissions: [...this.grants.permissions], runtimeCapabilities: [...this.grants.runtimeCapabilities], networkDestinations: [...this.grants.networkDestinations], secretHandles: [...this.grants.secretHandles], filesystemRoots: [...this.grants.filesystemRoots] }), log: (entry) => logs.push(redactLog(entry)) }));
      const result = await Promise.race([execution, new Promise<AutomationNodeExecutionResult>((resolve) => { timer = setTimeout(() => { resolve({ status: "failed", route: "failed", outputs: { error: `Native node exceeded ${timeoutMs}ms timeout.` } }); controller.abort(new Error("Native node timeout.")); }, timeoutMs); })]);
      const boundaryError = validateResultBoundary(definition, result); if (boundaryError) return { ...failed(boundaryError), logs };
      return { result, logs };
    } catch (error) { return { ...failed(error instanceof Error ? error.message : "Native node execution failed."), logs }; }
    finally { if (timer) clearTimeout(timer); signal?.removeEventListener("abort", abort); }
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
function failed(message: string): AutomationStudioNativeExecution { return { result: { status: "failed", route: "failed", outputs: { error: message } }, logs: [] }; }
function readPositiveNumber(value: unknown): number | undefined { return typeof value === "number" && Number.isFinite(value) && value > 0 ? value : undefined; }
function validateExtensionBindings(label: string, definitions: Array<{ id: string }> | undefined, implementations: Record<string, unknown> | undefined): void { const declared = new Set((definitions ?? []).map((item) => item.id)); const bound = new Set(Object.keys(implementations ?? {})); for (const id of bound) if (!declared.has(id)) throw new Error(`Implementation ${id} is not declared as an importer ${label}.`); for (const id of declared) if (!bound.has(id)) throw new Error(`Missing importer ${label} implementation ${id}.`); }
