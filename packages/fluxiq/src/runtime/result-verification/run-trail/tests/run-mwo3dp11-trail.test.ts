// t963 J3: what the completion judge is now shown of live run `run-mwo3dp11-a47a032d`, rebuilt provider-free from the
// run's own step files (`./fixtures/run-mwo3dp11-calls.json`: steps 0122-0182, each call as sent and the domain's
// answer as recorded). That run's 19 checks were shown seven correct rows, the end page and the reads' labels, and
// refused the rows 14 times: a condition shown beside every kept row was "not shown" for want of a column, the order
// was "unverified" though the attempt used the site's own date sort, and paging "might go on" though the next-page
// control had ended on the last page. Here the same evidence goes through the chain's trail step
// (`../of/call.ts`) and the Flow-less judge's summary (`../../flow-less/judged-summary.ts`), and the judge's input is
// checked to carry each of the three. Then the guidance is checked to name no realistic scenario, site or task.

import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import type { JsonObject } from "../../../../core/index.ts";
import { AUTOMATION_STUDIO_FLOW_LESS_QUESTION, automationStudioFlowLessJudgedSummary, automationStudioFlowLessSummaryFitting, type AutomationStudioFlowLessSummary } from "../../flow-less/index.ts";
import type { AutomationStudioResultTrail, AutomationStudioResultTrailShownStep } from "../../contracts/index.ts";
import { AUTOMATION_STUDIO_RESULT_TRAIL_NOTE } from "../note.ts";
import { automationStudioResultTrailOfAttempts, automationStudioResultTrailStepOfCall } from "../of/index.ts";

type Recorded = { recordedStep: number; toolId: string; value: JsonObject; answer: unknown };

const here = dirname(fileURLToPath(import.meta.url));
const recorded = (JSON.parse(readFileSync(join(here, "fixtures", "run-mwo3dp11-calls.json"), "utf8")) as { calls: Recorded[] }).calls;

/** The request and the seven rows judge 0183 held, as the run's step file shows them. */
const INSTRUCTIONS = "On Rolefinch I only want jobs I can apply for through Rolefinch's own Easily apply, not on an employer's careers site. Find every job that is fully remote and based in the UK and offers Easily apply, going through every page of results and listing each job once, and leave out any whose posting shows no salary. Give me a table with columns title, company and salary, where salary is written exactly as the posting shows it, newest posting first, and where two postings show the same posting date, in the order Rolefinch's results list them.";
const ROWS: JsonObject[] = [
  { title: "Trust & Safety Engineer", company: "Pinecrest Retail", salary: "£75,000 – £85,000 a year" },
  { title: "Platform Engineer", company: "Halvard Labs", salary: "£70,000 – £82,000 a year" },
  { title: "Senior Rust Engineer", company: "Marlowe Freight", salary: "Up to £95,000 a year" },
  { title: "QA Engineer", company: "Saltmarsh Games", salary: "£42,000 – £50,000 a year" },
  { title: "Rust Engineer, Graduate Programme", company: "Oakridge Freight", salary: "£38,000 a year" },
  { title: "Senior Rust Engineer", company: "Quillmark Labs", salary: "£60,000 – £75,000 a year" },
  { title: "Technical Writer", company: "Parsec Grid", salary: "£50,000 – £58,000 a year" }
];

function attempt(): AutomationStudioFlowLessSummary {
  return {
    instructions: INSTRUCTIONS,
    rows: { totalRows: ROWS.length, truncated: false, columns: ["title", "company", "salary"].map((id) => ({ id, label: id })), rows: ROWS },
    acts: [],
    // Each call as the attempt's chain hands it on (`SVC/answer-first/attempt/call-chain.ts`).
    trail: recorded.map((call) => automationStudioResultTrailStepOfCall({ toolId: call.toolId, value: call.value }, call.answer))
  };
}

function sentTrail(): AutomationStudioResultTrail {
  const sent = automationStudioFlowLessJudgedSummary(attempt(), []).sent as unknown as { trail?: AutomationStudioResultTrail };
  expect(sent.trail).toBeDefined();
  return sent.trail!;
}

