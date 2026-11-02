import { trialOfflineRunners } from "./offline-registry.ts";

export function trialOfflineRunner(target: object) { return trialOfflineRunners.get(target); }
