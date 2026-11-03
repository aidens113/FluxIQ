import type { AutomationNodePort } from "../contracts.ts";
import { successOutput } from "./success-output.ts";
import { failedOutput } from "./failed-output.ts";

export function successFailureOutputs(data?: AutomationNodePort): AutomationNodePort[] {
  return data ? [successOutput(), failedOutput(), data] : [successOutput(), failedOutput()];
}
