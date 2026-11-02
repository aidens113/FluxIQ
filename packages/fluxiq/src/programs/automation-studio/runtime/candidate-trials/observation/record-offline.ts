import type { AutomationStudioCandidateTrialRecord } from "../../service/candidate-trial/index.ts";
import { trialOfflineRunners } from "./offline-registry.ts";

export function recordTrialOfflineSource(target: object, record: AutomationStudioCandidateTrialRecord): void { trialOfflineRunners.get(target)?.runner.observe(record); }
