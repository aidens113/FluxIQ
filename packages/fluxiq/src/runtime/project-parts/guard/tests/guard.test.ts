// Covers runtime/project-parts/guard/check.ts: every code, and each case on either side of it.
import { describe, expect, it } from "vitest";
import type { AutomationStudioFactTruth } from "../../../automation-host/contracts/index.ts";
import { automationStudioPartGuard, type AutomationStudioPartGuardInput } from "../index.ts";

const SITE = "https://shop.example";
const CONDITION = { fact: "exists", op: "exists" as const, target: { selector: "#go" } };

type Case = {
  name: string;
  card?: Partial<NonNullable<AutomationStudioPartGuardInput["card"]>> | null;
  snapshot?: { conditions?: (typeof CONDITION)[]; selfArrives?: true; source?: "entry" | "first_step" | "navigate" | "none"; defaults?: Record<string, string> } | null;
  asked?: Partial<AutomationStudioPartGuardInput["asked"]>;
  origin?: string | undefined;
  facts?: AutomationStudioFactTruth[];
  answer: string;
};

const TABLE: Case[] = [
  // part.not_found
  { name: "no card", card: null, answer: "part.not_found" },
  { name: "no snapshot", snapshot: null, answer: "part.not_found" },
  // part.input_unknown
  { name: "a value the part does not take", asked: { inputs: { query: "a", other: "b" } }, answer: "part.input_unknown" },
  { name: "unknown wins over the page", asked: { inputs: { other: "b" } }, origin: "https://elsewhere.example", answer: "part.input_unknown" },
  // part.input_missing
  { name: "a required value left out", asked: { inputs: {} }, answer: "part.input_missing" },
  { name: "a required value of null", asked: { inputs: { query: null } }, answer: "part.input_missing" },
  { name: "a required value of spaces", asked: { inputs: { query: "   " } }, answer: "part.input_missing" },
  { name: "a required value with a declared default", asked: { inputs: {} }, snapshot: { conditions: [CONDITION], defaults: { query: "all" } }, answer: "ok" },
  { name: "zero is a value", asked: { inputs: { query: 0 } }, answer: "ok" },
  { name: "false is a value", asked: { inputs: { query: false } }, answer: "ok" },
  { name: "an optional value left out", card: { inputs: [{ id: "query", name: "Search words", required: false }] }, asked: { inputs: {} }, answer: "ok" },
  // part.act_not_allowed
  { name: "a lasting class nobody asked for", card: { lastingClasses: ["delete"] }, answer: "part.act_not_allowed" },
  { name: "one of two classes asked for", card: { lastingClasses: ["delete", "create_new"] }, asked: { inputs: { query: "a" }, permittedConsequences: ["create_new"], acknowledgedRepeat: true }, answer: "part.act_not_allowed" },
  { name: "an unknown class asked for permits nothing", card: { lastingClasses: ["create_new"] }, asked: { inputs: { query: "a" }, permittedConsequences: ["everything"], acknowledgedRepeat: true }, answer: "part.act_not_allowed" },
  { name: "a class the build was not allowed", card: { lastingClasses: ["create_new"] }, asked: { caller: "build", inputs: { query: "a" }, permittedConsequences: [] }, answer: "part.act_not_allowed" },
  { name: "not allowed wins over the wrong site", card: { lastingClasses: ["delete"] }, origin: "https://elsewhere.example", answer: "part.act_not_allowed" },
  // part.wrong_site
  { name: "another origin", origin: "https://elsewhere.example", answer: "part.wrong_site" },
  { name: "another scheme is another origin", origin: "http://shop.example", answer: "part.wrong_site" },
  { name: "another port is another origin", origin: "https://shop.example:8443", answer: "part.wrong_site" },
  { name: "a sub-domain is another origin", origin: "https://www.shop.example", answer: "part.wrong_site" },
  { name: "an origin nobody could read", origin: undefined, answer: "part.wrong_site" },
  { name: "a part with no sites", card: { sites: [] }, answer: "part.wrong_site" },
  { name: "the second of two sites is the site", card: { sites: ["https://first.example", SITE] }, answer: "ok" },
  { name: "wrong site wins over not at start", origin: "https://elsewhere.example", facts: ["false"], answer: "part.wrong_site" },
  // part.not_at_start
  { name: "a start condition false", facts: ["false"], answer: "part.not_at_start" },
  { name: "a start condition unknown", facts: ["unknown"], answer: "part.not_at_start" },
  { name: "a start condition nobody answered", facts: [], answer: "part.not_at_start" },
  { name: "one of two start conditions unknown", snapshot: { conditions: [CONDITION, CONDITION] }, facts: ["true", "unknown"], answer: "part.not_at_start" },
  { name: "both of two start conditions true", snapshot: { conditions: [CONDITION, CONDITION] }, facts: ["true", "true"], answer: "ok" },
  { name: "no check and not bringing its own page", snapshot: { conditions: [], source: "none" }, facts: [], answer: "part.not_at_start" },
  { name: "no check but bringing its own page", snapshot: { conditions: [], selfArrives: true, source: "navigate" }, facts: [], answer: "ok" },
  { name: "bringing its own page still needs its site", snapshot: { conditions: [], selfArrives: true, source: "navigate" }, facts: [], origin: "https://elsewhere.example", answer: "part.wrong_site" },
  // part.confirm_repeat
  { name: "a person, a lasting part, not told yet", card: { lastingClasses: ["modify_existing"] }, asked: { inputs: { query: "a" }, permittedConsequences: ["modify_existing"] }, answer: "part.confirm_repeat" },
  { name: "a person, a lasting part, told", card: { lastingClasses: ["modify_existing"] }, asked: { inputs: { query: "a" }, permittedConsequences: ["modify_existing"], acknowledgedRepeat: true }, answer: "ok" },
  { name: "an acknowledgement that is not true is none", card: { lastingClasses: ["modify_existing"] }, asked: { inputs: { query: "a" }, permittedConsequences: ["modify_existing"], acknowledgedRepeat: false }, answer: "part.confirm_repeat" },
  { name: "the question waits for the page", card: { lastingClasses: ["modify_existing"] }, asked: { inputs: { query: "a" }, permittedConsequences: ["modify_existing"] }, facts: ["false"], answer: "part.not_at_start" },
  { name: "a build is not asked it", card: { lastingClasses: ["modify_existing"] }, asked: { caller: "build", inputs: { query: "a" }, permittedConsequences: ["modify_existing"] }, answer: "ok" },
  { name: "a person, a read, nothing to confirm", answer: "ok" }
];

