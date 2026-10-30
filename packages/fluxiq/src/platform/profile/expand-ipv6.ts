/** Expands a bare IPv6 address (no brackets, no zone) to its eight 16-bit groups, or null when it is not one. */
export function expandIpv6(address: string): number[] | null {
  let text = address.toLowerCase();
  if (!/^[0-9a-f:.]+$/u.test(text) || !text.includes(":")) return null;
  const tail = /(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/u.exec(text);
  if (tail) {
    const octets = tail.slice(1).map(Number);
    if (octets.some((octet) => octet > 255)) return null;
    const high = ((octets[0] as number) << 8) | (octets[1] as number);
    const low = ((octets[2] as number) << 8) | (octets[3] as number);
    text = `${text.slice(0, tail.index)}${high.toString(16)}:${low.toString(16)}`;
  }
  if (text.includes(".")) return null;
  const halves = text.split("::");
  if (halves.length > 2) return null;
  const parse = (part: string): number[] | null => {
    if (part === "") return [];
    const groups = part.split(":");
    if (groups.some((group) => !/^[0-9a-f]{1,4}$/u.test(group))) return null;
    return groups.map((group) => parseInt(group, 16));
  };
  const head = parse(halves[0] as string);
  if (!head) return null;
  if (halves.length === 1) return head.length === 8 ? head : null;
  const rest = parse(halves[1] as string);
  if (!rest || head.length + rest.length > 7) return null;
  return [...head, ...new Array<number>(8 - head.length - rest.length).fill(0), ...rest];
}
