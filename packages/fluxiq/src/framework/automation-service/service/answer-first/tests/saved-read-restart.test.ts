// @fluxiq-test-group real-sql
// Attempt 2 the day after attempt 1 (t869): a Core that restarted, a new service over the same data
// directory, runs what attempt 1 saved. The whole idea of a second attempt, and it did not hold: a
// saved read named its list by a handle only that process's memory knew.
//
// The domain here works as the web domain does (`domain/.../plan-resolution/extraction/saved-list.ts`,
// whose own test holds the real resolver to this): what a detection found lives in one process's
// memory under a handle, the step it answers names that handle and holds what it stands for beside it,
// and a step that holds nothing is refused once the memory is gone. Everything else is real: the
// service, its stores, the route, the assembly, the engine and the judge's scripted reply. No model
// decision is scripted for the second attempt, so one asked for reads as a look and fails the count.

import { afterEach, describe, expect, it, vi } from "vitest";
import type { JsonObject } from "../../../../../core/index.ts";
import type { AutomationStudioLlmEvidenceRuntimeBinding, AutomationStudioLlmEvidenceToolExecutionResult } from "../../../../../runtime/llm/index.ts";
import { complete, READ_LOANS, runNode } from "./fake-library.ts";
import { LOANS_OUTPUT } from "./fake-library-engine.ts";
import { laterAttempts, readLoans } from "./later-attempts.ts";

vi.setConfig({ testTimeout: 180_000 });

const cleanups: (() => Promise<void>)[] = [];
afterEach(async () => { for (const cleanup of cleanups.splice(0)) await cleanup(); });

const HANDLE = "extraction.1";
const KEPT = { item: ".loan", fields: { title: { selector: ".title" } } };

/** A domain whose detected lists live in memory: a new one is made by each new service, as a process would. `saves` says whether a step holds what its handle stands for. */
function aDomain(saves: boolean) {
  const memory = new Map<string, JsonObject>();
  return (binding: AutomationStudioLlmEvidenceRuntimeBinding): Partial<AutomationStudioLlmEvidenceRuntimeBinding> => ({
    executeTool: async (call) => {
      if (call.value.detect === true) memory.set(HANDLE, KEPT);
      const answer = await binding.executeTool(call) as AutomationStudioLlmEvidenceToolExecutionResult;
      const ranWith = answer.draft?.ranWith as { parameters?: JsonObject } | undefined;
      const list = ranWith?.parameters?.list as JsonObject | undefined;
      if (!saves || !list || !ranWith?.parameters || list.bound !== undefined) return answer;
      memory.set(HANDLE, KEPT);
      return { ...answer, draft: { ...answer.draft!, ranWith: { ...answer.draft!.ranWith, parameters: { ...ranWith.parameters, list: { ...list, bound: KEPT } } } } };
    },
    resolvePlanNodeParameters: ({ parameters, nodeDefinitionId }) => {
      if (nodeDefinitionId !== READ_LOANS) return { status: "resolved", parameters };
      const list = parameters.list as JsonObject | undefined;
      if (!list) return { status: "resolved", parameters };
      const known = list.bound ?? memory.get(String(list.handle));
      if (!known) return { status: "refused", issueCodes: ["web.handle.unknown", "web.handle.unknown:list"] };
      return { status: "resolved", parameters: { ...parameters, list: known as JsonObject } };
    }
  });
}

const namingItsList = () => runNode("read", READ_LOANS, { recordOutput: LOANS_OUTPUT, list: { handle: HANDLE } }, [], { add: true });

describe("attempt 2 after Core restarted", () => {
  it("runs what was saved: it assembles from what the step holds, needs no model decision beyond the judge's, and reads as a run of the Flow", async () => {
    const before = await laterAttempts(cleanups, { domain: aDomain(true) });
    const first = await before.attempt({ script: [namingItsList(), complete("Listed.")] });
    expect(first.answer.attempt).toMatchObject({ status: "achieved", path: "explore", ordinal: 1 });
    const saved = (await before.kept())?.best;
    expect(saved?.steps.length).toBeGreaterThan(0);
    await before.service.close();

    // A new service over the same data directory: nothing of the first is in memory, in this domain or in Core.
    const after = await laterAttempts(cleanups, { restart: before.restart(), domain: aDomain(true) });
    const readsBefore = after.target.reads;
    const second = await after.attempt({});
    expect(second.decisions).toHaveLength(0);
    expect(second.judgeCalls).toHaveLength(1);
    expect(second.answer.attempt).toMatchObject({ status: "achieved", path: "run_flow", ordinal: 2 });
    expect(second.answer.attempt.startedFrom).toEqual({ route: "use", attemptId: first.answer.attempt.attemptId, stepsDigest: saved?.stepsDigest });
    expect(second.answer.result?.rows?.previewRows.map((row) => row.title)).toEqual(["Atlas of Rivers", "Birds of the Coast", "Clockmaking"]);
    expect(after.target.reads - readsBefore).toBe(1);
    expect((await after.kept())?.best?.provenWhole).toBe(true);
  });

  it("runs under another Flow in the same process too, as the chat makes a new Flow each time", async () => {
    const domain = aDomain(true);
    const lane = await laterAttempts(cleanups, { domain });
    await lane.attempt({ script: [namingItsList(), complete("Listed.")] });
    const second = await lane.attempt({ flowId: "flow.another" });
    expect(second.decisions).toHaveLength(0);
    expect(second.answer.attempt).toMatchObject({ status: "achieved", path: "run_flow", ordinal: 2 });
  });

  it("a draft from before this, holding only its handle, is repaired and not run, and the task still gets its result", async () => {
    const before = await laterAttempts(cleanups, { domain: aDomain(false) });
    await before.attempt({ script: [namingItsList(), complete("Listed.")] });
    await before.service.close();
    const after = await laterAttempts(cleanups, { restart: before.restart(), domain: aDomain(false) });
    const second = await after.attempt({ script: [readLoans("again", {}), complete("Listed.")] });
    expect(after.said.join("\n")).not.toContain("web.handle.unknown");
    expect((await after.kept())?.attempts.at(-1)?.route).toBe("repair");
    expect(second.decisions.length).toBeGreaterThan(0);
    expect(second.answer.attempt.status).toBe("achieved");
    expect(second.answer.result?.rows?.totalRows).toBe(3);
  });
});
