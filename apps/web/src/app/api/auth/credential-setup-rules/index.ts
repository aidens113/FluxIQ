// Barrel for the first sign-in's rules that the browser shares with the
// server: the replacement password's rule and the name of the cookie that
// keeps a browser on the setup form. Nothing here touches the server or a
// secret, so `AuthShell` imports it.
export { CREDENTIAL_SETUP_PENDING_COOKIE } from "./credential-setup-pending-cookie";
export { replacementPasswordError } from "./replacement-password-error";
