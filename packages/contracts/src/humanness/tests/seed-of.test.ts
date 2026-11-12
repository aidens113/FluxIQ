import { describe, expect, it } from "vitest";
import { humannessSeedOf } from "../index.ts";

describe("humannessSeedOf", () => {
  it("is a stable unsigned 32-bit seed for the same text", () => {
    expect(humannessSeedOf("cmd-1")).toBe(humannessSeedOf("cmd-1"));
    expect(humannessSeedOf("")).toBe(0x811c9dc5);
    const seed = humannessSeedOf("command.click.7");
    expect(Number.isInteger(seed) && seed >= 0 && seed <= 0xffffffff).toBe(true);
  });
  it("differs for different text", () => {
    expect(humannessSeedOf("cmd-1")).not.toBe(humannessSeedOf("cmd-2"));
  });
});
