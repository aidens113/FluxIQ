// A call the loop detector refused, as the person reads it (`../decision-answer/refused-call.ts`):
// never "tried exactly this way", which a reworded call was not, and a card
// whichever of the loop's own rows was recorded last.
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { ClientGatewayActivity } from "@fluxiq/contracts/client-gateway";
import { personFacingTextFaults } from "../../../ui/index.ts";
import { automationStudioLlmEvidenceLoopEmptyAccounting } from "../../llm/evidence-loop/index.ts";
import { automationStudioActivityRefusedCall } from "../decision-answer/index.ts";
import { automationStudioActivityHub, runWithAutomationStudioActivity } from "../index.ts";

let seen: ClientGatewayActivity[] = [];
let unsubscribe: () => void = () => undefined;
beforeEach(() => {
  seen = [];
  unsubscribe = automationStudioActivityHub.subscribe((event) => seen.push(event));
});
afterEach(() => unsubscribe());

const held = { iteration: 3, call: { callId: "c3", toolId: "core.run_node", value: { node: "web.output.dom-click", parameters: {} } }, described: { target: "Save" } };
const inScope = (fn: () => void) => runWithAutomationStudioActivity({ kind: "build", id: "b1", projectId: "p1" }, async () => fn());
const refusal = (outcome: string) => [{ callId: "core.repeat_check.3", toolId: "core.repeat_check", value: { ok: false, then: { outcome } } }];

describe("a call the loop detector refused", () => {
  for (const outcome of ["near_repeat", "cycle", "no_progress", "same_fix", "same_act"]) {
    it(`${outcome} says what it was in a person's words, never "exactly"`, async () => {
      await inScope(() => {
        const calls = automationStudioActivityRefusedCall();
        calls.hold(held);
        calls.decided(refusal(outcome));
      });
      const label = seen.at(-1)?.label ?? "";
      expect(label).toMatch(/^Not done: /u);
      expect(label).not.toMatch(/exactly/u);
      expect(personFacingTextFaults(label)).toEqual([]);
    });
  }

  it("the guard's own exact repeat still says it was tried exactly this way", async () => {
    await inScope(() => {
      const calls = automationStudioActivityRefusedCall();
      calls.hold(held);
      calls.decided(refusal("failed"));
    });
    expect(seen.at(-1)?.label).toMatch(/exactly this way/u);
  });

  for (const code of ["llm_evidence_loop.loop_change_approach", "llm_evidence_loop.loop_ask_person", "llm_evidence_loop.loop_steered"]) {
    it(`a stall whose last row is ${code} still gives the refused call its card`, async () => {
      await inScope(() => {
        const calls = automationStudioActivityRefusedCall();
        calls.hold(held);
        calls.stalled({
          issueCodes: ["llm_evidence_loop.repeat_refused"], accounting: automationStudioLlmEvidenceLoopEmptyAccounting(), steps: [],
          trace: [{ iteration: 3, decision: "tool_call", toolId: "core.run_node", resultCode: "llm_evidence_loop.repeat_refused", resultReason: "near_repeat" }, { iteration: 3, decision: "tool_call", toolId: "core.run_node", resultCode: code, resultReason: "near_repeat" }]
        });
      });
      expect(seen.at(-1)?.label).toMatch(/^Not done: /u);
    });
  }
});
