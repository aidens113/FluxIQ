import type { ClientGatewayActivity } from "@fluxiq/contracts/client-gateway";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { AutomationStudioRuntimeSession } from "../../../../model/index.ts";
import { activityActionOf } from "../../../../../../ui/index.ts";
import { automationStudioActivityHub } from "../../../activity/index.ts";
import { automationStudioParkedRun, automationStudioPersonNeededAsk, automationStudioPersonNeededAskDraft } from "../../../parking/index.ts";
import { settleAutomationStudioParkedRunWait } from "../parked-wait.ts";

let seen: ClientGatewayActivity[] = [];
let unsubscribe: () => void = () => undefined;
beforeEach(() => {
  seen = [];
  unsubscribe = automationStudioActivityHub.subscribe((event) => seen.push(event));
});
afterEach(() => unsubscribe());

const ask = automationStudioPersonNeededAsk({ ...automationStudioPersonNeededAskDraft({}), askId: "person-needed.42" }, { stage: "execution" });
const parked = automationStudioParkedRun({ ask, nodeId: "click", definitionId: "web.output.dom-click", attemptId: "click.attempt.1", parkedAtMs: 100, carried: { variables: {}, loops: {}, stepsTaken: 1, maxSteps: 10 } });

function session(overrides: Partial<AutomationStudioRuntimeSession> = {}): AutomationStudioRuntimeSession {
  return {
    schemaVersion: "0.1",
    runId: "run.parked",
    projectId: "project.one",
    targetKind: "flow",
    targetId: "flow.one",
    flowId: "flow.one",
    status: "waiting",
    queuedAt: 100,
    flow: { flowId: "flow.one" } as AutomationStudioRuntimeSession["flow"],
    trace: { status: "waiting", startedAt: 100, attempts: [], values: {}, effects: [], parked },
    ...overrides
  };
}

describe("settling a parked run's wait when the run ends unanswered", () => {
  it("says the parked ask's own row, cancelled, in the run's unit of work", () => {
    settleAutomationStudioParkedRunWait("project.one", session(), "cancelled");
    expect(seen).toHaveLength(1);
    expect(seen[0]).toMatchObject({
      activityId: "run:run.parked",
      subject: { kind: "run", id: "run.parked", projectId: "project.one", flowId: "flow.one" },
      phase: "failed",
      detail: { kind: "ask", ref: "person-needed.42", title: "Asked the person to complete a check", status: "failed", resolution: "cancelled", text: "The work stopped before this was answered." }
    });
    expect(activityActionOf(seen[0]!)).toMatchObject({ kind: "person_check", outcome: "failed", why: "the work stopped first" });
  });

  it("says nothing for a run that is not waiting", () => {
    settleAutomationStudioParkedRunWait("project.one", session({ status: "running" }), "cancelled");
    settleAutomationStudioParkedRunWait("project.one", session({ status: "cancelled" }), "cancelled");
    expect(seen).toEqual([]);
  });

  it("says nothing for a waiting run that holds no parked ask", () => {
    settleAutomationStudioParkedRunWait("project.one", session({ trace: { status: "waiting", startedAt: 100, attempts: [], values: {}, effects: [] } }), "cancelled");
    const { trace: _trace, ...traceless } = session();
    settleAutomationStudioParkedRunWait("project.one", traceless, "cancelled");
    expect(seen).toEqual([]);
  });
});
