import type { AutomationStudioLlmProvider, AutomationStudioLlmTaskRequest } from "../harness/index.ts";
import type { AutomationStudioLlmTaskDomainInstructions } from "./task-domain-instructions.ts";

/**
 * A provider that sends the bound domain's instructions with every request.
 *
 * The one place they are put on a request. Every model call a build makes --
 * the evidence loop, the bootstrap, a repair, a result check, a judge --
 * reaches `runTask` on a provider the service resolved, so stamping them here
 * covers them all, and a call site added later is covered without anyone
 * remembering to. `measureInput` is stamped the same way, because the
 * instructions are in the system message and so are part of what is sent.
 *
 * Absent instructions return the provider itself, unchanged, so a host that
 * binds none sends exactly what it always sent.
 */
export function automationStudioLlmProviderWithDomainInstructions(
  provider: AutomationStudioLlmProvider,
  instructions: AutomationStudioLlmTaskDomainInstructions | undefined
): AutomationStudioLlmProvider {
  if (!instructions) return provider;
  const domainInstructions = { domainId: instructions.domainId, version: instructions.version, text: instructions.text };
  const stamped = (request: AutomationStudioLlmTaskRequest): AutomationStudioLlmTaskRequest => ({ ...request, domainInstructions });
  const measureInput = provider.measureInput;
  const estimateCostUsd = provider.estimateCostUsd;
  return {
    metadata: provider.metadata,
    runTask: async (request, execution) => await provider.runTask(stamped(request), execution),
    ...(measureInput ? { measureInput: (request: AutomationStudioLlmTaskRequest) => measureInput.call(provider, stamped(request)) } : {}),
    ...(estimateCostUsd ? { estimateCostUsd: (tokens: { inputTokens: number; outputTokens: number }) => estimateCostUsd.call(provider, tokens) } : {})
  };
}
