// The strict shape of overrides, before the named refusals. Internal to this directory.

import { z } from "zod";
import { FLUXNODE_MODEL_ID_PATTERN } from "../spec/model-id-pattern.ts";
import { FLUXNODE_OVERRIDE_LIMITS as LIMIT } from "./limits.ts";

const text = (max: number) =>
  z
    .string()
    .trim()
    .min(1)
    .max(max)
    .regex(/^[^\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]*$/u, "no control characters but newline and tab");
const int = (min: number, max: number) => z.number().int().min(min).max(max);
const modelId = z.string().regex(FLUXNODE_MODEL_ID_PATTERN, 'A model id is 1 to 128 of letters, digits, ".", "_", ":", "/" and "-".');

const textOverride = (append: number, replace: number) =>
  z.discriminatedUnion("mode", [
    z.object({ mode: z.literal("append"), text: text(append) }).strict(),
    z.object({ mode: z.literal("replace"), text: text(replace) }).strict(),
    z.object({ mode: z.literal("default") }).strict()
  ]);

export const fluxNodeOverridesShape = z
  .object({
    prompts: z.record(z.string().regex(/^[a-z0-9_.:-]{1,200}$/iu), textOverride(LIMIT.promptAppendMax, LIMIT.promptReplaceMax)),
    judgeCriteria: z.array(text(LIMIT.criterionMax)).max(LIMIT.criteriaMax),
    tools: z.record(z.string().regex(/^[a-z0-9_.:-]{1,200}$/iu), textOverride(LIMIT.toolAppendMax, LIMIT.toolReplaceMax)),
    models: z.object({ explore: modelId, judge: modelId, repair: modelId }).partial().strict(),
    deadlines: z
      .object({
        llmCallMs: int(1_000, 45_000),
        judgeMs: int(30_000, 1_800_000),
        personWaitMs: int(1_000, 7 * 86_400_000),
        modelSilence: z.object({ baseMs: int(1_000, 60_000), capMs: int(1_000, 600_000) }).partial().strict()
      })
      .partial()
      .strict(),
    retryWaits: z.object({ backoffMs: z.array(int(0, 30_000)).min(1).max(100), perNodeMs: int(0, 3_600_000), perRunMs: int(0, 86_400_000) }).partial().strict(),
    pace: z.object({ minStepGapMs: int(0, 600_000) }).partial().strict()
  })
  .partial()
  .strict();