/** The lines of a page view from the line naming `title` up to the next item, where the item names `company` too. */
function itemBlock(page: string, title: string, company: string): string[] | undefined {
  const lines = page.split("\n");
  for (let at = 0; at < lines.length; at += 1) {
    if (!lines[at]!.includes(`"${title}"`)) continue;
    const block: string[] = [];
    for (let next = at + 1; next < lines.length && !/^\s*- \d+\/\d+\s*$/u.test(lines[next]!) && !/ h2 /u.test(lines[next]!); next += 1) block.push(lines[next]!);
    if (block.some((line) => line.includes(`"${company}"`))) return block;
  }
  return undefined;
}

function pageOf(step: AutomationStudioResultTrailShownStep): string | undefined {
  const found = step.found;
  return found !== null && typeof found === "object" && !Array.isArray(found) && typeof found.page === "string" ? found.page : undefined;
}

describe("the judge's input for run-mwo3dp11's attempt (t963 J3)", () => {
  it("carries every call the attempt made, in order, with its note", () => {
    const trail = sentTrail();
    expect(trail.entries).toHaveLength(recorded.length);
    expect(trail.entries.map((step) => step.n)).toEqual(recorded.map((_, at) => at + 1));
    expect(trail.note).toBe(AUTOMATION_STUDIO_RESULT_TRAIL_NOTE);
  });

  it("carries the site's own date sort: the press that sorted, and every later read on the sorted list", () => {
    const trail = sentTrail();
    const sort = trail.entries.find((step) => step.did === "web.output.dom-click" && step.where?.endsWith("?sort=date"));
    expect(sort, "the press that sorted the list by date").toBeDefined();
    expect((sort!.found as JsonObject).control).toBe("date");
    // Every read after it that answered from a page (one the site turned away answers with no address).
    const reads = trail.entries.filter((step) => step.did === "web.output.dom-extract_list" && step.n > sort!.n && step.where !== undefined);
    expect(reads.length).toBeGreaterThanOrEqual(5);
    for (const read of reads) expect(read.where, `read at step ${read.n}`).toMatch(/sort=date/u);
  });

  it("carries where paging ended: the last next-page press, on the last page, answered that there is no further page", () => {
    const trail = sentTrail();
    const nexts = trail.entries.filter((step) => step.did === "web.output.dom-next_page");
    const last = nexts.at(-1)!;
    expect(last.n).toBe(trail.entries.length);
    expect(last.where).toMatch(/sort=date&page=5$/u);
    expect(JSON.stringify(last.found)).toContain("The list has no next page.");
    expect(JSON.stringify(last.found)).toContain("\"route\":\"ended\"");
    // And each page before it was reached by a next-page press that moved on.
    for (const page of [2, 3, 4, 5]) expect(nexts.some((step) => step.where?.endsWith(`page=${page}`)), `page ${page}`).toBe(true);
  });

  it("carries the asked-for tag on every kept row's page, beside that row, though no column holds it", () => {
    const trail = sentTrail();
    for (const row of ROWS) {
      const shown = trail.entries.flatMap((step) => {
        const page = pageOf(step);
        const block = page ? itemBlock(page, String(row.title), String(row.company)) : undefined;
        return block ? [{ step, block }] : [];
      });
      expect(shown.length, `${String(row.title)} at ${String(row.company)}`).toBeGreaterThan(0);
      expect(shown.every(({ block }) => block.some((line) => line.includes("\"Easily apply\""))), `${String(row.title)} at ${String(row.company)}`).toBe(true);
      expect(shown.every(({ step }) => /sort=date/u.test(step.where ?? "")), `${String(row.title)} read from the sorted list`).toBe(true);
    }
  });

  it("is built the same from the same evidence: byte for byte, with no time or minted id in it", () => {
    const once = JSON.stringify(automationStudioFlowLessJudgedSummary(attempt(), []).sent);
    const again = JSON.stringify(automationStudioFlowLessJudgedSummary(attempt(), []).sent);
    expect(again).toBe(once);
    expect(once).not.toMatch(/"(?:startedAt|finishedAt|actedAt)":/u);
    expect(once).not.toMatch(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/iu);
  });

  it("keeps the trail and the final data whole longest when the request must be shortened", () => {
    const sent = automationStudioFlowLessJudgedSummary({ ...attempt(), endView: { view: { page: "the end page" } }, answerText: "Seven rows." }, []).sent;
    const forms = automationStudioFlowLessSummaryFitting(sent);
    const items = ((forms.at(-1) as unknown as { summarised: { items: string[] } }).summarised.items);
    const firstTrail = items.findIndex((item) => item.startsWith("trail."));
    const rows = items.findIndex((item) => item.startsWith("recordSets["));
    expect(items.indexOf("endView.view")).toBeLessThan(firstTrail);
    expect(items.indexOf("answerText.text")).toBeLessThan(firstTrail);
    expect(firstTrail).toBeLessThan(rows);
    // The trail's own findings go oldest first, after what each step was asked.
    const found = items.filter((item) => /^trail\.entries\[\d+\]\.found$/u.test(item)).map((item) => Number(/\[(\d+)\]/u.exec(item)![1]));
    expect(found).toEqual([...found].sort((a, b) => a - b));
    expect(items.findIndex((item) => item.endsWith(".found"))).toBeGreaterThan(items.findIndex((item) => item.endsWith(".asked")));
  });
});

