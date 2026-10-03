// A rerun of a step whose instructed act was already done is a check of the new
// argument, never the act done a second time (`../rerun-check.ts`), run through the loop.
//
// Live run `run-murwcaj0-40e56557` (R7, social-network-feed): step 6 confirmed
// Amara's friend request as act a1 in round 0. The repair round amended `rerun`
// of step 6 with `target: {handle: t744}`, which was Tom Becker's Confirm, and
// the rerun ran live: reset, the listing replayed, Confirm pressed -- "Request
// accepted" on Tom's card, a request the instruction said to leave alone. The
// fake site below is that page: two requests, a Confirm on each, and a check
// (`replay: "verify"`) that acts on nothing.
import { describe, expect, it, vi } from "vitest";
import type { JsonObject } from "../../../../../../core/index.ts";
import { runAutomationStudioLlmEvidenceLoop } from "../../index.ts";

const tools = [{ toolId: "press", description: "Press a control.", inputSchema: { type: "object" }, effect: "mutate" as const, perCallEffect: true }];
const PEOPLE = ["Amara", "Tom"];

/** The friend-requests page. `ranWith` says whether a check answers with the resolved form of what it checked. */
function requests(options: { ranWith?: boolean } = {}) {
  const accepted = new Set<string>();
  const state = () => `requests|${[...accepted].sort().join(",")}`;
  const executeTool = vi.fn(async ({ value }: { callId?: string; toolId: string; value: JsonObject }) => {
    if (value.replay === "reset") return { kind: "llm_evidence_tool_execution", evidence: { ok: true }, effectApplied: true, resultCode: "core.replay.replayed" };
    const who = String(value.target).replace(/^Confirm /u, "");
    if (value.replay === "verify") {
      const code = !PEOPLE.includes(who) ? "core.replay.unreproducible" : accepted.has(who) ? "core.replay.present" : "core.replay.verified";
      return {
        kind: "llm_evidence_tool_execution",
        evidence: { ok: code !== "core.replay.unreproducible", code, said: `checked Confirm ${who}; it was not run` },
        effectApplied: false,
        resultCode: code,
        ...(options.ranWith && code !== "core.replay.unreproducible" ? { draft: { actionId: "web.click", effect: "mutate", ranWith: { target: `#confirm-${who.toLowerCase()}` } } } : {})
      };
    }
    const before = state();
    if (PEOPLE.includes(who)) accepted.add(who);
    return {
      kind: "llm_evidence_tool_execution",
      stateDigests: { before, after: state() },
      evidence: { ok: true, pressed: `Confirm ${who}`, accepted: [...accepted] },
      effectApplied: true,
      resultCode: "web.action.succeeded",
      draft: { actionId: "web.click", effect: "mutate", proposes: true, ranWith: { target: `#confirm-${who.toLowerCase()}` }, replay: { from: { location: "requests" } } }
    };
  });
  return { accepted, executeTool };
}

const loop = (decide: ReturnType<typeof vi.fn>, executeTool: ReturnType<typeof requests>["executeTool"]) => runAutomationStudioLlmEvidenceLoop({
  tools, decide, executeTool, maxIterations: 12, maxToolCalls: 12, dryRun: false, propagateDecisionErrors: true, unusableDecisions: { maxConsecutive: 8, stalled: () => new Error("stalled") }
});
const confirmAmara = { kind: "tool_call", callId: "confirm-amara-1", toolId: "press", input: { target: "Confirm Amara" }, add: true, act: "a1" };
const rerun = (target: string, more: JsonObject[] = []) => ({ kind: "amend_draft", amendments: [{ step: 1, change: "rerun", input: { target } }, ...more] });
type Shown = ReadonlyArray<{ callId: string; toolId: string; value: JsonObject }>;
const shownAt = (decide: { mock: { calls: unknown[][] } }, index: number): Shown => (decide.mock.calls[index]![0] as { evidence: Shown }).evidence;
type Steps = Array<{ input: JsonObject; ranWith?: JsonObject; acts?: string[]; disposition: string }>;
const stepsOf = (result: unknown): Steps => (result as { steps: Steps }).steps;

