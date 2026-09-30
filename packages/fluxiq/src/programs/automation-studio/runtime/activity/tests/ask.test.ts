import type { ClientGatewayActivity } from "@fluxiq/contracts/client-gateway";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { automationStudioPersonNeededAsk, automationStudioPersonNeededAskDraft } from "../../parking/index.ts";
import { emitAutomationStudioActivityWaitingOnAsk } from "../ask.ts";
import { automationStudioActivityHub } from "../default-hub.ts";
import { runWithAutomationStudioActivity } from "../scope.ts";

let seen: ClientGatewayActivity[] = [];
let unsubscribe: () => void = () => undefined;
beforeEach(() => {
  seen = [];
  unsubscribe = automationStudioActivityHub.subscribe((event) => seen.push(event));
});
afterEach(() => unsubscribe());

describe("the work waiting on a person", () => {
  it("shows a person-needed ask in its own words, so the person knows to go to the browser", async () => {
    const ask = automationStudioPersonNeededAsk({ ...automationStudioPersonNeededAskDraft({}), askId: "person-needed.1" }, { stage: "execution" });
    await runWithAutomationStudioActivity({ kind: "run", id: "r1", projectId: "p1" }, async () => emitAutomationStudioActivityWaitingOnAsk(ask, "node.open"));
    expect(seen).toHaveLength(1);
    expect(seen[0]).toMatchObject({ phase: "waiting_permission", label: ask.text, detail: { kind: "ask", status: "started", ref: "node.open", title: "Asked the person to complete a check" } });
  });

  it("keeps the generic label for every other ask", async () => {
    await runWithAutomationStudioActivity({ kind: "build", id: "b1", projectId: "p1" }, async () => emitAutomationStudioActivityWaitingOnAsk({ kind: "confirm", text: "Apply it as it stands?", control: null }));
    expect(seen[0]).toMatchObject({ phase: "waiting_permission", label: "Waiting for an answer before going on", detail: { title: "Asked a question (confirm)" } });
  });
});
