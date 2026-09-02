export type SubflowSettingsDraft = {
  name: string;
  description: string;
  role: "primary" | "site" | "screen" | "integration" | "recovery" | "fallback" | "utility";
  routeTags: string;
  localInstructionIds: string[];
  status: "active" | "disabled" | "archived";
  interventionModeOverride: "inherit" | "fully_adaptive" | "manual_approval" | "no_llm_intervention";
  inputMapping: Array<{ flowInputId: string; subflowInputId: string; required?: boolean }>;
  outputMapping: Array<{ subflowOutputId: string; flowOutputId: string; required?: boolean }>;
};

export function subflowSettingsErrors(draft: SubflowSettingsDraft, flowInputs: any[], flowOutputs: any[], subflowInputs: any[], subflowOutputs: any[]): string[] {
  const errors: string[] = [];
  if (!draft.name.trim()) errors.push("Subflow name is required.");
  const validate = (rows: Array<Record<string, any>>, leftKey: string, rightKey: string, leftPorts: any[], rightPorts: any[], label: string) => {
    const pairs = new Set<string>();
    for (const row of rows) {
      const left = leftPorts.find((port) => port.id === row[leftKey]);
      const right = rightPorts.find((port) => port.id === row[rightKey]);
      if (!left || !right) { errors.push(label + " mappings must choose existing named ports."); continue; }
      const pair = String(row[leftKey]) + ":" + String(row[rightKey]);
      if (pairs.has(pair)) errors.push(label + " mappings cannot contain duplicates.");
      pairs.add(pair);
      if (left.valueType?.kind && right.valueType?.kind && left.valueType.kind !== right.valueType.kind) errors.push(label + " mapping " + left.name + " to " + right.name + " uses incompatible types.");
    }
  };
  validate(draft.inputMapping, "flowInputId", "subflowInputId", flowInputs, subflowInputs, "Input");
  validate(draft.outputMapping, "subflowOutputId", "flowOutputId", subflowOutputs, flowOutputs, "Output");
  return [...new Set(errors)];
}

export function subflowSettingsOwnership(flow: any): { parentFlowId: string; subflowId: string } | null {
  const metadata = flow?.metadata;
  return metadata?.subflowGraph === true && typeof metadata.parentFlowId === "string" && typeof metadata.parentSubflowId === "string"
    ? { parentFlowId: metadata.parentFlowId, subflowId: metadata.parentSubflowId }
    : null;
}

export function subflowSettingsDraft(subflow: any): SubflowSettingsDraft {
  return {
    name: String(subflow?.name ?? ""),
    description: String(subflow?.description ?? ""),
    role: ["primary", "site", "screen", "integration", "recovery", "fallback", "utility"].includes(subflow?.role) ? subflow.role : "utility",
    routeTags: Array.isArray(subflow?.routeTags) ? subflow.routeTags.join(", ") : "",
    localInstructionIds: Array.isArray(subflow?.localInstructionIds) ? [...subflow.localInstructionIds] : [],
    status: subflow?.status === "disabled" || subflow?.status === "archived" ? subflow.status : "active",
    interventionModeOverride: subflow?.interventionModeOverride === "fully_adaptive" || subflow?.interventionModeOverride === "manual_approval" || subflow?.interventionModeOverride === "no_llm_intervention" ? subflow.interventionModeOverride : subflow?.proposalModeOverride === "manual" ? "manual_approval" : subflow?.proposalModeOverride === "auto" || subflow?.proposalModeOverride === "mixed" ? "fully_adaptive" : "inherit",
    inputMapping: Array.isArray(subflow?.inputMapping) ? subflow.inputMapping.map((mapping: any) => ({ ...mapping })) : [],
    outputMapping: Array.isArray(subflow?.outputMapping) ? subflow.outputMapping.map((mapping: any) => ({ ...mapping })) : []
  };
}

export function splitSettingsValues(value: string): string[] {
  return [...new Set(value.split(/[\n,]/).map((item) => item.trim()).filter(Boolean))];
}
