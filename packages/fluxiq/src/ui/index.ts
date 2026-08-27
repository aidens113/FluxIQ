export type SurfaceTone = "neutral" | "info" | "success" | "warning" | "danger";
const fluxiqStatusTones: Record<Exclude<SurfaceTone, "neutral">, ReadonlySet<string>> = {
  info: new Set(["busy", "draft", "llm", "custom", "pending", "proposed", "queued", "recording", "running", "scheduled", "syncing"]),
  success: new Set(["active", "approved", "completed", "enabled", "finished", "live", "low", "matched", "online", "passed", "ready", "success", "succeeded", "synced"]),
  warning: new Set(["degraded", "manual-approval", "medium", "needs-review", "paused", "retrying", "waiting"]),
  danger: new Set(["blocked", "critical", "error", "failed", "failure", "high", "offline", "rejected"])
};

export function normalizeFluxIQStatus(value: string): string {
  return value.trim().toLowerCase().replace(/[\s_]+/g, "-");
}

export function fluxiqStatusTone(value: string): SurfaceTone {
  const status = normalizeFluxIQStatus(value);
  if (fluxiqStatusTones.danger.has(status)) return "danger";
  if (fluxiqStatusTones.warning.has(status)) return "warning";
  if (fluxiqStatusTones.success.has(status)) return "success";
  if (fluxiqStatusTones.info.has(status)) return "info";
  return "neutral";
}

export function fluxiqStatusLabel(value: string): string {
  const status = normalizeFluxIQStatus(value);
  if (!status) return "Unknown";
  if (status === "llm") return "LLM";
  if (status === "2fa") return "2FA";
  const words = status.replace(/-/g, " ");
  return words.charAt(0).toUpperCase() + words.slice(1);
}

export type FluxIQIconName =
  | "blocks"
  | "book-open"
  | "calendar-clock"
  | "cloud-upload"
  | "database"
  | "git-branch"
  | "key-round"
  | "play-circle"
  | "shield-check";

export type NavigationItem = {
  id: string;
  title: string;
  href: string;
  icon?: FluxIQIconName;
  active?: boolean;
};

export type FluxIQThemeColorToken =
  | "background" | "surface" | "surfaceRaised" | "surfaceSubtle" | "surfaceMuted"
  | "text" | "textMuted" | "textSubtle" | "textInverse"
  | "border" | "borderStrong" | "primary" | "primaryHover" | "focus"
  | "selectedSurface" | "selectedBorder" | "info" | "infoSurface" | "infoBorder"
  | "success" | "successSurface" | "successBorder" | "warning" | "warningSurface" | "warningBorder"
  | "danger" | "dangerSurface" | "dangerBorder" | "codeSurface" | "codeText" | "overlay";

export type FluxIQTheme = {
  name: string;
  colors: Record<FluxIQThemeColorToken, string>;
  radii: { small: string; control: string; medium: string; panel: string; pill: string };
  spacing: { xxs: string; xs: string; compact: string; sm: string; dense: string; md: string; lg: string; xl: string; xxl: string };
  controls: { compact: string; default: string; comfortable: string; icon: string };
  borders: { width: string; strongWidth: string };
  elevation: { panel: string; popover: string; modal: string };
  focus: { width: string; offset: string };
  motion: { fast: string; normal: string; activity: string; easing: string };
  layers: { base: number; raised: number; sticky: number; dropdown: number; overlay: number; modal: number; toast: number; critical: number };
  typography: {
    fontFamily: string;
    monoFamily: string;
    sizes: Record<"caption" | "compact" | "bodySmall" | "body" | "bodyLarge" | "titleSmall" | "title" | "titleLarge" | "pageTitle" | "display", string>;
    lineHeights: Record<"compact" | "body" | "heading", string>;
    weights: Record<"regular" | "medium" | "semibold" | "bold", number>;
  };
};

export const fluxiqConsoleTheme: FluxIQTheme = {
  name: "fluxiq-console",
  colors: {
    background: "#f2f3f3", surface: "#ffffff", surfaceRaised: "#ffffff", surfaceSubtle: "#f7f8fa", surfaceMuted: "#eef1f4",
    text: "#16191f", textMuted: "#5f6b7a", textSubtle: "#697586", textInverse: "#ffffff",
    border: "#d5dbdb", borderStrong: "#8c99a5", primary: "#0972d3", primaryHover: "#033160", focus: "#a94700",
    selectedSurface: "#eaf4ff", selectedBorder: "#6fa8dc", info: "#075fae", infoSurface: "#eaf4ff", infoBorder: "#7db4e4",
    success: "#166534", successSurface: "#ecfdf3", successBorder: "#86c99a",
    warning: "#8a4300", warningSurface: "#fff7e6", warningBorder: "#d6a861",
    danger: "#b42318", dangerSurface: "#fff1f0", dangerBorder: "#e2a39d",
    codeSurface: "#111820", codeText: "#eef4f8", overlay: "rgb(15 23 42 / 42%)"
  },
  radii: { small: "2px", control: "4px", medium: "6px", panel: "8px", pill: "999px" },
  spacing: { xxs: "2px", xs: "4px", compact: "6px", sm: "8px", dense: "10px", md: "12px", lg: "16px", xl: "24px", xxl: "32px" },
  controls: { compact: "28px", default: "32px", comfortable: "38px", icon: "32px" },
  borders: { width: "1px", strongWidth: "2px" },
  elevation: { panel: "0 1px 1px rgb(0 28 36 / 12%)", popover: "0 14px 34px rgb(0 28 36 / 16%)", modal: "0 24px 70px rgb(0 0 0 / 28%)" },
  focus: { width: "2px", offset: "2px" },
  motion: { fast: "120ms", normal: "220ms", activity: "720ms", easing: "ease" },
  layers: { base: 0, raised: 10, sticky: 20, dropdown: 40, overlay: 100, modal: 110, toast: 120, critical: 130 },
  typography: {
    fontFamily: "Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, Segoe UI, sans-serif",
    monoFamily: "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace",
    sizes: { caption: "11px", compact: "12px", bodySmall: "13px", body: "14px", bodyLarge: "15px", titleSmall: "16px", title: "18px", titleLarge: "20px", pageTitle: "24px", display: "28px" },
    lineHeights: { compact: "1.3", body: "1.45", heading: "1.2" },
    weights: { regular: 400, medium: 500, semibold: 600, bold: 700 }
  }
};