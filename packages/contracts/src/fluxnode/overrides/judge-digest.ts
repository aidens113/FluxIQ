// The digest of what the judge reads: the `judge.*` prompt sections and the judge criteria,
// and nothing else. A learned Flow records it when judged achieved; a later run whose digest
// differs is judged again rather than replayed unjudged.

import type { JsonValue } from "../../core.ts";
import { canonicalJson } from "../json/index.ts";
import type { FluxNodeResolvedOverrides } from "./resolved.ts";
import { sha256Hex } from "./sha256-hex.ts";

export async function fluxNodeJudgeDigest(overrides: FluxNodeResolvedOverrides): Promise<string> {
  const prompts: Record<string, unknown> = {};
  for (const [id, entry] of Object.entries(overrides.prompts)) if (id.startsWith("judge.")) prompts[id] = entry;
  return sha256Hex(canonicalJson(JSON.parse(JSON.stringify({ prompts, judgeCriteria: overrides.judgeCriteria })) as JsonValue));
}
