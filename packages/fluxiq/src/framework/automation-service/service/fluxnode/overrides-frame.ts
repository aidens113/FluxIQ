// The overrides frame a FluxNode run sets around its attempt (W3, t899): the run's resolved overrides
// and its retries as `AutomationStudioRunOverrides`, which Core's engine and runtime read
// (`../../../../runtime/run-overrides/`). Empty groups are left out, so an absent field is Core's default.

import type { FluxNodeResolvedOverrides } from "@fluxiq/contracts/fluxnode";
import type { AutomationStudioRunOverrides } from "../../../../runtime/run-overrides/index.ts";

const filled = (group: object): boolean => Object.values(group).some((value) => value !== undefined);

/** The group with its absent leaves left out rather than present as `undefined`, at any depth (the frame's fields are exact). */
const defined = <K extends keyof AutomationStudioRunOverrides>(group: object): NonNullable<AutomationStudioRunOverrides[K]> =>
  JSON.parse(JSON.stringify(group)) as NonNullable<AutomationStudioRunOverrides[K]>;

export function fluxNodeRunOverridesFrame(resolved: FluxNodeResolvedOverrides, retries: number, digest: string | undefined): AutomationStudioRunOverrides {
  return {
    nodeAttempts: retries + 1,
    ...(filled(resolved.retryWaits) ? { retryWaits: defined<"retryWaits">(resolved.retryWaits) } : {}),
    ...(filled(resolved.deadlines) ? { deadlines: defined<"deadlines">(resolved.deadlines) } : {}),
    ...(Object.keys(resolved.prompts).length ? { prompts: resolved.prompts } : {}),
    ...(Object.keys(resolved.tools).length ? { tools: resolved.tools } : {}),
    ...(resolved.judgeCriteria.length ? { judgeCriteria: resolved.judgeCriteria } : {}),
    ...(filled(resolved.models) ? { models: defined<"models">(resolved.models) } : {}),
    ...(filled(resolved.pace) ? { pace: defined<"pace">(resolved.pace) } : {}),
    ...(digest === undefined ? {} : { digest })
  };
}
