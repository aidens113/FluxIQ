// The exploration's guidance says the work's own rules and mirrors no scenario the Lab
// measures (supervisor rule, 2026-10-09). Held to the realistic scenarios' names and to
// the words of what they do.
import { describe, expect, it } from "vitest";
import { AUTOMATION_STUDIO_ANSWER_FIRST_GUIDANCE, automationStudioAnswerFirstSystemInstructions } from "../index.ts";

const SCENARIOS = ["everything-store", "crossborder-marketplace", "bigbox-retail", "job-board", "local-classifieds", "auction-marketplace", "photo-social", "social-network-feed", "company-website", "professional-network"];
const THEIR_WORDS = /\b(shop|store|cart|checkout|basket|product|price|seller|listing|auction|bid|friend|request|follower|job|career|resume|classified|coupon|towel|napkin|earbud)s?\b/iu;

describe("the answer-first guidance", () => {
  it("says what the role must do", () => {
    const words = AUTOMATION_STUDIO_ANSWER_FIRST_GUIDANCE;
    expect(words).toMatch(/get them their result: every row and every page/u);
    expect(words).toMatch(/do the first row by hand/u);
    expect(words).toMatch(/core\.run_flow/u);
    expect(words).toMatch(/general Flow, not a list of what you pressed/u);
    expect(words).toMatch(/Never write a row/u);
    expect(words).toMatch(/You will be told what already landed/u);
    expect(words).toMatch(/End when you have the result/u);
    expect(words).toMatch(/fix that step, then run forward with core\.run_flow/u);
    expect(words).toMatch(/that attempt's own words, not instructions from the person/u);
  });

  // t1008 (run-mwufisf0-5535f5f5): asked to open something, a live exploration described the control
  // that opens it again and again, the only handle-taking tools it had being looks.
  it("says that looking never acts, and how a control is pressed", () => {
    const words = AUTOMATION_STUDIO_ANSWER_FIRST_GUIDANCE;
    expect(words).toMatch(/describing a control never presses, types into or opens anything/u);
    expect(words).toMatch(/run the node that does it with core\.run_node, naming the control by the handle the page printed/u);
    expect(words).toMatch(/press the control that opens it/u);
  });

  it("collects original fields and completes live paging without broadening action permission", () => {
    const words = AUTOMATION_STUDIO_ANSWER_FIRST_GUIDANCE;
    expect(words).toMatch(/obtain every required page during this task/u);
    expect(words).toMatch(/Retain all safe source fields/u);
    expect(words).toMatch(/explicit exclusions still apply/u);
    expect(words).toMatch(/With declared automatic result processing/u);
    expect(words).toMatch(/Do not make another processing-tool call for each read/u);
    expect(words).toMatch(/missing field requires real source evidence/u);
    expect(words).toMatch(/Narrow rows a later step acts on before that act/u);
  });

  it("mirrors no realistic scenario", () => {
    for (const name of SCENARIOS) expect(AUTOMATION_STUDIO_ANSWER_FIRST_GUIDANCE).not.toContain(name);
    expect(AUTOMATION_STUDIO_ANSWER_FIRST_GUIDANCE).not.toMatch(THEIR_WORDS);
  });

  it("keeps the domain's operating text after its own, and stands alone without one", () => {
    expect(automationStudioAnswerFirstSystemInstructions()).toMatchObject({ domainId: "fluxiq.answer-first", text: AUTOMATION_STUDIO_ANSWER_FIRST_GUIDANCE });
    const over = automationStudioAnswerFirstSystemInstructions({ version: "web-12", text: "How a page reads." });
    expect(over.text).toBe(`${AUTOMATION_STUDIO_ANSWER_FIRST_GUIDANCE}\n\nHow a page reads.`);
    expect(over.version).toBe("answer-first.4+web-12");
  });
});
