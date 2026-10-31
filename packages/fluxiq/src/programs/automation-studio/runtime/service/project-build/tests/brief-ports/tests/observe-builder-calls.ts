// Observe actual builder answers independently of provider decisions: Core
// can complete after a yes without asking the provider to read it again.
import { vi } from "vitest";
import type { JsonObject } from "../../../../../../../../core/index.ts";
import * as builders from "../../../../../flow-bootstrap/subflow-candidate/index.ts";

const runBuilder = builders.runAutomationStudioSubflowBuilderLoop;

export function observeBuilderCalls(told: (subflowKey: string, entry: { callId: string; toolId: string; value: JsonObject }) => void): () => void {
  const spy = vi.spyOn(builders, "runAutomationStudioSubflowBuilderLoop").mockImplementation(input => runBuilder({ ...input, observe: loop => {
    const observed = input.observe ? input.observe(loop) : loop;
    return { ...observed, executeTool: async call => {
      const answered = await observed.executeTool(call);
      const value = (answered as { evidence?: JsonObject }).evidence;
      if (value) told(input.scope.subflowKey, { callId: call.callId, toolId: call.toolId, value: structuredClone(value) });
      return answered;
    } };
  } }));
  return () => spy.mockRestore();
}
