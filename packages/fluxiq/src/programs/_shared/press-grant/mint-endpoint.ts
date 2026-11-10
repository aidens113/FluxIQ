/**
 * Where a panel page asks for a press grant when the person presses its
 * Delete or Allow button: `POST /api/programs/identity-access/mint-press-grant`
 * with `{ programId, endpoint, payload }`, the call it is about to send. The
 * answer's `payload` is `{ grant, expiresAt }`; the page sends `grant` once,
 * as the call's `pressGrant` field, with the very same payload.
 */
export const PRESS_GRANT_MINT_ENDPOINT = Object.freeze({
  programId: "identity-access",
  endpoint: "mint-press-grant"
});
