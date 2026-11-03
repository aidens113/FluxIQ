// Whether a call wrote its step rather than ran it (`../written-call.ts`, t707 D1).
import { describe, expect, it } from "vitest";
import { automationStudioLlmEvidenceCallWritten } from "../written-call.ts";

const input = { node: "web.click", parameters: { target: "t7" }, write: true };

describe("a written call", () => {
  it("is one that asked to write and was answered as written", () => {
    expect(automationStudioLlmEvidenceCallWritten({ input, refused: false, resultCode: "core.run_node.written" })).toBe(true);
  });

  it("is not one the host refused, one answered another code, or one that never asked to write", () => {
    expect(automationStudioLlmEvidenceCallWritten({ input, refused: true, resultCode: "core.run_node.written" })).toBe(false);
    expect(automationStudioLlmEvidenceCallWritten({ input, refused: false, resultCode: "web.action.succeeded" })).toBe(false);
    expect(automationStudioLlmEvidenceCallWritten({ input, refused: false })).toBe(false);
    expect(automationStudioLlmEvidenceCallWritten({ input: { node: "web.click", parameters: { target: "t7" } }, refused: false, resultCode: "core.run_node.written" })).toBe(false);
  });
});
