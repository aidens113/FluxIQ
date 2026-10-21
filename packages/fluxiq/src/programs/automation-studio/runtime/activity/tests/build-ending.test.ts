// How a failed build's last row says why (`../build.ts`, t753): a cause that
// repeats itself is said once, and a title past the stream's bound is cut
// where a word ends, never inside one. The status line read "Build failed:
// FluxIQ could not finish the Flow: I could not finish this."

import { afterEach, beforeEach, expect, it } from "vitest";
import type { ClientGatewayActivity } from "@fluxiq/contracts/client-gateway";
import { withAutomationStudioBuildActivity } from "../build.ts";
import { automationStudioActivityHub } from "../default-hub.ts";
import { AutomationStudioFlowBootstrapGenerationError } from "../../flow-bootstrap/generation-failure/index.ts";

let seen: ClientGatewayActivity[] = [];
let unsubscribe: () => void = () => undefined;
beforeEach(() => {
  seen = [];
  unsubscribe = automationStudioActivityHub.subscribe((event) => seen.push(event));
});
afterEach(() => unsubscribe());

function endedBecause(why: string): AutomationStudioFlowBootstrapGenerationError {
  return new AutomationStudioFlowBootstrapGenerationError({
    code: "flow_bootstrap.post_provider_validation_failed", stage: "post_provider_validation", retryable: false,
    providerInvocation: "attempted", providerResponse: "received", issueCodes: ["project.build_blocked"], endedBecause: why
  });
}

it("says a cause that repeats itself once", async () => {
  const failure = endedBecause("I could not finish this.");
  await expect(withAutomationStudioBuildActivity({ projectId: "p1" }, async () => { throw failure; })).rejects.toBe(failure);
  const last = seen.at(-1)!;
  expect(last).toMatchObject({ phase: "failed", final: true, label: "Build failed: FluxIQ could not finish the Flow", detail: { title: "Build failed: FluxIQ could not finish the Flow", text: "FluxIQ could not finish the Flow." } });
});

it("cuts a long ending where a word ends", async () => {
  const why = "The listing form asks for a delivery address that the person never gave and the page will not go on without them, so every later step waits on an answer";
  const failure = endedBecause(why);
  await expect(withAutomationStudioBuildActivity({ projectId: "p1" }, async () => { throw failure; })).rejects.toBe(failure);
  const last = seen.at(-1)!;
  expect(last.label.length).toBeLessThanOrEqual(160);
  expect(last.label.endsWith("…")).toBe(true);
  const kept = last.label.slice("Build failed: ".length, -1);
  expect(`FluxIQ could not finish the Flow: ${why.charAt(0).toLowerCase()}${why.slice(1)}`.startsWith(`${kept} `), last.label).toBe(true);
  expect(last.detail?.title).toBe(last.label);
});
