// Barrel for the account-link routes' server logic, shared by the welcome and
// reset routes: request checks, the typed answer, and the welcome submit.
export type { AccountLinkResponse } from "./accountLinkResponse";
export { isCrossSiteRequest } from "./isCrossSiteRequest";
export { readJsonObject } from "./readJsonObject";
export { readTokenAndPassword } from "./readTokenAndPassword";
export { refuse } from "./refuse";
export { submitWelcome } from "./submitWelcome";
export { toAccountLinkHttp } from "./toAccountLinkHttp";
export type { WelcomeDeps } from "./WelcomeDeps";
