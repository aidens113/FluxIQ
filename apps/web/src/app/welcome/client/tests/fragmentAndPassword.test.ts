import { describe, expect, it } from "vitest";
import { passwordProblem, readFragmentToken } from "..";

describe("readFragmentToken", () => {
  it("reads only a non-empty token", () => {
    expect(readFragmentToken("#token=abc_-1")).toBe("abc_-1");
    expect(readFragmentToken("")).toBeNull();
    expect(readFragmentToken("#token=")).toBeNull();
  });
});

describe("passwordProblem", () => {
  it("requires 12 characters and a matching confirmation", () => {
    expect(passwordProblem("short", "short")).not.toBeNull();
    expect(passwordProblem("a long enough one", "another long one")).not.toBeNull();
    expect(passwordProblem("a long enough one", "a long enough one")).toBeNull();
  });
});
