import type { AutomationStudioFailureRecord } from "@fluxiq/contracts/automation-studio";
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

/** A host's verdict on whether an expected state holds. */
export type AutomationNodeExpectationEvaluation = {
  passed: boolean;
  /** How many conditions the host evaluated, reported instead of Core counting expected-state keys. */
  checkedConditionCount?: number;
  message?: string;
  failure?: AutomationStudioFailureRecord;
};

/** Why Core asked, and which attempt and host snapshot the question is about. */
export type AutomationNodeExpectationEvaluationContext = {
  source: "policy_node" | "transition_comparison";
  nodeId?: string;
  attemptId?: string;
  /** The host state snapshot the expectation is evaluated against, when one was captured. */
  stateRef?: string;
  signal?: AbortSignal;
};

/**
 * Decides whether an expected state holds. Core never evaluates the conditions
 * itself: with no evaluator bound, an expectation keeps its unconditional pass.
 */
export type AutomationNodeExpectationEvaluator = (
  conditions: JsonValue[],
  mode: string,
  timeoutMs: number,
  context: AutomationNodeExpectationEvaluationContext
) => AutomationNodeExpectationEvaluation | Promise<AutomationNodeExpectationEvaluation>;

export type AutomationNodeExecutionContext = {
  inputs: Record<string, JsonValue>;
  parameters: Record<string, JsonValue>;
  variables?: Map<string, JsonValue>;
  random?: () => number;
  now?: () => number;
  signal?: AbortSignal;
  /** Bound from the host runtime boundary; the expectation node awaits it. */
  expectationEvaluator?: AutomationNodeExpectationEvaluator;
};

/** How an output-dispatching node resolved its element target before dispatch. */
export type AutomationNodeTargetResolution = {
  status: "matched" | "unresolved_no_candidates" | "no_match" | "below_confidence";
  candidateCount: number;
  minimumConfidence: number;
  candidateId?: string;
  confidence?: number;
  normalizedScore?: number;
  matchedSignals?: string[];
  failedSignals?: string[];
};

export type AutomationNodeExecutionResult = {
  outputs?: Record<string, JsonValue>;
  route?: string;
  status?: "success" | "failed" | "waiting" | "skipped";
  effects?: Array<{ type: string; payload?: JsonValue }>;
  /** Human-readable reason the node failed or is waiting. */
  message?: string;
  /** Structured failure; Core classifies from it before matching `message`. Parsed where the result becomes an attempt. */
  failure?: AutomationStudioFailureRecord;
  targetResolution?: AutomationNodeTargetResolution;
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
