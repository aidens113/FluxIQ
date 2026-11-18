import { describe, expect, it } from "vitest";
import { toEnvFile } from "../to-env-file.ts";

describe("toEnvFile", () => {
  it("writes plain values bare and quotes anything else literally", () => {
    expect(toEnvFile(["header"], [["A", "plain-value_1.2:3/x@y,z"], ["B", "tls internal"], ["C", "FluxIQ <a@b.example>"], ["D", "C:/x/!FluxIQ"], ["E", ""]]))
      .toBe("# header\nA=plain-value_1.2:3/x@y,z\nB='tls internal'\nC='FluxIQ <a@b.example>'\nD='C:/x/!FluxIQ'\nE=\n");
  });

  it("refuses what it cannot write safely", () => {
    expect(() => toEnvFile([], [["A", "it's"]])).toThrow("single quote");
    expect(() => toEnvFile([], [["A", "two\nlines"]])).toThrow("line break");
    expect(() => toEnvFile([], [["lower", "x"]])).toThrow("not an environment variable name");
  });
});
