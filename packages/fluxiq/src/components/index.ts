import type { JsonObject } from "../core/index.ts";
import type { FlowNodeHandler } from "../flows/index.ts";

export type ComponentParamSpec = {
  name: string;
  type: "string" | "number" | "boolean" | "object" | "array" | "enum";
  required: boolean;
  description?: string;
  default?: unknown;
  options?: Array<{ value: string; label?: string; description?: string }>;
};

export type ComponentSpec = {
  nodeType: string;
  displayName: string;
  category: string;
  description: string;
  params: ComponentParamSpec[];
  resultStates: string[];
  requiredCapabilities?: string[];
  requiredInputs?: string[];
  requiredOutputs?: string[];
  metadata?: JsonObject;
};

export type ComponentDefinition = {
  spec: ComponentSpec;
  handler: FlowNodeHandler;
};

export class ComponentRegistry {
  private readonly components = new Map<string, ComponentDefinition>();

  register(definition: ComponentDefinition): void {
    const nodeType = definition.spec.nodeType.trim();
    if (!nodeType) {
      throw new Error("Component node type is required");
    }
    if (this.components.has(nodeType)) {
      throw new Error(`Duplicate component node type: ${nodeType}`);
    }
    this.components.set(nodeType, definition);
  }

  maybeGet(nodeType: string): ComponentDefinition | null {
    return this.components.get(nodeType.trim()) ?? null;
  }

  specs(): ComponentSpec[] {
    return [...this.components.values()]
      .map((definition) => definition.spec)
      .sort((left, right) => left.nodeType.localeCompare(right.nodeType));
  }
}

export function registerBasicComponents(registry: ComponentRegistry): void {
  registry.register({
    spec: {
      nodeType: "flow.noop",
      displayName: "No Operation",
      category: "Flow",
      description: "Completes immediately without changing flow state.",
      params: [],
      resultStates: ["success"]
    },
    handler: () => ({ state: "success", message: "noop" })
  });

  registry.register({
    spec: {
      nodeType: "flow.success",
      displayName: "Success",
      category: "Flow",
      description: "Marks the current branch successful.",
      params: [],
      resultStates: ["success"]
    },
    handler: () => ({ state: "success", message: "success" })
  });

  registry.register({
    spec: {
      nodeType: "flow.fail",
      displayName: "Fail",
      category: "Flow",
      description: "Marks the current branch failed.",
      params: [],
      resultStates: ["failed"]
    },
    handler: () => ({ state: "failed", message: "failed" })
  });
}
