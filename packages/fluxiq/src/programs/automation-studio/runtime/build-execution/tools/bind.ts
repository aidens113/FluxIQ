import type { AutomationStudioHarnessOptionLoopBinding } from "../../llm/harness-options/index.ts";
import type { AutomationStudioBuildToolObserver } from "./observer.ts";
import { AutomationStudioBuildToolFactories } from "./factory.ts";
import { AutomationStudioProjectBuildToolObservers } from "./project.ts";

/** The actual constructed binding and callback retain their original configured cohort. */
export function bindAutomationStudioObservedBuildTools(binding: Pick<AutomationStudioHarnessOptionLoopBinding, "executeTool">, observer: AutomationStudioBuildToolObserver): void {
  const original = binding.executeTool;
  const observed: AutomationStudioHarnessOptionLoopBinding["executeTool"] = function (this: typeof binding, input) {
    AutomationStudioProjectBuildToolObservers.bind(input, observer);
    return observer.invoke({ receiver: this, callback: original, args: [input] }, input, input.signal);
  };
  AutomationStudioBuildToolFactories.remember(observed, "frame");
  AutomationStudioProjectBuildToolObservers.bind(binding, observer);
  AutomationStudioProjectBuildToolObservers.bind(observed, observer);
  binding.executeTool = observed;
}
