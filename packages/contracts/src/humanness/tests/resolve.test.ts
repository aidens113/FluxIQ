import { describe, expect, it } from "vitest";
import { resolveHumanness } from "../index.ts";

describe("resolveHumanness: a run's level by precedence", () => {
  it("is undefined when no source set one, so the run stays on today's path", () => {
    expect(resolveHumanness({})).toBeUndefined();
    expect(resolveHumanness({ runOption: null, task: null, flow: undefined, startingValue: null, person: null })).toBeUndefined();
  });
  it("takes an explicit run option over every stored level, the starting value and the person's", () => {
    expect(resolveHumanness({ runOption: 10, task: 20, flow: 30, startingValue: 40, person: 50 })).toBe(10);
    expect(resolveHumanness({ runOption: 0, task: 20, flow: 30, startingValue: 40, person: 50 })).toBe(0);
  });
  it("takes the task's stored level over the Flow's, the starting value and the person's", () => {
    expect(resolveHumanness({ task: 20, flow: 30, startingValue: 40, person: 50 })).toBe(20);
    expect(resolveHumanness({ task: 0, flow: 30, startingValue: 40, person: 50 })).toBe(0);
  });
  it("takes the Flow's stored level over the starting value and the person's", () => {
    expect(resolveHumanness({ flow: 30, startingValue: 40, person: 50 })).toBe(30);
    expect(resolveHumanness({ flow: 0, startingValue: 40, person: 50 })).toBe(0);
  });
  it("takes the request's starting value over the person's", () => {
    expect(resolveHumanness({ startingValue: 40, person: 50 })).toBe(40);
    expect(resolveHumanness({ startingValue: 0, person: 50 })).toBe(0);
  });
  it("falls back to the person's stored starting value last", () => {
    expect(resolveHumanness({ person: 50 })).toBe(50);
    expect(resolveHumanness({ runOption: null, task: null, flow: null, startingValue: null, person: 0 })).toBe(0);
  });
  it("normalises what it returns", () => {
    expect(resolveHumanness({ task: 140 })).toBe(100);
    expect(resolveHumanness({ flow: 33.6 })).toBe(34);
    expect(resolveHumanness({ person: -5 })).toBe(0);
  });
});