describe("a rerun of a step whose act was already done while building", () => {
  it("checks the new argument and does not press Confirm on Tom's request", async () => {
    const decide = vi.fn()
      .mockResolvedValueOnce(confirmAmara)
      .mockResolvedValueOnce(rerun("Confirm Tom"))
      .mockResolvedValueOnce({ kind: "complete", result: { done: true } });
    const site = requests({ ranWith: true });

    const result = await loop(decide, site.executeTool).catch((error: unknown) => ({ thrown: error }));

    expect(site.executeTool.mock.calls.map(([call]) => [call.callId, call.value.replay ?? null, call.value.target ?? null])).toEqual([
      ["confirm-amara-1", null, "Confirm Amara"],
      ["rerun.1.place", "reset", null],
      ["rerun.1", "verify", "Confirm Tom"]
    ]);
    // The check is sent where the step found the page, like the dry run's.
    expect(site.executeTool.mock.calls[2]![0].value).toMatchObject({ replay: "verify", from: { location: "requests" } });
    expect([...site.accepted]).toEqual(["Amara"]);
    // Verified: the step that does a1 now runs with the new argument, in the form the host resolved it to.
    const actStep = stepsOf(result).find((step) => step.acts?.includes("a1"));
    expect(actStep).toMatchObject({ input: { target: "Confirm Tom" }, ranWith: { target: "#confirm-tom" }, disposition: "kept" });
    // And the model is told plainly why it was checked and not done.
    const answered = shownAt(decide, 2).find((entry) => entry.callId === "rerun.1")?.value;
    expect(answered).toMatchObject({ code: "core.replay.verified", rerunCheck: { checked: true, doneAgain: false, took: true, acts: ["a1"] } });
    const detail = String((answered?.rerunCheck as JsonObject).detail);
    expect(detail).toContain("not done again");
    expect(detail).toContain("already did it once while this Flow was being built");
    expect(detail).toContain("on each row its listing keeps");
  });

  it("takes the new argument on present as well, and applies the amendments held for it to that step", async () => {
    const decide = vi.fn()
      .mockResolvedValueOnce(confirmAmara)
      .mockResolvedValueOnce(rerun("Confirm Amara", [{ step: 1, change: "optional" }]))
      .mockResolvedValueOnce({ kind: "complete", result: { done: true } });
    const site = requests({ ranWith: true });

    const result = await loop(decide, site.executeTool).catch((error: unknown) => ({ thrown: error }));

    expect(site.executeTool.mock.calls.filter(([call]) => call.value.replay === undefined)).toHaveLength(1);
    const answered = shownAt(decide, 2).find((entry) => entry.callId === "rerun.1")?.value;
    expect(answered).toMatchObject({ code: "core.replay.present", rerunCheck: { took: true } });
    const actStep = stepsOf(result).find((step) => step.acts?.includes("a1")) as (Steps[number] & { routing?: JsonObject }) | undefined;
    expect(actStep?.routing).toMatchObject({ kind: "optional" });
  });

  it("refuses the rerun like a failed one when the check cannot reproduce the target, and keeps the step as it ran", async () => {
    const decide = vi.fn()
      .mockResolvedValueOnce(confirmAmara)
      .mockResolvedValueOnce(rerun("Confirm Nobody"))
      .mockResolvedValueOnce({ kind: "complete", result: { done: true } });
    const site = requests();

    const result = await loop(decide, site.executeTool).catch((error: unknown) => ({ thrown: error }));

    expect(site.executeTool.mock.calls.map(([call]) => call.value.replay ?? null)).toEqual([null, "reset", "verify"]);
    const actStep = stepsOf(result).find((step) => step.acts?.includes("a1"));
    expect(actStep).toMatchObject({ input: { target: "Confirm Amara" }, ranWith: { target: "#confirm-amara" } });
    const answered = shownAt(decide, 2).find((entry) => entry.callId === "rerun.1")?.value;
    expect(answered).toMatchObject({ code: "core.replay.unreproducible", rerunCheck: { checked: true, doneAgain: false, took: false } });
    expect(String((answered?.rerunCheck as JsonObject).detail)).toContain("keeps the argument it ran with");
  });

  it("drops the resolved form of the old target when the check names no resolved form for the new one", async () => {
    const decide = vi.fn()
      .mockResolvedValueOnce(confirmAmara)
      .mockResolvedValueOnce(rerun("Confirm Tom"))
      .mockResolvedValueOnce({ kind: "complete", result: { done: true } });
    const site = requests();

    const result = await loop(decide, site.executeTool).catch((error: unknown) => ({ thrown: error }));

    const actStep = stepsOf(result).find((step) => step.acts?.includes("a1"));
    expect(actStep?.input).toEqual({ target: "Confirm Tom" });
    // Amara's selector under Tom's name would confirm Amara's request in every run of the Flow.
    expect(actStep?.ranWith).toBeUndefined();
  });

  it("still runs a plain call as asked: no restriction beyond permissions", async () => {
    const decide = vi.fn()
      .mockResolvedValueOnce(confirmAmara)
      .mockResolvedValueOnce({ kind: "tool_call", callId: "confirm-tom-1", toolId: "press", input: { target: "Confirm Tom" } })
      .mockResolvedValueOnce({ kind: "complete", result: { done: true } });
    const site = requests();

    await loop(decide, site.executeTool).catch(() => undefined);

    expect([...site.accepted].sort()).toEqual(["Amara", "Tom"]);
  });

  it("still runs again a rerun of a changing step that does no act", async () => {
    const decide = vi.fn()
      .mockResolvedValueOnce({ ...confirmAmara, act: undefined })
      .mockResolvedValueOnce(rerun("Confirm Tom"))
      .mockResolvedValueOnce({ kind: "complete", result: { done: true } });
    const site = requests();

    await loop(decide, site.executeTool).catch(() => undefined);

    expect(site.executeTool.mock.calls.map(([call]) => call.value.replay ?? null)).toEqual([null, "reset", null]);
    expect([...site.accepted].sort()).toEqual(["Amara", "Tom"]);
  });
});
