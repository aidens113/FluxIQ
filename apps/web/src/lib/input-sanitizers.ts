export function sanitizeAsciiDigits(value: string, maxLength?: number): string {
  const digits = value.replace(/[^0-9]/g, "");
  return maxLength === undefined ? digits : digits.slice(0, maxLength);
}
