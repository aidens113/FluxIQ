

/** A declaration Core could not read. The action must not proceed. */
export class AutomationStudioActionDeclarationError extends Error {
  readonly name = "AutomationStudioActionDeclarationError";

  constructor(readonly code: string) {
    super(`Automation Studio action declaration is invalid (${code}).`);
  }
}
