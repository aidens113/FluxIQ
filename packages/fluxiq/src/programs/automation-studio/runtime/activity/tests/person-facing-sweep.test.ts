// The person-facing sweep (t753): Core's real chat and overlay producers, driven
// with inputs shaped like what round 5 showed a person, read back through the
// shared card and status readers, and every sentence a person reads put
// through the guard (`ui/person-facing/`). Each test lists the texts that
// fault, so a failure names the producer and the words it said. Inputs are
// generic: a recipe archive and a page with two controls, never a realistic
// site, product or task.
import type { ClientGatewayActivity } from "@fluxiq/contracts/client-gateway";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { ACTIVITY_ACTION_NAMES, ActivityPacer, activityActionOf, personFacingTextFaults, type ActivityDisplay } from "../../../../../ui/index.ts";
import { FakeClock } from "../../../../../ui/activity-status/tests/fake-clock.ts";
import { TEST_HOST_WORDS } from "../../../../../ui/activity-status/tests/test-host-words.ts";
import type { AutomationStudioLlmEvidenceLoopInput } from "../../llm/index.ts";
import { AUTOMATION_STUDIO_PROJECT_SUPERVISOR_GUIDANCE as GUIDANCE } from "../../project-agents/supervisor/index.ts";
import { structurePlan, taskSpec } from "../../project-agents/tests/fixtures.ts";
import { withAutomationStudioBuildActivity } from "../build.ts";
import { automationStudioActivityCallContext } from "../call-context.ts";
import { automationStudioActivityRefusedCall } from "../decision-answer/index.ts";
import { automationStudioActivityHub } from "../default-hub.ts";
import { observeAutomationStudioEvidenceLoop } from "../observer.ts";
import { emitAutomationStudioProjectPlanCard, emitAutomationStudioProjectReceiptCard } from "../project/index.ts";
import { runWithAutomationStudioActivity } from "../scope.ts";
import { automationStudioActivityToolCall } from "../wording/index.ts";

let seen: ClientGatewayActivity[] = [];
let unsubscribe: () => void = () => undefined;
beforeEach(() => {
  seen = [];
  unsubscribe = automationStudioActivityHub.subscribe((event) => seen.push(event));
});
afterEach(() => unsubscribe());

type Evidence = Parameters<AutomationStudioLlmEvidenceLoopInput["decide"]>[0]["evidence"];
type ToolCall = Parameters<AutomationStudioLlmEvidenceLoopInput["executeTool"]>[0];

const inScope = <T>(fn: () => Promise<T>) => runWithAutomationStudioActivity({ kind: "build", id: "b1", projectId: "p1" }, fn);
const decideRequest = { iteration: 1, tools: [], evidence: [], decisionSchema: {}, canComplete: true };
const toolCall = (callId: string, toolId: string, value: ToolCall["value"] = {}): ToolCall => ({ callId, toolId, value });
/** A page view that printed one control only by a generated class hint, and one by its name. */
const VIEW: Evidence = [{ callId: "c0", toolId: "web.observe", value: "t5 button class=\"css-0732x7m\"\nt6 link \"Help\"" }];
const ON_T5: ToolCall["value"] = { parameters: { target: { handle: "t5" } } };

function loopInput(overrides: Partial<AutomationStudioLlmEvidenceLoopInput> = {}): AutomationStudioLlmEvidenceLoopInput {
  return {
    tools: [],
    decide: async () => ({ kind: "complete", result: {} }),
    executeTool: async () => ({ kind: "llm_evidence_tool_execution", evidence: { observed: "ok" }, effectApplied: false, resultCode: "tool.ok" }),
    ...overrides
  };
}

type Faulted = { from: string; text: string; faults: readonly string[] };
const faultsIn = (from: string, texts: ReadonlyArray<string | null | undefined>): Faulted[] =>
  texts.filter((text): text is string => typeof text === "string" && text.length > 0)
    .map((text) => ({ from, text, faults: personFacingTextFaults(text) }))
    .filter((entry) => entry.faults.length > 0);

/** Everything a person reads of one event: its status line, its row's title, a note's or step's text, its card and a plan card's subflows. */
function eventTexts(event: ClientGatewayActivity): Faulted[] {
  const detail = event.detail;
  const shownText = detail && (detail.kind === "note" || detail.kind === "step") ? detail.text : undefined;
  const action = activityActionOf(event);
  const card = action ? [`${action.name ?? ACTIVITY_ACTION_NAMES[action.kind]}${action.target ? ` · ${action.target}` : ""}`, action.why] : [];
  const project = detail?.project as { subflows?: Array<{ name?: string; purpose?: string }> } | undefined;
  const parts = (project?.subflows ?? []).flatMap((entry) => [entry.name, entry.purpose]);
  return [
    ...faultsIn("label", [event.label]),
    ...faultsIn("title", [detail?.title]),
    ...faultsIn("text", [shownText]),
    ...faultsIn("card", card),
    ...faultsIn("plan card", parts)
  ];
}
const allTexts = (events: readonly ClientGatewayActivity[]): Faulted[] => events.flatMap(eventTexts);

