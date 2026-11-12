import { contrastRatio } from "fluxiq/platform/panel";

const STOCK_INK = "#0c0d0f";
const LIGHT_INK = "#ffffff";

/**
 * Maps a product's brand accent (the package's `--color-*` names) onto the
 * panel's one token system: `--accent`, `--accent-hover`, `--accent-text`,
 * `--accent-ink` (whichever of the stock ink and white reads better on the
 * accent) and `--focus`. No new tokens; `{}` without a brand.
 */
export function accentTokens(style: Readonly<Record<string, string>>): Record<string, string> {
  const primary = style["--color-primary"];
  if (!primary) return {};
  const ink = contrastRatio(primary, STOCK_INK) >= contrastRatio(primary, LIGHT_INK) ? STOCK_INK : LIGHT_INK;
  return {
    "--accent": primary,
    "--accent-hover": style["--color-primary-hover"] ?? primary,
    "--accent-text": primary,
    "--accent-ink": ink,
    "--focus": style["--color-focus"] ?? primary
  };
}
