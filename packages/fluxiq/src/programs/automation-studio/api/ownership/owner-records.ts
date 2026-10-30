import type { AutomationStudioProjectOwnerRecord, AutomationStudioProjectOwnerRecords } from "./types.ts";

// Reading owner records safely: from a stored document (refused when
// malformed, never half-read), by id (own properties only, so `constructor`
// is not a project), and which ids can be keys at all.

const MAX_PROJECT_ID_LENGTH = 512;

export const AutomationStudioProjectOwnerRecordSet = Object.freeze({
  /**
   * Whether `projectId` can name a project here: a non-empty string of bounded
   * length that is not `__proto__`, which an object key cannot hold.
   */
  isUsableId(projectId: unknown): projectId is string {
    return typeof projectId === "string" && projectId.length > 0 && projectId.length <= MAX_PROJECT_ID_LENGTH && projectId !== "__proto__";
  },

  /** The record of `projectId`, or null when none is recorded. */
  of(records: AutomationStudioProjectOwnerRecords, projectId: string): AutomationStudioProjectOwnerRecord | null {
    return Object.hasOwn(records, projectId) ? records[projectId] ?? null : null;
  },

  /**
   * The records a stored document holds (`{ projects: { <id>: record } }`; an
   * absent `projects` is no records yet). Throws on any malformed entry rather
   * than dropping it: a dropped record would let the migration give the
   * project someone else.
   */
  parse(document: unknown): AutomationStudioProjectOwnerRecords {
    if (!isObject(document)) throw malformed("the document is not an object");
    const projects = document.projects ?? {};
    if (!isObject(projects)) throw malformed("`projects` is not an object");
    const records: AutomationStudioProjectOwnerRecords = {};
    for (const [projectId, value] of Object.entries(projects)) {
      if (!AutomationStudioProjectOwnerRecordSet.isUsableId(projectId)) throw malformed("a project id is unusable");
      if (!isObject(value)) throw malformed(`the record of ${projectId} is not an object`);
      const { userId, source, recordedAt } = value;
      if (typeof userId !== "string" || userId.length === 0) throw malformed(`the record of ${projectId} has no user id`);
      if (source !== "creator" && source !== "default") throw malformed(`the record of ${projectId} has an unknown source`);
      if (typeof recordedAt !== "number" || !Number.isFinite(recordedAt)) throw malformed(`the record of ${projectId} has no recording time`);
      records[projectId] = { userId, source, recordedAt };
    }
    return records;
  }
});

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function malformed(reason: string): Error {
  return new Error(`Automation Studio project owner records are malformed: ${reason}.`);
}
