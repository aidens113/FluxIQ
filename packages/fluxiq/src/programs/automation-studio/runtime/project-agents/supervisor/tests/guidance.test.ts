import { describe, expect, it } from "vitest";
import type { JsonObject } from "../../../../../../core/index.ts";
import { AUTOMATION_STUDIO_PROJECT_SUPERVISOR_GUIDANCE } from "../guidance.ts";
import { AUTOMATION_STUDIO_PROJECT_SUPERVISOR_TOOL_IDS as IDS } from "../tool-ids.ts";
import { automationStudioProjectSupervisorTools } from "../tools.ts";

// User rule: model guidance never teaches to the test. The lists are the ones
// `llm/harness/tests/in-run-repair-slot.test.ts` holds the in-run repair
// instruction to: the ten realistic scenarios, their sites' plain words and
// the words of their tasks.
const SCENARIOS = ["everything-store", "crossborder-marketplace", "bigbox-retail", "job-board", "local-classifieds", "auction-marketplace", "photo-social", "social-network-feed", "company-website", "professional-network"];
const SITE_WORDS = /store|shop|marketplace|retail|bigbox|crossborder|classified|auction|photo|social|network|feed|company|website|professional|product|seller|listing|follow|like\b|post\b|profile|resume|vacanc|apply/iu;
const LAB_TASK_WORDS = /friend|earbud|kettle|basket|cart\b|towel|napkin|dish soap|pickup|watchlist|bid\b|auction|coupon|connection|invitation|saved item|classified|giveaway|glaze|moon jar|quote|gas engineer|job|rust role|group post|feed|digest|open day|rating|shirt|colour|size\b|quantity|rate limit|brightaisle|farbazaar|valueridge|kerbfind|guildline|hammerline|circleway|voltbay|tidewell/iu;

/** Every string the guidance holds, with where it is. */
function strings(value: unknown, at = "guidance"): Array<[string, string]> {
  if (typeof value === "string") return [[at, value]];
  if (value && typeof value === "object") return Object.entries(value).flatMap(([key, nested]) => strings(nested, `${at}.${key}`));
  return [];
}

describe("the supervisor's guidance", () => {
  const all = strings(AUTOMATION_STUDIO_PROJECT_SUPERVISOR_GUIDANCE);

  it("holds every tool description, the way of working, the example and every refusal", () => {
    expect(all.length).toBeGreaterThan(20);
    for (const [at, text] of all) expect(text.trim(), at).not.toBe("");
  });

  it("names none of the ten realistic scenarios, their sites or their tasks", () => {
    for (const [at, text] of all) {
      // The names whole; their distinctive pieces are SITE_WORDS and LAB_TASK_WORDS. A per-piece check here never
      // ran (`\b` in a template literal is a backspace, t673) and would only add plain words: everything, board, local.
      for (const scenario of SCENARIOS) expect(text.toLowerCase(), at).not.toContain(scenario);
      expect(text.match(SITE_WORDS)?.[0], at).toBeUndefined();
      expect(text.match(LAB_TASK_WORDS)?.[0], at).toBeUndefined();
    }
  });

  // t588 made a return's trials a list of receipt references and a repair's failingReceipt one of them; t590 keeps unchanged subflows' proposals across an amendment.
  it("describes a return's trials and a repair's failingReceipt as they are now, and what an amendment keeps", () => {
    const { dispatch, amendPlan } = AUTOMATION_STUDIO_PROJECT_SUPERVISOR_GUIDANCE.tools;
    expect(dispatch).toContain("trials (a list holding one receipt reference for each trial its builder ran)");
    expect(dispatch).toContain("failingReceipt: one entry of the trials an earlier return of that subflow listed, the object copied whole");
    // t595: a repair names a trial that did not pass, its builder is shown it, and a brief that changed nothing is said so.
    expect(dispatch).toContain("It must name a trial that did not pass; its builder is shown what that trial said.");
    expect(dispatch).toContain("changedNothing");
    expect(amendPlan).toContain("listed with reworded");
    expect(amendPlan).toContain("A part whose facts changed drops it");
    expect(amendPlan).toContain("proposalsKept and proposalsDropped");
    expect(amendPlan).not.toContain("so send new briefs for every subflow the new plan needs");
    const schema = automationStudioProjectSupervisorTools().find((tool) => tool.toolId === IDS.dispatch)!.inputSchema as JsonObject;
    const failing = ((((schema.properties as JsonObject).briefs as JsonObject).items as JsonObject).properties as JsonObject).failingReceipt;
    expect(failing).toEqual({ type: "object", properties: { kind: { type: "string", enum: ["subflow_trial", "candidate_trial"] }, receiptId: { type: "string" }, digest: { type: "string" } }, required: ["kind", "receiptId", "digest"], additionalProperties: false });
  });

  // t673: asks done on one page are one subflow; a find that only leads to an act is that act's; the page is the hand-off.
  it("teaches when one subflow does and when to split, with examples from sites no Lab scenario uses", () => {
    const { howToWork, example } = AUTOMATION_STUDIO_PROJECT_SUPERVISOR_GUIDANCE;
    expect(howToWork).not.toContain("split it into stretches");
    expect(howToWork).toContain("a search, find or open that only leads to an act is no part, but belongs to the part of the act it serves");
    expect(howToWork).toContain("asks carried out on the same page in one pass are one subflow too");
    expect(howToWork).toContain("Split into several only where a later act needs a value read earlier, or where stretches act on different pages");
    expect(howToWork).toContain("the page is the hand-off");
    // The supervisor's evidence holds the start's route state, never the page view (`../role-tools.ts` strips opening looks).
    expect(howToWork).not.toContain("The start page as the build found it is already in your evidence");
    expect(howToWork).toContain("not the page itself");
    expect(example).toContain("one subflow, renew_loans, parts [p1], no inputs or outputs");
    expect(example).toContain("one subflow, book_plot, parts [p1, p2], no inputs or outputs");
    expect(example).toContain("place_hold with parts [p2], inputs [titles] and after [find_titles]");
    const forbidden = [...SCENARIOS, ...SCENARIOS.flatMap((scenario) => scenario.split("-")), "cart", "coupon", "hub", "towel", "earbud", "friend request", "pickup"];
    for (const word of forbidden) expect(example.toLowerCase(), word).not.toMatch(new RegExp(`\\b${word}`, "u"));
  });

  it("keeps each tool description within what a provider takes", () => {
    for (const [at, text] of strings(AUTOMATION_STUDIO_PROJECT_SUPERVISOR_GUIDANCE.tools)) expect(text.length, at).toBeLessThanOrEqual(2000);
  });
});
