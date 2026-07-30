import type { JsonValue } from "../../../core";

export type AutomationNodeScope = "policy" | "routine" | "both";
export type AutomationNodeOrigin = "builtin" | "custom";

export type AutomationNodeClass =
  | "control-flow"
  | "logic"
  | "math"
  | "random"
  | "data"
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
  required?: boolean;
  multiple?: boolean;
};

export type AutomationNodeParameter = {
  id: string;
  label: string;
  valueType: AutomationNodeValueType | "expression" | "json";
  defaultValue?: JsonValue;
  options?: Array<{ label: string; value: string }>;
  required?: boolean;
};

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
};

export type AutomationNodeClassGroup = {
  id: AutomationNodeClass;
  label: string;
  description: string;
};
