import type { ClientGatewayActivity, ClientGatewayActivityResolution } from "@fluxiq/contracts/client-gateway";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { automationStudioPersonNeededAsk, automationStudioPersonNeededAskDraft } from "../../../parking/index.ts";
import { automationStudioActivityHub } from "../../default-hub.ts";
import { runWithAutomationStudioActivity } from "../../scope.ts";
import { emitAutomationStudioActivityWaitingOnAsk } from "../ask.ts";
import { emitAutomationStudioActivityAskResolved } from "../resolved.ts";

let seen: ClientGatewayActivity[] = [];
let unsubscribe: () => void = () => undefined;
beforeEach(() => {
  seen = [];
  unsubscribe = automationStudioActivityHub.subscribe((event) => seen.push(event));
});
afterEach(() => unsubscribe());

const check = automationStudioPersonNeededAsk({ ...automationStudioPersonNeededAskDraft({}), askId: "person-needed.9" }, { stage: "authoring" });
const permission = { askId: "request.3", kind: "permission" as const, text: "Allow FluxIQ to place the order?", control: { name: "Place order", kind: "button" } };

async function inBuild(fn: () => void): Promise<void> {
  await runWithAutomationStudioActivity({ kind: "build", id: "b1", projectId: "p1" }, async () => fn());
}

describe("a wait on the person, settled", () => {
  it("is the same ask row the wait opened with, now with its outcome, in the phase the work returns to", async () => {
    await inBuild(() => {
      emitAutomationStudioActivityWaitingOnAsk(check);
      emitAutomationStudioActivityAskResolved(check, "answered", "building");
    });
    const [waiting, resolved] = seen;
    expect(resolved).toMatchObject({
      activityId: waiting!.activityId,
      phase: "building",
      label: "You pressed Continue.",
      detail: { kind: "ask", ref: "person-needed.9", title: waiting!.detail!.title, status: "succeeded", resolution: "answered", text: "You pressed Continue." }
    });
  });

  it.each<[ClientGatewayActivityResolution, "succeeded" | "failed", string]>([
    ["answered", "succeeded", "You answered."],
    ["allowed", "succeeded", "You allowed it."],
    ["waited_out", "succeeded", "The check cleared by itself."],
    ["declined", "failed", "You declined."],
    ["timed_out", "failed", "Nobody answered in time."],
    ["cancelled", "failed", "The work stopped before this was answered."]
  ])("says %s as %s: %s", async (resolution, status, text) => {
    await inBuild(() => emitAutomationStudioActivityAskResolved(permission, resolution, "repairing"));
    expect(seen[0]).toMatchObject({ phase: "repairing", detail: { kind: "ask", ref: "request.3", title: "Asked a question (permission)", status, resolution, text } });
  });

  it("says a robot check's Stop in its own words", async () => {
    await inBuild(() => emitAutomationStudioActivityAskResolved(check, "declined", "building"));
    expect(seen[0]).toMatchObject({ detail: { status: "failed", resolution: "declined", text: "You pressed Stop." } });
  });

  it("says nothing outside a unit of work", () => {
    emitAutomationStudioActivityAskResolved(check, "answered", "running");
    expect(seen).toEqual([]);
  });
});
