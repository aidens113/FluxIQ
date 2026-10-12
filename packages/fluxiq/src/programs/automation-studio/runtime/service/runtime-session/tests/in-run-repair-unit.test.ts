// Which changes an in-run repair may make (state-aware recovery plan, C12): a
// repair names one unit, the incident's, and every other unit is refused.

import { describe, expect, it } from "vitest";
import type { AutomationStudioRepairUnit } from "../../../executor/lifecycle-run/index.ts";
import type { AutomationStudioRuntimePatch, AutomationStudioRuntimePatchUnit } from "../../../llm/index.ts";
import { automationStudioInRunRepairUnitRefusal } from "../in-run-repair-unit.ts";

type HandlerPatch = Extract<AutomationStudioRuntimePatch, { kind: "add_handler" }>;

const NODE: AutomationStudioRepairUnit = { kind: "node", nodeId: "read" };
const HANDLER: AutomationStudioRepairUnit = { kind: "handler", handlerNodeId: "h.notice" };
const PART: AutomationStudioRepairUnit = { kind: "part", subflowId: "subflow.checkout" };

function waitRetry(targetNodeId: string): AutomationStudioRuntimePatch {
  return { kind: "temporary_wait_retry", targetNodeId, retryCount: 2, reason: "Wait longer." };
}

function override(targetNodeId: string): AutomationStudioRuntimePatch {
  return { kind: "temporary_target_override", targetNodeId, target: { handles: { control: "next" } }, consequences: [], reason: "The target moved." };
}

function replace(unit: AutomationStudioRuntimePatchUnit): AutomationStudioRuntimePatch {
  if (unit.kind === "handler") return { kind: "replace_unit", unit, handler: handlerSpec({ kind: "nodes", nodeIds: ["read"] }), consequences: [], reason: "Replace it." };
  return { kind: "replace_unit", unit, steps: [{ definitionId: "builtin.data.constant" }], consequences: [], reason: "Replace it." };
}

function handler(scope: HandlerPatch["scope"]): AutomationStudioRuntimePatch {
  return { kind: "add_handler", ...handlerSpec(scope), consequences: [], reason: "Dismiss the notice." };
}

function handlerSpec(scope: HandlerPatch["scope"]) {
  return { event: "retry" as const, scope, when: [{ fact: "dialog.visible", op: "visible" as const }], steps: [{ definitionId: "builtin.data.constant" }], then: { kind: "resume" as const } };
}

function refusal(requested: AutomationStudioRepairUnit, patch: AutomationStudioRuntimePatch, changedUnit?: AutomationStudioRuntimePatchUnit) {
  return automationStudioInRunRepairUnitRefusal({ requested, patch, ...(changedUnit ? { changedUnit } : {}) });
}

describe("the one unit an in-run repair may change", () => {
  it("lets a failing node take its own target override, wait-retry or replacement", () => {
    for (const patch of [waitRetry("read"), override("read"), replace({ kind: "node", nodeId: "read" })]) {
      expect(refusal(NODE, patch)).toBeUndefined();
      expect(refusal(NODE, patch, { kind: "node", nodeId: "read" })).toBeUndefined();
    }
  });

  it("refuses a failing node's fix that targets or replaces another unit", () => {
    expect(refusal(NODE, waitRetry("open"))).toEqual({ code: "other_unit", reason: "The fix changed a unit other than the one that failed." });
    expect(refusal(NODE, override("open"))?.code).toBe("other_unit");
    expect(refusal(NODE, replace({ kind: "node", nodeId: "open" }))).toEqual({ code: "other_unit", reason: "The fix replaced a unit other than the one that failed." });
    expect(refusal(NODE, replace({ kind: "part", subflowId: "subflow.checkout" }))?.code).toBe("other_unit");
  });

  it("refuses the failing node's own target when the overlay places it in a handler's body", () => {
    expect(refusal(NODE, waitRetry("read"), { kind: "handler", nodeId: "h.notice" })?.code).toBe("other_unit");
  });

  it("refuses for a failing node the kinds that leave its own act as it was", () => {
    const kinds: AutomationStudioRuntimePatch[] = [
      { kind: "temporary_reroute", fromNodeId: "read", toNodeId: "end", reason: "Go round it." },
      { kind: "temporary_action_sequence", targetNodeId: "read", steps: [{ definitionId: "builtin.data.constant" }], consequences: [], reason: "Do this first." },
      { kind: "temporary_recovery_subflow_call", subflowId: "subflow.recover", reason: "Recover." }
    ];
    for (const patch of kinds) expect(refusal(NODE, patch)?.code).toBe("patch_refused");
  });

  it("lets a failing node gain a handler scoped to it alone or to the part it runs in, and no other", () => {
    expect(refusal(NODE, handler({ kind: "nodes", nodeIds: ["read"] }), { kind: "handler", nodeId: "node.runtime-patch.run.handler-read" })).toBeUndefined();
    expect(refusal(NODE, handler({ kind: "subflow" }))).toBeUndefined();
    expect(refusal(NODE, handler({ kind: "nodes", nodeIds: ["open"] }))).toEqual({ code: "other_unit", reason: "The fix added a handler for steps other than the one that failed." });
    expect(refusal(NODE, handler({ kind: "nodes", nodeIds: ["read", "open"] }))?.code).toBe("other_unit");
    expect(refusal(NODE, handler({ kind: "nodes", nodeIds: [] }))?.code).toBe("other_unit");
  });

  it("lets a handler or a part take only a change to itself", () => {
    expect(refusal(HANDLER, waitRetry("dismiss"), { kind: "handler", nodeId: "h.notice" })).toBeUndefined();
    expect(refusal(HANDLER, replace({ kind: "handler", nodeId: "h.notice" }))).toBeUndefined();
    expect(refusal(PART, replace({ kind: "part", subflowId: "subflow.checkout" }), { kind: "part", subflowId: "subflow.checkout" })).toBeUndefined();

    expect(refusal(HANDLER, waitRetry("read"), { kind: "node", nodeId: "read" })?.code).toBe("other_unit");
    expect(refusal(HANDLER, replace({ kind: "handler", nodeId: "h.other" }))?.code).toBe("other_unit");
    expect(refusal(PART, waitRetry("call"), { kind: "node", nodeId: "call" })?.code).toBe("other_unit");
    expect(refusal(PART, replace({ kind: "part", subflowId: "subflow.other" }))?.code).toBe("other_unit");
  });

  it("refuses a new handler for a handler or a part, which is a unit of its own", () => {
    expect(refusal(HANDLER, handler({ kind: "subflow" }))?.code).toBe("other_unit");
    expect(refusal(PART, handler({ kind: "subflow" }))?.code).toBe("other_unit");
  });
});
