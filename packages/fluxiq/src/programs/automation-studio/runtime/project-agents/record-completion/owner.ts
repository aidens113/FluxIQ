import type { ExecutionCallbackCompletion } from "../../../../../runtime/execution-observation/index.ts";
import { OriginalExecutionPromiseReceipts } from "../../../../../runtime/execution-observation/queue-completion/index.ts";
import { AutomationStudioSiteResetCallbackPolicies, AutomationStudioSiteResetObservation } from "../../flow-bootstrap/reset-observation/index.ts";

/** Private receipts of one exact Core-owned project writer method. */
export class AutomationStudioProjectWriteCompletion {
  private readonly receipts = new OriginalExecutionPromiseReceipts();

  static for<TReceiver extends object | undefined, TArguments extends unknown[], TResult>(receiver: TReceiver, callback: (this: TReceiver, ...args: TArguments) => TResult): AutomationStudioProjectWriteCompletion {
    const owner = new AutomationStudioProjectWriteCompletion();
    const receipts = owner.receipts;
    const consume = receipts.consume;
    AutomationStudioSiteResetCallbackPolicies.rememberManaged({
      receiver, callback, contract: "managed_direct_effects",
      consumeCompletion: input => consume.call(receipts, input)
    });
    return owner;
  }

  /** Capture while the original invocation is live, before its first await. */
  static capture(invocation: object | undefined) {
    const original = AutomationStudioSiteResetObservation.of(invocation);
    if (!original) return undefined;
    const { callbacks, parent, automation, originalRoot, toolObserver, toolRequest, prepareToolParent } = original.context;
    return Object.freeze({ context: Object.freeze({
      callbacks, parent: Object.freeze({ reservation: parent.reservation, parent: parent.parent }),
      automation, originalRoot, toolObserver, toolRequest, prepareToolParent
    }), options: original.options });
  }

  completed(original: Promise<unknown>, frame: ReturnType<typeof AutomationStudioProjectWriteCompletion.capture>, completion: ExecutionCallbackCompletion): void {
    if (frame) this.receipts.issue(original, frame.context.callbacks, frame.context.parent, completion);
  }
}