// The third attempt ran its saved Flow on the engine (steps 0239-0267, `flow-*`), and its eight judges were shown none of it.
// The step files record each engine step's node, definition and status in run order; the saved steps' parameters are
// recorded on the attempt's next call (0269, `held`), and the page the run left is that call's own answer. They record no
// view between steps, so only the page left is given as a view here. `./fixtures/run-mwo3dp11-replay.json`.
type Replay = {
  steps: { recordedStep: number; nodeId: string; definitionId: string; status: string }[];
  held: { node: string; parameters?: JsonObject }[];
  left: { location: string; page: string };
};
const replay = JSON.parse(readFileSync(join(here, "fixtures", "run-mwo3dp11-replay.json"), "utf8")) as Replay;
/** The order the third attempt's rows came in, as judges 0331-0510 were shown them. */
const REPLAY_ORDER = ["Pinecrest Retail", "Marlowe Freight", "Oakridge Freight", "Quillmark Labs", "Halvard Labs", "Saltmarsh Games", "Parsec Grid"];

/** The engine's trace of that run: each step's node and status as recorded, a saved step's parameters as its inputs, the page left after the last. */
function replayTrace() {
  const control = (definition: string) => definition.startsWith("builtin.control.");
  const order = [...new Set(replay.steps.filter((step) => !control(step.definitionId)).map((step) => step.nodeId))];
  return replay.steps.map((step, at) => {
    const held = control(step.definitionId) ? undefined : replay.held[order.indexOf(step.nodeId)];
    return {
      nodeId: step.nodeId,
      definitionId: step.definitionId,
      status: step.status,
      ...(held?.parameters ? { inputs: held.parameters } : {}),
      ...(at === replay.steps.length - 1 ? { stateRefs: { afterAction: { summary: { page: replay.left.page } } } } : {})
    };
  });
}

