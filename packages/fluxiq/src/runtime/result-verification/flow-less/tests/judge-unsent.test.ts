// F22 (t974): live runs run-mwouzg29-ebb0f27d, run-mwov5v61-01468cd3 and run-mwow1z18-81707c66 had every completion refused
// `answer_first.not_judged` ("the verification call did not come back usable") with no judge call at all. The result's
// evidence held, in memory, a read's `leftOut.found` with `undefined` for a condition the read said nothing of; the evidence
// screen kept that array item, the provider's pre-send check refused the request as context that is not JSON
// (`llm.provider_request_context_unbounded`) before writing any step, and nothing recorded why. Through the real harness and
// the real Anthropic adapter, with a scripted fetch: no model is called. The fixture is a kind of site no realistic
// scenario uses (a lending library's catalogue).
import { mkdtempSync, readdirSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { runAutomationStudioLlmHarness, type AutomationStudioLlmHarnessInput } from "../../../llm/index.ts";
import { createAutomationStudioAnthropicProvider } from "../../../llm/anthropic/index.ts";
import type { AutomationStudioResultEvidenceBundle } from "../../result-evidence/index.ts";
import { automationStudioFlowLessJudge } from "../judge.ts";
import type { AutomationStudioFlowLessSummary } from "../types.ts";

const DENIED = ["selector"];
const NO = { kind: "diagnosis", summary: "One title is missing.", diagnosis: { answersRequest: "no", observed: "The catalogue shows three titles that can be borrowed; the result holds two.", defects: [{ kind: "asked_missing", row: "rows not read", requestWords: "every title" }], checked: [], answerRecords: { asked: true, siteShows: 3 } } };

/** The result's evidence as the attempt holds it in memory: the read said what its second condition read, and nothing of its first. */
function evidence(): AutomationStudioResultEvidenceBundle {
  const rows = [{ title: "Persuasion", shelf: "North 4" }, { title: "Emma", shelf: "North 4" }];
  return {
    pages: [{
      source: "read.1", step: "catalogue.2", version: 2, conditions: [{ field: "author", equals: "Austen" }, { field: "loan", absent: true }],
      fields: { title: "row_title", shelf: "row_shelf" }, where: "https://library.example/catalogue?page=1", kept: rows.length, rows,
      leftOut: { where: [{ field: "author", equals: "Austen" }, { field: "loan", absent: true }], columns: { title: "row_title", shelf: "row_shelf" }, found: [undefined, ["Reference only"]], sets: [{ kind: "alone", conditions: [1], rows: [{ title: "Sanditon", loan: "Reference only" }] }] }
    }],
    coverage: [{ step: "catalogue.2", version: 2, places: [], first: "unknown" }],
    working: [],
    looks: []
  };
}

function summary(): AutomationStudioFlowLessSummary {
  return {
    instructions: "List every title by Jane Austen on the catalogue's first page that can be borrowed, with columns title and shelf.",
    rows: { totalRows: 2, truncated: false, columns: [{ id: "title", label: "title" }, { id: "shelf", label: "shelf" }], rows: [{ title: "Persuasion", shelf: "North 4" }, { title: "Emma", shelf: "North 4" }] },
    acts: [],
    resultEvidence: evidence()
  };
}

/** One Messages reply as JSON, the model's answer its text. */
function reply(text: string): Response {
  const envelope = { id: "msg_t974", type: "message", role: "assistant", model: "claude-sonnet-5-5", content: [{ type: "text", text }], stop_reason: "end_turn", usage: { input_tokens: 100, output_tokens: 30, cache_read_input_tokens: 0, cache_creation_input_tokens: 0 } };
  return new Response(JSON.stringify(envelope), { status: 200, headers: { "content-type": "application/json" } });
}

function scripted() {
  const sent: string[] = [];
  const fetchImpl = vi.fn(async (_url: string, init: RequestInit) => {
    sent.push(String(init.body));
    // The adapter's JSON-text transport carries the answer in `result_json`; its native format carries it as it is.
    const jsonText = JSON.stringify((JSON.parse(String(init.body)) as { output_config?: unknown }).output_config ?? {}).includes("result_json");
    return reply(JSON.stringify(jsonText ? { result_json: JSON.stringify(NO) } : NO));
  });
  const provider = createAutomationStudioAnthropicProvider({ model: "claude-sonnet-5-5", secretReference: { kind: "secret_reference", id: "secret:claude" }, resolveSecret: async () => "dummy-provider-key", fetchImpl: fetchImpl as unknown as typeof fetch });
  return { provider, sent };
}

const judged = (provider: ReturnType<typeof scripted>["provider"], run: (input: AutomationStudioLlmHarnessInput) => ReturnType<typeof runAutomationStudioLlmHarness> = runAutomationStudioLlmHarness) =>
  automationStudioFlowLessJudge({ summary: summary(), provider, run, projectId: "project-1", flowId: "flow-1", runId: "run-1", deniedEvidenceKeys: DENIED });

const environment = { ...process.env };
afterEach(() => {
  process.env = { ...environment };
  vi.restoreAllMocks();
});

describe("a judge whose result's evidence says nothing of a condition (F22)", () => {
  it("is sent, the condition's reading carried as null, and its answer is read", async () => {
    const { provider, sent } = scripted();

    const judgement = await judged(provider);

    expect(sent).toHaveLength(1);
    expect(judgement).toMatchObject({ verdict: "no" });
    const body = JSON.parse(sent[0]!) as { messages: { content: string | { text: string }[] }[] };
    const content = body.messages[0]!.content;
    const user = JSON.parse(Array.isArray(content) ? content.map((block) => block.text).join("") : content) as { context: { resultSummary: { resultEvidence: { pages: { leftOut: { found: unknown[] } }[] } } } };
    expect(user.context.resultSummary.resultEvidence.pages[0]!.leftOut.found).toEqual([null, ["Reference only"]]);
  });
});

describe("a judge's call that is not sent", () => {
  function logged() {
    const directory = mkdtempSync(join(tmpdir(), "t974-step-log-"));
    process.env.FLUXIQ_LLM_STEP_LOG_DIR = directory;
    process.env.FLUXIQ_BUILD_PROGRESS_TRACE = "1";
    const lines: string[] = [];
    vi.spyOn(console, "log").mockImplementation((line: unknown) => { lines.push(String(line)); });
    const notes = () => readdirSync(directory).filter((folder) => folder.endsWith("-note")).map((folder) => (JSON.parse(readFileSync(join(directory, folder, "meta.json"), "utf8")) as { line: string }).line);
    return { directory, lines, notes };
  }

  it("says in the step log and the build trace why, and where its request was not JSON, when the provider refused it before sending", async () => {
    const { directory, lines, notes } = logged();
    try {
      const { provider, sent } = scripted();
      // Something Core put in the request that JSON has no form for, past every screen: the provider's pre-send check refuses it.
      const poisoned = async (input: AutomationStudioLlmHarnessInput) => await runAutomationStudioLlmHarness({ ...input, resultSummary: { ...input.resultSummary, poisoned: [undefined] } as unknown as NonNullable<AutomationStudioLlmHarnessInput["resultSummary"]> });

      const judgement = await judged(provider, poisoned);

      expect(sent).toHaveLength(0);
      expect(judgement.verdict).toBe("not_judged");
      expect(judgement.reason).toContain("Core built the judge's request in a form it could not send");
      expect(judgement.reason).not.toContain("did not come back usable");
      const [note] = notes();
      expect(note).toContain("The judge's call was not sent (llm.provider_request_context_unbounded)");
      expect(note).toContain("an undefined value at context.resultSummary.poisoned[0]");
      expect(lines.some((line) => line.includes("judge not_sent code=llm.provider_request_context_unbounded"))).toBe(true);
    } finally {
      rmSync(directory, { recursive: true, force: true });
    }
  });

  it("says what threw, by its name, when the harness threw", async () => {
    const { directory, lines, notes } = logged();
    try {
      const { provider, sent } = scripted();

      const judgement = await judged(provider, async () => { throw new TypeError("A fault in the harness."); });

      expect(sent).toHaveLength(0);
      expect(judgement.verdict).toBe("not_judged");
      const [note] = notes();
      expect(note).toContain("The judge's call was not sent (none)");
      expect(note).toContain("It threw TypeError.");
      expect(note).not.toContain("A fault in the harness.");
      expect(lines.some((line) => line.includes("judge not_sent code=- name=TypeError"))).toBe(true);
    } finally {
      rmSync(directory, { recursive: true, force: true });
    }
  });
});
