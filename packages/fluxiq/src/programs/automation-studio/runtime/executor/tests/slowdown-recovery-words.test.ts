// A retry the site itself asked to wait for says so, and for how long (t378).
// Lane D (`run-mv0fuual-f9e6f089`) read "The step didn't work, and a step like
// this often works on a second try" while the site's own slow-down notice stood
// on the page and the run waited on purpose, for a time nobody was told. The
// recovery's words now come from the failure's own wait (`retryAfterMs`), after
// the time since the refusal is credited against it, never from a domain code.

import type { AutomationStudioFailureRecord } from "@fluxiq/contracts/automation-studio";
import type { ClientGatewayActivity } from "@fluxiq/contracts/client-gateway";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { AutomationStudioFlowDocument, AutomationStudioFlowNode } from "../../../model/index.ts";
import { automationStudioActivityHub, runWithAutomationStudioActivity } from "../../activity/index.ts";
import { runAutomationStudioGraph, type AutomationStudioGraphExecutionOptions } from "../index.ts";

let seen: ClientGatewayActivity[] = [];
let unsubscribe: () => void = () => undefined;
beforeEach(() => {
  seen = [];
  unsubscribe = automationStudioActivityHub.subscribe((event) => seen.push(event));
});
afterEach(() => unsubscribe());

const press = (id: string, elementId: string, label: string): AutomationStudioFlowNode => ({
  id,
  label,
  definitionId: "builtin.policy.action",
  parameterValues: { outputId: "activate-element", parameters: { elementId } } as NonNullable<AutomationStudioFlowNode["parameterValues"]>
});

const flow: AutomationStudioFlowDocument = {
  schemaVersion: "0.1",
  flowId: "flow.slowdown-recovery-words",
  ownerKind: "routine",
  ownerId: "routine.test",
  name: "Slow-down recovery words",
  createdAt: 1,
  updatedAt: 1,
  nodes: [press("n1.coupon", "coupon", "Get coupons")],
  edges: []
};

/** Refuses the first press the way a site slowing FluxIQ down does: a retryable refusal naming its own wait. */
function slowedOnce(failure: AutomationStudioFailureRecord): NonNullable<AutomationStudioGraphExecutionOptions["effectDispatcher"]> {
  let refused = false;
  return () => {
    if (!refused) {
      refused = true;
      return { status: "failed", route: "failed", message: "Action refused by the page for now.", failure };
    }
    return { status: "success", route: "success", outputs: { ok: true } };
  };
}

async function played(failure: AutomationStudioFailureRecord): Promise<{ status: string; waits: number[] }> {
  const waits: number[] = [];
  const trace = await runWithAutomationStudioActivity({ kind: "run", id: "run.1", projectId: "project.1", flowId: flow.flowId }, () => runAutomationStudioGraph(flow, {
    now: () => 1_000,
    delay: async (ms) => { waits.push(ms); },
    effectDispatcher: slowedOnce(failure)
  }));
  return { status: trace.status, waits };
}

const recoveryThoughts = () => seen.filter((event) => event.phase === "repairing" && event.detail?.kind === "thought");

describe("a retry the site asked to wait for", () => {
  it("says the site asked FluxIQ to slow down, and the wait it takes in seconds, before pressing again", async () => {
    const run = await played({ category: "timeout", code: "web.action.rate_limited", retryable: true, stage: "execution", effect: "unacted", retryAfterMs: 6_000 });

    expect(run.status).toBe("succeeded");
    expect(run.waits).toContain(6_000);
    const thought = recoveryThoughts().at(-1);
    expect(thought?.detail).toMatchObject({
      title: "Waiting: the site asked to slow down",
      text: "The site asked FluxIQ to slow down, so it is waiting 6 seconds before pressing again."
    });
  });

  it("keeps the ordinary retry words for a refusal that names no wait", async () => {
    const run = await played({ category: "timeout", code: "web.action.rate_limited", retryable: true, stage: "execution", effect: "unacted" });

    expect(run.status).toBe("succeeded");
    const words = recoveryThoughts().map((event) => event.detail?.text ?? "");
    expect(words.some((text) => text.includes("slow down"))).toBe(false);
  });
});
