// A caller's options, read: what is kept, and what is refused before anything runs.
import { describe, expect, it } from "vitest";
import { parseAutomationStudioPermittedConsequences } from "../../../../../../runtime/action-permission-requests/index.ts";
import { automationStudioAnswerFirstCallerOptionsRead as read, automationStudioAnswerFirstKeptCallerOptions } from "../index.ts";

describe("a caller's options", () => {
  it("reads nothing as nothing, and keeps each field it is given", () => {
    expect(read({})).toEqual({});
    const check = () => true;
    const sink = { raised: () => undefined };
    expect(read({ taskKey: "market.cheapest-listings:3f2a", model: "claude-haiku-5-5", budgetUsd: 12, judge: "off", check, personAsk: sink })).toEqual({ taskKey: "market.cheapest-listings:3f2a", model: "claude-haiku-5-5", budgetUsd: 12, judge: "off", check, personAsk: sink });
    expect(read({ budgetUsd: 0 }).budgetUsd).toBe(0);
  });

  it("keeps an act scope of 1 to 512 characters, which a press's kept options read again, and refuses anything else", () => {
    expect(read({ actScope: "fluxnode.run.fnr-1" }).actScope).toBe("fluxnode.run.fnr-1");
    expect(read(JSON.parse(JSON.stringify(automationStudioAnswerFirstKeptCallerOptions({ taskKey: "t", actScope: "fluxnode.run.fnr-1" })))).actScope).toBe("fluxnode.run.fnr-1");
    for (const bad of ["", "  ", "x".repeat(513), 5, null]) expect(() => read({ actScope: bad }), JSON.stringify(bad)).toThrow(/actScope must be 1 to 512 characters/u);
  });

  it("keeps a humanness of 0 to 100 and refuses anything else", () => {
    for (const ok of [0, 40, 100]) expect(read({ humanness: ok }).humanness).toBe(ok);
    for (const bad of [-1, 101, 1.5, "5", Number.NaN]) expect(() => read({ humanness: bad }), String(bad)).toThrow(/humanness must be a whole number/u);
  });

  it("reads a scope into Core's consequences and lowercased sites without repeats", () => {
    expect(read({ scope: { permittedConsequences: ["create_new", "modify_existing", "create_new"], sites: ["Market.Example", "market.example", "localhost:3000"] } }).scope).toEqual({ permittedConsequences: parseAutomationStudioPermittedConsequences(["create_new", "modify_existing"]), sites: ["market.example", "localhost:3000"] });
    expect(read({ scope: { permittedConsequences: [] } }).scope).toEqual({ permittedConsequences: [] });
  });

  it("keeps a copy of the inputs, and refuses inputs that are not an object of JSON values", () => {
    const inputs = { title: "Atlas", count: 3 };
    const read_ = read({ inputs });
    expect(read_.inputs).toEqual(inputs);
    expect(read_.inputs).not.toBe(inputs);
    for (const bad of [null, ["Atlas"], "Atlas", { when: new Date(0) }]) expect(() => read({ inputs: bad }), JSON.stringify(bad)).toThrow(/inputs/u);
  });

  it("refuses what is wrong, naming it", () => {
    expect(() => read(null)).toThrow(/object/u);
    expect(() => read({ budget: 5 })).toThrow(/"budget"/u);
    expect(() => read({ taskKey: "  " })).toThrow(/taskKey/u);
    expect(() => read({ taskKey: "k".repeat(513) })).toThrow(/taskKey/u);
    expect(() => read({ model: "has spaces" })).toThrow(/model/u);
    for (const budgetUsd of [-1, Number.NaN, Number.POSITIVE_INFINITY, "5", 100_001]) expect(() => read({ budgetUsd }), String(budgetUsd)).toThrow(/budgetUsd/u);
    expect(() => read({ judge: "never" })).toThrow(/judge/u);
    expect(() => read({ check: "x === 1" })).toThrow(/check/u);
    expect(() => read({ personAsk: {} })).toThrow(/raised/u);
    expect(() => read({ personAsk: { raised: () => undefined, answer: "yes" } })).toThrow(/answer/u);
    expect(() => read({ scope: { permittedConsequences: ["purchase"] } })).toThrow(/does not recognise/u);
    expect(() => read({ scope: { sites: ["market.example"] } })).toThrow(/list/u);
    expect(() => read({ scope: { permittedConsequences: [], sites: ["https://market.example/"] } })).toThrow(/sites/u);
    expect(() => read({ scope: { permittedConsequences: [], apps: ["notepad.exe"] } })).toThrow(/"apps"/u);
  });
});
