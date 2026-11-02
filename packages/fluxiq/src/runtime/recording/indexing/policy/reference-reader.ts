import type { RecordingIndexScope } from "./scope.ts";

export type RecordingReferenceReader = {
  accepts(reference: string, scope: RecordingIndexScope): boolean;
  validate(reference: string, scope: RecordingIndexScope):
    | { ok: true }
    | { ok: false; code: "invalid_object_ref" | "cross_project_ref"; message: string };
};
