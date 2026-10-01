import type { ClientGatewayActivity } from "@fluxiq/contracts/client-gateway";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  AUTOMATION_STUDIO_PERSON_NEEDED_DONE_OPTION,
  AUTOMATION_STUDIO_PERSON_NEEDED_STOP_OPTION,
  automationStudioPersonNeededAsk,
  automationStudioPersonNeededAskDraft,
  type AutomationStudioAsk,
  type AutomationStudioAskAnswer,
  type AutomationStudioParkingPort
} from "../../../parking/index.ts";
import { automationStudioActivityHub } from "../../default-hub.ts";
import { runWithAutomationStudioActivity } from "../../scope.ts";
import { automationStudioActivityAskPort } from "../port.ts";

let seen: ClientGatewayActivity[] = [];
let unsubscribe: () => void = () => undefined;
beforeEach(() => {
  seen = [];
  unsubscribe = automationStudioActivityHub.subscribe((event) => seen.push(event));
});
afterEach(() => unsubscribe());

const check = automationStudioPersonNeededAsk({ ...automationStudioPersonNeededAskDraft({}), askId: "person-needed.4" }, { stage: "authoring" });

function answer(value: string): AutomationStudioAskAnswer {
  return { askId: check.askId, answeredAt: 1, kind: "choice", value, actorId: null };
}

/** A port that records what it was handed and answers with `answered`. */
function portAnswering(answered: () => Promise<AutomationStudioAskAnswer | undefined>): AutomationStudioParkingPort & { opened: AutomationStudioAsk[] } {
  const opened: AutomationStudioAsk[] = [];
  return { opened, open: (ask) => { opened.push(ask); }, awaitAnswer: async () => await answered() };
}

async function inBuild<T>(fn: () => Promise<T>): Promise<T> {
  return await runWithAutomationStudioActivity({ kind: "build", id: "b1", projectId: "p1" }, fn);
}

describe("a parking port that says the wait and how it ended", () => {
  it("opens the ask as the port does, and says the wait once the work waits, then the answer", async () => {
    const inner = portAnswering(async () => answer(AUTOMATION_STUDIO_PERSON_NEEDED_DONE_OPTION));
    const port = automationStudioActivityAskPort(inner, "building");
    const got = await inBuild(async () => {
      await port.open(check);
      expect(seen).toEqual([]);
      return await port.awaitAnswer!(check, {});
    });
    expect(got).toMatchObject({ value: AUTOMATION_STUDIO_PERSON_NEEDED_DONE_OPTION });
    expect(inner.opened).toEqual([check]);
    expect(seen.map((event) => [event.phase, event.detail?.kind, event.detail?.ref, event.detail?.status, event.detail?.resolution])).toEqual([
      ["waiting_permission", "ask", "person-needed.4", "started", undefined],
      ["building", "ask", "person-needed.4", "succeeded", "answered"]
    ]);
  });

  it("settles Stop as declined and nobody answering as timed out", async () => {
    await inBuild(async () => automationStudioActivityAskPort(portAnswering(async () => answer(AUTOMATION_STUDIO_PERSON_NEEDED_STOP_OPTION)), "building").awaitAnswer!(check, {}));
    await inBuild(async () => automationStudioActivityAskPort(portAnswering(async () => undefined), "building").awaitAnswer!(check, {}));
    expect(seen.filter((event) => event.detail?.status !== "started").map((event) => [event.detail?.status, event.detail?.resolution])).toEqual([
      ["failed", "declined"],
      ["failed", "timed_out"]
    ]);
  });

  it("settles as cancelled when the work was cancelled while it waited, or the thread could not be read", async () => {
    const cancelled = new AbortController();
    cancelled.abort();
    await inBuild(async () => automationStudioActivityAskPort(portAnswering(async () => undefined), "building").awaitAnswer!(check, { signal: cancelled.signal }));
    const broken = automationStudioActivityAskPort(portAnswering(async () => { throw new Error("the thread is gone"); }), "building");
    await expect(inBuild(async () => await broken.awaitAnswer!(check, {}))).rejects.toThrow("the thread is gone");
    expect(seen.map((event) => [event.detail?.status, event.detail?.resolution, event.detail?.text])).toEqual([
      ["started", undefined, undefined],
      ["failed", "cancelled", "The work stopped before this was answered."],
      ["started", undefined, undefined],
      ["failed", "cancelled", "The work stopped before this was answered."]
    ]);
  });

  it("still says the answer when the person answered just as the work was cancelled", async () => {
    const cancelled = new AbortController();
    cancelled.abort();
    await inBuild(async () => automationStudioActivityAskPort(portAnswering(async () => answer(AUTOMATION_STUDIO_PERSON_NEEDED_DONE_OPTION)), "building").awaitAnswer!(check, { signal: cancelled.signal }));
    expect(seen.at(-1)?.detail).toMatchObject({ status: "succeeded", resolution: "answered" });
  });

  it("has no wait to say for a port that cannot hold the work open", async () => {
    const port = automationStudioActivityAskPort({ open: () => undefined }, "building");
    expect(port.awaitAnswer).toBeUndefined();
    await inBuild(async () => { await port.open(check); });
    expect(seen).toEqual([]);
  });
});
