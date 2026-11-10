// A later attempt's run of its saved Flow, past an act it carried (live checks r3:
// `run-mw9x529c-557f5402` step 8 "View cart", `run-mwa0iiha-f3c93e83` step 17): the steps
// written on the page that act brought about meet a page it never brought about, and the
// run goes on past them instead of stopping (`engine/automation/state-routing/not-arisen.ts`).

import { describe, expect, it } from "vitest";
import type { JsonObject } from "../../../../../../core/index.ts";
import { edge, graph } from "../../../../../../engine/automation/lifecycle-run/tests/lifecycle-fixtures.ts";
import type { AutomationStudioFlowNode } from "../../../../../../flows/executable/graph/index.ts";
import { AutomationStudioAttemptActRecord } from "../../../../../../runtime/answer-first/act-record/index.ts";
import { AUTOMATION_STUDIO_STATE_NOT_ARISEN_CODE, runAutomationStudioGraph, type AutomationStudioGraphExecutionOptions } from "../../../../executor/index.ts";
import { automationStudioAnswerFirstRunActGate } from "../index.ts";

const PRESS = "domain.press";
const READ = "domain.read";
const ADD = { selector: ".add", element: { text: "Add to cart" } };
const VIEW = { selector: ".drawer .view-cart", element: { text: "View cart" } };
const CLOSE = { selector: ".drawer .close", element: { text: "Close" } };
const SHOWN = { selector: ".cart-link", element: { text: "Cart" } };

type Host = NonNullable<AutomationStudioGraphExecutionOptions["hostRuntime"]>;

const add: AutomationStudioFlowNode = { id: "add", label: "Add to cart", definitionId: PRESS, parameterValues: ADD, metadata: { declaredConsequences: ["create_new"] } };
const press = (id: string, parameterValues: JsonObject, metadata?: AutomationStudioFlowNode["metadata"]): AutomationStudioFlowNode => ({ id, label: id, definitionId: PRESS, parameterValues, ...(metadata ? { metadata } : {}) });

/** Start, the Add, then `after` in order, then end. */
function flow(...after: AutomationStudioFlowNode[]) {
  const nodes = [{ id: "start", definitionId: "builtin.control.start" }, add, ...after, { id: "done", definitionId: "builtin.control.end" }];
  const ids = nodes.map((node) => node.id);
  return graph("graph.carried", nodes, ids.slice(1).map((id, index) => edge(ids[index]!, id, index === 0 ? "next" : "success")));
}

/** A page whose controls are `present`: a press of anything else is not found and sends nothing; the domain's effect floor says only the Add commits. */
function page(present: ReadonlySet<string>) {
  const sent: string[] = [];
  const options: AutomationStudioGraphExecutionOptions = {
    inputs: {},
    resolveActionEffect: (node) => ({ effectClass: node.metadata?.declaredConsequences ? "commit" : node.definitionId === READ ? "observe" : "state", permissionConsequences: [] }),
    nativeNodeExecutor: async ({ node }) => {
      const selector = String((node.parameterValues as JsonObject | undefined)?.selector ?? node.id);
      if (!present.has(selector)) return { result: { status: "failed", route: "failed", outputs: {}, effects: [], message: "Not on the page.", failure: { category: "target_not_found", code: "web.target.not_found", retryable: true, stage: "target_resolution", effect: "unacted" } } };
      sent.push(selector);
      return { result: { status: "success", route: "success", outputs: { success: true } } };
    },
    // The host's own reading of a missing control is beside the point here: nothing re-finds it.
    hostRuntime: {} as Host
  };
  return { options, sent };
}

function carried(): AutomationStudioAttemptActRecord {
  const record = new AutomationStudioAttemptActRecord();
  record.settled({ actionId: PRESS, parameters: ADD, consequences: ["create_new"], stage: "exploration" }, { effectApplied: true, words: { what: "Added to cart", where: "On a page" } });
  return record;
}

describe("a step written on the page a carried act brings about", () => {
  it("is passed over as not needed when that act was not done again, and the run reaches its end", async () => {
    const { options, sent } = page(new Set([SHOWN.selector]));
    const trace = await runAutomationStudioGraph(flow(press("view", VIEW), press("cart", SHOWN)), automationStudioAnswerFirstRunActGate(options, { record: carried(), settle: true }));
    expect(trace.status).toBe("succeeded");
    // Nothing pressed twice, nothing pressed that is not there; the step after the follow-on still ran.
    expect(sent).toEqual([SHOWN.selector]);
    const view = trace.attempts.filter((attempt) => attempt.nodeId === "view");
    expect(view).toHaveLength(1);
    expect(view[0]).toMatchObject({ status: "succeeded", route: "skipped", skipped: { reason: "target_absent", code: AUTOMATION_STUDIO_STATE_NOT_ARISEN_CODE } });
  });

  it("passes over each follow-on in turn: what one would have brought about did not come either", async () => {
    const { options, sent } = page(new Set([SHOWN.selector]));
    const trace = await runAutomationStudioGraph(flow(press("view", VIEW), press("close", CLOSE), press("cart", SHOWN)), automationStudioAnswerFirstRunActGate(options, { record: carried(), settle: true }));
    expect(trace.status).toBe("succeeded");
    expect(sent).toEqual([SHOWN.selector]);
    expect(trace.attempts.find((attempt) => attempt.nodeId === "close")).toMatchObject({ skipped: { reason: "target_absent", code: AUTOMATION_STUDIO_STATE_NOT_ARISEN_CODE } });
  });

  it("is not passed over when the act ran this time: its missing control is a real failure", async () => {
    const { options, sent } = page(new Set([ADD.selector, SHOWN.selector]));
    const trace = await runAutomationStudioGraph(flow(press("view", VIEW), press("cart", SHOWN)), automationStudioAnswerFirstRunActGate(options, { record: new AutomationStudioAttemptActRecord(), settle: true }));
    expect(trace.status).toBe("failed");
    expect(sent).toEqual([ADD.selector]);
    expect(trace.attempts.some((attempt) => attempt.nodeId === "view" && attempt.skipped)).toBe(false);
  });

  it("never passes over a follow-on that does a lasting act, nor a read", async () => {
    for (const follow of [press("view", VIEW, { declaredConsequences: ["send"] }), { id: "view", label: "view", definitionId: READ, parameterValues: { ...VIEW, recordOutput: { datasetId: "cart" } } }]) {
      const { options } = page(new Set([SHOWN.selector]));
      const trace = await runAutomationStudioGraph(flow(follow, press("cart", SHOWN)), automationStudioAnswerFirstRunActGate(options, { record: carried(), settle: true }));
      expect(trace.status).toBe("failed");
      expect(trace.attempts.some((attempt) => attempt.nodeId === "view" && attempt.skipped)).toBe(false);
    }
  });
});
