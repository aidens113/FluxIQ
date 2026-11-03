import { releaseAutomationStudioSessionProviderKey, type AutomationStudioSessionKeyPorts, type AutomationStudioSessionKeyOptions } from "../../models/secrets/index.ts";
export type { AutomationStudioSessionKeyPorts, AutomationStudioSessionKeyOptions } from "../../models/secrets/index.ts";
export async function releaseAutomationStudioSessionDeepSeekKey(ports: AutomationStudioSessionKeyPorts, caller: { userId: string; sessionId: string | null }, options: AutomationStudioSessionKeyOptions = {}): Promise<string> {
  return await releaseAutomationStudioSessionProviderKey(ports, caller, { ...options, provider: "deepseek" });
}
