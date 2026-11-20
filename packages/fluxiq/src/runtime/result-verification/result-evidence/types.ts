import type { JsonObject, JsonValue } from "../../../core/index.ts";
import type { AutomationStudioFlowLessReadLeftOut } from "../flow-less/index.ts";

/** A contributing read, kept whole with its source and current authored version. Shared by both judges. */
export type AutomationStudioResultEvidencePage = {
  source: string;
  step: string;
  position?: number;
  version: number;
  conditions: readonly JsonValue[];
  fields: JsonObject;
  listKey?: string;
  where?: string;
  place?: string;
  kept: number;
  rows: readonly JsonObject[];
  leftOut?: AutomationStudioFlowLessReadLeftOut | { reported: JsonObject; parameters?: JsonObject };
  carried?: boolean;
};

export type AutomationStudioResultEvidenceCoverage = {
  step: string;
  version: number;
  places: readonly string[];
  first: "read" | "not read" | "unknown";
  last?: { place: string; paging?: { verdict: "moved" } | { verdict: "ended"; reason: string } };
};

/** Facts for the judge to weigh. No completeness verdict and no guessed page association. */
export type AutomationStudioResultEvidenceBundle = {
  pages: readonly AutomationStudioResultEvidencePage[];
  coverage: readonly AutomationStudioResultEvidenceCoverage[];
  answerContract?: { columns: readonly string[] };
  working: readonly { step: string; position?: number; listKey?: string; kept: number }[];
  looks: readonly AutomationStudioResultEvidencePage[];
  /** Older/unrecorded batches cannot supply page evidence; this is distinct from a validated empty page. */
  missingEvidence?: readonly { datasetId: string; batchKey?: string }[];
};
