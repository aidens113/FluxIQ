import { describe, expect, it } from "vitest";
import { isClosedSignupPath } from "../closed-signup-path";

describe("isClosedSignupPath", () => {
  it("matches the sign-up page only while sign-up is off", () => {
    expect(isClosedSignupPath("/signup", "off")).toBe(true);
    expect(isClosedSignupPath("/signup/", "off")).toBe(true);
    expect(isClosedSignupPath("/signup", "open")).toBe(false);
  });

  it("leaves the submit route (its own JSON 404) and other pages alone", () => {
    expect(isClosedSignupPath("/signup/submit", "off")).toBe(false);
    expect(isClosedSignupPath("/signups", "off")).toBe(false);
    expect(isClosedSignupPath("/welcome", "off")).toBe(false);
    expect(isClosedSignupPath("/", "off")).toBe(false);
  });
});
