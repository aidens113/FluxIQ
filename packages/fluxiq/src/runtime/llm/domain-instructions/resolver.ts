import type { AutomationStudioLlmProvider } from "../harness/index.ts";
import type { AutomationStudioLlmEvidenceRuntimeBinding } from "../harness-options/index.ts";
import { automationStudioLlmProviderWithDomainInstructions } from "./provider.ts";

type Resolved = AutomationStudioLlmProvider | { provider: AutomationStudioLlmProvider } | undefined;

/**
 * A provider resolver whose every provider sends the bound domain's
 * instructions (`./provider.ts`).
 *
 * The service wraps each resolver it holds -- the host's execution resolver
 * and the standing result-check resolver -- once, where it is stored, so
 * every caller that reaches a provider through either gets one that stamps.
 * The binding is read when a provider is resolved, not when the resolver is
 * wrapped, because a host may bind the runtime after the resolver. A
 * resolution comes back with every other field as it was; a binding without
 * instructions returns it untouched.
 */
export function automationStudioLlmResolverWithDomainInstructions<Input, Result extends Resolved>(
  resolver: ((input: Input) => Result | Promise<Result>) | undefined,
  binding: () => AutomationStudioLlmEvidenceRuntimeBinding | undefined
): ((input: Input) => Promise<Result>) | undefined {
  if (!resolver) return undefined;
  return async (input) => {
    const resolved = await resolver(input);
    const bound = binding();
    const instructions = bound?.systemInstructions ? { domainId: bound.domainId, ...bound.systemInstructions } : undefined;
    if (!resolved || !instructions) return resolved;
    if ("runTask" in resolved) return automationStudioLlmProviderWithDomainInstructions(resolved, instructions) as Result;
    return { ...resolved, provider: automationStudioLlmProviderWithDomainInstructions(resolved.provider, instructions) };
  };
}
