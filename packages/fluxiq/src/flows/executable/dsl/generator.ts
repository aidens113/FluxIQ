import type { ExecutableFlow } from "../graph/index.ts";
import type { FlowDefinition, FlowModuleImport } from "./contracts.ts";
import { flowDependencyPins } from "./dependencies.ts";

/** New framework modules name the framework DSL; legacy adapters select their compatible import. */
export function generateFlowDefinitionTypeScript<TDefinition extends FlowDefinition>(definition: TDefinition, options: { moduleImport?: FlowModuleImport } = {}): string {
  const importLine = 'import { defineFlow } from "' + (options.moduleImport ?? "fluxiq/flows/executable/dsl") + '";';
  return importLine + "\n\nexport default defineFlow(" + JSON.stringify(definition, null, 2) + ");\n";
}

export function generateFlowTypeScript(flow: ExecutableFlow): string {
  const definition: FlowDefinition = {
    flowId: flow.flowId, name: flow.name, ...(flow.description ? { description: flow.description } : {}), scope: flow.scope,
    ...(flow.metadata ? { metadata: flow.metadata } : {}), interface: flow.interface, errors: flow.errors, variables: flow.variables, nodes: flow.nodes, edges: flow.edges,
    ...(flow.regions ? { regions: flow.regions } : {}), ...(flow.regionHandoffs ? { regionHandoffs: flow.regionHandoffs } : {}), ...(flow.executionDefaults ? { executionDefaults: flow.executionDefaults } : {}), dependencies: flowDependencyPins(flow)
  };
  return generateFlowDefinitionTypeScript(definition);
}
