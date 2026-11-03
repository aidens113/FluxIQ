import { describe, expect, it } from "vitest";
import { automationStudioSiteResetWitnessStampValid as valid } from "../index.ts";

// The JSON-safe form of a witness a plan node carries (t751, R3): `via` and,
// for a destination or a repeat, the ref or act it names. Nothing opaque, and
// nothing else, is ever accepted.

describe("a reset witness stamp", () => {
  it("accepts each form exactly", () => {
    for (const stamp of [
      { via: "destination", ref: "destination-1" }, { via: "destination", ref: "destination-256" },
      { via: "own_list" }, { via: "control" }, { via: "legacy" },
      { via: "control", ref: "control-1" }, { via: "control", ref: "control-256" },
      { via: "repeats", act: "act-1" }, { via: "repeats", act: "act-9999" }
    ]) expect(valid(stamp)).toBe(true);
    expect(valid(JSON.parse(JSON.stringify({ via: "repeats", act: "act-12" })))).toBe(true);
  });

  it("refuses anything else: other shapes, missing or extra keys, opaque tokens, malformed refs and acts", () => {
    for (const stamp of [
      undefined, null, "destination-1", 1, [], [{ via: "control" }],
      {}, { via: "made_up" }, { via: "destination" }, { via: "destination", ref: "" }, { via: "destination", ref: "destination-0" },
      { via: "destination", ref: "destination-01" }, { via: "destination", ref: "destination-1000" }, { via: "destination", ref: "p:wall" },
      { via: "destination", ref: 1 }, { via: "destination", ref: "destination-1", scope: "p:wall" }, { via: "destination", ref: "destination-1", group: "g:wall" },
      { via: "own_list", scope: "p:wall" }, { via: "own_list", group: "g:wall" }, { via: "control", place: "pl:star" },
      { via: "control", ref: "control-0" }, { via: "control", ref: "control-01" }, { via: "control", ref: "control-1000" }, { via: "control", ref: "pl:star" }, { via: "control", ref: undefined },
      { via: "repeats" }, { via: "repeats", act: "act-0" }, { via: "repeats", act: "act-10000" }, { via: "repeats", act: "step-1" },
      { via: "repeats", act: "act-1", ref: "destination-1" }, { via: "legacy", ref: "destination-1" }, { via: "control", act: "act-1" }
    ]) expect(valid(stamp)).toBe(false);
  });

  it("refuses a stamp that is not a plain object", () => {
    class Stamp { via = "control"; }
    expect(valid(new Stamp())).toBe(false);
    expect(valid(Object.assign(Object.create({ inherited: true }), { via: "control" }))).toBe(false);
    const getter = Object.defineProperty({}, "via", { get: () => "control", enumerable: true });
    expect(valid(getter)).toBe(false);
  });
});
