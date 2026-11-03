export type AutomationStudioIdempotentMutationResult<TResult> = {
  mutationId: string;
  replayed: boolean;
  response: TResult;
  firstChangeSequence: number | null;
  lastChangeSequence: number | null;
};
