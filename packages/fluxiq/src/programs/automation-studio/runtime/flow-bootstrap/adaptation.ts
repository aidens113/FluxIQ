import { createHash } from "node:crypto";
import type { JsonObject } from "../../../../core/index.ts";
import {
  createBlankAutomationStudioFlowArtifact,
  type AutomationStudioFlowAdaptationValidationResult,
  type AutomationStudioFlowArtifact,
  type AutomationStudioFlowChangeOrigin,
  type AutomationStudioFlowExpansionReferences,
  type AutomationStudioFlowRouter,
  type AutomationStudioFlowSubflow
} from "../../model/index.ts";
import type {
  AutomationStudioFlowBuildPlan,
  AutomationStudioFlowBootstrapRisk
} from "./plan.ts";
import type {
  AutomationStudioActionDeclarationCrossCheck,
  AutomationStudioActionDeclarationRecord,
  AutomationStudioActionPermissionRequest,
  AutomationStudioInstructedConsequence
} from "../action-permissions/index.ts";
import type { AutomationStudioLlmEvidenceLoopTrace } from "../llm/index.ts";
import { isAutomationStudioAdaptationId, withAutomationStudioNodeAdaptationId } from "../flow-change/index.ts";

/**
 * `create` builds a whole topology on a blank Flow; `extend` only adds to an
 * existing one. A record written before modes existed has none: read it as
 * `create`.
 */
export type AutomationStudioBootstrapAdaptationMode = "create" | "extend";

/** A bootstrap change comes from an instruction, or from an edge case an existing Flow does not handle. */
export type AutomationStudioBootstrapAdaptationOrigin = Extract<AutomationStudioFlowChangeOrigin, { entryPoint: "instruction" | "edge_case" }>;

export type AutomationStudioBootstrapAdaptationStatus =
  | "proposed"
  | "validated"
  | "applied"
  | "rejected"
  | "reverted";

export type AutomationStudioBootstrapParentState = {
  metadata?: JsonObject;
  expansion?: AutomationStudioFlowExpansionReferences;
  updatedAt: number;
};

export type AutomationStudioBootstrapTopology = {
  router: AutomationStudioFlowRouter;
  subflows: Array<{
    subflow: AutomationStudioFlowSubflow;
    graphFlow: AutomationStudioFlowArtifact;
  }>;
};

export type AutomationStudioBootstrapApplication = {
  appliedAt: number;
  appliedBy: string;
  appliedDependencyDigest: string;
  parentBefore: AutomationStudioBootstrapParentState;
};

export type AutomationStudioBootstrapAccounting = {
  requestId: string;
  estimatedInputTokens: number;
  provider?: string;
  model?: string;
  inputTokens?: number;
  outputTokens?: number;
  totalTokens?: number;
  estimatedCostUsd?: number;
};

export type AutomationStudioBootstrapAuditEvent = {
  eventId: string;
  adaptationId: string;
  eventType: "created" | "approved" | "rejected" | "applied" | "rollback";
  actorId: string | null;
  fromStatus: AutomationStudioBootstrapAdaptationStatus | null;
  toStatus: AutomationStudioBootstrapAdaptationStatus | null;
  reason: string;
  detail: JsonObject;
  detailObjectId: null;
  createdAt: number;
};

