/** A domain or authoring formatter remains an original observed collaborator. */
export interface NativeModelLogPresentation {
  readonly receiver: unknown;
  readonly modelSummary: (this: unknown, response: unknown, error: unknown) => string;
}
