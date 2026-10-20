/**
 * Where a client sent a command, in its own terms (for a browser, a tab and a
 * document). Opaque to Core; never a value the command carries.
 */
export type ClientGatewayCommandPlace = Record<string, string | number>;

/**
 * What a client keeps while a command is in flight: the result's fields, and
 * where it was sent. Never a value the command carries.
 */
export type ClientGatewayInFlightRecord = {
  commandId: string;
  actionType: string;
  /** Whether the act commits: a lost answer leaves its effect unknown. */
  committing: boolean;
  startedAt: number;
  place?: ClientGatewayCommandPlace;
};