export type AutomationStudioBootstrapAdaptation = {
  schemaVersion: "0.1";
  kind: "flow_bootstrap";
  adaptationId: string;
  projectId: string;
  flowId: string;
  baseDependencyDigest: string;
  baseSettingsRevision: number;
  sourceInstructionIds: string[];
  /** Absent on records written before modes existed: read as `create`. */
  mode?: AutomationStudioBootstrapAdaptationMode;
  /** Absent on records written before origins existed; `upgradeAutomationStudioBootstrapAdaptation` derives it. */
  origin?: AutomationStudioBootstrapAdaptationOrigin;
  /** Trials of the proposed topology and replays of the applied one. */
  validationResults?: AutomationStudioFlowAdaptationValidationResult[];
  summary: string;
  riskLevel: AutomationStudioFlowBootstrapRisk;
  accounting?: AutomationStudioBootstrapAccounting;
  evidenceTrace?: AutomationStudioLlmEvidenceLoopTrace[];
  reusableContext?: JsonObject;
  /**
   * What the person's instruction was read to ask for, when the build met an
   * action with a lasting consequence. Copied to the Flow on apply, where a
   * run reads it without a model while each instruction's text is unchanged.
   */
  instructedConsequences?: AutomationStudioInstructedConsequence[];
  /**
   * What every action of the build declared about itself, in the order the gate
   * was asked, with Core's answer beside each. A permitted declaration used to
   * be discarded where it was read, so what a step said it would do could only
   * be deduced from the absence of a refusal.
   */
  declaredConsequences?: AutomationStudioActionDeclarationRecord[];
  /**
   * Those declarations held against what the person's instruction was read as
   * asking for. `verdict: "undeclared"` is the contradiction nothing else
   * catches: the instruction plainly asks for something lasting and not one
   * action said it would cause it. It refuses nothing -- the instruction is the
   * authority for permitting, so nothing was bypassed -- and it is here so the
   * person approving this Flow approves it in sight of the contradiction.
   */
  consequenceCrossCheck?: AutomationStudioActionDeclarationCrossCheck;
  /**
   * The permission request a build raised and finished anyway.
   *
   * An exploration step the build was not permitted is recoverable: the model
   * routes around it and may still propose a Flow. The request it raised comes
   * with the proposal, because the person has still not answered it, and a
   * replay runs with no gate at all -- so nothing here may be approved or
   * applied while it is present. Answering it means issuing the next build's
   * grant with the classes it lists as `missing`.
   */
  permissionRequest?: AutomationStudioActionPermissionRequest;
  buildPlan: AutomationStudioFlowBuildPlan;
  topology: AutomationStudioBootstrapTopology;
  status: AutomationStudioBootstrapAdaptationStatus;
  createdAt: number;
  updatedAt: number;
  auditEvents: AutomationStudioBootstrapAuditEvent[];
  application?: AutomationStudioBootstrapApplication;
  revert?: { revertedAt: number; revertedBy: string };
};

