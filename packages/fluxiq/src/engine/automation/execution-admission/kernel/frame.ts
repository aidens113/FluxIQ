import type { PreparedExecutionCallback } from "../../../../runtime/execution-observation/index.ts";
import type { AutomationStudioGraphExecutionOptions } from "../../contracts/index.ts";
import type { AutomationAdmissionDriver } from "../internal/index.ts";

export interface PreparedAutomationFrame {
  readonly driver: AutomationAdmissionDriver;
  readonly invocation: PreparedExecutionCallback;
  readonly options: AutomationStudioGraphExecutionOptions;
  readonly binding: object;
}
