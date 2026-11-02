import { automationStudioStallAnnouncements } from "./announcements.ts";

export function announceAutomationStudioStallRecovery(call: object): void {
  const announce = automationStudioStallAnnouncements.get(call);
  automationStudioStallAnnouncements.delete(call);
  announce?.();
}