export function normalizeAutomationStudioFlowBuildPlan(input: {
  adaptationId: string;
  parentFlow: AutomationStudioFlowArtifact;
  buildPlan: AutomationStudioFlowBuildPlan;
  sourceInstructionIds: string[];
  now: number;
}): AutomationStudioBootstrapTopology {
  const namespace = createHash("sha256").update(input.adaptationId).digest("hex").slice(0, 16);
  const subflowIds = new Map(input.buildPlan.subflows.map((entry) => [
    entry.key,
    `subflow.bootstrap.${namespace}.${entry.key}`
  ]));
  const routerId = `router.bootstrap.${namespace}`;
  const subflows = input.buildPlan.subflows.map((entry) => {
    const subflowId = subflowIds.get(entry.key)!;
    const graphFlowId = `${input.parentFlow.flowId}.bootstrap.${namespace}.${entry.key}.graph`;
    const primary = entry.role === "primary";
    const graphFlow = createBlankAutomationStudioFlowArtifact({
      flowId: graphFlowId,
      projectId: input.parentFlow.projectId,
      name: `${entry.name} Graph`,
      scope: input.parentFlow.scope,
      description: `Instruction-built graph for ${entry.name}.`,
      origin: "manual",
      now: input.now,
      metadata: {
        parentFlowId: input.parentFlow.flowId,
        parentSubflowId: subflowId,
        subflowGraph: true,
        bootstrapAdaptationId: input.adaptationId,
        bootstrapSymbolicKey: entry.key
      }
    });
    const nodeIds = new Map(entry.nodes.map((node) => [
      node.key,
      `node.bootstrap.${namespace}.${entry.key}.${node.key}`
    ]));
    const materializedGraph: AutomationStudioFlowArtifact = {
      ...graphFlow,
      interface: primary ? structuredClone(input.parentFlow.interface) : { inputs: [], outputs: [] },
      nodes: entry.nodes.map((node) => ({
        id: nodeIds.get(node.key)!,
        definitionId: node.definitionId,
        definitionVersion: node.definitionVersion,
        ...(node.parameters ? { parameterValues: structuredClone(node.parameters) } : {}),
        position: { ...node.position },
        // `adaptationIds` is the neutral provenance every change stamps on the
        // nodes it writes; `bootstrapAdaptationId` stays for ownership checks.
        metadata: withAutomationStudioNodeAdaptationId({
          bootstrapAdaptationId: input.adaptationId,
          bootstrapSymbolicKey: node.key,
          ...(node.outputActionId ? { outputActionId: node.outputActionId } : {})
        }, input.adaptationId)
      })),
      edges: entry.edges.map((edge) => ({
        id: `edge.bootstrap.${namespace}.${entry.key}.${edge.key}`,
        sourceNodeId: nodeIds.get(edge.source.nodeKey)!,
        targetNodeId: nodeIds.get(edge.target.nodeKey)!,
        sourcePortId: edge.source.portId,
        targetPortId: edge.target.portId,
        metadata: {
          bootstrapAdaptationId: input.adaptationId,
          bootstrapSymbolicKey: edge.key
        }
      }))
    };
    const subflow: AutomationStudioFlowSubflow = {
      schemaVersion: "0.1",
      subflowId,
      flowId: input.parentFlow.flowId,
      projectId: input.parentFlow.projectId,
      name: entry.name,
      role: entry.role,
      status: "active",
      graphFlowId,
      ...(primary && input.parentFlow.interface.inputs.length ? {
        inputMapping: input.parentFlow.interface.inputs.map((port) => ({
          flowInputId: port.id,
          subflowInputId: port.id,
          ...(port.required ? { required: true } : {})
        }))
      } : {}),
      ...(primary && input.parentFlow.interface.outputs.length ? {
        outputMapping: input.parentFlow.interface.outputs.map((port) => ({
          subflowOutputId: port.id,
          flowOutputId: port.id,
          ...(port.required ? { required: true } : {})
        }))
      } : {}),
      ...(input.sourceInstructionIds.length ? { localInstructionIds: [...input.sourceInstructionIds] } : {}),
      createdAt: input.now,
      updatedAt: input.now,
      stability: { runCount: 0, successCount: 0, failureCount: 0 },
      metadata: {
        bootstrapAdaptationId: input.adaptationId,
        bootstrapSymbolicKey: entry.key
      }
    };
    return { subflow, graphFlow: materializedGraph };
  });
  const routeTagsBySubflow = new Map<string, Set<string>>();
  for (const rule of input.buildPlan.plan.router.rules) {
    const tags = routeTagsBySubflow.get(rule.targetSubflowKey) ?? new Set<string>();
    rule.routeTags.forEach((tag) => tags.add(tag));
    routeTagsBySubflow.set(rule.targetSubflowKey, tags);
  }
  for (const entry of subflows) {
    const symbolic = String(entry.subflow.metadata?.bootstrapSymbolicKey ?? "");
    const routeTags = [...(routeTagsBySubflow.get(symbolic) ?? [])].sort();
    if (routeTags.length) entry.subflow.routeTags = routeTags;
  }
  const router: AutomationStudioFlowRouter = {
    schemaVersion: "0.1",
    routerId,
    flowId: input.parentFlow.flowId,
    projectId: input.parentFlow.projectId,
    name: input.buildPlan.plan.router.name,
    rules: input.buildPlan.plan.router.rules.map((rule, index) => ({
      schemaVersion: "0.1",
      ruleId: `route.bootstrap.${namespace}.${rule.key}`,
      routerId,
      name: rule.name,
      target: { kind: "subflow", subflowId: subflowIds.get(rule.targetSubflowKey)! },
      order: index * 10,
      status: "active",
      // The rule's whole meaning. A rule written without it always held, so
      // a router with one never reached a second Subflow or its fallback.
      ...(rule.condition ? { condition: structuredClone(rule.condition) } : {}),
      createdAt: input.now,
      updatedAt: input.now,
      metadata: {
        bootstrapAdaptationId: input.adaptationId,
        bootstrapSymbolicKey: rule.key,
        routeTags: [...rule.routeTags]
      }
    })),
    fallback: input.buildPlan.plan.router.fallback.kind === "subflow"
      ? { kind: "subflow", subflowId: subflowIds.get(input.buildPlan.plan.router.fallback.targetSubflowKey)! }
      : { kind: "fail", message: "No instruction-built route matched." },
    status: "active",
    createdAt: input.now,
    updatedAt: input.now,
    metadata: { bootstrapAdaptationId: input.adaptationId }
  };
  return { router, subflows };
}

