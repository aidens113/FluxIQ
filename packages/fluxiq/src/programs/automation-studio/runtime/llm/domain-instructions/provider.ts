import type { AutomationStudioLlmProvider, AutomationStudioLlmTaskRequest } from "../harness/index.ts";
import type { AutomationStudioLlmTaskDomainInstructions } from "./task-domain-instructions.ts";
import { invokeModelExecutionDelegate, modelExecutionFromCarrier, ModelExecutionReceiptOwner } from "../../../../../runtime/models/index.ts";
import { ExecutionCallbackPolicies } from "../../../../../runtime/execution-observation/index.ts";

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
 *
 * A request that already carries instructions keeps them: an agent whose role
 * is not the domain's work wraps the domain's provider with its own, outside
 * this one, and its words reach the system message in place of the domain's
 * (the project supervisor, which plans and never operates the target:
 * `../../service/project-build/supervisor-provider.ts`, t569). The innermost
 * decorator is the domain's, so without such a wrapper nothing changes.
 */
export function automationStudioLlmProviderWithDomainInstructions(
  provider: AutomationStudioLlmProvider,
  instructions: AutomationStudioLlmTaskDomainInstructions | undefined
): AutomationStudioLlmProvider {
  if (!instructions) return provider;
  const domainInstructions = { domainId: instructions.domainId, version: instructions.version, text: instructions.text };
  const stamped = (request: AutomationStudioLlmTaskRequest): AutomationStudioLlmTaskRequest => ({ ...request, domainInstructions: request.domainInstructions ?? domainInstructions });
  const measureInput = provider.measureInput;
  const estimateCostUsd = provider.estimateCostUsd;
  const originalRun = provider.runTask;
  const completionOwner = new ModelExecutionReceiptOwner();
  const runTask: AutomationStudioLlmProvider["runTask"] = (request, execution) => {
    const observed = modelExecutionFromCarrier(execution, decorated, runTask);
    return completionOwner.returning(invokeModelExecutionDelegate(observed, { receiver: provider, callback: originalRun, args: [stamped(request), execution] }, execution, execution?.signal), observed);
  };
  const measured = measureInput ? (request: AutomationStudioLlmTaskRequest) => measureInput.call(provider, stamped(request)) : undefined;
  const priced = estimateCostUsd ? (tokens: { inputTokens: number; outputTokens: number }) => estimateCostUsd.call(provider, tokens) : undefined;
  const decorated: AutomationStudioLlmProvider = {
    metadata: provider.metadata,
    runTask,
    ...(measured ? { measureInput: measured } : {}),
    ...(priced ? { estimateCostUsd: priced } : {})
  };
  completionOwner.register({ receiver: decorated, callback: runTask });
  if (measured && ExecutionCallbackPolicies.isPure(provider, measureInput!)) ExecutionCallbackPolicies.remember(decorated, measured, "pure");
  if (priced && ExecutionCallbackPolicies.isPure(provider, estimateCostUsd!)) ExecutionCallbackPolicies.remember(decorated, priced, "pure");
  return decorated;
}
