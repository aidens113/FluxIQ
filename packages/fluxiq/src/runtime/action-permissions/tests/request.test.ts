import { describe, expect, it } from "vitest";
import {
  AUTOMATION_STUDIO_ACTION_PERMISSION_REQUEST_SCHEMA_VERSION,
  automationStudioActionPermissionSentence,
  parseAutomationStudioActionPermissionRequest,
  type AutomationStudioActionPermissionRequest
} from "../index.ts";

describe("runtime action permission request contract", () => {
  it("round trips the established wire schema and still refuses malformed authority", () => {
    const request = permissionRequest();
    expect(request.schemaVersion).toBe("automation-studio.action-permission-request.v1");
    expect(parseAutomationStudioActionPermissionRequest(JSON.parse(JSON.stringify(request)))).toEqual(request);
    expect(parseAutomationStudioActionPermissionRequest({ ...request, authority: { granted: ["modify_existing"], instructed: [] } })).toBeNull();
    expect(parseAutomationStudioActionPermissionRequest({ ...request, missing: ["delete"] })).toBeNull();
    expect(parseAutomationStudioActionPermissionRequest({ ...request, extra: true })).toBeNull();
  });
});

function permissionRequest(): AutomationStudioActionPermissionRequest {
  const sentence = automationStudioActionPermissionSentence({
    stage: "authoring",
    kind: "flow_step",
    verb: "save",
    controlName: "Save record",
    controlKind: "control",
    missing: ["modify_existing"]
  });
  return {
    schemaVersion: AUTOMATION_STUDIO_ACTION_PERMISSION_REQUEST_SCHEMA_VERSION,
    requestId: "request.record",
    requestedAtMs: 1,
    action: { kind: "flow_step", id: "record.save", ref: "step.save", verb: "save" },
    control: { name: "Save record", kind: "control" },
    consequences: ["modify_existing"],
    missing: ["modify_existing"],
    reason: { stage: "authoring", instructionIds: ["instruction.record"] },
    authority: { granted: [], instructed: [] },
    sentence
  };
}
