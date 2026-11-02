import { expect, it } from "vitest";
import { cloneRecordingExpectedState } from "../clone.ts";

it.each([
  [undefined, "absent"], [null, "absent"], [[], "not_plain"], [new Date(0), "not_plain"], [new Map(), "not_plain"], ["condition", "not_plain"],
  [{ check() {} }, "uncloneable"], [{}, "empty"], [Object.create(null), "empty"], [{ [Symbol("condition")]: true }, "empty"]
])("returns an explicit drop outcome for %j", (value, kind) => {
  expect(cloneRecordingExpectedState(value)).toEqual({ kind });
});

it("clones plain and null-prototype conditions without interpreting or retaining aliases", () => {
  for (const state of [{ opaque: { custom: 1 } }, Object.assign(Object.create(null), { opaque: { custom: 1 } })]) {
    const outcome = cloneRecordingExpectedState(state);
    expect(outcome.kind).toBe("state");
    if (outcome.kind !== "state") throw new Error("Expected retained condition");
    expect(outcome.state).toEqual({ opaque: { custom: 1 } });
    expect(outcome.state).not.toBe(state);
    expect(outcome.state.opaque).not.toBe(state.opaque);
  }
});
