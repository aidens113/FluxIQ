export type SurfaceTone = "neutral" | "info" | "success" | "warning" | "danger";

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
  | "background"
  | "surface"
  | "surfaceRaised"
  | "surfaceSubtle"
  | "text"
  | "textMuted"
  | "textSubtle"
  | "border"
  | "borderStrong"
  | "primary"
  | "primaryHover"
  | "accent"
  | "success"
  | "warning"
  | "danger";

export type FluxIQTheme = {
  name: string;
  colors: Record<FluxIQThemeColorToken, string>;
  radii: {
    control: string;
    panel: string;
  };
  spacing: {
    xs: string;
    sm: string;
    md: string;
    lg: string;
    xl: string;
  };
  typography: {
    fontFamily: string;
    monoFamily: string;
  };
};

export const fluxiqConsoleTheme: FluxIQTheme = {
  name: "fluxiq-console",
  colors: {
    background: "#f2f3f3",
    surface: "#ffffff",
    surfaceRaised: "#ffffff",
    surfaceSubtle: "#f7f8fa",
    text: "#16191f",
    textMuted: "#5f6b7a",
    textSubtle: "#87919f",
    border: "#d5dbdb",
    borderStrong: "#aab7b8",
    primary: "#0972d3",
    primaryHover: "#033160",
    accent: "#ff9900",
    success: "#037f0c",
    warning: "#b35c00",
    danger: "#d13212"
  },
  radii: {
    control: "4px",
    panel: "8px"
  },
  spacing: {
    xs: "4px",
    sm: "8px",
    md: "12px",
    lg: "16px",
    xl: "24px"
  },
  typography: {
    fontFamily:
      "Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, Segoe UI, sans-serif",
    monoFamily: "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace"
  }
};