/**
 * A stored Flow Bootstrap adaptation in the current shape. A record written
 * before modes, origins and node provenance existed reads as a `create` from
 * its source instructions, and each node it owns gains the `adaptationIds`
 * normalization now stamps. Apply compares the stored topology with a fresh
 * normalization, so a record read from storage must pass through here before
 * it is applied. Idempotent; returns a copy and never changes its argument.
 */
export function upgradeAutomationStudioBootstrapAdaptation(adaptation: AutomationStudioBootstrapAdaptation): AutomationStudioBootstrapAdaptation {
  const upgraded = structuredClone(adaptation);
  if (upgraded.mode === undefined) upgraded.mode = "create";
  if (upgraded.origin === undefined && upgraded.sourceInstructionIds.length) {
    upgraded.origin = { entryPoint: "instruction", instructionIds: [...upgraded.sourceInstructionIds] };
  }
  // An id Core could not have minted cannot be stamped; such a record cannot
  // match a fresh normalization either, so apply refuses it as before.
  if (!isAutomationStudioAdaptationId(upgraded.adaptationId)) return upgraded;
  for (const entry of upgraded.topology.subflows) {
    entry.graphFlow.nodes = entry.graphFlow.nodes.map((node) => node.metadata?.bootstrapAdaptationId === upgraded.adaptationId
      ? { ...node, metadata: withAutomationStudioNodeAdaptationId(node.metadata, upgraded.adaptationId) }
      : node);
  }
  return upgraded;
}

/**
 * Refuses a Bootstrap adaptation whose permission request the person has not
 * granted.
 *
 * The build proposed a Flow while one of its steps needed a person's word, so
 * the Flow may contain a step nobody permitted -- and a saved Flow replays with
 * no gate in front of it, by design, because a replay has no model.
 *
 * `answer` is how the ask the build opened was settled, which is where the
 * person's word actually lives: the request's own `requestId` is the ask's id,
 * so the question the build asked is the question that releases it. Nothing,
 * or a refusal, holds the adaptation; the way past it is then a new build under
 * a grant carrying the missing classes, not an approval that skips the
 * question.
 */
export function assertAutomationStudioBootstrapPermissionRequestAnswered(
  adaptation: AutomationStudioBootstrapAdaptation,
  answer?: string | null
): void {
  const request = adaptation.permissionRequest;
  if (!request || answer === "grant") return;
  const state = answer === "deny" ? "was refused" : "has not been answered";
  throw new Error(`FLOW_BOOTSTRAP_PERMISSION_REQUIRED: this build needs permission that ${state} (${request.requestId}): ${request.sentence}`);
}

export function assertAutomationStudioBootstrapHasNoRecordingProvenance(value: unknown): void {
  const stack: unknown[] = [value];
  const seen = new Set<object>();
  while (stack.length) {
    const current = stack.pop();
    if (!current || typeof current !== "object" || seen.has(current as object)) continue;
    seen.add(current as object);
    for (const [key, child] of Object.entries(current as Record<string, unknown>)) {
      if (/recording|timeline/i.test(key)) throw new Error("Bootstrap Adaptations cannot contain recording or timeline provenance.");
      stack.push(child);
    }
  }
}
