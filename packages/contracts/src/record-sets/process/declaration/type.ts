/** Framework provenance for a bound automatic declaration; it never grants action authority. */
export type AutomationStudioRecordProcessingDeclaration = {
  /** Version 1 identifies automatic semantics; runtime dispatch must opt in explicitly. */
  version: 1;
  /** Lowercase SHA-256 digest of the instruction source, computed by the framework. */
  source: string;
  /** Positive safe integer, advanced by an explicit framework amendment. */
  revision: number;
  /** Original written references to allowed stored field ids; virtual derived ids stay in the expressions. */
  bindings: Readonly<Record<string, string>>;
};
