import { describe, expect, it, vi } from "vitest";
import { authorizeProgramPin, programAuthorizationPinError } from "./authorization.ts";

describe("program PIN authorization", () => {
  it("requires 4 to 12 ASCII digits", () => {
    expect(programAuthorizationPinError("1234")).toBeNull();
    expect(programAuthorizationPinError("123456789012")).toBeNull();
    expect(programAuthorizationPinError("１２３４")).toContain("digits");
    expect(programAuthorizationPinError("12ab")).toContain("digits");
    expect(programAuthorizationPinError("123")).toContain("4 to 12");
  });

  it("rejects malformed input before invoking the identity service", async () => {
    const authorizeSessionPin = vi.fn();
    await expect(authorizeProgramPin({ authorizeSessionPin } as never, { authSessionId: "session", authorizationPin: "12ab" })).rejects.toThrow("4 to 12 digits");
    expect(authorizeSessionPin).not.toHaveBeenCalled();
  });
});
