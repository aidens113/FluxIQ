// @fluxiq-test-group real-sql
// A per-row Flow whose first step is the row's whole link, repeated over a read, through the real service (t869).
//
// The model reads the rows, opens and renews the first by hand, writes the repeat, and runs forward. The target here
// is a list of cards, each a link that opens its row's page, and a Save-like Renew on that page that counts what it was
// pressed on; a second press on a row is what a toggle site would undo. Which element a pass's link names is the page's
// to find (`apps/extension/src/content/action-runtime/pass-row/`), so this target finds it as the page does: by the row a
// pass carries, and answers for a row whose link it does not draw as the web domain answers
// (`domain/.../node-run/replay.ts`). What is proved here is Core's half: every pass carries its row, a row that cannot be
// done is told as a tool answer and the task goes on, nothing lasting lands on it, and the view the model reads next is
// the page as it stands.
import { afterEach, describe, expect, it, vi } from "vitest";
import type { JsonObject } from "../../../../../core/index.ts";
import type { AutomationStudioLlmEvidenceToolExecutionResult } from "../../../../../runtime/llm/index.ts";
import { complete, fakeLibrary, READ_LOANS, RENEW_CARD, RENEW_LOAN, runNode, scriptedAttempt, toolCall, type FakeLibrary } from "./fake-library.ts";

vi.setConfig({ testTimeout: 120_000 });

const cleanups: (() => Promise<void>)[] = [];
afterEach(async () => { for (const cleanup of cleanups.splice(0)) await cleanup(); });

const CONSEQUENCES = ["modify_existing"];
const OPEN = "open-its-card";
const RENEW = "renew-here";

/** Where the target stands: the list, or one row's page. */
type Cards = { at: string; missing: readonly string[]; renewOnly: readonly string[]; opened: string[]; backs: number };

const replayAnswer = (evidence: JsonObject, over: Partial<AutomationStudioLlmEvidenceToolExecutionResult> = {}): AutomationStudioLlmEvidenceToolExecutionResult => ({
  kind: "llm_evidence_tool_execution", evidence, effectApplied: true, resultCode: "core.replay.replayed", draft: { actionId: RENEW_LOAN, effect: "mutate", proposes: true }, ...over
});

/** The target's answers to a pass (header): the row's own link is opened, or it says it found none; a press lands on the row whose page it stands on. */
function cardsFault(cards: Cards) {
  return (call: { toolId: string; value: JsonObject }, library: FakeLibrary): AutomationStudioLlmEvidenceToolExecutionResult | undefined => {
    if (call.value.replay !== "step") return undefined;
    if (call.value.node === READ_LOANS) {
      const rows = library.loans.map((loan) => ({ ...loan }));
      return replayAnswer({ ok: true, said: "read", readRows: { rows: rows.map((row) => ({ title: row.title })) } }, { outputs: { records: rows } });
    }
    const named = String((call.value.parameters as JsonObject).title);
    const row = String((call.value.item as JsonObject | undefined)?.title);
    // The way back to the list, a move with no row and no lasting act.
    if (call.value.node === RENEW_CARD) {
      cards.backs += 1;
      cards.at = "list";
      return replayAnswer({ ok: true, said: "the step ran again" });
    }
    if (named === OPEN) {
      if (cards.at !== "list") return replayAnswer({ ok: false, code: "core.replay.unreproducible", said: "the step did not run" }, { effectApplied: false, resultCode: "core.replay.unreproducible", resultReason: "row_control_not_found" });
      if (cards.missing.includes(row)) return replayAnswer({ ok: false, code: "core.replay.failed", said: "the step's target matched another row's control, not the control of the row this pass is on; the step did not run" }, { effectApplied: false, resultCode: "core.replay.failed", resultReason: "row_control_not_found" });
      cards.opened.push(row);
      cards.at = row;
      return replayAnswer({ ok: true, said: "the step ran again" });
    }
    if (named === RENEW) {
      if (cards.renewOnly.length > 0 && !cards.renewOnly.includes(row)) return replayAnswer({ ok: false, code: "core.replay.failed", said: "the step did not run" }, { effectApplied: false, resultCode: "core.replay.failed", resultReason: "row_control_not_found" });
      library.renewals[String(cards.at)] = (library.renewals[String(cards.at)] ?? 0) + 1;
      return replayAnswer({ ok: true, said: "the step ran again", changed: ["Renewed"] });
    }
    return undefined;
  };
}