function inputOf(entry: Case): AutomationStudioPartGuardInput {
  const conditions = entry.snapshot?.conditions ?? [CONDITION];
  const defaults = Object.entries(entry.snapshot?.defaults ?? {}).map(([id, defaultValue]) => ({ id, name: id, valueType: "string", required: true, defaultValue }));
  return {
    card: entry.card === null ? undefined : { sites: [SITE], inputs: [{ id: "query", name: "Search words", required: true }], lastingClasses: [], ...entry.card },
    snapshot: entry.snapshot === null ? undefined : {
      start: { source: entry.snapshot?.source ?? "first_step", conditions, ...(entry.snapshot?.selfArrives ? { selfArrives: true as const } : {}) },
      graph: { interface: { inputs: defaults, outputs: [] }, nodes: [], edges: [] }
    } as unknown as AutomationStudioPartGuardInput["snapshot"],
    asked: { caller: "person", inputs: { query: "shoes" }, ...entry.asked },
    page: { origin: "origin" in entry ? entry.origin : SITE, startFacts: entry.facts ?? ["true"] }
  };
}

describe("automationStudioPartGuard", () => {
  it.each(TABLE)("$name: $answer", (entry) => {
    const answer = automationStudioPartGuard(inputOf(entry));
    expect("ok" in answer ? "ok" : answer.refused).toBe(entry.answer);
  });

  it("names every class it will do again, in a person's words, with no class ids", () => {
    const answer = automationStudioPartGuard(inputOf({ name: "", card: { lastingClasses: ["move_money", "create_new"] }, asked: { inputs: { query: "a" }, permittedConsequences: ["move_money", "create_new"] }, answer: "" }));
    expect(answer).toMatchObject({ refused: "part.confirm_repeat", classes: ["move_money", "create_new"] });
    const { message } = answer as { message: string };
    expect(message).toContain("spend, refund or move money");
    expect(message).toContain("create something new that stays");
    expect(message).toContain("again");
    expect(message).not.toMatch(/move_money|create_new/u);
  });

  it("carries no target, address or value in any message", () => {
    const value = "VALUE-GIVEN";
    for (const entry of TABLE) {
      const shaped = inputOf(entry);
      const inputs = Object.fromEntries(Object.entries(shaped.asked.inputs).map(([key, given]) => [key, typeof given === "string" && given.trim() ? value : given]));
      const answer = automationStudioPartGuard({ ...shaped, asked: { ...shaped.asked, inputs } });
      if ("ok" in answer) continue;
      for (const hidden of [value, "#go", "shop.example", "elsewhere.example"]) expect(answer.message).not.toContain(hidden);
    }
  });

  it("answers with the code set it declares, and no other", () => {
    const seen = new Set(TABLE.map((entry) => entry.answer));
    expect([...seen].sort()).toEqual(["ok", "part.act_not_allowed", "part.confirm_repeat", "part.input_missing", "part.input_unknown", "part.not_at_start", "part.not_found", "part.wrong_site"]);
  });
});
