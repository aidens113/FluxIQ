/** Original actual binder objects only; the callback is an identity key, never an invoker. */
export interface OutputGatewayTarget {
  readonly receiver: object;
  readonly callback: object;
}
