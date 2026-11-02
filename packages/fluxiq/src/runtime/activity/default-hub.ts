import { AutomationStudioActivityHub } from "./hub.ts";

/** The one hub every emission in this process publishes to. */
export const automationStudioActivityHub = new AutomationStudioActivityHub();
