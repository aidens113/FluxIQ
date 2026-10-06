import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { ClientGatewayActivity } from "@fluxiq/contracts/client-gateway";
import type { AutomationStudioLlmEvidenceLoopInput } from "../../llm/index.ts";
import { activityActionOf } from "../../../../../ui/index.ts";
import { automationStudioActivityHub } from "../default-hub.ts";
import { observeAutomationStudioEvidenceLoop } from "../observer.ts";
import { runWithAutomationStudioActivity } from "../scope.ts";

let seen: ClientGatewayActivity[] = [];
let unsubscribe: () => void = () => undefined;
beforeEach(() => {
  seen = [];
  unsubscribe = automationStudioActivityHub.subscribe((event) => seen.push(event));
});
afterEach(() => unsubscribe());

const inScope = <T>(fn: () => Promise<T>) => runWithAutomationStudioActivity({ kind: "build", id: "b1", projectId: "p1" }, fn);
const START = "http://127.0.0.1:60766/scenarios/social-network-feed/";
const ROWS = [
  { name: "Amara Osei", mutualFriends: "23 mutual friends" },
  { name: "Jonas Weber", mutualFriends: "7 mutual friends" },
  { name: "Lin Zhao", mutualFriends: "9 mutual friends" },
  { name: "Freya Holm", mutualFriends: "5 mutual friends" }
];
const CONFIRM = { node: "web.output.dom-click", parameters: { element: { role: "button", accessibleName: "Confirm" } }, consequences: ["modify_existing"], replay: "verify" };

/** What the host answers each call with, by call id: a replay's code, and for the list read its rows. */
function answer(call: { callId: string }): unknown {
  if (call.callId === "dryrun.1.13") {
    return {
      kind: "llm_evidence_tool_execution",
      evidence: { ok: true, code: "core.replay.replayed", said: "the step ran again", readRows: { rows: ROWS.map((row) => ({ name: row.name })) } },
      effectApplied: true,
      resultCode: "core.replay.replayed",
      outputs: { records: ROWS }
    };
  }
  const code = call.callId.endsWith(".pass.1") ? "core.replay.present" : call.callId.includes(".pass.") ? "core.replay.verified" : call.callId.startsWith("dryrun.") ? "core.replay.replayed" : "web.action.succeeded";
  return { kind: "llm_evidence_tool_execution", evidence: { ok: true }, effectApplied: true, resultCode: code };
}

function loopInput(): AutomationStudioLlmEvidenceLoopInput {
  return { tools: [], decide: async () => ({ kind: "complete", result: {} }), executeTool: async (call) => answer(call) as never };
}

const ended = () => seen.filter((event) => event.detail?.kind === "tool" && event.detail.status !== "started");
const cardOf = (callTitle: RegExp) => activityActionOf(ended().find((event) => callTitle.test(event.detail?.title ?? ""))!);

// U10, live run `run-muw6144a-e56f945d`: the build's navigate to `/friends/`
// read "Opening the start page" / "Open page · the start page".
describe("the start page is the address the work starts at", () => {
  it("names a navigate there the start page, and a navigate elsewhere on this machine by its path", async () => {
    const observed = observeAutomationStudioEvidenceLoop(loopInput());
    await inScope(async () => {
      await observed.executeTool({ callId: "initial.core.run_node", toolId: "core.run_node", value: { node: "web.output.browser-navigate", parameters: { url: START } } });
      await observed.executeTool({ callId: "nav-friends-1", toolId: "core.run_node", value: { node: "web.output.browser-navigate", parameters: { url: "http://127.0.0.1:60766/friends/" } } });
      await observed.executeTool({ callId: "back-1", toolId: "core.run_node", value: { node: "web.output.browser-navigate", parameters: { url: START } } });
    });
    expect(ended().map((event) => event.detail?.title)).toEqual(["Opening where the Flow starts", "Opening “friends”", "Opening the start page"]);
    expect(activityActionOf(ended()[1]!)?.target).toBe("friends");
    expect(activityActionOf(ended()[2]!)?.target).toBe("the start page");
  });

  it("learns the start from a test's reset, and from the draft's first step, in a round that did not open it", async () => {
    const reset = observeAutomationStudioEvidenceLoop(loopInput());
    await inScope(async () => {
      await reset.executeTool({ callId: "dryrun.1.reset", toolId: "core.run_node", value: { replay: "reset", from: { location: START } } });
      await reset.executeTool({ callId: "dryrun.1.1", toolId: "core.run_node", value: { node: "web.output.browser-navigate", parameters: { url: START }, replay: "step" } });
    });
    expect(ended().at(-1)?.detail?.title).toBe("Opening the start page");

    seen = [];
    const drafted = observeAutomationStudioEvidenceLoop({ ...loopInput(), decide: async () => ({ kind: "tool_call", callId: "go-1", toolId: "core.run_node", input: { node: "web.output.browser-navigate", parameters: { url: START } } }) as never });
    const draft = { callId: "core.flow_draft", toolId: "core.flow_draft", value: { steps: [{ step: 1, actionId: "web.output.browser-navigate", input: { node: "web.output.browser-navigate", parameters: { url: START } }, inResult: true }] } as never };
    await inScope(async () => {
      await drafted.decide({ iteration: 1, tools: [], evidence: [draft], decisionSchema: {}, canComplete: true });
      await drafted.executeTool({ callId: "go-1", toolId: "core.run_node", value: { node: "web.output.browser-navigate", parameters: { url: START } } });
    });
    expect(ended().at(-1)?.detail?.title).toBe("Opening the start page");
  });
});

