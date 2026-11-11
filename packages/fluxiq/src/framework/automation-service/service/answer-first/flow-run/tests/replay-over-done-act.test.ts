// @fluxiq-test-group real-sql
// A later attempt's run of its saved Flow when what the task asked for already stands (t897, live run
// `run-mwb5cnxg-003415b4`, social-network-feed-group-post). Attempt 1 opened a form with a press that
// declared nothing but whose answer said it changed something that stays, filled the form, and made
// the lasting press. That opening press is carried to the next attempt and held on repeat
// (`runtime/answer-first/act-record/seed.ts`), so the run's gate does not press it again, and says
// so as an act already done (`../../run-acts/run-gate.ts`). The step written on the form it opens
// then finds that form never came and is passed over as a state that never arose
// (`engine/automation/state-routing/not-arisen.ts`), the lasting press is already done, and the run
// reaches its end: judged once against the change, and from then on standing on that record (task
// speed S9). It is the saved Flow's own run every time, with no decision, and it ends with an answer.
// Before t897 the gate passed the opening press over with no word of an act done, the form's step
// failed on its missing control, and every later attempt explored from there.
// A lending library is none of the Lab's realistic scenarios.
import { afterEach, describe, expect, it, vi } from "vitest";
import type { JsonObject } from "../../../../../../core/index.ts";
import type { AutomationStudioLlmEvidenceToolExecutionResult } from "../../../../../../runtime/llm/index.ts";
import { CLOSE_PROMPT, pressCard } from "../../tests/fake-library-engine.ts";
import { AUTOMATION_STUDIO_ANSWER_FIRST_ON_RECORD_WORDS } from "../../completion/index.ts";
import { complete, RENEW_CARD, RENEW_LOAN, runNode } from "../../tests/fake-library.ts";
import { laterAttempts } from "../../tests/later-attempts.ts";

vi.setConfig({ testTimeout: 180_000 });

const cleanups: (() => Promise<void>)[] = [];
afterEach(async () => { for (const cleanup of cleanups.splice(0)) await cleanup(); });

const TASK = "Renew the card on my library account with the note: back in May.";
const OPEN_FORM = "#open-card-form";
const NOTE_FIELD = "#card-note";
const LOCATION = { from: { location: "library://account" } };

/** Whether the card form is open on the page in hand: a new attempt's page starts without it. */
type Site = { formOpen: boolean; formOpened: number; noteTyped: number };

type Draft = NonNullable<AutomationStudioLlmEvidenceToolExecutionResult["draft"]>;

const execution = (evidence: JsonObject, draft: Draft, effectApplied = true): AutomationStudioLlmEvidenceToolExecutionResult =>
  ({ kind: "llm_evidence_tool_execution", evidence, effectApplied, draft });

/** The by-hand door: the opening press says it flipped something that stays, and the note is typed only on the open form. */
function byHand(site: Site) {
  return ({ toolId, value }: { toolId: string; value: JsonObject }): AutomationStudioLlmEvidenceToolExecutionResult | undefined => {
    if (toolId !== "core.run_node" || value.replay !== undefined || value.write === true) return undefined;
    const parameters = (value.parameters ?? {}) as JsonObject;
    const ran = { node: String(value.node), parameters, consequences: value.consequences ?? [] };
    const draft: Draft = { actionId: String(value.node), input: value, ranWith: ran, replay: LOCATION, proposes: true, effect: "mutate" };
    if (value.node === CLOSE_PROMPT && parameters.control === OPEN_FORM) {
      site.formOpen = true;
      site.formOpened += 1;
      return execution({ ok: true, pageChanged: true, page: { heading: "Your account", form: "Card form" }, toggle: { key: "card_form", to: "on" } }, draft);
    }
    if (value.node === RENEW_LOAN && parameters.control === NOTE_FIELD) {
      if (!site.formOpen) return execution({ ok: false, code: "library.no_such_control" }, draft, false);
      site.noteTyped += 1;
      return execution({ ok: true, pageChanged: true }, draft);
    }
    return undefined;
  };
}

describe("a later attempt whose asked act already stands", () => {
  it("runs the saved Flow to its end past the form the done act's opening brings, judged once and then on its record, with no decision", async () => {
    const site: Site = { formOpen: false, formOpened: 0, noteTyped: 0 };
    const lane = await laterAttempts(cleanups, { fault: byHand(site) });
    const first = await lane.attempt({
      instruction: TASK, permittedConsequences: ["modify_existing"],
      script: [
        runNode("open", CLOSE_PROMPT, { control: OPEN_FORM }, [], { add: true }),
        runNode("note", RENEW_LOAN, { control: NOTE_FIELD, title: "back in May" }, [], { add: true }),
        runNode("card", RENEW_CARD, {}, ["modify_existing"], { add: true }),
        complete("Renewed with the note.")
      ]
    });
    expect(first.answer.attempt).toMatchObject({ status: "achieved", path: "explore" });
    expect(lane.target.library.renewals.card).toBe(1);
    // The engine's door: the form opens only by its own press, and the note's control is on the open form alone.
    lane.target.over = ({ nodeId, parameters }) => {
      if (nodeId === CLOSE_PROMPT && parameters?.control === OPEN_FORM) {
        site.formOpen = true;
        site.formOpened += 1;
        return { status: "success", route: "success", outputs: { success: true } };
      }
      if (nodeId === RENEW_LOAN && parameters?.control === NOTE_FIELD) {
        if (!site.formOpen) return { status: "failed", route: "failed", message: "No such control.", failure: { category: "target_not_found", code: "library.no_such_control", retryable: false, stage: "target_resolution", effect: "unacted" } };
        site.noteTyped += 1;
        return { status: "success", route: "success", outputs: { success: true } };
      }
      return nodeId === RENEW_CARD ? pressCard(lane.target) : undefined;
    };
    for (const ordinal of [2, 3, 4]) {
      // Each attempt runs on the page the one before left, reloaded: the form is closed, the card stays renewed.
      site.formOpen = false;
      const later = await lane.attempt({ instruction: TASK, permittedConsequences: ["modify_existing"], script: [complete("It was already done.")] });
      expect(later.answer.attempt, `attempt ${ordinal}`).toMatchObject({ status: "achieved", path: "run_flow", ordinal });
      expect(later.decisions, `attempt ${ordinal} made a decision`).toHaveLength(0);
      expect(later.answer.result?.acts, `attempt ${ordinal}`).toEqual([expect.objectContaining({ state: "landed", what: expect.stringMatching(/^Already done earlier: /u) })]);
      expect(later.answer.result?.label).toBe("confirmed");
      // Judged once against the change; then a replay that ran as that judged run stands on its record.
      expect(later.judgeCalls, `attempt ${ordinal}'s judge calls`).toHaveLength(ordinal === 2 ? 1 : 0);
      if (ordinal > 2) expect(later.answer.result?.checkedWhat).toBe(AUTOMATION_STUDIO_ANSWER_FIRST_ON_RECORD_WORDS);
      // Why it was judged, or that it stood, is on the attempt's row (`../../completion/replay-verdict.ts`).
      expect((await lane.rows()).at(-1)?.replay, `attempt ${ordinal}'s replay verdict`).toEqual(ordinal === 2 ? { stood: false, deviation: "flow_not_proven" } : { stood: true });
    }
    // Nothing was done twice: the card once, the form opened and the note typed by attempt 1 alone.
    expect(lane.target.library.renewals.card).toBe(1);
    expect(site).toMatchObject({ formOpened: 1, noteTyped: 1 });
  });
});
