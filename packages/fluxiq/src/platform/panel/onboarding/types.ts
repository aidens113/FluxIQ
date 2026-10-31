export type PanelOnboardingAction = { label: string; href: string; external: boolean };

export type PanelOnboardingCard = {
  id: "get-extension" | "add-model-key";
  title: string;
  body: string;
  actions: PanelOnboardingAction[];
};
