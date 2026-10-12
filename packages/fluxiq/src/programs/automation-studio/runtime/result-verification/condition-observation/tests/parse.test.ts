import { expect, it } from "vitest";
import { automationStudioResultConditionObservation as parse } from "../parse.ts";
import { screenAutomationStudioResultConditionObservation as screen } from "../screen.ts";

const present = { conditionIndex: 3, state: "present", value: "", source: "read", readKind: "attribute", page: 2, item: 5 };

it("keeps empty text, passive provenance and all four states distinct from legacy unknown", () => {
  expect(parse(present, 3)).toEqual(present);
  expect(parse(null, 3)).toBeNull();
  for (const state of ["absent", "unavailable", "withheld"]) {
    const { value: _value, ...base } = present;
    expect(parse({ ...base, state }, 3)).toEqual({ ...base, state });
    expect(parse({ ...base, state, value: undefined }, 3)).toBeUndefined();
  }
});

it("rejects foreign addressing, open tokens, invalid ordinals and inconsistent value shapes", () => {
  for (const change of [
    { selector: "unit" }, { readKind: "custom" }, { source: "network" }, { state: "unknown" },
    { conditionIndex: 2 }, { page: 0 }, { item: 1.5 }, { value: 4 }
  ]) expect(parse({ ...present, ...change }, 3)).toBeUndefined();
  const { value: _value, ...missing } = present;
  expect(parse(missing, 3)).toBeUndefined();
});

it("withholds before flattening without converting withheld or faults to absence", () => {
  const screened = screen({ ...present, value: "private unit text" }, 3, () => true);
  expect(screened).toEqual({ observation: { conditionIndex: 3, state: "withheld", source: "read", readKind: "attribute", page: 2, item: 5 }, withheld: true });
  expect(screen({ ...present, value: "(withheld)" }, 3, () => false)).toEqual(screened);
  expect(screen(null, 3, () => true)).toEqual({ observation: null, withheld: false });
});
