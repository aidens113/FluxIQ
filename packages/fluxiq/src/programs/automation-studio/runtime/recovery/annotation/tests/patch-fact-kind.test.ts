// A repair's condition about a control names what it reads as a build's
// condition does (t787): the op's own kind for a presence or a count, `text`
// or `value` for a comparison, and a comparison that names neither is refused.

import { describe, expect, it } from "vitest";
import type { AutomationStudioFactCondition } from "../../../executor/lifecycle/index.ts";
import { automationStudioRecoveryPatchFactKind } from "../patch-fact-kind.ts";

const on = { handles: { target: "t2" } };
const kind = (condition: AutomationStudioFactCondition) => automationStudioRecoveryPatchFactKind(condition);

describe("the kind a repair's condition about a control names", () => {
  it("is the op itself for a presence or a count, whatever label the model wrote", () => {
    expect(kind({ fact: "the notice over the list", op: "visible", target: on })).toEqual({ condition: { fact: "visible", op: "visible", target: on } });
    expect(kind({ fact: "visible", op: "absent", target: on })).toEqual({ condition: { fact: "absent", op: "absent", target: on } });
    expect(kind({ fact: "exists", op: "absent", target: on })).toEqual({ condition: { fact: "absent", op: "absent", target: on } });
    expect(kind({ fact: "rows", op: "count", value: ">= 3", target: on })).toEqual({ condition: { fact: "count", op: "count", value: ">= 3", target: on } });
  });

  it("keeps a condition already written as a build writes it, unchanged", () => {
    const written: AutomationStudioFactCondition = { fact: "enabled", op: "enabled", target: on };
    expect(kind(written)).toEqual({ condition: written });
    expect((kind(written) as { condition: AutomationStudioFactCondition }).condition).toBe(written);
  });

  it("keeps a comparison that says what it compares, and refuses one that does not", () => {
    expect(kind({ fact: "text", op: "contains", value: "Signed in", target: on })).toEqual({ condition: { fact: "text", op: "contains", value: "Signed in", target: on } });
    expect(kind({ fact: "value", op: "equals", value: { input: "city" }, target: on })).toEqual({ condition: { fact: "value", op: "equals", value: { input: "city" }, target: on } });
    expect(kind({ fact: "count", op: "equals", value: 3, target: on })).toEqual({ condition: { fact: "count", op: "equals", value: 3, target: on } });
    expect(kind({ fact: "visible", op: "equals", value: false, target: on })).toEqual({ condition: { fact: "visible", op: "equals", value: false, target: on } });
    expect(kind({ fact: "visible", op: "equals", value: "yes", target: on })).toEqual({ refused: true });
    expect(kind({ fact: "the notice's words", op: "contains", value: "Session", target: on })).toEqual({ refused: true });
    expect(kind({ fact: "visible", op: "matches", value: "^Ready", target: on })).toEqual({ refused: true });
  });
});
