export type InstructionDraft = { instructionId: string; title: string; body: string; scopeKind: string; routerId: string; subflowId: string; nodeId: string; errorTargetKind: "flow" | "subflow" | "node"; priority: number; requirement: string; status: string };

export function emptyInstructionDraft(): InstructionDraft {
  return { instructionId: "", title: "", body: "", scopeKind: "flow", routerId: "", subflowId: "", nodeId: "", errorTargetKind: "flow", priority: 50, requirement: "advisory", status: "active" };
}

export function instructionDraftIsDirty(draft: InstructionDraft, base: InstructionDraft): boolean {
  return JSON.stringify(draft) !== JSON.stringify(base);
}

const INSTRUCTION_SCOPE_ORDER = ["global", "project", "flow", "router", "subflow", "node", "on_error", "adaptation_review"] as const;

export function effectiveInstructionOrder(instructions: any[]): any[] {
  return [...instructions].filter((instruction) => instruction?.status === "active").sort((left, right) => {
    const leftRank = INSTRUCTION_SCOPE_ORDER.indexOf(left?.scope?.kind);
    const rightRank = INSTRUCTION_SCOPE_ORDER.indexOf(right?.scope?.kind);
    return leftRank - rightRank || Number(right?.priority ?? 0) - Number(left?.priority ?? 0) || Number(left?.updatedAt ?? 0) - Number(right?.updatedAt ?? 0) || String(left?.instructionId ?? "").localeCompare(String(right?.instructionId ?? ""));
  });
}
export type InstructionImportance = "low" | "normal" | "high" | "critical" | "custom";

export const INSTRUCTION_TEMPLATES = [
  { id: "flow-goal", label: "Flow goal", description: "Define the outcome this Flow should achieve.", title: "Flow goal", body: "Achieve the Flow outcome reliably while preserving the declared inputs, outputs, and safety constraints.", scopeKind: "flow", priority: 50, requirement: "advisory" },
  { id: "safety-constraint", label: "Safety constraint", description: "Add a rule the runtime must obey.", title: "Safety constraint", body: "Do not continue when the required safety condition cannot be verified. Stop and report the missing condition clearly.", scopeKind: "flow", priority: 90, requirement: "required" },
  { id: "error-recovery", label: "On-error behavior", description: "Guide recovery from runtime failures.", title: "Error recovery", body: "When an action fails, preserve the current state, explain the failure, and choose the safest valid recovery path.", scopeKind: "on_error", priority: 75, requirement: "required" },
  { id: "router-guidance", label: "Router guidance", description: "Clarify how runs should be routed.", title: "Routing guidance", body: "Choose the most specific eligible subflow. Use fallback behavior only when no route condition matches.", scopeKind: "router", priority: 75, requirement: "advisory" },
  { id: "subflow-rule", label: "Subflow rule", description: "Constrain one reusable subflow.", title: "Subflow rule", body: "Apply this guidance whenever the selected subflow runs, regardless of which route invoked it.", scopeKind: "subflow", priority: 50, requirement: "advisory" },
  { id: "node-guidance", label: "Node guidance", description: "Guide one action node precisely.", title: "Node guidance", body: "Before this node acts, verify its required inputs and produce only the outputs declared by the node contract.", scopeKind: "node", priority: 75, requirement: "advisory" },
  { id: "review-criteria", label: "Adaptation review", description: "Set criteria for reviewing adaptations.", title: "Adaptation review criteria", body: "Approve an adaptation only when its evidence is sufficient, validations pass, and the change remains within this Flow's safety constraints.", scopeKind: "adaptation_review", priority: 75, requirement: "required" }
] as const;

export function instructionImportance(priority: number): InstructionImportance {
  if (priority === 25) return "low";
  if (priority === 50) return "normal";
  if (priority === 75) return "high";
  if (priority === 90) return "critical";
  return "custom";
}

export function instructionPriorityForImportance(importance: Exclude<InstructionImportance, "custom">): number {
  return importance === "low" ? 25 : importance === "normal" ? 50 : importance === "high" ? 75 : 90;
}
export function instructionScopeTargetError(draft: InstructionDraft): string {
  if (draft.scopeKind === "router" && !draft.routerId) return "Choose the Flow Router.";
  if (draft.scopeKind === "subflow" && !draft.subflowId) return "Choose a subflow.";
  if (draft.scopeKind === "node" && !draft.nodeId) return "Choose a node.";
  if (draft.scopeKind === "on_error" && draft.errorTargetKind === "subflow" && !draft.subflowId) return "Choose the subflow whose errors this applies to.";
  if (draft.scopeKind === "on_error" && draft.errorTargetKind === "node" && !draft.nodeId) return "Choose the node whose errors this applies to.";
  if (draft.scopeKind === "adaptation_review" && draft.errorTargetKind === "subflow" && !draft.subflowId) return "Choose the reviewed subflow.";
  return "";
}

export function instructionScopeLabel(scope: unknown): string {
  const value = String(scope ?? "flow");
  return value === "on_error" ? "On error" : value === "adaptation_review" ? "Adaptation review" : value.charAt(0).toUpperCase() + value.slice(1);
}
export function instructionScopeTargetLabel(instruction: any): string {
  const scope = instruction?.scope ?? {};
  if (scope.nodeId) return String(scope.nodeName ?? scope.nodeId);
  if (scope.subflowId) return String(scope.subflowName ?? scope.subflowId);
  if (scope.routerId) return "Flow Router";
  return "Entire Flow";
}

