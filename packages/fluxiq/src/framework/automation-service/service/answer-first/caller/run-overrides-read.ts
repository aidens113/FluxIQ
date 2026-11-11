// A caller's run-overrides frame (`AutomationStudioRunOverrides`) as the caller options carry it, read
// strictly: the shape the FluxNode run set, JSON only, an unknown key refused by name. The values were
// already bounded and screened when the FluxNode resolved them (`resolveFluxNodeOverrides`); this only
// holds that the frame a press goes on under is that shape and nothing else, so it can hold no secret
// input and no function. What comes back is a copy.

import type { AutomationStudioRunOverrides } from "../../../../../runtime/run-overrides/index.ts";

const TOP: ReadonlySet<string> = new Set(["nodeAttempts", "retryWaits", "deadlines", "prompts", "tools", "judgeCriteria", "models", "pace", "digest"]);
const RETRY_WAITS: ReadonlySet<string> = new Set(["backoffMs", "perNodeMs", "perRunMs"]);
const DEADLINES: ReadonlySet<string> = new Set(["llmCallMs", "judgeMs", "personWaitMs", "modelSilence"]);
const SILENCE: ReadonlySet<string> = new Set(["baseMs", "capMs"]);
const MODELS: ReadonlySet<string> = new Set(["explore", "judge", "repair"]);
const PACE: ReadonlySet<string> = new Set(["minStepGapMs"]);
const TEXT: ReadonlySet<string> = new Set(["mode", "text"]);
const MODEL_ID = /^[A-Za-z0-9][A-Za-z0-9._:/-]{0,127}$/u;

export function automationStudioAnswerFirstRunOverridesRead(given: unknown): AutomationStudioRunOverrides {
  const frame = group(given, "runOverrides", TOP);
  const read: Record<string, unknown> = {};
  if (frame.nodeAttempts !== undefined) read.nodeAttempts = whole(frame.nodeAttempts, "runOverrides.nodeAttempts", 1);
  if (frame.retryWaits !== undefined) read.retryWaits = retryWaitsOf(frame.retryWaits);
  if (frame.deadlines !== undefined) read.deadlines = deadlinesOf(frame.deadlines);
  if (frame.prompts !== undefined) read.prompts = textsOf(frame.prompts, "runOverrides.prompts");
  if (frame.tools !== undefined) read.tools = textsOf(frame.tools, "runOverrides.tools");
  if (frame.judgeCriteria !== undefined) {
    if (!Array.isArray(frame.judgeCriteria) || frame.judgeCriteria.some((each) => typeof each !== "string")) throw new Error("Answer-first caller runOverrides.judgeCriteria must be a list of text.");
    read.judgeCriteria = [...(frame.judgeCriteria as string[])];
  }
  if (frame.models !== undefined) {
    const models = group(frame.models, "runOverrides.models", MODELS);
    read.models = Object.fromEntries(Object.entries(models).map(([role, id]) => {
      if (typeof id !== "string" || !MODEL_ID.test(id)) throw new Error(`Answer-first caller runOverrides.models.${role} must be a model id.`);
      return [role, id];
    }));
  }
  if (frame.pace !== undefined) read.pace = wholes(group(frame.pace, "runOverrides.pace", PACE), "runOverrides.pace");
  if (frame.digest !== undefined) {
    if (typeof frame.digest !== "string") throw new Error("Answer-first caller runOverrides.digest must be text.");
    read.digest = frame.digest;
  }
  return read as AutomationStudioRunOverrides;
}

function retryWaitsOf(given: unknown): Record<string, unknown> {
  const { backoffMs, ...rest } = group(given, "runOverrides.retryWaits", RETRY_WAITS);
  const read: Record<string, unknown> = wholes(rest, "runOverrides.retryWaits");
  if (backoffMs !== undefined) {
    if (!Array.isArray(backoffMs)) throw new Error("Answer-first caller runOverrides.retryWaits.backoffMs must be a list of whole milliseconds.");
    read.backoffMs = backoffMs.map((each) => whole(each, "runOverrides.retryWaits.backoffMs", 0));
  }
  return read;
}

function deadlinesOf(given: unknown): Record<string, unknown> {
  const { modelSilence, ...rest } = group(given, "runOverrides.deadlines", DEADLINES);
  const read: Record<string, unknown> = wholes(rest, "runOverrides.deadlines");
  if (modelSilence !== undefined) read.modelSilence = wholes(group(modelSilence, "runOverrides.deadlines.modelSilence", SILENCE), "runOverrides.deadlines.modelSilence");
  return read;
}

function textsOf(given: unknown, at: string): Record<string, { mode: "append" | "replace"; text: string }> {
  const entries = group(given, at);
  return Object.fromEntries(Object.entries(entries).map(([id, each]) => {
    const entry = group(each, `${at}.${id}`, TEXT);
    if ((entry.mode !== "append" && entry.mode !== "replace") || typeof entry.text !== "string") throw new Error(`Answer-first caller ${at}.${id} must be { mode: "append" | "replace", text }.`);
    return [id, { mode: entry.mode, text: entry.text }];
  }));
}

function wholes(values: Record<string, unknown>, at: string): Record<string, number> {
  return Object.fromEntries(Object.entries(values).map(([name, value]) => [name, whole(value, `${at}.${name}`, 0)]));
}

function whole(value: unknown, at: string, least: number): number {
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value < least) throw new Error(`Answer-first caller ${at} must be a whole number from ${least}.`);
  return value;
}

function group(value: unknown, at: string, known?: ReadonlySet<string>): Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) throw new Error(`Answer-first caller ${at} must be an object.`);
  const record = value as Record<string, unknown>;
  if (known) for (const key of Object.keys(record)) if (!known.has(key)) throw new Error(`Answer-first caller ${at} does not take "${key}".`);
  return record;
}
