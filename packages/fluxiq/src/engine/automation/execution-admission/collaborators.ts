import type { NativeExecutionAdmissionSource } from "../../../runtime/native-execution/admission/index.ts";
import type { OutputExecutionAdmissionSource } from "../../../runtime/output-dispatch/admission/index.ts";

export interface AutomationExecutionAdmissionCollaborators {
  readonly native?: NativeExecutionAdmissionSource;
  readonly output?: OutputExecutionAdmissionSource;
}
