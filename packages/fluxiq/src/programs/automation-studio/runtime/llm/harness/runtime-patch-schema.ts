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
// `diagnose_and_adapt` run a target override is a proposal a person reviews
// and nothing runs, so the model is not asked for a field nothing reads.

import { AUTOMATION_STUDIO_ACTION_CONSEQUENCES } from "../../action-permissions/index.ts";
import { AUTOMATION_STUDIO_FACT_CONDITION_OPS } from "../../executor/lifecycle/index.ts";
import { AUTOMATION_STUDIO_LIFECYCLE_EVENTS } from "../../../nodes/control-flow/index.ts";
import {
  AUTOMATION_STUDIO_NO_REPAIR_REASONS,
  AUTOMATION_STUDIO_RUNTIME_PATCH_HANDLER_BOUNDS as BOUNDS,
  AUTOMATION_STUDIO_RUNTIME_PATCH_MAX_STEPS,
  AUTOMATION_STUDIO_RUNTIME_TARGET_HANDLE_MAX_LENGTH,
  AUTOMATION_STUDIO_RUNTIME_TARGET_HANDLE_PATTERN,
  AUTOMATION_STUDIO_RUNTIME_TARGET_MAX_HANDLES,
  type AutomationStudioRuntimePatchHandlerEvent
} from "./structured-response.ts";

type JsonSchema = Record<string, unknown>;

/**
 * The patch kinds only an in-run repair is offered: the run is held at the
 * failing step, so the fix can be a handler for what it met or one unit made
 * new. A request that does not declare an in-run repair is never shown them.
 */
export const AUTOMATION_STUDIO_IN_RUN_REPAIR_PATCH_KINDS = Object.freeze(["add_handler", "replace_unit"] as const);

/** The lifecycle points a repair may register a handler for, in the order they occur: every one but `start`. */
export const AUTOMATION_STUDIO_RUNTIME_PATCH_HANDLER_EVENTS: readonly AutomationStudioRuntimePatchHandlerEvent[] = Object.freeze(
  AUTOMATION_STUDIO_LIFECYCLE_EVENTS.filter((event): event is AutomationStudioRuntimePatchHandlerEvent => event !== "start")
);

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

/**
 * The steps a repair inserts before a node: whole nodes, not definition names.
 *
 * `parameters` is deliberately an open object. It is the definition's own
 * declared parameters -- the text a step types, the URL it opens, the control it
 * acts on -- in the vocabulary of the domain that owns the definition, which
 * Core does not know and must not pretend to. It is the same value the
 * authoring path writes when it creates a node, and the registry the executor
 * dispatches through is what refuses a parameter the definition never declared.
 * The boundary's job here is the bound: `provider-result.ts` holds each step to
 * a serialized ceiling so a page cannot arrive inside one.
 */
const STEP_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["definitionId"],
  properties: { definitionId: boundedStringSchema(), label: boundedStringSchema(), parameters: { type: "object" } }
} as const;

const INSERTED_STEPS_SCHEMA = {
  type: "array",
  minItems: 1,
  maxItems: AUTOMATION_STUDIO_RUNTIME_PATCH_MAX_STEPS,
  items: STEP_SCHEMA
} as const;

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

/** Every patch kind a recovery may run, each acting kind saying what it would lastingly do, keyed by kind. */
const RUNTIME_PATCH_VARIANTS: Readonly<Record<string, JsonSchema>> = Object.freeze({
  temporary_action_sequence: runtimePatchVariant("temporary_action_sequence", ["targetNodeId", "steps", "consequences"], {
    targetNodeId: boundedStringSchema(), steps: INSERTED_STEPS_SCHEMA, consequences: CONSEQUENCES_SCHEMA
  }),
  temporary_wait_retry: runtimePatchVariant("temporary_wait_retry", ["targetNodeId"], {
    targetNodeId: boundedStringSchema(), timeoutMs: { type: "integer", minimum: 0 }, retryCount: { type: "integer", minimum: 0 }
  }),
  temporary_target_override: targetOverridePatchSchema(true),
  temporary_recovery_subflow_call: runtimePatchVariant("temporary_recovery_subflow_call", ["subflowId"], { subflowId: boundedStringSchema() }),
  temporary_reroute: runtimePatchVariant("temporary_reroute", ["fromNodeId", "toNodeId"], { fromNodeId: boundedStringSchema(), toNodeId: boundedStringSchema() })
});

// The shapes of `add_handler` and `replace_unit`. Their descriptions are the
// model's guidance, so they speak of steps, facts and parts in general terms
// and never describe a kind of site, a task or an answer: the repair is
// measured on whether it generalises.

