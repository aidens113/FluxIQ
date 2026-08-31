import { runAutomationStoreTransaction } from '../stores/external-store';

export function runAutomationPresentationTransaction<Result>(
  operation: () => Result
): Result {
  return runAutomationStoreTransaction(operation);
}
