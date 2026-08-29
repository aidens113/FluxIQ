export type AdaptationChangedField = { path: string; before: string; after: string };

export function adaptationChangedFields(before: unknown, after: unknown, limit = 50): AdaptationChangedField[] {
  const fields: AdaptationChangedField[] = [];
  const isRecord = (value: unknown): value is Record<string, unknown> => Boolean(value) && typeof value === "object" && !Array.isArray(value);
  const display = (value: unknown): string => {
    if (value === undefined) return "Not set";
    if (value === null) return "None";
    if (typeof value === "string") return value || "Empty";
    if (typeof value === "boolean") return value ? "Yes" : "No";
    if (typeof value === "number") return String(value);
    try { return JSON.stringify(value); } catch { return String(value); }
  };
  const visit = (left: unknown, right: unknown, path: string) => {
    if (fields.length >= limit || JSON.stringify(left) === JSON.stringify(right)) return;
    if (isRecord(left) || isRecord(right)) {
      const leftRecord = isRecord(left) ? left : {};
      const rightRecord = isRecord(right) ? right : {};
      const keys = [...new Set([...Object.keys(leftRecord), ...Object.keys(rightRecord)])].sort();
      if (keys.length) {
        for (const key of keys) visit(leftRecord[key], rightRecord[key], path ? path + "." + key : key);
        return;
      }
    }
    fields.push({ path: path || "Value", before: display(left), after: display(right) });
  };
  visit(before, after, "");
  return fields;
}

export type AdaptationObjectTarget = {
  view: "router" | "subflows" | "instructions" | "nodes" | "adaptation-detail" | "runtime" | "recording";
  targetId?: string;
  label: string;
};

export function adaptationObjectTarget(kind: string, targetId?: string): AdaptationObjectTarget {
  if (kind === "edit_router") return { view: "router", label: "Open Router" };
  if (kind === "create_subflow" || kind === "edit_subflow" || kind === "edit_recovery") return { view: "subflows", ...(targetId ? { targetId } : {}), label: "Open Subflows" };
  if (kind === "edit_instruction") return { view: "instructions", ...(targetId ? { targetId } : {}), label: "Open Instructions" };
  if (kind === "edit_expectation" || kind === "edit_action_target") return { view: "nodes", ...(targetId ? { targetId } : {}), label: "Open Node" };
  return { view: "adaptation-detail", label: "Open Adaptations" };
}

export type AdaptationReviewAction = "approve" | "reject" | "apply" | "disable" | "revert" | "supersede" | "request_validation" | "switch_manual";

export function adaptationReviewActions(status: string): AdaptationReviewAction[] {
  if (status === "proposed") return ["approve", "reject", "request_validation", "switch_manual"];
  if (status === "testing") return ["approve", "reject", "request_validation", "switch_manual"];
  if (status === "validated") return ["apply", "reject", "disable", "supersede", "request_validation", "switch_manual"];
  if (status === "applied") return ["revert"];
  return [];
}

export function adaptationReviewCopy(action: AdaptationReviewAction): { title: string; description: string; label: string; danger: boolean } {
  const copy: Record<AdaptationReviewAction, { title: string; description: string; label: string; danger: boolean }> = {
    approve: { title: "Approve Adaptation", description: "Mark this adaptation as validated and ready for application.", label: "Approve", danger: false },
    reject: { title: "Reject Adaptation", description: "Close this candidate without applying its changes. A reason is required.", label: "Reject", danger: true },
    apply: { title: "Apply Adaptation", description: "Apply the validated changes to their owning Flow objects.", label: "Apply Changes", danger: false },
    disable: { title: "Disable Adaptation", description: "Prevent this validated adaptation from being applied.", label: "Disable", danger: true },
    revert: { title: "Revert Adaptation", description: "Roll back the durable mutations recorded when this adaptation was applied.", label: "Revert Changes", danger: true },
    supersede: { title: "Supersede Adaptation", description: "Close this candidate in favor of another adaptation. A replacement ID and reason are required.", label: "Supersede", danger: true },
    request_validation: { title: "Request Validation", description: "Move this adaptation into validation and record the review action.", label: "Request Validation", danger: false },
    switch_manual: { title: "Require Manual Approval", description: "Keep this candidate pending and require a person to approve promotion.", label: "Require Manual Approval", danger: false }
  };
  return copy[action];
}
