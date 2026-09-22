// What an accepted target names, carried from the domain's check to the
// permission gate. A repair that would lastingly act asks the person first, and
// the question is only answerable when it can say what would be pressed. The
// domain describes the accepted element; Core keeps the description only where
// it is plain, and never where the target was refused.

import { describe, expect, it } from "vitest";
import type { AutomationStudioFlowDocument } from "../../../model/index.ts";
import type { AutomationStudioNodeAttemptTrace } from "../../executor.ts";
import { checkAutomationStudioRuntimeTargetOverride, type AutomationStudioRuntimeTargetOverrideEvidenceValidation } from "../index.ts";

describe("checkAutomationStudioRuntimeTargetOverride carries what the target names", () => {
  it("carries the domain's name and kind on a resolved target and on a matched one", () => {
    const resolved = check({ status: "resolved", target: { handles: { control: "target.2" }, resolvedBy: "domain" }, control: { name: "Add to queue", kind: "button" } });
    expect(resolved).toMatchObject({ issues: [], targetResolution: "resolved", control: { name: "Add to queue", kind: "button" } });

    const matched = check({ status: "matched", control: { name: "Pick and pack" } });
    expect(matched).toMatchObject({ issues: [], targetResolution: "matched", control: { name: "Pick and pack" } });
    expect(matched.control).not.toHaveProperty("kind");
  });

  it("keeps a plain name and drops a kind outside the declaration's vocabulary", () => {
    expect(check({ status: "matched", control: { name: "Add to queue", kind: "<button>" } }).control).toEqual({ name: "Add to queue" });
  });

  it("carries nothing it cannot read, and nothing at all for a refused target", () => {
    for (const control of [{ name: "" }, { name: "   " }, { name: 7 }, { name: "x".repeat(2_001) }, "Add to queue", null]) {
      const result = check({ status: "matched", control } as unknown as AutomationStudioRuntimeTargetOverrideEvidenceValidation);
      expect(result.targetResolution, JSON.stringify(control)).toBe("matched");
      expect(result, JSON.stringify(control)).not.toHaveProperty("control");
    }
    const refused = check({ status: "absent", reason: "target_not_equivalent", control: { name: "Save as draft" } } as unknown as AutomationStudioRuntimeTargetOverrideEvidenceValidation);
    expect(refused.targetRefusal).toEqual({ status: "absent", reason: "target_not_equivalent" });
    expect(refused).not.toHaveProperty("control");
  });
});

function check(answer: AutomationStudioRuntimeTargetOverrideEvidenceValidation) {
  return checkAutomationStudioRuntimeTargetOverride({
    projectId: "project.patch",
    flowId: "flow.patch",
    runId: "run.failed",
    flow: flow(),
    failedAttempt: failedAttempt(),
    patch: { kind: "temporary_target_override", targetNodeId: "press", target: { handles: { control: "target.2" } }, consequences: ["create_new"], reason: "Renamed." },
    validateTargetOverrideEvidence: () => answer
  });
}

function flow(): AutomationStudioFlowDocument {
  return {
    schemaVersion: "0.1",
    flowId: "flow.patch",
    ownerKind: "routine",
    ownerId: "routine.patch",
    name: "Patch Flow",
    createdAt: 1,
    updatedAt: 1,
    nodes: [{ id: "press", definitionId: "builtin.policy.action", parameterValues: { outputId: "example.output.press", parameters: { control: "recorded.press" } } }],
    edges: []
  };
}

function failedAttempt(): AutomationStudioNodeAttemptTrace {
  return {
    attemptId: "press.attempt.1",
    nodeId: "press",
    definitionId: "builtin.policy.action",
    startedAt: 1,
    finishedAt: 2,
    status: "failed",
    route: "failed",
    inputs: {},
    outputs: {},
    effects: [],
    message: "The recorded control was not found.",
    failure: { category: "target_not_found", code: "example.target.not_found", retryable: true }
  };
}
