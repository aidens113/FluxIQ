/**
 * The form two sign-in names are compared in: equal keys are the same name.
 * Sign-in (`authenticate`), the uniqueness check (`refuseTakenUsername`) and
 * the `update-user` endpoint's unchanged-value check all compare through this
 * one function, so none of them can call two names the same while another
 * calls them different. It is `String.prototype.toLowerCase`: Unicode's
 * default, locale-independent lower-casing, which is what sign-in already
 * folded with. It does not trim and does not apply Unicode normalisation or
 * full case folding; names are stored as sent.
 */
export function usernameKey(username: string): string {
  return username.toLowerCase();
}
