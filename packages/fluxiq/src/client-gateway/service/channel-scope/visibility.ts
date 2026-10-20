/**
 * The visibility rule of channel scopes. A session is seen and reached only
 * from the scope it was attached under: inside a scope, only that scope's
 * sessions; outside any scope, only sessions that belong to none (live ones).
 * `sessionScope` is the scope a session was attached under, `undefined` for a
 * live session; `currentScope` is the dispatching context's, `undefined` live.
 */
export function clientGatewayChannelScopeVisible(sessionScope: string | undefined, currentScope: string | undefined): boolean {
  return sessionScope === currentScope;
}
