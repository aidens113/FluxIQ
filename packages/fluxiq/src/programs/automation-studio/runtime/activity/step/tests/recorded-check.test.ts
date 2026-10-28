// A step checked against the recorded run (`../recorded-check.ts`, t769 b13):
// a build's test first checked against the recording of its last live test
// runs the Flow's steps through Core's real executor, and each step said
// "Running step N of M" under the build's unit of work, which a status reads as
// the build testing its Flow on the site. Under the mark it says it is checked
// against the recorded run instead, even inside a setup rerun, since nothing of
// it touches the site.

import { afterEach, beforeEach, expect, it } from "vitest";
import type { ClientGatewayActivity } from "@fluxiq/contracts/client-gateway";
import { automationStudioActivityHub } from "../../default-hub.ts";
import { runWithAutomationStudioActivity } from "../../scope.ts";
import { automationStudioActivityRecordedCheck, emitAutomationStudioActivityStep, runAutomationStudioActivityPreparation } from "../index.ts";

let seen: ClientGatewayActivity[] = [];
let unsubscribe: () => void = () => undefined;
beforeEach(() => {
  seen = [];
  unsubscribe = automationStudioActivityHub.subscribe((event) => seen.push(event));
});
afterEach(() => unsubscribe());

const inBuild = (fn: () => void | Promise<void>) => runWithAutomationStudioActivity({ kind: "build", id: "b1", projectId: "p1" }, fn);
const step = () => emitAutomationStudioActivityStep({ index: 2, count: 5, nodeId: "n2", label: "Open the listings", definitionId: "web.output.dom-click" });

it("says a step checked against the recorded run as that, keeping the step it is", async () => {
  await inBuild(async () => {
    expect(automationStudioActivityRecordedCheck.active()).toBe(false);
    await automationStudioActivityRecordedCheck.run(async () => {
      await Promise.resolve();
      expect(automationStudioActivityRecordedCheck.active()).toBe(true);
      step();
    });
    expect(automationStudioActivityRecordedCheck.active()).toBe(false);
    step();
  });
  expect(seen[0]!.label).toBe("Checking against the recorded run: Open the listings");
  expect(seen[0]!.step).toMatchObject({ index: 2, count: 5 });
  expect(seen[0]!.detail).toMatchObject({ kind: "step", title: "Open the listings", status: "started" });
  expect(seen[1]!.label).toBe("Running step 2 of 5: Open the listings");
});

it("says a setup step inside a recorded check as checked against the recording: neither touches the site", async () => {
  await inBuild(async () => {
    await automationStudioActivityRecordedCheck.run(async () => await runAutomationStudioActivityPreparation(async () => step()));
  });
  expect(seen[0]!.label).toBe("Checking against the recorded run: Open the listings");
});
