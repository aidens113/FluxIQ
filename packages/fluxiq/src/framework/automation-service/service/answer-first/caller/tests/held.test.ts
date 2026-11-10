// A caller's options for one generation: the ones a call brings, or, for a person's press in the panel
// that brings none, the ones its attempt kept; and a start held to the scope's sites either way.
import { describe, expect, it } from "vitest";
import type { AutomationStudioAnswerFirstKeptCallerOptions } from "../../../flow-bootstrap-commands/index.ts";
import { automationStudioAnswerFirstCarryOnScope, type AutomationStudioAnswerFirstCarryOnHold } from "../../carry-on/index.ts";
import { automationStudioAnswerFirstRunAgainScope } from "../../run-again/index.ts";
import { automationStudioAnswerFirstCallerOptionsHeld as held, automationStudioAnswerFirstKeptCallerOptions as keptOf } from "../index.ts";

const AT = { projectId: "project.1", flowId: "flow.1" };
const KEPT: AutomationStudioAnswerFirstKeptCallerOptions = { taskKey: "node:spec", model: "claude-haiku-5-5", budgetUsd: 0, judge: "off", scope: { permittedConsequences: [], sites: ["library.example"] }, inputs: { title: "Atlas" } };

function carried(caller: unknown, over: Partial<AutomationStudioAnswerFirstCarryOnHold> = {}): AutomationStudioAnswerFirstCarryOnHold {
  const kept = { taskId: "task.1", flowId: AT.flowId, notes: [], attempts: [{ attemptId: "attempt.1", flowId: AT.flowId, ordinal: 1, route: "build" as const, steps: [], caller }] };
  return { ...AT, taskId: "task.1", attemptId: "attempt.1", before: {} as AutomationStudioAnswerFirstCarryOnHold["before"], kept: kept as AutomationStudioAnswerFirstCarryOnHold["kept"], acts: undefined, askedUsd: 1, budgetUsd: 1, opened: false, ...over };
}

describe("what an attempt keeps of its caller's options", () => {
  it("is everything that can be written down, copied, and never the check or the person port", () => {
    const inputs = { title: "Atlas" };
    const kept = keptOf({ ...KEPT, inputs, check: () => true, personAsk: { raised: () => undefined } });
    inputs.title = "Birds";
    expect(kept).toEqual(KEPT);
    expect(keptOf({})).toEqual({});
  });
});

describe("a caller's options for one generation", () => {
  it("are the call's own where it brings them, read strictly, and none where nothing is held", () => {
    expect(held({ judge: "always" }, AT)).toEqual({ judge: "always" });
    expect(() => held({ judge: "never" }, AT)).toThrow(/judge must be auto, always or off/u);
    expect(held(undefined, AT)).toBeUndefined();
  });

  it("for a Carry on that brought none, are its attempt's kept ones, for its own Flow and until it opens", () => {
    expect(automationStudioAnswerFirstCarryOnScope.run(carried(KEPT), () => held(undefined, AT))).toEqual(KEPT);
    expect(automationStudioAnswerFirstCarryOnScope.run(carried(KEPT), () => held({ judge: "auto" }, AT))).toEqual({ judge: "auto" });
    expect(automationStudioAnswerFirstCarryOnScope.run(carried(KEPT, { opened: true }), () => held(undefined, AT))).toBeUndefined();
    expect(automationStudioAnswerFirstCarryOnScope.run(carried(KEPT), () => held(undefined, { ...AT, flowId: "flow.2" }))).toBeUndefined();
    // Kept options that no longer read refuse the press, as given ones would.
    expect(() => automationStudioAnswerFirstCarryOnScope.run(carried({ judge: "never" }), () => held(undefined, AT))).toThrow(/judge must be auto, always or off/u);
    expect(automationStudioAnswerFirstCarryOnScope.run(carried(undefined), () => held(undefined, AT))).toBeUndefined();
  });

  it("for a Run again that brought none, are the ones its press found", () => {
    const hold = { ...AT, taskId: "task.1", attemptId: "attempt.2", opened: false, caller: KEPT };
    expect(automationStudioAnswerFirstRunAgainScope.run(hold, () => held(undefined, AT))).toEqual(KEPT);
    expect(automationStudioAnswerFirstRunAgainScope.run({ ...hold, caller: undefined }, () => held(undefined, AT))).toBeUndefined();
  });

  it("refuse a start off the scope's sites, given or kept, and leave a start on them, or no web address, alone", () => {
    const scope = { permittedConsequences: [], sites: ["library.example"] };
    expect(() => held({ scope }, { ...AT, startLocation: "https://elsewhere.example/account" })).toThrow("Answer-first caller startLocation is on elsewhere.example, outside scope.sites (library.example).");
    expect(() => automationStudioAnswerFirstCarryOnScope.run(carried(KEPT), () => held(undefined, { ...AT, startLocation: "https://elsewhere.example/" }))).toThrow(/outside scope\.sites/u);
    expect(held({ scope }, { ...AT, startLocation: "https://www.library.example/account" })).toEqual({ scope });
    expect(held({ scope }, { ...AT, startLocation: "library://account" })).toEqual({ scope });
    expect(held({ scope: { permittedConsequences: [] } }, { ...AT, startLocation: "https://elsewhere.example/" })).toEqual({ scope: { permittedConsequences: [] } });
  });
});
