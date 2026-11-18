/** A value written with a Compose merge tag: `!override` replaces what earlier files said, `!reset` clears it. */
export type YamlTagged = { readonly yamlTag: "!override" | "!reset"; readonly value: YamlValue };

/** A value the YAML writer takes: text, numbers, booleans, lists, plain objects and tagged mappings. */
export type YamlValue = string | number | boolean | readonly YamlValue[] | YamlTagged | { readonly [key: string]: YamlValue };

const PLAIN_KEY = /^[A-Za-z0-9_][A-Za-z0-9_.-]*$/u;

/**
 * Writes YAML for Compose files: block style, two-space indents, keys in the
 * order given, and every string double-quoted (JSON string syntax is valid
 * YAML), so no value can be read back as another type or break a line.
 */
export function toYaml(value: YamlValue, indent = 0): string {
  const pad = " ".repeat(indent);
  if (Array.isArray(value)) {
    if (value.length === 0) return `${pad}[]\n`;
    return value.map((item: YamlValue) => isBlock(item) ? `${pad}-\n${toYaml(item, indent + 2)}` : `${pad}- ${scalar(item)}\n`).join("");
  }
  if (isTagged(value)) return toYaml(value.value, indent);
  if (typeof value === "object" && value !== null) {
    const entries = Object.entries(value as Record<string, YamlValue>);
    if (entries.length === 0) return `${pad}{}\n`;
    return entries.map(([key, item]) => {
      const name = PLAIN_KEY.test(key) ? key : JSON.stringify(key);
      if (isTagged(item)) {
        if (isEmpty(item.value)) return `${pad}${name}: ${item.yamlTag} ${Array.isArray(item.value) ? "[]" : "{}"}\n`;
        return `${pad}${name}: ${item.yamlTag}\n${toYaml(item.value, indent + 2)}`;
      }
      if (isBlock(item)) return `${pad}${name}:\n${toYaml(item, indent + 2)}`;
      return `${pad}${name}: ${isEmpty(item) ? (Array.isArray(item) ? "[]" : "{}") : scalar(item)}\n`;
    }).join("");
  }
  return `${pad}${scalar(value)}\n`;
}

function isTagged(value: YamlValue): value is YamlTagged {
  return typeof value === "object" && value !== null && !Array.isArray(value) && typeof (value as { yamlTag?: unknown }).yamlTag === "string";
}

function isBlock(value: YamlValue): boolean {
  return typeof value === "object" && value !== null && !isEmpty(value);
}

function isEmpty(value: YamlValue): boolean {
  if (isTagged(value)) return false;
  return Array.isArray(value) ? value.length === 0 : typeof value === "object" && value !== null && Object.keys(value).length === 0;
}

function scalar(value: YamlValue): string {
  if (typeof value === "string") return JSON.stringify(value);
  return String(value);
}