async function renewEveryCard(input: { missing?: readonly string[]; renewOnly?: readonly string[]; titles?: readonly string[] } = {}) {
  const library = fakeLibrary(input.titles);
  const cards: Cards = { at: "list", missing: input.missing ?? [], renewOnly: input.renewOnly ?? [], opened: [], backs: 0 };
  const attempt = await scriptedAttempt({
    library,
    instruction: "Renew every loan on my library account.",
    permittedConsequences: ["modify_existing"],
    fault: cardsFault(cards),
    script: [
      runNode("read", READ_LOANS),
      runNode("first", RENEW_LOAN, { title: library.loans[0]!.title }, CONSEQUENCES),
      toolCall("flow-read", "core.run_node", { node: READ_LOANS, parameters: {}, consequences: [], write: true }),
      toolCall("flow-open", "core.run_node", { node: RENEW_LOAN, parameters: { title: OPEN }, consequences: [], write: true }),
      toolCall("flow-renew", "core.run_node", { node: RENEW_LOAN, parameters: { title: RENEW }, consequences: CONSEQUENCES, write: true }),
      toolCall("flow-back", "core.run_node", { node: RENEW_CARD, parameters: {}, consequences: [], write: true }),
      { kind: "amend_draft", amendments: [{ step: 5, change: "repeat", through: 7, over: 4 }] },
      toolCall("forward", "core.run_flow", { from: 4 }),
      complete("Renewed what could be renewed.")
    ]
  }, cleanups);
  const asked = attempt.requests.filter((request) => request.taskKind === "evidence_tool_decision").at(-1);
  const evidence = asked?.context.evidenceLoop?.evidence ?? [];
  const told = evidence.find((entry) => entry.callId === "forward")?.value as JsonObject | undefined;
  const view = evidence.find((entry) => entry.toolId === "core.current_view")?.value as { groups?: { group: string; callId: string; value: { page?: { renewed?: number } } }[] } | undefined;
  return { attempt, library, cards, told, view };
}

describe("a repeat that opens each row by its whole link and renews it there", () => {
  it("each pass carries its own row: each row is opened and pressed once, the by-hand row never again", async () => {
    const { attempt, library, cards, told } = await renewEveryCard();
    expect(cards.opened).toEqual(["Birds of the Coast", "Clockmaking"]);
    expect(library.renewals).toEqual({ "Atlas of Rivers": 1, "Birds of the Coast": 1, Clockmaking: 1 });
    expect(told).toMatchObject({ passed: true, rows: { done: 2, skipped: 1, failed: 0 } });
    expect(attempt.answered.status).toBe("answered");
  });

  it("a row whose own control cannot be found is told as a tool answer, naming it; nothing lands on it; the next row is done; the task goes on", async () => {
    const { attempt, library, cards, told } = await renewEveryCard({ missing: ["Birds of the Coast"] });
    expect(cards.opened).toEqual(["Clockmaking"]);
    expect(library.renewals).toEqual({ "Atlas of Rivers": 1, Clockmaking: 1 });
    expect(told).toMatchObject({ ok: true, passed: false, rows: { done: 1, skipped: 1, failed: 1 }, rowsNotDone: ["Birds of the Coast"] });
    expect(String(told?.instruction)).toContain('"Birds of the Coast"');
    expect(attempt.answered.status).toBe("answered");
    expect(attempt.scriptRanOut).toBe(false);
  });

  it("a press that cannot find its control on the row's page: nothing lands, the pass still comes back by its own step, and the next row is still done", async () => {
    const { attempt, library, cards, told } = await renewEveryCard({ renewOnly: ["Clockmaking"] });
    expect(cards.backs).toBe(2);
    expect(attempt.library.calls.some((call) => call.value.replay === "reset")).toBe(false);
    expect(library.renewals).toEqual({ "Atlas of Rivers": 1, Clockmaking: 1 });
    expect(told).toMatchObject({ rows: { done: 1, failed: 1 }, rowsNotDone: ["Birds of the Coast"] });
    expect(attempt.answered.status).toBe("answered");
  });

  it("the view the model reads next is the page as it stands, not the one from before the run", async () => {
    const { view, library } = await renewEveryCard();
    const top = view?.groups?.find((group) => group.group === "top");
    expect(top?.callId).toBe("forward");
    expect(Object.keys(library.renewals)).toHaveLength(3);
    expect(top?.value.page).toMatchObject({ heading: "Your account" });
  });

  it("a row left out for not being found is not held done: a later press of it is not refused as a repeat", async () => {
    const library = fakeLibrary();
    const cards: Cards = { at: "list", missing: ["Birds of the Coast"], renewOnly: [], opened: [], backs: 0 };
    const attempt = await scriptedAttempt({
      library,
      instruction: "Renew every loan on my library account.",
      permittedConsequences: ["modify_existing"],
      fault: cardsFault(cards),
      script: [
        runNode("read", READ_LOANS),
        runNode("first", RENEW_LOAN, { title: "Atlas of Rivers" }, CONSEQUENCES),
        toolCall("flow-read", "core.run_node", { node: READ_LOANS, parameters: {}, consequences: [], write: true }),
        toolCall("flow-open", "core.run_node", { node: RENEW_LOAN, parameters: { title: OPEN }, consequences: [], write: true }),
        toolCall("flow-renew", "core.run_node", { node: RENEW_LOAN, parameters: { title: RENEW }, consequences: CONSEQUENCES, write: true }),
        toolCall("flow-back", "core.run_node", { node: RENEW_CARD, parameters: {}, consequences: [], write: true }),
        { kind: "amend_draft", amendments: [{ step: 5, change: "repeat", through: 7, over: 4 }] },
        toolCall("forward", "core.run_flow", { from: 4 }),
        runNode("by-hand", RENEW_LOAN, { title: "Birds of the Coast" }, CONSEQUENCES),
        complete("Renewed every loan.")
      ]
    }, cleanups);
    expect(library.renewals).toEqual({ "Atlas of Rivers": 1, Clockmaking: 1, "Birds of the Coast": 1 });
    expect(attempt.answered.status).toBe("answered");
  });
});