describe("person-facing sweep: activity producers", () => {
  it("wording/tool-call.ts: a project build's own tools", () => {
    const said = ["core.submit_subflow", "core.test_subflow"].flatMap((toolId) => {
      const words = automationStudioActivityToolCall(toolCall("c1", toolId));
      return faultsIn(`tool-call ${toolId}`, [words.title, words.label]);
    });
    expect(said).toEqual([]);
  });

  it("observer + ui/activity-action/action-of.ts: the cards of those tools", async () => {
    const observed = observeAutomationStudioEvidenceLoop(loopInput());
    await inScope(async () => {
      await observed.decide({ ...decideRequest });
      await observed.executeTool(toolCall("c1", "core.submit_subflow"));
      await observed.executeTool(toolCall("c2", "core.test_subflow"));
    });
    expect(allTexts(seen.filter((event) => event.detail?.kind === "tool"))).toEqual([]);
  });

  it("wording/action.ts + call-context.ts: a control the page view printed only by a generated class", async () => {
    const context = automationStudioActivityCallContext();
    context.decided(VIEW);
    const direct = ["web.output.dom-describe", "web.output.dom-click"].flatMap((toolId) => {
      const call = toolCall("c2", toolId, ON_T5);
      const words = automationStudioActivityToolCall(call, { target: context.target(call), role: context.role(call) });
      return faultsIn(`action ${toolId}`, [words.title, words.label]);
    });
    const observed = observeAutomationStudioEvidenceLoop(loopInput());
    await inScope(async () => {
      await observed.decide({ ...decideRequest, evidence: VIEW });
      await observed.executeTool(toolCall("c2", "web.output.dom-describe", ON_T5));
    });
    expect([...direct, ...allTexts(seen.filter((event) => event.detail?.kind === "tool"))]).toEqual([]);
  });

  it("decision-answer/refused-call.ts: a refused repeat of a subflow's submission", async () => {
    const refused = automationStudioActivityRefusedCall();
    const refusal: Evidence = [{ callId: "core.repeat_check.7", toolId: "core.repeat_check", value: { ok: false, code: "llm_evidence_loop.repeat_refused", then: { outcome: "changed_nothing" } } }];
    await inScope(async () => {
      refused.hold({ iteration: 7, call: toolCall("c9", "core.submit_subflow"), described: undefined });
      refused.decided(refusal);
    });
    expect(seen).toHaveLength(1);
    expect(allTexts(seen)).toEqual([]);
  });

  it("project/receipt-card.ts: a part's trial and a whole-Flow trial that could not be confirmed", async () => {
    await inScope(async () => {
      emitAutomationStudioProjectReceiptCard({ receipt: { kind: "subflow_trial", receiptId: "receipt.1", digest: "c".repeat(64) }, verdict: "passed", briefId: "b1", subflowName: "List soups" });
      emitAutomationStudioProjectReceiptCard({ receipt: { kind: "candidate_trial", receiptId: "receipt.2", digest: "d".repeat(64) }, verdict: "unconfirmed" });
    });
    expect(seen).toHaveLength(2);
    expect(allTexts(seen)).toEqual([]);
  });

  it("project/plan-card.ts: a two-part plan with the router subflow Core adds", async () => {
    // As the supervisor's planning format compiles a plan of several parts
    // (`../../project-agents/supervisor/plan-input.ts`, which no barrel exports):
    // Core adds the subflow the router runs, keyed `main`, named and described by the guidance.
    const plan = structurePlan((value) => {
      value.plan.subflows.unshift({ key: "main", name: GUIDANCE.router.name, role: "primary", nodes: [], edges: [] });
      value.plan.router = { name: GUIDANCE.router.name, rules: [], fallback: { kind: "subflow", targetSubflowKey: "main" } };
      value.partOf = { main: [], ...value.partOf };
    });
    const purposes = { main: GUIDANCE.router.purpose, list_soups: "Read the newest soups" };
    await inScope(async () => emitAutomationStudioProjectPlanCard({ taskSpec: taskSpec(), structurePlan: plan, purposes }));
    expect(seen).toHaveLength(1);
    expect(allTexts(seen)).toEqual([]);
  });

  it("build.ts + ui/activity-status pacer: the status a failed build settles on", async () => {
    await withAutomationStudioBuildActivity({ projectId: "p1" }, async () => {
      throw new Error("generic failure");
    }).catch(() => undefined);
    const ending = { diagnostic: { ending: { kind: "not_finished", message: "The Flow could not be finished: the save button never appeared." } } };
    await withAutomationStudioBuildActivity({ projectId: "p1" }, async () => {
      throw Object.assign(new Error("not finished"), ending);
    }).catch(() => undefined);
    const shown: Faulted[] = [];
    for (const id of new Set(seen.map((event) => event.activityId))) {
      const pacer = new ActivityPacer({ clock: new FakeClock(1_000), hostWords: TEST_HOST_WORDS, onChange: () => undefined });
      for (const event of seen.filter((candidate) => candidate.activityId === id)) pacer.accept(event);
      const display: ActivityDisplay | null = pacer.display();
      if (display) shown.push(...faultsIn("pacer display", [`${display.headline}${display.detail ? ` | ${display.detail}` : ""}`]));
    }
    expect(seen.length).toBeGreaterThan(0);
    expect([...allTexts(seen), ...shown]).toEqual([]);
  });
});
