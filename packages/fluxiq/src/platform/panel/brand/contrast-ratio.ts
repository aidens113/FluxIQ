function channel(value: number): number {
  const scaled = value / 255;
  return scaled <= 0.03928 ? scaled / 12.92 : ((scaled + 0.055) / 1.055) ** 2.4;
}

function luminance(hex: string): number {
  const match = /^#([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/iu.exec(hex);
  if (!match) throw new TypeError(`Not a #rrggbb colour: ${JSON.stringify(hex)}`);
  const [r, g, b] = [match[1], match[2], match[3]].map((part) => channel(Number.parseInt(part!, 16)));
  return 0.2126 * r! + 0.7152 * g! + 0.0722 * b!;
}

/** The WCAG 2.x contrast ratio of two `#rrggbb` colours, 1 to 21. */
export function contrastRatio(hexA: string, hexB: string): number {
  const a = luminance(hexA);
  const b = luminance(hexB);
  return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
}
