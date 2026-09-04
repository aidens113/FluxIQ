import type { JsonValue } from "../../../core/index.ts";

export type AutomationNodeScope = "policy" | "routine" | "both";
export type AutomationNodeOrigin = "builtin" | "custom";

export type AutomationNodeClass =
  | "control-flow"
  | "logic"
  | "math"
  | "random"
  | "data"
  | "database"
  | "timing"
  | "policy"
  | "routine"
  | "runtime"
  | "custom";

export type AutomationNodeValueType =
  | "signal"
  | "boolean"
  | "number"
  | "string"
  | "object"
  | "array"
  | "policy"
  | "routine"
  | "any";

export type AutomationNodePort = {
  id: string;
  label: string;
  valueType: AutomationNodeValueType;
  role?: "control" | "success" | "failure" | "data" | "error" | "branch";
  required?: boolean;
  multiple?: boolean;
};

export type AutomationNodeParameter = {
  id: string;
  label: string;
  description?: string;
  valueType: AutomationNodeValueType | "expression" | "json";
  defaultValue?: JsonValue;
  options?: Array<{ label: string; value: string }>;
  ui?: {
    control: "text" | "textarea" | "identifier" | "path" | "field" | "reference" | "value";
    referenceType?: "action" | "task" | "policy" | "routine" | "database-collection" | "variable";
    placeholder?: string;
  };
  required?: boolean;
  /** Parameters are state-bindable by default; set false to restrict this field to manual values. */
  allowStateBinding?: boolean;
  example?: JsonValue;
  constraints?: {
    minimum?: number;
    maximum?: number;
    minLength?: number;
    maxLength?: number;
    pattern?: string;
    integer?: boolean;
  };
};

export type AutomationNodeParameterStateBinding = {
  $state: {
    path: string;
    /** The last literal value, used when the selected state path is unavailable. */
    fallback?: JsonValue;
  };
};

export type AutomationNodeExecutionContext = {
  inputs: Record<string, JsonValue>;
  parameters: Record<string, JsonValue>;
  variables?: Map<string, JsonValue>;
  random?: () => number;
  now?: () => number;
  signal?: AbortSignal;
};

export type AutomationNodeExecutionResult = {
  outputs?: Record<string, JsonValue>;
  route?: string;
  status?: "success" | "failed" | "waiting" | "skipped";
  effects?: Array<{ type: string; payload?: JsonValue }>;
};

export type AutomationNodeExecutor = (context: AutomationNodeExecutionContext) => AutomationNodeExecutionResult | Promise<AutomationNodeExecutionResult>;

export type AutomationNodeDefinition = {
  id: string;
  label: string;
  description: string;
  class: AutomationNodeClass;
  scope: AutomationNodeScope;
  origin: AutomationNodeOrigin;
  inputs: AutomationNodePort[];
  outputs: AutomationNodePort[];
  parameters: AutomationNodeParameter[];
  icon?: string;
  tags?: string[];
  privileged?: boolean;
  implementationKey: string;
  execute?: AutomationNodeExecutor;
};

export type AutomationNodeClassGroup = {
  id: AutomationNodeClass;
  label: string;
  description: string;
};
