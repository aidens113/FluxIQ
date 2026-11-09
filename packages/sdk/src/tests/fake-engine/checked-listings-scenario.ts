// A scripted run for a "listings" FluxNode: an optional person-only moment first, then
// a result the developer's check rejects once (one listing short) and accepts the
// second time, so a test sees a real check round trip.

import type { JsonObject } from "@fluxiq/contracts/core";
import type { FluxNodeRunRequest } from "@fluxiq/contracts/fluxnode";
import type { FakeRun } from "./fake-run.ts";
import type { Scenario } from "./start-fake-engine.ts";

function listings(count: number): JsonObject {
  return { listings: Array.from({ length: count }, (_unused, index) => ({ title: `Lens hood ${index + 1}`, price: 10 + index, url: `https://market.example/item/${index + 1}` })) };
}

/** The scenario. `askPerson` adds a sign-in moment that ends the run waiting when nobody answers; a resumed run skips it. */
export function checkedListingsScenario(options: { askPerson?: boolean; personWaitMs?: number } = {}): Scenario {
  return async (run: FakeRun, request: FluxNodeRunRequest) => {
    run.emit({ type: "step", flowId: "flow_1", stepId: "search", label: "Searching the market", state: "succeeded" });
    if (options.askPerson === true && request.resumeHandle === undefined) {
      const need = run.emit({ type: "person_needed", eventId: "person_1", need: "sign_in", reason: "Sign in to market.example to see prices." });
      const answer = await run.awaitAnswer((need as { eventId: string }).eventId, options.personWaitMs ?? 400);
      if (answer === undefined) return run.end({ status: "waiting_for_person", waitingFor: "Sign in to market.example to see prices." });
    }
    const wanted = Number(run.inputs.count ?? 3);
    for (let attempt = 1; attempt <= 3; attempt += 1) {
      if (run.stopRequested) return run.end({ status: "stopped" });
      const outputs = listings(attempt === 1 ? wanted - 1 : wanted);
      run.emit({ type: "check_needed", eventId: `check_${attempt}`, outputs, inputs: run.inputs });
      const answer = await run.awaitAnswer(`check_${attempt}`, 2000);
      if (answer?.type === "check_answer" && answer.pass) return run.end({ status: "achieved", outputs, verdictBy: "check" });
      run.emit({ type: "step", flowId: "flow_1", stepId: "search", label: "The check said no; fixing", state: "retrying", attempt: attempt + 1 });
    }
    return run.end({ status: "budget_out" });
  };
}
