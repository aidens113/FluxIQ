import { describe, expect, it } from "vitest";
import { ENGINE_UNKNOWN, engineStatusFromHttp } from "../engine-status";
import { formatSpend } from "../format-spend";

describe("today's spend", () => {
  it("is dollars and cents when known", () => {
    expect(formatSpend(0.42)).toBe("$0.42");
    expect(formatSpend(0)).toBe("$0.00");
  });
  it("is a dash when not known, never a made-up number", () => {
    for (const unknown of [undefined, null, Number.NaN, -1]) expect(formatSpend(unknown)).toBe("—");
  });
});

describe("the engine status", () => {
  it("says running, not ready, or nothing at all", () => {
    expect(engineStatusFromHttp(200)).toEqual({ label: "Running", tone: "ok" });
    expect(engineStatusFromHttp(503)).toEqual({ label: "Not ready", tone: "warn" });
    expect(engineStatusFromHttp(500)).toBe(ENGINE_UNKNOWN);
  });
});
