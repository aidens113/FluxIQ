/**
 * Set beside the setup cookie while a browser has proved the temporary
 * credential and not yet replaced it. It holds `1` and no authority: the
 * sign-in form reads it to stay on the setup form across a reload or another
 * page, and the server decides only by the HttpOnly setup cookie.
 */
export const CREDENTIAL_SETUP_PENDING_COOKIE = "fluxiq_credential_setup_pending";
