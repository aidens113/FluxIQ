import type { JsonObject } from "../../../../../core/index.ts";
import { isCandidateTrialJsonObject } from "./json-object.ts";

export function candidateTrialFailedStep(feedback: JsonObject): JsonObject | undefined {
  const steps = feedback.steps;
  const last = Array.isArray(steps) ? steps.at(-1) : undefined;
  if (!isCandidateTrialJsonObject(last) || last.status !== "failed" || typeof last.step !== "number" || !Number.isSafeInteger(last.step) || typeof last.definitionId !== "string") return undefined;
  return { step: last.step, definitionId: last.definitionId,
    ...(typeof last.failureCode === "string" ? { failureCode: last.failureCode } : {}),
    ...(typeof feedback.code === "string" ? { code: feedback.code } : {}) };
}