const ID_SCHEMA = { type: "string", minLength: 1, maxLength: BOUNDS.maxIdLength } as const;
const NAME_SCHEMA = { type: "string", minLength: 1, maxLength: BOUNDS.maxValueLength } as const;

/** A condition's target names evidence handles only, as a target override's does. */
const CONDITION_TARGET_SCHEMA = {
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
} as const;

const FACT_CONDITION_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["fact", "op"],
  properties: {
    fact: { type: "string", minLength: 1, maxLength: BOUNDS.maxFactLength, description: "What the host observes, in the host's own terms, as the evidence shows it." },
    op: { enum: [...AUTOMATION_STUDIO_FACT_CONDITION_OPS] },
    value: {
      oneOf: [
        { type: "string", maxLength: BOUNDS.maxValueLength },
        { type: "number" },
        { type: "boolean" },
        { type: "null" },
        { type: "object", additionalProperties: false, required: ["input"], properties: { input: NAME_SCHEMA } },
        { type: "object", additionalProperties: false, required: ["value"], properties: { value: NAME_SCHEMA } }
      ]
    },
    target: CONDITION_TARGET_SCHEMA
  }
} as const;

function conditionsSchema(description: string, minItems: number): JsonSchema {
  return { type: "array", minItems, maxItems: BOUNDS.maxConditions, items: FACT_CONDITION_SCHEMA, description };
}

function stepsSchema(stepSchema: JsonSchema, description: string): JsonSchema {
  return { type: "array", minItems: 1, maxItems: AUTOMATION_STUDIO_RUNTIME_PATCH_MAX_STEPS, items: stepSchema, description };
}

const SCOPE_SCHEMA = {
  description: "Where the handler applies: the steps it names, or every step of this part. Never the whole automation.",
  oneOf: [
    { type: "object", additionalProperties: false, required: ["kind", "nodeIds"], properties: { kind: { const: "nodes" }, nodeIds: { type: "array", minItems: 1, maxItems: BOUNDS.maxScopeNodeIds, items: ID_SCHEMA } } },
    { type: "object", additionalProperties: false, required: ["kind"], properties: { kind: { const: "subflow" }, inherit: { type: "boolean" } } }
  ]
} as const;

const THEN_SCHEMA = {
  description: "How the run continues after the handler's steps: resume the step (not after a failure), go to a checkpoint, use these outputs in place of a failed step's, or give up and leave the failure as it was.",
  oneOf: [
    { type: "object", additionalProperties: false, required: ["kind"], properties: { kind: { const: "resume" } } },
    { type: "object", additionalProperties: false, required: ["kind", "checkpointId"], properties: { kind: { const: "route" }, checkpointId: ID_SCHEMA } },
    { type: "object", additionalProperties: false, required: ["kind", "outputs"], properties: { kind: { const: "resolve" }, outputs: { type: "object" } } },
    { type: "object", additionalProperties: false, required: ["kind"], properties: { kind: { const: "give_up" } } }
  ]
} as const;

function handlerProperties(stepSchema: JsonSchema): JsonSchema {
  return {
    event: { enum: [...AUTOMATION_STUDIO_RUNTIME_PATCH_HANDLER_EVENTS], description: "When the handler runs: before each attempt, before a permitted retry, when the step fails, or after it succeeds." },
    scope: SCOPE_SCHEMA,
    when: conditionsSchema("The facts that identify the situation this handler is for; all must hold. Required for before and retry.", 0),
    completionCheck: conditionsSchema("The facts that prove the handler's steps worked. Required for before and retry.", 1),
    steps: stepsSchema(stepSchema, "The steps the handler runs, in order."),
    then: THEN_SCHEMA
  };
}

const HANDLER_REQUIRED = ["event", "scope", "when", "steps", "then"];

/**
 * `add_handler`: a scoped handler for a situation the run met, so the next
 * time it appears the run deals with it itself.
 */
function addHandlerPatchSchema(input: { stepSchema: JsonSchema; consequencesSchema: JsonSchema; reasonSchema: JsonSchema }): JsonSchema {
  return {
    type: "object",
    additionalProperties: false,
    description: "Add a handler: steps that run when a situation the run met appears at this point, then say how the run continues.",
    required: ["kind", "reason", "consequences", ...HANDLER_REQUIRED],
    properties: {
      kind: { const: "add_handler" },
      reason: input.reasonSchema,
      consequences: input.consequencesSchema,
      metadata: { type: "object" },
      ...handlerProperties(input.stepSchema)
    }
  };
}

/**
 * `replace_unit`: the one unit that failed, replaced whole. A node or a part
 * by steps, a handler by a handler.
 */
