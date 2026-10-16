// An unsure call's doubt that a step chose an option the request does not name
// is asked once more where the option is the request's own words (t655, A8
// frozen pair 5 towels `run-mva6mlo8-f519063c`); its answer takes its place,
// so a yes still needs two yeses. A doubt about a facet whose words are not the
// request's stands, and a no is never asked again on this ground. A library
// catalogue: no task, site, item or answer of any realistic scenario.
import { describe, expect, it, vi } from "vitest";
import type { AutomationStudioResultReadAccount, AutomationStudioResultVerification, AutomationStudioRunResultSummary } from "../../contracts/index.ts";
import { automationStudioResultVerificationAgreement, automationStudioResultVerificationReaskContradicted } from "../../agreement/index.ts";
import { automationStudioRequestWording } from "../../request-rows/index.ts";
import { automationStudioResultVerdict } from "../../verdict.ts";

const read: AutomationStudioResultReadAccount = {
  nodeId: "read", definitionId: "extract_list", pagesRead: 1, stop: "control_absent", truncated: false, kept: 9,
  narrowedBefore: [{
    nodeId: "format", label: "Choose Hardcover format", control: "Hardcover (40)", effect: "same_page",
    group: "Format", chose: "Hardcover", leftOptions: [{ words: "Paperback", count: 12 }, { words: "Audiobook", count: 3 }], resultCount: { before: 55, after: 40 }
  }]
};

const summary: AutomationStudioRunResultSummary = {
  schemaVersion: "automation-studio.run-result-summary.v1",
  totalRecordCount: 9, totalRefusedCount: 0, totalRowsMissingRequired: 0, recordSetCount: 0, recordSets: [],
  reads: [read],
  flowShape: [{ nodeId: "format", definitionId: "click" }, { nodeId: "read", definitionId: "extract_list" }],
  withheld: false
};

const verdict = (answersRequest: "yes" | "no" | "unknown", diagnosis: { expected?: string; observed?: string; changed?: string } = {}): AutomationStudioResultVerification =>
  automationStudioResultVerdict({ summary, diagnosis: { answersRequest, ...diagnosis }, basis: "model" });

const DOUBT = { expected: "Every book on rivers the request asks for.", observed: "The Choose Hardcover format step chose Hardcover, an option the request does not name, so paperback books may be missing." };
const doubt = verdict("unknown", DOUBT);
const no = verdict("no", { ...DOUBT, changed: "Remove the format step." });
const yes = verdict("yes", { expected: "Every book on rivers.", observed: "9 rows, each a book on rivers." });

/** The agreement's input for a request, with its wording and text, as the verification passes them. */
function asked(request: string, first: AutomationStudioResultVerification, second: AutomationStudioResultVerification) {
  return { first, second, confirmAnswer: true, reads: [read], requestText: request, wording: automationStudioRequestWording([{ title: "Goal", body: request }], summary) };
}

const HARDCOVER = "List every hardcover book about rivers in the library catalogue, with title and author.";
const ANY_BOOK = "List every book about rivers in the library catalogue, with title and author.";

describe("an unsure that a step chose an option the request does not name", () => {
  it("is marked where the option is the request's own words, naming them and the options the step left out", () => {
    const agreed = automationStudioResultVerificationAgreement(asked(HARDCOVER, doubt, yes));
    expect(agreed).toMatchObject({ verdict: "unsure", contradictedUnsure: { call: 1, about: "narrowing" } });
    expect(agreed.contradictedUnsure?.record).toBe("\"Choose Hardcover format\" chose \"Hardcover\" in \"Format\", and the request itself says \"Hardcover\". The options it left unchosen: \"Paperback\" (12), \"Audiobook\" (3). The page stated 55 results before it and 40 after.");
  });

  it("is asked again once, and a yes there beside the other yes is two yeses", async () => {
    const input = asked(HARDCOVER, doubt, yes);
    const settled = automationStudioResultVerificationAgreement(input);
    const ask = vi.fn(async (_recheck: string) => yes);
    const outcome = await automationStudioResultVerificationReaskContradicted({ ...input, settled, ask });
    expect(ask).toHaveBeenCalledTimes(1);
    expect(ask.mock.calls[0]![0]).toContain("it took a step to have chosen an option the request does not name");
    expect(ask.mock.calls[0]![0]).toContain("\"Paperback\" (12)");
    expect(outcome).toMatchObject({ verdict: "answers", verdicts: ["unsure", "answers", "answers"], calls: 3, contradictedUnsure: { call: 1, about: "narrowing", reasked: true } });
  });

  it("stays unsure where the re-asked call doubts again, and is never asked a second time", async () => {
    const input = asked(HARDCOVER, doubt, yes);
    const settled = automationStudioResultVerificationAgreement(input);
    const ask = vi.fn(async (_recheck: string) => doubt);
    const outcome = await automationStudioResultVerificationReaskContradicted({ ...input, settled, ask });
    expect(ask).toHaveBeenCalledTimes(1);
    expect(outcome).toMatchObject({ verdict: "unsure", calls: 3, contradictedUnsure: { reasked: true } });
    expect(await automationStudioResultVerificationReaskContradicted({ ...input, settled: outcome, ask })).toBe(outcome);
  });

  it("stands where the request does not say the option's words", () => {
    expect(automationStudioResultVerificationAgreement(asked(ANY_BOOK, doubt, yes))).not.toHaveProperty("contradictedUnsure");
  });

  it("is never a reason to ask a no again", async () => {
    const input = asked(HARDCOVER, no, yes);
    const settled = automationStudioResultVerificationAgreement(input);
    expect(settled).not.toHaveProperty("contradictedUnsure");
    const ask = vi.fn(async (_recheck: string) => yes);
    await automationStudioResultVerificationReaskContradicted({ ...input, settled, ask });
    expect(ask.mock.calls.some(([recheck]) => recheck.includes("an option the request does not name"))).toBe(false);
  });
});
