export type AutomationRuntimeRunMode = "default" | "manual_approval" | "deterministic";

export function buildAutomationRuntimeRunPayload(input: {
  projectId: string | null;
  flowId?: string;
  mode: AutomationRuntimeRunMode;
  inputText: string;
  maxSteps: string;
}): { ok: true; payload: any } | { ok: false; error: string } {
  if (!input.projectId || !input.flowId) return { ok: false, error: "Select a Flow before running." };
  let parsedInputs: any = {};
  try {
    parsedInputs = input.inputText.trim() ? JSON.parse(input.inputText) : {};
  } catch {
    return { ok: false, error: "Inputs must be valid JSON." };
  }
  if (!parsedInputs || typeof parsedInputs !== "object" || Array.isArray(parsedInputs)) return { ok: false, error: "Inputs must be a JSON object." };
  const maxSteps = input.maxSteps.trim() ? Number(input.maxSteps) : undefined;
  if (maxSteps !== undefined && (!Number.isInteger(maxSteps) || maxSteps <= 0)) return { ok: false, error: "Max steps must be a positive whole number." };
  return { ok: true, payload: { projectId: input.projectId, flowId: input.flowId, inputs: parsedInputs, adaptiveMode: input.mode, ...(maxSteps !== undefined ? { maxSteps } : {}) } };
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

export type RuntimeReadinessIssue = { label: string; action: string; target: "problems" | "instructions" | "router" | "nodes"; href?: never };

export function runtimeFlowReadinessIssues(flow: any, context: { instructions: any[]; router: any | null; subflowTotal: number; error: string }): RuntimeReadinessIssue[] {
  const issues: RuntimeReadinessIssue[] = [];
  if (context.error) issues.push({ label: "Readiness data could not be loaded.", action: "Open Problems", target: "problems" });
  if (!context.instructions.some((instruction) => instruction.status === "active")) issues.push({ label: "Add at least one active instruction.", action: "Open Instructions", target: "instructions" });
  const hasGraph = (flow?.nodes?.length ?? 0) > 0;
  const hasRoute = (context.router?.rules?.some((rule: any) => rule.status === "active") ?? false) || Boolean(context.router?.fallback);
  if (!hasGraph && !(context.subflowTotal > 0 && hasRoute)) {
    const needsRouter = context.subflowTotal > 0;
    issues.push({ label: "Add runnable Nodes or an active Router path.", action: needsRouter ? "Open Router" : "Open Nodes", target: needsRouter ? "router" : "nodes" });
  }
  return issues;
}

export function runtimeRunInputValues(inputText: string): Record<string, any> {
  try {
    const parsed = inputText.trim() ? JSON.parse(inputText) : {};
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return {};
    return parsed as Record<string, any>;
  } catch { return {}; }
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
