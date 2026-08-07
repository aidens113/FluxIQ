import type { JsonObject } from "../../../core/index.ts";
import type { AutomationConditionGroup } from "./conditions.ts";
import type { EvidenceReference } from "./evidence.ts";
import type { StateValueType } from "./state.ts";

export type ParameterDefinition = {
  type: StateValueType | "array" | "object";
  required: boolean;
  description?: string;
  defaultValue?: unknown;
  sensitive?: boolean;
  metadata?: JsonObject;
};

export type PreflightDefinition = {
  requiredCapabilities?: string[];
  conditions?: AutomationConditionGroup;
  metadata?: JsonObject;
};

export type ActionSafetyMetadata = {
  level: "safe" | "review" | "privileged" | "destructive";
  requiresApproval?: boolean;
  reversible?: boolean;
  metadata?: JsonObject;
};

export type ActionDefinition = {
  actionType: string;
  schemaVersion: string;
  parameters: Record<string, ParameterDefinition>;
  preflight?: PreflightDefinition;
  capabilities?: string[];
  safety?: ActionSafetyMetadata;
  metadata?: JsonObject;
};

export type ActionTarget = {
  type: string;
  id?: string;
  label?: string;
  selector?: string;
  bounds?: { x: number; y: number; width: number; height: number };
  relativePosition?: { x: number; y: number };
  metadata?: JsonObject;
};

export type ActionResult = {
  status: "succeeded" | "failed" | "timed_out" | "cancelled" | "unknown";
  message?: string;
  evidence?: EvidenceReference[];
  metadata?: JsonObject;
};

export type PolicyAction = {
  id: string;
  /** Registered domain output to dispatch. New generated policies always use this. */
  outputId?: string;
  /** Action input stream awaited as confirmation after dispatch. */
  confirmationInputId?: string;
  confirmationTimeoutMs?: number;
  /** @deprecated Compatibility field for policies recorded before output bindings. */
  actionType: string;
  parameters: Record<string, unknown>;
  target?: ActionTarget;
  sourceEvidence?: EvidenceReference[];
  metadata?: JsonObject;
};
