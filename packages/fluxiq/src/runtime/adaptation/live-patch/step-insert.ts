// A repair that inserts a step into the Flow a trial runs.
//
// **Kept only after a judged whole run.** A wrong answer that names no fault in
// the words a re-author route takes reaches the patch ladder, and the ladder's
// fix for a missing step is this one. It used to be "trial only": its durable
// kind was `edit_recovery`, which neither a candidate nor an apply could write,
// so a trial that read the right answer led nowhere. Live run
// `run-mw0jw263-0251c104` read all 10 expected rows in such a trial and ended
// failed on its first pass's 3. A trial that passes now holds the patch for the
// judged re-run its Flow is owed, on the candidate this file writes, and the
// patch is kept as `insert_steps` only when that run is judged to answer
// (`service/runtime-adaptation/judged-promotion.ts`).
//
// The commonest way an instruction-built Flow fails is every step succeeding and
// the answer still being wrong, because a step is missing. Live run
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

import type { JsonObject } from "../../../core/index.ts";
import { AUTOMATION_STUDIO_DECLARED_CONSEQUENCES_METADATA_KEY } from "../../../framework/automation-service/executor/index.ts";
import type { AutomationStudioFlowDocument } from "../../../flows/authoring/model/index.ts";
import type { AutomationStudioRuntimePatch } from "../../llm/index.ts";

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
      // A declared consequence travels with the step, so a later run reads the same statement the person was asked about.
      metadata: { runtimePatchRunId: runId, ...(patch.consequences?.length ? { [AUTOMATION_STUDIO_DECLARED_CONSEQUENCES_METADATA_KEY]: [...patch.consequences] } : {}) }
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
