/**
 * An IAM action in words: `iam:SetMemberRole` reads "Set member role". A name
 * that is not `<service>:<PascalCase>` is shown as it is.
 */
export function actionLabel(action: string): string {
  const name = action.slice(action.indexOf(":") + 1);
  if (!/^[A-Z][A-Za-z0-9]*$/u.test(name)) return action;
  const words = name.replace(/([a-z0-9])([A-Z])/gu, "$1 $2").replace(/([A-Z])([A-Z][a-z])/gu, "$1 $2").split(" ");
  return words.map((word, index) => (index === 0 || /^[A-Z0-9]{2,}$/u.test(word) ? word : word.toLowerCase())).join(" ");
}
