// Before/after comparison for a Flow Bootstrap adaptation: what the proposal
// would change in the Flow as it stands now. Pure, so the Changes tab and its
// tests read the same answer.
//
// Core projects a bootstrap as one `edit_router` patch entry and one
// `create_subflow` entry per Subflow. An `extend` keeps the existing Router,
// Subflow and graph-Flow ids, so an id that matches the Flow's current
// topology is a change to something that exists and a new id is an addition.
// `metadata.bootstrap.mode` and `after.steps` are honoured when Core sends
// them; without them the comparison falls back to ids and counts.

export type ChangeDiffStep = { nodeId: string; label?: string; type?: string };

export type ChangeDiffCurrentSubflow = {
  subflowId: string;
  name: string;
  graphFlowId?: string;
  nodeCount?: number;
  edgeCount?: number;
  /** Absent when the Subflow's graph Flow was not read; never an empty stand-in. */
  nodes?: ChangeDiffStep[];
};

export type ChangeDiffTopology = {
  router: { routerId: string; ruleCount: number; name?: string } | null;
  subflows: ChangeDiffCurrentSubflow[];
};

export type ChangeDiffMeasures = {
  name?: string;
  ruleCount?: number;
  fallbackKind?: string;
  graphFlowId?: string;
  role?: string;
  nodeCount?: number;
  edgeCount?: number;
};

export type ChangeDiffSteps = { added: ChangeDiffStep[]; removed: ChangeDiffStep[]; kept: ChangeDiffStep[] };

/** `unknown`: the Flow's current topology could not be read, so an extend cannot say what it replaces. */
export type ChangeDiffStatus = "added" | "changed" | "unchanged" | "unknown";

export type ChangeDiffRow = {
  targetKind: "router" | "subflow";
  targetId: string;
  label: string;
  status: ChangeDiffStatus;
  before?: ChangeDiffMeasures;
  after: ChangeDiffMeasures;
  steps?: ChangeDiffSteps;
};

export type ChangeDiffMode = "create" | "extend";

const record = (value: unknown): Record<string, any> => (value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, any> : {});
const text = (value: unknown): string | undefined => (typeof value === "string" && value.trim() ? value : undefined);
const count = (value: unknown): number | undefined => (typeof value === "number" && Number.isFinite(value) ? value : undefined);

function measures(source: Record<string, unknown>): ChangeDiffMeasures {
  const out: ChangeDiffMeasures = {};
  for (const key of ["name", "fallbackKind", "graphFlowId", "role"] as const) {
    const value = text(source[key]);
    if (value !== undefined) out[key] = value;
  }
  for (const key of ["ruleCount", "nodeCount", "edgeCount"] as const) {
    const value = count(source[key]);
    if (value !== undefined) out[key] = value;
  }
  return out;
}

function stepList(value: unknown): ChangeDiffStep[] | undefined {
  if (!Array.isArray(value)) return undefined;
  const steps: ChangeDiffStep[] = [];
  for (const item of value) {
    const entry = record(item);
    const nodeId = text(entry.nodeId);
    if (!nodeId) continue;
    const label = text(entry.label);
    const type = text(entry.type);
    steps.push({ nodeId, ...(label ? { label } : {}), ...(type ? { type } : {}) });
  }
  return steps;
}

/** True for an adaptation Core projected from a Flow Bootstrap record. */
export function isFlowBootstrapAdaptation(adaptation: unknown): boolean {
  return record(record(adaptation).metadata).adaptationKind === "flow_bootstrap";
}

/**
 * Whether the adaptation builds a new automation or improves the existing one.
 * `metadata.bootstrap.mode` wins; without it, an id shared with the current
 * topology means extend. With no mode and no readable topology, `undefined`.
 */
export function flowChangeDiffMode(adaptation: unknown, current: ChangeDiffTopology | null): ChangeDiffMode | undefined {
  const declared = record(record(record(adaptation).metadata).bootstrap).mode;
  if (declared === "create" || declared === "extend") return declared;
  if (!current) return undefined;
  const ids = new Set<string>([...(current.router ? [current.router.routerId] : []), ...current.subflows.map((subflow) => subflow.subflowId)]);
  const patch = Array.isArray(record(adaptation).patch) ? record(adaptation).patch as unknown[] : [];
  return patch.some((entry) => { const id = text(record(entry).targetId); return id !== undefined && ids.has(id); }) ? "extend" : "create";
}

