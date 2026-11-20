import type { AutomationStudioGraphInputUseController } from "./controller.ts";

/** Methodless capability. Its controller belongs to the explicit run session. */
export class AutomationStudioGraphInputUsePort {
  #controller: AutomationStudioGraphInputUseController;

  constructor(controller: AutomationStudioGraphInputUseController) {
    this.#controller = controller;
    // No prototype/constructor path from an exposed handle to engine control methods.
    Object.setPrototypeOf(this, null);
    Object.freeze(this);
  }

  /** Internal module integration only; never exported as a value by the capability barrel. */
  static controller(value: unknown): AutomationStudioGraphInputUseController | undefined {
    return typeof value === "object" && value !== null && #controller in value ? value.#controller : undefined;
  }
}
