/**
 * The trust lineage a client is in once `server.session_ready` arrives.
 *
 * `resumed` is true when the hello on this socket carried a token and no
 * `server.pairing_required` came on it; the caller decides it. A resumed socket
 * keeps the stored lineage, because Core resumed the same trusted client and
 * still files its recording under it. A socket that had to pair, or said hello
 * without a token, starts a new lineage from `mint()`, so nothing queued under
 * the old one is delivered to the new trust.
 */
export function clientGatewayLineageAfterReady(input: {
  stored?: string | undefined;
  resumed: boolean;
  mint: () => string;
}): string {
  return input.resumed && input.stored ? input.stored : input.mint();
}
