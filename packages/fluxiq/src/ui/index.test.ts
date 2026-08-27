import { describe, expect, it } from "vitest";
import { fluxiqConsoleTheme, fluxiqStatusLabel, fluxiqStatusTone, normalizeFluxIQStatus } from "./index";

describe("FluxIQ console theme contrast", () => {
  const colors = fluxiqConsoleTheme.colors;
  const textPairs = [
    ["text", colors.text, colors.surface],
    ["muted text", colors.textMuted, colors.surface],
    ["subtle text", colors.textSubtle, colors.surface],
    ["primary action", colors.primary, colors.surface],
    ["information", colors.info, colors.infoSurface],
    ["success", colors.success, colors.successSurface],
    ["warning", colors.warning, colors.warningSurface],
    ["danger", colors.danger, colors.dangerSurface],
    ["code", colors.codeText, colors.codeSurface]
  ] as const;

  it.each(textPairs)("keeps %s at WCAG AA normal-text contrast", (_name, foreground, background) => {
    expect(contrastRatio(foreground, background)).toBeGreaterThanOrEqual(4.5);
  });

  it("keeps the operational type scale ordered and readable", () => {
    const sizes = Object.values(fluxiqConsoleTheme.typography.sizes).map((size) => Number.parseInt(size, 10));
    expect(Math.min(...sizes)).toBeGreaterThanOrEqual(11);
    expect(Math.max(...sizes)).toBeLessThanOrEqual(28);
    expect(sizes).toEqual([...sizes].sort((first, second) => first - second));
  });
  it("exports bounded geometry and focus roles", () => {
    expect(fluxiqConsoleTheme.controls).toEqual({ compact: "28px", default: "32px", comfortable: "38px", icon: "32px" });
    expect(fluxiqConsoleTheme.radii.panel).toBe("8px");
    expect(fluxiqConsoleTheme.focus).toEqual({ width: "2px", offset: "2px" });
    expect(fluxiqConsoleTheme.elevation.modal).toContain("0 24px 70px");
  });
  it("normalizes status vocabulary into stable semantic tones and labels", () => {
    expect(normalizeFluxIQStatus("Manual_Approval")).toBe("manual-approval");
    expect(fluxiqStatusTone("queued")).toBe("info");
    expect(fluxiqStatusTone("ready")).toBe("success");
    expect(fluxiqStatusTone("degraded")).toBe("warning");
    expect(fluxiqStatusTone("failed")).toBe("danger");
    expect(fluxiqStatusTone("domain-specific")).toBe("neutral");
    expect(fluxiqStatusLabel("manual_approval")).toBe("Manual approval");
    expect(fluxiqStatusLabel("llm")).toBe("LLM");
  });
  it("keeps motion brief and layer roles bounded", () => {
    expect(fluxiqConsoleTheme.motion).toEqual({ fast: "120ms", normal: "220ms", activity: "720ms", easing: "ease" });
    expect(Math.max(...Object.values(fluxiqConsoleTheme.layers))).toBe(130);
    expect(Object.values(fluxiqConsoleTheme.layers)).toEqual([...Object.values(fluxiqConsoleTheme.layers)].sort((first, second) => first - second));
  });
  it("keeps the focus indicator distinct from a light surface", () => {
    expect(contrastRatio(colors.focus, colors.surface)).toBeGreaterThanOrEqual(3);
  });
});

function contrastRatio(first: string, second: string): number {
  const firstLuminance = luminance(first);
  const secondLuminance = luminance(second);
  return (Math.max(firstLuminance, secondLuminance) + 0.05) / (Math.min(firstLuminance, secondLuminance) + 0.05);
}

function luminance(hex: string): number {
  const value = Number.parseInt(hex.slice(1), 16);
  const channels = [value >> 16, (value >> 8) & 255, value & 255].map((channel) => {
    const normalized = channel / 255;
    return normalized <= 0.04045 ? normalized / 12.92 : ((normalized + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * channels[0]! + 0.7152 * channels[1]! + 0.0722 * channels[2]!;
}