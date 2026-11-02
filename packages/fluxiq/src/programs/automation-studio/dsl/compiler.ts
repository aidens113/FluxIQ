import { validateAutomationStudioFlow, type AutomationStudioFlowArtifact } from "../model/index.ts";
import type { AutomationStudioNodeRegistry } from "../../../components/automation/index.ts";
import { defineFlow as defineExecutableFlow, compileExecutableFlow, normalizeExecutableFlow, normalizeDependencies, flowCompilationDigest, FLOW_COMPILER_VERSION } from "../../../flows/executable/dsl/index.ts";
import type { AutomationStudioFlowCompilation, AutomationStudioFlowDefinition, AutomationStudioFlowDependency } from "./contracts.ts";

export const defineFlow = defineExecutableFlow<AutomationStudioFlowDefinition>;
export const normalizeAutomationStudioFlow = normalizeExecutableFlow<AutomationStudioFlowArtifact>;

/** Stamp Studio persistence before invoking the framework's one executable compiler. */
export function compileFlowDefinition(definition: AutomationStudioFlowDefinition, options: { projectId: string; now?: number; moduleId?: string; sourceDigest?: string; registry?: AutomationStudioNodeRegistry }): AutomationStudioFlowCompilation {
  const now = options.now ?? Date.now();
  const dependencies = normalizeDependencies(definition.dependencies ?? []);
  const base: AutomationStudioFlowArtifact = {
    schemaVersion: "0.1", flowId: definition.flowId, projectId: options.projectId, name: definition.name,
    ...(definition.description !== undefined ? { description: definition.description } : {}), scope: definition.scope ?? { kind: "global" },
    visibility: definition.visibility ?? "private", origin: definition.origin ?? "manual", ...(definition.metadata ? { metadata: definition.metadata } : {}),
    source: options.moduleId ? { mode: "code", moduleId: options.moduleId, sourceDigest: options.sourceDigest ?? "", compilerVersion: FLOW_COMPILER_VERSION, compiledDigest: "pending", declaredDependencies: dependencies.map((item) => `${item.kind}:${item.id}@${item.version}`) } : { mode: "visual" },
    interface: definition.interface ?? { inputs: [], outputs: [] }, errors: definition.errors ?? [], variables: definition.variables ?? [],
    nodes: definition.nodes ?? [], edges: definition.edges ?? [], ...(definition.regions ? { regions: definition.regions } : {}), ...(definition.regionHandoffs ? { regionHandoffs: definition.regionHandoffs } : {}),
    ...(definition.executionDefaults ? { executionDefaults: definition.executionDefaults } : {}), publication: { status: "draft" }, createdAt: now, updatedAt: now
  };

  const compiled = compileExecutableFlow(base, dependencies, { ...(options.registry ? { registry: options.registry } : {}), validate: validateAutomationStudioFlow, digest: digestFlow });
  if (compiled.ok && compiled.plan.flow.source.mode === "code") compiled.plan.flow.source.compiledDigest = compiled.plan.digest;
  return compiled;
}

/** Detects graph edits that were not produced by the code compiler. */
export function verifyCodeOwnedFlowCompilation(flow: AutomationStudioFlowArtifact): boolean {
  if (flow.source.mode !== "code") return true;
  const dependencies = (flow.source.declaredDependencies ?? []).flatMap((pin): AutomationStudioFlowDependency[] => {
    const match = /^(flow|node|schema):(.+)@([^@]+)$/.exec(pin);
    return match ? [{ kind: match[1] as AutomationStudioFlowDependency["kind"], id: match[2]!, version: match[3]! }] : [];
  });
  return Boolean(flow.source.compiledDigest) && digestFlow(normalizeAutomationStudioFlow(flow), normalizeDependencies(dependencies)) === flow.source.compiledDigest;
}

function digestFlow(flow: AutomationStudioFlowArtifact, dependencies: AutomationStudioFlowDependency[]): string {
  const value = { ...flow, createdAt: 0, updatedAt: 0, source: flow.source.mode === "code" ? { ...flow.source, compiledDigest: "" } : flow.source, dependencies };
  return flowCompilationDigest(value);
}
