import { automationStudioStallAnnouncements } from "./announcements.ts";

export function deferAutomationStudioStallAnnouncement(call: object, announce: () => void): void {
  automationStudioStallAnnouncements.set(call, announce);
}
