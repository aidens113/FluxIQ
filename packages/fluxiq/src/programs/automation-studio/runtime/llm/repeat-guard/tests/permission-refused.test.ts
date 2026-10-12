// Which repeats were refused the first time by the permission gate
// (`../permission-refused.ts`, t471): lane B round 9's remove press, refused
// `web.action.rejected.permission_required`, sent again three times.
import { describe, expect, it } from "vitest";
import { automationStudioLlmEvidenceRepeatPermissionRefused } from "../permission-refused.ts";

describe("a repeat first refused for want of permission", () => {
  it("is a failed call whose code is the gate's permission refusal, from any domain or Core itself", () => {
    for (const resultCode of ["web.action.rejected.permission_required", "permission_required", "flow_bootstrap.permission_required"]) {
      expect(automationStudioLlmEvidenceRepeatPermissionRefused({ callId: "c1", outcome: "failed", resultCode, resultReason: "consequences_declined" })).toBe(true);
    }
  });

  it("is nothing else: another failure, a code that only contains the words, or an outcome that did not fail", () => {
    expect(automationStudioLlmEvidenceRepeatPermissionRefused({ callId: "c1", outcome: "failed", resultCode: "web.action.rejected.target_covered" })).toBe(false);
    expect(automationStudioLlmEvidenceRepeatPermissionRefused({ callId: "c1", outcome: "failed", resultCode: "web.permission_required_soon" })).toBe(false);
    expect(automationStudioLlmEvidenceRepeatPermissionRefused({ callId: "c1", outcome: "failed" })).toBe(false);
    expect(automationStudioLlmEvidenceRepeatPermissionRefused({ callId: "c1", outcome: "changed_nothing", resultCode: "permission_required" })).toBe(false);
  });
});
