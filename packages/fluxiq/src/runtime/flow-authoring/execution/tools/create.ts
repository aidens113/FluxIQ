import type { AutomationStudioBuildToolObserverOptions } from "./options.ts";
import { AutomationStudioBuildToolObserver } from "./observer.ts";

export function createAutomationStudioBuildToolObserver(options: AutomationStudioBuildToolObserverOptions): AutomationStudioBuildToolObserver {
  return new AutomationStudioBuildToolObserver(options);
}
