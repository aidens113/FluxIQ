import { describe, expect, it } from "vitest";
import { humannessRandom } from "../index.ts";

describe("humannessRandom", () => {
  it("repeats the same sequence for the same seed", () => {
    const first = humannessRandom(42), second = humannessRandom(42);
    for (let index = 0; index < 20; index += 1) expect(first()).toBe(second());
  });
  it("gives a different sequence for a different seed", () => {
    const first = humannessRandom(1), second = humannessRandom(2);
    expect([first(), first(), first()]).not.toEqual([second(), second(), second()]);
  });
  it("stays in [0, 1) and spreads across it", () => {
    const random = humannessRandom(7);
    const draws = Array.from({ length: 2000 }, () => random());
    for (const draw of draws) expect(draw >= 0 && draw < 1).toBe(true);
    expect(draws.filter((draw) => draw < 0.5).length).toBeGreaterThan(850);
    expect(draws.filter((draw) => draw < 0.5).length).toBeLessThan(1150);
  });
});
