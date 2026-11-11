import { describe, expect, it } from "vitest";
import { humannessSchema } from "../index.ts";

describe("humannessSchema", () => {
  it("accepts whole numbers from 0 to 100", () => {
    for (const ok of [0, 50, 100]) expect(humannessSchema.safeParse(ok).success).toBe(true);
  });
  it("refuses out-of-range and fractional values", () => {
    for (const bad of [-1, 101, 1.5, "5", Number.NaN]) expect(humannessSchema.safeParse(bad).success, String(bad)).toBe(false);
  });
});
