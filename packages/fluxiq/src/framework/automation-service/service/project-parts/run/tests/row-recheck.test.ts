// @fluxiq-test-group real-sql
// Covers the re-check of a lasting step bound to a list row: `../row-target.ts`, the row half of
// `../step-gate.ts`, and `engine/automation/target-reacquire/row-recheck.ts`, through the real
// executor, For Each and frames.
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { RunProjectPartResponse } from "../../../../../../api-contracts/automation.ts";
import type { AutomationStudioProjectPartRunRefusal } from "../../index.ts";
import { callerGraph, openRowsHarness, rowGraph, PROJECT, type RowsHarness } from "./part-rows-harness.ts";

const ASKED = { permittedConsequences: ["create_new"], acknowledgedRepeat: true };

describe("a lasting step bound to a list row", () => {
  let harness: RowsHarness;
  const runIt = async (partId: string) => await harness.parts.run({ projectId: PROJECT, partId, inputs: {}, ...ASKED }) as RunProjectPartResponse;

  beforeEach(async () => {
    harness = await openRowsHarness();
  });
  afterEach(async () => {
    await harness.close();
  });

  it("presses every row once, finding each again and looking at its own control before its own press", async () => {
    const partId = await harness.save([rowGraph("s")]);
    const answer = await runIt(partId);
    expect(answer).toMatchObject({ status: "succeeded", acts: ["create_new"], modelCalls: 0 });
    expect(harness.domain.pressed).toEqual(["a", "b", "c"]);
    expect(harness.domain.reads.count, "the read itself, and once again before each press").toBe(4);
    expect(harness.domain.asked, "each question names its row: none is about the look-alike control in general").toEqual(["a", "b", "c"]);
  });

  it("presses the right row when rows moved between the read and the press, by identity and never by position", async () => {
    const partId = await harness.save([rowGraph("s")]);
    harness.page.afterRead = (reads) => {
      if (reads === 1) harness.page.rows = [{ key: "c", words: "third" }, { key: "x", words: "another" }, { key: "a", words: "first", count: 9 }, { key: "b", words: "second" }];
    };
    const answer = await runIt(partId);
    expect(answer.status).toBe("succeeded");
    expect(harness.domain.pressed, "a row now elsewhere is pressed for what it is, and the new row in its old place is not").toEqual(["a", "b", "c"]);
    expect(harness.domain.handed[0], "the press is handed the row as it reads now").toEqual({ key: "a", words: "first", count: 9 });
  });

  it("stops at a row that is gone, says so, presses nothing for it, and does not try the rows after it", async () => {
    const partId = await harness.save([rowGraph("s")]);
    harness.page.afterPress = (key) => {
      if (key === "a") harness.page.rows = harness.page.rows.filter((row) => row.key !== "b");
    };
    const answer = await runIt(partId);
    expect(answer).toMatchObject({ status: "stopped", acts: ["create_new"], stoppedAt: { stepLabel: "Press it", reason: expect.stringContaining("gone") } });
    expect(answer.stoppedAt!.reason).toContain("items after it were not tried");
    expect(harness.domain.pressed).toEqual(["a"]);
    expect(harness.domain.asked, "the page is never asked about a control for a row that is gone").toEqual(["a"]);
  });

  it("two rows with look-alike controls: each press is checked and sent for its own row", async () => {
    harness.page.rows = [{ key: "a", words: "same words" }, { key: "b", words: "same words" }];
    const partId = await harness.save([rowGraph("s")]);
    expect((await runIt(partId)).status).toBe("succeeded");
    expect(harness.domain.pressed).toEqual(["a", "b"]);
    expect(harness.domain.asked).toEqual(["a", "b"]);
    expect(harness.domain.described).toEqual(["a", "b"]);
  });

  it("two rows the fresh list cannot tell apart: stops, with nothing pressed", async () => {
    const partId = await harness.save([rowGraph("s")]);
    harness.page.afterRead = (reads) => {
      if (reads === 1) harness.page.rows = [{ key: "a", words: "first" }, { key: "a", words: "first" }];
    };
    const answer = await runIt(partId);
    expect(answer).toMatchObject({ status: "stopped", acts: [], stoppedAt: { reason: expect.stringContaining("could not be told apart") } });
    expect(harness.domain.pressed).toEqual([]);
  });

  it("an unknown answer about the row's control never passes", async () => {
    const partId = await harness.save([rowGraph("s")]);
    harness.page.cannotTell.add("a");
    const answer = await runIt(partId);
    expect(answer).toMatchObject({ status: "stopped", acts: [], stoppedAt: { reason: expect.stringContaining("could not be told apart") } });
    expect(harness.domain.pressed).toEqual([]);
  });

  it("the row is there and its own control is not: stops, with nothing pressed", async () => {
    const partId = await harness.save([rowGraph("s")]);
    harness.page.afterPress = () => harness.page.noControl.add("b");
    const answer = await runIt(partId);
    expect(answer).toMatchObject({ status: "stopped", stoppedAt: { reason: expect.stringContaining("no longer on it") } });
    expect(harness.domain.pressed).toEqual(["a"]);
  });

  it("an act that may have landed is not pressed again, and no later row is tried", async () => {
    const partId = await harness.save([rowGraph("s")]);
    harness.page.pressAnswer = () => "uncertain";
    const answer = await runIt(partId);
    expect(answer).toMatchObject({ status: "stopped", acts: [], stoppedAt: { reason: expect.stringContaining("may or may not have happened") } });
    expect(harness.domain.pressed).toEqual(["a"]);
    expect(JSON.stringify(answer)).not.toContain("PAGEWORD");
  });

  it("a press that surely did not act is tried again, the row looked at again first, and lands once", async () => {
    const partId = await harness.save([rowGraph("s")]);
    harness.page.rows = [{ key: "a", words: "first" }];
    harness.page.pressAnswer = (_key, tries) => tries === 1 ? "unacted" : "landed";
    const answer = await runIt(partId);
    expect(answer.status).toBe("succeeded");
    expect(harness.domain.pressed).toEqual(["a", "a"]);
    expect(harness.domain.asked, "before each of the two tries").toEqual(["a", "a"]);
    expect(harness.domain.reads.count).toBe(3);
  });

  it("a row the run already completed is left alone, though the page no longer holds it twice", async () => {
    const partId = await harness.save([rowGraph("s")]);
    harness.page.rows = [{ key: "a", words: "first" }, { key: "a", words: "first" }];
    harness.page.afterRead = (reads) => {
      if (reads === 1) harness.page.rows = [{ key: "a", words: "first" }];
    };
    harness.page.afterPress = () => {
      harness.page.rows = [];
    };
    expect((await runIt(partId)).status).toBe("succeeded");
    expect(harness.domain.pressed).toEqual(["a"]);
  });

  it("a source that could act is not re-run: it is unavailable, so the run stops with nothing pressed", async () => {
    const partId = await harness.save([rowGraph("s", { readMetadata: { declaredConsequences: [] } })]);
    const answer = await runIt(partId);
    expect(answer).toMatchObject({ status: "stopped", acts: [], stoppedAt: { reason: expect.stringContaining("could not be read again") } });
    expect(harness.domain.reads.count, "only the read a run makes itself").toBe(1);
    expect(harness.domain.pressed).toEqual([]);
  });

  it("a list that cannot be read again stops the run, with nothing pressed", async () => {
    const partId = await harness.save([rowGraph("s")]);
    harness.page.readFails = (reads) => reads === 2;
    const answer = await runIt(partId);
    expect(answer).toMatchObject({ status: "stopped", acts: [], stoppedAt: { reason: expect.stringContaining("could not be read again") } });
    expect(harness.domain.pressed).toEqual([]);
    expect(JSON.stringify(answer)).not.toContain("PAGEWORD");
  });

  it("a host that cannot match a row is no match: the run stops with nothing pressed", async () => {
    await harness.close();
    harness = await openRowsHarness({ noMatcher: true });
    const partId = await harness.save([rowGraph("s")]);
    const answer = await runIt(partId);
    expect(answer).toMatchObject({ status: "stopped", acts: [] });
    expect(harness.domain.reads.count).toBe(1);
    expect(harness.domain.pressed).toEqual([]);
  });

  it("a node that would act as soon as it is run is never run to ask: the step stops for want of a check", async () => {
    const partId = await harness.save([rowGraph("s", { pressDefinition: "custom.acts_directly" })]);
    const answer = await runIt(partId);
    expect(answer).toMatchObject({ status: "stopped", acts: [], stoppedAt: { reason: expect.stringContaining("could not be checked") } });
    expect(harness.domain.pressed).toEqual([]);
    expect(harness.domain.described).toEqual([]);
  });

  it("a pass that already left the list is not sent back to read it: the control is asked about for that row, on the page it opened", async () => {
    await harness.close();
    harness = await openRowsHarness({ moves: ["s.open"] });
    const open = { id: "s.open", definitionId: "custom.open", definitionVersion: "1.0.0", label: "Open the row", parameterValues: {}, metadata: { declaredConsequences: [] } };
    const partId = await harness.save([rowGraph("s", { before: open })]);
    const answer = await runIt(partId);
    expect(answer.status).toBe("succeeded");
    expect(harness.domain.pressed).toEqual(["a", "b", "c"]);
    expect(harness.domain.ran).toEqual(["s.open", "s.open", "s.open"]);
    expect(harness.domain.reads.count, "only the read a run makes itself").toBe(1);
    expect(harness.domain.asked).toEqual(["a", "b", "c"]);
  });

  it("a part that calls a part: the called part presses per row, each checked in its own frame", async () => {
    const inner = rowGraph("inner");
    const outer = callerGraph("outer", "subflow.inner");
    const partId = await harness.save([inner, outer]);
    const answer = await runIt(partId);
    expect(answer).toMatchObject({ status: "succeeded", acts: ["create_new"] });
    expect(harness.domain.ran).toEqual(["outer.first"]);
    expect(harness.domain.pressed).toEqual(["a", "b", "c"]);
    expect(harness.domain.asked).toEqual(["a", "b", "c"]);
  });

  it("each row is put to the permission check, and a no on a later row stops there", async () => {
    const partId = await harness.save([rowGraph("s")]);
    let asked = 0;
    const answer = await harness.parts.runAs({ projectId: PROJECT, partId, inputs: {}, caller: "build", permittedConsequences: ["create_new"], permission: async () => {
      asked += 1;
      return asked < 2 ? { permitted: true } : { permitted: false, missing: ["create_new"], requestId: null };
    } });
    if ("ok" in answer) throw new Error((answer as AutomationStudioProjectPartRunRefusal).code);
    expect(answer.response).toMatchObject({ status: "stopped", stoppedAt: { reason: expect.stringContaining("not asked for") } });
    expect(harness.domain.pressed).toEqual(["a"]);
    expect(harness.domain.reads.count, "a no needs no read").toBe(2);
  });
});

