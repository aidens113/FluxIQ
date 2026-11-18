/**
 * Writes a Compose env file: `NAME=value` lines in the order given, a value
 * with anything but plain characters single-quoted (Compose reads those
 * literally, with no interpolation). A value that cannot be written safely
 * (a quote or a line break) is refused rather than altered.
 */
export function toEnvFile(header: readonly string[], values: readonly (readonly [string, string])[]): string {
  const lines = header.map((line) => `# ${line}`.trimEnd());
  for (const [name, value] of values) {
    if (!/^[A-Z][A-Z0-9_]*$/u.test(name)) throw new Error(`${name} is not an environment variable name.`);
    if (/['\r\n\0]/u.test(value)) throw new Error(`The value of ${name} cannot contain a single quote or a line break.`);
    lines.push(`${name}=${/^[A-Za-z0-9_.,:/@*+-]*$/u.test(value) ? value : `'${value}'`}`);
  }
  return `${lines.join("\n")}\n`;
}
