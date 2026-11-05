// @fluxiq-test-group real-sql
// A saved Flow's repeat over a read whose first step is the row's whole link, on the real engine (t869).
//
// The second road that repeats: no model, the saved steps assembled and run through the For Each, the run
// gate and the attempt's record. The target's Renew stands for the page's press: it is told which row it is
// on only by the row the For Each hands the node, as the web node's scope is (`domain/src/output-nodes/native-runtime.ts`,
// then `apps/extension/src/content/action-runtime/pass-row/`, where `pass-row/tests/whole-row-link.test.ts` proves the aim
// on the same wire form). A row whose control the page cannot find answers as the page does, and that is an answer of
// the run, never an ending of the task: the attempt carries on from it.
import { afterEach, describe, expect, it, vi } from "vitest";
import type { AutomationNodeExecutionResult } from "../../../nodes/index.ts";
import { automationStudioAnswerFirstFlowRun } from "../flow-run/index.ts";
import { flowRunFixture, libraryTarget, LOANS_OUTPUT, savedStep, type FlowRunFixture } from "./fake-library-engine.ts";
import { READ_LOANS, RENEW_LOAN } from "./fake-library.ts";

vi.setConfig({ testTimeout: 60_000 });

const cleanups: (() => Promise<void>)[] = [];
afterEach(async () => { for (const cleanup of cleanups.splice(0)) await cleanup(); });

/** Read the rows, then for each: open it by its link, and press its lasting control there. */
const openAndRenewEach = () => [
  savedStep(1, READ_LOANS, { recordOutput: LOANS_OUTPUT }, { label: "the list of loans" }),
  savedStep(2, RENEW_LOAN, { control: "the row's link" }, { consequences: [], routing: { kind: "repeat", through: "saved.3", over: "saved.1" }, label: "Open it" }),
  savedStep(3, RENEW_LOAN, { control: "Renew" }, { consequences: ["modify_existing"], label: "Renew" })
];

const pressed = (fixture: FlowRunFixture) => fixture.target.presses.map((press) => press.subject);

const notFound: AutomationNodeExecutionResult = {
  status: "failed", route: "failed", message: "The row's own control was not on the page.",
  failure: { category: "target_not_found", code: "web.target.not_found", retryable: false, stage: "target_resolution", effect: "unacted" }
};

describe("a saved Flow's repeat over a whole-row link", () => {
  it("hands every step of every pass its own row, each row once", async () => {
    const fixture = await flowRunFixture({}, cleanups);
    const outcome = await automationStudioAnswerFirstFlowRun(fixture.ports, { steps: openAndRenewEach(), stepsDigest: "digest" });
    expect(outcome).toMatchObject({ kind: "ran", reachedEnd: true });
    expect(fixture.target.presses.map((press) => [press.subject, press.item])).toEqual([
      ["Atlas of Rivers", { title: "Atlas of Rivers", due: "2030-01-01" }], ["Atlas of Rivers", { title: "Atlas of Rivers", due: "2030-01-01" }],
      ["Birds of the Coast", { title: "Birds of the Coast", due: "2030-01-02" }], ["Birds of the Coast", { title: "Birds of the Coast", due: "2030-01-02" }],
      ["Clockmaking", { title: "Clockmaking", due: "2030-01-03" }], ["Clockmaking", { title: "Clockmaking", due: "2030-01-03" }]
    ]);
  });

  it("a row whose link cannot be found: its lasting step is never sent, the run answers where it stopped, and what landed is not done again next time", async () => {
    const target = libraryTarget();
    // The read, then the first row's two steps, then the second row's link.
    target.over = ({ nodeId, press }) => (nodeId === RENEW_LOAN && press === 4 ? notFound : undefined);
    const fixture = await flowRunFixture({ target }, cleanups);
    const outcome = await automationStudioAnswerFirstFlowRun(fixture.ports, { steps: openAndRenewEach(), stepsDigest: "digest" });
    expect(outcome).toMatchObject({ kind: "ran", reachedEnd: false, failing: { position: 2, code: "web.target.not_found" } });
    expect(pressed(fixture)).toEqual(["Atlas of Rivers", "Atlas of Rivers"]);
    expect(fixture.record.data().acts.map((act) => act.state)).toEqual(["landed"]);

    delete target.over;
    const again = await automationStudioAnswerFirstFlowRun(fixture.ports, { steps: openAndRenewEach(), stepsDigest: "digest" });
    expect(again).toMatchObject({ kind: "ran", reachedEnd: true });
    expect(target.library.renewals).toMatchObject({ "Birds of the Coast": 2, Clockmaking: 2 });
    expect(fixture.record.data().acts.filter((act) => act.state === "landed")).toHaveLength(3);
  });
});
