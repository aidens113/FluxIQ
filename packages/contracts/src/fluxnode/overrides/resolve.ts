// Layering: Core's defaults, then the declaration, then the run's own. `prompts` and `tools`
// merge by key and a run's entry replaces the declared one whole (so appends never stack;
// `default` drops it); `judgeCriteria` is replaced; the rest merge leaf by leaf.

import { fluxNodeOverridesDigest } from "./digest.ts";
import { fluxNodeJudgeDigest } from "./judge-digest.ts";
import type { FluxNodeResolvedOverrides } from "./resolved.ts";
import type { FluxNodeOverrides } from "./schema.ts";
import type { FluxNodeTextOverride } from "./text-override.ts";

type Entries = Record<string, FluxNodeTextOverride> | undefined;

function mergeEntries(declared: Entries, perRun: Entries): FluxNodeResolvedOverrides["prompts"] {
  const merged: Record<string, FluxNodeTextOverride> = { ...declared, ...perRun };
  const out: FluxNodeResolvedOverrides["prompts"] = {};
  for (const [id, entry] of Object.entries(merged)) if (entry.mode !== "default") out[id] = entry;
  return out;
}

function mergeLeaves<T extends object>(declared: T | undefined, perRun: T | undefined): T {
  const out: Record<string, unknown> = { ...declared };
  for (const [key, value] of Object.entries(perRun ?? {})) if (value !== undefined) out[key] = value;
  return out as T;
}

/** The resolved overrides of one run, with the digest of all of them and of the judge's part. */
export async function resolveFluxNodeOverrides(
  declared: FluxNodeOverrides | undefined,
  perRun: FluxNodeOverrides | undefined
): Promise<{ overrides: FluxNodeResolvedOverrides; digest: string; judgeDigest: string }> {
  const deadlines = mergeLeaves(declared?.deadlines, perRun?.deadlines);
  if (declared?.deadlines?.modelSilence !== undefined || perRun?.deadlines?.modelSilence !== undefined) {
    deadlines.modelSilence = mergeLeaves(declared?.deadlines?.modelSilence, perRun?.deadlines?.modelSilence);
  }
  const overrides: FluxNodeResolvedOverrides = {
    prompts: mergeEntries(declared?.prompts, perRun?.prompts),
    judgeCriteria: [...(perRun?.judgeCriteria ?? declared?.judgeCriteria ?? [])],
    tools: mergeEntries(declared?.tools, perRun?.tools),
    models: mergeLeaves(declared?.models, perRun?.models),
    deadlines,
    retryWaits: mergeLeaves(declared?.retryWaits, perRun?.retryWaits),
    pace: mergeLeaves(declared?.pace, perRun?.pace)
  };
  return { overrides, digest: await fluxNodeOverridesDigest(overrides), judgeDigest: await fluxNodeJudgeDigest(overrides) };
}
