import type { ExecutableFlow } from "../graph/index.ts";
import { validateExecutableFlow } from "../validation/index.ts";
import { AutomationStudioNodeRegistry } from "../../../components/automation/index.ts";
import { compileExecutableRegions } from "../regions/compilation/index.ts";
import type { FlowCompilation, FlowCompilerDiagnostic, FlowDefinition, FlowCompilerOptions, FlowDependency } from "./contracts.ts";
import { normalizeDependencies } from "./dependencies.ts";
import { normalizeExecutableFlow } from "./normalization.ts";
import { flowCompilationDigest } from "./digest.ts";
import { validateFlowRegistry, validateFlowDependencies } from "./registry.ts";

export const FLOW_COMPILER_VERSION = "0.1" as const;

/** Compile neutral declarations without creating project, publication or authoring state. */
export function compileFlowDefinition(definition: FlowDefinition, options: FlowCompilerOptions = {}): FlowCompilation {
  const flow: ExecutableFlow = {
    flowId: definition.flowId, name: definition.name,
    ...(definition.description !== undefined ? { description: definition.description } : {}),
    scope: definition.scope ?? { kind: "global" }, ...(definition.metadata ? { metadata: definition.metadata } : {}),
    interface: definition.interface ?? { inputs: [], outputs: [] }, errors: definition.errors ?? [], variables: definition.variables ?? [],
    nodes: definition.nodes ?? [], edges: definition.edges ?? [],
    ...(definition.regions ? { regions: definition.regions } : {}), ...(definition.regionHandoffs ? { regionHandoffs: definition.regionHandoffs } : {}),
    ...(definition.executionDefaults ? { executionDefaults: definition.executionDefaults } : {})
  };
  return compileExecutableFlow(flow, definition.dependencies ?? [], options);
}

/** A single normalization/validation pipeline also accepts a program's structural envelope. */
export function compileExecutableFlow<TFlow extends ExecutableFlow>(input: TFlow, dependencyInput: FlowDependency[] = [], options: FlowCompilerOptions<TFlow> = {}): FlowCompilation<TFlow> {
  const flow = normalizeExecutableFlow(input);
  const dependencies = normalizeDependencies(dependencyInput);
  const validation = options.validate ? options.validate(flow) : validateExecutableFlow(flow);
  const diagnostics: FlowCompilerDiagnostic[] = validation.issues.map(issue => ({ severity: issue.severity, code: issue.code, message: issue.message, ...(issue.path ? { path: issue.path } : {}), remediation: "Correct the declarative Flow field identified by path." }));
  const registry = options.registry ?? new AutomationStudioNodeRegistry();
  validateFlowRegistry(flow, registry, diagnostics);
  validateFlowDependencies(flow, dependencies, registry, diagnostics);
  const regions = compileExecutableRegions(flow);
  if (!regions.ok) for (const issue of regions.issues) if (!diagnostics.some(item => item.code === issue.code && item.path === issue.path)) diagnostics.push({ severity: "error", code: issue.code, message: issue.message, ...(issue.path ? { path: issue.path } : {}), remediation: "Declare node ownership and a typed handoff for every cross-region edge." });
  if (diagnostics.some(item => item.severity === "error")) return { ok: false, diagnostics };
  const digest = options.digest ? options.digest(flow, dependencies) : flowCompilationDigest({ ...flow, dependencies });
  return { ok: true, diagnostics, plan: { schemaVersion: "0.1", compilerVersion: FLOW_COMPILER_VERSION, digest, flow, nodeRegionIds: regions.ok ? regions.plan.nodeRegionIds : {}, dependencyPins: dependencies } };
}
