/** Why a focus was refused: a malformed request, a session no person paired, a project the person may not read there (or none), or Core could not decide. */
export const CLIENT_GATEWAY_PROJECT_FOCUS_REFUSAL_CODES = Object.freeze({
  invalid: "project_focus.invalid",
  notPaired: "project_focus.not_paired",
  refused: "project_focus.refused",
  unavailable: "project_focus.unavailable"
} as const);
export type ClientGatewayProjectFocusRefusalCode = (typeof CLIENT_GATEWAY_PROJECT_FOCUS_REFUSAL_CODES)[keyof typeof CLIENT_GATEWAY_PROJECT_FOCUS_REFUSAL_CODES];
