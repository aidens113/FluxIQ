// @fluxiq-test-group real-sql
// A read, then a repeat over a call to an action part, the row handed across the call. The real
// store, executor, For Each and frames; a host and a domain of plain functions. Asserted: what
// reached the domain.
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { RunProjectPartResponse } from "../../../../../../api-contracts/automation.ts";
import type { AutomationStudioRuntimeSession } from "../../../../../../flows/authoring/model/index.ts";
import { actionGraph, openRowsHarness, passOnGraph, PROJECT, siteGraph, type RowsHarness } from "./part-rows-harness.ts";

const ASKED = { permittedConsequences: ["create_new"], acknowledgedRepeat: true };

describe("a row that crosses a call", () => {
  let harness: RowsHarness;
  const runIt = async (partId: string) => await harness.parts.run({ projectId: PROJECT, partId, inputs: {}, ...ASKED }) as RunProjectPartResponse;
  const siteOverAction = async () => await harness.save([actionGraph("act"), siteGraph("site", { subflowId: "subflow.act" })]);

  beforeEach(async () => {
    harness = await openRowsHarness();
  });
  afterEach(async () => {
    await harness.close();
  });

  it("presses each row once, scoped to it, finding it again in the caller's frame and looking at its own control first", async () => {
    const answer = await runIt(await siteOverAction());
    expect(answer).toMatchObject({ status: "succeeded", acts: ["create_new"], modelCalls: 0 });
    expect(harness.domain.pressed).toEqual(["a", "b", "c"]);
    expect(harness.domain.reads.count, "the read itself, and once again before each press").toBe(4);
    expect(harness.domain.asked, "each question names its row: none is about the look-alike control in general").toEqual(["a", "b", "c"]);
    expect((harness.domain.handed as { key: string }[]).map((row) => row.key)).toEqual(["a", "b", "c"]);
  });

  it("presses the right row when rows moved between the read and the press, by identity and never by position", async () => {
    harness.page.afterRead = (reads) => {
      if (reads === 1) harness.page.rows = [...harness.page.rows].reverse();
    };
    const answer = await runIt(await siteOverAction());
    expect(answer.status).toBe("succeeded");
    expect(harness.domain.pressed).toEqual(["a", "b", "c"]);
    expect(harness.domain.asked).toEqual(["a", "b", "c"]);
  });

  it("stops at a row that is gone, says so, presses nothing for it, and does not try the rows after it", async () => {
    harness.page.afterPress = (key) => {
      if (key === "a") harness.page.rows = harness.page.rows.filter((row) => row.key !== "b");
    };
    const answer = await runIt(await siteOverAction());
    expect(answer).toMatchObject({ status: "stopped", acts: ["create_new"], stoppedAt: { stepLabel: "Press it", reason: expect.stringContaining("gone") } });
    expect(harness.domain.pressed).toEqual(["a"]);
    expect(harness.domain.asked).toEqual(["a"]);
  });

  it("two rows the fresh list cannot tell apart: stops, with nothing pressed", async () => {
    harness.page.rows = [{ key: "a", words: "first" }, { key: "a", words: "first" }];
    const answer = await runIt(await siteOverAction());
    expect(answer).toMatchObject({ status: "stopped", acts: [], stoppedAt: { reason: expect.stringContaining("told apart") } });
    expect(harness.domain.pressed).toEqual([]);
  });

  it("the row is there and its own control is not: stops, with nothing pressed", async () => {
    harness.page.noControl.add("b");
    const answer = await runIt(await siteOverAction());
    expect(answer.status).toBe("stopped");
    expect(harness.domain.pressed).toEqual(["a"]);
    expect(harness.domain.asked).toEqual(["a", "b"]);
  });

  it("an act that may have landed is not pressed again, and no later row is tried", async () => {
    harness.page.pressAnswer = (key) => (key === "b" ? "uncertain" : "landed");
    const answer = await runIt(await siteOverAction());
    expect(answer.status).toBe("stopped");
    expect(harness.domain.pressed).toEqual(["a", "b"]);
  });

  it("a press that surely did not act is tried again, the row looked at again first, and lands once", async () => {
    harness.page.pressAnswer = (key, tries) => (key === "a" && tries === 1 ? "unacted" : "landed");
    const answer = await runIt(await siteOverAction());
    expect(answer.status).toBe("succeeded");
    expect(harness.domain.pressed).toEqual(["a", "a", "b", "c"]);
    expect(harness.domain.reads.count, "one more for the look before the second try").toBe(5);
    expect(harness.domain.asked).toEqual(["a", "a", "b", "c"]);
  });

  it("a list that cannot be read again stops the run, with nothing pressed", async () => {
    harness.page.readFails = (reads) => reads === 2;
    const answer = await runIt(await siteOverAction());
    expect(answer).toMatchObject({ status: "stopped", stoppedAt: { reason: expect.stringContaining("could not be read again") } });
    expect(harness.domain.pressed).toEqual([]);
  });

  it("a host that cannot match a row is no match: the run stops with nothing pressed", async () => {
    await harness.close();
    harness = await openRowsHarness({ noMatcher: true });
    const answer = await runIt(await siteOverAction());
    expect(answer.status).toBe("stopped");
    expect(harness.domain.pressed).toEqual([]);
  });

  it("follows the row through a part that hands it on, to the step that read it two frames up", async () => {
    const partId = await harness.save([actionGraph("act"), passOnGraph("pass", { subflowId: "subflow.act" }), siteGraph("site", { subflowId: "subflow.pass" })]);
    const answer = await runIt(partId);
    expect(answer.status).toBe("succeeded");
    expect(harness.domain.pressed).toEqual(["a", "b", "c"]);
    expect(harness.domain.reads.count).toBe(4);
    expect(harness.domain.asked).toEqual(["a", "b", "c"]);
  });

  it("a call in a repeat that hands no row: a press it cannot tell apart is never made, on a control that looks the same or one that does not", async () => {
    const partId = await harness.save([actionGraph("act"), siteGraph("site", { subflowId: "subflow.act" }, { given: {} })]);
    harness.page.rows = [{ key: "a", words: "first" }];
    const answer = await harness.parts.run({ projectId: PROJECT, partId, inputs: {}, ...ASKED }) as RunProjectPartResponse;
    expect(answer).toMatchObject({ status: "stopped", acts: [], stoppedAt: { reason: expect.stringContaining("was not handed the item") } });
    expect(harness.domain.pressed).toEqual([]);
  });

  it("the row's fields handed without the row stop the same way", async () => {
    const partId = await harness.save([actionGraph("act"), siteGraph("site", { subflowId: "subflow.act" }, { given: { item: { $state: { path: "item.words" } } } })]);
    const answer = await runIt(partId);
    expect(answer.status).toBe("stopped");
    expect(harness.domain.pressed).toEqual([]);
  });

  it("one row called twice is one act: the same part at the same version does not press it again", async () => {
    harness.page.rows = [{ key: "a", words: "first" }];
    const site = siteGraph("site", { subflowId: "subflow.act" });
    // A second call of the same part, on the same pass, with the same row.
    const second = { ...site.nodes.find((node) => node.id === "site.call")!, id: "site.again" };
    site.nodes.splice(4, 0, second);
    site.edges = site.edges.filter((one) => one.id !== "site.5");
    site.edges.push({ id: "site.5a", sourceNodeId: "site.call", sourcePortId: "success", targetNodeId: "site.again", targetPortId: "in" }, { id: "site.5b", sourceNodeId: "site.again", sourcePortId: "success", targetNodeId: "site.each", targetPortId: "in" });
    const answer = await runIt(await harness.save([actionGraph("act"), site]));
    expect(answer.status).toBe("succeeded");
    expect(harness.domain.pressed).toEqual(["a"]);
  });

  it("the trace says which version each frame ran, for the site and for the action", async () => {
    const answer = await runIt(await siteOverAction());
    const session = harness.sessions.find((one) => one.runId === answer.runId && one.status === "succeeded") as AutomationStudioRuntimeSession;
    const targets: string[] = [];
    const visit = (attempts: NonNullable<AutomationStudioRuntimeSession["trace"]>["attempts"]) => {
      for (const attempt of attempts) {
        if (attempt.subflowTarget) targets.push(attempt.subflowTarget.subflowId);
        if (attempt.childTrace) visit(attempt.childTrace.attempts);
      }
    };
    visit(session.trace!.attempts);
    expect(new Set(targets).size, targets.join(" ")).toBe(2);
    expect(targets.every((target) => /^part:part\.[0-9a-f]+:v1$/u.test(target)), targets.join(" ")).toBe(true);
    expect(targets).toHaveLength(4);
  });
});
