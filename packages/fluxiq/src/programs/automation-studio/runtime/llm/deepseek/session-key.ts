import { releaseAutomationStudioSessionProviderKey, type AutomationStudioSessionKeyPorts, type AutomationStudioSessionKeyOptions } from "../session-keys/index.ts";
export type { AutomationStudioSessionKeyPorts, AutomationStudioSessionKeyOptions } from "../session-keys/index.ts";
export async function releaseAutomationStudioSessionDeepSeekKey(ports: AutomationStudioSessionKeyPorts, caller: { userId: string; sessionId: string | null }, options: AutomationStudioSessionKeyOptions = {}): Promise<string> {
  return await releaseAutomationStudioSessionProviderKey(ports, caller, { ...options, provider: "deepseek" });
}
