// Reads the credentials file: INI in the style of AWS's shared files. Sections are
// `[name]`, entries `key = value`, and a line starting with "#" or ";" is a comment, as
// is a " ;" or " #" after a value.

export type IniSections = Record<string, Record<string, string>>;

/** Parses INI text into sections of entries. Entries before any section are ignored. */
export function parseIni(text: string): IniSections {
  const sections: IniSections = {};
  let current: Record<string, string> | undefined;
  for (const raw of text.split(/\r\n|\r|\n/u)) {
    const line = raw.trim().replace(/\s+[;#].*$/u, "");
    if (line === "" || line.startsWith("#") || line.startsWith(";")) continue;
    const header = /^\[([^\]]+)\]$/u.exec(line);
    if (header !== null) {
      current = {};
      sections[(header[1] as string).trim()] = current;
      continue;
    }
    const equals = line.indexOf("=");
    if (equals < 0 || current === undefined) continue;
    const value = line.slice(equals + 1).replace(/\s+[;#].*$/u, "").trim();
    current[line.slice(0, equals).trim()] = value;
  }
  return sections;
}
