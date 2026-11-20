// What the ledger is fed of one read (`../result/types.ts`, `Read` and `Version`), from a call's answer or a saved
// Flow's record batch, and never from a model's words (design D9).
//
// - **The version** is the read's `where` conditions and its `fields`, found in its parameters as a run's are
//   (`automationStudioResultReadParameters`), and the list's identity the domain declared from the site's structure
//   (`listKey`, `engine/automation/records/read/list-key.ts`). A draft step's version comes from its own written input,
//   and a page read by any run of that step is recorded under that version, so a run that declares the person's
//   columns on its call (a forward run's record output) is the same step version as the read that authored it.
// - **The place** is where the domain said its pager was (`place`). A call's requested page or address cannot declare it.
// - **The rows** are the ones the row sink stored from the answer: what the read kept, copied by the schema (D3).
import type { JsonObject } from "../../../../../core/index.ts";
import type { AutomationStudioRecordBatch } from "../../../../../engine/automation/contracts.ts";
import { automationStudioRecordReadListKey, automationStudioRecordReadPlace } from "../../../../../engine/automation/records/index.ts";
import type { AutomationStudioFlowDraftStep } from "../../../../../runtime/flow-authoring/draft/index.ts";
import type { AutomationStudioLlmEvidenceToolExecutionResult } from "../../../../../runtime/llm/index.ts";
import { automationStudioResultReadParameters } from "../../../../../runtime/result-verification/index.ts";
import type { AutomationStudioAnswerFirstResultRead, AutomationStudioAnswerFirstResultVersion } from "../result/index.ts";
import { automationStudioAnswerFirstAddressSplit, automationStudioAnswerFirstReadEvidenceOf, automationStudioAnswerFirstBatchLeftOut, type AutomationStudioAnswerFirstRowCall } from "../rows/index.ts";

/** A read's version from the input it was written with (a call's value, a draft step's input), with the list's key where one was said. */
export function automationStudioAnswerFirstResultVersionOf(input: JsonObject, listKey?: string): AutomationStudioAnswerFirstResultVersion {
  const read = automationStudioResultReadParameters(isObject(input.parameters) ? input.parameters : undefined);
  const where = read?.where;
  const fields = read?.fields;
  return { conditions: Array.isArray(where) ? where : [], fields: isObject(fields) ? fields : {}, ...(listKey === undefined ? {} : { listKey }) };
}

/** Whether a draft step marked its read a working one (`purpose: intermediate` on its record output). */
export function automationStudioAnswerFirstResultIntermediate(input: JsonObject): boolean {
  const parameters = isObject(input.parameters) ? input.parameters : undefined;
  const output = isObject(parameters?.recordOutput) ? parameters.recordOutput : isObject(input.recordOutput) ? input.recordOutput : undefined;
  return output?.purpose === "intermediate";
}

/** One call's read: the rows the sink stored from it, under the version `step` holds where a draft step read it, else its own call's. */
export function automationStudioAnswerFirstResultReadOfCall(
  call: AutomationStudioAnswerFirstRowCall,
  answer: AutomationStudioLlmEvidenceToolExecutionResult,
  kept: readonly JsonObject[],
  readRowsKey: string | undefined,
  step?: AutomationStudioFlowDraftStep,
): AutomationStudioAnswerFirstResultRead {
  const path = readRowsKey?.split(".") ?? [];
  const listKey = automationStudioRecordReadListKey(answer.evidence, path);
  const evidence = automationStudioAnswerFirstReadEvidenceOf(call, answer, readRowsKey);
  const place = automationStudioRecordReadPlace(answer.evidence, path);
  return {
    source: call.callId,
    version: automationStudioAnswerFirstResultVersionOf(step?.input ?? call.value, listKey),
    ...(place === undefined ? {} : { place }),
    kept: kept.map((row) => ({ ...row })),
    ...(evidence.leftOut ? { leftOut: evidence.leftOut } : {}),
    ...(evidence.list === undefined ? {} : { where: evidence.list }),
  };
}

/** A saved Flow's record batch, as the read of the draft step its node stands for. */
export function automationStudioAnswerFirstResultReadOfBatch(batch: AutomationStudioRecordBatch, step: AutomationStudioFlowDraftStep): AutomationStudioAnswerFirstResultRead {
  const at = batch.location === undefined ? undefined : automationStudioAnswerFirstAddressSplit(batch.location);
  const place = batch.place;
  const leftOut = automationStudioAnswerFirstBatchLeftOut(batch.leftOut);
  return {
    source: batch.batchKey,
    version: automationStudioAnswerFirstResultVersionOf(step.input, batch.listKey),
    ...(place === undefined ? {} : { place }),
    kept: batch.rows.map((row) => ({ ...row })),
    ...(leftOut ? { leftOut } : {}),
    ...(at ? { where: at.view } : {}),
  };
}

function isObject(value: unknown): value is JsonObject {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
