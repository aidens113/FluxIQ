// A step that chose the request's own words before the read, and a later plan
// that no longer has it and tests those words nowhere (t666, A8 frozen pair 8
// candidate towels `run-mvam0lys-2d3eb090`, revision 8), on a library's
// catalogue search: no task, site, item or answer of any realistic scenario.
import { describe, expect, it } from "vitest";
import { automationStudioResultKeptStepsDropped, type AutomationStudioResultConditionPlan } from "../index.ts";

const REQUEST = "Goal\nList every audiobook in the branch catalogue about mountain birds, narrated in full, with title and narrator.";
const FORMAT = { target: "t40", checked: true };
const RATING = { target: "t52", checked: true };
const READ = { extract: { where: [{ field: "length", atLeast: 60 }], fields: { title: "title", narrator: "narrator" } } };

/** A plan of the search page, its filter steps, and one read. */
function plan(...steps: Array<{ key: string; parameters: object }>): AutomationStudioResultConditionPlan {
  return { subflows: [{ key: "main", nodes: [{ key: "s1", parameters: { url: "https://catalogue.test/search?q=mountain+birds" } }, ...steps] }] };
}

const RAN = plan({ key: "s2", parameters: FORMAT }, { key: "s3", parameters: RATING }, { key: "s4", parameters: READ });

/** The trial's feedback as the gate keeps it: the read and the steps before it. */
const TRIAL = {
  revision: 3, verdict: "no",
  feedback: { code: "candidate.trial_judged_no", reads: [{ nodeId: "node.bootstrap.9e2f.main.s4", narrowedBefore: [
    { nodeId: "node.bootstrap.9e2f.main.s1", label: "open the search results", effect: "new_page", resultCount: { before: 0, after: 84 } },
    { nodeId: "node.bootstrap.9e2f.main.s2", label: "choose the audiobook format", control: "Audiobook (21)", group: "Format", chose: "Audiobook", leftOptions: [], addedChoice: true, resultCount: { before: 84, after: 21 } },
    { nodeId: "node.bootstrap.9e2f.main.s3", label: "choose four stars and up", group: "Rating", chose: "4 stars & up", addedChoice: true, resultCount: { before: 21, after: 21 } }
  ] }] }
};

const dropped = (now: AutomationStudioResultConditionPlan, options: { refused?: ReadonlySet<string>; trial?: unknown; requestText?: string } = {}) =>
  automationStudioResultKeptStepsDropped({ trial: options.trial ?? TRIAL, revision: 3, ran: RAN, plan: now, requestText: options.requestText ?? REQUEST, refused: options.refused, subject: "Flow" });

describe("a step that chose the request's own words (t666)", () => {
  it("is named once its plan no longer has it and no condition tests its words, with the request's words it is", () => {
    const found = dropped(plan({ key: "s2", parameters: RATING }, { key: "s3", parameters: READ }));
    expect(found?.dropped.map((step) => step.nodeId)).toEqual(["node.bootstrap.9e2f.main.s2"]);
    expect(found?.said).toContain("Step \"choose the audiobook format\" (node.bootstrap.9e2f.main.s2), as revision 3 wrote it ({\"checked\":true,\"target\":\"t40\"}), chose \"Audiobook\" in \"Format\", and the request itself says \"Audiobook\".");
    expect(found?.said).toContain("Core did not see the rows such a step removed, so this is no finding that the step was right");
    expect(found?.said).toContain("submit the same change again: Core refuses this once, not twice");
  });

  it("is not named while any step has it as written, in any subflow or place", () => {
    expect(dropped(plan({ key: "s7", parameters: { checked: true, target: "t40" } }, { key: "s8", parameters: READ }))).toBeUndefined();
    expect(dropped({ subflows: [...plan({ key: "s2", parameters: READ }).subflows, { key: "filters", nodes: [{ key: "a", parameters: FORMAT }] }] })).toBeUndefined();
  });

  it("is not named where a condition of the plan tests its words", () => {
    const read = { extract: { where: [{ field: "length", atLeast: 60 }, { field: "format", contains: "audiobook" }], fields: { title: "title" } } };
    expect(dropped(plan({ key: "s2", parameters: read }))).toBeUndefined();
  });

  it("names no step whose option is not the request's words, nor one already hinted, nor from feedback not of the shape", () => {
    // The rating step's option is not the request's words: dropping it says nothing.
    expect(dropped(plan({ key: "s2", parameters: FORMAT }, { key: "s3", parameters: READ }))).toBeUndefined();
    // The request does not say "audiobook": nothing either.
    expect(dropped(plan({ key: "s2", parameters: READ }), { requestText: "Goal\nList every book in the branch catalogue about mountain birds." })).toBeUndefined();
    expect(dropped(plan({ key: "s2", parameters: READ }), { refused: new Set([JSON.stringify(FORMAT, Object.keys(FORMAT).sort())]) })).toBeUndefined();
    expect(dropped(plan({ key: "s2", parameters: READ }), { trial: { feedback: { reads: "none" } } })).toBeUndefined();
    expect(dropped(plan({ key: "s2", parameters: READ }), { trial: "trial" })).toBeUndefined();
  });

  it("is said in words naming no site, task or product of a realistic scenario", () => {
    const words = String(dropped(plan({ key: "s2", parameters: READ }))?.said).replace(/"[^"]*"/gu, "").replace(/\([^)]*\)/gu, "");
    expect(words).not.toMatch(/\b(?:paper|towels?|holders?|pickup|retailer|valueridge|sponsored)\b/iu);
  });
});
