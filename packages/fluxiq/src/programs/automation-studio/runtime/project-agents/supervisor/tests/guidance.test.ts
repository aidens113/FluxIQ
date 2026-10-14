import { describe, expect, it } from "vitest";
import { AUTOMATION_STUDIO_PROJECT_SUPERVISOR_GUIDANCE } from "../guidance.ts";

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
      for (const scenario of SCENARIOS) {
        expect(text.toLowerCase(), at).not.toContain(scenario);
        for (const word of scenario.split("-")) expect(text.toLowerCase(), `${at}: ${word}`).not.toMatch(new RegExp(`\b${word}\b`, "u"));
      }
      expect(text.match(SITE_WORDS)?.[0], at).toBeUndefined();
      expect(text.match(LAB_TASK_WORDS)?.[0], at).toBeUndefined();
    }
  });

  it("keeps each tool description within what a provider takes", () => {
    for (const [at, text] of strings(AUTOMATION_STUDIO_PROJECT_SUPERVISOR_GUIDANCE.tools)) expect(text.length, at).toBeLessThanOrEqual(2000);
  });
});
