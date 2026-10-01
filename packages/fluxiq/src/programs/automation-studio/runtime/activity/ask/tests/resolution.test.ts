import { describe, expect, it } from "vitest";
import { AUTOMATION_STUDIO_PERSON_NEEDED_CONTROL_KIND, AUTOMATION_STUDIO_PERSON_NEEDED_DONE_OPTION, AUTOMATION_STUDIO_PERSON_NEEDED_STOP_OPTION } from "../../../parking/index.ts";
import { automationStudioActivityAskResolution } from "../resolution.ts";

const check = { kind: "choice" as const, control: { name: "robot check", kind: AUTOMATION_STUDIO_PERSON_NEEDED_CONTROL_KIND } };
const permission = { kind: "permission" as const, control: { name: "Buy", kind: "button" } };

describe("how an answer settles an ask", () => {
  it("reads a robot check's Continue as answered and its Stop as declined", () => {
    expect(automationStudioActivityAskResolution(check, { kind: "choice", value: AUTOMATION_STUDIO_PERSON_NEEDED_DONE_OPTION })).toBe("answered");
    expect(automationStudioActivityAskResolution(check, { kind: "choice", value: AUTOMATION_STUDIO_PERSON_NEEDED_STOP_OPTION })).toBe("declined");
  });

  it("reads a permission granted as allowed and refused as declined", () => {
    expect(automationStudioActivityAskResolution(permission, { kind: "grant", value: null })).toBe("allowed");
    expect(automationStudioActivityAskResolution(permission, { kind: "deny", value: null })).toBe("declined");
  });

  it("reads every other answer as answered, and no answer as timed out", () => {
    expect(automationStudioActivityAskResolution({ kind: "confirm", control: null }, { kind: "grant", value: null })).toBe("answered");
    expect(automationStudioActivityAskResolution({ kind: "choice", control: null }, { kind: "choice", value: AUTOMATION_STUDIO_PERSON_NEEDED_STOP_OPTION })).toBe("answered");
    expect(automationStudioActivityAskResolution({ kind: "open", control: null }, { kind: "text", value: "the blue one" })).toBe("answered");
    expect(automationStudioActivityAskResolution(check, undefined)).toBe("timed_out");
    expect(automationStudioActivityAskResolution(permission, undefined)).toBe("timed_out");
  });
});
