import { trialExecutionSources } from "./source-registry.ts";

export function trialExecutionSource(target: object) { return trialExecutionSources.get(target); }
