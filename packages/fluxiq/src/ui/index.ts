export type SurfaceTone = "neutral" | "success" | "warning" | "danger";

export type NavigationItem = {
  id: string;
  title: string;
  href: string;
  icon?: string;
  active?: boolean;
};
