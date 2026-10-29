/** Flags that take a value, mapped to the input field they fill. A `$` target is handled by the builder itself; `--policy` accumulates; `--workspace` is resolved per operation. */
export const ACCOUNTS_VALUE_FLAGS: Readonly<Record<string, string>> = Object.freeze({
  email: "email",
  "display-name": "displayName",
  "external-id": "externalId",
  "user-id": "userId",
  policy: "policies",
  workspace: "workspace",
  "workspace-id": "workspaceId",
  reason: "reason",
  scope: "scope",
  mode: "mode",
  "terms-version": "termsVersion",
  "continue-url": "continueUrl",
  "request-id": "requestId",
  json: "$json",
  "password-file": "$passwordFile"
});

/** Flags that take no value. */
export const ACCOUNTS_SWITCH_FLAGS: Readonly<Record<string, string>> = Object.freeze({
  "send-welcome": "sendWelcome",
  "password-stdin": "$passwordStdin",
  offline: "$offline"
});
