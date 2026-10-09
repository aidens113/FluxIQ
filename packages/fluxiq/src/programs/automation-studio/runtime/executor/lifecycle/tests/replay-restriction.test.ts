import { describe, expect, it } from "vitest";
import type { AutomationStudioFlowNode } from "../../../../model/index.ts";
import { automationStudioNodeReplayRestriction } from "../replay-restriction.ts";

const node = (extra: Partial<AutomationStudioFlowNode>): AutomationStudioFlowNode => ({ id: "n", definitionId: "web.press", ...extra });

describe("replay restriction", () => {
  it("derives safe, reconcile and never from the side-effect model", () => {
    expect(automationStudioNodeReplayRestriction(node({}))).toBe("safe");
    expect(automationStudioNodeReplayRestriction(node({ metadata: { declaredConsequences: ["create_new"] } }))).toBe("reconcile");
    expect(automationStudioNodeReplayRestriction(node({ metadata: { externalSideEffect: true } }))).toBe("reconcile");
    expect(automationStudioNodeReplayRestriction(node({ metadata: { externalSideEffect: true, idempotent: true } }))).toBe("safe");
    expect(automationStudioNodeReplayRestriction(node({ metadata: { destructive: true, idempotent: true } }))).toBe("never");
    expect(automationStudioNodeReplayRestriction(node({ parameterValues: { requiresApproval: true } }))).toBe("never");
  });

  it("lets metadata.replay tighten, never loosen", () => {
    expect(automationStudioNodeReplayRestriction(node({ metadata: { replay: "never" } }))).toBe("never");
    expect(automationStudioNodeReplayRestriction(node({ metadata: { replay: "reconcile" } }))).toBe("reconcile");
    expect(automationStudioNodeReplayRestriction(node({ metadata: { destructive: true, replay: "safe" } }))).toBe("never");
    expect(automationStudioNodeReplayRestriction(node({ metadata: { declaredConsequences: ["send"], replay: "safe" } }))).toBe("reconcile");
  });
});
