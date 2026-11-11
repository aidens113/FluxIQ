import { describe, expect, it } from "vitest";
import { HUMANNESS_DEFAULT, HUMANNESS_MAX, HUMANNESS_MIN } from "../index.ts";

describe("humanness bounds", () => {
  it("runs 0 to 100 and defaults to 0", () => {
    expect([HUMANNESS_MIN, HUMANNESS_MAX, HUMANNESS_DEFAULT]).toEqual([0, 100, 0]);
  });
});
