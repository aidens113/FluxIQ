import type { AutomationStudioFlowScope } from "../model/flows.ts";
import {
  adaptBuiltinAutomationNodeDefinition,
  validateAutomationStudioImporterNodeManifest,
  validateAutomationStudioNodeDefinition,
  type AutomationStudioImporterNodeManifest,
  type AutomationStudioNodeDefinition,
  type AutomationStudioNodeParameterContract,
  type AutomationStudioNodeRegistryResolution
} from "./definitions.ts";
import { builtinAutomationNodeDefinitions } from "./registry.ts";

/**
 * Scope-aware definition registry for new Flow authoring paths.
 *
 * This registry intentionally registers declarative importer manifests only.
 * Loading importer code and binding execution adapters remains a later runtime
 * concern, so an editor cannot acquire arbitrary host code by browsing nodes.
 *
 * The one piece of host code it holds is a parameter contract: a check the
 * host that registered a node binds to it explicitly, which plan validation
 * calls and nothing executes. It is kept beside the definitions rather than on
 * them, so a definition stays plain data.
 */
export class AutomationStudioNodeRegistry {
  private readonly definitions = new Map<string, AutomationStudioNodeDefinition>();
  private readonly parameterContracts = new Map<string, AutomationStudioNodeParameterContract>();

  constructor(definitions: Iterable<AutomationStudioNodeDefinition> = canonicalBuiltinAutomationNodeDefinitions) {
    for (const definition of definitions) this.register(definition);
  }

  register(definition: AutomationStudioNodeDefinition): this {
    const validation = validateAutomationStudioNodeDefinition(definition);
    if (!validation.ok) throw new Error(`Invalid Automation Studio node definition "${definition.id}": ${validation.issues.map((issue) => issue.code).join(", ")}`);
    if (this.definitions.has(definition.id)) throw new Error(`Automation Studio node definition "${definition.id}" is already registered.`);
    this.definitions.set(definition.id, definition);
    return this;
  }

  registerImporterManifest(manifest: AutomationStudioImporterNodeManifest): this {
    const validation = validateAutomationStudioImporterNodeManifest(manifest);
    if (!validation.ok) throw new Error(`Invalid Automation Studio importer node manifest: ${validation.issues.map((issue) => issue.code).join(", ")}`);
    for (const definition of manifest.nodes) this.register(definition);
    return this;
  }

  get(nodeId: string, resolution?: AutomationStudioNodeRegistryResolution): AutomationStudioNodeDefinition | undefined {
    const definition = this.definitions.get(nodeId);
    return definition && (!resolution || isAvailable(definition, resolution)) ? definition : undefined;
  }

  list(resolution: AutomationStudioNodeRegistryResolution): AutomationStudioNodeDefinition[] {
    return [...this.definitions.values()].filter((definition) => isAvailable(definition, resolution));
  }

  /**
   * Binds a domain's check of a registered node's parameter values, which
   * validation of a generated plan runs. One contract per node, bound once; a
   * built-in node is checked by Core alone.
   */
  bindParameterContract(nodeId: string, contract: AutomationStudioNodeParameterContract): this {
    const definition = this.definitions.get(nodeId);
    if (!definition) throw new Error(`Cannot bind a parameter contract to unregistered node definition "${nodeId}".`);
    if (definition.source.kind === "builtin") throw new Error(`Cannot bind a parameter contract to built-in node definition "${nodeId}".`);
    if (typeof contract !== "function") throw new Error(`The parameter contract for node definition "${nodeId}" must be a function.`);
    if (this.parameterContracts.has(nodeId)) throw new Error(`Node definition "${nodeId}" already has a parameter contract.`);
    this.parameterContracts.set(nodeId, contract);
    return this;
  }

  getParameterContract(nodeId: string): AutomationStudioNodeParameterContract | undefined {
    return this.parameterContracts.get(nodeId);
  }
}

export const canonicalBuiltinAutomationNodeDefinitions = builtinAutomationNodeDefinitions.map(adaptBuiltinAutomationNodeDefinition);

function isAvailable(definition: AutomationStudioNodeDefinition, resolution: AutomationStudioNodeRegistryResolution): boolean {
  if (!scopeAllows(definition.availability, resolution.scope)) return false;
  const runtimeCapabilities = new Set(resolution.runtimeCapabilities ?? []);
  if (definition.requiredRuntimeCapabilities?.some((capability) => !runtimeCapabilities.has(capability))) return false;
  const permissions = new Set(resolution.permissions ?? []);
  if (definition.safety?.requiredPermissions?.some((permission) => !permissions.has(permission))) return false;
  return true;
}

function scopeAllows(availability: AutomationStudioNodeDefinition["availability"], scope: AutomationStudioFlowScope): boolean {
  if (availability.kind === "both") return true;
  if (availability.kind === "global") return scope.kind === "global";
  return scope.kind === "domain" && scope.domainId === availability.domainId;
}
