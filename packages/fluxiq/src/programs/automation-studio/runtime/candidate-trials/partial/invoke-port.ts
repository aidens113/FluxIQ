import type { AutomationStudioSubflowTrialPort, AutomationStudioSubflowTrialRequest } from "../../flow-bootstrap/subflow-candidate/index.ts";
import { observePartialTrialCallback } from "./observe.ts";
import { partialTrialReadOnlyContexts } from "./read-only-contexts.ts";

/** A pinned diagnosis invokes its distinct owner, never the public live-or-cache port. */
export async function invokePartialTrialPort(input: object, port: AutomationStudioSubflowTrialPort, request: AutomationStudioSubflowTrialRequest) {
  const readOnly = partialTrialReadOnlyContexts.get(input);
  if (readOnly) return await readOnly.invoke(request);
  return await observePartialTrialCallback(input, { receiver: undefined, callback: port, args: [request] }, request.signal, request);
}