function sameMeasures(before: ChangeDiffMeasures, after: ChangeDiffMeasures): boolean {
  return (Object.keys(after) as (keyof ChangeDiffMeasures)[]).every((key) => before[key] === undefined || before[key] === after[key]);
}

function diffSteps(proposed: ChangeDiffStep[], existing: ChangeDiffStep[]): { steps: ChangeDiffSteps; relabelled: boolean } {
  const existingById = new Map(existing.map((step) => [step.nodeId, step]));
  const proposedIds = new Set(proposed.map((step) => step.nodeId));
  const steps: ChangeDiffSteps = { added: [], removed: [], kept: [] };
  let relabelled = false;
  for (const step of proposed) {
    const prior = existingById.get(step.nodeId);
    if (!prior) { steps.added.push(step); continue; }
    steps.kept.push(step);
    if ((step.label !== undefined && step.label !== prior.label) || (step.type !== undefined && step.type !== prior.type)) relabelled = true;
  }
  for (const step of existing) if (!proposedIds.has(step.nodeId)) steps.removed.push(step);
  return { steps, relabelled };
}

/**
 * One row per Router or Subflow the adaptation touches, with what exists now
 * (`before`) beside what the adaptation proposes (`after`). `current` is null
 * when the Flow's topology could not be read.
 */
export function flowChangeDiffRows(adaptation: unknown, current: ChangeDiffTopology | null): ChangeDiffRow[] {
  const mode = flowChangeDiffMode(adaptation, current);
  const patch = Array.isArray(record(adaptation).patch) ? record(adaptation).patch as unknown[] : [];
  const rows: ChangeDiffRow[] = [];
  const statusWithoutCurrent: ChangeDiffStatus = mode === "create" ? "added" : "unknown";
  for (const item of patch) {
    const entry = record(item);
    const after = record(entry.after);
    if (entry.kind === "edit_router") {
      const targetId = text(after.routerId) ?? text(entry.targetId) ?? "router";
      const row: ChangeDiffRow = { targetKind: "router", targetId, label: text(after.name) ?? "Router", status: statusWithoutCurrent, after: measures(after) };
      if (current && mode !== "create") {
        const existing = current.router && current.router.routerId === targetId ? current.router : null;
        if (existing) {
          row.before = { ruleCount: existing.ruleCount, ...(existing.name ? { name: existing.name } : {}) };
          row.status = sameMeasures(row.before, row.after) ? "unchanged" : "changed";
        } else row.status = "added";
      } else if (current) row.status = "added";
      rows.push(row);
      continue;
    }
    if (entry.kind !== "create_subflow" && entry.kind !== "edit_subflow") continue;
    const targetId = text(after.subflowId) ?? text(entry.targetId) ?? "subflow";
    const proposedSteps = stepList(after.steps);
    const row: ChangeDiffRow = { targetKind: "subflow", targetId, label: text(after.name) ?? targetId, status: statusWithoutCurrent, after: measures(after) };
    const existing = current && mode !== "create" ? current.subflows.find((subflow) => subflow.subflowId === targetId) : undefined;
    if (existing) {
      const before: ChangeDiffMeasures = { name: existing.name };
      if (existing.graphFlowId) before.graphFlowId = existing.graphFlowId;
      if (existing.nodeCount !== undefined) before.nodeCount = existing.nodeCount;
      if (existing.edgeCount !== undefined) before.edgeCount = existing.edgeCount;
      row.before = before;
      let changed = !sameMeasures(before, row.after);
      if (proposedSteps && existing.nodes) {
        const { steps, relabelled } = diffSteps(proposedSteps, existing.nodes);
        row.steps = steps;
        if (steps.added.length || steps.removed.length || relabelled) changed = true;
      }
      row.status = changed ? "changed" : "unchanged";
    } else {
      if (current || mode === "create") row.status = "added";
      if (proposedSteps && row.status === "added") row.steps = { added: proposedSteps, removed: [], kept: [] };
    }
    rows.push(row);
  }
  return rows;
}
