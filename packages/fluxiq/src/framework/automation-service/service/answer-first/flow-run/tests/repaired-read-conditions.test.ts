// @fluxiq-test-group real-sql
// A repaired Flow's replay keeps every condition of the read it repaired (run-mwaudvnh-c208d32c, lead's requirement).
// Attempt 2 of that run had its saved Flow's right result judged no, read the list again with the same conditions,
// dropped that step from the draft again, ran the Flow forward from the read and was judged yes. Attempt 3 replayed
// what attempt 2 left. The question was whether the replay ran the read without its conditions; it did not, and this
// holds it: through the real service, the real engine and a scripted model, the read node attempt 3's engine runs
// carries exactly the conditions attempt 1 wrote. A lending library, no realistic scenario.
import { afterEach, describe, expect, it, vi } from "vitest";
import type { JsonObject, JsonValue } from "../../../../../../core/index.ts";
import { automationStudioFlowDraftStepIsProposed } from "../../../../../../runtime/flow-authoring/draft/index.ts";
import { judgedNo } from "../../tests/endings/support.ts";
import { LOANS_OUTPUT } from "../../tests/fake-library-engine.ts";
import { complete, READ_LOANS, runNode, toolCall } from "../../tests/fake-library.ts";
import { laterAttempts } from "../../tests/later-attempts.ts";

vi.setConfig({ testTimeout: 180_000 });

const cleanups: (() => Promise<void>)[] = [];
afterEach(async () => { for (const cleanup of cleanups.splice(0)) await cleanup(); });

/** Four conditions, as the read in that run had: a mark absent, a figure at least, two words left out. */
const WHERE: JsonValue[] = [{ field: "reserved_badge", is: "absent" }, { field: "renewals", atLeast: 1 }, { field: "title", notContains: "Pamphlet" }, { field: "title", notContains: "Leaflet" }];
const LIST = { item: ".loan", fields: { title: ".title", due: ".due", renewals: ".renewals", reserved_badge: ".reserved" }, where: WHERE };
// The opening look is step 1 and the read step 2 (`../../tests/later-attempt.test.ts`).
const READ_STEP = 2;
const readWithConditions = (callId: string, over: JsonObject = { add: true }) => runNode(callId, READ_LOANS, { recordOutput: LOANS_OUTPUT, list: LIST }, [], over);

/** The read's conditions as a step or a run holds them: its `list` parameter's `where`. */
const conditionsOf = (parameters: JsonValue | undefined): JsonValue | undefined => {
  const list = typeof parameters === "object" && parameters !== null && !Array.isArray(parameters) ? parameters.list : undefined;
  return typeof list === "object" && list !== null && !Array.isArray(list) ? list.where : undefined;
};

describe("a repaired Flow's replay", () => {
  it("runs the read it repaired with every condition the read was saved with", async () => {
    const lane = await laterAttempts(cleanups);
    const first = await lane.attempt({ script: [readWithConditions("read"), complete("Listed.")] });
    expect(first.answer.attempt).toMatchObject({ status: "achieved", path: "explore", ordinal: 1 });

    // Attempt 2: the saved Flow's run is judged no; the model reads again with the same conditions, drops that step, and runs forward from the read.
    const second = await lane.attempt({
      judge: [judgedNo("Two rows look like reserved copies.")],
      script: [
        readWithConditions("again"),
        (request) => {
          const draft = JSON.stringify(request.context.evidenceLoop?.evidence ?? []);
          const added = [...draft.matchAll(/"step":(\d+)/gu)].map((match) => Number(match[1])).filter((step) => step > READ_STEP);
          return { kind: "amend_draft", amendments: [{ step: Math.max(READ_STEP + 1, ...added), change: "drop" }] };
        },
        toolCall("forward", "core.run_flow", { from: READ_STEP }),
        complete("Listed.")
      ]
    });
    expect(second.answer.attempt).toMatchObject({ status: "achieved", path: "run_flow_then_repair", ordinal: 2 });
    const saved = (await lane.kept())?.best;
    // The read attempt 2 added is in the steps as dropped, as step 42 was in that run: the Flow proposes one read.
    const savedReads = saved?.steps.filter((step) => step.actionId === READ_LOANS && automationStudioFlowDraftStepIsProposed(step)) ?? [];
    expect(saved?.steps.filter((step) => step.actionId === READ_LOANS).map((step) => step.disposition)).toEqual(["kept", "dropped"]);
    expect(savedReads).toHaveLength(1);
    // What the step was written with, and what a replay of it runs with: the same four conditions.
    expect(conditionsOf(savedReads[0]?.input.parameters)).toEqual(WHERE);
    expect(conditionsOf(savedReads[0]?.ranWith?.parameters)).toEqual(WHERE);

    // Attempt 3 replays what attempt 2 left: the engine's read node runs with the saved conditions, all four.
    const ran: (Record<string, JsonValue> | undefined)[] = [];
    lane.target.over = ({ nodeId, parameters }) => {
      if (nodeId === READ_LOANS) ran.push(parameters);
      return undefined;
    };
    const third = await lane.attempt({});
    expect(third.decisions).toEqual([]);
    expect(third.answer.attempt).toMatchObject({ status: "achieved", path: "run_flow", ordinal: 3 });
    expect(ran).toHaveLength(1);
    expect(conditionsOf(ran[0])).toEqual(WHERE);
  });
});
