// The part of a session's `metadata.candidateTrial` a run summary carries
// (`runtime/service/candidate-trial/run.ts` writes it): the candidate's id and
// the trial's closed scalars. Anything else under the key -- or anything too
// long to be an id or a code -- is left on the session, which is read by id.

import type { JsonObject } from "../../../../../core/index.ts";
import type { AutomationStudioRuntimeRunCandidateTrial } from "../../../storage/index.ts";
import { isJsonRecord } from "../json-values.ts";

const MAX_SCALAR_LENGTH = 200;

export function automationStudioRuntimeSummaryCandidateTrial(metadata: JsonObject | undefined): AutomationStudioRuntimeRunCandidateTrial | undefined {
  const trial = metadata?.candidateTrial;
  if (!isJsonRecord(trial)) return undefined;
  const candidateId = boundedString(trial.candidateId);
  if (candidateId === undefined) return undefined;
  const revision = Number.isSafeInteger(trial.revision) ? trial.revision as number : undefined;
  const digest = boundedString(trial.digest), start = boundedString(trial.start), execution = boundedString(trial.execution), code = boundedString(trial.code);
  const verdict = boundedString(trial.verdict), verdictCode = boundedString(trial.verdictCode);
  return {
    candidateId,
    ...(revision !== undefined ? { revision } : {}),
    ...(digest !== undefined ? { digest } : {}),
    ...(start !== undefined ? { start } : {}),
    ...(execution !== undefined ? { execution } : {}),
    ...(code !== undefined ? { code } : {}),
    ...(verdict !== undefined ? { verdict } : {}),
    ...(verdictCode !== undefined ? { verdictCode } : {})
  };
}

function boundedString(value: unknown): string | undefined {
  return typeof value === "string" && value.length > 0 && value.length <= MAX_SCALAR_LENGTH ? value : undefined;
}
