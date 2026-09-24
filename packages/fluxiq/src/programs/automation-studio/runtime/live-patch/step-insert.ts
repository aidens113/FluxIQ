// A repair that inserts a step into the Flow a trial runs.
//
// **Trial only, and deliberately.** Durably inserting a step into a Flow is the
// extend-mode build plan's job (`flow-bootstrap/extend.ts`): a wrong answer is
// routed there, the model explores the live page, and the step it finds is
// written into the Flow through the same assembler and the same review that
// built the Flow in the first place. This kind briefly carried a durable form
// of its own, `insert_step_path`, and that was two routes to one capability --
// the duplication this codebase keeps having to undo. It was folded into the
// extend plan, and what is left here is what the word `temporary` always meant:
// a band-aid that lets the current run get past a step it is missing, which
// nothing promotes.
//
// `temporary_action_sequence` had no application at all: `live-patch.ts`
// refused it as `unapplied_patch_kind`, and the change-proposal kind it mapped
// to, `edit_recovery`, is refused outright as having no durable form. So the
// commonest way an instruction-built Flow fails -- every step succeeded and the
// answer is still wrong, because a step is missing -- had no patch kind whose
// repair could be attempted, let alone kept. Live run
// `run-mufvlasz-c83071f7` (2026-09-24) is the case: a catalog search Flow that
// navigated and extracted, never typed the query, and returned 23 records where
// 4 were expected.
//
// **The steps run before the node, not off its failed port.** That is the whole
// difference from `insert_deterministic_path`. The node a wrong answer names is
// the step the result came out of, and it *succeeded*, so a path wired to its
// `failed` port would never execute. Every edge that entered the node is
// re-pointed at the first inserted step, the steps chain into one another, and
// the last one enters the node. A node nothing entered is the graph's start, and
// after the insert the first step is -- still exactly one node nothing enters,
// so the start stays unambiguous and the run begins with the step that was
// missing.
//
// **The ids are derived, not invented.** The trial starts at the node the patch
// changed (`changedNodeForPatch`), and that caller cannot ask this one what it
// called the step. Deriving each id from the run and the step's position is
// what lets the two agree without passing ids around.

import type { JsonObject } from "../../../../core/index.ts";
import type { AutomationStudioFlowDocument } from "../../model/index.ts";
import type { AutomationStudioRuntimePatch } from "../llm/index.ts";

/** The node id an inserted step takes, derived so the trial, the record and the apply agree. */
export function automationStudioInsertedStepNodeId(runId: string, index: number): string {
  return `node.runtime-patch.${runId.trim().replace(/[^A-Za-z0-9_.-]/gu, "-")}.step-${index + 1}`;
}

/**
 * The patch applied to a throwaway copy of the Flow, so the trial runs the
 * repair rather than the Flow that produced the wrong answer.
 *
 * Refused, and said plainly, when the node the steps run before is not in this
 * Flow, or when an id the steps would take is already in use -- which would
 * replace a real step instead of adding one.
 */
export function applyAutomationStudioInsertedSteps(
  flow: AutomationStudioFlowDocument,
  patch: Extract<AutomationStudioRuntimePatch, { kind: "temporary_action_sequence" }>,
  runId: string
): { applied: true; flow: AutomationStudioFlowDocument } | { applied: false; reason: string } {
  const next: AutomationStudioFlowDocument = structuredClone(flow);
  const before = next.nodes.find((node) => node.id === patch.targetNodeId);
  if (!before) return { applied: false, reason: `target_node_absent:${patch.targetNodeId}` };
  const ids = patch.steps.map((_step, index) => automationStudioInsertedStepNodeId(runId, index));
  if (ids.some((id) => next.nodes.some((node) => node.id === id))) return { applied: false, reason: `step_node_id_in_use:${patch.targetNodeId}` };
  const position = before.position;
  for (const [index, step] of patch.steps.entries()) {
    next.nodes.push({
      id: ids[index]!,
      definitionId: step.definitionId,
      label: step.label ?? step.definitionId,
      description: patch.reason,
      ...(step.parameters ? { parameterValues: structuredClone(step.parameters) as JsonObject } : {}),
      ...(position ? { position: { x: position.x - STEP_X_OFFSET * (patch.steps.length - index), y: position.y } } : {}),
      metadata: { runtimePatchRunId: runId }
    });
  }
  const first = ids[0]!;
  for (const edge of next.edges) {
    if (edge.targetNodeId === patch.targetNodeId) edge.targetNodeId = first;
  }
  for (let index = 0; index + 1 < ids.length; index += 1) {
    next.edges.push({ id: `runtime-patch.${runId}.step.${index + 1}`, sourceNodeId: ids[index]!, sourcePortId: "success", targetNodeId: ids[index + 1]!, targetPortId: "in" });
  }
  next.edges.push({ id: `runtime-patch.${runId}.step.rejoin`, sourceNodeId: ids[ids.length - 1]!, sourcePortId: "success", targetNodeId: patch.targetNodeId, targetPortId: "in" });
  return { applied: true, flow: next };
}

/** Where an inserted step sits relative to the node it now runs before. */
const STEP_X_OFFSET = 320;
