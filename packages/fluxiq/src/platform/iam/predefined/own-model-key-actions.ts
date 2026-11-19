/**
 * The actions that change only the key the caller's own chats use: saving,
 * replacing and removing it (Secret Keys' `save-model-key`,
 * `replace-model-key`, `remove-model-key`). Each endpoint declares the
 * caller's own user as its only resource and its handler reads nothing but the
 * caller, so a grant of these on `user/${fluxiq:PrincipalId}` reaches the
 * person's own key and nothing else: never another person's key, and never the
 * workspace's assistant key or model (t950).
 *
 * `FluxIQUserAccess` grants them to a member (`OwnModelKey`), and
 * `FluxIQBrowserSession` keeps them for the session's own person, so a paired
 * browser is decided by IAM rather than refused them wholesale. A registry
 * test fails when the endpoints stop declaring the caller's own user.
 */
export const IAM_OWN_MODEL_KEY_ACTIONS: readonly string[] = Object.freeze(["secrets:SaveModelKey", "secrets:ReplaceModelKey", "secrets:RemoveModelKey"]);