describe("the judge's input for run-mwo3dp11's saved-Flow run (t963, attempt 3)", () => {
  const sent = () => {
    const rows = REPLAY_ORDER.map((company) => ROWS.find((row) => row.company === company)!);
    const summary: AutomationStudioFlowLessSummary = {
      ...attempt(),
      rows: { totalRows: rows.length, truncated: false, columns: ["title", "company", "salary"].map((id) => ({ id, label: id })), rows },
      trail: automationStudioResultTrailOfAttempts(replayTrace(), [], ["page"])
    };
    return (automationStudioFlowLessJudgedSummary(summary, []).sent as unknown as { trail: AutomationStudioResultTrail }).trail;
  };

  it("carries every step the run made, in the order it ran, with what each ran with and how it ended", () => {
    const trail = sent();
    expect(trail.entries.map((entry) => entry.did)).toEqual(replay.steps.map((step) => step.definitionId));
    expect(trail.entries.map((entry) => entry.outcome)).toEqual(replay.steps.map((step) => step.status));
    const reads = trail.entries.filter((entry) => entry.did === "web.output.dom-extract_list");
    expect(reads).toHaveLength(5);
    // The tag the person asked for was a condition every read kept rows by.
    for (const read of reads) expect(JSON.stringify(read.asked)).toContain("{\"field\":\"easily\",\"is\":\"present\"}");
    expect(trail.entries.at(-1)!.did).toBe("web.output.dom-next_page");
  });

  it("shows what the run did about the order: no step of it asks for a sort, its list was opened fresh, and the page it left is in relevance order", () => {
    const trail = sent();
    expect(JSON.stringify(trail.entries.map((entry) => entry.asked ?? null))).not.toMatch(/sort/iu);
    const firstRead = trail.entries.findIndex((entry) => entry.did === "web.output.dom-extract_list");
    const opened = trail.entries.slice(0, firstRead).filter((entry) => entry.did === "web.output.browser-navigate").at(-1)!;
    expect((opened.asked as JsonObject).url).toMatch(/\/jobs$/u);
    const left = ((trail.entries.at(-1)!.found as JsonObject).view as JsonObject).page as string;
    expect(left).toMatch(/^URL ~\?page=5 /mu);
    expect(left).toContain("t1704 \"relevance\"");
    expect(left).toContain("link \"date\" ~?sort=date");
  });
});

describe("the judge's guidance (t963 J2)", () => {
  // The lists `../../flow-less/tests/judge.test.ts` holds the question to, and the words of this run's task.
  const SCENARIOS = ["everything-store", "crossborder-marketplace", "bigbox-retail", "job-board", "local-classifieds", "auction-marketplace", "photo-social", "social-network-feed", "company-website", "professional-network"];
  const SITE_WORDS = /store|shop|marketplace|retail|bigbox|crossborder|classified|auction|photo|social|network|feed|company|website|professional|product|seller|listing|follow|like\b|post\b|profile|resume|vacanc|apply/iu;
  const LAB_TASK_WORDS = /friend|earbud|kettle|basket|cart\b|towel|napkin|dish soap|pickup|watchlist|bid\b|coupon|connection|invitation|saved item|giveaway|glaze|moon jar|quote|gas engineer|job|rust role|group post|digest|open day|rating|shirt|colour|size\b|quantity|rate limit|brightaisle|farbazaar|valueridge|kerbfind|guildline|hammerline|circleway|voltbay|tidewell/iu;
  const RUN_WORDS = /rolefinch|easily|remote|\buk\b|salary|posting|newest|title|engineer|careers/iu;

  it.each([
    ["the trail's note", AUTOMATION_STUDIO_RESULT_TRAIL_NOTE],
    ["the Flow-less question", AUTOMATION_STUDIO_FLOW_LESS_QUESTION]
  ])("%s names no realistic scenario, site, task or this run's answer", (_name, guidance) => {
    const text = guidance.toLowerCase();
    for (const scenario of SCENARIOS) {
      expect(text).not.toContain(scenario);
      for (const word of scenario.split("-")) expect(text, word).not.toMatch(new RegExp(`\\b${word}\\b`, "u"));
    }
    expect(text.match(SITE_WORDS)?.[0]).toBeUndefined();
    expect(text.match(LAB_TASK_WORDS)?.[0]).toBeUndefined();
    expect(text.match(RUN_WORDS)?.[0]).toBeUndefined();
  });

  it("says a condition the trail shows held needs no column, the site's sort and the end of paging count, and a no needs a concrete contradiction", () => {
    expect(AUTOMATION_STUDIO_RESULT_TRAIL_NOTE).toContain("Never require a row to carry a field the person did not ask for as a column");
    expect(AUTOMATION_STUDIO_RESULT_TRAIL_NOTE).toContain("a sort, a filter or a search the site applied");
    expect(AUTOMATION_STUDIO_RESULT_TRAIL_NOTE).toContain("until the site answered that there is no further page");
    expect(AUTOMATION_STUDIO_RESULT_TRAIL_NOTE).toContain("Answer no only on a concrete contradiction");
    expect(AUTOMATION_STUDIO_FLOW_LESS_QUESTION).toContain("no only on a concrete contradiction");
  });
});