function replaceUnitPatchSchema(input: { stepSchema: JsonSchema; consequencesSchema: JsonSchema; reasonSchema: JsonSchema }): JsonSchema {
  return {
    type: "object",
    additionalProperties: false,
    description: "Replace exactly one unit: a step by steps, a handler by a handler, or a part by steps. Nothing outside that unit changes.",
    required: ["kind", "reason", "consequences", "unit"],
    properties: {
      kind: { const: "replace_unit" },
      reason: input.reasonSchema,
      consequences: input.consequencesSchema,
      metadata: { type: "object" },
      unit: {
        oneOf: [
          { type: "object", additionalProperties: false, required: ["kind", "nodeId"], properties: { kind: { const: "node" }, nodeId: ID_SCHEMA } },
          { type: "object", additionalProperties: false, required: ["kind", "nodeId"], properties: { kind: { const: "handler" }, nodeId: ID_SCHEMA } },
          { type: "object", additionalProperties: false, required: ["kind", "subflowId"], properties: { kind: { const: "part" }, subflowId: ID_SCHEMA } }
        ]
      },
      steps: stepsSchema(input.stepSchema, "The steps that replace a step or a part, in order."),
      handler: { type: "object", additionalProperties: false, required: HANDLER_REQUIRED, properties: handlerProperties(input.stepSchema), description: "The handler that replaces a handler." },
      failedEdgeTo: { ...ID_SCHEMA, description: "For a replaced step only: an existing step its failure goes to, so the same failure next time is a planned path." }
    }
  };
}

/**
 * The kinds only an in-run repair is shown (state-aware recovery plan, C6 step
 * 8): a handler for what the run met, or one unit made new. They are never in
 * the default list, so a request that declares no allowed kinds sees exactly
 * the five it always did; only a request whose allowed kinds name them, which
 * the recovery plan does for an in-run repair, is offered them.
 */
const IN_RUN_REPAIR_PATCH_VARIANTS: Readonly<Record<string, JsonSchema>> = Object.freeze({
  add_handler: addHandlerPatchSchema({ stepSchema: STEP_SCHEMA, consequencesSchema: CONSEQUENCES_SCHEMA, reasonSchema: boundedStringSchema() }),
  replace_unit: replaceUnitPatchSchema({ stepSchema: STEP_SCHEMA, consequencesSchema: CONSEQUENCES_SCHEMA, reasonSchema: boundedStringSchema() })
});

/**
 * The patch kinds this schema offers, narrowed to the recovery plan's allowed
 * kinds when the request declares them.
 *
 * The model was shown all five whatever the plan allowed, and live runs wrote a
 * kind the plan refuses -- a target override for an `output_not_observed`
 * failure whose plan allows a reroute, a subflow call or an action sequence --
 * and spent the call on a patch that could not land (t193 wK, C3). A kind the
 * plan would refuse is now a kind the model is never shown. Undeclared means
 * every kind, which is what a request with no plan behind it has always seen.
 */
function runtimePatchVariantsFor(allowedKinds: readonly string[] | undefined): JsonSchema[] {
  const kinds = allowedKinds === undefined ? Object.keys(RUNTIME_PATCH_VARIANTS) : Object.keys(RUNTIME_PATCH_VARIANTS).filter((kind) => allowedKinds.includes(kind));
  const inRun = allowedKinds === undefined ? [] : Object.keys(IN_RUN_REPAIR_PATCH_VARIANTS).filter((kind) => allowedKinds.includes(kind));
  return [...kinds.map((kind) => RUNTIME_PATCH_VARIANTS[kind]!), ...inRun.map((kind) => IN_RUN_REPAIR_PATCH_VARIANTS[kind]!)];
}

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
 * to name a control whatever the evidence showed, and on a proposal-only run
 * that control had to be a target override with at least one handle -- which
 * is how every refusal task of the 2026-09-17 live campaign came back with one.
 *
 * `proposalOnly` is a `diagnose_and_adapt` run: exactly one target override,
 * proposed and never run, so it carries no `consequences`. `allowedKinds` is
 * the recovery plan's allowed patch kinds; absent, every kind is offered. When
 * it leaves no kind at all, the only shape offered is `no_repair`.
 */
export function automationStudioRuntimePatchOutputSchema(input: { proposalOnly: boolean; allowedKinds?: readonly string[] | undefined }): JsonSchema {
  const variants = runtimePatchVariantsFor(input.allowedKinds);
  if (!input.proposalOnly && variants.length === 0) return { oneOf: [NO_REPAIR_OUTPUT_SCHEMA] };
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
            : { type: "array", minItems: 1, maxItems: 100, items: { oneOf: variants } },
          riskLevel: { enum: ["low", "medium", "high", "destructive"] },
          metadata: JSON_METADATA_SCHEMA
        }
      },
      NO_REPAIR_OUTPUT_SCHEMA
    ]
  };
}