export function instructionDraftFromInstruction(instruction: any | null): InstructionDraft {
  return {
    instructionId: instruction?.instructionId ?? "",
    title: instruction?.title ?? "",
    body: instruction?.body ?? "",
    scopeKind: instruction?.scope?.kind ?? "flow",
    routerId: instruction?.scope?.routerId ?? "",
    subflowId: instruction?.scope?.subflowId ?? "",
    nodeId: instruction?.scope?.nodeId ?? "",
    errorTargetKind: instruction?.scope?.nodeId ? "node" : instruction?.scope?.subflowId ? "subflow" : "flow",
    priority: Number.isFinite(Number(instruction?.priority)) ? Number(instruction.priority) : 50,
    requirement: instruction?.requirement === "required" ? "required" : "advisory",
    status: instruction?.status === "disabled" || instruction?.status === "archived" ? instruction.status : "active"
  };
}

export type InstructionDiagnostic = { severity: "info" | "warning" | "error"; code: string; title: string; message: string; instructionIds: string[] };

export function estimateInstructionTokens(instruction: any): number {
  return Math.ceil((String(instruction?.title ?? "").length + String(instruction?.body ?? "").length) / 4);
}

export function instructionDiagnosticScopeKey(instruction: any): string {
  const scope = instruction?.scope ?? {};
  return [scope.kind ?? "flow", scope.projectId ?? "", scope.flowId ?? "", scope.routerId ?? "", scope.subflowId ?? "", scope.nodeId ?? ""].join(":");
}

export function instructionDiagnostics(instructions: any[], tokenBudget = 2_000): InstructionDiagnostic[] {
  const active = instructions.filter((instruction) => instruction?.status !== "disabled" && instruction?.status !== "archived");
  const diagnostics: InstructionDiagnostic[] = [];
  const groups = new Map<string, any[]>();
  for (const instruction of active) {
    const key = instructionDiagnosticScopeKey(instruction);
    groups.set(key, [...(groups.get(key) ?? []), instruction]);
  }
  for (const items of groups.values()) {
    const required = items.filter((instruction) => instruction.requirement === "required");
    const always = required.filter((instruction) => /\balways\b/i.test(String(instruction.body ?? "")));
    const never = required.filter((instruction) => /\bnever\b/i.test(String(instruction.body ?? "")));
    if (always.length && never.length) diagnostics.push({ severity: "error", code: "instruction.conflict", title: "Required guidance conflicts", message: "This target has Required instructions containing both 'always' and 'never' directives. Resolve the conflict before relying on runtime behavior.", instructionIds: [...always, ...never].map((instruction) => String(instruction.instructionId ?? instruction.title)) });
  }
  const duplicateBodies = new Map<string, any[]>();
  for (const instruction of active) {
    const normalized = String(instruction.body ?? "").trim().replace(/\s+/g, " ").toLowerCase();
    if (normalized) duplicateBodies.set(normalized, [...(duplicateBodies.get(normalized) ?? []), instruction]);
  }
  for (const items of duplicateBodies.values()) if (items.length > 1) diagnostics.push({ severity: "warning", code: "instruction.duplicate", title: "Duplicate guidance", message: "The same instruction text appears more than once. Keep one authoritative copy to make precedence easier to understand.", instructionIds: items.map((instruction) => String(instruction.instructionId ?? instruction.title)) });
  const titledGroups = new Map<string, any[]>();
  for (const instruction of active) {
    const title = String(instruction.title ?? "").trim().toLowerCase();
    if (!title) continue;
    const key = instructionDiagnosticScopeKey(instruction) + ":" + title;
    titledGroups.set(key, [...(titledGroups.get(key) ?? []), instruction]);
  }
  for (const items of titledGroups.values()) {
    if (items.length < 2) continue;
    const ordered = [...items].sort((left, right) => Number(right.priority ?? 0) - Number(left.priority ?? 0));
    const shadowed = ordered.slice(1);
    diagnostics.push({ severity: "warning", code: "instruction.shadowed", title: "Lower-importance guidance may be shadowed", message: `Multiple instructions with this title target the same object. ${String(ordered[0]?.title ?? "The highest-importance instruction")} is applied first.`, instructionIds: shadowed.map((instruction) => String(instruction.instructionId ?? instruction.title)) });
  }
  for (const instruction of active) {
    const tokens = estimateInstructionTokens(instruction);
    if (tokens > 800) diagnostics.push({ severity: "warning", code: "instruction.large", title: "Instruction is unusually long", message: `${String(instruction.title ?? "This instruction")} uses about ${tokens} tokens and may crowd out other guidance.`, instructionIds: [String(instruction.instructionId ?? instruction.title)] });
  }
  const estimatedTokens = active.reduce((total, instruction) => total + estimateInstructionTokens(instruction), 0);
  if (estimatedTokens > tokenBudget) diagnostics.push({ severity: "error", code: "instruction.token_budget", title: "Effective guidance exceeds the context budget", message: `About ${estimatedTokens} tokens are active for a ${tokenBudget}-token instruction budget. Later guidance may be truncated or omitted.`, instructionIds: active.map((instruction) => String(instruction.instructionId ?? instruction.title)) });
  else if (estimatedTokens > tokenBudget * 0.8) diagnostics.push({ severity: "warning", code: "instruction.token_pressure", title: "Instruction budget is nearly full", message: `About ${estimatedTokens} of ${tokenBudget} instruction tokens are in use.`, instructionIds: active.map((instruction) => String(instruction.instructionId ?? instruction.title)) });
  return diagnostics;
}