describe("a lasting step with no list row", () => {
  it("keeps the once-only look: the first is checked, the second is not", async () => {
    const harness = await openRowsHarness({ rows: [{ key: "only", words: "one" }] });
    try {
      const graph = rowGraph("s");
      const press = graph.nodes.find((node) => node.id === "s.press")!;
      graph.nodes = graph.nodes.filter((node) => node.id !== "s.each").map((node) => node.id === "s.press" ? press : node);
      graph.nodes.push({ ...press, id: "s.second.press", label: "Press it again" });
      graph.edges = [
        { id: "1", sourceNodeId: "s.start", sourcePortId: "success", targetNodeId: "s.read", targetPortId: "in" },
        { id: "2", sourceNodeId: "s.read", sourcePortId: "success", targetNodeId: "s.press", targetPortId: "in" },
        { id: "3", sourceNodeId: "s.press", sourcePortId: "success", targetNodeId: "s.second.press", targetPortId: "in" },
        { id: "4", sourceNodeId: "s.second.press", sourcePortId: "success", targetNodeId: "s.end", targetPortId: "in" }
      ];
      const partId = await harness.save([graph]);
      const answer = await harness.parts.run({ projectId: PROJECT, partId, inputs: {}, ...ASKED }) as RunProjectPartResponse;
      expect(answer.status).toBe("succeeded");
      expect(harness.domain.pressed).toEqual(["none", "none"]);
      expect(harness.domain.asked, "asked without a row, once").toEqual(["none"]);
      expect(harness.domain.reads.count, "nothing reads the list again").toBe(1);
    } finally {
      await harness.close();
    }
  });
});
