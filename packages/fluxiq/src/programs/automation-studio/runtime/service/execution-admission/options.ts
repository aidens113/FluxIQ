import type { AutomationStudioHostResourcePort } from "../../../../../runtime/host-resources/index.ts";
export interface AutomationStudioExecutionAdmissionOptions {
    readonly projectId: string;
    readonly flowId: string;
    readonly hostResources?: AutomationStudioHostResourcePort;
}
