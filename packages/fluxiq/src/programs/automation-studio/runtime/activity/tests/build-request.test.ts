// What a build says the person asked, in their own words (`../build.ts`,
// `emitAutomationStudioBuildRequest`): live runs 34 and 35 were built from an
// instruction the chat never showed.
import type { ClientGatewayActivity } from "@fluxiq/contracts/client-gateway";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { AUTOMATION_STUDIO_BUILD_REQUEST_MAX_CHARS, emitAutomationStudioBuildRequest } from "../build.ts";
import { automationStudioActivityHub } from "../default-hub.ts";
import { runWithAutomationStudioActivity } from "../scope.ts";

let seen: ClientGatewayActivity[] = [];
let unsubscribe: () => void = () => undefined;
beforeEach(() => {
  seen = [];
  unsubscribe = automationStudioActivityHub.subscribe((event) => seen.push(event));
});
afterEach(() => unsubscribe());

const inBuild = (fn: () => void) => runWithAutomationStudioActivity({ kind: "build", id: "b1", projectId: "p1", flowId: "f1" }, async () => fn());
const requests = () => seen.filter((event) => event.request !== undefined).map((event) => event.request);

describe("the person's request on a build's activity", () => {
  it("is the Flow's own instructions, in the person's words, on a status event with no row", async () => {
    await inBuild(() => emitAutomationStudioBuildRequest([
      { scopeKind: "project", body: "Always use the store's own search." },
      { scopeKind: "flow", body: "  Switch my pickup store to Millbrook Crossing Supercenter.  " },
      { scopeKind: "flow", body: "Do not check out." }
    ]));
    expect(requests()).toEqual(["Switch my pickup store to Millbrook Crossing Supercenter.\n\nDo not check out."]);
    expect(seen[0]).toMatchObject({ subject: { kind: "build", id: "b1" }, phase: "building", label: "Building the Flow" });
    expect(seen[0]).not.toHaveProperty("detail");
  });

  it("is every instruction when none is the Flow's own, bounded, and nothing when there are no words", async () => {
    await inBuild(() => emitAutomationStudioBuildRequest([{ scopeKind: "project", body: "Read the price list." }]));
    await inBuild(() => emitAutomationStudioBuildRequest([{ scopeKind: "flow", body: "x".repeat(AUTOMATION_STUDIO_BUILD_REQUEST_MAX_CHARS + 50) }]));
    await inBuild(() => emitAutomationStudioBuildRequest([{ scopeKind: "flow", body: "   " }]));
    expect(requests().map((request) => request!.length)).toEqual(["Read the price list.".length, AUTOMATION_STUDIO_BUILD_REQUEST_MAX_CHARS]);
  });
});
