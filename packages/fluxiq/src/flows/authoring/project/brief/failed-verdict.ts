import type { AutomationStudioCandidateTrialVerdict } from "../../plan/index.ts";

export type FailedVerdict = Exclude<AutomationStudioCandidateTrialVerdict, "yes">;
