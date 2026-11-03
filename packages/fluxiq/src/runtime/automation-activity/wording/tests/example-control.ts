import type { AutomationStudioActivityControlReader } from "../../../../framework/automation-service/nodes/index.ts";

/**
 * A domain's reading of the control a step's parameters carry, for tests of
 * Core's sentences. It reads the shape those tests have always written, so what
 * they assert about Core's wording did not change when the real reading moved
 * to the domain, which tests its own against Core's sentences.
 *
 * A test takes it by mocking the one function that asks:
 *
 *   vi.mock("<wording>/control-reader.ts", async (original) => ({
 *     ...(await original<object>()),
 *     automationStudioActivityControlOf: (await import("<wording>/tests/example-control.ts")).exampleActivityControlReader
 *   }));
 */
export const exampleActivityControlReader: AutomationStudioActivityControlReader = (parameters) => {
  const element = parameters && typeof parameters === "object" && !Array.isArray(parameters) ? (parameters as { element?: unknown }).element : undefined;
  if (!element || typeof element !== "object" || Array.isArray(element)) return undefined;
  const identity = element as { label?: unknown; accessibleName?: unknown; visibleText?: unknown; role?: unknown; inputType?: unknown };
  return { names: [identity.label, identity.accessibleName, identity.visibleText], kinds: [identity.role, identity.inputType] };
};
