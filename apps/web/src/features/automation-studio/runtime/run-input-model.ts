export type AutomationRuntimeRunMode = "fully_adaptive" | "manual_approval" | "no_llm_intervention";

export type RuntimeRunInputDocument =
  | { ok: true; value: Record<string, any> }
  | { ok: false; error: string };

export function createRuntimeReadinessRequestGate() {
  let generation = 0;
  return {
    begin: () => ++generation,
    invalidate: () => { generation += 1; },
    isCurrent: (candidate: number) => candidate === generation
  };
}

export function parseRuntimeRunInputDocument(inputText: string): RuntimeRunInputDocument {
  try {
    const parsed = inputText.trim() ? JSON.parse(inputText) : {};
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      return { ok: false, error: "Advanced inputs must be a JSON object." };
    }
    return { ok: true, value: parsed as Record<string, any> };
  } catch {
    return { ok: false, error: "Advanced inputs contain invalid JSON." };
  }
}

export function buildAutomationRuntimeRunPayload(input: {
  projectId: string | null;
  flowId?: string;
  mode: AutomationRuntimeRunMode;
  inputText: string;
  maxSteps: string;
}): { ok: true; payload: any } | { ok: false; error: string } {
  if (!input.projectId || !input.flowId) return { ok: false, error: "Select a Flow before running." };
  const inputDocument = parseRuntimeRunInputDocument(input.inputText);
  if (!inputDocument.ok) return { ok: false, error: inputDocument.error };
  const maxSteps = input.maxSteps.trim() ? Number(input.maxSteps) : undefined;
  if (maxSteps !== undefined && (!Number.isInteger(maxSteps) || maxSteps <= 0)) return { ok: false, error: "Max steps must be a positive whole number." };
  return { ok: true, payload: { projectId: input.projectId, flowId: input.flowId, inputs: inputDocument.value, adaptiveMode: input.mode, ...(maxSteps !== undefined ? { maxSteps } : {}) } };
}

export function runtimeFlowInputPorts(flow: any): any[] {
  if (Array.isArray(flow?.interface?.inputs)) return flow.interface.inputs.filter((port: any) => port && typeof port.id === "string" && typeof port.name === "string").slice(0, 50);
  return [];
}

export function runtimeTypedInputError(port: any, value: unknown): string {
  if (value === undefined || value === null || value === "") return port.required && port.defaultValue === undefined ? port.name + " is required." : "";
  const kind = port.valueType?.kind ?? "json";
  if (kind === "string" && typeof value !== "string") return port.name + " must be text.";
  if (kind === "number" && (typeof value !== "number" || !Number.isFinite(value))) return port.name + " must be a number.";
  if (kind === "boolean" && typeof value !== "boolean") return port.name + " must be Yes or No.";
  if (kind === "json" && typeof value === "string") { try { JSON.parse(value); } catch { return port.name + " must be valid structured data."; } }
  return "";
}

export function runtimeTypedInputErrors(flow: any, values: Record<string, any>): string[] {
  return runtimeFlowInputPorts(flow).map((port) => runtimeTypedInputError(port, values[port.id])).filter(Boolean);
}

export type RuntimeReadinessIssue = { label: string; action: string; target: "instructions" | "router" | "nodes" | "subflows" };

export function runtimeFlowReadinessIssues(flow: any, context: { instructions: any[]; router: any | null; subflowTotal: number; error: string }): RuntimeReadinessIssue[] {
  const issues: RuntimeReadinessIssue[] = [];
  if (context.error) return issues;
  if (!context.instructions.some((instruction) => instruction.status === "active")) issues.push({ label: "Add at least one active instruction.", action: "Open Instructions", target: "instructions" });
  const hasGraph = (flow?.nodes?.length ?? 0) > 0;
  const hasRoute = (context.router?.rules?.some((rule: any) => rule.status === "active") ?? false) || Boolean(context.router?.fallback);
  if (!hasGraph && context.subflowTotal === 0) {
    issues.push({ label: "Add runnable Nodes or create a subflow.", action: "Open Subflows", target: "subflows" });
  } else if (!hasGraph && !hasRoute) {
    issues.push({ label: "Connect an active Router path to a subflow.", action: "Open Router", target: "router" });
  }
  return issues;
}

export function runtimeRunInputValues(inputText: string): Record<string, any> {
  const parsed = parseRuntimeRunInputDocument(inputText);
  return parsed.ok ? parsed.value : {};
}

export function updateRuntimeRunInputText(inputText: string, key: string, value: unknown): string {
  let parsed: Record<string, any> = {};
  try {
    const current = inputText.trim() ? JSON.parse(inputText) : {};
    if (current && typeof current === "object" && !Array.isArray(current)) parsed = current;
  } catch { parsed = {}; }
  if (value === undefined) delete parsed[key]; else parsed[key] = value;
  return JSON.stringify(parsed);
}
