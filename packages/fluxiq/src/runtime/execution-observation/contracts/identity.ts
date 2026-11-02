export interface ExecutionCallbackIdentity<TReceiver, TArguments extends unknown[], TResult> {
  readonly receiver: TReceiver;
  readonly callback: (this: TReceiver, ...args: TArguments) => TResult;
  readonly binding?: object;
}
