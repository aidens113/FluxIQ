// The row that starts a step (`../started.ts`, t753): a step run only to get
// the page ready for a test says so instead of a step count, a list loop's
// pass says which row it is on so a long loop's line moves as it does, and a
// label past the stream's bound is cut where a word ends.

import { afterEach, beforeEach, expect, it } from "vitest";
import type { ClientGatewayActivity } from "@fluxiq/contracts/client-gateway";
import { automationStudioActivityHub } from "../../default-hub.ts";
import { runWithAutomationStudioActivity } from "../../scope.ts";
import { automationStudioActivityPreparing, emitAutomationStudioActivityStep, runAutomationStudioActivityPreparation } from "../index.ts";

let seen: ClientGatewayActivity[] = [];
let unsubscribe: () => void = () => undefined;
beforeEach(() => {
  seen = [];
  unsubscribe = automationStudioActivityHub.subscribe((event) => seen.push(event));
});
afterEach(() => unsubscribe());

const inBuild = (fn: () => void | Promise<void>) => runWithAutomationStudioActivity({ kind: "build", id: "b1", projectId: "p1" }, fn);

it("says a step run to get the page ready as that, with no step count", async () => {
  await inBuild(async () => {
    expect(automationStudioActivityPreparing()).toBe(false);
    await runAutomationStudioActivityPreparation(async () => {
      await Promise.resolve();
      expect(automationStudioActivityPreparing()).toBe(true);
      emitAutomationStudioActivityStep({ index: 2, count: 5, nodeId: "n2", label: "Open the listings", definitionId: "web.output.dom-click" });
    });
    emitAutomationStudioActivityStep({ index: 2, count: 5, nodeId: "n2", label: "Open the listings", definitionId: "web.output.dom-click" });
  });
  expect(seen[0]!.label).toBe("Getting the page ready: Open the listings");
  expect(seen[0]!.step).toMatchObject({ index: 2, count: 5 });
  expect(seen[1]!.label).toBe("Running step 2 of 5: Open the listings");
});

it("says which row of a list a step's pass is on", async () => {
  await inBuild(() => {
    emitAutomationStudioActivityStep({ index: 4, count: 6, nodeId: "n4", label: "Press Confirm", definitionId: "web.output.dom-click", pass: { repeatId: "each", pass: 3, unit: "row", row: "First entry" } });
  });
  expect(seen[0]!.label).toBe("Running step 4 of 6: Press Confirm (row 3)");
  expect(seen[0]!.detail?.title, "the card keeps its own words").toBe("Press Confirm");
});

it("keeps a long label within the stream's bound, its row number said after an action cut where a word ends", async () => {
  const label = "Press the button that sends the whole form with every field the person filled in and then wait until the page shows the confirmation it gives back";
  await inBuild(() => {
    emitAutomationStudioActivityStep({ index: 12, count: 14, nodeId: "n12", label, definitionId: "web.output.dom-click", pass: { repeatId: "each", pass: 27, unit: "row", row: "x" } });
  });
  const said = seen[0]!.label;
  const action = seen[0]!.detail!.title;
  expect(said.length).toBeLessThanOrEqual(160);
  expect(said).toBe(`Running step 12 of 14: ${action} (row 27)`);
  expect(label.startsWith(`${action.replace(/…$/u, "")} `), action).toBe(true);
});
