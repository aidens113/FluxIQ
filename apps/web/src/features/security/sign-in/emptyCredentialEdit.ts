export function emptyCredentialEdit(kind: "password" | "pin") {
  return {
    kind,
    value: "",
    confirm: "",
    authorizationPassword: "",
    authorizationPin: "",
    authorizationTotp: ""
  };
}