// U1 (`run-muw6144a-e56f945d`): three passes of a repeated Confirm read
// "Testing: Click · Confirm — Checked, not pressed" three times, identical.
// U-1 (`run-muw60j7c-bb7c9a62`): a test's list read said "Read list · Done" with no count.
describe("a test's repeated step names its row, and its list read its rows", () => {
  it("says which row each pass is on, from the list read before it, and how many rows that read kept", async () => {
    const observed = observeAutomationStudioEvidenceLoop(loopInput());
    await inScope(async () => {
      await observed.executeTool({ callId: "dryrun.1.13", toolId: "core.run_node", value: { node: "web.output.dom-extract_list", parameters: { extractList: { fields: { name: "a" } } }, replay: "step" } });
      for (const [index, row] of ROWS.slice(0, 3).entries()) {
        await observed.executeTool({ callId: `dryrun.1.14.pass.${index + 1}`, toolId: "core.run_node", value: { ...CONFIRM, item: row } });
      }
    });
    const read = cardOf(/^Reading/u);
    expect(read).toMatchObject({ kind: "read", outcome: "done", testing: true, result: "4 rows" });
    expect(ended()[0]!.detail?.text).toBe("Result: core.replay.replayed · Rows: 4 · Node: web.output.dom-extract_list");
    const passes = ended().slice(1).map((event) => activityActionOf(event));
    expect(passes.map((pass) => [pass?.target, pass?.tested])).toEqual([
      ["Confirm · Amara Osei", "Already done on the site"],
      ["Confirm · Jonas Weber", "Checked, not pressed"],
      ["Confirm · Lin Zhao", "Checked, not pressed"]
    ]);
    expect(ended()[2]!.label).toBe("Trying the Flow from the start: clicking “Confirm” for “Jonas Weber” — checked, not pressed");
    // Only the row's name, never its other values.
    expect(JSON.stringify(seen)).not.toContain("mutual friends");
  });

  it("names no row when no read named its rows, or the pass carries none", async () => {
    const observed = observeAutomationStudioEvidenceLoop(loopInput());
    await inScope(async () => {
      await observed.executeTool({ callId: "dryrun.1.14.pass.1", toolId: "core.run_node", value: { ...CONFIRM, item: ROWS[0]! } });
      await observed.executeTool({ callId: "dryrun.1.13", toolId: "core.run_node", value: { node: "web.output.dom-extract_list", replay: "step" } });
      await observed.executeTool({ callId: "dryrun.1.16.pass.2", toolId: "core.run_node", value: CONFIRM });
    });
    expect([activityActionOf(ended()[0]!)?.target, activityActionOf(ended()[2]!)?.target]).toEqual(["Confirm", "Confirm"]);
    expect(ended()[0]!.detail?.title).toBe("Clicking “Confirm”");
    expect(ended()[2]!.detail?.title).toBe("Clicking “Confirm”");
  });
});
