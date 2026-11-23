// @fluxiq-test-group real-sql
import { afterEach, describe, expect, it, vi } from "vitest";
import type { JsonObject } from "../../../../../core/index.ts";
import { automationStudioAnswerFirstTaskKey } from "../../answer-first/task-key/index.ts";
import { automationStudioAnswerFirstTaskMemoryOf } from "../../answer-first/task-memory/index.ts";
import { complete, RENEW_CARD, runNode, toolCall } from "../../answer-first/tests/fake-library.ts";
import { fluxNodeCallerKey } from "../caller-key.ts";
import { FluxNodeOwnerFlows } from "../owner-flows.ts";
import { findLoans, findLoansSpec, fluxNodeLane, type FluxNodeLane } from "./library-lane.ts";

vi.setConfig({ testTimeout: 180_000 });
const cleanups: (() => Promise<void>)[] = [];
afterEach(async () => { for (const cleanup of cleanups.splice(0)) await cleanup(); });
const declare = (process: JsonObject | null, why: string) => toolCall("declare", "core.set_result_processing", { process, why });

async function kept(lane: FluxNodeLane, name: string) {
  const source = await new FluxNodeOwnerFlows(lane.service, "library", () => 1).find(name);
  if (!("found" in source)) throw new Error("The test FluxNode was not registered.");
  const taskId = automationStudioAnswerFirstTaskKey({ instructionText: "", callerKey: fluxNodeCallerKey({ name, specHash: source.found.specHash }) });
  return automationStudioAnswerFirstTaskMemoryOf(lane.service, { paths: lane.service.projectPaths, projects: lane.service.projects }).get(source.found.projectId, taskId);
}

describe("real FluxNode processing entry", () => {
  it("repairs missing first action-only classification and persists it for three zero-call replays", async () => {
    const lane = await fluxNodeLane(cleanups);
    const spec = findLoansSpec({ name: "library.renew-card-only", goal: "Renew my card.", inputs: undefined, outputs: undefined, hasCheck: false, options: { judge: "off" }, scope: { acts: ["change"] } });
    const first = await lane.run({ spec, inputs: {} }, { script: [complete(), declare(null, "The task asks only to renew the card and has no records answer."), runNode("renew", RENEW_CARD, { control: "card" }, ["modify_existing"], { add: true }), complete("Renewed.")] });
    expect(first.result).toMatchObject({ status: "achieved", path: "explored" });
    expect((await kept(lane, spec.name))?.processing?.task).toBeNull();
    for (let index = 0; index < 3; index++) {
      const replay = await lane.run({ name: spec.name, inputs: {} });
      expect(replay.result).toMatchObject({ status: "achieved", path: "replayed", flowId: first.result.flowId, cost: { calls: 0 } });
      expect(replay.asked).toHaveLength(0);
    }
  });

  it.each(["latest_date", "LatestDate"])("resolves current %s on the same FluxNode key and replays saved criteria without model calls", async (inputName) => {
    const lane = await fluxNodeLane(cleanups);
    const spec = findLoansSpec({ name: "library.due-window", goal: `List my loans due on or after 2030-01-02 and no later than {${inputName}}. Return title and due in page order.`, inputs: { type: "object", properties: { [inputName]: { type: "string" } }, required: [inputName] }, hasCheck: false, options: { judge: "off" } });
    const process: JsonObject = { where: [{ field: "due", atLeast: "2030-01-02", atMost: { $input: inputName, test: "2030-01-02" }, as: "date" }], columns: ["title", "due"] };
    const first = await lane.run({ spec, inputs: { [inputName]: "2030-01-02" } }, { script: [declare(null, "Incorrect action-only claim: this must be refused because typed outputs require rows."), complete(), findLoans(""), declare(process, "The requested date window uses the caller's explicit latest input; the lower date is a fixed instruction constant."), complete("Listed.")] });
    expect(first.result).toMatchObject({ status: "achieved", path: "explored" });
    expect(first.result.outputs).toEqual({ loans: [{ title: "Birds of the Coast", due: "2030-01-02" }] });
    const original = await kept(lane, spec.name);
    expect(original?.processing?.task).toEqual({ process });
    expect(JSON.stringify(original?.best?.steps)).toContain(JSON.stringify({ $state: { path: inputName, fallback: "2030-01-02" } }));
    expect(JSON.stringify(original?.best?.steps)).toContain('"atLeast":"2030-01-02"');
    for (const latest of ["2030-01-03", "2030-01-02", "2030-01-03"]) {
      await lane.restartCore();
      const replay = await lane.run({ name: spec.name, inputs: { [inputName]: latest } });
      expect(replay.result).toMatchObject({ status: "achieved", path: "replayed", flowId: first.result.flowId, specHash: first.result.specHash, cost: { calls: 0 } });
      expect(replay.asked).toHaveLength(0);
      expect(replay.result.outputs).toEqual({ loans: [{ title: "Birds of the Coast", due: "2030-01-02" }, ...(latest.endsWith("03") ? [{ title: "Clockmaking", due: "2030-01-03" }] : [])] });
      expect((await kept(lane, spec.name))?.processing).toEqual(original?.processing);
    }
  });

  it("keeps a mixed action and rows task as data and cannot erase it with null", async () => {
    const lane = await fluxNodeLane(cleanups);
    const spec = findLoansSpec({ name: "library.renew-and-list", goal: "Renew my card, then list all loans with title and due.", inputs: undefined, hasCheck: false, options: { judge: "off" }, scope: { acts: ["change"] } });
    const first = await lane.run({ spec, inputs: {} }, { script: [runNode("renew", RENEW_CARD, { control: "card" }, ["modify_existing"], { add: true }), findLoans(""), declare({ columns: ["title", "due"] }, "The task asks to list all loans after renewing the card."), declare(null, "This attempt to erase a declared data answer must be refused."), complete("Renewed and listed.")] });
    expect(first.result.status).toBe("achieved");
    expect(first.result.outputs).toEqual({ loans: lane.library.loans });
    expect((await kept(lane, spec.name))?.processing?.task).toEqual({ process: { columns: ["title", "due"] } });
  });
});
