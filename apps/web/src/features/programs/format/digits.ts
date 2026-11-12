/** Only the digits of what was typed: PIN and code fields. */
export function digits(value: string): string {
  return value.replace(/\D/g, "");
}
