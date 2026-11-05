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

describe("the sentence a person reads", () => {
  const said = (over: Partial<Parameters<typeof automationStudioActionPermissionSentence>[0]>) => automationStudioActionPermissionSentence({ stage: "authoring", kind: "exploration_step", verb: "press", controlName: "Renew card", controlKind: "button", missing: ["move_money", "delete"], ...over });

  it("names what it would press, once, with no build words and no list of what that does", () => {
    expect(said({})).toBe('FluxIQ needs to press "Renew card".');
    for (const stage of ["authoring", "recovery"] as const) for (const kind of ["exploration_step", "flow_step"] as const) {
      const sentence = said({ stage, kind });
      expect(sentence).not.toMatch(/Flow|build|(button)|money|remove/iu);
      expect(sentence.startsWith(stage === "recovery" ? "To fix the step that failed, FluxIQ needs to press" : "FluxIQ needs to press")).toBe(true);
    }
  });

  it("says each time this runs only where that is what is being agreed to", () => {
    expect(said({ kind: "flow_step" })).toBe('FluxIQ needs to press "Renew card" each time this runs.');
    expect(said({ kind: "exploration_step" })).not.toContain("each time");
  });

  it("still says when it cannot name the control", () => {
    expect(said({ controlName: null })).toBe("FluxIQ needs to press a control it cannot name here.");
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
