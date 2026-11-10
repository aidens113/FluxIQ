/**
 * What a person is told when a destructive call or a mint is refused. Plain,
 * fixed sentences: none names a grant, a session or which binding failed.
 *
 * - `pressAllow`: a destructive call that carries no confirmation;
 * - `pressAgain`: a grant that was used already, has run out, or was minted
 *   for another session, person, action or payload (one sentence for all, so
 *   a refusal says nothing about which);
 * - `personOnly`: the assistant, a paired client or a key asked to confirm;
 * - `signIn`: the caller's panel session is gone or is not the actor's;
 * - `pinRequired`: the person turned a PIN on, so their PIN confirms instead;
 * - `notConfirmable`: the named endpoint is not one a press confirms;
 * - `unavailable`: the registry was built without Identity Access.
 */
export const PRESS_GRANT_REFUSALS = Object.freeze({
  pressAllow: "Press Allow to confirm this.",
  pressAgain: "That confirmation was used already, ran out, or was for something else. Press Allow again.",
  personOnly: "Only a person's own press can confirm an action.",
  signIn: "Sign in to the panel to confirm this.",
  pinRequired: "PIN is required for this action",
  notConfirmable: "That action does not need a confirmation.",
  unavailable: "PIN authorization service is not available."
});
