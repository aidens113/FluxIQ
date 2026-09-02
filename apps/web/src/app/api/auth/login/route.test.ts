import { describe, expect, it } from "vitest";
import { loginTotpError } from "./route";

describe("login credential validation", () => {
  it("accepts only six ASCII TOTP digits when a code is supplied", () => {
    expect(loginTotpError(undefined)).toBeNull();
    expect(loginTotpError("")).toBeNull();
    expect(loginTotpError("123456")).toBeNull();
    expect(loginTotpError("12345")).toContain("6 digits");
    expect(loginTotpError("１２３４５６")).toContain("6 digits");
    expect(loginTotpError("12345a")).toContain("6 digits");
  });
});
