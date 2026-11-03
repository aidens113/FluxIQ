import type { AutomationStudioGraphExecutionOptions } from "../../contracts/index.ts";
import { AutomationExpectationCollector } from "./collector.ts";
import type { AutomationExpectationFact } from "./fact.ts";

const collectors = new WeakMap<AutomationStudioGraphExecutionOptions, readonly AutomationExpectationCollector[]>();
const record = AutomationExpectationCollector.prototype.record;

/** Private diagnostic bindings only; these carry no execution or admission authority. */
export class AutomationExpectationDiagnostics {
  static bind(options: AutomationStudioGraphExecutionOptions, collector: AutomationExpectationCollector): void {
    const current = collectors.get(options) ?? [];
    if (!current.includes(collector)) collectors.set(options, [...current, collector]);
  }

  static has(options: AutomationStudioGraphExecutionOptions): boolean {
    return collectors.has(options);
  }

  static inherit(source: AutomationStudioGraphExecutionOptions, target: AutomationStudioGraphExecutionOptions): void {
    const current = collectors.get(source);
    if (current) collectors.set(target, current);
  }

  static record(options: AutomationStudioGraphExecutionOptions, fact: AutomationExpectationFact): void {
    for (const collector of collectors.get(options) ?? []) record.call(collector, fact);
  }
}
