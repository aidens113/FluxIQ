import type { IdentityCredentialChange, IdentityCredentialChangeSubscriber } from "../types.ts";

/** Subscriber commits that failed after the credential was written: ids and counts only, never an error text. */
export type CredentialCommitFailure = {
  readonly changeId: string;
  readonly userId: string;
  readonly failedSubscriberCount: number;
  readonly subscriberCount: number;
};

/**
 * Runs a credential write through the credential-change port.
 *
 * Subscribers prepare one at a time, in order. A `prepare` that throws refuses
 * the change: nothing is written, every subscriber that was asked to prepare
 * (the one that threw included) is sent `abort`, and the error is rethrown. A
 * failed write aborts the same way. Abort errors are swallowed so the original
 * error surfaces.
 *
 * After a successful write every subscriber is sent `commit`, and the change
 * stands. A commit error cannot undo the write, and a subscriber recovers its
 * own state from what it prepared, so commit errors never fail the change: the
 * remaining subscribers still commit, the failures are recorded by ids and
 * counts, and the write's result is returned.
 */
export async function runCredentialChange<T>(
  subscribers: readonly IdentityCredentialChangeSubscriber[],
  change: IdentityCredentialChange,
  write: () => Promise<T>,
  recordCommitFailure: (failure: CredentialCommitFailure) => void = warnCommitFailure
): Promise<T> {
  const asked: IdentityCredentialChangeSubscriber[] = [];
  let result: T;
  try {
    for (const subscriber of subscribers) {
      asked.push(subscriber);
      await subscriber.prepare(change);
    }
    result = await write();
  } catch (error) {
    for (const subscriber of asked) {
      try {
        await subscriber.abort(change);
      } catch {
        // The prepare or write error is the one to report.
      }
    }
    throw error;
  }
  const commitErrors: unknown[] = [];
  for (const subscriber of asked) {
    try {
      await subscriber.commit(change);
    } catch (error) {
      commitErrors.push(error);
    }
  }
  if (commitErrors.length > 0) {
    try {
      recordCommitFailure({
        changeId: change.changeId,
        userId: change.userId,
        failedSubscriberCount: commitErrors.length,
        subscriberCount: asked.length
      });
    } catch {
      // Recording must not fail a change whose credential is already written.
    }
  }
  return result;
}

function warnCommitFailure(failure: CredentialCommitFailure): void {
  console.warn(
    `Credential change ${failure.changeId} for user ${failure.userId}: ${failure.failedSubscriberCount} of ${failure.subscriberCount} subscribers failed to commit after the credential was written; the change stands.`
  );
}
