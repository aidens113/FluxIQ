// The shapes a runtime patch answer may take, as a provider shows them to a
// model: a patch, or the answer that there is no repair.
//
// They lived in `deepseek/provider.ts`, which sits at the 800-line file limit,
// and what they describe is Core's contract with a model rather than anything
// about one provider's transport. A second provider would show the same shapes.
//
// **What a patch says it would lastingly do.** A patch that re-points or
// replaces an acting step carries `consequences`: the classes of lasting
// consequence the new step would have each time it runs, in Core's own words
// (`action-permissions/consequences.ts`), `[]` when it only opens, shows or
// chooses. It is the same statement the exploration's press asks for, and it
// is what the recovery's permission gate is asked about before the patch runs:
// a class nobody allowed becomes a request the person answers, never a refusal
// the run swallows. It is required only where the patch may execute. Under a
// `diagnose_and_adapt` grant a target override is a proposal a person reviews
// and nothing runs, so the model is not asked for a field nothing reads.

import { AUTOMATION_STUDIO_ACTION_CONSEQUENCES } from "../../action-permissions/index.ts";
import {
  AUTOMATION_STUDIO_NO_REPAIR_REASONS,
  AUTOMATION_STUDIO_RUNTIME_TARGET_HANDLE_MAX_LENGTH,
  AUTOMATION_STUDIO_RUNTIME_TARGET_HANDLE_PATTERN,
  AUTOMATION_STUDIO_RUNTIME_TARGET_MAX_HANDLES
} from "./structured-response.ts";

type JsonSchema = Record<string, unknown>;

const JSON_METADATA_SCHEMA = { type: "object" } as const;

/** One class per entry, each at most once: Core's list, so a declaration can only name what Core can ask a person about. */
const CONSEQUENCES_SCHEMA = {
  type: "array",
  maxItems: AUTOMATION_STUDIO_ACTION_CONSEQUENCES.length,
  uniqueItems: true,
  items: { enum: [...AUTOMATION_STUDIO_ACTION_CONSEQUENCES] }
} as const;

function boundedStringSchema(): JsonSchema {
  return { type: "string", minLength: 1, maxLength: 20_000 };
}

function runtimePatchVariant(kind: string, requiredFields: string[], properties: JsonSchema): JsonSchema {
  return {
    type: "object",
    additionalProperties: false,
    required: ["kind", "reason", ...requiredFields],
    properties: { kind: { const: kind }, reason: boundedStringSchema(), metadata: JSON_METADATA_SCHEMA, ...properties }
  };
}

/**
 * A target override, with `consequences` required where it may execute.
 *
 * `additionalProperties: false` around `handles` is the schema half of the
 * rule `isAutomationStudioModelAuthoredTargetOverrideTarget` enforces on the
 * way back: the model names handles, and only handles. It is never given a
 * field to write a domain locator into, so none can be smuggled past the
 * domain's own check of the handles it issued.
 */
function targetOverridePatchSchema(executes: boolean): JsonSchema {
  return {
    type: "object",
    additionalProperties: false,
    required: ["kind", "targetNodeId", "target", "reason", ...(executes ? ["consequences"] : [])],
    properties: {
      kind: { const: "temporary_target_override" },
      targetNodeId: { type: "string", minLength: 1, maxLength: 20_000 },
      target: {
        type: "object",
        additionalProperties: false,
        required: ["handles"],
        properties: {
          handles: {
            type: "object",
            minProperties: 1,
            maxProperties: AUTOMATION_STUDIO_RUNTIME_TARGET_MAX_HANDLES,
            propertyNames: { pattern: AUTOMATION_STUDIO_RUNTIME_TARGET_HANDLE_PATTERN, maxLength: AUTOMATION_STUDIO_RUNTIME_TARGET_HANDLE_MAX_LENGTH },
            additionalProperties: { type: "string", minLength: 1, maxLength: AUTOMATION_STUDIO_RUNTIME_TARGET_HANDLE_MAX_LENGTH, pattern: AUTOMATION_STUDIO_RUNTIME_TARGET_HANDLE_PATTERN }
          }
        }
      },
      reason: { type: "string", minLength: 1, maxLength: 20_000 },
      ...(executes ? { consequences: CONSEQUENCES_SCHEMA } : {}),
      metadata: JSON_METADATA_SCHEMA
    }
  };
}

/** Any patch kind a recovery may run, each acting kind saying what it would lastingly do. */
const GENERIC_RUNTIME_PATCH_ITEM_SCHEMA = {
  oneOf: [
    runtimePatchVariant("temporary_action_sequence", ["targetNodeId", "actionDefinitionIds", "consequences"], {
      targetNodeId: boundedStringSchema(), actionDefinitionIds: { type: "array", maxItems: 100, items: boundedStringSchema() }, consequences: CONSEQUENCES_SCHEMA
    }),
    runtimePatchVariant("temporary_wait_retry", ["targetNodeId"], {
      targetNodeId: boundedStringSchema(), timeoutMs: { type: "integer", minimum: 0 }, retryCount: { type: "integer", minimum: 0 }
    }),
    targetOverridePatchSchema(true),
    runtimePatchVariant("temporary_recovery_subflow_call", ["subflowId"], { subflowId: boundedStringSchema() }),
    runtimePatchVariant("temporary_reroute", ["fromNodeId", "toNodeId"], { fromNodeId: boundedStringSchema(), toNodeId: boundedStringSchema() })
  ]
} as const;

/** The declined answer, with its reason from Core's closed list. */
const NO_REPAIR_OUTPUT_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["kind", "summary", "reason"],
  properties: {
    kind: { const: "no_repair" },
    summary: boundedStringSchema(),
    reason: { enum: Object.keys(AUTOMATION_STUDIO_NO_REPAIR_REASONS) },
    metadata: JSON_METADATA_SCHEMA
  }
} as const;

/**
 * The output schema for a `runtime_patch` request: two shapes, always -- a
 * patch, or the answer that there is no repair. With one shape the model had
 * to name a control whatever the evidence showed, and under a proposal grant
 * that control had to be a target override with at least one handle -- which
 * is how every refusal task of the 2026-09-17 live campaign came back with one.
 *
 * `proposalOnly` is a `diagnose_and_adapt` grant: exactly one target override,
 * proposed and never run, so it carries no `consequences`.
 */
export function automationStudioRuntimePatchOutputSchema(input: { proposalOnly: boolean }): JsonSchema {
  return {
    oneOf: [
      {
        type: "object",
        additionalProperties: false,
        required: ["kind", "summary", "patches", "riskLevel"],
        properties: {
          kind: { const: "runtime_patch" },
          summary: boundedStringSchema(),
          patches: input.proposalOnly
            ? { type: "array", minItems: 1, maxItems: 1, items: targetOverridePatchSchema(false) }
            : { type: "array", minItems: 1, maxItems: 100, items: GENERIC_RUNTIME_PATCH_ITEM_SCHEMA },
          riskLevel: { enum: ["low", "medium", "high", "destructive"] },
          metadata: JSON_METADATA_SCHEMA
        }
      },
      NO_REPAIR_OUTPUT_SCHEMA
    ]
  };
}
